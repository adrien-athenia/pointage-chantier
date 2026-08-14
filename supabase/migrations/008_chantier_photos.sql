-- ============================================================================
-- PointageChantier — Suivi photo des chantiers
--
-- Table de métadonnées (public.chantier_photos) + bucket Storage privé
-- (chantier-photos) + policies RLS/Storage.
--
-- Aucune notion d'organisation dans le schéma actuel (001_initial_schema.sql
-- à 007_chantier_lifecycle.sql) : le chemin de stockage reste donc
-- <chantier_id>/<uuid>.<extension>, sans segment organisation_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table de métadonnées
-- ----------------------------------------------------------------------------

create table public.chantier_photos (
  id                uuid primary key default gen_random_uuid(),
  chantier_id       uuid not null references public.chantiers (id) on delete cascade,
  auteur_profile_id uuid not null references public.profiles (id),
  storage_path      text not null unique,
  commentaire       text,
  created_at        timestamptz not null default now()
);

-- Journal le plus récent d'abord, par chantier : c'est l'unique requête de
-- lecture faite par la page Suivi chantier.
create index chantier_photos_chantier_id_created_at_idx
  on public.chantier_photos (chantier_id, created_at desc);

alter table public.chantier_photos enable row level security;

-- Admin : lecture totale, création avec authorship forcée à soi-même
-- (même si l'admin n'est jamais bloqué côté périmètre, l'auteur enregistré
-- reste toujours l'utilisateur réellement connecté, jamais falsifiable
-- depuis le client).
create policy "chantier_photos_select_admin"
  on public.chantier_photos
  for select
  using (public.current_user_role() = 'admin');

create policy "chantier_photos_insert_admin"
  on public.chantier_photos
  for insert
  with check (
    public.current_user_role() = 'admin'
    and auteur_profile_id = auth.uid()
  );

-- Employé : lecture/création uniquement s'il existe une affectation ACTIVE
-- (employe_chantiers.actif = true) sur ce chantier précis — même condition
-- que celle déjà utilisée par create_pointage (006_create_pointage_v2.sql)
-- pour une nouvelle arrivée, réutilisée ici plutôt que dupliquée sous une
-- nouvelle forme.
create policy "chantier_photos_select_employe"
  on public.chantier_photos
  for select
  using (
    exists (
      select 1
      from public.employe_chantiers ec
      where ec.chantier_id = chantier_photos.chantier_id
        and ec.employe_id = auth.uid()
        and ec.actif = true
    )
  );

create policy "chantier_photos_insert_employe"
  on public.chantier_photos
  for insert
  with check (
    auteur_profile_id = auth.uid()
    and exists (
      select 1
      from public.employe_chantiers ec
      where ec.chantier_id = chantier_photos.chantier_id
        and ec.employe_id = auth.uid()
        and ec.actif = true
    )
  );

-- Aucune policy update / delete, volontairement : comme public.pointages,
-- une entrée du journal photo est immuable une fois créée (pas de
-- suppression/édition dans cette tâche — voir compte-rendu).

-- ----------------------------------------------------------------------------
-- 2. Bucket Storage privé, avec quotas appliqués côté serveur
--    (défense en profondeur : la validation côté client dans
--    chantierPhotoService.ts applique la même règle, mais Storage la
--    fait respecter même si le client est contourné).
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chantier-photos',
  'chantier-photos',
  false,
  10485760, -- 10 Mo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public              = excluded.public,
  file_size_limit     = excluded.file_size_limit,
  allowed_mime_types  = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 3. Policies Storage (storage.objects), bucket chantier-photos uniquement.
--    Chemin attendu : <chantier_id>/<uuid>.<extension> — storage.foldername
--    (helper standard fourni par l'extension Storage) extrait le premier
--    segment du chemin, comparé à l'affectation employe_chantiers.
--
--    Aucune policy update : personne (admin compris) ne peut remplacer un
--    objet existant depuis le client — chaque photo est un nouvel objet
--    (nom généré par uuid), jamais un remplacement.
-- ----------------------------------------------------------------------------

create policy "chantier_photos_storage_select"
  on storage.objects
  for select
  using (
    bucket_id = 'chantier-photos'
    and (
      public.current_user_role() = 'admin'
      or exists (
        select 1
        from public.employe_chantiers ec
        where ec.chantier_id::text = (storage.foldername(name))[1]
          and ec.employe_id = auth.uid()
          and ec.actif = true
      )
    )
  );

create policy "chantier_photos_storage_insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'chantier-photos'
    and (
      public.current_user_role() = 'admin'
      or exists (
        select 1
        from public.employe_chantiers ec
        where ec.chantier_id::text = (storage.foldername(name))[1]
          and ec.employe_id = auth.uid()
          and ec.actif = true
      )
    )
  );
