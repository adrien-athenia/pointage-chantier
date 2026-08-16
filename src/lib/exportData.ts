import type { Chantier } from '../types/database'
import type { PointageWithRelations } from '../services/pointageService'
import { buildInterventions, computeLiveMinutes } from './pointageStats'
import { computeAnomalies } from './anomalies'
import { formatDate, startOfLocalMonth } from './formatters'

// ----------------------------------------------------------------------------
// Période
// ----------------------------------------------------------------------------

export type ExportPeriodPreset = 'ce-mois' | 'mois-precedent' | 'personnalisee'

export interface ExportPeriod {
  startMs: number
  endMs: number
  /** Libellé humain pour affichage (ex. "Août 2026" ou "01/08/2026 – 16/08/2026"). */
  label: string
}

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function formatMonthLabel(monthStart: Date): string {
  return capitalize(monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))
}

/**
 * Résout les bornes de la période sélectionnée. Renvoie null si la
 * période personnalisée est incomplète ou invalide (fin avant début) —
 * à l'appelant de bloquer l'export dans ce cas plutôt que d'inventer une
 * période par défaut.
 */
export function resolveExportPeriod(
  preset: ExportPeriodPreset,
  customStartDate: string,
  customEndDate: string,
  nowMs: number,
): ExportPeriod | null {
  const now = new Date(nowMs)

  if (preset === 'ce-mois') {
    const start = startOfLocalMonth(now)
    return { startMs: start.getTime(), endMs: nowMs, label: formatMonthLabel(start) }
  }

  if (preset === 'mois-precedent') {
    const currentMonthStart = startOfLocalMonth(now)
    const prevMonthStart = new Date(currentMonthStart)
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
    const prevMonthEnd = new Date(currentMonthStart.getTime() - 1)
    return { startMs: prevMonthStart.getTime(), endMs: prevMonthEnd.getTime(), label: formatMonthLabel(prevMonthStart) }
  }

  if (!customStartDate || !customEndDate) return null
  const start = new Date(`${customStartDate}T00:00:00`)
  const end = new Date(`${customEndDate}T23:59:59.999`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) return null

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: `${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}`,
  }
}

