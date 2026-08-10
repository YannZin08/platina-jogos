# Platina

Rastreador de troféus/conquistas de jogos (PSN + Steam). Mostra seus jogos, o progresso de troféus de cada um, e marca o que já foi platinado/100% e o que falta.

## Stack

React + Vite + TypeScript, Tailwind CSS v4, Supabase (banco, auth e edge functions).

## Como rodar

1. Instale as dependências:
   ```
   npm install
   ```

2. Crie um projeto em [supabase.com](https://supabase.com) e rode a migration em `supabase/migrations/0001_init.sql` (SQL Editor do painel, ou `supabase db push` com a CLI).

3. Copie `.env.example` para `.env` e preencha com a URL e a anon key do seu projeto Supabase (Project Settings → API).

4. Rode o projeto:
   ```
   npm run dev
   ```

## Edge functions (PSN + Steam)

As 4 functions ficam em `supabase/functions/`. Pra publicar (precisa da [Supabase CLI](https://supabase.com/docs/guides/cli)):

```
supabase link --project-ref <seu-project-ref>
supabase functions deploy psn-connect
supabase functions deploy steam-connect
supabase functions deploy psn-sync
supabase functions deploy steam-sync
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm prontos automaticamente dentro das functions. Só precisa configurar esses três segredos:

```
supabase secrets set STEAM_API_KEY=sua-chave-da-steam
supabase secrets set STEAM_STATE_SECRET=uma-string-aleatoria-longa
supabase secrets set SITE_URL=https://seu-site.pages.dev
```

- `STEAM_API_KEY`: pegue em [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
- `STEAM_STATE_SECRET`: qualquer string aleatória longa (ex: `openssl rand -hex 32`), usada só pra assinar o state do login da Steam
- `SITE_URL`: a URL onde o site vai estar publicado (por enquanto pode ser `http://localhost:5173`; depois trocamos pro domínio do Cloudflare Pages)

No painel da Steam, o campo "Domínio" precisa apontar pra URL das suas edge functions (`https://<project-ref>.supabase.co`).

A `psn-connect`/`psn-sync` usam a lib comunitária [`psn-api`](https://github.com/achievements-app/psn-api) — como é uma API não documentada oficialmente pela Sony, vale conferir os tipos do pacote se algum campo mudar de nome.

## Status

- [x] Scaffold do projeto, tema e componentes de UI
- [x] Schema do banco (PSN + Steam) com RLS
- [x] Autenticação (login/cadastro) e rotas protegidas
- [x] Dashboard, detalhe do jogo e configurações
- [x] Edge function `psn-connect` — troca NPSSO por tokens
- [x] Edge function `steam-connect` — login OpenID
- [x] Edge function `psn-sync` — busca jogos e troféus na PSN
- [x] Edge function `steam-sync` — busca jogos e conquistas na Steam
- [ ] Publicar no Cloudflare Pages e conectar ao GitHub
