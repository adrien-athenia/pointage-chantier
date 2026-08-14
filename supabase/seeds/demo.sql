-- ============================================================================
-- ⚠️  ATTENTION — SCRIPT RÉSERVÉ AU PROJET SUPABASE DEMO  ⚠️
--
-- Ne JAMAIS exécuter ce script sur le projet Supabase PRODUCTION.
-- Il est conçu pour un projet Supabase strictement séparé, dédié à la
-- démonstration publique de PointageChantier, contenant uniquement des
-- données fictives.
--
-- Toutes les suppressions de ce script sont volontairement ciblées
-- EXCLUSIVEMENT sur les 3 chantiers démo identifiés par UUID fixe
-- (voir _demo_chantiers ci-dessous) et sur les comptes démo identifiés
-- par email @athenia-demo.fr. Aucun DELETE global n'est présent.
--
-- ----------------------------------------------------------------------------
-- ORDRE D'UTILISATION
-- ----------------------------------------------------------------------------
--   1. Créer un nouveau projet Supabase dédié à la démo.
--   2. Appliquer les migrations 001 → 007 sur ce projet
--      (supabase db push, ou copier-coller dans le SQL editor, dans l'ordre).
--   3. Créer manuellement les 7 comptes Auth démo ci-dessous
--      (Dashboard → Authentication → Users → Add user, avec un mot de passe
--      de votre choix — jamais stocké ni référencé dans ce script).
--      Le trigger public.handle_new_user() (défini en 001_initial_schema.sql)
--      créera automatiquement la ligne public.profiles correspondante, avec
--      role='employe' par défaut : ce script se charge ensuite de mettre à
--      jour full_name et, pour l'admin, role='admin'.
--   4. Exécuter ce fichier (supabase/seeds/demo.sql) dans le SQL editor du
--      projet DEMO, en tant que rôle postgres (propriétaire des tables :
--      contourne nativement la RLS, sans avoir besoin de service_role côté
--      client).
--   5. Vérifier les SELECT de contrôle en fin de fichier.
--
-- Comptes Auth à créer AVANT l'exécution (aucun mot de passe fourni ici) :
--   admin.demo@athenia-demo.fr     → deviendra role='admin'
--   lucas.martin@athenia-demo.fr   → role='employe'
--   enzo.bernard@athenia-demo.fr   → role='employe'
--   julien.garcia@athenia-demo.fr  → role='employe'
--   thomas.roux@athenia-demo.fr    → role='employe'
--   mehdi.benali@athenia-demo.fr   → role='employe'
--   hugo.morel@athenia-demo.fr     → role='employe'
--
-- Si l'un de ces comptes n'existe pas encore, le script s'arrête proprement
-- (RAISE EXCEPTION) avant toute écriture — voir le garde-fou plus bas.
--
-- Idempotence : ce script peut être réexécuté sans risque de doublons.
--   - profiles       : UPDATE ciblé par email (naturellement idempotent).
--   - chantiers      : INSERT ... ON CONFLICT (id) DO UPDATE, id fixe.
--   - employe_chantiers : INSERT ... ON CONFLICT (employe_id, chantier_id)
--                          DO UPDATE.
--   - pointages      : pas de clé métier réutilisable (id = uuid aléatoire),
--                       donc DELETE ciblé strictement sur les 3 chantier_id
--                       démo fixes, puis réinsertion complète du jeu de
--                       données. Aucun autre chantier n'est jamais touché.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Comptes démo attendus (mapping email → id réel, résolu depuis
--    auth.users via le trigger handle_new_user qui a peuplé public.profiles)
-- ----------------------------------------------------------------------------

-- Pas de "on commit drop" : le SQL Editor Supabase exécute ce script
-- statement par statement en autocommit et ne garantit pas que le
-- BEGIN/COMMIT ci-dessus englobe l'ensemble du script dans une seule
-- transaction. Avec "on commit drop", la table disparaîtrait dès la fin
-- du CREATE TABLE lui-même, avant même l'INSERT suivant. Le DROP
-- explicite ci-dessous assure en plus l'idempotence si la session SQL
-- Editor est réutilisée entre deux exécutions.
drop table if exists _demo_map;

create temporary table _demo_map (
  key        text primary key,
  email      text not null,
  full_name  text not null,
  role       text not null check (role in ('admin', 'employe')),
  profile_id uuid
);

