import type { ExportRow } from './exportData'
import { formatDate, formatMinutes, formatTime } from './formatters'

const HEADERS = [
  'Employé',
  'Chantier',
  'Date',
  'Arrivée',
  'Début pause',
  'Fin pause',
  'Départ',
  'Temps de pause',
  'Temps travaillé',
  'État',
  'Contrôle GPS',
  'Anomalies',
]

/** Entoure de guillemets et double les guillemets internes, uniquement si le champ contient le séparateur, un guillemet ou un saut de ligne — évite d'alourdir inutilement les champs simples. */
function escapeCsvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * CSV prêt pour Excel en environnement français : séparateur ";",
 * lignes CRLF, dates/heures déjà formatées en fr-FR — reconstruit à
 * partir des ExportRow (elles-mêmes dérivées de buildInterventions),
 * aucun recalcul de durée ici.
 */
export function buildCsvContent(rows: ExportRow[]): string {
  const lines = [HEADERS.join(';')]

  for (const row of rows) {
    const values = [
      row.employeName,
      row.chantierName,
      formatDate(row.arriveeIso),
      formatTime(row.arriveeIso),
      row.pauseDebutIso ? formatTime(row.pauseDebutIso) : '',
      row.pauseFinIso ? formatTime(row.pauseFinIso) : '',
      row.departIso ? formatTime(row.departIso) : '',
      formatMinutes(row.pauseMinutes),
      formatMinutes(row.workedMinutes),
      row.etat,
      row.anomalies.length === 0 ? 'Conforme' : 'À vérifier',
      row.anomalies.map((a) => a.label).join(' · '),
    ]
    lines.push(values.map((value) => escapeCsvField(String(value))).join(';'))
  }

  return lines.join('\r\n')
}

/**
 * Déclenche le téléchargement du CSV. BOM UTF-8 en tête : sans lui,
 * Excel (Windows en particulier) interprète souvent les accents comme du
 * Latin-1 et affiche des caractères corrompus.
 */
export function downloadCsv(filename: string, content: string): void {
  const BOM = '﻿'
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
