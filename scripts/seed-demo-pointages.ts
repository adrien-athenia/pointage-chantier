// ============================================================================
// PointageChantier — Seed d'historique de pointages de démonstration
//
// Script admin, JAMAIS importé depuis src/ ni servi au frontend : il lit
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY depuis l'environnement (jamais
// codés en dur) et écrit DIRECTEMENT dans public.pointages avec la clé
// service_role.
//
// Pourquoi un INSERT direct et pas create_pointage() : cette RPC est conçue
// pour un pointage réel en temps réel (elle utilise l'heure serveur et une
// machine à états basée sur "le dernier pointage de l'employé"). Elle ne
// permet pas de fabriquer un historique à des dates passées. L'écriture
// directe ci-dessous respecte exactement le même schéma et les mêmes
// contraintes que la RPC (colonnes, plages latitude/longitude/précision,
// valeurs de `type`) sans les détourner.
//
// Portée stricte : uniquement les 6 employés et 4 chantiers créés par
// scripts/seed-demo.ts, uniquement des pointages entre le 03/08/2026 et le
// 14/08/2026 inclus. Ne touche jamais aux anciennes données de test
// ("adrien test", anciens chantiers) ni à aucun autre pointage.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo:pointages
// ============================================================================

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Variables manquantes. Requises dans l’environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Exemple : SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo:pointages',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ----------------------------------------------------------------------------
// 1. Identités de démonstration — mêmes clés que scripts/seed-demo.ts.
//    Ce script ne CRÉE aucun employé ni chantier : il les recherche (par
//    email / par nom) et échoue clairement si l'un d'eux est introuvable,
//    plutôt que d'en fabriquer un nouveau.
// ----------------------------------------------------------------------------

type EmployeKey = 'lucas' | 'karim' | 'julien' | 'nicolas' | 'enzo' | 'thomas'
type ChantierKey = 'villa-oliviers' | 'residence-horizon' | 'maison-pins' | 'bureaux-nova'

const EMPLOYE_EMAILS: Record<EmployeKey, string> = {
  lucas: 'lucas.demo@pointagechantier.local',
  karim: 'karim.demo@pointagechantier.local',
  julien: 'julien.demo@pointagechantier.local',
  nicolas: 'nicolas.demo@pointagechantier.local',
  enzo: 'enzo.demo@pointagechantier.local',
  thomas: 'thomas.demo@pointagechantier.local',
}

const CHANTIER_NOMS: Record<ChantierKey, string> = {
  'villa-oliviers': 'Villa des Oliviers',
  'residence-horizon': 'Résidence Horizon',
  'maison-pins': 'Maison des Pins',
  'bureaux-nova': 'Bureaux Nova',
}

// ----------------------------------------------------------------------------
// 2. Planning déterministe (03/08/2026 → 14/08/2026, lundi-vendredi
//    uniquement). Semaine 1 fournie telle quelle ; semaine 2 est une
//    évolution cohérente respectant les métiers/affectations existantes
//    (voir le rapport de livraison pour le détail).
// ----------------------------------------------------------------------------

