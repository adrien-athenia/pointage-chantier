// supabase/functions/invite-employe/index.ts
//
// Invite un nouvel employé (rôle "employe" uniquement) depuis
// PointageChantier, sans jamais exposer la clé service_role au frontend.
//
// Sécurité :
// - l'appelant est identifié à partir de son JWT (Authorization header),
//   jamais depuis une valeur envoyée dans le corps de la requête ;
// - son rôle est relu dans public.profiles (source de vérité en base),
//   jamais fait confiance depuis le client ;
// - seule cette fonction, exécutée côté serveur, détient
//   SUPABASE_SERVICE_ROLE_KEY. Elle n'est jamais renvoyée ni journalisée.
//
// Le rôle du nouvel utilisateur est TOUJOURS 'employe' : il n'existe
// aucun chemin dans ce fichier permettant de créer un admin.
//
// Le lien envoyé par inviteUserByEmail redirige vers `${APP_URL}/set-password`
// (APP_URL = secret serveur, jamais un domaine en dur ni une variable
// VITE_*) où l'employé définit son mot de passe.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_CHECK_ATTEMPTS = 5
const PROFILE_CHECK_DELAY_MS = 300

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const APP_URL = Deno.env.get('APP_URL')

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[invite-employe] variables d’environnement Supabase manquantes.')
    return jsonResponse({ error: 'Configuration serveur incomplète.' }, 500)
  }

  // APP_URL (secret custom, à définir via `supabase secrets set`) pilote
  // le lien de redirection de l'email d'invitation vers /set-password.
  // Jamais de domaine en dur : sans ce secret, on refuse plutôt que
  // d'envoyer un lien d'invitation cassé.
  if (!APP_URL) {
    console.error('[invite-employe] variable d’environnement APP_URL manquante.')
    return jsonResponse({ error: 'Configuration serveur incomplète (APP_URL manquant).' }, 500)
  }

  const redirectTo = `${APP_URL.replace(/\/+$/, '')}/set-password`

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Authentification requise.' }, 401)
  }

  // Client borné à l'appelant : clé anon + JWT reçu. Sert uniquement à
  // vérifier QUI appelle et QUEL est son rôle réel en base (RLS
  // profiles_select autorise la lecture de sa propre ligne).
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser()

  if (callerError || !caller) {
    return jsonResponse({ error: 'Authentification invalide.' }, 401)
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Réservé aux administrateurs.' }, 403)
  }

  let payload: { fullName?: unknown; email?: unknown }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Corps de requête invalide.' }, 400)
  }

  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''

  if (!fullName) {
    return jsonResponse({ error: 'Le nom complet est obligatoire.' }, 400)
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse({ error: 'Adresse email invalide.' }, 400)
  }

  // Client Admin : seule cette fonction, côté serveur, détient la clé
  // service_role. persistSession/autoRefreshToken désactivés car cette
  // fonction est sans état (une requête = une exécution).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  })

  if (inviteError) {
    const message = inviteError.message ?? ''
    const alreadyExists =
      inviteError.status === 422 || /already registered|already exists|already been registered/i.test(message)

    if (alreadyExists) {
      return jsonResponse({ error: 'Un compte existe déjà avec cet email.' }, 409)
    }

    console.error('[invite-employe] échec inviteUserByEmail', inviteError)
    return jsonResponse(
      { error: "Échec de l'invitation. Vérifiez la configuration email de Supabase et réessayez." },
      500,
    )
  }

  const newUserId = inviteData.user?.id
  if (!newUserId) {
    console.error('[invite-employe] réponse inattendue de inviteUserByEmail (id manquant)')
    return jsonResponse({ error: 'Réponse inattendue du serveur.' }, 500)
  }

  // Le trigger public.handle_new_user() (001_initial_schema.sql) crée déjà
  // automatiquement la ligne profiles (role='employe', full_name issu des
  // métadonnées) à l'insertion dans auth.users. On ne la recrée jamais
  // ici : on vérifie seulement qu'elle est bien arrivée avec les bonnes
  // valeurs, avec quelques tentatives en cas de léger délai de
  // propagation, et on corrige uniquement si nécessaire.
  let profile: { id: string; email: string | null; full_name: string | null; role: string } | null = null

  for (let attempt = 0; attempt < PROFILE_CHECK_ATTEMPTS && !profile; attempt++) {
    if (attempt > 0) {
      await delay(PROFILE_CHECK_DELAY_MS)
    }
    const { data } = await adminClient
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', newUserId)
      .maybeSingle()
    if (data) profile = data
  }

  if (!profile) {
    console.error('[invite-employe] profil introuvable après invitation pour', newUserId)
    return jsonResponse(
      {
        error:
          "L'invitation a été envoyée, mais son profil n'a pas pu être confirmé dans le délai imparti. Rafraîchissez la liste des employés dans quelques instants.",
      },
      500,
    )
  }

  if (profile.full_name !== fullName || profile.role !== 'employe') {
    const { data: fixed, error: fixError } = await adminClient
      .from('profiles')
      .update({ full_name: fullName, role: 'employe' })
      .eq('id', newUserId)
      .select('id, email, full_name, role')
      .single()

    if (!fixError && fixed) {
      profile = fixed
    }
  }

  return jsonResponse(
    {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    },
    201,
  )
})
