import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface InviteEmployeInput {
  fullName: string
  email: string
}

export interface InvitedProfile {
  id: string
  email: string | null
  full_name: string | null
  role: string
}

export interface InviteEmployeResult {
  data: InvitedProfile | null
  error: string | null
}

/**
 * Invite un nouvel employé via l'Edge Function `invite-employe`.
 * Aucune clé privilégiée n'est manipulée ici : le client envoie
 * simplement le JWT de la session admin en cours (ajouté automatiquement
 * par supabase-js), et c'est la fonction serveur qui effectue la
 * création réelle via l'API Admin Supabase.
 */
export async function inviteEmploye({ fullName, email }: InviteEmployeInput): Promise<InviteEmployeResult> {
  const { data, error } = await supabase.functions.invoke('invite-employe', {
    body: { fullName, email },
  })

  if (error) {
    let message = error.message ?? 'Échec de l’invitation.'

    // FunctionsHttpError expose la réponse JSON réelle renvoyée par la
    // fonction (ex. { error: "Un compte existe déjà avec cet email." })
    // via error.context — c'est le pattern documenté par supabase-js.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (body && typeof body.error === 'string') {
          message = body.error
        }
      } catch {
        // Corps non-JSON : on conserve error.message.
      }
    }

    if (import.meta.env.DEV) {
      console.error('[adminEmployeService.inviteEmploye] erreur', error)
    }

    return { data: null, error: message }
  }

  return { data: (data as InvitedProfile) ?? null, error: null }
}