const SCHEDULE: Record<string, Record<EmployeKey, ChantierKey>> = {
  '2026-08-03': {
    lucas: 'villa-oliviers', karim: 'bureaux-nova', julien: 'residence-horizon',
    nicolas: 'bureaux-nova', enzo: 'maison-pins', thomas: 'villa-oliviers',
  },
  '2026-08-04': {
    lucas: 'villa-oliviers', karim: 'bureaux-nova', julien: 'residence-horizon',
    nicolas: 'bureaux-nova', enzo: 'maison-pins', thomas: 'residence-horizon',
  },
  '2026-08-05': {
    lucas: 'villa-oliviers', karim: 'villa-oliviers', julien: 'maison-pins',
    nicolas: 'bureaux-nova', enzo: 'maison-pins', thomas: 'bureaux-nova',
  },
  '2026-08-06': {
    lucas: 'residence-horizon', karim: 'villa-oliviers', julien: 'maison-pins',
    nicolas: 'residence-horizon', enzo: 'bureaux-nova', thomas: 'maison-pins',
  },
  '2026-08-07': {
    lucas: 'residence-horizon', karim: 'villa-oliviers', julien: 'maison-pins',
    nicolas: 'residence-horizon', enzo: 'bureaux-nova', thomas: 'villa-oliviers',
  },
  '2026-08-10': {
    lucas: 'residence-horizon', karim: 'bureaux-nova', julien: 'maison-pins',
    nicolas: 'bureaux-nova', enzo: 'bureaux-nova', thomas: 'maison-pins',
  },
  '2026-08-11': {
    lucas: 'residence-horizon', karim: 'villa-oliviers', julien: 'maison-pins',
    nicolas: 'residence-horizon', enzo: 'bureaux-nova', thomas: 'bureaux-nova',
  },
  '2026-08-12': {
    lucas: 'villa-oliviers', karim: 'villa-oliviers', julien: 'residence-horizon',
    nicolas: 'bureaux-nova', enzo: 'maison-pins', thomas: 'residence-horizon',
  },
  '2026-08-13': {
    lucas: 'villa-oliviers', karim: 'bureaux-nova', julien: 'residence-horizon',
    nicolas: 'residence-horizon', enzo: 'maison-pins', thomas: 'villa-oliviers',
  },
  '2026-08-14': {
    lucas: 'villa-oliviers', karim: 'bureaux-nova', julien: 'maison-pins',
    nicolas: 'residence-horizon', enzo: 'bureaux-nova', thomas: 'bureaux-nova',
  },
}

const WEEKDAYS = Object.keys(SCHEDULE).sort()

// Les 3 cas de contrôle demandés — exclusivement ceux-ci, aucun autre.
// Les 3 interventions restent clôturées (arrivee → pause → depart) : aucune
// n'est laissée ouverte, pour que le Dashboard et les exports Excel ne
// passent jamais par computeLiveMinutes sur une intervention du passé.
const GPS_IMPRECIS_CASE = { date: '2026-08-05', employe: 'karim' as EmployeKey }
const HORS_ZONE_CASE = { date: '2026-08-12', employe: 'enzo' as EmployeKey }
// Localisation indisponible sur l'événement "depart" uniquement (règle
// gps-indisponible existante d'anomalies.ts : latitude/longitude null sur
// au moins un événement) — remplace l'ancien cas "départ manquant", qui
// laissait l'intervention ouverte.
const GPS_INDISPONIBLE_CASE = { date: '2026-08-14', employe: 'nicolas' as EmployeKey, type: 'depart' as PointageType }

// Seuils lus tels quels dans src/lib/anomalies.ts (ACCURACY_THRESHOLD_M) et
// dans les chantiers de démo créés par seed-demo.ts (rayon_autorise = 100 m)
// — aucun seuil n'est réinventé ici.
const ACCURACY_THRESHOLD_M = 100
const RAYON_AUTORISE_M = 100

// ----------------------------------------------------------------------------
// 3. Horaires déterministes — dérivés d'un hash stable (jamais Math.random
//    ni Date.now), pour qu'une seconde exécution produise exactement le
//    même planning.
// ----------------------------------------------------------------------------

function seededFraction(seed: string): number {
  const hash = createHash('sha256').update(seed).digest()
  return hash.readUInt32BE(0) / 0xffffffff
}

function minutesInRange(seed: string, startMin: number, endMin: number): number {
  const frac = seededFraction(seed)
  return startMin + Math.floor(frac * (endMin - startMin + 1))
}

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Fenêtres horaires demandées (minutes depuis minuit).
const ARRIVEE_RANGE: [number, number] = [7 * 60 + 20, 7 * 60 + 50] // 07:20–07:50
const PAUSE_DEBUT_RANGE: [number, number] = [11 * 60 + 55, 12 * 60 + 15] // 11:55–12:15
const PAUSE_FIN_RANGE: [number, number] = [12 * 60 + 50, 13 * 60 + 10] // 12:50–13:10
const DEPART_RANGE: [number, number] = [16 * 60 + 15, 17 * 60] // 16:15–17:00

