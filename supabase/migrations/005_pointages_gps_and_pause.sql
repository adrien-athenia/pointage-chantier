-- ============================================================================
-- PointageChantier — Colonnes GPS + types de pointage pause_debut/pause_fin
--
-- Les colonnes GPS restent NULL si la localisation n'a pas pu être
-- obtenue au moment du pointage : aucune valeur n'est jamais fabriquée.
-- ============================================================================

alter table public.pointages
  add column latitude double precision,
  add column longitude double precision,
  add column gps_accuracy double precision,
  add column distance_chantier_m double precision;

comment on column public.pointages.latitude is 'Latitude captée au moment du pointage (navigator.geolocation), NULL si indisponible.';
comment on column public.pointages.longitude is 'Longitude captée au moment du pointage, NULL si indisponible.';
comment on column public.pointages.gps_accuracy is 'Précision GPS en mètres (position.coords.accuracy), NULL si indisponible.';
comment on column public.pointages.distance_chantier_m is 'Distance calculée côté serveur (Haversine) entre le pointage et les coordonnées officielles du chantier, NULL si l''un des deux points est manquant.';

-- Étend le type de pointage pour supporter la pause / reprise, en plus de
-- l'arrivée et du départ déjà existants.
alter table public.pointages
  drop constraint if exists pointages_type_check;

alter table public.pointages
  add constraint pointages_type_check
  check (type in ('arrivee', 'pause_debut', 'pause_fin', 'depart'));

-- ----------------------------------------------------------------------------
-- Audit sécurité : contrôle de plage sur les coordonnées et la précision
-- GPS enregistrées à chaque pointage. Défense en profondeur au niveau du
-- schéma, en plus de la validation faite dans create_pointage() : cette
-- contrainte protège l'intégrité des données quel que soit le chemin
-- d'insertion, présent ou futur.
-- ----------------------------------------------------------------------------

alter table public.pointages
  add constraint pointages_latitude_range_check check (latitude is null or (latitude between -90 and 90)),
  add constraint pointages_longitude_range_check check (longitude is null or (longitude between -180 and 180)),
  add constraint pointages_gps_accuracy_check check (gps_accuracy is null or gps_accuracy >= 0);
