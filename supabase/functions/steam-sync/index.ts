// Busca os jogos e conquistas da Steam do usuário via API oficial da Valve e grava no banco.
// Só sincroniza jogos com tempo de jogo > 0, pra manter o tempo de execução da function razoável
// (uma biblioteca Steam grande pode ter centenas de jogos — dá pra paginar isso depois).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const STEAM_API = 'https://api.steampowered.com'
const COVER_BUCKET = 'game-covers'

interface OwnedGame {
  appid: number
  name: string
  img_icon_url: string
  playtime_forever: number
}

interface SteamAchievementSchema {
  name: string
  displayName: string
  description?: string
  icon: string
  hidden: number
}

// l=brazilian pede a localização pt-BR da Steam; jogos sem essa tradução
// simplesmente devolvem o mesmo texto do inglês.
async function fetchAchievementSchema(
  appid: string,
  steamApiKey: string,
  lang?: string,
): Promise<SteamAchievementSchema[]> {
  const url = `${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${steamApiKey}&appid=${appid}${lang ? `&l=${lang}` : ''}`
  const res = await fetch(url)
  const data = await res.json()
  return data?.game?.availableGameStats?.achievements ?? []
}

// A Steam não garante a mesma URL de capa pra todo jogo: títulos lançados
// depois que a Valve migrou pro novo esquema de assets usam um hash no
// caminho (shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/{hash}/header.jpg)
// que não dá pra adivinhar. Testamos os padrões fixos primeiro (mais rápido,
// sem chamada extra) e só recorremos à API oficial appdetails — que sempre
// devolve a URL certa, seja qual for o esquema — quando eles falham.
function coverCandidates(appid: string): string[] {
  return [
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
  ]
}

