-- ================================================================
-- QUINIELA MUNDIAL 2026 — Schema completo para Supabase
-- Instrucciones: Pega TODO este contenido en
--   Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================================


-- ----------------------------------------------------------------
-- 1. PROFILES
--    Perfil de cada usuario, creado automáticamente al registrarse
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Cualquiera puede ver perfiles"
  on public.profiles for select
  using (true);

create policy "Usuario actualiza su propio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Usuario inserta su propio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);


-- Función que crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger que dispara la función al crear usuario
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------
-- 2. FIXTURES
--    Partidos cargados desde API-Football (admin los sincroniza)
-- ----------------------------------------------------------------
create table if not exists public.fixtures (
  id                integer primary key,
  league_id         integer default 1,
  season            integer default 2026,
  round             text,
  phase             text check (phase in (
                      'groups', 'round_of_16', 'quarterfinals', 'semifinals', 'final'
                    )),
  status            text default 'not_started',
  kickoff           timestamptz,
  home_team_id      integer,
  home_team_name    text,
  home_team_code    text,
  home_team_flag    text,
  away_team_id      integer,
  away_team_name    text,
  away_team_code    text,
  away_team_flag    text,
  group_name        text,
  home_score        integer,
  away_score        integer,
  penalty_home      integer,
  penalty_away      integer,
  went_to_penalties boolean default false,
  penalties_winner  text,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

alter table public.fixtures enable row level security;

create policy "Cualquiera puede ver partidos"
  on public.fixtures for select
  using (true);

create policy "Solo service_role modifica partidos"
  on public.fixtures for all
  using (auth.role() = 'service_role');

create index if not exists idx_fixtures_phase   on public.fixtures(phase);
create index if not exists idx_fixtures_kickoff on public.fixtures(kickoff);


-- ----------------------------------------------------------------
-- 3. QUINIELAS
--    Cada usuario puede tener múltiples quinielas
-- ----------------------------------------------------------------
create table if not exists public.quinielas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  name                  text not null,

  -- Preguntas bonus
  champion_pick         text,
  top_scorer_pick       text,
  golden_ball_pick      text,
  most_goals_team_pick  text,

  -- Puntos ganados por cada bonus (el admin los asigna manualmente o via recalculate)
  champion_points       integer default 0,
  top_scorer_points     integer default 0,
  golden_ball_points    integer default 0,
  most_goals_team_points integer default 0,

  -- Totales calculados
  total_points          integer default 0,
  exact_results         integer default 0,
  correct_winners       integer default 0,

  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null
);

alter table public.quinielas enable row level security;

create policy "Cualquiera puede ver quinielas"
  on public.quinielas for select
  using (true);

create policy "Usuario crea sus propias quinielas"
  on public.quinielas for insert
  with check (auth.uid() = user_id);

create policy "Usuario actualiza sus propias quinielas"
  on public.quinielas for update
  using (auth.uid() = user_id);

create policy "Usuario elimina sus propias quinielas"
  on public.quinielas for delete
  using (auth.uid() = user_id);

create index if not exists idx_quinielas_user on public.quinielas(user_id);


-- ----------------------------------------------------------------
-- 4. PREDICTIONS
--    Una predicción por partido por quiniela
-- ----------------------------------------------------------------
create table if not exists public.predictions (
  id                uuid primary key default gen_random_uuid(),
  quiniela_id       uuid not null references public.quinielas(id) on delete cascade,
  fixture_id        integer not null references public.fixtures(id),
  home_score_pred   integer,
  away_score_pred   integer,
  predicts_penalties boolean default false,
  penalties_winner  text check (penalties_winner in ('home', 'away')),
  points_earned     integer default 0,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  unique(quiniela_id, fixture_id)
);

alter table public.predictions enable row level security;

-- El dueño de la quiniela puede ver, insertar y actualizar sus predicciones
create policy "Dueño ve sus predicciones"
  on public.predictions for select
  using (
    exists (
      select 1 from public.quinielas q
      where q.id = predictions.quiniela_id
      and q.user_id = auth.uid()
    )
  );

create policy "Dueño inserta sus predicciones"
  on public.predictions for insert
  with check (
    exists (
      select 1 from public.quinielas q
      where q.id = predictions.quiniela_id
      and q.user_id = auth.uid()
    )
  );

create policy "Dueño actualiza sus predicciones"
  on public.predictions for update
  using (
    exists (
      select 1 from public.quinielas q
      where q.id = predictions.quiniela_id
      and q.user_id = auth.uid()
    )
  );

create index if not exists idx_predictions_quiniela on public.predictions(quiniela_id);
create index if not exists idx_predictions_fixture  on public.predictions(fixture_id);


-- ----------------------------------------------------------------
-- 5. GROUPS
--    Tabla de posiciones por grupo (actualizada por el admin)
-- ----------------------------------------------------------------
create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  group_name       text not null,
  team_id          integer not null,
  team_name        text not null,
  team_flag        text,
  team_code        text,
  played           integer default 0,
  won              integer default 0,
  drawn            integer default 0,
  lost             integer default 0,
  goals_for        integer default 0,
  goals_against    integer default 0,
  goal_difference  integer default 0,
  points           integer default 0,
  updated_at       timestamptz default now() not null,
  unique(group_name, team_id)
);

alter table public.groups enable row level security;

create policy "Cualquiera puede ver grupos"
  on public.groups for select
  using (true);

create policy "Solo service_role modifica grupos"
  on public.groups for all
  using (auth.role() = 'service_role');


-- ================================================================
-- FIN DEL SCRIPT
-- Después de ejecutar esto:
--   1. Ve a Authentication → Providers → Email: asegúrate de habilitarlo
--   2. (Opcional) Activa Google OAuth en Authentication → Providers → Google
--   3. En la app, ve a /admin → "Sincronizar Partidos" para cargar fixtures
-- ================================================================
