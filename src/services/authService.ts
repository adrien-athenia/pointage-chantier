import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export interface FetchProfileResult {
  profile: Profile | null
  error: string | null
}

const PROFILE_FETCH_TIMEOUT_MS = 8000

// Garde-fou : si la requête Supabase ne se résout jamais (verrou interne
// du client bloqué, réseau coupé, etc.), on force une issue explicite
// après quelques secondes plutôt que de laisser l'appelant attendre
// indéfiniment.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} : aucune réponse de Supabase après ${ms}ms (timeout).`))
    }, ms)

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export async function fetchProfile(userId: string): Promise<FetchProfileResult> {
  try {
    const request = supabase.from('profiles').select('*').eq('id', userId).single()
    const { data, error } = await withTimeout(request, PROFILE_FETCH_TIMEOUT_MS, 'fetchProfile(profiles)')

    if (import.meta.env.DEV) {
      console.debug('[authService.fetchProfile] requête profiles.select("*").eq("id", userId).single()', {
        userId,
        data,
        error,
      })
    }

    if (error) {
      return { profile: null, error: error.message }
    }

    return { profile: data as Profile, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement du profil.'
    if (import.meta.env.DEV) {
      console.error('[authService.fetchProfile] exception', { userId, err })
    }
    return { profile: null, error: message }
  }
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export function signOutUser() {
  return supabase.auth.signOut()
}
