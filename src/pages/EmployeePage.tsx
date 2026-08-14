import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CalendarDays,
  CalendarRange,
  Clock,
  Coffee,
  HardHat,
  ImagePlus,
  Inbox,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  Play,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { ChantierPhotoModal } from '../components/ChantierPhotoModal'
import { listAssignedActiveChantiers } from '../services/employeChantierService'
import { createPointage, listOwnPointages, type PointageWithRelations } from '../services/pointageService'
import {
  listChantierPhotos,
  getSignedPhotoUrls,
  type ChantierPhotoWithAuthor,
} from '../services/chantierPhotoService'
import {
  buildInterventions,
  computeLiveMinutes,
  computePeriodTotals,
  getOpenIntervention,
  summarizeByChantier,
  type Intervention,
} from '../lib/pointageStats'
import { computeAnomalies, ACCURACY_THRESHOLD_M } from '../lib/anomalies'
import { getCurrentPositionSafe } from '../lib/geolocation'
import { buildItineraireUrl } from '../lib/itineraire'
import { formatDate, formatDateTimeLong, formatLongDate, formatMinutes, formatTime, isSameDay } from '../lib/formatters'
import type { Chantier, PointageType } from '../types/database'

// Historique complet de l'employé (et non une fenêtre récente) : requis
// pour calculer correctement "chantiers effectués"/"chantiers terminés",
// qui n'ont pas de notion de période. Reste RLS-scopé à ses seuls
// pointages (jamais ceux des autres employés) ; le plafond ci-dessous est
// une simple garde-fou défensive, très généreux pour un seul employé.
const POINTAGES_FETCH_LIMIT = 3000
const RECENT_HISTORY_LIMIT = 5
const RECENT_PHOTOS_LIMIT = 3

interface DayEvent {
  label: string
  time: string
}

/** Timeline "Ma journée" : liste chronologique des événements de l'intervention du jour (ouverte ou clôturée aujourd'hui). */
function buildTodayEvents(intervention: Intervention<PointageWithRelations> | null): DayEvent[] {
  if (!intervention) return []

  const events: DayEvent[] = [{ label: 'Arrivée', time: formatTime(intervention.arrivee.pointe_at) }]

  for (const pause of intervention.pauses) {
    events.push({ label: 'Pause déjeuner', time: formatTime(pause.debut.pointe_at) })
    events.push({ label: 'Reprise', time: formatTime(pause.fin.pointe_at) })
  }
  if (intervention.openPauseDebut) {
    events.push({ label: 'Pause déjeuner', time: formatTime(intervention.openPauseDebut.pointe_at) })
  }
  if (intervention.depart) {
    events.push({ label: 'Départ', time: formatTime(intervention.depart.pointe_at) })
  }

  return events
}

