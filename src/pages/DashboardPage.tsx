import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HardHat,
  Inbox,
  ListChecks,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ResponsiveTable, type ResponsiveTableColumn } from '../components/ui/ResponsiveTable'
import { Badge, type BadgeVariant } from '../components/ui/Badge'
import { listChantiers } from '../services/chantierService'
import { listAllProfiles } from '../services/employeService'
import { listAllPointages } from '../services/pointageService'
import {
  computeChantierTodaySummaries,
  computeEmployeeDayStatuses,
  type EmployeeDayStatus,
  type EmployeeDayStatusKind,
} from '../lib/pointageStats'
import { computeAnomalies, ACCURACY_THRESHOLD_M } from '../lib/anomalies'
import { formatMinutes, formatDate, formatTime, isSameDay } from '../lib/formatters'
import type { Chantier, Pointage, PointageType, Profile } from '../types/database'

interface DashboardState {
  loading: boolean
  error: string | null
  chantiers: Chantier[]
  profiles: Profile[]
  pointages: Pointage[]
}

// Nombre d'entrées affichées avant de renvoyer vers la page dédiée — le
// dashboard doit rester lisible en quelques secondes (voir objectif vidéo
// démo), pas devenir une liste exhaustive.
const PRESENCE_DISPLAY_LIMIT = 6
const CHANTIERS_DISPLAY_LIMIT = 5
const ANOMALIES_DISPLAY_LIMIT = 5
// Rafraîchit les statuts dérivés (présence, anomalies liées à la durée
// max...) sans repasser par Supabase : Date.now() seul suffit à faire
// avancer "depuis 12:04" et la détection "durée max dépassée".
const CLOCK_TICK_MS = 60000

const ACTION_BADGE: Record<PointageType, { label: string; variant: BadgeVariant }> = {
  arrivee: { label: 'Arrivée', variant: 'success' },
  pause_debut: { label: 'Pause', variant: 'info' },
  pause_fin: { label: 'Reprise', variant: 'info' },
  depart: { label: 'Départ', variant: 'neutral' },
}

const STATUS_LABEL: Record<EmployeeDayStatusKind, string> = {
  present: 'Sur chantier',
  pause: 'En pause',
  termine: 'Journée terminée',
  absent: 'Pas encore pointé',
}

// Ordre d'affichage de la carte "Présence aujourd'hui" : les employés
// concernés par la journée en cours d'abord (présent/pause à égalité),
// puis journée terminée, puis pas encore pointé.
const STATUS_ORDER: Record<EmployeeDayStatusKind, number> = { present: 0, pause: 0, termine: 1, absent: 2 }

/**
 * Contrôle GPS d'UN pointage précis (et non de toute l'intervention comme
 * computeAnomalies) : c'est ce niveau de détail qui a du sens colonne par
 * colonne dans "Derniers pointages reçus". Réutilise volontairement les
 * mêmes champs et le même seuil (ACCURACY_THRESHOLD_M) que lib/anomalies.
 */
function getPointageControl(pointage: Pointage, chantier: Chantier | undefined): { variant: BadgeVariant; label: string } {
  if (pointage.latitude == null || pointage.longitude == null) {
    return { variant: 'neutral', label: 'Localisation indisponible' }
  }
  if (chantier && pointage.distance_chantier_m != null && pointage.distance_chantier_m > chantier.rayon_autorise) {
    return { variant: 'danger', label: 'Hors zone' }
  }
  if (pointage.gps_accuracy != null && pointage.gps_accuracy > ACCURACY_THRESHOLD_M) {
    return { variant: 'danger', label: 'GPS peu précis' }
  }
  return { variant: 'success', label: 'GPS' }
}

