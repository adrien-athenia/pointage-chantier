import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile, signInWithPassword, signOutUser } from '../services/authService'
import type { Profile, UserRole } from '../types/database'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // --- Session ------------------------------------------------------------
  // Reste strictement synchrone : aucun appel supabase awaité ici, pour ne
  // jamais concourir avec le verrou interne du client pendant le
  // traitement d'un événement d'auth.
  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      if (import.meta.env.DEV) {
        console.debug('[useAuth] getSession() ->', session?.user?.id ?? null, session?.user?.email ?? null)
      }
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      if (import.meta.env.DEV) {
        console.debug('[useAuth] onAuthStateChange', event, session?.user?.id ?? null, session?.user?.email ?? null)
      }
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // --- Profile --------------------------------------------------------------
  // Effet séparé, déclenché uniquement par l'id utilisateur (pas par
  // l'objet session, qui change à chaque refresh de token). try/catch/finally
  // garantit que profileLoading repasse toujours à false, succès ou échec :
  // aucun état "Chargement…" ne doit rester bloqué indéfiniment.
  useEffect(() => {
    const userId = user?.id

    if (!userId) {
      setProfile(null)
      setProfileError(null)
      setProfileLoading(false)
      return
    }

    let isMounted = true
    setProfileLoading(true)
    setProfileError(null)

    if (import.meta.env.DEV) {
      console.debug('[useAuth] chargement du profil pour', userId)
    }

    fetchProfile(userId)
      .then(({ profile: nextProfile, error }) => {
        if (!isMounted) return
        if (error) {
          console.error('[useAuth] échec du chargement du profil :', error)
          setProfile(null)
          setProfileError(error)
        } else {
          setProfile(nextProfile)
          setProfileError(null)
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement du profil.'
        console.error('[useAuth] exception inattendue lors du chargement du profil :', err)
        setProfile(null)
        setProfileError(message)
      })
      .finally(() => {
        if (isMounted) setProfileLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [user?.id, refreshKey])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.debug('[useAuth] état', {
      authLoading,
      profileLoading,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      role: profile?.role ?? null,
      profileError,
    })
  }, [authLoading, profileLoading, user, profile, profileError])

  async function signIn(email: string, password: string) {
    const { error } = await signInWithPassword(email, password)
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await signOutUser()
  }

  const refreshProfile = useCallback(() => {
    setRefreshKey((key) => key + 1)
  }, [])

  const value: AuthContextValue = {
    user,
    profile,
    role: profile?.role ?? null,
    loading: authLoading || profileLoading,
    error: profileError,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.')
  }
  return ctx
}
