import { supabase } from '../lib/supabase'
import type { Chantier, EmployeChantier } from '../types/database'
import type { ServiceResult } from './chantierService'

/**
 * Chantiers au statut 'actif' auxquels un employé est affecté (RLS
 * chantiers_select applique la même règle côté base pour la sélection
 * courante). Un chantier terminé ou archivé n'apparaît plus ici, même
 * s'il reste affecté — c'est le comportement attendu : il devient
 * indisponible pour une NOUVELLE arrivée, sans jamais toucher à
 * l'historique existant.
 */
export async function listAssignedActiveChantiers(employeId: string): Promise<ServiceResult<Chantier[]>> {
  const { data: assignments, error: assignError } = await supabase
    .from('employe_chantiers')
    .select('chantier_id')
    .eq('employe_id', employeId)
    .eq('actif', true)

  if (assignError) {
    return { data: [], error: assignError.message }
  }

  const chantierIds = (assignments ?? []).map((row) => row.chantier_id as string)
  if (chantierIds.length === 0) {
    return { data: [], error: null }
  }

  const { data: chantiers, error: chantiersError } = await supabase
    .from('chantiers')
    .select('*')
    .in('id', chantierIds)
    .eq('statut', 'actif')
    .order('nom', { ascending: true })

  if (chantiersError) {
    return { data: [], error: chantiersError.message }
  }

  return { data: (chantiers ?? []) as Chantier[], error: null }
}

/** Toutes les affectations (actives ou non) d'un chantier — usage admin. */
export async function listAssignmentsForChantier(chantierId: string): Promise<ServiceResult<EmployeChantier[]>> {
  const { data, error } = await supabase
    .from('employe_chantiers')
    .select('employe_id, chantier_id, actif, created_at')
    .eq('chantier_id', chantierId)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as EmployeChantier[], error: null }
}

/**
 * Toutes les affectations (actives ou non) d'un employé — miroir de
 * listAssignmentsForChantier ci-dessus, utilisé par la page Employés
 * admin (panneau "Gérer") pour pré-cocher les chantiers déjà affectés.
 */
export async function listAssignmentsForEmploye(employeId: string): Promise<ServiceResult<EmployeChantier[]>> {
  const { data, error } = await supabase
    .from('employe_chantiers')
    .select('employe_id, chantier_id, actif, created_at')
    .eq('employe_id', employeId)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as EmployeChantier[], error: null }
}

/**
 * Nombre d'employés actuellement affectés (actif=true) à chaque chantier,
 * en une seule requête groupée plutôt qu'un appel par chantier — utilisé
 * pour l'affichage compact des cartes de la page Chantiers admin.
 */
export async function listActiveAssignmentCounts(): Promise<ServiceResult<Map<string, number>>> {
  const { data, error } = await supabase.from('employe_chantiers').select('chantier_id').eq('actif', true)

  if (error) {
    return { data: new Map(), error: error.message }
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const chantierId = row.chantier_id as string
    counts.set(chantierId, (counts.get(chantierId) ?? 0) + 1)
  }

  return { data: counts, error: null }
}

/**
 * Nombre de chantiers actifs actuellement affectés (actif=true), par
 * employé — miroir de listActiveAssignmentCounts ci-dessus (groupé par
 * chantier_id), utilisé pour l'affichage compact des cartes de la page
 * Employés admin ("Chantiers affectés : X chantiers").
 */
export async function listActiveAssignmentCountsByEmploye(): Promise<ServiceResult<Map<string, number>>> {
  const { data, error } = await supabase.from('employe_chantiers').select('employe_id').eq('actif', true)

  if (error) {
    return { data: new Map(), error: error.message }
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const employeId = row.employe_id as string
    counts.set(employeId, (counts.get(employeId) ?? 0) + 1)
  }

  return { data: counts, error: null }
}

/** Crée ou met à jour l'affectation employé/chantier (admin uniquement, RLS l'impose). */
export async function setAssignment(
  employeId: string,
  chantierId: string,
  actif: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('employe_chantiers')
    .upsert({ employe_id: employeId, chantier_id: chantierId, actif }, { onConflict: 'employe_id,chantier_id' })

  return { error: error?.message ?? null }
}