function PresenceRow({ profile, status }: { profile: Profile; status: EmployeeDayStatus<Pointage> | undefined }) {
  const kind = status?.status ?? 'absent'
  const intervention = status?.intervention ?? null

  let meta: string | null = null
  if (intervention) {
    if (kind === 'present') {
      meta = `Arrivée ${formatTime(intervention.arrivee.pointe_at)}`
    } else if (kind === 'pause' && intervention.openPauseDebut) {
      meta = `Depuis ${formatTime(intervention.openPauseDebut.pointe_at)}`
    } else if (kind === 'termine' && intervention.depart) {
      meta = `Départ ${formatTime(intervention.depart.pointe_at)}`
    }
  }

  return (
    <div className="presence-row">
      <span className={`status-dot status-dot-${kind}`} />
      <div className="presence-row-body">
        <span className="presence-row-name">{profile.full_name || profile.email || 'Employé'}</span>
        <span className="presence-row-meta">
          {STATUS_LABEL[kind]}
          {meta && ` · ${meta}`}
        </span>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()

  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    chantiers: [],
    profiles: [],
    pointages: [],
  })
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    let isMounted = true

    Promise.all([listChantiers(), listAllProfiles(), listAllPointages(500)]).then(
      ([chantiersRes, profilesRes, pointagesRes]) => {
        if (!isMounted) return
        setState({
          loading: false,
          error: chantiersRes.error ?? profilesRes.error ?? pointagesRes.error,
          chantiers: chantiersRes.data,
          profiles: profilesRes.data,
          pointages: pointagesRes.data,
        })
      },
    )

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const { loading, error, chantiers, profiles, pointages } = state

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const chantierById = useMemo(() => new Map(chantiers.map((chantier) => [chantier.id, chantier])), [chantiers])
  const employeeProfiles = useMemo(() => profiles.filter((p) => p.role === 'employe'), [profiles])

  const employeeDayStatuses = useMemo(() => computeEmployeeDayStatuses(pointages, nowTick), [pointages, nowTick])
  const chantierTodaySummaries = useMemo(
    () => computeChantierTodaySummaries(pointages, nowTick),
    [pointages, nowTick],
  )

  const pointagesToday = pointages.filter((p) => isSameDay(p.pointe_at, new Date(nowTick))).length
  const chantiersActifsCount = chantiers.filter((c) => c.statut === 'actif').length

  const heuresAujourdhuiMinutes = [...chantierTodaySummaries.values()].reduce(
    (sum, entry) => sum + entry.workedMinutes,
    0,
  )

  const presentCount = employeeProfiles.filter((profile) => {
    const status = employeeDayStatuses.get(profile.id)?.status
    return status === 'present' || status === 'pause'
  }).length

  const presenceRows = [...employeeProfiles]
    .sort((a, b) => {
      const statusA = employeeDayStatuses.get(a.id)?.status ?? 'absent'
      const statusB = employeeDayStatuses.get(b.id)?.status ?? 'absent'
      return STATUS_ORDER[statusA] - STATUS_ORDER[statusB]
    })
    .slice(0, PRESENCE_DISPLAY_LIMIT)

  const chantierTodayRows = [...chantierTodaySummaries.values()]
    .sort((a, b) => b.workedMinutes - a.workedMinutes)
    .slice(0, CHANTIERS_DISPLAY_LIMIT)

  const anomalyRows = employeeProfiles
    .flatMap((profile) => {
      const status = employeeDayStatuses.get(profile.id)
      if (!status?.intervention) return []
      const chantier = chantierById.get(status.intervention.chantierId)
      const anomalies = computeAnomalies(status.intervention, chantier, nowTick)
      return anomalies.map((anomaly) => ({
        key: `${profile.id}-${anomaly.code}`,
        employeName: profile.full_name || profile.email || 'Employé',
        label: anomaly.label,
      }))
    })
    .slice(0, ANOMALIES_DISPLAY_LIMIT)

  const derniersPointages = pointages.slice(0, 8)

  const columns: ResponsiveTableColumn<Pointage>[] = [
    {
      key: 'employe',
      header: 'Employé',
      render: (row) => profileById.get(row.employe_id)?.full_name || profileById.get(row.employe_id)?.email || '—',
    },
    {
      key: 'chantier',
      header: 'Chantier',
      render: (row) => chantierById.get(row.chantier_id)?.nom ?? '—',
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => {
        const action = ACTION_BADGE[row.type]
        return <Badge variant={action.variant}>{action.label}</Badge>
      },
    },
    {
      key: 'heure',
      header: 'Heure',
      render: (row) => (
        <div>
          <span>{formatTime(row.pointe_at)}</span>
          {!isSameDay(row.pointe_at, new Date(nowTick)) && (
            <p className="pointage-history-meta">{formatDate(row.pointe_at)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'controle',
      header: 'Contrôle',
      render: (row) => {
        const control = getPointageControl(row, chantierById.get(row.chantier_id))
        return (
          <Badge variant={control.variant}>
            {control.variant === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {control.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vue d’ensemble de l’activité terrain" />

      {error && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      {loading ? (
        <div className="loading-block">Chargement…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Heures aujourd'hui" value={formatMinutes(heuresAujourdhuiMinutes)} icon={Clock} />
            <StatCard label="Pointages aujourd'hui" value={String(pointagesToday)} icon={ListChecks} />
            <StatCard label="Employés présents" value={`${presentCount} / ${employeeProfiles.length}`} icon={Users} />
            <StatCard label="Chantiers actifs" value={String(chantiersActifsCount)} icon={HardHat} />
          </div>

          <div className="dashboard-grid">
            <Card>
              <div className="card-header">
                <h2 className="card-title">Présence aujourd'hui</h2>
              </div>
              {employeeProfiles.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Aucun employé"
                  description="Ajoutez des employés pour suivre leur présence."
                />
              ) : (
                <>
                  <div className="presence-list">
                    {presenceRows.map((profile) => (
                      <PresenceRow key={profile.id} profile={profile} status={employeeDayStatuses.get(profile.id)} />
                    ))}
                  </div>
                  {employeeProfiles.length > PRESENCE_DISPLAY_LIMIT && (
                    <div className="dashboard-card-footer">
                      <Button variant="ghost" size="sm" icon={<ArrowRight size={16} />} onClick={() => navigate('/employes')}>
                        Voir tous les employés
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card>
              <div className="card-header">
                <h2 className="card-title">Chantiers aujourd'hui</h2>
              </div>
              {chantierTodayRows.length === 0 ? (
                <EmptyState
                  icon={HardHat}
                  title="Aucune activité aujourd'hui"
                  description="Les chantiers avec des pointages aujourd'hui apparaîtront ici."
                />
              ) : (
                <div className="ranking-list">
                  {chantierTodayRows.map((entry) => (
                    <div className="ranking-row" key={entry.chantierId}>
                      <span className="ranking-row-name">{chantierById.get(entry.chantierId)?.nom ?? 'Chantier inconnu'}</span>
                      <span className="ranking-row-value">
                        {entry.employeIds.size} employé{entry.employeIds.size > 1 ? 's' : ''} · {formatMinutes(entry.workedMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="dashboard-card-footer">
                <Button variant="ghost" size="sm" icon={<ArrowRight size={16} />} onClick={() => navigate('/chantiers')}>
                  Voir les chantiers
                </Button>
              </div>
            </Card>

            <Card className="dashboard-grid-full">
              <div className="card-header">
                <h2 className="card-title">À vérifier</h2>
                {anomalyRows.length > 0 && (
                  <Badge variant="danger">
                    {anomalyRows.length} anomalie{anomalyRows.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {anomalyRows.length === 0 ? (
                <div className="check-ok">
                  <ShieldCheck size={18} />
                  <span>Aucune anomalie à vérifier</span>
                </div>
              ) : (
                <>
                  <div className="check-list">
                    {anomalyRows.map((row) => (
                      <div className="check-row" key={row.key}>
                        <span className="check-row-name">{row.employeName}</span>
                        <span className="check-row-detail">
                          <AlertTriangle size={13} />
                          {row.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="dashboard-card-footer">
                    <Button variant="ghost" size="sm" icon={<ArrowRight size={16} />} onClick={() => navigate('/pointages')}>
                      Voir les anomalies
                    </Button>
                  </div>
                </>
              )}
            </Card>

            <Card className="dashboard-grid-full">
              <div className="card-header">
                <h2 className="card-title">Derniers pointages reçus</h2>
              </div>
              {derniersPointages.length === 0 ? (
                <EmptyState icon={Inbox} title="Aucun pointage" description="Les pointages des employés apparaîtront ici." />
              ) : (
                <ResponsiveTable columns={columns} rows={derniersPointages} getRowKey={(row) => row.id} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
