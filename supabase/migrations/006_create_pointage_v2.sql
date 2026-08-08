-- ============================================================================
-- PointageChantier — Pointage v2 : affectation, pause/reprise, GPS, distance
--
-- Remplace intégralement la fonction create_pointage(uuid, text) créée en
-- 002_create_pointage_function.sql par une version à 5 paramètres qui :
--   1. valide la machine à états complète arrivee → (pause_debut ↔
--      pause_fin)* → depart, entièrement côté serveur ;
--   2. vérifie que l'employé est réellement affecté au chantier
--      (public.employe_chantiers) avant d'accepter une nouvelle arrivée ;
--   3. calcule la distance au chantier (Haversine) côté PostgreSQL à
--      partir des coordonnées transmises, sans jamais faire confiance à
--      un calcul fait dans le navigateur ;
--   4. conserve le verrou transactionnel par employé (protection contre
--      le double-clic / les requêtes concurrentes) introduit en 002 ;
--   5. valide les plages latitude/longitude/précision avant tout calcul ;
--   6. supprime l'INSERT direct côté client sur pointages (policy
--      pointages_insert_self de 001) : la RPC devient le SEUL chemin
--      d'écriture, ce qui empêche de contourner les points 1 à 5 par un
--      appel direct à `supabase.from('pointages').insert(...)`.
--
-- Un pointage hors zone ou avec un GPS imprécis N'EST JAMAIS rejeté : il
-- est enregistré tel quel (distance/precision brutes), l'anomalie étant
-- dérivée à l'affichage (src/lib/anomalies.ts), pas stockée en base.
-- ============================================================================

drop function if exists public.create_pointage(uuid, text);

create or replace function public.haversine_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
set search_path = public, pg_catalog
as $$
  -- least(1.0, ...) protège asin() contre un argument légèrement > 1
  -- provoqué par l'arrondi flottant sur des points très proches ou
  -- identiques, qui provoquerait sinon une erreur Postgres bloquant le
  -- pointage ("input is out of range").
  select 2 * 6371000 * asin(
    least(
      1.0,
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
      )
    )
  )
$$;

revoke execute on function public.haversine_distance_m(double precision, double precision, double precision, double precision) from public;
grant execute on function public.haversine_distance_m(double precision, double precision, double precision, double precision) to authenticated;

create or replace function public.create_pointage(
  p_chantier_id uuid,
  p_type text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null
)
returns public.pointages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe_id uuid := auth.uid();
  v_last public.pointages;
  v_state text;
  v_chantier_lat double precision;
  v_chantier_lng double precision;
  v_distance double precision;
  v_result public.pointages;
begin
  if v_employe_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;

  if p_type not in ('arrivee', 'pause_debut', 'pause_fin', 'depart') then
    raise exception 'Type de pointage invalide : %', p_type;
  end if;

  if p_chantier_id is null then
    raise exception 'Chantier requis.';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitude invalide (doit être comprise entre -90 et 90).';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitude invalide (doit être comprise entre -180 et 180).';
  end if;

  if p_accuracy is not null and p_accuracy < 0 then
    raise exception 'Précision GPS invalide (doit être positive).';
  end if;

  -- Verrou transactionnel par employé : sérialise les tentatives
  -- concurrentes (double-clic, deux onglets) pour ce même utilisateur.
  perform pg_advisory_xact_lock(hashtext(v_employe_id::text));

  select * into v_last
  from public.pointages
  where employe_id = v_employe_id
  order by pointe_at desc
  limit 1;

  v_state := case
    when v_last.type is null then 'idle'
    when v_last.type = 'depart' then 'idle'
    when v_last.type = 'arrivee' then 'working'
    when v_last.type = 'pause_fin' then 'working'
    when v_last.type = 'pause_debut' then 'paused'
  end;

  if p_type = 'arrivee' and v_state <> 'idle' then
    raise exception 'Une intervention est déjà en cours (arrivée ou pause non clôturée).';
  end if;

  if p_type = 'pause_debut' and v_state <> 'working' then
    raise exception 'Impossible de commencer une pause en dehors d''une intervention en cours.';
  end if;

  if p_type = 'pause_fin' and v_state <> 'paused' then
    raise exception 'Aucune pause en cours à terminer.';
  end if;

  if p_type = 'depart' and v_state <> 'working' then
    raise exception 'Le départ nécessite une intervention en cours et non en pause.';
  end if;

  if p_type = 'arrivee' then
    -- Seule une NOUVELLE arrivée doit cibler un chantier actif auquel
    -- l'employé est affecté. Les actions suivantes (pause/depart) restent
    -- toujours possibles pour clôturer une intervention déjà commencée,
    -- même si le chantier est désactivé ou l'affectation retirée
    -- entre-temps.
    if not exists (
      select 1 from public.chantiers where id = p_chantier_id and actif = true
    ) then
      raise exception 'Chantier invalide ou inactif.';
    end if;

    if not exists (
      select 1 from public.employe_chantiers
      where employe_id = v_employe_id and chantier_id = p_chantier_id and actif = true
    ) then
      raise exception 'Vous n''êtes pas affecté à ce chantier.';
    end if;
  else
    if v_last.chantier_id <> p_chantier_id then
      raise exception 'Cette action doit être pointée sur le chantier de l''intervention en cours.';
    end if;
  end if;

  select latitude, longitude into v_chantier_lat, v_chantier_lng
  from public.chantiers
  where id = p_chantier_id;

  if p_latitude is not null and p_longitude is not null and v_chantier_lat is not null and v_chantier_lng is not null then
    v_distance := public.haversine_distance_m(p_latitude, p_longitude, v_chantier_lat, v_chantier_lng);
  else
    v_distance := null;
  end if;

  -- pointe_at n'est jamais fourni par le client : DEFAULT now() côté base.
  insert into public.pointages (employe_id, chantier_id, type, latitude, longitude, gps_accuracy, distance_chantier_m)
  values (v_employe_id, p_chantier_id, p_type, p_latitude, p_longitude, p_accuracy, v_distance)
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_pointage(uuid, text, double precision, double precision, double precision) from public;
grant execute on function public.create_pointage(uuid, text, double precision, double precision, double precision) to authenticated;

-- ----------------------------------------------------------------------------
-- Faille corrigée par cet audit : la policy pointages_insert_self (créée
-- en 001_initial_schema.sql) autorisait un INSERT direct depuis le client
-- tant que employe_id = auth.uid(), en contournant entièrement la machine
-- à états, le contrôle d'affectation/chantier actif, le calcul de
-- distance et le verrou anti double-clic ci-dessus. Elle est supprimée :
-- create_pointage (SECURITY DEFINER, donc non soumise à RLS) devient
-- l'unique chemin d'écriture sur pointages. Aucun impact sur le code
-- frontend existant, qui n'utilise déjà que cette RPC.
-- ----------------------------------------------------------------------------

drop policy if exists "pointages_insert_self" on public.pointages;