/** "2026-08-03T07:31:00+02:00" — Europe/Paris est en UTC+2 (CEST) sur toute la période. */
function parisIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+02:00`
}

// ----------------------------------------------------------------------------
// 4. GPS — même formule Haversine que public.haversine_distance_m (006),
//    reproduite ici uniquement parce que l'écriture est directe (pas de
//    RPC) : aucune deuxième logique d'anomalie, seulement le même calcul
//    de distance appliqué à des coordonnées générées.
// ----------------------------------------------------------------------------

function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const sinDLat = Math.sin(toRad(lat2 - lat1) / 2)
  const sinDLng = Math.sin(toRad(lng2 - lng1) / 2)
  const a = Math.min(
    1,
    Math.sqrt(sinDLat ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng ** 2),
  )
  return 2 * R * Math.asin(a)
}

const METERS_PER_DEG_LAT = 111_320

/** Point déterministe à `[minM, maxM]` mètres du chantier, direction pseudo-aléatoire stable. */
function jitteredPoint(baseLat: number, baseLng: number, seed: string, minM: number, maxM: number) {
  const distM = minM + seededFraction(`${seed}:dist`) * (maxM - minM)
  const angle = seededFraction(`${seed}:angle`) * 2 * Math.PI
  const dLat = (distM * Math.cos(angle)) / METERS_PER_DEG_LAT
  const dLng = (distM * Math.sin(angle)) / (METERS_PER_DEG_LAT * Math.cos((baseLat * Math.PI) / 180))
  return { latitude: baseLat + dLat, longitude: baseLng + dLng }
}

// ----------------------------------------------------------------------------
// 5. UUID déterministe (sha256, pas de dépendance ajoutée) — garantit
//    qu'une même journée/employé/type produit toujours le même id de
//    pointage : la stratégie d'idempotence de ce script.
// ----------------------------------------------------------------------------

function deterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '4' // version
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4] // variant
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// ----------------------------------------------------------------------------
// 6. Génération des lignes de pointages
// ----------------------------------------------------------------------------

export type PointageType = 'arrivee' | 'pause_debut' | 'pause_fin' | 'depart'

export interface DemoPointageRow {
  id: string
  employe_id: string
  chantier_id: string
  type: PointageType
  pointe_at: string
  latitude: number | null
  longitude: number | null
  gps_accuracy: number | null
  distance_chantier_m: number | null
}

export interface ChantierCoords {
  latitude: number
  longitude: number
}

/**
 * Construit l'intégralité des lignes de pointages de démonstration à
 * partir du planning ci-dessus. Fonction pure (aucun accès réseau) afin de
 * pouvoir être testée/vérifiée indépendamment de l'insertion en base.
 */
export function buildDemoPointages(
  employeIds: Record<EmployeKey, string>,
  chantierIds: Record<ChantierKey, string>,
  chantierCoords: Record<ChantierKey, ChantierCoords>,
): DemoPointageRow[] {
  const rows: DemoPointageRow[] = []

  for (const date of WEEKDAYS) {
    const dayPlan = SCHEDULE[date]

    for (const employeKey of Object.keys(dayPlan) as EmployeKey[]) {
      const chantierKey = dayPlan[employeKey]
      const chantier = chantierCoords[chantierKey]
      const employeId = employeIds[employeKey]
      const chantierId = chantierIds[chantierKey]

      const isGpsImprecisCase = GPS_IMPRECIS_CASE.date === date && GPS_IMPRECIS_CASE.employe === employeKey
      const isHorsZoneCase = HORS_ZONE_CASE.date === date && HORS_ZONE_CASE.employe === employeKey
      const isGpsIndisponibleCase = GPS_INDISPONIBLE_CASE.date === date && GPS_INDISPONIBLE_CASE.employe === employeKey

      // Toujours les 4 événements : les 3 cas de contrôle restent des
      // interventions complètes et clôturées.
      const eventTypes: PointageType[] = ['arrivee', 'pause_debut', 'pause_fin', 'depart']

      for (const type of eventTypes) {
        const seedBase = `pointage:${employeKey}:${date}:${type}`

        const minutes =
          type === 'arrivee'
            ? minutesInRange(seedBase, ...ARRIVEE_RANGE)
            : type === 'pause_debut'
              ? minutesInRange(seedBase, ...PAUSE_DEBUT_RANGE)
              : type === 'pause_fin'
                ? minutesInRange(seedBase, ...PAUSE_FIN_RANGE)
                : minutesInRange(seedBase, ...DEPART_RANGE)

        // CAS C (localisation indisponible) : uniquement l'événement
        // "depart" de cette journée n'a aucune position captée — jamais de
        // valeur fabriquée, latitude/longitude/précision/distance restent
        // NULL exactement comme le ferait un vrai pointage sans GPS
        // disponible (voir 005_pointages_gps_and_pause.sql).
        if (isGpsIndisponibleCase && type === GPS_INDISPONIBLE_CASE.type) {
          rows.push({
            id: deterministicUuid(seedBase),
            employe_id: employeId,
            chantier_id: chantierId,
            type,
            pointe_at: parisIso(date, formatHHMM(minutes)),
            latitude: null,
            longitude: null,
            gps_accuracy: null,
            distance_chantier_m: null,
          })
          continue
        }

        // CAS B (hors zone) : uniquement l'événement "arrivee" de cette
        // journée est positionné loin du chantier — les autres événements
        // de la même journée restent conformes.
        const useHorsZoneOffset = isHorsZoneCase && type === 'arrivee'
        const point = useHorsZoneOffset
          ? jitteredPoint(chantier.latitude, chantier.longitude, seedBase, 300, 400)
          : jitteredPoint(chantier.latitude, chantier.longitude, seedBase, 5, 40)

        const distance = haversineDistanceM(point.latitude, point.longitude, chantier.latitude, chantier.longitude)

        // CAS A (GPS peu précis) : uniquement l'événement "arrivee" de
        // cette journée dépasse ACCURACY_THRESHOLD_M — position/distance
        // restent conformes, seule la précision déclenche la règle.
        const accuracy =
          isGpsImprecisCase && type === 'arrivee'
            ? ACCURACY_THRESHOLD_M + 45 // 145 m > 100 m
            : 8 + seededFraction(`${seedBase}:accuracy`) * 12 // 8–20 m

        rows.push({
          id: deterministicUuid(seedBase),
          employe_id: employeId,
          chantier_id: chantierId,
          type,
          pointe_at: parisIso(date, formatHHMM(minutes)),
          latitude: point.latitude,
          longitude: point.longitude,
          gps_accuracy: accuracy,
          distance_chantier_m: distance,
        })
      }
    }
  }

  return rows
}

// ----------------------------------------------------------------------------
// 7. Résolution des identités existantes (jamais de création ici)
// ----------------------------------------------------------------------------

async function resolveEmployeIds(): Promise<Record<EmployeKey, string>> {
  const emails = Object.values(EMPLOYE_EMAILS)
  const { data, error } = await supabase.from('profiles').select('id, email').in('email', emails)
  if (error) throw new Error(`Impossible de lire les profils démo : ${error.message}`)

  const byEmail = new Map((data ?? []).map((row) => [row.email, row.id]))
  const result = {} as Record<EmployeKey, string>
  for (const [key, email] of Object.entries(EMPLOYE_EMAILS) as [EmployeKey, string][]) {
    const id = byEmail.get(email)
    if (!id) {
      throw new Error(
        `Employé démo introuvable (${email}). Exécutez d'abord "npm run seed:demo" avant ce script.`,
      )
    }
    result[key] = id
  }
  return result
}

