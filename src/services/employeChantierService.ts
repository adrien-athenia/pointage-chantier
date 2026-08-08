import { supabase } from '../lib/supabase'
import type { Chantier, EmployeChantier } from '../types/database'
import type { ServiceResult } from './chantierService'

/**
 * Chantiers actifs auxquels un employé est affecté (RLS chantiers_select
 * applique la même règle côté base : cette requête ne fait qu'exposer ce
 * que l'employé peut de toute façon déjà lire).
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
    .eq('actif', true)
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
