# Platina

Rastreador de troféus/conquistas de jogos (PSN + Steam). Mostra seus jogos, o progresso de troféus de cada um, marca o que já foi platinado/100% e o que falta, tempo jogado, foto de perfil, favoritos, busca/ordenação e idioma (pt/en).

Site publicado: https://platina-jogos.yannzinfelipe.workers.dev
Projeto Supabase: `tdlcmqqgtaeyznnxxpne`

## Stack

React + Vite + TypeScript, Tailwind CSS v4, Supabase (banco, auth, edge functions e storage), Cloudflare Workers (hospedagem do front, deploy automático a cada push no GitHub).

## Rodar localmente

1. Instale as dependências:
   ```
   npm install
   ```

2. Copie `.env.example` para `.env` e preencha com a URL e a **Publishable key** do projeto Supabase (Project Settings → API Keys → "Publishable and secret API keys"). Sem isso o app trava logo na inicialização com "Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY".

3. Rode o projeto:
   ```
   npm run dev
   ```

Pra usar o mesmo backend já publicado (recomendado, evita ter que reconfigurar tudo do zero): use `https://tdlcmqqgtaeyznnxxpne.supabase.co` como `VITE_SUPABASE_URL`. Se for criar um projeto Supabase novo do zero, veja a seção "Backend novo do zero" abaixo.

## Deploy do front (Cloudflare Workers)

Já está conectado ao GitHub — todo push na branch `main` dispara um build e deploy automáticos (`npm run build && wrangler deploy`), configurado em Workers & Pages → platina-jogos → Settings → Build.

Isso só funciona se essas duas variáveis estiverem configuradas em **Settings → Build → Variables and secrets** (não confundir com "Variables and secrets" da aba Runtime — são separadas, e essa é a que importa aqui, pois são usadas em tempo de *build* pelo Vite):

- `VITE_SUPABASE_URL` = `https://tdlcmqqgtaeyznnxxpne.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = a Publishable key do Supabase

Se essas variáveis sumirem ou o site voltar a mostrar tela em branco com erro "Faltam as variáveis..." no console, é sempre isso — reconfigura ali e dispara um novo deploy (aba Deployments → Retry, ou um novo commit/push).

O arquivo `wrangler.jsonc` já está versionado no repo (gerado automaticamente pelo Cloudflare na primeira vez que o Git integration rodou) — não precisa mexer nele.

## Backend (Supabase)

### Migrations

```
supabase link --project-ref tdlcmqqgtaeyznnxxpne
supabase db push
```

Aplica todas as migrations em `supabase/migrations/` (schema base, tradução de troféus, favoritos, tempo jogado, bucket de avatares).

### Edge functions

As 4 functions ficam em `supabase/functions/` e já estão publicadas. Pra redeployar depois de alguma mudança:

```
supabase functions deploy steam-sync
supabase functions deploy steam-connect
supabase functions deploy psn-sync
supabase functions deploy psn-connect
```

**Importante:** o repo já tem um `supabase/config.toml` fixando `verify_jwt = false` pras 4 functions. Sem esse arquivo, um deploy pela CLI reseta a function pro padrão (`verify_jwt = true`), o que quebra o preflight CORS do navegador e faz toda chamada da Steam/PSN falhar silenciosamente. Não apague/edite esse arquivo sem saber o motivo dele existir.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm prontos automaticamente dentro das functions. Só precisa configurar esses três segredos (já configurados no projeto atual, só necessário se for recriar do zero):

```
supabase secrets set STEAM_API_KEY=sua-chave-da-steam
supabase secrets set STEAM_STATE_SECRET=uma-string-aleatoria-longa
supabase secrets set SITE_URL=https://platina-jogos.yannzinfelipe.workers.dev
```

- `STEAM_API_KEY`: pegue em [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
- `STEAM_STATE_SECRET`: qualquer string aleatória longa (ex: `openssl rand -hex 32`), usada só pra assinar o state do login da Steam
- `SITE_URL`: a URL onde o site está publicado — usada pro redirecionamento do login OpenID da Steam

No painel da Steam (steamcommunity.com/dev/apikey), o campo "Domínio" precisa apontar pra URL das edge functions (`https://tdlcmqqgtaeyznnxxpne.supabase.co`).

A `psn-connect`/`psn-sync` usam a lib comunitária [`psn-api`](https://github.com/achievements-app/psn-api) — como é uma API não documentada oficialmente pela Sony, vale conferir os tipos do pacote se algum campo mudar de nome.

### Storage (capas dos jogos e fotos de perfil)

- `game-covers`: criado automaticamente pela própria `steam-sync` na primeira execução (não precisa de passo manual). Guarda os banners da Steam já validados/cacheados.
- `avatars`: criado pela migration `20260811170000_add_avatars_bucket.sql`, com RLS (leitura pública, escrita só na própria pasta do usuário).

### Autenticação por e-mail (login, cadastro, redefinir senha)

Em **Authentication → URL Configuration** no painel do Supabase:

- **Site URL**: `https://platina-jogos.yannzinfelipe.workers.dev`
- **Redirect URLs**: `https://platina-jogos.yannzinfelipe.workers.dev/**`

Sem isso, o link de "redefinir senha" enviado por e-mail cai numa página que não leva a lugar nenhum (o Supabase rejeita o redirecionamento pro nosso site e usa o padrão, que sem essa configuração é `localhost`).

### Backend novo do zero

Só necessário se for recriar tudo num projeto Supabase novo (não é o caso pra continuar trabalhando no projeto atual):

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Rode `supabase link` + `supabase db push` (migrations)
3. Configure os 3 secrets acima
4. Deploy das 4 edge functions
5. Configure Site URL/Redirect URLs (seção acima)
6. Configure `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no `.env` local e nas Build variables do Cloudflare

## Status

- [x] Autenticação (login/cadastro/redefinir senha) e rotas protegidas
- [x] Dashboard com busca, ordenação, favoritos e filtro por plataforma
- [x] Detalhe do jogo com filtro de conquistas (todas/concluídas/pendentes)
- [x] PSN: conectar conta, sincronizar troféus, tempo jogado, tradução pt-BR
- [x] Steam: conectar conta, sincronizar conquistas, tempo jogado, tradução pt-BR
- [x] Capas dos jogos cacheadas no Storage (sempre em boa qualidade)
- [x] Foto de perfil, nome de usuário editável
- [x] Internacionalização (pt/en)
- [x] Publicado no Cloudflare Workers com deploy automático via GitHub
