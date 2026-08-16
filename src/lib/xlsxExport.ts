import ExcelJS from 'exceljs'
import type { Chantier } from '../types/database'
import {
  computeExportTotals,
  minutesToDecimalHours,
  summarizeRowsByChantier,
  summarizeRowsByEmploye,
  type ExportAnomaly,
  type ExportEtat,
  type ExportPeriod,
  type ExportRow,
} from './exportData'
import { formatDate, formatTime } from './formatters'

// ----------------------------------------------------------------------------
// Identité visuelle — reprend la palette de l'app (tokens.css) : bleu sombre
// / bleu professionnel / blanc. Les teintes "danger"/"succès"/"warning" sont
// légèrement assombries par rapport aux tokens CSS d'origine pour rester
// lisibles à l'impression papier (le contraste web n'est pas toujours
// suffisant sur du papier ou dans une prévisualisation grand écran).
// ----------------------------------------------------------------------------
const NAVY = 'FF1E2F4B' // --color-primary-active-bg
const ACCENT_BLUE = 'FF5599F7' // --color-primary
const MUTED = 'FF6F788A'
const BORDER_LIGHT = 'FFD8DEE8'
const BAND_FILL = 'FFE7EEFB' // fond léger des zones KPI / lignes TOTAL
const SUCCESS_TEXT = 'FF1F9D63'
const DANGER_TEXT = 'FFC1432E'
const WARNING_TEXT = 'FFB8791F'
const WHITE = 'FFFFFFFF'

const HOURS_FORMAT = '0.00'
const DEFAULT_ORG_NAME = 'PointageChantier'

const thinBorderSide = { style: 'thin' as const, color: { argb: BORDER_LIGHT } }
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: thinBorderSide,
  left: thinBorderSide,
  bottom: thinBorderSide,
  right: thinBorderSide,
}

/**
 * "8h00" / "7h30" / "0h30" — pendant format lisible du nombre de minutes
 * déjà calculé ailleurs (buildInterventions/computeLiveMinutes). Purement
 * présentationnel : n'affecte jamais la valeur numérique source, qui reste
 * disponible telle quelle dans la colonne "Heures décimales" adjacente.
 */
export function formatHoursReadable(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const remaining = rounded % 60
  return `${hours}h${String(remaining).padStart(2, '0')}`
}

function formatDateFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatPeriodRange(period: ExportPeriod): string {
  return `du ${formatDateFromMs(period.startMs)} au ${formatDateFromMs(period.endMs)}`
}

function etatColor(etat: ExportEtat): string | null {
  if (etat === 'En cours') return SUCCESS_TEXT
  if (etat === 'En pause') return WARNING_TEXT
  return null // "Terminée" : couleur de texte par défaut, pas de mise en avant
}

function applyPrintSetup(sheet: ExcelJS.Worksheet, orientation: 'portrait' | 'landscape'): void {
  sheet.pageSetup = {
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5, header: 0.3, footer: 0.3 },
  }
}

/** En-tête de tableau : fond bleu sombre, texte blanc, bordures, gel possible via l'appelant. */
function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = THIN_BORDER
  })
  row.height = 22
}

/** Ligne de donnée standard : bordures légères, alignement vertical centré. */
function styleDataRow(row: ExcelJS.Row, rightAlignColumns: number[] = []): void {
  row.eachCell((cell, colNumber) => {
    cell.border = THIN_BORDER
    cell.alignment = { vertical: 'middle', horizontal: rightAlignColumns.includes(colNumber) ? 'right' : 'left' }
  })
  row.height = 18
}

/** Ligne TOTAL : fond bleu très clair, texte bleu sombre en gras — se détache sans être criarde. */
function styleTotalRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }
    cell.border = THIN_BORDER
  })
  row.height = 20
}

