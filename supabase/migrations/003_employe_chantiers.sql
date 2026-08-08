-- ============================================================================
-- PointageChantier — Affectations employé ↔ chantier
--
-- Table de liaison + RLS, et durcissement de la policy SELECT sur
-- chantiers : un employé ne doit voir que les chantiers actifs auxquels
-- il est explicitement affecté (au lieu de "tous les chantiers actifs").
-- La policy admin (accès total) est conservée à l'identique.
-- ============================================================================

create table public.employe_chantiers (
  employe_id  uuid not null references public.profiles (id) on delete cascade,
  chantier_id uuid not null references public.chantiers (id) on delete cascade,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (employe_id, chantier_id)
);

create index employe_chantiers_chantier_id_idx on public.employe_chantiers (chantier_id);

alter table public.employe_chantiers enable row level security;

-- Admin : SELECT / INSERT / UPDATE / DELETE.
create policy "employe_chantiers_admin_all"
  on public.employe_chantiers
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Employé : lecture de ses propres affectations uniquement.
create policy "employe_chantiers_select_self"
  on public.employe_chantiers
  for select
  using (employe_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Durcissement de chantiers_select (définie dans 001_initial_schema.sql) :
-- remplace "actif = true" par "actif = true ET affecté à cet employé".
-- ----------------------------------------------------------------------------

drop policy if exists "chantiers_select" on public.chantiers;

create policy "chantiers_select"
  on public.chantiers
  for select
  using (
    public.current_user_role() = 'admin'
    or (
      actif = true
      and exists (
        select 1
        from public.employe_chantiers ec
        where ec.chantier_id = chantiers.id
          and ec.employe_id = auth.uid()
          and ec.actif = true
      )
    )
  );
