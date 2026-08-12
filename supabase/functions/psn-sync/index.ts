// Busca os jogos e troféus da PSN do usuário e grava no banco:
// - games/trophies: cache compartilhado (só popula na primeira vez que alguém sincroniza aquele jogo)
// - user_games/user_trophies: progresso individual do usuário
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  exchangeRefreshTokenForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
  getUserPlayedGames,
} from 'npm:psn-api'
import { corsHeaders } from '../_shared/cors.ts'

// A API de troféus (getUserTitles) identifica jogos por npCommunicationId,
// mas tempo jogado só existe na API de "played games", que usa titleId (um
// id diferente). A Sony não expõe um jeito direto de cruzar os dois, então
// correlacionamos pelo nome do jogo (normalizado) — é o que outros trackers
// de troféus fazem também, não é perfeito mas cobre a grande maioria.
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .trim()
}

// Converte "PT228H56M33S" (ISO 8601 duration) em minutos.
function parseIsoDurationToMinutes(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return 0
  const [, hours, minutes] = match
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0)
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

    const { data: psnAccount } = await admin
      .from('psn_accounts')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single()

    if (!psnAccount) {
      return new Response(JSON.stringify({ error: 'Conta PSN não conectada' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const authorization = await exchangeRefreshTokenForAuthTokens(psnAccount.refresh_token)

    // A PSN às vezes rotaciona o refresh token; se vier um novo, atualiza o salvo
    if (authorization.refreshToken !== psnAccount.refresh_token) {
      await admin
        .from('psn_accounts')
        .update({ refresh_token: authorization.refreshToken })
        .eq('user_id', user.id)
    }

    // getUserTitles pagina no máximo 800 títulos por chamada; sem esse loop,
    // usuários com biblioteca grande ficavam com jogos de fora da primeira
    // página sem sincronizar.
    const trophyTitles: Awaited<ReturnType<typeof getUserTitles>>['trophyTitles'] = []
    let offset: number | undefined = 0
    while (offset !== undefined) {
      const page = await getUserTitles(authorization, 'me', { limit: 800, offset })
      trophyTitles.push(...page.trophyTitles)
      offset = page.nextOffset
    }

    // Busca tempo jogado à parte (endpoint diferente do de troféus) e monta
    // um mapa por nome normalizado pra cruzar com cada trophy title abaixo.
    // Falha aqui não deve travar a sincronização — tempo jogado é um extra.
    const playtimeByName = new Map<string, number>()
    try {
      const { titles: playedTitles } = await getUserPlayedGames(authorization, 'me', { limit: 200 })
      for (const played of playedTitles) {
        playtimeByName.set(
          normalizeGameName(played.name),
          parseIsoDurationToMinutes(played.playDuration),
        )
      }
    } catch (err) {
      console.error('[psn-sync] falha ao buscar tempo jogado:', err)
    }

    for (const title of trophyTitles) {
      const npCommunicationId = title.npCommunicationId

      let { data: game } = await admin
        .from('games')
        .select('id')
        .eq('platform', 'psn')
        .eq('external_id', npCommunicationId)
        .maybeSingle()

      // Jogo novo: cria a linha em `games` (definições de troféus vêm a seguir)
      if (!game) {
        const { data: inserted } = await admin
          .from('games')
          .insert({
            platform: 'psn',
            external_id: npCommunicationId,
            name: title.trophyTitleName,
            icon_url: title.trophyTitleIconUrl ?? null,
            has_platinum: (title.definedTrophies?.platinum ?? 0) > 0,
          })
          .select('id')
          .single()
        game = inserted
      }

      // Backfill: garante que a lista de troféus está completa mesmo se a
      // primeira sincronização desse jogo (por qualquer usuário) tiver
      // falhado no meio do caminho e deixado `trophies` incompleta/vazia —
      // sem isso, o jogo ficava com troféus faltando pra sempre, já que
      // antes essa busca só rodava uma vez, na criação do jogo.
      const { count: trophyCount } = await admin
        .from('trophies')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', game!.id)

      if (!trophyCount) {
        const [{ trophies }, { trophies: trophiesPt }] = await Promise.all([
          getTitleTrophies(authorization, npCommunicationId, 'all'),
          getTitleTrophies(authorization, npCommunicationId, 'all', {
            headerOverrides: { 'Accept-Language': 'pt-BR' },
          }),
        ])
        const ptById = new Map(trophiesPt.map((t: { trophyId: number }) => [t.trophyId, t]))

        if (trophies.length > 0) {
          await admin.from('trophies').upsert(
            trophies.map((t: { trophyId: number; trophyName?: string; trophyDetail?: string; trophyIconUrl?: string; trophyType: string; trophyHidden: boolean }) => {
              const pt = ptById.get(t.trophyId) as
                | { trophyName?: string; trophyDetail?: string }
                | undefined
              return {
                game_id: game!.id,
                external_trophy_id: String(t.trophyId),
                name: t.trophyName ?? '???',
                description: t.trophyDetail ?? null,
                name_pt: pt?.trophyName ?? t.trophyName ?? '???',
                description_pt: pt?.trophyDetail ?? t.trophyDetail ?? null,
                icon_url: t.trophyIconUrl ?? null,
                type: t.trophyType,
                hidden: t.trophyHidden,
              }
            }),
            { onConflict: 'game_id,external_trophy_id' },
          )
        }
      } else {
        // Jogo sincronizado antes da tradução pt existir: busca e preenche uma vez.
        const { data: untranslated } = await admin
          .from('trophies')
          .select('id, external_trophy_id, name, description')
          .eq('game_id', game!.id)
          .is('name_pt', null)

        if (untranslated && untranslated.length > 0) {
          const { trophies: trophiesPt } = await getTitleTrophies(authorization, npCommunicationId, 'all', {
            headerOverrides: { 'Accept-Language': 'pt-BR' },
          })
          const ptById = new Map(
            trophiesPt.map((t: { trophyId: number; trophyName?: string; trophyDetail?: string }) => [
              String(t.trophyId),
              t,
            ]),
          )

          // Upsert em lote (1 chamada) em vez de 1 update por troféu — evita
          // estourar o tempo limite da function quando há muitos jogos a preencher.
          const { error: backfillError } = await admin.from('trophies').upsert(
            untranslated.map((row) => {
              const pt = ptById.get(row.external_trophy_id)
              return {
                id: row.id,
                external_trophy_id: row.external_trophy_id,
                name: row.name,
                name_pt: pt?.trophyName ?? row.name,
                description_pt: pt?.trophyDetail ?? row.description ?? null,
              }
            }),
          )
          if (backfillError) console.error('[psn-sync] backfill pt falhou:', backfillError)
        }
      }

      // Progresso do usuário nesse jogo
      const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
        authorization,
        'me',
        npCommunicationId,
        'all',
      )

      const { data: gameTrophies } = await admin
        .from('trophies')
        .select('id, external_trophy_id')
        .eq('game_id', game!.id)

      const trophyIdMap = new Map((gameTrophies ?? []).map((t) => [t.external_trophy_id, t.id]))
      const platinated = earnedTrophies.some(
        (t: { trophyType: string; earned: boolean }) => t.trophyType === 'platinum' && t.earned,
      )

      const matchedPlaytime = playtimeByName.get(normalizeGameName(title.trophyTitleName))

      await admin.from('user_games').upsert({
        user_id: user.id,
        game_id: game!.id,
        progress_pct: title.progress ?? 0,
        platinated,
        // Só sobrescreve se achou correspondência agora; não some o valor
        // salvo antes só porque o nome não bateu nessa sincronização.
        ...(matchedPlaytime !== undefined ? { playtime_minutes: matchedPlaytime } : {}),
        last_synced_at: new Date().toISOString(),
      })

      const userTrophyRows = earnedTrophies
        .map((t: { trophyId: number; earned: boolean; earnedDateTime?: string }) => {
          const trophyId = trophyIdMap.get(String(t.trophyId))
          if (!trophyId) return null
          return {
            user_id: user.id,
            trophy_id: trophyId,
            earned: t.earned,
            earned_at: t.earnedDateTime ?? null,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      if (userTrophyRows.length > 0) {
        await admin.from('user_trophies').upsert(userTrophyRows)
      }
    }

    await admin
      .from('psn_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)

    return new Response(JSON.stringify({ ok: true, synced: trophyTitles.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Falha ao sincronizar com a PSN.' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
