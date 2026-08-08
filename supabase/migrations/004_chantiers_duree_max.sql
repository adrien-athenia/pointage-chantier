-- ============================================================================
-- PointageChantier — Durée maximale d'intervention par chantier
--
-- NULL = aucune limite. Le dépassement ne déclenche jamais de départ
-- automatique : il est uniquement dérivé côté application pour alerter
-- l'employé et signaler une anomalie à l'administration.
-- ============================================================================

alter table public.chantiers
  add column duree_max_intervention_minutes integer;

comment on column public.chantiers.duree_max_intervention_minutes is
  'Durée maximale d''intervention en minutes avant alerte (NULL = aucune limite). Ne déclenche jamais de départ automatique.';

-- ----------------------------------------------------------------------------
-- Audit sécurité : contrôle de plage sur les coordonnées officielles du
-- chantier (protège aussi contre une erreur de saisie dans le formulaire
-- admin, ex. inversion latitude/longitude ou faute de frappe).
-- ----------------------------------------------------------------------------

alter table public.chantiers
  add constraint chantiers_latitude_range_check check (latitude is null or (latitude between -90 and 90)),
  add constraint chantiers_longitude_range_check check (longitude is null or (longitude between -180 and 180));
