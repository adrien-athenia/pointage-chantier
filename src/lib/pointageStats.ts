import type { Pointage } from '../types/database'

export interface PointageDurationStats {
  totalMinutes: number
  minutesByEmploye: Map<string, number>
  minutesByChantier: Map<string, number>
}

export interface PausePeriod<T extends Pointage = Pointage> {
  debut: T
  fin: T
  minutes: number
}

/**
 * Une "intervention" regroupe tous les événements d'une même séquence
 * arrivee → (pause_debut ↔ pause_fin)* → depart pour un employé. Si
 * `depart` est null, l'intervention est toujours ouverte (isOpen).
 */
export interface Intervention<T extends Pointage = Pointage> {
  employeId: string
  chantierId: string
  arrivee: T
  depart: T | null
  pauses: PausePeriod<T>[]
  /** Pause actuellement ouverte (l'intervention est en pause). */
  openPauseDebut: T | null
  isOpen: boolean
  isPaused: boolean
  /** null tant que l'intervention est ouverte (dépend de l'heure courante). */
  presenceMinutes: number | null
  /** Somme des pauses terminées uniquement — une pause non terminée ne compte jamais. */
  pauseMinutes: number
  /** presence - pause, null tant que l'intervention est ouverte. */
  workedMinutes: number | null
}

function diffMinutes(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000)
}

/**
 * Reconstitue les interventions d'UN SEUL employé à partir de la liste
 * complète (et non filtrée par jour) de ses pointages, pour rester
 * correct sur les séquences traversant minuit. Les événements malformés
 * (qui ne devraient pas exister grâce à la RPC create_pointage) sont
 * ignorés défensivement plutôt que de faire planter le calcul.
 */
export function buildInterventions<T extends Pointage>(pointages: T[]): Intervention<T>[] {
  const sortedAsc = [...pointages].sort(
    (a, b) => new Date(a.pointe_at).getTime() - new Date(b.pointe_at).getTime(),
  )

  const interventions: Intervention<T>[] = []
  let current: { arrivee: T; pauses: PausePeriod<T>[]; pendingPauseDebut: T | null } | null = null

  const closeIntervention = (depart: T | null) => {
    if (!current) return
    const pauseMinutes = current.pauses.reduce((sum, pause) => sum + pause.minutes, 0)
    const presenceMinutes = depart ? diffMinutes(current.arrivee.pointe_at, depart.pointe_at) : null
    interventions.push({
      employeId: current.arrivee.employe_id,
      chantierId: current.arrivee.chantier_id,
      arrivee: current.arrivee,
      depart,
      pauses: current.pauses,
      openPauseDebut: depart ? null : current.pendingPauseDebut,
      isOpen: depart === null,
      isPaused: depart === null && current.pendingPauseDebut !== null,
      presenceMinutes,
      pauseMinutes,
      workedMinutes: presenceMinutes !== null ? Math.max(0, presenceMinutes - pauseMinutes) : null,
    })
    current = null
  }

  for (const pointage of sortedAsc) {
    if (pointage.type === 'arrivee') {
      if (!current) {
        current = { arrivee: pointage, pauses: [], pendingPauseDebut: null }
      }
      continue
    }

    if (!current) continue // événement orphelin (ne devrait pas arriver) : ignoré

    if (pointage.type === 'pause_debut') {
      if (!current.pendingPauseDebut) {
        current.pendingPauseDebut = pointage
      }
      continue
    }

    if (pointage.type === 'pause_fin') {
      if (current.pendingPauseDebut) {
        const minutes = diffMinutes(current.pendingPauseDebut.pointe_at, pointage.pointe_at)
        current.pauses.push({ debut: current.pendingPauseDebut, fin: pointage, minutes })
        current.pendingPauseDebut = null
      }
      continue
    }

    if (pointage.type === 'depart') {
      closeIntervention(pointage)
    }
  }

  // Intervention encore ouverte à la fin de la liste.
  closeIntervention(null)

  return interventions
}

/** Intervention ouverte la plus récente (l'employé est actuellement sur site), s'il y en a une. */
export function getOpenIntervention<T extends Pointage>(interventions: Intervention<T>[]): Intervention<T> | null {
  const last = interventions[interventions.length - 1]
  return last && last.isOpen ? last : null
}

/**
 * Calcule la présence/pause/temps travaillé "en direct" d'une
 * intervention ouverte, à partir de l'heure courante (affichage
 * uniquement — les timestamps officiels restent ceux enregistrés en
 * base). Pour une intervention déjà clôturée, renvoie simplement ses
 * valeurs figées.
 */
export function computeLiveMinutes<T extends Pointage>(
  intervention: Intervention<T>,
  nowMs: number,
): { presenceMinutes: number; pauseMinutes: number; workedMinutes: number } {
  if (!intervention.isOpen) {
    return {
      presenceMinutes: intervention.presenceMinutes ?? 0,
      pauseMinutes: intervention.pauseMinutes,
      workedMinutes: intervention.workedMinutes ?? 0,
    }
  }

  const presenceMinutes = Math.max(0, (nowMs - new Date(intervention.arrivee.pointe_at).getTime()) / 60000)
  const openPauseMinutes = intervention.openPauseDebut
    ? Math.max(0, (nowMs - new Date(intervention.openPauseDebut.pointe_at).getTime()) / 60000)
    : 0
  const pauseMinutes = intervention.pauseMinutes + openPauseMinutes

  return {
    presenceMinutes,
    pauseMinutes,
    workedMinutes: Math.max(0, presenceMinutes - pauseMinutes),
  }
}

/**
 * Utilisé par le dashboard admin : agrège le temps réellement travaillé
 * (présence moins pauses) par employé et par chantier, à partir des
 * interventions clôturées de l'ensemble des employés.
 */
export function computeDurationStats(pointages: Pointage[]): PointageDurationStats {
  const groups = new Map<string, Pointage[]>()

  for (const pointage of pointages) {
    const group = groups.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      groups.set(pointage.employe_id, [pointage])
    }
  }

  const minutesByEmploye = new Map<string, number>()
  const minutesByChantier = new Map<string, number>()
  let totalMinutes = 0

  for (const [employeId, group] of groups) {
    const interventions = buildInterventions(group)

    for (const intervention of interventions) {
      if (intervention.workedMinutes === null) continue // intervention ouverte : pas encore comptabilisée

      totalMinutes += intervention.workedMinutes
      minutesByEmploye.set(employeId, (minutesByEmploye.get(employeId) ?? 0) + intervention.workedMinutes)
      minutesByChantier.set(
        intervention.chantierId,
        (minutesByChantier.get(intervention.chantierId) ?? 0) + intervention.workedMinutes,
      )
    }
  }

  return { totalMinutes, minutesByEmploye, minutesByChantier }
}
