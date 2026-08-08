import type { Chantier, Pointage } from '../types/database'
import type { Intervention } from './pointageStats'

export type AnomalyCode = 'hors-zone' | 'gps-imprecis' | 'gps-indisponible' | 'duree-max-depassee'

export interface AnomalyInfo {
  code: AnomalyCode
  label: string
}

const ACCURACY_THRESHOLD_M = 100

const ANOMALY_LABELS: Record<AnomalyCode, string> = {
  'hors-zone': 'Hors zone',
  'gps-imprecis': 'GPS peu précis',
  'gps-indisponible': 'Localisation indisponible',
  'duree-max-depassee': 'Durée maximale dépassée',
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

  const horsZone = chantier
    ? events.some((event) => event.distance_chantier_m != null && event.distance_chantier_m > chantier.rayon_autorise)
    : false
  if (horsZone) codes.push('hors-zone')

  const gpsImprecis = events.some((event) => event.gps_accuracy != null && event.gps_accuracy > ACCURACY_THRESHOLD_M)
  if (gpsImprecis) codes.push('gps-imprecis')

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