insert into _demo_map (key, email, full_name, role) values
  ('admin',  'admin.demo@athenia-demo.fr',    'Admin Démo',     'admin'),
  ('lucas',  'lucas.martin@athenia-demo.fr',  'Lucas Martin',   'employe'),
  ('enzo',   'enzo.bernard@athenia-demo.fr',  'Enzo Bernard',   'employe'),
  ('julien', 'julien.garcia@athenia-demo.fr', 'Julien Garcia',  'employe'),
  ('thomas', 'thomas.roux@athenia-demo.fr',   'Thomas Roux',    'employe'),
  ('mehdi',  'mehdi.benali@athenia-demo.fr',  'Mehdi Benali',   'employe'),
  ('hugo',   'hugo.morel@athenia-demo.fr',    'Hugo Morel',     'employe');

update _demo_map m
set profile_id = p.id
from public.profiles p
where p.email = m.email;

-- Garde-fou : si un compte Auth démo n'a pas encore été créé côté
-- Supabase Auth (étape manuelle obligatoire, voir en-tête du fichier),
-- le script s'arrête ici sans rien écrire.
do $$
declare
  v_missing text;
begin
  select string_agg(email, ', ' order by email) into v_missing
  from _demo_map
  where profile_id is null;

  if v_missing is not null then
    raise exception
      'Comptes Auth démo manquants : %. Créez-les dans Supabase Auth (Dashboard → Authentication → Users) avant de relancer ce script.',
      v_missing;
  end if;
end $$;

-- Applique le nom affiché et le rôle corrects sur les profils déjà créés
-- automatiquement par le trigger handle_new_user (role='employe' par défaut).
update public.profiles p
set full_name = m.full_name,
    role      = m.role
from _demo_map m
where p.id = m.profile_id;

-- ----------------------------------------------------------------------------
-- 1. Chantiers démo (UUID fixes, jamais générés aléatoirement, pour
--    permettre un ciblage exact et idempotent des DELETE/UPDATE)
-- ----------------------------------------------------------------------------

-- Même remarque que pour _demo_map : pas de "on commit drop" (voir
-- commentaire ci-dessus), pour éviter la disparition prématurée de la
-- table entre deux statements exécutés en autocommit par le SQL Editor.
drop table if exists _demo_chantiers;

create temporary table _demo_chantiers (
  key         text primary key,
  chantier_id uuid not null
);

insert into _demo_chantiers (key, chantier_id) values
  ('oliviers',      '00000000-0000-4000-a000-000000000101'),
  ('horizon',       '00000000-0000-4000-a000-000000000102'),
  ('mediterranee',  '00000000-0000-4000-a000-000000000103');

-- Colonnes réelles de public.chantiers (001_initial_schema.sql,
-- 004_chantiers_duree_max.sql, 007_chantier_lifecycle.sql) :
-- id, nom, adresse, ville, actif (dérivé auto par trigger), latitude,
-- longitude, rayon_autorise, duree_max_intervention_minutes, statut,
-- created_at, updated_at. `actif` n'est jamais écrit ici : le trigger
-- sync_chantier_actif_trigger le recalcule à partir de `statut`.
insert into public.chantiers
  (id, nom, adresse, ville, latitude, longitude, rayon_autorise, duree_max_intervention_minutes, statut)
values
  (
    '00000000-0000-4000-a000-000000000101',
    'Résidence Les Oliviers', '12 Chemin des Oliviers', 'Istres',
    43.5139, 4.9877, 100, 600, 'actif'
  ),
  (
    '00000000-0000-4000-a000-000000000102',
    'Villa Horizon', 'Route de la Côte Bleue', 'Martigues',
    43.4055, 5.0473, 120, 540, 'actif'
  ),
  (
    '00000000-0000-4000-a000-000000000103',
    'Local commercial Méditerranée', 'Zone Industrielle des Tellines', 'Fos-sur-Mer',
    43.4333, 4.9500, 80, 480, 'actif'
  )
on conflict (id) do update set
  nom                             = excluded.nom,
  adresse                         = excluded.adresse,
  ville                           = excluded.ville,
  latitude                        = excluded.latitude,
  longitude                       = excluded.longitude,
  rayon_autorise                  = excluded.rayon_autorise,
  duree_max_intervention_minutes  = excluded.duree_max_intervention_minutes,
  statut                          = excluded.statut;

-- ----------------------------------------------------------------------------
-- 2. Affectations employe_chantiers (colonnes réelles :
--    employe_id, chantier_id, actif, created_at — 003_employe_chantiers.sql)
-- ----------------------------------------------------------------------------

