import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { listChantiers } from '../services/chantierService'
import { listEmployeeProfiles } from '../services/employeService'
import { listPointagesForExport } from '../services/pointageService'
import { buildCsvContent, downloadCsv } from '../lib/csvExport'
import {
  buildExportRows,
  periodFileSuffix,
  resolveExportPeriod,
  type ExportPeriodPreset,
} from '../lib/exportData'
import type { Chantier, Profile } from '../types/database'

const GENERIC_EXPORT_ERROR = 'Impossible de générer l’export. Réessayez.'
const NO_DATA_MESSAGE = 'Aucun pointage disponible pour cette période.'

type CardFeedback = { type: 'error' | 'info'; text: string } | null

const PERIOD_PRESETS: Array<{ key: ExportPeriodPreset; label: string }> = [
  { key: 'ce-mois', label: 'Ce mois' },
  { key: 'mois-precedent', label: 'Mois précédent' },
  { key: 'personnalisee', label: 'Période personnalisée' },
]

export function ExportsPage() {
  const [employes, setEmployes] = useState<Profile[]>([])
  const [chantiers, setChantiers] = useState<Chantier[]>([])

  const [employeId, setEmployeId] = useState('')
  const [chantierId, setChantierId] = useState('')
  const [periodPreset, setPeriodPreset] = useState<ExportPeriodPreset>('ce-mois')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const [csvGenerating, setCsvGenerating] = useState(false)
  const [xlsxGenerating, setXlsxGenerating] = useState(false)
  const [csvMessage, setCsvMessage] = useState<CardFeedback>(null)
  const [xlsxMessage, setXlsxMessage] = useState<CardFeedback>(null)

  // Verrou synchrone (vs. simple state) : sur un double-clic rapide, deux
  // gestionnaires peuvent démarrer avant que le premier setState(true) ne
  // soit rendu — seul un ref lu/écrit avant tout await empêche vraiment
  // un second appel concurrent.
  const csvLockRef = useRef(false)
  const xlsxLockRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    Promise.all([listEmployeeProfiles(), listChantiers()]).then(([employesRes, chantiersRes]) => {
      if (!isMounted) return
      setEmployes(employesRes.data)
      setChantiers(chantiersRes.data)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const chantierById = useMemo(() => new Map(chantiers.map((chantier) => [chantier.id, chantier])), [chantiers])

  const period = useMemo(
    () => resolveExportPeriod(periodPreset, customStart, customEnd, Date.now()),
    [periodPreset, customStart, customEnd],
  )

  async function generateCsv() {
    if (csvLockRef.current || !period) return
    csvLockRef.current = true
    setCsvGenerating(true)
    setCsvMessage(null)

    try {
      const res = await listPointagesForExport({ employeId: employeId || undefined, chantierId: chantierId || undefined })
      if (res.error) {
        console.error('[ExportsPage] erreur Supabase lors du chargement des pointages (CSV) :', res.error)
        setCsvMessage({ type: 'error', text: GENERIC_EXPORT_ERROR })
        return
      }

      const rows = buildExportRows(res.data, chantierById, period, Date.now())
      if (rows.length === 0) {
        setCsvMessage({ type: 'info', text: NO_DATA_MESSAGE })
        return
      }

      const content = buildCsvContent(rows)
      const filename = `PointageChantier_${periodFileSuffix(periodPreset, period, customStart, customEnd)}.csv`
      downloadCsv(filename, content)
    } catch (err) {
      console.error('[ExportsPage] erreur inattendue lors de l’export CSV :', err)
      setCsvMessage({ type: 'error', text: GENERIC_EXPORT_ERROR })
    } finally {
      csvLockRef.current = false
      setCsvGenerating(false)
    }
  }

  async function generateXlsx() {
    if (xlsxLockRef.current || !period) return
    xlsxLockRef.current = true
    setXlsxGenerating(true)
    setXlsxMessage(null)

    try {
      const res = await listPointagesForExport({ employeId: employeId || undefined, chantierId: chantierId || undefined })
      if (res.error) {
        console.error('[ExportsPage] erreur Supabase lors du chargement des pointages (Excel) :', res.error)
        setXlsxMessage({ type: 'error', text: GENERIC_EXPORT_ERROR })
        return
      }

      const rows = buildExportRows(res.data, chantierById, period, Date.now())
      if (rows.length === 0) {
        setXlsxMessage({ type: 'info', text: NO_DATA_MESSAGE })
        return
      }

      const { buildAndDownloadXlsx } = await import('../lib/xlsxExport')
      const filename = `PointageChantier_${periodFileSuffix(periodPreset, period, customStart, customEnd)}.xlsx`
      await buildAndDownloadXlsx({ rows, chantierById, period }, filename)
    } catch (err) {
      console.error('[ExportsPage] erreur inattendue lors de l’export Excel :', err)
      setXlsxMessage({ type: 'error', text: GENERIC_EXPORT_ERROR })
    } finally {
      xlsxLockRef.current = false
      setXlsxGenerating(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Exports"
        subtitle="Préparez les heures de vos équipes pour votre suivi administratif et votre paie."
      />

      <Card>
        <div className="field">
          <label className="field-label">Période</label>
          <div className="preset-group">
            {PERIOD_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                size="sm"
                variant={periodPreset === preset.key ? 'primary' : 'secondary'}
                onClick={() => setPeriodPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {periodPreset === 'personnalisee' && (
            <div className="form-grid-2 card-section-gap">
              <Input
                label="Date de début"
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <Input
                label="Date de fin"
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          )}
          <p className="field-hint">
            {period ? `Période sélectionnée : ${period.label}` : 'Choisissez une date de début et une date de fin valides.'}
          </p>
        </div>

        <div className="filters-bar card-section-gap">
          <Select label="Employé" value={employeId} onChange={(event) => setEmployeId(event.target.value)}>
            <option value="">Tous les employés</option>
            {employes.map((employe) => (
              <option key={employe.id} value={employe.id}>
                {employe.full_name || employe.email}
              </option>
            ))}
          </Select>

          <Select label="Chantier" value={chantierId} onChange={(event) => setChantierId(event.target.value)}>
            <option value="">Tous les chantiers</option>
            {chantiers.map((chantier) => (
              <option key={chantier.id} value={chantier.id}>
                {chantier.nom}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="dashboard-grid">
        <Card>
          <div className="card-header">
            <h2 className="card-title">Export CSV</h2>
          </div>
          <p className="entity-card-meta">Export simple des heures et pointages de la période sélectionnée.</p>

          <div className="card-section-gap">
            {csvMessage && (
              <p className={csvMessage.type === 'error' ? 'error-banner' : 'info-banner'}>
                {csvMessage.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                {csvMessage.text}
              </p>
            )}

            <Button
              variant="primary"
              icon={<Download size={16} />}
              disabled={csvGenerating || !period}
              onClick={() => void generateCsv()}
            >
              {csvGenerating ? 'Génération en cours…' : 'Télécharger le CSV'}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <h2 className="card-title">Pack Excel &amp; Paie</h2>
            <Badge variant="info">PREMIUM</Badge>
          </div>
          <p className="entity-card-meta">
            Générez automatiquement un classeur Excel complet (synthèse, détail par salarié et par chantier, détail des
            pointages, anomalies) prêt pour votre préparation de paie.
          </p>

          <div className="card-section-gap">
            {xlsxMessage && (
              <p className={xlsxMessage.type === 'error' ? 'error-banner' : 'info-banner'}>
                {xlsxMessage.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                {xlsxMessage.text}
              </p>
            )}

            <Button
              variant="primary"
              icon={<FileSpreadsheet size={16} />}
              disabled={xlsxGenerating || !period}
              onClick={() => void generateXlsx()}
            >
              {xlsxGenerating ? 'Génération en cours…' : 'Générer le fichier Excel'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
