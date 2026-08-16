import ExcelJS from 'exceljs'
import type { Chantier } from '../types/database'
import {
  computeExportTotals,
  minutesToDecimalHours,
  summarizeRowsByChantier,
  summarizeRowsByEmploye,
  type ExportAnomaly,
  type ExportPeriod,
  type ExportRow,
} from './exportData'
import { formatDate, formatTime } from './formatters'

const HEADER_FILL = 'FF1E2F4B'
const HEADER_FONT = 'FFFFFFFF'
const MUTED_FONT = 'FF6F788A'
const SUCCESS_FONT = 'FF1F9D63'

const HOURS_FORMAT = '0.00'

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

// ----------------------------------------------------------------------------
// Feuille 1 — Synthèse
// ----------------------------------------------------------------------------

function addSyntheseSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  totals: ReturnType<typeof computeExportTotals>,
  byEmploye: ReturnType<typeof summarizeRowsByEmploye>,
): void {
  const sheet = workbook.addWorksheet('Synthèse')
  sheet.columns = [{ width: 28 }, { width: 20 }, { width: 22 }, { width: 20 }, { width: 14 }]

  const titleRow = sheet.addRow(['PointageChantier — Synthèse'])
  titleRow.getCell(1).font = { bold: true, size: 16 }

  const periodRow = sheet.addRow([`Période : ${period.label}`])
  periodRow.getCell(1).font = { italic: true, color: { argb: MUTED_FONT } }

  sheet.addRow([])

  const kpis: Array<[string, number, string?]> = [
    ["Nombre d’employés", totals.employeCount],
    ['Nombre de chantiers', totals.chantierCount],
    ['Total heures travaillées', minutesToDecimalHours(totals.workedMinutes), HOURS_FORMAT],
    ["Nombre d’interventions", totals.interventionCount],
    ["Nombre d’anomalies", totals.anomalyCount],
  ]
  for (const [label, value, numFmt] of kpis) {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (numFmt) row.getCell(2).numFmt = numFmt
  }

  sheet.addRow([])

  const headerRow = sheet.addRow([
    'Employé',
    'Heures travaillées',
    "Nombre d’interventions",
    'Nombre de chantiers',
    'Anomalies',
  ])
  const headerRowNumber = headerRow.number
  styleHeaderRow(headerRow)

  for (const emp of byEmploye) {
    const row = sheet.addRow([
      emp.employeName,
      minutesToDecimalHours(emp.workedMinutes),
      emp.interventionCount,
      emp.chantierIds.size,
      emp.anomalyCount,
    ])
    row.getCell(2).numFmt = HOURS_FORMAT
  }

  const totalRow = sheet.addRow([
    'TOTAL',
    minutesToDecimalHours(totals.workedMinutes),
    totals.interventionCount,
    totals.chantierCount,
    totals.anomalyCount,
  ])
  totalRow.font = { bold: true }
  totalRow.getCell(2).numFmt = HOURS_FORMAT

  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  sheet.autoFilter = `A${headerRowNumber}:E${headerRowNumber}`
}

// ----------------------------------------------------------------------------
// Feuille 2 — Par salarié
// ----------------------------------------------------------------------------

function addParSalarieSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  totals: ReturnType<typeof computeExportTotals>,
  byEmploye: ReturnType<typeof summarizeRowsByEmploye>,
): void {
  const sheet = workbook.addWorksheet('Par salarié')
  sheet.columns = [
    { header: 'Employé', key: 'employe', width: 26 },
    { header: 'Période', key: 'periode', width: 26 },
    { header: "Nombre d’interventions", key: 'interventions', width: 20 },
    { header: 'Temps de pause', key: 'pause', width: 16 },
    { header: 'Heures travaillées', key: 'heures', width: 18 },
    { header: 'Anomalies', key: 'anomalies', width: 14 },
  ]
  styleHeaderRow(sheet.getRow(1))

  for (const emp of byEmploye) {
    sheet.addRow({
      employe: emp.employeName,
      periode: period.label,
      interventions: emp.interventionCount,
      pause: minutesToDecimalHours(emp.pauseMinutes),
      heures: minutesToDecimalHours(emp.workedMinutes),
      anomalies: emp.anomalyCount,
    })
  }

  const totalRow = sheet.addRow({
    employe: 'TOTAL',
    periode: '',
    interventions: totals.interventionCount,
    pause: minutesToDecimalHours(byEmploye.reduce((sum, emp) => sum + emp.pauseMinutes, 0)),
    heures: minutesToDecimalHours(totals.workedMinutes),
    anomalies: totals.anomalyCount,
  })
  totalRow.font = { bold: true }

  sheet.getColumn('pause').numFmt = HOURS_FORMAT
  sheet.getColumn('heures').numFmt = HOURS_FORMAT
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = 'A1:F1'
}

