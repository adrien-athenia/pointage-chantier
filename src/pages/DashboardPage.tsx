import { useEffect, useState } from 'react'
import { Clock, ListChecks, Users, HardHat, AlertTriangle, Inbox } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ResponsiveTable, type ResponsiveTableColumn } from '../components/ui/ResponsiveTable'
import { Badge } from '../components/ui/Badge'
import { listChantiers } from '../services/chantierService'
import { listAllProfiles } from '../services/employeService'
import { listAllPointages } from '../services/pointageService'
import { computeDurationStats } from '../lib/pointageStats'
import { formatMinutes, formatDateTime, isSameDay } from '../lib/formatters'
import type { Chantier, Pointage, Profile } from '../types/database'

interface DashboardState {
  loading: boolean
  error: string | null
  chantiers: Chantier[]
  profiles: Profile[]
  pointages: Pointage[]
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    chantiers: [],
    profiles: [],
    pointages: [],
  })

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

  const { loading, error, chantiers, profiles, pointages } = state

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const chantierById = new Map(chantiers.map((chantier) => [chantier.id, chantier]))

  const { totalMinutes, minutesByEmploye, minutesByChantier } = computeDurationStats(pointages)

  const pointagesToday = pointages.filter((p) => isSameDay(p.pointe_at, new Date())).length
  const employesActifsCount = profiles.filter((p) => p.role === 'employe').length
  const chantiersActifsCount = chantiers.filter((c) => c.actif).length

  const heuresParEmploye = [...minutesByEmploye.entries()]
    .map(([employeId, minutes]) => ({
      key: employeId,
      label: profileById.get(employeId)?.full_name || profileById.get(employeId)?.email || 'Employé inconnu',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6)

  const heuresParChantier = [...minutesByChantier.entries()]
    .map(([chantierId, minutes]) => ({
      key: chantierId,
      label: chantierById.get(chantierId)?.nom ?? 'Chantier inconnu',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6)

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
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant={row.type === 'arrivee' ? 'success' : 'neutral'}>
          {row.type === 'arrivee' ? 'Arrivée' : 'Départ'}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => formatDateTime(row.pointe_at),
    },
  ]

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vue globale de l'activité" />

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
            <StatCard label="Total heures" value={formatMinutes(totalMinutes)} icon={Clock} />
            <StatCard label="Pointages aujourd'hui" value={String(pointagesToday)} icon={ListChecks} />
            <StatCard label="Employés actifs" value={String(employesActifsCount)} icon={Users} />
            <StatCard label="Chantiers actifs" value={String(chantiersActifsCount)} icon={HardHat} />
          </div>

          <div className="dashboard-grid">
            <Card>
              <div className="card-header">
                <h2 className="card-title">Heures par employé</h2>
              </div>
              {heuresParEmploye.length === 0 ? (
                <EmptyState icon={Inbox} title="Aucune donnée" description="Aucun pointage complet pour l'instant." />
              ) : (
                <div className="ranking-list">
                  {heuresParEmploye.map((entry) => (
                    <div className="ranking-row" key={entry.key}>
                      <span className="ranking-row-name">{entry.label}</span>
                      <span className="ranking-row-value">{formatMinutes(entry.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="card-header">
                <h2 className="card-title">Heures par chantier</h2>
              </div>
              {heuresParChantier.length === 0 ? (
                <EmptyState icon={Inbox} title="Aucune donnée" description="Aucun pointage complet pour l'instant." />
              ) : (
                <div className="ranking-list">
                  {heuresParChantier.map((entry) => (
                    <div className="ranking-row" key={entry.key}>
                      <span className="ranking-row-name">{entry.label}</span>
                      <span className="ranking-row-value">{formatMinutes(entry.minutes)}</span>
                    </div>
                  ))}
                </div>
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
