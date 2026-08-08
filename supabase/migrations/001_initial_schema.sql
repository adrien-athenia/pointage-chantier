-- ============================================================================
-- PointageChantier — Migration initiale
-- Tables : profiles, chantiers, pointages
-- Trigger de création automatique de profil
-- RLS + policies admin / employe
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null check (role in ('admin', 'employe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chantiers (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  adresse         text,
  ville           text,
  actif           boolean not null default true,
  latitude        double precision,
  longitude       double precision,
  rayon_autorise  integer not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.pointages (
  id          uuid primary key default gen_random_uuid(),
  employe_id  uuid not null references public.profiles (id),
  chantier_id uuid not null references public.chantiers (id),
  type        text not null check (type in ('arrivee', 'depart')),
  pointe_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index pointages_employe_id_idx on public.pointages (employe_id);
create index pointages_chantier_id_idx on public.pointages (chantier_id);

-- ----------------------------------------------------------------------------
-- 2. updated_at automatique (profiles, chantiers)
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_chantiers_updated_at
  before update on public.chantiers
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Création automatique du profil à l'inscription
--    Rôle par défaut : 'employe'. Le passage en 'admin' se fait manuellement
--    (SQL editor / dashboard Supabase), jamais depuis le client.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'employe'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Helper RLS : rôle de l'utilisateur courant
--    SECURITY DEFINER => contourne RLS sur profiles lors de la lecture du rôle,
--    ce qui évite toute boucle récursive quand la fonction est utilisée dans
--    une policy portant elle-même sur la table profiles.
-- ----------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.chantiers enable row level security;
alter table public.pointages enable row level security;

-- profiles ---------------------------------------------------------------
-- Admin : lit tous les profiles. Employe : lit uniquement le sien.
create policy "profiles_select"
  on public.profiles
  for select
  using (
    id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- chantiers ----------------------------------------------------------------
-- Admin : lit tous les chantiers. Employe : lit uniquement les chantiers actifs.
create policy "chantiers_select"
  on public.chantiers
  for select
  using (
    actif = true
    or public.current_user_role() = 'admin'
  );

-- Admin : seul rôle autorisé à créer / modifier / supprimer des chantiers.
create policy "chantiers_insert_admin"
  on public.chantiers
  for insert
  with check (public.current_user_role() = 'admin');

create policy "chantiers_update_admin"
  on public.chantiers
  for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "chantiers_delete_admin"
  on public.chantiers
  for delete
  using (public.current_user_role() = 'admin');

-- pointages ------------------------------------------------------------------
-- Admin : lit tous les pointages. Employe : lit uniquement les siens.
create policy "pointages_select"
  on public.pointages
  for select
  using (
    employe_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- Un utilisateur ne peut créer un pointage que pour lui-même.
-- Aucune policy update / delete : les pointages existants sont immuables
-- pour tout le monde une fois créés (y compris pour l'admin, via l'API client).
create policy "pointages_insert_self"
  on public.pointages
  for insert
  with check (employe_id = auth.uid());