// ----------------------------------------------------------------------------
// Feuille 3 — Par chantier
// ----------------------------------------------------------------------------

function addParChantierSheet(
  workbook: ExcelJS.Workbook,
  totals: ReturnType<typeof computeExportTotals>,
  byChantier: ReturnType<typeof summarizeRowsByChantier>,
): void {
  const sheet = workbook.addWorksheet('Par chantier')
  sheet.columns = [
    { header: 'Chantier', key: 'chantier', width: 28 },
    { header: 'Nombre de salariés', key: 'salaries', width: 18 },
    { header: "Nombre d’interventions", key: 'interventions', width: 20 },
    { header: 'Heures travaillées', key: 'heures', width: 18 },
    { header: 'Anomalies', key: 'anomalies', width: 14 },
  ]
  styleHeaderRow(sheet.getRow(1))

  for (const chantier of byChantier) {
    sheet.addRow({
      chantier: chantier.chantierName,
      salaries: chantier.employeIds.size,
      interventions: chantier.interventionCount,
      heures: minutesToDecimalHours(chantier.workedMinutes),
      anomalies: chantier.anomalyCount,
    })
  }

  const totalRow = sheet.addRow({
    chantier: 'TOTAL',
    salaries: totals.employeCount,
    interventions: totals.interventionCount,
    heures: minutesToDecimalHours(totals.workedMinutes),
    anomalies: totals.anomalyCount,
  })
  totalRow.font = { bold: true }

  sheet.getColumn('heures').numFmt = HOURS_FORMAT
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = 'A1:E1'
}

// ----------------------------------------------------------------------------
// Feuille 4 — Détail pointages
// ----------------------------------------------------------------------------

function addDetailSheet(workbook: ExcelJS.Workbook, rows: ExportRow[]): void {
  const sheet = workbook.addWorksheet('Détail pointages')
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Employé', key: 'employe', width: 24 },
    { header: 'Chantier', key: 'chantier', width: 26 },
    { header: 'Arrivée', key: 'arrivee', width: 10 },
    { header: 'Début pause', key: 'pauseDebut', width: 12 },
    { header: 'Fin pause', key: 'pauseFin', width: 10 },
    { header: 'Départ', key: 'depart', width: 10 },
    { header: 'Temps pause', key: 'tempsPause', width: 13 },
    { header: 'Temps travaillé', key: 'tempsTravaille', width: 15 },
    { header: 'État', key: 'etat', width: 12 },
    { header: 'Distance GPS (m)', key: 'distance', width: 16 },
    { header: 'Précision GPS (m)', key: 'precision', width: 17 },
    { header: 'Contrôle', key: 'controle', width: 14 },
    { header: 'Anomalies', key: 'anomalies', width: 36 },
  ]
  styleHeaderRow(sheet.getRow(1))

  for (const row of rows) {
    sheet.addRow({
      date: formatDate(row.arriveeIso),
      employe: row.employeName,
      chantier: row.chantierName,
      arrivee: formatTime(row.arriveeIso),
      pauseDebut: row.pauseDebutIso ? formatTime(row.pauseDebutIso) : '',
      pauseFin: row.pauseFinIso ? formatTime(row.pauseFinIso) : '',
      depart: row.departIso ? formatTime(row.departIso) : '',
      tempsPause: minutesToDecimalHours(row.pauseMinutes),
      tempsTravaille: minutesToDecimalHours(row.workedMinutes),
      etat: row.etat,
      distance: row.arriveeDistanceM != null ? Math.round(row.arriveeDistanceM) : '',
      precision: row.arriveeAccuracyM != null ? Math.round(row.arriveeAccuracyM) : '',
      controle: row.anomalies.length === 0 ? 'Conforme' : 'À vérifier',
      anomalies: row.anomalies.map((a) => a.label).join(' · '),
    })
  }

  sheet.getColumn('tempsPause').numFmt = HOURS_FORMAT
  sheet.getColumn('tempsTravaille').numFmt = HOURS_FORMAT
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = 'A1:N1'
}

// ----------------------------------------------------------------------------
// Feuille 5 — Anomalies
// ----------------------------------------------------------------------------

