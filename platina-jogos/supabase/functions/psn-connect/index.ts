// Troca o código NPSSO (colado pelo usuário) por um access/refresh token da PSN,
// usando a lib comunitária psn-api (mesma que PSNProfiles/Exophase usam por trás dos panos).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { exchangeNpssoForCode, exchangeCodeForAccessToken } from 'npm:psn-api'

Deno.serve(async (req) => {
  try {
    const { npsso } = await req.json()
    if (!npsso) {
      return new Response(JSON.stringify({ error: 'NPSSO ausente' }), { status: 400 })
    }

    // Identifica o usuário do site a partir do token de sessão do Supabase
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

    const code = await exchangeNpssoForCode(npsso)
    const authorization = await exchangeCodeForAccessToken(code)

    // Cliente com service role: grava o refresh token ignorando RLS (a policy
    // de psn_accounts só libera leitura/escrita para o dono da linha via auth.uid()).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 'me' é aceito pela psn-api como accountId nas chamadas de troféus da própria
    // conta autenticada, então não precisamos resolver o accountId numérico aqui.
    const { error } = await admin.from('psn_accounts').upsert({
      user_id: user.id,
      account_id: 'me',
      refresh_token: authorization.refreshToken,
    })
    if (error) throw error

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: 'Falha ao conectar com a PSN. Confira se o NPSSO ainda é válido.' }),
      { status: 500 },
    )
  }
})
