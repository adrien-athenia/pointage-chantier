import { supabase } from '../lib/supabase'
import type { Chantier, ChantierStatut } from '../types/database'

export interface ServiceResult<T> {
  data: T
  error: string | null
}

export async function listChantiers(): Promise<ServiceResult<Chantier[]>> {
  const { data, error } = await supabase.from('chantiers').select('*').order('nom', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export async function listActiveChantiers(): Promise<ServiceResult<Chantier[]>> {
  const { data, error } = await supabase
    .from('chantiers')
    .select('*')
    .eq('statut', 'actif')
    .order('nom', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export interface ChantierInput {
  nom: string
  adresse: string | null
  ville: string | null
  latitude: number | null
  longitude: number | null
  rayonAutorise: number
  dureeMaxInterventionMinutes: number | null
}

function toRow(input: ChantierInput) {
  return {
    nom: input.nom,
    adresse: input.adresse,
    ville: input.ville,
    latitude: input.latitude,
    longitude: input.longitude,
    rayon_autorise: input.rayonAutorise,
    duree_max_intervention_minutes: input.dureeMaxInterventionMinutes,
  }
}

// Un nouveau chantier démarre toujours au statut par défaut de la
// colonne ('actif') : aucun champ de cycle de vie n'est exposé dans le
// formulaire de création/édition. "Terminer" est l'action normale pour
// clore un chantier (voir setChantierStatut ci-dessous), pas une case à
// cocher générique.
export async function createChantier(input: ChantierInput): Promise<ServiceResult<Chantier | null>> {
  const { data, error } = await supabase.from('chantiers').insert(toRow(input)).select('*').single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Chantier, error: null }
}

export async function updateChantier(id: string, input: ChantierInput): Promise<ServiceResult<Chantier | null>> {
  const { data, error } = await supabase.from('chantiers').update(toRow(input)).eq('id', id).select('*').single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Chantier, error: null }
}

/**
 * Change le statut du cycle de vie d'un chantier (Terminer / Archiver /
 * Restaurer). `actif` est automatiquement recalculé côté base par le
 * trigger sync_chantier_actif — jamais écrit directement ici. Protégé
 * par la policy RLS chantiers_update_admin existante (admin uniquement).
 */
export async function setChantierStatut(id: string, statut: ChantierStatut): Promise<ServiceResult<Chantier | null>> {
  const { data, error } = await supabase.from('chantiers').update({ statut }).eq('id', id).select('*').single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Chantier, error: null }
}

export interface DeleteChantierResult {
  success: boolean
  error: string | null
}

/**
 * Suppression définitive. Protégée par deux couches indépendantes :
 * la policy RLS chantiers_delete_admin (admin uniquement), et la
 * contrainte de clé étrangère `pointages.chantier_id` (sans cascade),
 * qui fait refuser la suppression par PostgreSQL lui-même (code erreur
 * 23503) dès qu'un pointage référence encore ce chantier. Les
 * affectations employe_chantiers, elles, sont en cascade : un chantier
 * jamais pointé peut être supprimé même s'il a été affecté à des
 * employés sans qu'aucun n'ait travaillé dessus.
 */
export async function deleteChantier(id: string): Promise<DeleteChantierResult> {
  const { error } = await supabase.from('chantiers').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return {
        success: false,
        error:
          'Ce chantier possède un historique de pointage et ne peut pas être supprimé. Archivez-le pour conserver les heures et l’historique.',
      }
    }
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}
