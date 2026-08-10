-- Perfis dos usuários do site (vinculado ao Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Conta PSN vinculada a cada usuário
create table psn_accounts (
  user_id uuid primary key references profiles(id) on delete cascade,
  account_id text not null,
  online_id text,
  refresh_token text not null, -- criptografado
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

-- Conta Steam vinculada a cada usuário (sem token: só o SteamID verificado via OpenID)
create table steam_accounts (
  user_id uuid primary key references profiles(id) on delete cascade,
  steam_id text not null unique,
  persona_name text,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

-- Cache global de jogos (compartilhado entre usuários; uma linha por plataforma)
create table games (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('psn','steam')),
  external_id text not null, -- np_communication_id (PSN) ou appid (Steam)
  name text not null,
  icon_url text,
  has_platinum boolean default false,
  unique (platform, external_id)
);

-- Cache global de troféus/conquistas de cada jogo
create table trophies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  external_trophy_id text not null, -- trophy_id (PSN) ou apiname (Steam)
  name text not null,
  description text,
  icon_url text,
  type text check (type in ('bronze','silver','gold','platinum','achievement')),
  hidden boolean default false,
  unique (game_id, external_trophy_id)
);

-- Progresso do usuário em cada jogo
create table user_games (
  user_id uuid references profiles(id) on delete cascade,
  game_id uuid references games(id) on delete cascade,
  progress_pct int default 0,
  platinated boolean default false,
  last_synced_at timestamptz,
  primary key (user_id, game_id)
);

-- Troféus/conquistas conquistados por usuário
create table user_trophies (
  user_id uuid references profiles(id) on delete cascade,
  trophy_id uuid references trophies(id) on delete cascade,
  earned boolean default false,
  earned_at timestamptz,
  primary key (user_id, trophy_id)
);

-- Índices usados pelas telas de dashboard e detalhe do jogo
create index idx_user_games_user on user_games(user_id);
create index idx_user_trophies_user on user_trophies(user_id);
create index idx_trophies_game on trophies(game_id);

-- Row Level Security
alter table profiles enable row level security;
alter table psn_accounts enable row level security;
alter table steam_accounts enable row level security;
alter table games enable row level security;
alter table trophies enable row level security;
alter table user_games enable row level security;
alter table user_trophies enable row level security;

-- profiles: cada usuário vê e edita só o próprio perfil
create policy "profiles: select own" on profiles for select using (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = id);

-- psn_accounts / steam_accounts: nunca expor tokens de outro usuário
create policy "psn_accounts: select own" on psn_accounts for select using (auth.uid() = user_id);
create policy "psn_accounts: modify own" on psn_accounts for all using (auth.uid() = user_id);

create policy "steam_accounts: select own" on steam_accounts for select using (auth.uid() = user_id);
create policy "steam_accounts: modify own" on steam_accounts for all using (auth.uid() = user_id);

-- games / trophies: cache compartilhado, leitura pública para autenticados;
-- escrita só pelas edge functions (service role, que ignora RLS)
create policy "games: read all" on games for select using (auth.role() = 'authenticated');
create policy "trophies: read all" on trophies for select using (auth.role() = 'authenticated');

-- user_games / user_trophies: cada usuário só vê e edita o próprio progresso
create policy "user_games: select own" on user_games for select using (auth.uid() = user_id);
create policy "user_games: modify own" on user_games for all using (auth.uid() = user_id);

create policy "user_trophies: select own" on user_trophies for select using (auth.uid() = user_id);
create policy "user_trophies: modify own" on user_trophies for all using (auth.uid() = user_id);

-- Cria o profile automaticamente quando um usuário se cadastra
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