/**
 * Complète le libellé de l'anomalie par un détail concret dérivé des
 * données réelles déjà présentes sur la ligne (distance, précision,
 * seuils du chantier) — jamais une valeur inventée. Pour les anomalies
 * sans donnée chiffrée associée, une phrase descriptive fixe.
 */
function anomalyDetail(anomaly: ExportAnomaly, row: ExportRow, chantier: Chantier | undefined): string {
  switch (anomaly.code) {
    case 'hors-zone':
      return row.arriveeDistanceM != null && chantier
        ? `Distance ${Math.round(row.arriveeDistanceM)} m (rayon autorisé ${chantier.rayon_autorise} m)`
        : ''
    case 'gps-imprecis':
      return row.arriveeAccuracyM != null ? `Précision ±${Math.round(row.arriveeAccuracyM)} m` : ''
    case 'gps-indisponible':
      return 'Aucune position enregistrée pour ce pointage.'
    case 'chantier-sans-coordonnees':
      return 'Le chantier ne possède pas de coordonnées GPS.'
    case 'duree-max-depassee':
      return chantier?.duree_max_intervention_minutes != null
        ? `Durée maximale configurée : ${minutesToDecimalHours(chantier.duree_max_intervention_minutes)} h`
        : ''
    case 'depart-manquant':
      return 'Aucun départ enregistré depuis l’arrivée.'
    case 'pause-non-terminee':
      return 'La pause n’a pas été clôturée par une reprise.'
    default:
      return ''
  }
}

function addAnomaliesSheet(workbook: ExcelJS.Workbook, rows: ExportRow[], chantierById: Map<string, Chantier>): void {
  const sheet = workbook.addWorksheet('Anomalies')
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Employé', key: 'employe', width: 24 },
    { header: 'Chantier', key: 'chantier', width: 26 },
    { header: "Type d’anomalie", key: 'type', width: 22 },
    { header: 'Détail', key: 'detail', width: 42 },
    { header: 'Arrivée', key: 'arrivee', width: 10 },
    { header: 'Départ', key: 'depart', width: 10 },
  ]
  styleHeaderRow(sheet.getRow(1))

  let anomalyRowCount = 0
  for (const row of rows) {
    for (const anomaly of row.anomalies) {
      anomalyRowCount += 1
      sheet.addRow({
        date: formatDate(row.arriveeIso),
        employe: row.employeName,
        chantier: row.chantierName,
        type: anomaly.label,
        detail: anomalyDetail(anomaly, row, chantierById.get(row.chantierId)),
        arrivee: formatTime(row.arriveeIso),
        depart: row.departIso ? formatTime(row.departIso) : '',
      })
    }
  }

  if (anomalyRowCount === 0) {
    sheet.mergeCells('A2:G2')
    const cell = sheet.getCell('A2')
    cell.value = 'Aucune anomalie sur la période.'
    cell.font = { italic: true, color: { argb: SUCCESS_FONT } }
    cell.alignment = { horizontal: 'center' }
  } else {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = 'A1:G1'
  }
}

// ----------------------------------------------------------------------------
// Assemblage + téléchargement
// ----------------------------------------------------------------------------

export interface BuildXlsxParams {
  rows: ExportRow[]
  chantierById: Map<string, Chantier>
  period: ExportPeriod
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Assemble le classeur Excel Premium à partir des ExportRow déjà
 * calculées (elles-mêmes dérivées de buildInterventions/computeAnomalies
 * — aucun recalcul de durée ou d'anomalie ici, uniquement mise en forme
 * et agrégation d'affichage). Fonction pure, testable hors navigateur.
 */
export function buildWorkbook(params: BuildXlsxParams): ExcelJS.Workbook {
  const { rows, chantierById, period } = params

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PointageChantier'
  workbook.created = new Date()

  const totals = computeExportTotals(rows)
  const byEmploye = summarizeRowsByEmploye(rows)
  const byChantier = summarizeRowsByChantier(rows)

  addSyntheseSheet(workbook, period, totals, byEmploye)
  addParSalarieSheet(workbook, period, totals, byEmploye)
  addParChantierSheet(workbook, totals, byChantier)
  addDetailSheet(workbook, rows)
  addAnomaliesSheet(workbook, rows, chantierById)

  return workbook
}

export async function buildAndDownloadXlsx(params: BuildXlsxParams, filename: string): Promise<void> {
  const workbook = buildWorkbook(params)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(filename, blob)
}
