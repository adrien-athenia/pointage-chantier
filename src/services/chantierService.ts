import { supabase } from '../lib/supabase'
import type { Chantier } from '../types/database'

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
    .eq('actif', true)
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
  actif: boolean
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
    actif: input.actif,
  }
}

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