async function resolveChantiers(): Promise<{
  ids: Record<ChantierKey, string>
  coords: Record<ChantierKey, ChantierCoords>
}> {
  const noms = Object.values(CHANTIER_NOMS)
  const { data, error } = await supabase.from('chantiers').select('id, nom, latitude, longitude, rayon_autorise').in('nom', noms)
  if (error) throw new Error(`Impossible de lire les chantiers démo : ${error.message}`)

  const byNom = new Map((data ?? []).map((row) => [row.nom, row]))
  const ids = {} as Record<ChantierKey, string>
  const coords = {} as Record<ChantierKey, ChantierCoords>

  for (const [key, nom] of Object.entries(CHANTIER_NOMS) as [ChantierKey, string][]) {
    const row = byNom.get(nom)
    if (!row) {
      throw new Error(`Chantier démo introuvable ("${nom}"). Exécutez d'abord "npm run seed:demo" avant ce script.`)
    }
    if (row.latitude == null || row.longitude == null) {
      throw new Error(`Chantier "${nom}" sans coordonnées GPS — impossible de générer un historique cohérent.`)
    }
    if (row.rayon_autorise !== RAYON_AUTORISE_M) {
      console.warn(
        `Avertissement : "${nom}" a un rayon_autorise de ${row.rayon_autorise} m (attendu ${RAYON_AUTORISE_M} m) — ` +
          'les positions GPS générées restent conformes à ce rayon réel, pas à la valeur attendue.',
      )
    }
    ids[key] = row.id
    coords[key] = { latitude: row.latitude, longitude: row.longitude }
  }

  return { ids, coords }
}