insert into public.employe_chantiers (employe_id, chantier_id, actif)
select m.profile_id, c.chantier_id, true
from (values
  ('lucas',  'oliviers'),
  ('enzo',   'oliviers'),
  ('julien', 'oliviers'),
  ('mehdi',  'oliviers'),
  ('thomas', 'horizon'),
  ('hugo',   'horizon'),
  ('lucas',  'horizon'),
  ('enzo',   'mediterranee'),
  ('julien', 'mediterranee'),
  ('thomas', 'mediterranee')
) as v(emp_key, chantier_key)
join _demo_map m on m.key = v.emp_key
join _demo_chantiers c on c.key = v.chantier_key
on conflict (employe_id, chantier_id) do update set actif = excluded.actif;

-- ----------------------------------------------------------------------------
-- 3. Historique de pointages
--
--    Colonnes réelles de public.pointages (001, 005_pointages_gps_and_pause.sql) :
--    id, employe_id, chantier_id, type, pointe_at, created_at, latitude,
--    longitude, gps_accuracy, distance_chantier_m.
--    type ∈ ('arrivee','pause_debut','pause_fin','depart') — valeurs
--    exactes de la contrainte pointages_type_check (005), et NON
--    'pause_dej'/'reprise_dej'.
--
--    distance_chantier_m est calculée avec la même fonction que la RPC
--    create_pointage (public.haversine_distance_m, 006), à partir des
--    coordonnées du pointage et de celles du chantier réellement stockées
--    en base — jamais une valeur inventée à la main.
--
--    Repère temporel : 4 jours couverts (aujourd'hui, hier, avant-hier,
--    et un jour de la semaine précédente), tous calculés dynamiquement à
--    partir de CURRENT_DATE, donc valables quel que soit le jour
--    d'exécution du script.
-- ----------------------------------------------------------------------------

-- Purge ciblée : uniquement les pointages des 3 chantiers démo (jamais un
-- DELETE global sur la table).
delete from public.pointages
where chantier_id in (select chantier_id from _demo_chantiers);

-- Même remarque que pour _demo_map / _demo_chantiers : pas de
-- "on commit drop".
drop table if exists _demo_pointages_seed;

create temporary table _demo_pointages_seed (
  emp_key      text not null,
  chantier_key text not null,
  type         text not null,
  ts           timestamptz not null,
  lat          double precision,
  lng          double precision,
  accuracy     double precision
);

