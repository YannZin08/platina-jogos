// Fluxo de login "Entrar com Steam" via OpenID 2.0. Essa function cobre as duas fases:
//  1) chamada autenticada do frontend -> devolve a URL de login da Steam
//  2) callback da Steam (GET com openid.mode=id_res) -> valida e salva o steam_id
import { createClient } from 'npm:@supabase/supabase-js@2'

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Assina o user_id num "state" simples pra confirmar, no callback, quem iniciou
// o login (a Steam não tem um parâmetro de state nativo como o OAuth2).
async function sign(userId: string): Promise<string> {
  const secret = Deno.env.get('STEAM_STATE_SECRET')!
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId))
  const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${userId}.${sigHex}`
}

async function verify(state: string): Promise<string | null> {
  const [userId, sigHex] = state.split('.')
  if (!userId || !sigHex) return null
  const expected = await sign(userId)
  return expected === state ? userId : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const functionUrl = `${url.origin}${url.pathname}`
  const siteUrl = Deno.env.get('SITE_URL')!

  // Fase 2: callback vindo da Steam
  if (url.searchParams.get('openid.mode')) {
    const state = url.searchParams.get('state') ?? ''
    const userId = await verify(state)

    if (!userId) {
      return Response.redirect(`${siteUrl}/settings?steam=erro`, 302)
    }

    // Confirma com a própria Steam que a resposta não foi forjada
    const checkParams = new URLSearchParams(url.search)
    checkParams.set('openid.mode', 'check_authentication')
    const verifyRes = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: checkParams.toString(),
    })
    const verifyText = await verifyRes.text()
    if (!verifyText.includes('is_valid:true')) {
      return Response.redirect(`${siteUrl}/settings?steam=erro`, 302)
    }

    const claimedId = url.searchParams.get('openid.claimed_id') ?? ''
    const steamId = claimedId.split('/').pop()
    if (!steamId) {
      return Response.redirect(`${siteUrl}/settings?steam=erro`, 302)
    }

    // Nome do perfil é só cosmético pra UI; se falhar, segue sem ele
    const steamApiKey = Deno.env.get('STEAM_API_KEY')!
    let personaName: string | null = null
    try {
      const summaryRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steamId}`,
      )
      const summary = await summaryRes.json()
      personaName = summary?.response?.players?.[0]?.personaname ?? null
    } catch {
      // não crítico
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await admin.from('steam_accounts').upsert({
      user_id: userId,
      steam_id: steamId,
      persona_name: personaName,
    })

    return Response.redirect(`${siteUrl}/settings?steam=conectado`, 302)
  }

  // Fase 1: pedido autenticado do frontend, gera a URL de login da Steam
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

  const state = await sign(user.id)
  const returnTo = `${functionUrl}?state=${encodeURIComponent(state)}`

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': siteUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })

  return new Response(
    JSON.stringify({ redirectUrl: `${STEAM_OPENID_URL}?${params.toString()}` }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
