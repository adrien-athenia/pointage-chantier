import type { Pointage } from '../types/database'
import { isSameDay, startOfLocalDay, startOfLocalMonth, startOfLocalWeek } from './formatters'

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

export interface PeriodInterventionSummary<T extends Pointage = Pointage> {
  employeId: string
  chantierId: string
  /** Toujours résolu (computeLiveMinutes si encore ouverte) — jamais null, jamais inventé. */
  workedMinutes: number
  isOpen: boolean
  intervention: Intervention<T>
}

/**
 * Reconstruit les interventions de TOUS les employés (regroupés puis
 * passés à buildInterventions un par un, comme partout ailleurs) et ne
 * garde que celles dont l'ARRIVÉE tombe dans [startMs, endMs] — même
 * convention que l'export Excel Premium (buildExportRows dans
 * src/lib/exportData.ts, non dupliquée ici) : une intervention appartient
 * à la période de son arrivée, jamais de son départ, pour ne jamais
 * couper une séquence arrivée/pause/départ à cheval sur la borne. Une
 * intervention encore ouverte utilise computeLiveMinutes(nowMs), comme le
 * reste de l'app.
 */
export function buildPeriodInterventions<T extends Pointage>(
  pointages: T[],
  startMs: number,
  endMs: number,
  nowMs: number,
): PeriodInterventionSummary<T>[] {
  const byEmploye = new Map<string, T[]>()
  for (const pointage of pointages) {
    const group = byEmploye.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      byEmploye.set(pointage.employe_id, [pointage])
    }
  }

  const results: PeriodInterventionSummary<T>[] = []
  for (const [employeId, group] of byEmploye) {
    const interventions = buildInterventions(group)
    for (const intervention of interventions) {
      const arriveeMs = new Date(intervention.arrivee.pointe_at).getTime()
      if (arriveeMs < startMs || arriveeMs > endMs) continue

      const live = intervention.isOpen ? computeLiveMinutes(intervention, nowMs) : null
      const workedMinutes = live ? live.workedMinutes : (intervention.workedMinutes ?? 0)

      results.push({ employeId, chantierId: intervention.chantierId, workedMinutes, isOpen: intervention.isOpen, intervention })
    }
  }
  return results
}

export interface PeriodTotals {
  todayWorkedMinutes: number
  todayPauseMinutes: number
  weekWorkedMinutes: number
  monthWorkedMinutes: number
}

/** Intersection en minutes entre deux intervalles (ms epoch), 0 si disjoints ou vides. */
function intersectMinutes(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): number {
  const start = Math.max(aStartMs, bStartMs)
  const end = Math.min(aEndMs, bEndMs)
  return end > start ? (end - start) / 60000 : 0
}

/**
 * Temps réellement travaillé d'une intervention à l'intersection d'une
 * fenêtre [windowStartMs, windowEndMs] : présence bornée à la fenêtre,
 * moins uniquement les portions de pause qui intersectent cette même
 * fenêtre (aucune pause hors fenêtre n'est jamais retranchée, aucune
 * portion n'est comptée deux fois). Une intervention ou une pause encore
 * ouverte est bornée par windowEndMs (on ne connaît leur fin réelle que
 * jusqu'à "maintenant", qui est toujours la valeur passée ici). Retourne
 * des zéros si l'intervention n'intersecte pas la fenêtre.
 *
 * Utilisée uniquement pour "Aujourd'hui" ci-dessous : Semaine/Mois
 * continuent d'utiliser workedMinutes/pauseMinutes "pleins", inchangés.
 */
export function minutesInWindow<T extends Pointage>(
  intervention: Intervention<T>,
  windowStartMs: number,
  windowEndMs: number,
): { pauseMinutes: number; workedMinutes: number } {
  const arriveeMs = new Date(intervention.arrivee.pointe_at).getTime()
  const departMs = intervention.depart ? new Date(intervention.depart.pointe_at).getTime() : windowEndMs

  const presenceMinutes = intersectMinutes(arriveeMs, departMs, windowStartMs, windowEndMs)
  if (presenceMinutes <= 0) return { pauseMinutes: 0, workedMinutes: 0 }

  let pauseMinutes = 0
  for (const pause of intervention.pauses) {
    pauseMinutes += intersectMinutes(
      new Date(pause.debut.pointe_at).getTime(),
      new Date(pause.fin.pointe_at).getTime(),
      windowStartMs,
      windowEndMs,
    )
  }
  if (intervention.openPauseDebut) {
    pauseMinutes += intersectMinutes(
      new Date(intervention.openPauseDebut.pointe_at).getTime(),
      windowEndMs,
      windowStartMs,
      windowEndMs,
    )
  }

  return { pauseMinutes, workedMinutes: Math.max(0, presenceMinutes - pauseMinutes) }
}

