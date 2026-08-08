-- ============================================================================
-- PointageChantier — Pointage réel (arrivée / départ)
--
-- Objectif : fournir un point d'entrée unique et sûr pour créer un
-- pointage, qui :
--   1. force employe_id = auth.uid() côté base (un employé ne peut jamais
--      fournir un employe_id différent du sien, même en modifiant la
--      requête réseau depuis le navigateur) ;
--   2. valide la séquence arrivée/départ (pas deux arrivées consécutives,
--      pas de départ sans arrivée ouverte, départ toujours sur le même
--      chantier que l'arrivée qu'il clôture) ;
--   3. élimine la race condition du double-clic (deux requêtes quasi
--      simultanées) via un verrou transactionnel par employé.
--
-- Les policies RLS existantes (profiles_select, chantiers_select,
-- pointages_select, pointages_insert_self) ont été auditées et sont déjà
-- correctes pour ce besoin : elles ne sont PAS modifiées par cette
-- migration.
-- ============================================================================

create or replace function public.create_pointage(p_chantier_id uuid, p_type text)
returns public.pointages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe_id uuid := auth.uid();
  v_last public.pointages;
  v_result public.pointages;
begin
  if v_employe_id is null then
    raise exception 'Utilisateur non authentifié.';
  end if;

  if p_type not in ('arrivee', 'depart') then
    raise exception 'Type de pointage invalide : %', p_type;
  end if;

  if p_chantier_id is null then
    raise exception 'Chantier requis.';
  end if;

  -- Verrou transactionnel par employé : toute tentative concurrente pour
  -- le même employé (double-clic, deux onglets) attend la fin de cette
  -- transaction avant de lire le dernier pointage, ce qui empêche deux
  -- arrivées (ou deux départs) d'être acceptés en parallèle. Le verrou
  -- est automatiquement libéré à la fin de la transaction.
  perform pg_advisory_xact_lock(hashtext(v_employe_id::text));

  select * into v_last
  from public.pointages
  where employe_id = v_employe_id
  order by pointe_at desc
  limit 1;

  if p_type = 'arrivee' then
    if v_last.type = 'arrivee' then
      raise exception 'Une arrivée est déjà enregistrée sans départ correspondant.';
    end if;

    -- Seule une NOUVELLE arrivée doit cibler un chantier actif. Un départ
    -- (branche ci-dessous) doit toujours pouvoir clôturer une arrivée
    -- existante, même si le chantier a été désactivé entre-temps.
    if not exists (select 1 from public.chantiers where id = p_chantier_id and actif = true) then
      raise exception 'Chantier invalide ou inactif.';
    end if;
  else
    if v_last.type is null or v_last.type = 'depart' then
      raise exception 'Aucune arrivée ouverte à clôturer.';
    end if;

    if v_last.chantier_id <> p_chantier_id then
      raise exception 'Le départ doit être pointé sur le chantier de l’arrivée en cours.';
    end if;
  end if;

  -- pointe_at n'est jamais fourni par le client : il utilise le DEFAULT
  -- now() de la table, donc l'horodatage vient toujours du serveur.
  insert into public.pointages (employe_id, chantier_id, type)
  values (v_employe_id, p_chantier_id, p_type)
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_pointage(uuid, text) from public;
grant execute on function public.create_pointage(uuid, text) to authenticated;