async function resolveHeaderImageUrl(appid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`,
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.[appid]?.data?.header_image ?? null
  } catch {
    return null
  }
}

async function downloadAndStoreCover(
  admin: SupabaseClient,
  appid: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url)
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok || !contentType.startsWith('image/')) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    // A Steam serve um placeholder cinza minúsculo (~1-2KB) pra jogos sem
    // arte de loja definitiva ainda (ex: pré-lançamento). Um header.jpg de
    // verdade nunca é tão pequeno, então tratamos isso como "não achou".
    if (bytes.length < 8000) return null

    const path = `steam/${appid}.jpg`
    const { error } = await admin.storage
      .from(COVER_BUCKET)
      .upload(path, bytes, { contentType, upsert: true })
    if (error) return null

    return admin.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

async function cacheCover(admin: SupabaseClient, appid: string): Promise<string | null> {
  for (const url of coverCandidates(appid)) {
    const stored = await downloadAndStoreCover(admin, appid, url)
    if (stored) return stored
  }

  const resolvedUrl = await resolveHeaderImageUrl(appid)
  if (resolvedUrl) {
    const stored = await downloadAndStoreCover(admin, appid, resolvedUrl)
    if (stored) return stored
  }

  return null
}

// Migra a capa de todos os jogos pendentes de uma vez, em paralelo (com um
// teto de conexões simultâneas pra não sobrecarregar o CDN da Steam), em vez
// de um por sincronização — assim uma única sincronização já deixa a
// biblioteca inteira com capa em boa qualidade.
async function migrateCovers(
  admin: SupabaseClient,
  pending: { id: string; appid: string }[],
  concurrency = 6,
) {
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency)
    await Promise.all(
      batch.map(async ({ id, appid }) => {
        const cachedCover = await cacheCover(admin, appid)
        if (cachedCover) {
          await admin.from('games').update({ icon_url: cachedCover }).eq('id', id)
        }
      }),
    )
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )
    const {
      data: { user },
    } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const steamApiKey = Deno.env.get('STEAM_API_KEY')!

    // Idempotente: se o bucket já existe, a Storage API retorna erro e
    // ignoramos.
    await admin.storage.createBucket(COVER_BUCKET, { public: true })

    const { data: steamAccount } = await admin
      .from('steam_accounts')
      .select('steam_id')
      .eq('user_id', user.id)
      .single()

    if (!steamAccount) {
      return new Response(JSON.stringify({ error: 'Conta Steam não conectada' }), {
        status: 400,
        headers: corsHeaders,
      })
    }
    const steamId = steamAccount.steam_id

    const ownedRes = await fetch(
      `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId}&include_appinfo=true`,
    )
    const owned = await ownedRes.json()
    const ownedGames: OwnedGame[] = owned?.response?.games ?? []
    const played = ownedGames.filter((g) => g.playtime_forever > 0)

    // Diagnóstico: loga o tamanho de cada etapa pra achar onde a lista zera
    // (perfil ainda privado pra API mesmo com "detalhes do jogo" público,
    // API key inválida, biblioteca sem jogos jogados, jogos sem conquistas etc.)
    console.log(
      `[steam-sync] steamId=${steamId} httpStatus=${ownedRes.status} gameCount=${owned?.response?.game_count ?? 'n/a'} ownedGames=${ownedGames.length} withPlaytime=${played.length}`,
    )
    if (ownedGames.length === 0) {
      console.log(`[steam-sync] resposta bruta da GetOwnedGames: ${JSON.stringify(owned)}`)
    }

    let syncedCount = 0
    let noAchievementsCount = 0
    const pendingCovers: { id: string; appid: string }[] = []

    for (const ownedGame of played) {
      const appid = String(ownedGame.appid)

      let { data: game } = await admin
        .from('games')
        .select('id, icon_url')
        .eq('platform', 'steam')
        .eq('external_id', appid)
        .maybeSingle()

      if (!game) {
        const [achievements, achievementsPt] = await Promise.all([
          fetchAchievementSchema(appid, steamApiKey),
          fetchAchievementSchema(appid, steamApiKey, 'brazilian'),
        ])

        if (achievements.length === 0) {
          // jogo sem conquistas, não tem o que rastrear
          noAchievementsCount++
          continue
        }

        const ptByName = new Map(achievementsPt.map((a) => [a.name, a]))
        const cachedCover = await cacheCover(admin, appid)
        const fallbackIconUrl = ownedGame.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${ownedGame.img_icon_url}.jpg`
          : null

        const { data: inserted } = await admin
          .from('games')
          .insert({
            platform: 'steam',
            external_id: appid,
            name: ownedGame.name,
            icon_url: cachedCover ?? fallbackIconUrl,
            has_platinum: true,
          })
          .select('id, icon_url')
          .single()
        game = inserted

        await admin.from('trophies').insert(
          achievements.map((a) => {
            const pt = ptByName.get(a.name)
            return {
              game_id: game!.id,
              external_trophy_id: a.name,
              name: a.displayName,
              description: a.description ?? null,
              name_pt: pt?.displayName ?? a.displayName,
              description_pt: pt?.description ?? a.description ?? null,
              icon_url: a.icon ?? null,
              type: 'achievement',
              hidden: a.hidden === 1,
            }
          }),
        )
      } else {
        if (!game.icon_url?.includes(`/${COVER_BUCKET}/`)) {
          // Jogo já cacheado antes dessa mudança: migra a capa em lote, depois
          // do loop principal (ver migrateCovers).
          pendingCovers.push({ id: game.id, appid })
        }

        // Jogo sincronizado antes da tradução pt existir: busca e preenche uma vez.
        const { data: untranslated } = await admin
          .from('trophies')
          .select('id, external_trophy_id, name, description')
          .eq('game_id', game.id)
          .is('name_pt', null)

        if (untranslated && untranslated.length > 0) {
          const achievementsPt = await fetchAchievementSchema(appid, steamApiKey, 'brazilian')
          const ptByName = new Map(achievementsPt.map((a) => [a.name, a]))

          // Upsert em lote (1 chamada) em vez de 1 update por troféu — evita
          // estourar o tempo limite da function quando há muitos jogos a preencher.
          // external_trophy_id/name precisam ir junto: são colunas not-null da
          // tabela e o upsert falha inteiro se faltar alguma no payload.
          const { error: backfillError } = await admin.from('trophies').upsert(
            untranslated.map((row) => {
              const pt = ptByName.get(row.external_trophy_id)
              return {
                id: row.id,
                external_trophy_id: row.external_trophy_id,
                name: row.name,
                name_pt: pt?.displayName ?? row.name,
                description_pt: pt?.description ?? row.description ?? null,
              }
            }),
          )
          if (backfillError) console.error('backfill pt falhou:', backfillError)
        }
      }

      const { data: gameTrophies } = await admin
        .from('trophies')
        .select('id, external_trophy_id')
        .eq('game_id', game!.id)

      if (!gameTrophies || gameTrophies.length === 0) continue

      const achievedRes = await fetch(
        `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamApiKey}&steamid=${steamId}&appid=${appid}`,
      )
      const achievedData = await achievedRes.json()
      const playerAchievements: { apiname: string; achieved: number; unlocktime: number }[] =
        achievedData?.playerstats?.achievements ?? []
      const achievedMap = new Map(playerAchievements.map((a) => [a.apiname, a]))
      const earnedCount = playerAchievements.filter((a) => a.achieved === 1).length
      const progressPct = Math.round((earnedCount / gameTrophies.length) * 100)

      await admin.from('user_games').upsert({
        user_id: user.id,
        game_id: game!.id,
        progress_pct: progressPct,
        platinated: gameTrophies.length > 0 && earnedCount === gameTrophies.length,
        last_synced_at: new Date().toISOString(),
      })

      const userTrophyRows = gameTrophies.map((t) => {
        const match = achievedMap.get(t.external_trophy_id)
        return {
          user_id: user.id,
          trophy_id: t.id,
          earned: match?.achieved === 1,
          earned_at: match?.unlocktime ? new Date(match.unlocktime * 1000).toISOString() : null,
        }
      })
      await admin.from('user_trophies').upsert(userTrophyRows)
      syncedCount++
    }

    await admin
      .from('steam_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)

    if (pendingCovers.length > 0) {
      await migrateCovers(admin, pendingCovers)
    }

    console.log(
      `[steam-sync] resultado: synced=${syncedCount} semConquistas=${noAchievementsCount} ownedGames=${ownedGames.length} withPlaytime=${played.length} capasMigradas=${pendingCovers.length}`,
    )

    return new Response(
      JSON.stringify({
        ok: true,
        synced: syncedCount,
        diagnostics: {
          ownedGames: ownedGames.length,
          withPlaytime: played.length,
          withoutAchievements: noAchievementsCount,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Falha ao sincronizar com a Steam.' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
