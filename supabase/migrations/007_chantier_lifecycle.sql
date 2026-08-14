-- ============================================================================
-- PointageChantier — Cycle de vie des chantiers (actif / termine / archive)
--
-- Ajoute un statut explicite à public.chantiers, sans supprimer la
-- colonne actif existante (encore utilisée par du code/RLS en place) :
-- un trigger la maintient automatiquement synchronisée pour ne jamais
-- avoir deux sources de vérité divergentes.
--
-- Adapte également :
--   - la policy RLS chantiers_select (statut, et lecture des chantiers
--     historiques via les pointages de l'employé, même après terminaison
--     ou archivage) ;
--   - la RPC create_pointage (une NOUVELLE arrivée exige statut='actif' ;
--     pause/reprise/départ restent inchangés, donc toujours possibles
--     même si le chantier est terminé pendant l'intervention).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne statut + rétrocompatibilité avec actif
-- ----------------------------------------------------------------------------

alter table public.chantiers
  add column statut text not null default 'actif'
  check (statut in ('actif', 'termine', 'archive'));

update public.chantiers
  set statut = case when actif then 'actif' else 'archive' end;

comment on column public.chantiers.statut is
  'Cycle de vie du chantier : actif (sélectionnable, nouvelle arrivée autorisée), termine (fini, plus sélectionnable mais historique conservé), archive (masqué des vues courantes, historique conservé). Source de vérité ; actif est un miroir dérivé automatiquement (voir sync_chantier_actif).';

-- actif reste en base pour compatibilité descendante immédiate, mais
-- n'est plus jamais écrit directement par le frontend à partir de cette
-- migration : ce trigger le recalcule systématiquement à partir de
-- statut, avant toute écriture, pour garantir qu'il ne peut jamais
-- diverger.
create or replace function public.sync_chantier_actif()
returns trigger
language plpgsql
as $$
begin
  new.actif := (new.statut = 'actif');
  return new;
end;
$$;

create trigger sync_chantier_actif_trigger
  before insert or update on public.chantiers
  for each row execute procedure public.sync_chantier_actif();

-- ----------------------------------------------------------------------------
-- 2. RLS chantiers_select (durcie en 003_employe_chantiers.sql) :
--    - remplace actif=true par statut='actif' pour la sélection courante ;
--    - AJOUTE la lecture d'un chantier, quel que soit son statut, dès lors
--      que l'employé possède au moins un pointage dessus. Sans cela, dès
--      qu'un chantier passe à 'termine'/'archive', l'embed chantiers(...)
--      de ses anciens pointages redevient NULL pour l'employé concerné —
--      ce qui casserait "reste présent dans les historiques".
-- ----------------------------------------------------------------------------

drop policy if exists "chantiers_select" on public.chantiers;

create policy "chantiers_select"
  on public.chantiers
  for select
  using (
    public.current_user_role() = 'admin'
    or (
      statut = 'actif'
      and exists (
        select 1
        from public.employe_chantiers ec
        where ec.chantier_id = chantiers.id
          and ec.employe_id = auth.uid()
          and ec.actif = true
      )
    )
    or exists (
      select 1
      from public.pointages p
      where p.chantier_id = chantiers.id
        and p.employe_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. create_pointage : une NOUVELLE arrivée exige statut='actif' (au lieu
--    de actif=true). Aucune autre ligne de la fonction ne change : la
--    branche pause/reprise/départ ne revérifiait déjà pas le statut du
--    chantier, donc clôturer une intervention déjà commencée reste
--    toujours possible même si le chantier est terminé entre-temps.
-- ----------------------------------------------------------------------------

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
    -- Seule une NOUVELLE arrivée doit cibler un chantier au statut
    -- 'actif' et auquel l'employé est affecté. Les actions suivantes
    -- (pause/depart) restent toujours possibles pour clôturer une
    -- intervention déjà commencée, même si le chantier est terminé,
    -- archivé, ou l'affectation retirée entre-temps.
    if not exists (
      select 1 from public.chantiers where id = p_chantier_id and statut = 'actif'
    ) then
      raise exception 'Chantier invalide, terminé ou archivé.';
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