/** Bandeau de titre de section en haut d'une feuille secondaire (titre + période). */
function writeSectionHeader(sheet: ExcelJS.Worksheet, lastColumnLetter: string, title: string, period: ExportPeriod): void {
  sheet.mergeCells(`A1:${lastColumnLetter}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value = title
  titleCell.font = { bold: true, size: 14, color: { argb: NAVY } }
  sheet.getRow(1).height = 26

  sheet.mergeCells(`A2:${lastColumnLetter}2`)
  const periodCell = sheet.getCell('A2')
  periodCell.value = `Période : ${period.label} (${formatPeriodRange(period)})`
  periodCell.font = { italic: true, size: 10, color: { argb: MUTED } }
}

/**
 * Bandeau des 5 indicateurs clés (2 lignes : libellés puis valeurs), sur
 * les colonnes A à E — partagé entre Dashboard et Synthèse pour une
 * lecture cohérente d'une feuille à l'autre. Les valeurs proviennent
 * uniquement de `totals` (computeExportTotals) : aucune recomputation ici.
 */
function writeKpiBand(sheet: ExcelJS.Worksheet, startRow: number, totals: ReturnType<typeof computeExportTotals>): number {
  const kpiLabels = ['Employés', 'Chantiers', 'Interventions', 'Heures travaillées', 'Anomalies']
  const kpiValues: Array<string | number> = [
    totals.employeCount,
    totals.chantierCount,
    totals.interventionCount,
    formatHoursReadable(totals.workedMinutes),
    totals.anomalyCount,
  ]

  const kpiLabelRow = sheet.getRow(startRow)
  const kpiValueRow = sheet.getRow(startRow + 1)
  kpiLabels.forEach((label, index) => {
    const col = index + 1
    const labelCell = kpiLabelRow.getCell(col)
    labelCell.value = label
    labelCell.font = { bold: true, size: 10, color: { argb: NAVY } }
    labelCell.alignment = { horizontal: 'center' }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }

    const valueCell = kpiValueRow.getCell(col)
    valueCell.value = kpiValues[index]
    valueCell.font = {
      bold: true,
      size: 18,
      color: { argb: label === 'Anomalies' && totals.anomalyCount > 0 ? DANGER_TEXT : NAVY },
    }
    valueCell.alignment = { horizontal: 'center' }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }
  })
  kpiLabelRow.height = 18
  kpiValueRow.height = 28

  return startRow + 2
}

/**
 * Règle de mise en forme conditionnelle "barre de données" — le graphique
 * natif le plus proche de ce qu'ExcelJS sait produire (voir l'audit dans
 * addDashboardSheet ci-dessous). `color` n'est pas listé dans les types
 * ExcelJS publiés mais est bien lu à l'exécution par DatabarXform — d'où
 * le cast.
 */
function dataBarRule(colorArgb: string): ExcelJS.DataBarRuleType {
  return {
    type: 'dataBar',
    priority: 1,
    gradient: false,
    border: false,
    showValue: true,
    cfvo: [{ type: 'min' }, { type: 'max' }],
    color: { argb: colorArgb },
  } as ExcelJS.DataBarRuleType
}

interface LabeledValue {
  label: string
  value: number
}

/**
 * Regroupe les ExportRow par jour calendaire (à partir de `arriveeIso`,
 * déjà calculé) — même principe que summarizeRowsByEmploye/Chantier dans
 * exportData.ts, mais gardé local à ce module car propre à la
 * visualisation "Évolution des heures par jour" du Dashboard : aucune
 * autre feuille n'en a besoin, et cela évite de faire grossir la surface
 * publique d'exportData.ts pour un seul consommateur.
 */
function summarizeRowsByDay(rows: ExportRow[]): LabeledValue[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = row.arriveeIso.slice(0, 10) // 'YYYY-MM-DD' → tri chronologique direct par égalité de chaîne
    map.set(key, (map.get(key) ?? 0) + row.workedMinutes)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, workedMinutes]) => ({ label: formatDate(`${key}T00:00:00`), value: minutesToDecimalHours(workedMinutes) }))
}

/** Compte les anomalies par type (libellé) déjà calculées par computeAnomalies — aucune nouvelle règle. */
function summarizeAnomaliesByType(rows: ExportRow[]): LabeledValue[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    for (const anomaly of row.anomalies) {
      map.set(anomaly.label, (map.get(anomaly.label) ?? 0) + 1)
    }
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

/**
 * Écrit une section "graphique" (titre + tableau à 2 colonnes + barre de
 * données Excel native sur la colonne de valeurs) et renvoie le numéro de
 * ligne suivant disponible. `emptyMessage` s'affiche à la place du
 * tableau si `entries` est vide (ex. aucune anomalie sur la période).
 */
function writeBarSection(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  columnLabels: [string, string],
  entries: LabeledValue[],
  barColorArgb: string,
  valueNumFmt: string,
  emptyMessage?: string,
): number {
  let row = startRow

  sheet.mergeCells(`A${row}:F${row}`)
  const titleCell = sheet.getCell(`A${row}`)
  titleCell.value = title
  titleCell.font = { bold: true, size: 13, color: { argb: NAVY } }
  titleCell.border = { bottom: { style: 'thin', color: { argb: ACCENT_BLUE } } }
  sheet.getRow(row).height = 22
  row += 1

  if (entries.length === 0) {
    sheet.mergeCells(`A${row}:F${row}`)
    const cell = sheet.getCell(`A${row}`)
    cell.value = emptyMessage ?? '—'
    cell.font = { italic: true, size: 11, color: { argb: SUCCESS_TEXT } }
    sheet.getRow(row).height = 20
    return row + 2
  }

  const headerRow = sheet.getRow(row)
  headerRow.getCell(1).value = columnLabels[0]
  headerRow.getCell(2).value = columnLabels[1]
  styleHeaderRow(headerRow)
  row += 1

  const dataStartRow = row
  for (const entry of entries) {
    const dataRow = sheet.getRow(row)
    dataRow.getCell(1).value = entry.label
    dataRow.getCell(2).value = entry.value
    dataRow.getCell(2).numFmt = valueNumFmt
    styleDataRow(dataRow, [2])
    row += 1
  }
  const dataEndRow = row - 1

  sheet.addConditionalFormatting({
    ref: `B${dataStartRow}:B${dataEndRow}`,
    rules: [dataBarRule(barColorArgb)],
  })

  return row + 1
}

// ----------------------------------------------------------------------------
// Feuille 0 — Dashboard
// ----------------------------------------------------------------------------
//
// AUDIT — graphiques natifs Excel via ExcelJS :
// ExcelJS (package publié sur npm, version installée ici : 4.4.0) n'expose
// aucune API de CRÉATION de graphique natif (barres/lignes/secteurs) : sa
// documentation et son changelog ne mentionnent les "chart" que pour ne pas
// planter à la LECTURE d'un classeur qui en contient déjà un (issue #466,
// "Don't break when loading an Excel file containing a chartsheet") — il
// n'existe pas de `worksheet.addChart(...)` ni d'équivalent. Alternative
// écartée : générer les graphiques comme IMAGES (ex. via un moteur de rendu
// canvas côté Node) puis les insérer avec `workbook.addImage` — cette API
// existe bien dans ExcelJS, mais elle produirait des images figées (donc
// pas de mise à jour si l'utilisateur trie/filtre le classeur) et
// ajouterait une dépendance de rendu graphique supplémentaire pour un
// résultat au final moins fiable qu'une fonctionnalité native.
// Solution retenue : les "barres de données" (data bars), une mise en
// forme conditionnelle NATIVE d'Excel (`ConditionalFormattingRule` de type
// `dataBar`, bien supportée par ExcelJS en écriture) rendent directement
// dans la cellule une barre proportionnelle à la valeur — un vrai visuel
// de type graphique, sans dépendance ajoutée, et qui reste un objet Excel
// natif (donc fiable à l'ouverture, à l'impression et si les données sont
// filtrées/triées).

function addDashboardSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  totals: ReturnType<typeof computeExportTotals>,
  byEmploye: ReturnType<typeof summarizeRowsByEmploye>,
  byChantier: ReturnType<typeof summarizeRowsByChantier>,
  rows: ExportRow[],
  organizationName: string,
): void {
  const sheet = workbook.addWorksheet('Dashboard')
  sheet.columns = [{ width: 28 }, { width: 17 }, { width: 17 }, { width: 15 }, { width: 13 }, { width: 13 }]
  applyPrintSetup(sheet, 'portrait')
  sheet.views = [{ state: 'normal', showGridLines: false }]

  sheet.mergeCells('A1:F1')
  const orgCell = sheet.getCell('A1')
  orgCell.value = organizationName
  orgCell.font = { bold: true, size: 13, color: { argb: NAVY } }
  sheet.getRow(1).height = 20

  sheet.mergeCells('A2:F2')
  const titleCell = sheet.getCell('A2')
  titleCell.value = 'Dashboard'
  titleCell.font = { bold: true, size: 20, color: { argb: NAVY } }
  sheet.getRow(2).height = 30

  sheet.getCell('A4').value = 'Période'
  sheet.getCell('A4').font = { bold: true, size: 10, color: { argb: MUTED } }
  sheet.mergeCells('A5:D5')
  sheet.getCell('A5').value = formatPeriodRange(period)
  sheet.getCell('A5').font = { size: 12, color: { argb: NAVY } }

  let row = writeKpiBand(sheet, 7, totals)
  row += 1 // ligne vide après le bandeau KPI

  const byEmployeEntries: LabeledValue[] = byEmploye.map((emp) => ({
    label: emp.employeName,
    value: minutesToDecimalHours(emp.workedMinutes),
  }))
  row = writeBarSection(sheet, row, 'Heures par salarié', ['Employé', 'Heures travaillées (h)'], byEmployeEntries, ACCENT_BLUE, HOURS_FORMAT)

  const byChantierEntries: LabeledValue[] = byChantier.map((chantier) => ({
    label: chantier.chantierName,
    value: minutesToDecimalHours(chantier.workedMinutes),
  }))
  row = writeBarSection(sheet, row, 'Heures par chantier', ['Chantier', 'Heures travaillées (h)'], byChantierEntries, ACCENT_BLUE, HOURS_FORMAT)

  const byDayEntries = summarizeRowsByDay(rows)
  row = writeBarSection(sheet, row, 'Évolution des heures par jour', ['Date', 'Heures travaillées (h)'], byDayEntries, ACCENT_BLUE, HOURS_FORMAT)

  const anomaliesByType = summarizeAnomaliesByType(rows)
  writeBarSection(
    sheet,
    row,
    'Anomalies',
    ["Type d’anomalie", 'Occurrences'],
    anomaliesByType,
    DANGER_TEXT,
    '0',
    'Aucune anomalie sur la période.',
  )
}

// ----------------------------------------------------------------------------
// Feuille 1 — Synthèse
// ----------------------------------------------------------------------------

function addSyntheseSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  totals: ReturnType<typeof computeExportTotals>,
  byEmploye: ReturnType<typeof summarizeRowsByEmploye>,
  organizationName: string,
): void {
  const sheet = workbook.addWorksheet('Synthèse')
  sheet.columns = [{ width: 28 }, { width: 17 }, { width: 17 }, { width: 15 }, { width: 13 }, { width: 13 }]
  applyPrintSetup(sheet, 'landscape')

  sheet.mergeCells('A1:F1')
  const orgCell = sheet.getCell('A1')
  orgCell.value = organizationName
  orgCell.font = { bold: true, size: 13, color: { argb: NAVY } }
  sheet.getRow(1).height = 20

  sheet.mergeCells('A2:F2')
  const titleCell = sheet.getCell('A2')
  titleCell.value = 'Synthèse des heures'
  titleCell.font = { bold: true, size: 20, color: { argb: NAVY } }
  sheet.getRow(2).height = 30

  sheet.getCell('A4').value = 'Période'
  sheet.getCell('A4').font = { bold: true, size: 10, color: { argb: MUTED } }
  sheet.mergeCells('A5:D5')
  sheet.getCell('A5').value = formatPeriodRange(period)
  sheet.getCell('A5').font = { size: 12, color: { argb: NAVY } }

  writeKpiBand(sheet, 7, totals)

  sheet.mergeCells('A10:F10')
  const sectionCell = sheet.getCell('A10')
  sectionCell.value = 'Synthèse par salarié'
  sectionCell.font = { bold: true, size: 13, color: { argb: NAVY } }
  sectionCell.border = { bottom: { style: 'thin', color: { argb: ACCENT_BLUE } } }
  sheet.getRow(10).height = 22

  const headerRow = sheet.getRow(11)
  ;['Employé', 'Temps travaillé', 'Heures décimales', 'Interventions', 'Chantiers', 'Anomalies'].forEach(
    (label, index) => {
      headerRow.getCell(index + 1).value = label
    },
  )
  styleHeaderRow(headerRow)

  let rowNumber = 12
  for (const emp of byEmploye) {
    const row = sheet.getRow(rowNumber)
    row.getCell(1).value = emp.employeName
    row.getCell(2).value = formatHoursReadable(emp.workedMinutes)
    row.getCell(3).value = minutesToDecimalHours(emp.workedMinutes)
    row.getCell(3).numFmt = HOURS_FORMAT
    row.getCell(4).value = emp.interventionCount
    row.getCell(5).value = emp.chantierIds.size
    row.getCell(6).value = emp.anomalyCount
    if (emp.anomalyCount > 0) row.getCell(6).font = { color: { argb: DANGER_TEXT }, bold: true }
    styleDataRow(row, [2, 3, 4, 5, 6])
    rowNumber += 1
  }

  const totalRow = sheet.getRow(rowNumber)
  totalRow.getCell(1).value = 'TOTAL'
  totalRow.getCell(2).value = formatHoursReadable(totals.workedMinutes)
  totalRow.getCell(3).value = minutesToDecimalHours(totals.workedMinutes)
  totalRow.getCell(3).numFmt = HOURS_FORMAT
  totalRow.getCell(4).value = totals.interventionCount
  totalRow.getCell(5).value = totals.chantierCount
  totalRow.getCell(6).value = totals.anomalyCount
  styleTotalRow(totalRow)

  sheet.views = [{ state: 'frozen', ySplit: 11 }]
  sheet.autoFilter = 'A11:F11'
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
    { key: 'employe', width: 24 },
    { key: 'periode', width: 20 },
    { key: 'interventions', width: 14 },
    { key: 'pause', width: 14 },
    { key: 'pauseDecimale', width: 14 },
    { key: 'heures', width: 15 },
    { key: 'heuresDecimales', width: 15 },
    { key: 'anomalies', width: 12 },
  ]
  applyPrintSetup(sheet, 'landscape')
  writeSectionHeader(sheet, 'H', 'Par salarié', period)
  sheet.addRow([])

  const headerRow = sheet.addRow({
    employe: 'Employé',
    periode: 'Période',
    interventions: 'Interventions',
    pause: 'Temps de pause',
    pauseDecimale: 'Pause décimale',
    heures: 'Temps travaillé',
    heuresDecimales: 'Heures décimales',
    anomalies: 'Anomalies',
  })
  styleHeaderRow(headerRow)

  for (const emp of byEmploye) {
    const row = sheet.addRow({
      employe: emp.employeName,
      periode: period.label,
      interventions: emp.interventionCount,
      pause: formatHoursReadable(emp.pauseMinutes),
      pauseDecimale: minutesToDecimalHours(emp.pauseMinutes),
      heures: formatHoursReadable(emp.workedMinutes),
      heuresDecimales: minutesToDecimalHours(emp.workedMinutes),
      anomalies: emp.anomalyCount,
    })
    if (emp.anomalyCount > 0) row.getCell(8).font = { color: { argb: DANGER_TEXT }, bold: true }
    styleDataRow(row, [3, 4, 5, 6, 7, 8])
  }

  const totalPauseMinutes = byEmploye.reduce((sum, emp) => sum + emp.pauseMinutes, 0)
  const totalRow = sheet.addRow({
    employe: 'TOTAL',
    periode: '',
    interventions: totals.interventionCount,
    pause: formatHoursReadable(totalPauseMinutes),
    pauseDecimale: minutesToDecimalHours(totalPauseMinutes),
    heures: formatHoursReadable(totals.workedMinutes),
    heuresDecimales: minutesToDecimalHours(totals.workedMinutes),
    anomalies: totals.anomalyCount,
  })
  styleTotalRow(totalRow)

  sheet.getColumn('pauseDecimale').numFmt = HOURS_FORMAT
  sheet.getColumn('heuresDecimales').numFmt = HOURS_FORMAT
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
  sheet.autoFilter = 'A4:H4'
}

// ----------------------------------------------------------------------------
// Feuille 3 — Par chantier
// ----------------------------------------------------------------------------

function addParChantierSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  totals: ReturnType<typeof computeExportTotals>,
  byChantier: ReturnType<typeof summarizeRowsByChantier>,
): void {
  const sheet = workbook.addWorksheet('Par chantier')
  sheet.columns = [
    { key: 'chantier', width: 26 },
    { key: 'salaries', width: 13 },
    { key: 'interventions', width: 15 },
    { key: 'heures', width: 15 },
    { key: 'heuresDecimales', width: 16 },
    { key: 'anomalies', width: 12 },
  ]
  applyPrintSetup(sheet, 'landscape')
  writeSectionHeader(sheet, 'F', 'Par chantier', period)
  sheet.addRow([])

  const headerRow = sheet.addRow({
    chantier: 'Chantier',
    salaries: 'Salariés',
    interventions: 'Interventions',
    heures: 'Temps travaillé',
    heuresDecimales: 'Heures décimales',
    anomalies: 'Anomalies',
  })
  styleHeaderRow(headerRow)

  for (const chantier of byChantier) {
    const row = sheet.addRow({
      chantier: chantier.chantierName,
      salaries: chantier.employeIds.size,
      interventions: chantier.interventionCount,
      heures: formatHoursReadable(chantier.workedMinutes),
      heuresDecimales: minutesToDecimalHours(chantier.workedMinutes),
      anomalies: chantier.anomalyCount,
    })
    if (chantier.anomalyCount > 0) row.getCell(6).font = { color: { argb: DANGER_TEXT }, bold: true }
    styleDataRow(row, [2, 3, 4, 5, 6])
  }

  const totalRow = sheet.addRow({
    chantier: 'TOTAL',
    salaries: totals.employeCount,
    interventions: totals.interventionCount,
    heures: formatHoursReadable(totals.workedMinutes),
    heuresDecimales: minutesToDecimalHours(totals.workedMinutes),
    anomalies: totals.anomalyCount,
  })
  styleTotalRow(totalRow)

  sheet.getColumn('heuresDecimales').numFmt = HOURS_FORMAT
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
  sheet.autoFilter = 'A4:F4'
}

// ----------------------------------------------------------------------------
// Feuille 4 — Détail pointages
// ----------------------------------------------------------------------------

function addDetailSheet(workbook: ExcelJS.Workbook, period: ExportPeriod, rows: ExportRow[]): void {
  const sheet = workbook.addWorksheet('Détail pointages')
  sheet.columns = [
    { key: 'date', width: 12 },
    { key: 'employe', width: 22 },
    { key: 'chantier', width: 24 },
    { key: 'arrivee', width: 10 },
    { key: 'pauseDebut', width: 12 },
    { key: 'pauseFin', width: 10 },
    { key: 'depart', width: 10 },
    { key: 'tempsPause', width: 12 },
    { key: 'tempsTravaille', width: 14 },
    { key: 'heuresDecimales', width: 15 },
    { key: 'etat', width: 12 },
    { key: 'distance', width: 13 },
    { key: 'precision', width: 13 },
    { key: 'controle', width: 13 },
    { key: 'anomalies', width: 34 },
  ]
  applyPrintSetup(sheet, 'landscape')
  writeSectionHeader(sheet, 'O', 'Détail des pointages', period)
  sheet.addRow([])

  const headerRow = sheet.addRow({
    date: 'Date',
    employe: 'Employé',
    chantier: 'Chantier',
    arrivee: 'Arrivée',
    pauseDebut: 'Début pause',
    pauseFin: 'Fin pause',
    depart: 'Départ',
    tempsPause: 'Temps pause',
    tempsTravaille: 'Temps travaillé',
    heuresDecimales: 'Heures décimales',
    etat: 'État',
    distance: 'Distance GPS',
    precision: 'Précision GPS',
    controle: 'Contrôle',
    anomalies: 'Anomalies',
  })
  styleHeaderRow(headerRow)

  for (const row of rows) {
    const excelRow = sheet.addRow({
      date: formatDate(row.arriveeIso),
      employe: row.employeName,
      chantier: row.chantierName,
      arrivee: formatTime(row.arriveeIso),
      pauseDebut: row.pauseDebutIso ? formatTime(row.pauseDebutIso) : '',
      pauseFin: row.pauseFinIso ? formatTime(row.pauseFinIso) : '',
      depart: row.departIso ? formatTime(row.departIso) : '',
      tempsPause: formatHoursReadable(row.pauseMinutes),
      tempsTravaille: formatHoursReadable(row.workedMinutes),
      heuresDecimales: minutesToDecimalHours(row.workedMinutes),
      etat: row.etat,
      distance: row.arriveeDistanceM != null ? Math.round(row.arriveeDistanceM) : '',
      precision: row.arriveeAccuracyM != null ? Math.round(row.arriveeAccuracyM) : '',
      controle: row.anomalies.length === 0 ? 'Conforme' : 'À vérifier',
      anomalies: row.anomalies.map((a) => a.label).join(' · '),
    })
    styleDataRow(excelRow, [8, 9, 10, 12, 13])

    const etatCellColor = etatColor(row.etat)
    if (etatCellColor) excelRow.getCell(11).font = { color: { argb: etatCellColor }, bold: true }
    excelRow.getCell(14).font = {
      color: { argb: row.anomalies.length === 0 ? SUCCESS_TEXT : DANGER_TEXT },
      bold: row.anomalies.length > 0,
    }
  }

  sheet.getColumn('heuresDecimales').numFmt = HOURS_FORMAT
  sheet.getColumn('distance').numFmt = '0" m"'
  sheet.getColumn('precision').numFmt = '0" m"'
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
  sheet.autoFilter = 'A4:O4'
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
        ? `Durée maximale configurée : ${formatHoursReadable(chantier.duree_max_intervention_minutes)}`
        : ''
    case 'depart-manquant':
      return 'Aucun départ enregistré depuis l’arrivée.'
    case 'pause-non-terminee':
      return 'La pause n’a pas été clôturée par une reprise.'
    default:
      return ''
  }
}

function addAnomaliesSheet(
  workbook: ExcelJS.Workbook,
  period: ExportPeriod,
  rows: ExportRow[],
  chantierById: Map<string, Chantier>,
): void {
  const sheet = workbook.addWorksheet('Anomalies')
  sheet.columns = [
    { key: 'date', width: 12 },
    { key: 'employe', width: 22 },
    { key: 'chantier', width: 24 },
    { key: 'type', width: 22 },
    { key: 'detail', width: 42 },
    { key: 'arrivee', width: 10 },
    { key: 'depart', width: 10 },
  ]
  applyPrintSetup(sheet, 'landscape')
  writeSectionHeader(sheet, 'G', 'Anomalies', period)
  sheet.addRow([])

  const headerRow = sheet.addRow({
    date: 'Date',
    employe: 'Employé',
    chantier: 'Chantier',
    type: "Type d’anomalie",
    detail: 'Détail',
    arrivee: 'Arrivée',
    depart: 'Départ',
  })
  styleHeaderRow(headerRow)

  let anomalyRowCount = 0
  for (const row of rows) {
    for (const anomaly of row.anomalies) {
      anomalyRowCount += 1
      const excelRow = sheet.addRow({
        date: formatDate(row.arriveeIso),
        employe: row.employeName,
        chantier: row.chantierName,
        type: anomaly.label,
        detail: anomalyDetail(anomaly, row, chantierById.get(row.chantierId)),
        arrivee: formatTime(row.arriveeIso),
        depart: row.departIso ? formatTime(row.departIso) : '',
      })
      styleDataRow(excelRow)
      excelRow.getCell(4).font = { color: { argb: DANGER_TEXT }, bold: true }
    }
  }

  if (anomalyRowCount === 0) {
    sheet.mergeCells('A5:G5')
    const cell = sheet.getCell('A5')
    cell.value = 'Aucune anomalie sur la période.'
    cell.font = { italic: true, size: 12, color: { argb: SUCCESS_TEXT } }
    cell.alignment = { horizontal: 'center' }
    sheet.getRow(5).height = 24
  } else {
    sheet.views = [{ state: 'frozen', ySplit: 4 }]
    sheet.autoFilter = 'A4:G4'
  }
}

// ----------------------------------------------------------------------------
// Assemblage + téléchargement
// ----------------------------------------------------------------------------

export interface BuildXlsxParams {
  rows: ExportRow[]
  chantierById: Map<string, Chantier>
  period: ExportPeriod
  /**
   * Nom de l'entreprise affiché en en-tête de la feuille Synthèse.
   * L'app n'expose aujourd'hui aucune donnée "organisation" fiable côté
   * export — ce paramètre reste optionnel (repli sur "PointageChantier")
   * pour qu'un futur écran de paramétrage entreprise puisse l'alimenter
   * sans modifier à nouveau ce module.
   */
  organizationName?: string
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
  const { rows, chantierById, period, organizationName } = params
  const orgName = organizationName?.trim() || DEFAULT_ORG_NAME

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PointageChantier'
  workbook.created = new Date()

  const totals = computeExportTotals(rows)
  const byEmploye = summarizeRowsByEmploye(rows)
  const byChantier = summarizeRowsByChantier(rows)

  addDashboardSheet(workbook, period, totals, byEmploye, byChantier, rows, orgName)
  addSyntheseSheet(workbook, period, totals, byEmploye, orgName)
  addParSalarieSheet(workbook, period, totals, byEmploye)
  addParChantierSheet(workbook, period, totals, byChantier)
  addDetailSheet(workbook, period, rows)
  addAnomaliesSheet(workbook, period, rows, chantierById)

  return workbook
}

export async function buildAndDownloadXlsx(params: BuildXlsxParams, filename: string): Promise<void> {
  const workbook = buildWorkbook(params)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(filename, blob)
}