export function EmployeePage() {
  const { user, profile } = useAuth()

  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState('')
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<PointageType | null>(null)
  // GPS est la partie lente (jusqu'à ~10 s, voir lib/geolocation.ts) : ce
  // sous-état distinct permet d'afficher "Localisation en cours…" pendant
  // cette phase précise, avant l'appel serveur proprement dit.
  const [locating, setLocating] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  // Verrou synchrone (pas seulement le state `submitting`) : un double-clic
  // déclenche deux gestionnaires dans le même tick, avant que React n'ait
  // recalculé `submitting` — déjà rencontré et corrigé ailleurs dans le
  // projet (formulaires chantier/employé), même stratégie ici pour une
  // opération encore plus critique (un pointage ne doit jamais être créé
  // deux fois).
  const submittingLockRef = useRef(false)

  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [chantierPhotos, setChantierPhotos] = useState<ChantierPhotoWithAuthor[]>([])
  const [chantierPhotoUrls, setChantierPhotoUrls] = useState<Map<string, string>>(new Map())
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState<string | null>(null)

  const refresh = useCallback(async (userId: string) => {
    const [chantiersRes, pointagesRes] = await Promise.all([
      listAssignedActiveChantiers(userId),
      listOwnPointages(userId, POINTAGES_FETCH_LIMIT),
    ])

    setChantiers(chantiersRes.data)
    // Ne conserve la sélection courante que si ce chantier est toujours
    // sélectionnable (statut actif + affecté) : sinon un chantier qui
    // vient d'être terminé resterait choisi "fantôme" dans le sélecteur.
    setChantierId((current) => {
      const stillSelectable = chantiersRes.data.some((c) => c.id === current)
      return stillSelectable ? current : chantiersRes.data[0]?.id || ''
    })
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
  const recentInterventions = closedInterventions.slice(0, RECENT_HISTORY_LIMIT)
  const chantierById = useMemo(() => new Map(chantiers.map((c) => [c.id, c])), [chantiers])

  // Compteur en direct pendant une intervention ouverte : purement pour
  // l'affichage (statut + KPI "aujourd'hui"), les durées officielles
  // restent basées sur pointe_at.
  useEffect(() => {
    if (!openIntervention) return
    const id = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [openIntervention])

  const liveMinutes = openIntervention ? computeLiveMinutes(openIntervention, nowTick) : null
  // Le chantier de l'intervention en cours vient de l'embed transporté
  // par le pointage d'arrivée lui-même, jamais de la liste des chantiers
  // actuellement actifs : si l'admin termine ce chantier pendant que
  // l'employé y travaille, il doit rester visible (nom, itinéraire...)
  // jusqu'au départ, alors qu'il a déjà disparu de `chantiers`.
  const openChantier = openIntervention?.arrivee.chantiers ?? null
  const anomalies = openIntervention ? computeAnomalies(openIntervention, chantierById.get(openIntervention.chantierId), nowTick) : []

  const todayClosedIntervention =
    closedInterventions.find((i) => i.depart && isSameDay(i.depart.pointe_at, new Date(nowTick))) ?? null
  // "Journée terminée" est une simple lecture d'affichage, purement
  // dérivée des interventions déjà clôturées (aucune nouvelle règle
  // métier) : pas d'intervention ouverte, et au moins une intervention
  // du jour a déjà été clôturée par un départ.
  const journeeTerminee = !openIntervention && todayClosedIntervention !== null
  // Intervention pertinente pour "aujourd'hui" (ouverte, ou clôturée plus
  // tôt dans la journée) — sert à la fois au texte de statut et à la
  // timeline "Ma journée".
  const todayIntervention = openIntervention ?? todayClosedIntervention
  const todayEvents = useMemo(() => buildTodayEvents(todayIntervention), [todayIntervention])

  const periodTotals = useMemo(() => computePeriodTotals(interventions, nowTick), [interventions, nowTick])
  const chantierHistory = useMemo(() => summarizeByChantier(interventions), [interventions])
  const completedChantierCount = chantierHistory.size
  const activeChantierCount = chantiers.length
  const chantiersTermines = useMemo(
    () => [...chantierHistory.values()].filter((entry) => entry.lastIntervention.arrivee.chantiers?.statut === 'termine'),
    [chantierHistory],
  )

  async function handleAction(type: PointageType, targetChantierId: string) {
    if (!user || submittingLockRef.current || !targetChantierId) return
    submittingLockRef.current = true

    setSubmitting(type)
    setSubmitError(null)
    setGpsNotice(null)
    setLocating(true)

    const geo = await getCurrentPositionSafe()
    setLocating(false)

    // Un avis GPS n'empêche jamais le pointage : la position (même
    // absente ou peu précise) est simplement transmise telle quelle, et
    // l'employé est prévenu pour comprendre un éventuel badge côté admin.
    // Un salarié hors zone n'est PAS bloqué — c'est la règle métier
    // actuelle (anomalie visible côté admin, jamais un blocage employé) ;
    // ce comportement n'est pas modifié ici.
    if (geo.error) {
      setGpsNotice(geo.error)
    } else if (geo.accuracy != null && geo.accuracy > ACCURACY_THRESHOLD_M) {
      setGpsNotice(`Position obtenue avec une précision faible (±${Math.round(geo.accuracy)} m). Le pointage est tout de même enregistré.`)
    }

    const { error } = await createPointage({
      chantierId: targetChantierId,
      type,
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracy: geo.accuracy,
    })

    submittingLockRef.current = false
    setSubmitting(null)
    if (error) {
      setSubmitError(error)
      return
    }

    await refresh(user.id)
  }

  const rawFullName = profile?.full_name?.trim()
  const firstName = rawFullName ? rawFullName.split(/\s+/)[0] : user?.email || 'Employé'
  const selectedChantier = chantierId ? chantierById.get(chantierId) : undefined
  const itineraireChantier = openIntervention ? openChantier : selectedChantier
  const itineraireUrl = itineraireChantier ? buildItineraireUrl(itineraireChantier) : null
  const noChantierAssigne = !loading && chantiers.length === 0 && !openIntervention

  // Chantier concerné par le suivi photo : celui de l'intervention en
  // cours si elle existe, sinon celui sélectionné manuellement — même
  // logique que l'itinéraire ci-dessus.
  const photoChantierId = openIntervention ? openIntervention.chantierId : chantierId
  const photoChantierNom = openIntervention ? openChantier?.nom : selectedChantier?.nom

  useEffect(() => {
    if (!photoChantierId) {
      setChantierPhotos([])
      setChantierPhotoUrls(new Map())
      return
    }

    let isMounted = true
    setPhotosLoading(true)
    setPhotosError(null)

    listChantierPhotos(photoChantierId).then(async (res) => {
      if (!isMounted) return

      if (res.error) {
        console.error('[EmployeePage] erreur Supabase lors du chargement des photos du chantier :', res.error)
        setChantierPhotos([])
        setChantierPhotoUrls(new Map())
        setPhotosError('Impossible de charger les photos du chantier. Réessayez.')
        setPhotosLoading(false)
        return
      }

      const recent = res.data.slice(0, RECENT_PHOTOS_LIMIT)
      const urls = await getSignedPhotoUrls(recent.map((photo) => photo.storage_path))
      if (!isMounted) return

      setChantierPhotos(recent)
      setChantierPhotoUrls(urls)
      setPhotosLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [photoChantierId])

  async function handlePhotoUploaded(photo: ChantierPhotoWithAuthor) {
    setPhotoModalOpen(false)
    setChantierPhotos((current) => [photo, ...current].slice(0, RECENT_PHOTOS_LIMIT))
    const urls = await getSignedPhotoUrls([photo.storage_path])
    setChantierPhotoUrls((current) => new Map([...current, ...urls]))
  }

  // Libellé de statut et heure associée — dérivés uniquement des
  // pointages réellement enregistrés (aucun état inventé côté React).
  let statusLine = 'Vous n’avez pas encore commencé votre journée.'
  if (openIntervention?.isPaused && openIntervention.openPauseDebut) {
    statusLine = `Pause déjeuner depuis ${formatTime(openIntervention.openPauseDebut.pointe_at)}`
  } else if (openIntervention) {
    // Reprise après au moins une pause déjà terminée, distinct d'une
    // arrivée sans pause : le libellé reflète l'événement le plus récent.
    const lastPauseFin = openIntervention.pauses.at(-1)?.fin.pointe_at
    statusLine = lastPauseFin
      ? `Intervention reprise à ${formatTime(lastPauseFin)}`
      : `En intervention depuis ${formatTime(openIntervention.arrivee.pointe_at)}`
  } else if (journeeTerminee && todayClosedIntervention?.depart) {
    statusLine = `Journée terminée à ${formatTime(todayClosedIntervention.depart.pointe_at)}`
  }

  return (
    <>
      {/* A — Accueil ---------------------------------------------------- */}
      <div>
        <p className="employee-greeting">Bonjour {firstName}</p>
        <p className="employee-greeting-sub">{formatLongDate(new Date(nowTick))}</p>
      </div>

      {loadError && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {loadError}
        </p>
      )}

      {/* B — Statut actuel ------------------------------------------------ */}
      <Card>
        <div className="card-header">
          <h2 className="card-title">Statut</h2>
          {!openIntervention && !journeeTerminee && <Badge variant="neutral">Non pointé</Badge>}
          {!openIntervention && journeeTerminee && <Badge variant="neutral">Journée terminée</Badge>}
          {openIntervention && !openIntervention.isPaused && <Badge variant="success">En cours</Badge>}
          {openIntervention?.isPaused && <Badge variant="info">En pause</Badge>}
        </div>

        <p className="entity-card-meta">{statusLine}</p>
        {openIntervention && liveMinutes && (
          <p className="entity-card-meta">Temps travaillé aujourd’hui : {formatMinutes(liveMinutes.workedMinutes)}</p>
        )}
      </Card>

      {/* Chantier actuel ---------------------------------------------- */}
      {noChantierAssigne ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="Aucun chantier affecté"
            description="Contactez votre administrateur pour être affecté à un chantier avant de pouvoir pointer."
          />
        </Card>
      ) : (
        <Card>
          <div className="card-header">
            <h2 className="card-title">Mon chantier</h2>
          </div>

          {openIntervention ? (
            <>
              <p className="entity-card-title">{openChantier?.nom ?? '—'}</p>
              {openChantier?.adresse && <p className="entity-card-meta">{openChantier.adresse}</p>}
              {openChantier?.ville && (
                <p className="entity-card-meta meta-inline">
                  <MapPin size={13} />
                  {openChantier.ville}
                </p>
              )}
            </>
          ) : (
            chantiers.length > 0 && (
              <>
                {chantiers.length > 1 && (
                  <p className="entity-card-meta">Sélectionnez le chantier sur lequel vous travaillez.</p>
                )}
                {chantiers.length > 1 ? (
                  <Select
                    aria-label="Mon chantier"
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
                ) : (
                  <p className="entity-card-title">{selectedChantier?.nom ?? chantiers[0]?.nom}</p>
                )}
                {selectedChantier?.adresse && <p className="entity-card-meta">{selectedChantier.adresse}</p>}
                {selectedChantier?.ville && (
                  <p className="entity-card-meta meta-inline">
                    <MapPin size={13} />
                    {selectedChantier.ville}
                  </p>
                )}
              </>
            )
          )}
        </Card>
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

      {/* Action principale de pointage, avec hiérarchie visuelle ---------
          Masqué (et non simplement désactivé) si l'employé n'a aucun
          chantier : un gros bouton visible mais inerte serait confus. */}
      {!openIntervention && !noChantierAssigne && (
        <div className="punch-grid punch-grid-single">
          <button
            type="button"
            className="punch-btn punch-btn-arrivee"
            disabled={!chantierId || submitting !== null}
            onClick={() => handleAction('arrivee', chantierId)}
          >
            <span className="punch-btn-icon">
              <LogIn size={22} />
            </span>
            {submitting === 'arrivee' ? (locating ? 'Localisation en cours…' : 'Enregistrement…') : 'Pointer l’arrivée'}
          </button>
        </div>
      )}

      {openIntervention && !openIntervention.isPaused && (
        <>
          <div className="punch-grid punch-grid-single">
            <button
              type="button"
              className="punch-btn punch-btn-pause"
              disabled={submitting !== null}
              onClick={() => handleAction('pause_debut', openIntervention.chantierId)}
            >
              <span className="punch-btn-icon">
                <Coffee size={22} />
              </span>
              {submitting === 'pause_debut' ? (locating ? 'Localisation en cours…' : 'Enregistrement…') : 'Commencer ma pause'}
            </button>
          </div>
          {/* Action secondaire : même fonction handleAction, poids visuel
              volontairement plus discret (Button "secondary" existant,
              plutôt que le gros bouton punch-btn) que l'action principale
              ci-dessus, sans jamais devenir ambiguë. */}
          <Button
            variant="secondary"
            block
            icon={<LogOut size={18} />}
            disabled={submitting !== null}
            onClick={() => handleAction('depart', openIntervention.chantierId)}
          >
            {submitting === 'depart' ? (locating ? 'Localisation en cours…' : 'Enregistrement…') : 'Pointer le départ'}
          </Button>
        </>
      )}

      {openIntervention && openIntervention.isPaused && (
        <div className="punch-grid punch-grid-single">
          <button
            type="button"
            className="punch-btn punch-btn-arrivee"
            disabled={submitting !== null}
            onClick={() => handleAction('pause_fin', openIntervention.chantierId)}
          >
            <span className="punch-btn-icon">
              <Play size={22} />
            </span>
            {submitting === 'pause_fin' ? (locating ? 'Localisation en cours…' : 'Enregistrement…') : 'Reprendre le travail'}
          </button>
        </div>
      )}

      {gpsNotice && <p className="inline-notice">{gpsNotice}</p>}

      <div className="gps-status">
        <span className="gps-status-dot" />
        La position n’est demandée qu’au moment où vous appuyez sur un bouton de pointage — aucun suivi permanent.
      </div>

      {submitError && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {submitError}
        </p>
      )}

      {/* Alertes / anomalies, après les actions de pointage --------------- */}
      {anomalies.length > 0 && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {anomalies.map((a) => a.label).join(' · ')}
        </p>
      )}

      {/* Ma journée — timeline des événements du jour ---------------------- */}
      {todayEvents.length > 0 && (
        <Card>
          <div className="card-header">
            <h2 className="card-title">Ma journée</h2>
          </div>
          <div className="ranking-list">
            {todayEvents.map((event, index) => (
              <div className="ranking-row" key={`${event.label}-${index}`}>
                <span className="ranking-row-name">{event.label}</span>
                <span className="ranking-row-value">{event.time}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Suivi photo du chantier -------------------------------------------- */}
      {photoChantierId && (
        <Card>
          <div className="card-header">
            <h2 className="card-title">Photos du chantier</h2>
          </div>
          {photoChantierNom && <p className="entity-card-meta">{photoChantierNom}</p>}

          <Button
            variant="secondary"
            block
            icon={<ImagePlus size={18} />}
            onClick={() => setPhotoModalOpen(true)}
          >
            Ajouter une photo du chantier
          </Button>

          {photosError ? (
            <p className="error-banner card-section-gap">
              <AlertTriangle size={16} />
              {photosError}
            </p>
          ) : photosLoading ? (
            <div className="loading-block">Chargement…</div>
          ) : chantierPhotos.length === 0 ? (
            <div className="card-section-gap">
              <EmptyState icon={Camera} title="Aucune photo pour ce chantier" />
            </div>
          ) : (
            <div className="entity-grid card-section-gap">
              {chantierPhotos.map((photo) => {
                const url = chantierPhotoUrls.get(photo.storage_path)
                return (
                  <Card key={photo.id} variant="alt">
                    <p className="entity-card-title">{photo.profiles?.full_name || photo.profiles?.email || 'Employé'}</p>
                    <p className="entity-card-meta">{formatDateTimeLong(photo.created_at)}</p>
                    {url ? (
                      <img src={url} alt="Photo du chantier" className="chantier-photo-img" />
                    ) : (
                      <div className="chantier-photo-img chantier-photo-img-placeholder" />
                    )}
                    {photo.commentaire && <p className="entity-card-meta">{photo.commentaire}</p>}
                  </Card>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {photoChantierId && (
        <ChantierPhotoModal
          open={photoModalOpen}
          chantierId={photoChantierId}
          onClose={() => setPhotoModalOpen(false)}
          onUploaded={handlePhotoUploaded}
        />
      )}

      {/* KPI, déplacés après statut/chantier/actions/anomalies ----------- */}
      <div className="stat-grid">
        <StatCard label="Aujourd'hui" value={formatMinutes(periodTotals.todayWorkedMinutes)} icon={Clock} />
        <StatCard label="Cette semaine" value={formatMinutes(periodTotals.weekWorkedMinutes)} icon={CalendarDays} />
        <StatCard label="Ce mois" value={formatMinutes(periodTotals.monthWorkedMinutes)} icon={CalendarRange} />
        <StatCard label="Chantiers effectués" value={String(completedChantierCount)} icon={HardHat} />
      </div>

      {periodTotals.todayPauseMinutes > 0 && (
        <p className="entity-card-meta">Dont {formatMinutes(periodTotals.todayPauseMinutes)} de pause aujourd’hui.</p>
      )}

      {/* Historique --------------------------------------------------- */}
      <Card>
        <div className="card-header">
          <h2 className="card-title">Mes chantiers</h2>
        </div>
        <div className="ranking-list">
          <div className="ranking-row">
            <span className="ranking-row-name">Actifs</span>
            <span className="ranking-row-value">{activeChantierCount}</span>
          </div>
          <div className="ranking-row">
            <span className="ranking-row-name">Terminés</span>
            <span className="ranking-row-value">{chantiersTermines.length}</span>
          </div>
          <div className="ranking-row">
            <span className="ranking-row-name">Total effectués</span>
            <span className="ranking-row-value">{completedChantierCount}</span>
          </div>
        </div>
      </Card>

      {chantiersTermines.length > 0 && (
        <>
          <div className="card-header">
            <h2 className="card-title">Chantiers terminés</h2>
          </div>
          <div className="entity-grid">
            {chantiersTermines.map((entry) => {
              const chantier = entry.lastIntervention.arrivee.chantiers
              const lastDate = entry.lastIntervention.depart?.pointe_at ?? entry.lastIntervention.arrivee.pointe_at
              return (
                <Card key={entry.chantierId}>
                  <div className="entity-card-top">
                    <div>
                      <p className="entity-card-title">{chantier?.nom ?? '—'}</p>
                      {chantier?.ville && (
                        <p className="entity-card-meta meta-inline">
                          <MapPin size={13} />
                          {chantier.ville}
                        </p>
                      )}
                    </div>
                    <Badge variant="neutral">Terminé</Badge>
                  </div>
                  <p className="entity-card-meta">Dernière intervention : {formatDate(lastDate)}</p>
                  <p className="entity-card-meta">
                    {formatMinutes(entry.totalWorkedMinutes)} au total · {entry.interventionCount} intervention
                    {entry.interventionCount > 1 ? 's' : ''}
                  </p>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Card>
        <div className="card-header">
          <h2 className="card-title">Mes derniers pointages</h2>
        </div>
        {loading ? (
          <div className="loading-block">Chargement…</div>
        ) : recentInterventions.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucun pointage" description="Votre historique apparaîtra ici." />
        ) : (
          <div className="ranking-list">
            {recentInterventions.map((intervention) => (
              <div className="pointage-history-row" key={intervention.depart?.id}>
                <div className="pointage-history-top">
                  <span className="pointage-history-label">
                    {formatDate(intervention.arrivee.pointe_at)} · {intervention.arrivee.chantiers?.nom ?? '—'}
                  </span>
                  <span className="pointage-history-duration">
                    {intervention.workedMinutes !== null ? formatMinutes(intervention.workedMinutes) : '—'}
                  </span>
                </div>
                <p className="pointage-history-meta">
                  {formatTime(intervention.arrivee.pointe_at)} →{' '}
                  {intervention.depart ? formatTime(intervention.depart.pointe_at) : '—'}
                  {intervention.pauses.length > 0 && ` · Pause ${formatMinutes(intervention.pauseMinutes)}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
