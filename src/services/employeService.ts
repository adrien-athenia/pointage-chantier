import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'
import type { ServiceResult } from './chantierService'

export async function listEmployeeProfiles(): Promise<ServiceResult<Profile[]>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'employe')
    .order('full_name', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export async function listAllProfiles(): Promise<ServiceResult<Profile[]>> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}
