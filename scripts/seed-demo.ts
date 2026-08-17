// ============================================================================
// PointageChantier — Seed de démonstration (employés + chantiers + affectations)
//
// Script admin, JAMAIS importé depuis src/ ni servi au frontend : il lit
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY depuis l'environnement (jamais
// codés en dur) et utilise la clé service_role, qui contourne la RLS —
// raison pour laquelle ce fichier ne doit jamais quitter scripts/.
//
// Usage :
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   npm run seed:demo
//
// Idempotent : relancer ce script ne crée aucun doublon (recherche par
// email pour les employés, par nom pour les chantiers, par couple
// employe_id+chantier_id pour les affectations — voir chaque section).
//
// Ne crée ni pointages ni photos : uniquement employés, chantiers et
// affectations, comme demandé pour cette étape du seed de démo.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import type { ChantierStatut } from '../src/types/database.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Variables manquantes. Requises dans l’environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Exemple : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo',
  )
  process.exit(1)
}

// Mot de passe de démonstration partagé par les 6 comptes employés créés
// ci-dessous — documenté dans le rapport de livraison, jamais écrit côté
// frontend (src/).
const DEMO_PASSWORD = 'DemoPointage2026!'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ----------------------------------------------------------------------------
// 1. Données de démonstration
// ----------------------------------------------------------------------------

interface DemoEmploye {
  key: string
  firstName: string
  trade: string
  email: string
}

// Libellé métier stocké dans profiles.full_name : le schéma actuel de
// profiles (001_initial_schema.sql) n'a pas de colonne dédiée au métier —
// audité avant d'écrire ce script (voir src/types/database.ts, Profile).
// Aucune migration n'est ajoutée pour cette mission ; "Prénom — Métier"
// dans full_name est le seul champ existant compatible.
const DEMO_EMPLOYES: DemoEmploye[] = [
  { key: 'lucas', firstName: 'Lucas', trade: 'Maçon', email: 'lucas.demo@pointagechantier.local' },
  { key: 'karim', firstName: 'Karim', trade: 'Électricien', email: 'karim.demo@pointagechantier.local' },
  { key: 'julien', firstName: 'Julien', trade: 'Plombier', email: 'julien.demo@pointagechantier.local' },
  { key: 'nicolas', firstName: 'Nicolas', trade: 'Plaquiste', email: 'nicolas.demo@pointagechantier.local' },
  { key: 'enzo', firstName: 'Enzo', trade: 'Peintre', email: 'enzo.demo@pointagechantier.local' },
  { key: 'thomas', firstName: 'Thomas', trade: "Chef d'équipe", email: 'thomas.demo@pointagechantier.local' },
]

function demoFullName(employe: DemoEmploye): string {
  return `${employe.firstName} — ${employe.trade}`
}

interface DemoChantier {
  key: string
  nom: string
  adresse: string
  ville: string
  latitude: number
  longitude: number
}

// Coordonnées réellement géocodées (Nominatim/OpenStreetMap, requêtes
// "<Ville>, France" le 2026-08-17 — précision niveau ville, suffisante et
// honnête pour un pointage GPS de démonstration ; voir le rapport de
// livraison pour le détail des requêtes). Aucune coordonnée inventée.
const DEMO_CHANTIERS: DemoChantier[] = [
  {
    key: 'villa-oliviers',
    nom: 'Villa des Oliviers',
    adresse: 'Centre-ville',
    ville: 'Istres',
    latitude: 43.5139051,
    longitude: 4.9884323,
  },
  {
    key: 'residence-horizon',
    nom: 'Résidence Horizon',
    adresse: 'Centre-ville',
    ville: 'Martigues',
    latitude: 43.4057279,
    longitude: 5.0548176,
  },
  {
    key: 'maison-pins',
    nom: 'Maison des Pins',
    adresse: 'Miramas-le-Vieux',
    ville: 'Miramas',
    latitude: 43.5632293,
    longitude: 5.0244217,
  },
  {
    key: 'bureaux-nova',
    nom: 'Bureaux Nova',
    adresse: "Zone d'activités",
    ville: 'Fos-sur-Mer',
    latitude: 43.4380714,
    longitude: 4.945595,
  },
]

const RAYON_AUTORISE_M = 100
const DUREE_MAX_MINUTES = 600
const CHANTIER_STATUT: ChantierStatut = 'actif'

const ASSIGNMENTS: Record<string, string[]> = {
  lucas: ['villa-oliviers', 'residence-horizon'],
  karim: ['bureaux-nova', 'villa-oliviers'],
  julien: ['residence-horizon', 'maison-pins'],
  nicolas: ['bureaux-nova', 'residence-horizon'],
  enzo: ['maison-pins', 'bureaux-nova'],
  thomas: ['villa-oliviers', 'residence-horizon', 'maison-pins', 'bureaux-nova'],
}

// ----------------------------------------------------------------------------
// 2. Employés — comptes Auth (Admin API) + profiles
// ----------------------------------------------------------------------------

async function fetchExistingAuthUsersByEmail(): Promise<Map<string, string>> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`Impossible de lister les comptes Auth existants : ${error.message}`)

  const byEmail = new Map<string, string>()
  for (const user of data.users) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user.id)
  }
  return byEmail
}

