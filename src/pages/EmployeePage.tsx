import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, Coffee, Inbox, LogIn, LogOut, MapPin, Navigation, Play } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { listAssignedActiveChantiers } from '../services/employeChantierService'
import { createPointage, listOwnPointages, type PointageWithRelations } from '../services/pointageService'
import { buildInterventions, computeLiveMinutes, getOpenIntervention } from '../lib/pointageStats'
import { computeAnomalies } from '../lib/anomalies'
import { getCurrentPositionSafe } from '../lib/geolocation'
import { buildItineraireUrl } from '../lib/itineraire'
import { formatDate, formatMinutes, formatTime } from '../lib/formatters'
import type { Chantier, PointageType } from '../types/database'

export function EmployeePage() {
  const { user, profile } = useAuth()

  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState('')
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<PointageType | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const refresh = useCallback(async (userId: string) => {
    const [chantiersRes, pointagesRes] = await Promise.all([
      listAssignedActiveChantiers(userId),
      listOwnPointages(userId, 50),
    ])

    setChantiers(chantiersRes.data)
    setChantierId((current) => current || chantiersRes.data[0]?.id || '')
    setPointages(pointagesRes.data)
    setLoadError(chantiersRes.error ?? pointagesRes.error)
  }, [])

  useEffect(() => {
    if (!user) return
    let isMounted = true

    setLoading(true)
    refresh(user.id).finally(() => {
      if (isMounted) setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [user, refresh])

  const interventions = useMemo(() => buildInterventions(pointages), [pointages])
  const openIntervention = getOpenIntervention(interventions)
  const closedInterventions = [...interventions].reverse().filter((i) => !i.isOpen)
  const chantierById = useMemo(() => new Map(chantiers.map((c) => [c.id, c])), [chantiers])

  // Compteur en direct pendant une intervention ouverte : purement pour
  // l'affichage, les durées officielles restent basées sur pointe_at.
  useEffect(() => {
    if (!openIntervention) return
    const id = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [openIntervention])

  const liveMinutes = openIntervention ? computeLiveMinutes(openIntervention, nowTick) : null
  const openChantier = openIntervention ? chantierById.get(openIntervention.chantierId) : undefined
  const anomalies = openIntervention ? computeAnomalies(openIntervention, openChantier, nowTick) : []

  async function handleAction(type: PointageType, targetChantierId: string) {
    if (!user || submitting || !targetChantierId) return

    setSubmitting(type)
    setSubmitError(null)

    const geo = await getCurrentPositionSafe()
    const { error } = await createPointage({
      chantierId: targetChantierId,
      type,
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracy: geo.accuracy,
    })

    setSubmitting(null)
    if (error) {
      setSubmitError(error)
      return
    }

    await refresh(user.id)
  }

  const displayName = profile?.full_name || user?.email || 'Employé'
  const selectedChantier = chantierId ? chantierById.get(chantierId) : undefined
  const itineraireChantier = openIntervention ? openChantier : selectedChantier
  const itineraireUrl = itineraireChantier ? buildItineraireUrl(itineraireChantier) : null

  return (
    <>
      <div>
        <p className="employee-greeting">Bonjour {displayName}</p>
        <p className="employee-greeting-sub">Prêt à pointer votre journée sur le chantier.</p>
      </div>

      {loadError && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {loadError}
        </p>
      )}

      {!loading && chantiers.length === 0 && !openIntervention && (
        <Card>
          <EmptyState
            icon={MapPin}
            title="Aucun chantier affecté"
            description="Contactez votre administrateur pour être affecté à un chantier avant de pouvoir pointer."
          />
        </Card>
      )}

      {openIntervention ? (
        <Card>
          <p className="field-label">Chantier</p>
          <p className="entity-card-title">{openChantier?.nom ?? '—'}</p>
        </Card>
      ) : (
        chantiers.length > 0 && (
          <Card>
            <Select
              label="Chantier sélectionné"
              value={chantierId}
              onChange={(event) => setChantierId(event.target.value)}
              disabled={submitting !== null}
            >
              {chantiers.map((chantier) => (
                <option key={chantier.id} value={chantier.id}>
                  {chantier.nom}
                </option>
              ))}
            </Select>
          </Card>
        )
      )}

      {itineraireUrl && (
        <a
          className="btn btn-secondary btn-block"
          href={itineraireUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation size={18} />
          Itinéraire
        </a>
      )}

      <div className={`punch-grid${openIntervention && !openIntervention.isPaused ? '' : ' punch-grid-single'}`}>
        {!openIntervention && (
          <button
            type="button"
            className="punch-btn punch-btn-arrivee"
            disabled={!chantierId || submitting !== null}
            onClick={() => handleAction('arrivee', chantierId)}
          >
            <span className="punch-btn-icon">
              <LogIn size={22} />
            </span>
            {submitting === 'arrivee' ? 'Enregistrement…' : 'Pointer l’arrivée'}
          </button>
        )}

        {openIntervention && !openIntervention.isPaused && (
          <>
            <button
              type="button"
              className="punch-btn punch-btn-pause"
              disabled={submitting !== null}
              onClick={() => handleAction('pause_debut', openIntervention.chantierId)}
            >
              <span className="punch-btn-icon">
                <Coffee size={22} />
              </span>
              {submitting === 'pause_debut' ? 'Enregistrement…' : 'Commencer ma pause'}
            </button>
            <button
              type="button"
              className="punch-btn punch-btn-depart"
              disabled={submitting !== null}
              onClick={() => handleAction('depart', openIntervention.chantierId)}
            >
              <span className="punch-btn-icon">
                <LogOut size={22} />
              </span>
              {submitting === 'depart' ? 'Enregistrement…' : 'Pointer le départ'}
            </button>
          </>
        )}

        {openIntervention && openIntervention.isPaused && (
          <button
            type="button"
            className="punch-btn punch-btn-arrivee"
            disabled={submitting !== null}
            onClick={() => handleAction('pause_fin', openIntervention.chantierId)}
          >
            <span className="punch-btn-icon">
              <Play size={22} />
            </span>
            {submitting === 'pause_fin' ? 'Enregistrement…' : 'Reprendre le travail'}
          </button>
        )}
      </div>

      {submitError && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {submitError}
        </p>
      )}

      {anomalies.length > 0 && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {anomalies.map((a) => a.label).join(' · ')}
        </p>
      )}

      <Card>
        <div className="card-header">
          <h2 className="card-title">Statut de la journée</h2>
          {!openIntervention && <Badge variant="neutral">Non pointé</Badge>}
          {openIntervention && !openIntervention.isPaused && <Badge variant="success">En cours</Badge>}
          {openIntervention?.isPaused && <Badge variant="info">En pause</Badge>}
        </div>

        {openIntervention && liveMinutes ? (
          <p className="entity-card-meta">
            Arrivée à {formatTime(openIntervention.arrivee.pointe_at)} · Présence{' '}
            {formatMinutes(liveMinutes.presenceMinutes)} · Pause {formatMinutes(liveMinutes.pauseMinutes)} · Travaillé{' '}
            {formatMinutes(liveMinutes.workedMinutes)}
          </p>
        ) : (
          <p className="entity-card-meta">Aucun pointage en cours pour l’instant.</p>
        )}

        <div className="gps-status">
          <span className="gps-status-dot" />
          La position n’est demandée qu’au moment où vous appuyez sur un bouton de pointage — aucun suivi permanent.
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <h2 className="card-title">Mes pointages</h2>
        </div>
        {loading ? (
          <div className="loading-block">Chargement…</div>
        ) : closedInterventions.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucun pointage" description="Votre historique apparaîtra ici." />
        ) : (
          <div className="ranking-list">
            {closedInterventions.map((intervention) => (
              <div className="ranking-row" key={intervention.depart?.id}>
                <span className="ranking-row-name">
                  {formatDate(intervention.arrivee.pointe_at)} · {intervention.arrivee.chantiers?.nom ?? '—'} ·{' '}
                  {formatTime(intervention.arrivee.pointe_at)} →{' '}
                  {intervention.depart ? formatTime(intervention.depart.pointe_at) : '—'}
                  {intervention.pauses.length > 0 && ` · pause ${formatMinutes(intervention.pauseMinutes)}`}
                </span>
                <span className="ranking-row-value">
                  {intervention.workedMinutes !== null ? formatMinutes(intervention.workedMinutes) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="card-header">
          <h2 className="card-title">Photo chantier</h2>
        </div>
        <Button variant="secondary" icon={<Camera size={18} />} disabled title="Fonctionnalité à venir">
          Ajouter une photo
        </Button>
      </Card>
    </>
  )
}
