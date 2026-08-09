import type { Chantier, Pointage } from '../types/database'
import type { Intervention } from './pointageStats'

export type AnomalyCode =
  | 'hors-zone'
  | 'gps-imprecis'
  | 'gps-indisponible'
  | 'chantier-sans-coordonnees'
  | 'duree-max-depassee'

export interface AnomalyInfo {
  code: AnomalyCode
  label: string
}

// Seuil déclenchant l'anomalie "GPS peu précis" affichée à l'admin.
// Volontairement CONSERVÉ à sa valeur d'origine (audit GPS) : la cause
// principale des faux avertissements observés en test réel n'était pas
// ce chiffre mais la stratégie d'acquisition (un seul relevé accepté
// aussitôt, souvent une position réseau grossière — voir
// src/lib/geolocation.ts). Avec l'acquisition corrigée, ce seuil devrait
// se déclencher nettement plus rarement, à juste titre.
//
// Classification plus fine proposée pour l'affichage détaillé (voir
// classifyAccuracy ci-dessous) — n'affecte PAS ce seuil ni le
// déclenchement de l'anomalie ci-dessous :
//   ≤ 25 m   excellent
//   26-50 m  bon
//   51-100 m acceptable
//   > 100 m  insuffisant
export const ACCURACY_THRESHOLD_M = 100

const ANOMALY_LABELS: Record<AnomalyCode, string> = {
  'hors-zone': 'Hors zone',
  'gps-imprecis': 'GPS peu précis',
  'gps-indisponible': 'Localisation indisponible',
  'chantier-sans-coordonnees': 'Chantier sans coordonnées',
  'duree-max-depassee': 'Durée maximale dépassée',
}

export type AccuracyTier = 'excellent' | 'bon' | 'acceptable' | 'insuffisant'

/**
 * Classification informative de la précision GPS (affichage détaillé
 * uniquement, côté admin) — plus fine que le seul seuil binaire
 * ACCURACY_THRESHOLD_M, sans le remplacer.
 */
export function classifyAccuracy(accuracyMeters: number): AccuracyTier {
  if (accuracyMeters <= 25) return 'excellent'
  if (accuracyMeters <= 50) return 'bon'
  if (accuracyMeters <= 100) return 'acceptable'
  return 'insuffisant'
}

function interventionEvents<T extends Pointage>(intervention: Intervention<T>): T[] {
  const events: T[] = [intervention.arrivee]
  for (const pause of intervention.pauses) {
    events.push(pause.debut, pause.fin)
  }
  if (intervention.openPauseDebut) events.push(intervention.openPauseDebut)
  if (intervention.depart) events.push(intervention.depart)
  return events
}

/**
 * Dérive les anomalies d'une intervention à partir des données sources
 * (aucun statut d'anomalie n'est stocké en base). Une intervention peut
 * cumuler plusieurs anomalies simultanément.
 */
export function computeAnomalies<T extends Pointage>(
  intervention: Intervention<T>,
  chantier: Chantier | undefined,
  nowMs: number,
): AnomalyInfo[] {
  const events = interventionEvents(intervention)
  const codes: AnomalyCode[] = []

  const chantierSansCoordonnees = chantier != null && (chantier.latitude == null || chantier.longitude == null)
  if (chantierSansCoordonnees) codes.push('chantier-sans-coordonnees')

  // Hors zone n'est évaluable que si le chantier a des coordonnées ET
  // que le pointage a une distance calculée (donc jamais en même temps
  // que "chantier-sans-coordonnees", par construction des données).
  const horsZone = chantier
    ? events.some((event) => event.distance_chantier_m != null && event.distance_chantier_m > chantier.rayon_autorise)
    : false
  if (horsZone) codes.push('hors-zone')

  const gpsImprecis = events.some((event) => event.gps_accuracy != null && event.gps_accuracy > ACCURACY_THRESHOLD_M)
  if (gpsImprecis) codes.push('gps-imprecis')

  // Distincte de "chantier-sans-coordonnees" : ceci reflète l'absence de
  // position CÔTÉ EMPLOYÉ (permission refusée, GPS coupé, timeout...),
  // pas un chantier mal configuré.
  const gpsIndisponible = events.some((event) => event.latitude == null || event.longitude == null)
  if (gpsIndisponible) codes.push('gps-indisponible')

  if (intervention.isOpen && chantier?.duree_max_intervention_minutes != null) {
    const presenceMinutes = (nowMs - new Date(intervention.arrivee.pointe_at).getTime()) / 60000
    if (presenceMinutes > chantier.duree_max_intervention_minutes) {
      codes.push('duree-max-depassee')
    }
  }

  return codes.map((code) => ({ code, label: ANOMALY_LABELS[code] }))
}