async function seedEmployes(): Promise<{ ids: Record<string, string>; created: number; existing: number }> {
  const existingByEmail = await fetchExistingAuthUsersByEmail()
  const ids: Record<string, string> = {}
  let created = 0
  let existing = 0

  for (const employe of DEMO_EMPLOYES) {
    const existingId = existingByEmail.get(employe.email.toLowerCase())
    let userId: string

    if (existingId) {
      // Compte déjà existant : on réaligne uniquement le mot de passe de
      // démo (jamais l'email), pour garantir un login fonctionnel même
      // après plusieurs passages du script.
      const { error } = await supabase.auth.admin.updateUserById(existingId, { password: DEMO_PASSWORD })
      if (error) throw new Error(`Échec mise à jour mot de passe pour ${employe.email} : ${error.message}`)
      userId = existingId
      existing += 1
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: employe.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: demoFullName(employe) },
      })
      if (error) throw new Error(`Échec création du compte ${employe.email} : ${error.message}`)
      if (!data.user) throw new Error(`Création du compte ${employe.email} : aucun utilisateur retourné.`)
      userId = data.user.id
      created += 1
    }

    // Réaffirme systématiquement le profil (les deux branches ci-dessus) :
    // le trigger handle_new_user ne s'exécute qu'à la création du compte
    // Auth, donc sur un compte déjà existant le libellé de démo ne serait
    // jamais mis à jour sans cette étape explicite.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: demoFullName(employe), role: 'employe' })
      .eq('id', userId)
    if (profileError) throw new Error(`Échec mise à jour du profil pour ${employe.email} : ${profileError.message}`)

    ids[employe.key] = userId
  }

  return { ids, created, existing }
}

// ----------------------------------------------------------------------------
// 3. Chantiers
// ----------------------------------------------------------------------------

async function seedChantiers(): Promise<{ ids: Record<string, string>; created: number; existing: number }> {
  const { data: existingRows, error: fetchError } = await supabase
    .from('chantiers')
    .select('id, nom')
    .in(
      'nom',
      DEMO_CHANTIERS.map((c) => c.nom),
    )
  if (fetchError) throw new Error(`Impossible de lire les chantiers existants : ${fetchError.message}`)

  const existingByNom = new Map<string, string>((existingRows ?? []).map((row) => [row.nom, row.id]))
  const ids: Record<string, string> = {}
  let created = 0
  let existing = 0

  for (const chantier of DEMO_CHANTIERS) {
    const fields = {
      adresse: chantier.adresse,
      ville: chantier.ville,
      latitude: chantier.latitude,
      longitude: chantier.longitude,
      rayon_autorise: RAYON_AUTORISE_M,
      duree_max_intervention_minutes: DUREE_MAX_MINUTES,
      statut: CHANTIER_STATUT,
    }

    const existingId = existingByNom.get(chantier.nom)
    if (existingId) {
      const { error } = await supabase.from('chantiers').update(fields).eq('id', existingId)
      if (error) throw new Error(`Échec mise à jour du chantier "${chantier.nom}" : ${error.message}`)
      ids[chantier.key] = existingId
      existing += 1
    } else {
      const { data, error } = await supabase.from('chantiers').insert({ nom: chantier.nom, ...fields }).select('id').single()
      if (error) throw new Error(`Échec création du chantier "${chantier.nom}" : ${error.message}`)
      ids[chantier.key] = (data as { id: string }).id
      created += 1
    }
  }

  return { ids, created, existing }
}

// ----------------------------------------------------------------------------
// 4. Affectations employe_chantiers
// ----------------------------------------------------------------------------

async function seedAffectations(
  employeIds: Record<string, string>,
  chantierIds: Record<string, string>,
): Promise<{ created: number; existing: number }> {
  const pairs: Array<{ employe_id: string; chantier_id: string }> = []
  for (const [employeKey, chantierKeys] of Object.entries(ASSIGNMENTS)) {
    for (const chantierKey of chantierKeys) {
      pairs.push({ employe_id: employeIds[employeKey], chantier_id: chantierIds[chantierKey] })
    }
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from('employe_chantiers')
    .select('employe_id, chantier_id')
    .in('employe_id', Object.values(employeIds))
  if (fetchError) throw new Error(`Impossible de lire les affectations existantes : ${fetchError.message}`)

  const existingKeys = new Set((existingRows ?? []).map((row) => `${row.employe_id}:${row.chantier_id}`))
  const created = pairs.filter((pair) => !existingKeys.has(`${pair.employe_id}:${pair.chantier_id}`)).length
  const existing = pairs.length - created

  const { error: upsertError } = await supabase
    .from('employe_chantiers')
    .upsert(
      pairs.map((pair) => ({ ...pair, actif: true })),
      { onConflict: 'employe_id,chantier_id' },
    )
  if (upsertError) throw new Error(`Échec écriture des affectations : ${upsertError.message}`)

  return { created, existing }
}

// ----------------------------------------------------------------------------
// 5. Exécution
// ----------------------------------------------------------------------------

async function main() {
  console.log(`Cible : ${SUPABASE_URL}`)
  console.log('Seed de démonstration PointageChantier — démarrage...\n')

  const employes = await seedEmployes()
  const chantiers = await seedChantiers()
  const affectations = await seedAffectations(employes.ids, chantiers.ids)

  console.log('Résumé')
  console.log('------')
  console.log(`Employés créés : ${employes.created}`)
  console.log(`Employés existants : ${employes.existing}`)
  console.log(`Chantiers créés : ${chantiers.created}`)
  console.log(`Chantiers existants : ${chantiers.existing}`)
  console.log(`Affectations créées : ${affectations.created}`)
  console.log(`Affectations existantes : ${affectations.existing}`)

  console.log('\nComptes de connexion de démonstration (mot de passe commun ci-dessous) :')
  for (const employe of DEMO_EMPLOYES) {
    console.log(`  ${employe.email}  —  ${demoFullName(employe)}`)
  }
  console.log(`\nMot de passe de démonstration : ${DEMO_PASSWORD}`)
  console.log('\nAucun pointage ni photo n’a été créé par ce script.')
}

main().catch((error: unknown) => {
  console.error('\nÉchec du seed de démonstration :', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
