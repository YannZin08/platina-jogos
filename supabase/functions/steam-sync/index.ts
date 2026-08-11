// Busca os jogos e conquistas da Steam do usuário via API oficial da Valve e grava no banco.
// Só sincroniza jogos com tempo de jogo > 0, pra manter o tempo de execução da function razoável
// (uma biblioteca Steam grande pode ter centenas de jogos — dá pra paginar isso depois).
import { createClient } from 'npm:@supabase/supabase-js@2'

const STEAM_API = 'https://api.steampowered.com'

interface OwnedGame {
  appid: number
  name: string
  img_icon_url: string
  playtime_forever: number
}

Deno.serve(async (req) => {
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
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const steamApiKey = Deno.env.get('STEAM_API_KEY')!

    const { data: steamAccount } = await admin
      .from('steam_accounts')
      .select('steam_id')
      .eq('user_id', user.id)
      .single()

    if (!steamAccount) {
      return new Response(JSON.stringify({ error: 'Conta Steam não conectada' }), { status: 400 })
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

    for (const ownedGame of played) {
      const appid = String(ownedGame.appid)

      let { data: game } = await admin
        .from('games')
        .select('id')
        .eq('platform', 'steam')
        .eq('external_id', appid)
        .maybeSingle()

      // Sempre busca o schema em português (Steam localiza nome/descrição das
      // conquistas por idioma; sem o "l=brazilian" vem em inglês por padrão).
      // Roda pra jogos já cacheados também, pra corrigir/atualizar a tradução
      // sem precisar de uma migração separada.
      const schemaRes = await fetch(
        `${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${steamApiKey}&appid=${appid}&l=brazilian`,
      )
      const schema = await schemaRes.json()
      const achievements: { name: string; displayName: string; description?: string; icon: string; hidden: number }[] =
        schema?.game?.availableGameStats?.achievements ?? []

      if (achievements.length === 0) {
        // jogo sem conquistas, não tem o que rastrear
        noAchievementsCount++
        continue
      }

      if (!game) {
        const { data: inserted } = await admin
          .from('games')
          .insert({
            platform: 'steam',
            external_id: appid,
            name: ownedGame.name,
            icon_url: ownedGame.img_icon_url
              ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${ownedGame.img_icon_url}.jpg`
              : null,
            has_platinum: true,
          })
          .select('id')
          .single()
        game = inserted
      }

      await admin.from('trophies').upsert(
        achievements.map((a) => ({
          game_id: game!.id,
          external_trophy_id: a.name,
          name: a.displayName,
          description: a.description ?? null,
          icon_url: a.icon ?? null,
          type: 'achievement',
          hidden: a.hidden === 1,
        })),
        { onConflict: 'game_id,external_trophy_id' },
      )

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

    console.log(
      `[steam-sync] resultado: synced=${syncedCount} semConquistas=${noAchievementsCount} ownedGames=${ownedGames.length} withPlaytime=${played.length}`,
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
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Falha ao sincronizar com a Steam.' }), { status: 500 })
  }
})