/**
 * Utilisé par le dashboard employé : agrège le temps travaillé/pause
 * d'UN SEUL employé par période locale (jour / semaine en cours, lundi
 * 00:00 → maintenant / mois en cours, 1er → maintenant), à partir de
 * TOUTES ses interventions récentes (pas seulement celles d'aujourd'hui,
 * pour bien couvrir la semaine et le mois).
 *
 * "Aujourd'hui" ne compte que la portion réellement travaillée dans la
 * fenêtre [todayStart, nowMs] (via minutesInWindow ci-dessus) : une
 * intervention (ouverte ou clôturée) qui déborde sur un autre jour ne
 * contribue à "Aujourd'hui" que pour sa part réellement effectuée depuis
 * minuit, jamais sa durée totale. Le compteur live (computeLiveMinutes),
 * lui, n'est pas concerné par ce changement : il continue d'afficher la
 * durée totale depuis l'arrivée, y compris sur plusieurs jours — c'est
 * volontaire, cela rend un oubli de départ visible.
 *
 * "Cette semaine"/"Ce mois" restent basés sur la convention existante :
 * une intervention est attribuée à la date locale de son départ (ou à
 * "maintenant" si elle est encore ouverte), sans fenêtre — comportement
 * inchangé.
 */
export function computePeriodTotals<T extends Pointage>(
  interventions: Intervention<T>[],
  nowMs: number,
): PeriodTotals {
  const now = new Date(nowMs)
  const todayStart = startOfLocalDay(now).getTime()
  const weekStart = startOfLocalWeek(now).getTime()
  const monthStart = startOfLocalMonth(now).getTime()

  let todayWorkedMinutes = 0
  let todayPauseMinutes = 0
  let weekWorkedMinutes = 0
  let monthWorkedMinutes = 0

  for (const intervention of interventions) {
    const attributionMs = intervention.depart ? new Date(intervention.depart.pointe_at).getTime() : nowMs

    const live = intervention.isOpen ? computeLiveMinutes(intervention, nowMs) : null
    const workedMinutes = live ? live.workedMinutes : intervention.workedMinutes ?? 0

    const today = minutesInWindow(intervention, todayStart, nowMs)
    todayWorkedMinutes += today.workedMinutes
    todayPauseMinutes += today.pauseMinutes

    if (attributionMs >= weekStart) weekWorkedMinutes += workedMinutes
    if (attributionMs >= monthStart) monthWorkedMinutes += workedMinutes
  }

  return { todayWorkedMinutes, todayPauseMinutes, weekWorkedMinutes, monthWorkedMinutes }
}

export interface ChantierHistoryEntry<T extends Pointage = Pointage> {
  chantierId: string
  /** Intervention clôturée la plus récente sur ce chantier — sert à lire
   * les informations du chantier (nom, ville...) via son embed, et la
   * date de dernière intervention. */
  lastIntervention: Intervention<T>
  totalWorkedMinutes: number
  interventionCount: number
}

/**
 * Agrège, par chantier, les interventions CLÔTURÉES d'un employé (date de
 * dernière intervention, total d'heures travaillées, nombre
 * d'interventions). Un chantier n'apparaît qu'une fois même s'il a été
 * travaillé plusieurs jours ; une intervention encore ouverte ne compte
 * jamais tant qu'elle n'est pas clôturée par un départ.
 *
 * Réutilisé par le dashboard employé pour : le KPI "chantiers
 * effectués" (taille de la map), la liste "Chantiers terminés" (filtrer
 * les entrées dont le chantier embarqué a statut='termine'), et les
 * heures totales par chantier affichées dans cette section.
 */
