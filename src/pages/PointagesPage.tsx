import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ResponsiveTable, type ResponsiveTableColumn } from '../components/ui/ResponsiveTable'
import { listChantiers } from '../services/chantierService'
import { listEmployeeProfiles } from '../services/employeService'
import { listPointagesWithRelations, type PointageWithRelations } from '../services/pointageService'
import { buildInterventions, computeLiveMinutes, type Intervention } from '../lib/pointageStats'
import { computeAnomalies, type AnomalyInfo } from '../lib/anomalies'
import { buildPositionUrl } from '../lib/itineraire'
import { formatDate, formatMinutes, formatTime } from '../lib/formatters'
import type { Chantier, Profile } from '../types/database'

interface PointageRow {
  key: string
  employeName: string
  chantierName: string
  chantierId: string
  date: string
  arriveeTime: string
  departTime: string | null
  workedLabel: string | null
  isOpen: boolean
  isPaused: boolean
  anomalies: AnomalyInfo[]
  sortValue: number
  intervention: Intervention<PointageWithRelations>
}

// Regroupe par employé (une intervention est globale à l'employé) puis
// reconstitue les interventions (arrivée/pauses/départ) pour obtenir une
// ligne par intervention, avec ses anomalies dérivées des données brutes.
//
// Limite connue : les filtres (employé/chantier/date) s'appliquent en
// amont côté Supabase ; une intervention à cheval sur la frontière du
// filtre peut apparaître incomplète dans le résultat filtré.
function buildRows(
  pointages: PointageWithRelations[],
  chantierById: Map<string, Chantier>,
  nowMs: number,
): PointageRow[] {
  const groups = new Map<string, PointageWithRelations[]>()
  for (const pointage of pointages) {
    const group = groups.get(pointage.employe_id)
    if (group) {
      group.push(pointage)
    } else {
      groups.set(pointage.employe_id, [pointage])
    }
  }

  const rows: PointageRow[] = []

  for (const group of groups.values()) {
    const interventions = buildInterventions(group)

    for (const intervention of interventions) {
      const chantier = chantierById.get(intervention.chantierId)
      const anomalies = computeAnomalies(intervention, chantier, nowMs)
      const sortDate = intervention.depart?.pointe_at ?? intervention.arrivee.pointe_at

      rows.push({
        key: intervention.depart?.id ?? intervention.arrivee.id,
        employeName: intervention.arrivee.profiles?.full_name || intervention.arrivee.profiles?.email || 'Employé',
        chantierName: intervention.arrivee.chantiers?.nom ?? chantier?.nom ?? '—',
        chantierId: intervention.chantierId,
        date: formatDate(intervention.arrivee.pointe_at),
        arriveeTime: formatTime(intervention.arrivee.pointe_at),
        departTime: intervention.depart ? formatTime(intervention.depart.pointe_at) : null,
        workedLabel: intervention.workedMinutes !== null ? formatMinutes(intervention.workedMinutes) : null,
        isOpen: intervention.isOpen,
        isPaused: intervention.isPaused,
        anomalies,
        sortValue: new Date(sortDate).getTime(),
        intervention,
      })
    }
  }

  return rows.sort((a, b) => b.sortValue - a.sortValue)
}

function EventDetailRow({
  label,
  pointage,
}: {
  label: string
  pointage: PointageWithRelations
}) {
  const positionUrl =
    pointage.latitude != null && pointage.longitude != null
      ? buildPositionUrl(pointage.latitude, pointage.longitude)
      : null

  return (
    <div className="ranking-row">
      <span className="ranking-row-name">
        {label} · {formatTime(pointage.pointe_at)}
        {pointage.distance_chantier_m != null && ` · ${Math.round(pointage.distance_chantier_m)} m du chantier`}
        {pointage.gps_accuracy != null && ` · précision ±${Math.round(pointage.gps_accuracy)} m`}
      </span>
      {positionUrl ? (
        <a className="btn btn-ghost btn-sm" href={positionUrl} target="_blank" rel="noopener noreferrer">
          Voir la position
        </a>
      ) : (
        <span className="ranking-row-value">GPS indisponible</span>
      )}
    </div>
  )
}