insert into _demo_pointages_seed (emp_key, chantier_key, type, ts, lat, lng, accuracy) values
  -- ---- J-4 : Julien (Méditerranée), Thomas (Horizon), Hugo (Horizon) ----
  ('julien', 'mediterranee', 'arrivee',     (current_date - 4) + time '08:10:00', null,      null,     null),   -- anomalie C : localisation indisponible
  ('julien', 'mediterranee', 'pause_debut', (current_date - 4) + time '12:30:00', 43.43345,  4.95010,  10),
  ('julien', 'mediterranee', 'pause_fin',   (current_date - 4) + time '13:15:00', 43.43338,  4.95005,  9),
  ('julien', 'mediterranee', 'depart',      (current_date - 4) + time '17:05:00', 43.43330,  4.95015,  11),
  ('thomas', 'horizon',      'arrivee',     (current_date - 4) + time '07:58:00', 43.40555,  5.04735,  7),
  ('thomas', 'horizon',      'depart',      (current_date - 4) + time '16:50:00', 43.40548,  5.04725,  8),
  ('hugo',   'horizon',      'arrivee',     (current_date - 4) + time '08:05:00', 43.40552,  5.04728,  6),
  ('hugo',   'horizon',      'pause_debut', (current_date - 4) + time '12:00:00', 43.40560,  5.04732,  7),
  ('hugo',   'horizon',      'pause_fin',   (current_date - 4) + time '12:50:00', 43.40558,  5.04730,  8),
  ('hugo',   'horizon',      'depart',      (current_date - 4) + time '16:35:00', 43.40545,  5.04720,  9),

  -- ---- J-2 : Lucas (Horizon), Enzo (Méditerranée, longue durée), Julien (Oliviers) ----
  ('lucas',  'horizon',      'arrivee',     (current_date - 2) + time '07:50:00', 43.40548,  5.04732,  9),
  ('lucas',  'horizon',      'pause_debut', (current_date - 2) + time '12:10:00', 43.40552,  5.04728,  8),
  ('lucas',  'horizon',      'pause_fin',   (current_date - 2) + time '13:05:00', 43.40550,  5.04730,  7),
  ('lucas',  'horizon',      'depart',      (current_date - 2) + time '16:45:00', 43.40545,  5.04725,  10),
  ('enzo',   'mediterranee', 'arrivee',     (current_date - 2) + time '06:45:00', 43.43335,  4.95005,  12),   -- anomalie E : intervention longue (12h35 > 480 min max)
  ('enzo',   'mediterranee', 'depart',      (current_date - 2) + time '19:20:00', 43.43340,  4.95010,  11),
  ('julien', 'oliviers',     'arrivee',     (current_date - 2) + time '08:02:00', 43.51395,  4.98765,  9),
  ('julien', 'oliviers',     'pause_debut', (current_date - 2) + time '12:00:00', 43.51392,  4.98772,  8),
  ('julien', 'oliviers',     'pause_fin',   (current_date - 2) + time '12:45:00', 43.51398,  4.98768,  9),
  ('julien', 'oliviers',     'depart',      (current_date - 2) + time '16:55:00', 43.51390,  4.98775,  10),

  -- ---- J-1 (hier) : Mehdi (Oliviers), Thomas (Méditerranée, GPS médiocre), Hugo (Horizon, hors zone) ----
  ('mehdi',  'oliviers',     'arrivee',     (current_date - 1) + time '07:52:00', 43.51388,  4.98773,  8),
  ('mehdi',  'oliviers',     'pause_debut', (current_date - 1) + time '12:05:00', 43.51392,  4.98769,  7),
  ('mehdi',  'oliviers',     'pause_fin',   (current_date - 1) + time '12:50:00', 43.51395,  4.98771,  8),
  ('mehdi',  'oliviers',     'depart',      (current_date - 1) + time '16:38:00', 43.51390,  4.98774,  9),
  ('thomas', 'mediterranee', 'arrivee',     (current_date - 1) + time '08:08:00', 43.43332,  4.95008,  95),  -- anomalie D : précision GPS médiocre
  ('thomas', 'mediterranee', 'pause_debut', (current_date - 1) + time '12:15:00', 43.43338,  4.95012,  10),
  ('thomas', 'mediterranee', 'pause_fin',   (current_date - 1) + time '13:05:00', 43.43335,  4.95006,  9),
  ('thomas', 'mediterranee', 'depart',      (current_date - 1) + time '17:10:00', 43.43340,  4.95015,  11),
  ('hugo',   'horizon',      'arrivee',     (current_date - 1) + time '07:59:00', 43.40950,  5.05170,  14),  -- anomalie B : hors zone (~500 m, rayon 120 m)
  ('hugo',   'horizon',      'depart',      (current_date - 1) + time '16:20:00', 43.40550,  5.04730,  9),

  -- ---- J0 (aujourd'hui) : dashboard non vide au chargement ----
  ('lucas',  'oliviers',     'arrivee',     current_date + time '07:57:00', 43.51392, 4.98770, 8),
  ('lucas',  'oliviers',     'depart',      current_date + time '12:30:00', 43.51388, 4.98774, 9),   -- déjà parti (demi-journée)
  ('enzo',   'oliviers',     'arrivee',     current_date + time '08:01:00', 43.51395, 4.98768, 7),   -- présent (journée en cours)
  ('julien', 'mediterranee', 'arrivee',     current_date + time '07:50:00', 43.43336, 4.95009, 8),
  ('julien', 'mediterranee', 'pause_debut', current_date + time '12:00:00', 43.43340, 4.95012, 9),   -- présent, en pause
  ('mehdi',  'oliviers',     'arrivee',     current_date + time '08:05:00', 43.51390, 4.98772, 8),
  ('mehdi',  'oliviers',     'pause_debut', current_date + time '12:10:00', 43.51393, 4.98769, 7),   -- présent, en pause
  ('thomas', 'horizon',      'arrivee',     current_date + time '07:45:00', 43.40553, 5.04727, 9),
  ('thomas', 'horizon',      'depart',      current_date + time '16:00:00', 43.40548, 5.04731, 8),   -- déjà parti
  ('hugo',   'horizon',      'arrivee',     current_date + time '06:50:00', 43.40556, 5.04729, 7);   -- anomalie A : arrivée sans départ

insert into public.pointages
  (employe_id, chantier_id, type, pointe_at, latitude, longitude, gps_accuracy, distance_chantier_m)
select
  m.profile_id,
  c.chantier_id,
  s.type,
  s.ts,
  s.lat,
  s.lng,
  s.accuracy,
  case
    when s.lat is not null and s.lng is not null and ch.latitude is not null and ch.longitude is not null
      then public.haversine_distance_m(s.lat, s.lng, ch.latitude, ch.longitude)
    else null
  end as distance_chantier_m
from _demo_pointages_seed s
join _demo_map m on m.key = s.emp_key
join _demo_chantiers c on c.key = s.chantier_key
join public.chantiers ch on ch.id = c.chantier_id;

-- Nettoyage explicite des tables temporaires : elles ne dépendent plus
-- d'un COMMIT (voir remarque plus haut), donc on les supprime nous-mêmes
-- une fois leur dernier usage passé, plutôt que de compter sur
-- ON COMMIT DROP ou sur la fin de session.
drop table if exists _demo_pointages_seed;
drop table if exists _demo_chantiers;
drop table if exists _demo_map;

commit;

-- ============================================================================
-- 4. VÉRIFICATIONS (lecture seule, non destructif, exécutable à tout moment)
-- ============================================================================

-- Profils démo effectivement configurés (attendu : 7 lignes)
select p.email, p.full_name, p.role
from public.profiles p
where p.email in (
  'admin.demo@athenia-demo.fr', 'lucas.martin@athenia-demo.fr', 'enzo.bernard@athenia-demo.fr',
  'julien.garcia@athenia-demo.fr', 'thomas.roux@athenia-demo.fr', 'mehdi.benali@athenia-demo.fr',
  'hugo.morel@athenia-demo.fr'
)
order by p.role, p.email;

-- Chantiers démo (attendu : 3 lignes, statut='actif')
select id, nom, ville, statut, rayon_autorise, duree_max_intervention_minutes
from public.chantiers
where id in (
  '00000000-0000-4000-a000-000000000101',
  '00000000-0000-4000-a000-000000000102',
  '00000000-0000-4000-a000-000000000103'
)
order by nom;

-- Affectations démo (attendu : 10 lignes)
select count(*) as nb_affectations
from public.employe_chantiers
where chantier_id in (
  '00000000-0000-4000-a000-000000000101',
  '00000000-0000-4000-a000-000000000102',
  '00000000-0000-4000-a000-000000000103'
);

-- Total pointages démo (attendu : 40 lignes)
select count(*) as nb_pointages
from public.pointages
where chantier_id in (
  '00000000-0000-4000-a000-000000000101',
  '00000000-0000-4000-a000-000000000102',
  '00000000-0000-4000-a000-000000000103'
);

-- Pointages du jour (dashboard non vide)
select count(*) as nb_pointages_aujourdhui
from public.pointages
where pointe_at::date = current_date
  and chantier_id in (
    '00000000-0000-4000-a000-000000000101',
    '00000000-0000-4000-a000-000000000102',
    '00000000-0000-4000-a000-000000000103'
  );

-- Anomalie B : pointages hors zone (distance > rayon autorisé du chantier)
select po.id, po.pointe_at, po.distance_chantier_m, ch.rayon_autorise, ch.nom
from public.pointages po
join public.chantiers ch on ch.id = po.chantier_id
where ch.id in (
  '00000000-0000-4000-a000-000000000101',
  '00000000-0000-4000-a000-000000000102',
  '00000000-0000-4000-a000-000000000103'
)
and po.distance_chantier_m is not null
and po.distance_chantier_m > ch.rayon_autorise;

-- Anomalie C : localisation indisponible (GPS null)
select count(*) as nb_gps_indisponible
from public.pointages
where latitude is null
  and chantier_id in (
    '00000000-0000-4000-a000-000000000101',
    '00000000-0000-4000-a000-000000000102',
    '00000000-0000-4000-a000-000000000103'
  );

-- Anomalie A : arrivée aujourd'hui sans départ (employé "présent")
select distinct on (po.employe_id) p.full_name, po.type, po.pointe_at
from public.pointages po
join public.profiles p on p.id = po.employe_id
where po.chantier_id in (
    '00000000-0000-4000-a000-000000000101',
    '00000000-0000-4000-a000-000000000102',
    '00000000-0000-4000-a000-000000000103'
  )
order by po.employe_id, po.pointe_at desc;
