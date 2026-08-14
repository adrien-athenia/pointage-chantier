// ============================================================================
// PointageChantier — Création des comptes Auth DEMO (API Admin Supabase)
//
// RÉSERVÉ AU PROJET SUPABASE DEMO (PointageChantier-DEMO, ref
// vapuxqlqchfdwltjkmma). Ne jamais lancer ce script avec les identifiants
// du projet PROD : le garde-fou ci-dessous vérifie l'URL avant toute
// création, mais reste vigilant sur les variables que vous fournissez.
//
// Usage (les 3 variables sont lues exclusivement depuis l'environnement,
// jamais codées en dur ici) :
//
//   SUPABASE_DEMO_URL=https://vapuxqlqchfdwltjkmma.supabase.co \
//   SUPABASE_DEMO_SERVICE_ROLE_KEY=... \
//   DEMO_USER_PASSWORD=... \
//   node scripts/create-demo-users.mjs
//
// Relançable sans risque :
//   - compte absent   -> création (comportement inchangé) -> "CRÉÉ".
//   - compte existant -> son mot de passe est réinitialisé à
//     DEMO_USER_PASSWORD via auth.admin.updateUserById(), sans toucher à
//     son email ni à ses autres données -> "MOT DE PASSE MIS À JOUR".
// ============================================================================

import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT_REF = 'vapuxqlqchfdwltjkmma' // PointageChantier-DEMO — uniquement

const SUPABASE_DEMO_URL = process.env.SUPABASE_DEMO_URL
const SUPABASE_DEMO_SERVICE_ROLE_KEY = process.env.SUPABASE_DEMO_SERVICE_ROLE_KEY
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD

if (!SUPABASE_DEMO_URL || !SUPABASE_DEMO_SERVICE_ROLE_KEY || !DEMO_USER_PASSWORD) {
  console.error(
    'Variables manquantes. Requises dans l’environnement : SUPABASE_DEMO_URL, SUPABASE_DEMO_SERVICE_ROLE_KEY, DEMO_USER_PASSWORD.',
  )
  process.exit(1)
}

// ----------------------------------------------------------------------------
// Garde-fou : l'URL fournie doit correspondre exactement au projet DEMO.
// Si elle pointe vers un autre projet (notamment PROD), on s'arrête avant
// toute création de compte.
// ----------------------------------------------------------------------------

let hostname
try {
  hostname = new URL(SUPABASE_DEMO_URL).hostname
} catch {
  console.error(`SUPABASE_DEMO_URL invalide : "${SUPABASE_DEMO_URL}"`)
  process.exit(1)
}

if (hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  console.error(
    `Arrêt : SUPABASE_DEMO_URL ("${hostname}") ne correspond pas au projet DEMO attendu ` +
      `("${EXPECTED_PROJECT_REF}.supabase.co"). Aucun compte n'a été créé.`,
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_DEMO_URL, SUPABASE_DEMO_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Les mêmes 7 comptes que ceux attendus par supabase/seeds/demo.sql.
// full_name est repris tel quel par le trigger handle_new_user()
// (raw_user_meta_data ->> 'full_name') pour peupler profiles.full_name ;
// demo.sql le réaffirme ensuite explicitement et fixe le rôle admin.
const DEMO_USERS = [
  { email: 'admin.demo@athenia-demo.fr', firstName: 'Admin', lastName: 'Démo' },
  { email: 'lucas.martin@athenia-demo.fr', firstName: 'Lucas', lastName: 'Martin' },
  { email: 'enzo.bernard@athenia-demo.fr', firstName: 'Enzo', lastName: 'Bernard' },
  { email: 'julien.garcia@athenia-demo.fr', firstName: 'Julien', lastName: 'Garcia' },
  { email: 'thomas.roux@athenia-demo.fr', firstName: 'Thomas', lastName: 'Roux' },
  { email: 'mehdi.benali@athenia-demo.fr', firstName: 'Mehdi', lastName: 'Benali' },
  { email: 'hugo.morel@athenia-demo.fr', firstName: 'Hugo', lastName: 'Morel' },
]

function isAlreadyRegisteredError(error) {
  if (!error) return false
  const code = 'code' in error ? error.code : undefined
  const message = error.message ?? ''
  return code === 'email_exists' || /already been registered|already exists/i.test(message)
}

// Construit une correspondance email -> user.id pour les comptes déjà
// présents sur le projet, en une seule liste (le nombre de comptes d'un
// projet démo reste très faible : une page suffit, pas besoin de paginer).
async function fetchExistingUsersByEmail() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })

  if (error) {
    throw new Error(`Impossible de lister les utilisateurs existants : ${error.message}`)
  }

  const byEmail = new Map()
  for (const u of data.users) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
  }
  return byEmail
}

async function main() {
  console.log(`Projet cible vérifié : ${hostname}`)
  console.log(`Traitement de ${DEMO_USERS.length} comptes démo...\n`)

  const existingByEmail = await fetchExistingUsersByEmail()

  let created = 0
  let updated = 0
  let failed = 0

  for (const user of DEMO_USERS) {
    const fullName = `${user.firstName} ${user.lastName}`
    const existingId = existingByEmail.get(user.email.toLowerCase())

    if (existingId) {
      // Compte déjà existant : on réinitialise uniquement son mot de
      // passe (aucun champ email/user_metadata envoyé, donc rien d'autre
      // n'est modifié).
      const { error } = await supabase.auth.admin.updateUserById(existingId, {
        password: DEMO_USER_PASSWORD,
      })

      if (error) {
        console.error(`ÉCHEC (maj)              — ${user.email} : ${error.message}`)
        failed += 1
      } else {
        console.log(`MOT DE PASSE MIS À JOUR  — ${user.email} (id: ${existingId})`)
        updated += 1
      }
      continue
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_USER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: user.firstName,
        last_name: user.lastName,
      },
    })

    if (error) {
      // Cas limite (compte créé entre le listUsers() ci-dessus et cet
      // appel) : traité comme un échec explicite plutôt qu'ignoré, pour
      // ne pas laisser croire à tort que le mot de passe a été mis à jour.
      if (isAlreadyRegisteredError(error)) {
        console.error(
          `ÉCHEC (course)           — ${user.email} : compte créé entre-temps, relancez le script.`,
        )
      } else {
        console.error(`ÉCHEC (création)         — ${user.email} : ${error.message}`)
      }
      failed += 1
      continue
    }

    console.log(`CRÉÉ                     — ${user.email} (id: ${data.user?.id})`)
    created += 1
  }

  console.log(`\nRésumé : ${created} créé(s), ${updated} mot(s) de passe mis à jour, ${failed} échec(s).`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main()