export function PointagesPage() {
  const [employes, setEmployes] = useState<Profile[]>([])
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])

  const [employeId, setEmployeId] = useState('')
  const [chantierId, setChantierId] = useState('')
  const [date, setDate] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    listPointagesWithRelations({
      employeId: employeId || undefined,
      chantierId: chantierId || undefined,
      date: date || undefined,
    }).then((res) => {
      if (!isMounted) return
      setPointages(res.data)
      setError(res.error)
      setLoading(false)
      setSelectedKey(null)
    })

    return () => {
      isMounted = false
    }
  }, [employeId, chantierId, date])

  const chantierById = useMemo(() => new Map(chantiers.map((chantier) => [chantier.id, chantier])), [chantiers])
  // Date.now() est volontairement relu à chaque rendu (calcul quasi
  // gratuit) pour que l'anomalie "durée maximale dépassée" reste à jour ;
  // buildRows n'a donc pas besoin d'être mémoïsé plus avant.
  const rows = buildRows(pointages, chantierById, Date.now())
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null

  const columns: ResponsiveTableColumn<PointageRow>[] = [
    { key: 'employe', header: 'Employé', render: (row) => row.employeName },
    { key: 'chantier', header: 'Chantier', render: (row) => row.chantierName },
    { key: 'date', header: 'Date', render: (row) => row.date },
    { key: 'arrivee', header: 'Arrivée', render: (row) => row.arriveeTime },
    { key: 'depart', header: 'Départ', render: (row) => row.departTime ?? '—' },
    { key: 'duree', header: 'Durée', render: (row) => row.workedLabel ?? '—' },
    {
      key: 'statut',
      header: 'Statut',
      render: (row) => (
        <div className="badge-group">
          {row.isOpen ? (
            <Badge variant={row.isPaused ? 'info' : 'success'}>{row.isPaused ? 'En pause' : 'En cours'}</Badge>
          ) : (
            <Badge variant={row.anomalies.length === 0 ? 'success' : 'neutral'}>
              {row.anomalies.length === 0 ? 'Conforme' : 'Terminé'}
            </Badge>
          )}
          {row.anomalies.map((anomaly) => (
            <Badge key={anomaly.code} variant="danger">
              {anomaly.label}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Détails',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedKey((current) => (current === row.key ? null : row.key))}
        >
          {selectedKey === row.key ? 'Fermer' : 'Détails'}
        </Button>
      ),
    },
  ]

  const selectedLive =
    selectedRow && selectedRow.intervention.isOpen ? computeLiveMinutes(selectedRow.intervention, Date.now()) : null

  return (
    <div>
      <PageHeader title="Pointages" subtitle="Historique des interventions enregistrées" />

      <div className="filters-bar">
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

        <Input label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      {error && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      <Card>
        {loading ? (
          <div className="loading-block">Chargement…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aucun pointage"
            description="Aucun pointage ne correspond à ces filtres pour le moment."
          />
        ) : (
          <ResponsiveTable columns={columns} rows={rows} getRowKey={(row) => row.key} />
        )}
      </Card>

      {selectedRow && (
        <Card>
          <div className="card-header">
            <h2 className="card-title">Détail de l'intervention</h2>
            <Button size="sm" variant="ghost" onClick={() => setSelectedKey(null)}>
              Fermer
            </Button>
          </div>

          <p className="entity-card-meta">
            {selectedRow.employeName} · {selectedRow.chantierName}
          </p>

          <div className="ranking-list">
            <EventDetailRow label="Arrivée" pointage={selectedRow.intervention.arrivee} />
            {selectedRow.intervention.pauses.map((pause, index) => (
              <Fragment key={pause.debut.id}>
                <EventDetailRow label={`Pause ${index + 1} — début`} pointage={pause.debut} />
                <EventDetailRow label={`Pause ${index + 1} — fin`} pointage={pause.fin} />
              </Fragment>
            ))}
            {selectedRow.intervention.openPauseDebut && (
              <EventDetailRow label="Pause en cours — début" pointage={selectedRow.intervention.openPauseDebut} />
            )}
            {selectedRow.intervention.depart && (
              <EventDetailRow label="Départ" pointage={selectedRow.intervention.depart} />
            )}
          </div>

          <p className="entity-card-meta">
            {selectedLive
              ? `Présence ${formatMinutes(selectedLive.presenceMinutes)} · Pause ${formatMinutes(selectedLive.pauseMinutes)} · Travaillé ${formatMinutes(selectedLive.workedMinutes)}`
              : `Présence ${formatMinutes(selectedRow.intervention.presenceMinutes ?? 0)} · Pause ${formatMinutes(selectedRow.intervention.pauseMinutes)} · Travaillé ${formatMinutes(selectedRow.intervention.workedMinutes ?? 0)}`}
          </p>

          {selectedRow.anomalies.length > 0 && (
            <div className="badge-group">
              {selectedRow.anomalies.map((anomaly) => (
                <Badge key={anomaly.code} variant="danger">
                  {anomaly.label}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