/** "2026-08" pour un mois, "2026-08-01_2026-08-16" pour une période personnalisée — utilisé pour le nom de fichier. */
export function periodFileSuffix(
  preset: ExportPeriodPreset,
  period: ExportPeriod,
  customStartDate: string,
  customEndDate: string,
): string {
  if (preset === 'personnalisee') return `${customStartDate}_${customEndDate}`
  const d = new Date(period.startMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ----------------------------------------------------------------------------
// Lignes d'export (une ligne = une intervention), construites à partir de
// buildInterventions/computeLiveMinutes/computeAnomalies existants — aucun
// recalcul parallèle des durées ou des règles d'anomalie.
// ----------------------------------------------------------------------------

/** Anomalie au sens large de l'export : les codes GPS/policy existants de
 * lib/anomalies.ts, plus les signalements de complétude propres à
 * l'export (voir plus bas) — volontairement typé en `string` plutôt que
 * de réutiliser AnomalyCode, pour ne jamais avoir à modifier le vocabulaire
 * d'anomalies partagé par Dashboard/Pointages pour un besoin propre à
 * l'export. */
export interface ExportAnomaly {
  code: string
  label: string
}

export type ExportEtat = 'En cours' | 'En pause' | 'Terminée'

export interface ExportRow {
  employeId: string
  employeName: string
  chantierId: string
  chantierName: string
  arriveeIso: string
  departIso: string | null
  pauseDebutIso: string | null
  pauseFinIso: string | null
  /** Toujours résolues (valeur "en direct" via computeLiveMinutes si l'intervention est encore ouverte) — jamais null, jamais inventées : dérivées des mêmes pointages que le reste de l'app. */
  pauseMinutes: number
  workedMinutes: number
  isOpen: boolean
  isPaused: boolean
  etat: ExportEtat
  anomalies: ExportAnomaly[]
  /** Distance/précision GPS du pointage d'arrivée — jamais fabriquées, null si non enregistrées. */
  arriveeDistanceM: number | null
  arriveeAccuracyM: number | null
}

export function buildExportRows(
  pointages: PointageWithRelations[],
  chantierById: Map<string, Chantier>,
  period: ExportPeriod,
  nowMs: number,
): ExportRow[] {
  const byEmploye = new Map<string, PointageWithRelations[]>()
  for (const pointage of pointages) {
    const group = byEmploye.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      byEmploye.set(pointage.employe_id, [pointage])
    }
  }

  // Une intervention encore ouverte n'est un signe de problème que si la
  // période exportée est déjà terminée (ex. "mois précédent") : une
  // intervention en cours pendant "ce mois" est simplement normale.
  const periodHasEnded = period.endMs < nowMs

  const rows: ExportRow[] = []

  for (const group of byEmploye.values()) {
    const interventions = buildInterventions(group)

    for (const intervention of interventions) {
      const arriveeMs = new Date(intervention.arrivee.pointe_at).getTime()
      if (arriveeMs < period.startMs || arriveeMs > period.endMs) continue

      const chantier = chantierById.get(intervention.chantierId)
      const anomalies: ExportAnomaly[] = [...computeAnomalies(intervention, chantier, nowMs)]

      if (intervention.isOpen && periodHasEnded) {
        anomalies.push(
          intervention.isPaused
            ? { code: 'pause-non-terminee', label: 'Pause non terminée' }
            : { code: 'depart-manquant', label: 'Départ manquant' },
        )
      }

      const live = intervention.isOpen ? computeLiveMinutes(intervention, nowMs) : null
      const workedMinutes = live ? live.workedMinutes : (intervention.workedMinutes ?? 0)
      const pauseMinutes = live ? live.pauseMinutes : intervention.pauseMinutes

      const etat: ExportEtat = intervention.isOpen ? (intervention.isPaused ? 'En pause' : 'En cours') : 'Terminée'

      const employeProfile = intervention.arrivee.profiles
      const chantierEmbed = intervention.arrivee.chantiers

      rows.push({
        employeId: intervention.employeId,
        employeName: employeProfile?.full_name || employeProfile?.email || 'Employé',
        chantierId: intervention.chantierId,
        chantierName: chantierEmbed?.nom ?? chantier?.nom ?? 'Chantier inconnu',
        arriveeIso: intervention.arrivee.pointe_at,
        departIso: intervention.depart?.pointe_at ?? null,
        pauseDebutIso: intervention.pauses[0]?.debut.pointe_at ?? intervention.openPauseDebut?.pointe_at ?? null,
        pauseFinIso: intervention.pauses.at(-1)?.fin.pointe_at ?? null,
        pauseMinutes,
        workedMinutes,
        isOpen: intervention.isOpen,
        isPaused: intervention.isPaused,
        etat,
        anomalies,
        arriveeDistanceM: intervention.arrivee.distance_chantier_m,
        arriveeAccuracyM: intervention.arrivee.gps_accuracy,
      })
    }
  }

  rows.sort((a, b) => new Date(a.arriveeIso).getTime() - new Date(b.arriveeIso).getTime())
  return rows
}

// ----------------------------------------------------------------------------
// Agrégations — construites à partir des ExportRow déjà calculées
// ci-dessus, jamais recalculées séparément depuis les pointages bruts.
// ----------------------------------------------------------------------------

export interface EmployeeExportSummary {
  employeId: string
  employeName: string
  workedMinutes: number
  pauseMinutes: number
  interventionCount: number
  chantierIds: Set<string>
  anomalyCount: number
}

export function summarizeRowsByEmploye(rows: ExportRow[]): EmployeeExportSummary[] {
  const map = new Map<string, EmployeeExportSummary>()

  for (const row of rows) {
    const existing = map.get(row.employeId)
    if (existing) {
      existing.workedMinutes += row.workedMinutes
      existing.pauseMinutes += row.pauseMinutes
      existing.interventionCount += 1
      existing.chantierIds.add(row.chantierId)
      existing.anomalyCount += row.anomalies.length
    } else {
      map.set(row.employeId, {
        employeId: row.employeId,
        employeName: row.employeName,
        workedMinutes: row.workedMinutes,
        pauseMinutes: row.pauseMinutes,
        interventionCount: 1,
        chantierIds: new Set([row.chantierId]),
        anomalyCount: row.anomalies.length,
      })
    }
  }

  return [...map.values()].sort((a, b) => a.employeName.localeCompare(b.employeName, 'fr'))
}

export interface ChantierExportSummary {
  chantierId: string
  chantierName: string
  employeIds: Set<string>
  interventionCount: number
  workedMinutes: number
  anomalyCount: number
}

export function summarizeRowsByChantier(rows: ExportRow[]): ChantierExportSummary[] {
  const map = new Map<string, ChantierExportSummary>()

  for (const row of rows) {
    const existing = map.get(row.chantierId)
    if (existing) {
      existing.workedMinutes += row.workedMinutes
      existing.interventionCount += 1
      existing.employeIds.add(row.employeId)
      existing.anomalyCount += row.anomalies.length
    } else {
      map.set(row.chantierId, {
        chantierId: row.chantierId,
        chantierName: row.chantierName,
        employeIds: new Set([row.employeId]),
        interventionCount: 1,
        workedMinutes: row.workedMinutes,
        anomalyCount: row.anomalies.length,
      })
    }
  }

  return [...map.values()].sort((a, b) => a.chantierName.localeCompare(b.chantierName, 'fr'))
}

export interface ExportTotals {
  employeCount: number
  chantierCount: number
  workedMinutes: number
  interventionCount: number
  anomalyCount: number
}

export function computeExportTotals(rows: ExportRow[]): ExportTotals {
  const employeIds = new Set<string>()
  const chantierIds = new Set<string>()
  let workedMinutes = 0
  let anomalyCount = 0

  for (const row of rows) {
    employeIds.add(row.employeId)
    chantierIds.add(row.chantierId)
    workedMinutes += row.workedMinutes
    anomalyCount += row.anomalies.length
  }

  return {
    employeCount: employeIds.size,
    chantierCount: chantierIds.size,
    workedMinutes,
    interventionCount: rows.length,
    anomalyCount,
  }
}

/** Heures décimales arrondies à 2 décimales — pour les colonnes numériques du classeur Excel (utilisables directement dans un calcul de paie). */
export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}