// ----------------------------------------------------------------------------
// 8. Exécution
// ----------------------------------------------------------------------------

async function main() {
  console.log(`Cible : ${SUPABASE_URL}`)
  console.log('Seed d’historique de pointages — démarrage...\n')

  const employeIds = await resolveEmployeIds()
  const { ids: chantierIds, coords: chantierCoords } = await resolveChantiers()

  const rows = buildDemoPointages(employeIds, chantierIds, chantierCoords)
  const rowIds = rows.map((r) => r.id)

  // Vérifié par lots : une seule requête avec ~240 UUID dans un filtre
  // `in` dépasse la longueur d'URL acceptée par PostgREST.
  const EXISTENCE_CHECK_BATCH_SIZE = 50
  const existingIds = new Set<string>()
  for (let i = 0; i < rowIds.length; i += EXISTENCE_CHECK_BATCH_SIZE) {
    const batch = rowIds.slice(i, i + EXISTENCE_CHECK_BATCH_SIZE)
    const { data: existingRows, error: existingError } = await supabase.from('pointages').select('id').in('id', batch)
    if (existingError) throw new Error(`Impossible de vérifier les pointages existants : ${existingError.message}`)
    for (const row of existingRows ?? []) existingIds.add(row.id)
  }

  const created = rows.filter((r) => !existingIds.has(r.id)).length
  const existing = rows.length - created

  const { error: upsertError } = await supabase.from('pointages').upsert(rows, { onConflict: 'id' })
  if (upsertError) throw new Error(`Échec de l’écriture des pointages : ${upsertError.message}`)

  const interventionDays = WEEKDAYS.reduce((sum, date) => sum + Object.keys(SCHEDULE[date]).length, 0)

  console.log('Résumé')
  console.log('------')
  console.log(`Jours ouvrés couverts : ${WEEKDAYS.length} (${WEEKDAYS[0]} → ${WEEKDAYS[WEEKDAYS.length - 1]})`)
  console.log(`Interventions (jour × employé) : ${interventionDays}`)
  console.log(`Événements de pointage créés : ${created}`)
  console.log(`Événements de pointage déjà existants : ${existing}`)
  console.log(`Total événements en base pour ce seed : ${rows.length}`)
  console.log('\n3 cas de contrôle (interventions complètes et clôturées) :')
  console.log(`  GPS peu précis        — Karim, ${GPS_IMPRECIS_CASE.date}`)
  console.log(`  Hors zone             — Enzo, ${HORS_ZONE_CASE.date}`)
  console.log(`  Localisation indispo. — Nicolas, ${GPS_INDISPONIBLE_CASE.date} (événement "${GPS_INDISPONIBLE_CASE.type}")`)
  console.log('\nAucune photo n’a été créée par ce script.')
}

main().catch((error: unknown) => {
  console.error('\nÉchec du seed d’historique :', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