export function summarizeByChantier<T extends Pointage>(
  interventions: Intervention<T>[],
): Map<string, ChantierHistoryEntry<T>> {
  const summary = new Map<string, ChantierHistoryEntry<T>>()

  for (const intervention of interventions) {
    if (intervention.isOpen || intervention.workedMinutes === null) continue

    const interventionDate = intervention.depart?.pointe_at ?? intervention.arrivee.pointe_at
    const existing = summary.get(intervention.chantierId)

    if (!existing) {
      summary.set(intervention.chantierId, {
        chantierId: intervention.chantierId,
        lastIntervention: intervention,
        totalWorkedMinutes: intervention.workedMinutes,
        interventionCount: 1,
      })
      continue
    }

    existing.totalWorkedMinutes += intervention.workedMinutes
    existing.interventionCount += 1

    const existingDate = existing.lastIntervention.depart?.pointe_at ?? existing.lastIntervention.arrivee.pointe_at
    if (new Date(interventionDate).getTime() > new Date(existingDate).getTime()) {
      existing.lastIntervention = intervention
    }
  }

  return summary
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

export interface ChantierTodaySummary {
  chantierId: string
  workedMinutes: number
  employeIds: Set<string>
}

/**
 * Utilisé par le dashboard admin (carte "Chantiers aujourd'hui") : pour
 * chaque chantier ayant eu de l'activité aujourd'hui, le temps réellement
 * travaillé dans la fenêtre du jour (voir minutesInWindow) et l'ensemble
 * des employés concernés, tous employés confondus.
 */
export function computeChantierTodaySummaries<T extends Pointage>(
  pointages: T[],
  nowMs: number,
): Map<string, ChantierTodaySummary> {
  const todayStart = startOfLocalDay(new Date(nowMs)).getTime()

  const byEmploye = new Map<string, T[]>()
  for (const pointage of pointages) {
    const group = byEmploye.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      byEmploye.set(pointage.employe_id, [pointage])
    }
  }

  const summaries = new Map<string, ChantierTodaySummary>()

  for (const [employeId, group] of byEmploye) {
    const interventions = buildInterventions(group)

    for (const intervention of interventions) {
      const { workedMinutes } = minutesInWindow(intervention, todayStart, nowMs)
      if (workedMinutes <= 0) continue

      const existing = summaries.get(intervention.chantierId)
      if (existing) {
        existing.workedMinutes += workedMinutes
        existing.employeIds.add(employeId)
      } else {
        summaries.set(intervention.chantierId, {
          chantierId: intervention.chantierId,
          workedMinutes,
          employeIds: new Set([employeId]),
        })
      }
    }
  }

  return summaries
}

export type EmployeeDayStatusKind = 'present' | 'pause' | 'termine' | 'absent'

export interface EmployeeDayStatus<T extends Pointage = Pointage> {
  status: EmployeeDayStatusKind
  /** Intervention à l'origine du statut — null uniquement pour 'absent'. */
  intervention: Intervention<T> | null
}

/**
 * Utilisé par le dashboard admin (carte "Présence aujourd'hui") : pour
 * chaque employé ayant au moins un pointage récent, dérive son statut
 * courant à partir de sa dernière intervention — ouverte (présent/en
 * pause), clôturée aujourd'hui (journée terminée), ou aucune des deux
 * (pas encore pointé). L'intervention retournée permet ensuite de dériver
 * l'heure à afficher et, via computeAnomalies, les anomalies éventuelles.
 */
export function computeEmployeeDayStatuses<T extends Pointage>(
  pointages: T[],
  nowMs: number,
): Map<string, EmployeeDayStatus<T>> {
  const now = new Date(nowMs)

  const byEmploye = new Map<string, T[]>()
  for (const pointage of pointages) {
    const group = byEmploye.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      byEmploye.set(pointage.employe_id, [pointage])
    }
  }

  const statuses = new Map<string, EmployeeDayStatus<T>>()

  for (const [employeId, group] of byEmploye) {
    const interventions = buildInterventions(group)
    const open = getOpenIntervention(interventions)

    if (open) {
      statuses.set(employeId, { status: open.isPaused ? 'pause' : 'present', intervention: open })
      continue
    }

    const closedToday = [...interventions].reverse().find((i) => i.depart && isSameDay(i.depart.pointe_at, now))
    if (closedToday) {
      statuses.set(employeId, { status: 'termine', intervention: closedToday })
      continue
    }

    statuses.set(employeId, { status: 'absent', intervention: null })
  }

  return statuses
}
