-- ============================================================================
-- PointageChantier — Suppression des photos de chantier (admin uniquement)
--
-- 008_chantier_photos.sql posait SELECT/INSERT (table + Storage) mais
-- aucune policy DELETE sur aucune des deux couches — aucune suppression
-- n'était donc possible, même pour un admin. Correctif strictement
-- additif : ajoute uniquement le DELETE, réservé à l'admin. Les policies
-- SELECT/INSERT existantes (008) ne sont ni supprimées ni modifiées.
-- ============================================================================

-- Table de métadonnées : GRANT de base requis avant toute évaluation RLS
-- (même constat que pour SELECT/INSERT, voir
-- 009_fix_chantier_photos_grants.sql). authenticated uniquement, jamais
-- anon ; aucun autre privilège (pas d'UPDATE).
grant delete on table public.chantier_photos to authenticated;

-- Policy RLS table : seul un admin (rôle réel relu en base via
-- current_user_role(), jamais transmis par le client) peut supprimer une
-- ligne — un employé, même auteur de la photo, ne le peut jamais.
create policy "chantier_photos_delete_admin"
  on public.chantier_photos
  for delete
  using (public.current_user_role() = 'admin');

-- Storage : même règle sur le bucket chantier-photos. Aucun GRANT
-- supplémentaire nécessaire sur storage.objects — contrairement à
-- public.chantier_photos, les privilèges de base sur storage.objects sont
-- déjà posés par la plateforme Supabase (SELECT/INSERT y fonctionnaient
-- déjà sans GRANT explicite dans 008) ; seule la policy manquait.
create policy "chantier_photos_storage_delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'chantier-photos'
    and public.current_user_role() = 'admin'
  );
