import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { createChantier, updateChantier, type ChantierInput } from '../services/chantierService'
import { listAssignmentsForChantier, setAssignment } from '../services/employeChantierService'
import { geocodeAddress } from '../lib/geocoding'
import { resolveChantierStatut } from '../lib/chantierStatut'
import type { Chantier, Profile } from '../types/database'

interface ChantierFormProps {
  chantier: Chantier | null
  employes: Profile[]
  onSaved: () => void
  onCancel: () => void
}

const RAYON_PRESETS = [50, 100, 150, 200]
const DUREE_PRESETS: { key: string; label: string; hours: number | null }[] = [
  { key: 'none', label: 'Aucune limite', hours: null },
  { key: '8', label: '8 h', hours: 8 },
  { key: '10', label: '10 h', hours: 10 },
  { key: '12', label: '12 h', hours: 12 },
]

/** Statut de la DERNIÈRE tentative de géocodage (pas de l'état affiché — voir displayStatus dans le composant, qui combine ceci avec la présence de coordonnées et la fraîcheur de l'adresse). */
type GeoRequestStatus = 'idle' | 'loading' | 'error'

function initRayonPreset(chantier: Chantier | null): { preset: string; custom: string } {
  const value = chantier?.rayon_autorise ?? 100
  if (RAYON_PRESETS.includes(value)) return { preset: String(value), custom: '' }
  return { preset: 'custom', custom: String(value) }
}

function initDureeMaxPreset(chantier: Chantier | null): { preset: string; custom: string } {
  const minutes = chantier?.duree_max_intervention_minutes ?? null
  if (minutes == null) return { preset: 'none', custom: '' }
  const hours = minutes / 60
  const matching = DUREE_PRESETS.find((p) => p.hours === hours)
  if (matching) return { preset: matching.key, custom: '' }
  const customLabel = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100)
  return { preset: 'custom', custom: customLabel }
}

export function ChantierForm({ chantier, employes, onSaved, onCancel }: ChantierFormProps) {
  const [nom, setNom] = useState(chantier?.nom ?? '')
  const [adresse, setAdresse] = useState(chantier?.adresse ?? '')
  const [ville, setVille] = useState(chantier?.ville ?? '')

  // Champs techniques : jamais saisis directement par le patron, remplis
  // uniquement via le géocodage (voir handleGeocode ci-dessous). Conservés
  // tels quels tant qu'un nouveau géocodage réussi ne les remplace pas —
  // un échec de géocodage n'efface donc jamais une position déjà connue.
  const [latitude, setLatitude] = useState<number | null>(chantier?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(chantier?.longitude ?? null)

  // Adresse/ville pour lesquelles les coordonnées actuelles ont réellement
  // été calculées — sert à détecter qu'elles sont devenues obsolètes si le
  // patron modifie adresse/ville depuis. Initialisé à l'adresse du
  // chantier existant (on présume que ses coordonnées lui correspondent),
  // ou à null pour un nouveau chantier (aucune coordonnée encore connue).
  const [geocodedFor, setGeocodedFor] = useState<{ adresse: string; ville: string } | null>(
    chantier?.latitude != null && chantier?.longitude != null
      ? { adresse: (chantier.adresse ?? '').trim(), ville: (chantier.ville ?? '').trim() }
      : null,
  )

  const [geoRequestStatus, setGeoRequestStatus] = useState<GeoRequestStatus>('idle')
  const [geoErrorMessage, setGeoErrorMessage] = useState<string | null>(null)
  // Verrou synchrone (pas un state) : un double-clic déclenche deux
  // gestionnaires d'événement dans le même tick, avant que React n'ait eu
  // le temps de recalculer geoRequestStatus — un simple test sur le state
  // laisserait donc passer les deux appels. La ref, elle, est lue/écrite
  // immédiatement, sans attendre de re-rendu.
  const geocodingLockRef = useRef(false)

  const [rayonInit] = useState(() => initRayonPreset(chantier))
  const [rayonPreset, setRayonPreset] = useState(rayonInit.preset)
  const [rayonCustomValue, setRayonCustomValue] = useState(rayonInit.custom)

  const [dureeInit] = useState(() => initDureeMaxPreset(chantier))
  const [dureeMaxPreset, setDureeMaxPreset] = useState(dureeInit.preset)
  const [dureeMaxCustomHours, setDureeMaxCustomHours] = useState(dureeInit.custom)

  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chantier) return
    let isMounted = true

    listAssignmentsForChantier(chantier.id).then((res) => {
      if (!isMounted) return
      setAssignedIds(new Set(res.data.filter((assignment) => assignment.actif).map((assignment) => assignment.employe_id)))
    })

    return () => {
      isMounted = false
    }
  }, [chantier])

  function toggleEmploye(employeId: string) {
    setAssignedIds((current) => {
      const next = new Set(current)
      if (next.has(employeId)) {
        next.delete(employeId)
      } else {
        next.add(employeId)
      }
      return next
    })
  }

  const hasCoords = latitude != null && longitude != null

  // Les coordonnées actuelles ne correspondent plus au texte saisi : soit
  // aucun géocodage n'a jamais été fait (geocodedFor === null), soit
  // adresse/ville ont changé depuis le dernier géocodage réussi.
  const addressStale =
    geocodedFor != null && (adresse.trim() !== geocodedFor.adresse || ville.trim() !== geocodedFor.ville)

  type DisplayStatus = 'idle' | 'loading' | 'error' | 'stale' | 'success'
  const displayStatus: DisplayStatus =
    geoRequestStatus === 'loading'
      ? 'loading'
      : geoRequestStatus === 'error'
        ? 'error'
        : hasCoords && addressStale
          ? 'stale'
          : hasCoords
            ? 'success'
            : 'idle'

  const canGeocode = adresse.trim() !== '' && ville.trim() !== ''
  const showGeoButton = displayStatus !== 'success'
  const geoButtonLabel = hasCoords ? 'Recalculer à partir de l’adresse' : 'Localiser à partir de l’adresse'

  async function handleGeocode() {
    if (submitting || geocodingLockRef.current || !canGeocode) return
    geocodingLockRef.current = true

    setGeoRequestStatus('loading')
    setGeoErrorMessage(null)

    const outcome = await geocodeAddress(adresse, ville)
    geocodingLockRef.current = false

    if (outcome.result) {
      setLatitude(outcome.result.latitude)
      setLongitude(outcome.result.longitude)
      setGeocodedFor({ adresse: adresse.trim(), ville: ville.trim() })
      setGeoRequestStatus('idle')
    } else {
      // Ne jamais effacer une position déjà connue tant qu'une nouvelle
      // localisation n'a pas réellement abouti.
      setGeoRequestStatus('error')
      setGeoErrorMessage(outcome.error)
    }
  }

  function resolveRayonMetres(): number {
    if (rayonPreset === 'custom') {
      const value = Number(rayonCustomValue)
      return rayonCustomValue.trim() && !Number.isNaN(value) && value > 0 ? Math.round(value) : 100
    }
    return Number(rayonPreset)
  }

  function resolveDureeMaxMinutes(): number | null {
    if (dureeMaxPreset === 'none') return null
    if (dureeMaxPreset === 'custom') {
      const hours = Number(dureeMaxCustomHours)
      return dureeMaxCustomHours.trim() && !Number.isNaN(hours) && hours > 0 ? Math.round(hours * 60) : null
    }
    const matching = DUREE_PRESETS.find((p) => p.key === dureeMaxPreset)
    return matching?.hours != null ? matching.hours * 60 : null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Empêche toute double soumission, ET empêche d'enregistrer tant qu'un
    // géocodage est encore en cours : sans ce second verrou, un clic sur
    // "Enregistrer" pendant que "Localiser à partir de l'adresse" est
    // encore en vol envoie latitude/longitude encore à null (l'état React
    // n'a pas fini de se mettre à jour), alors même que l'écran affichera
    // "✓ Position GPS définie" quelques instants plus tard quand le
    // géocodage aboutit — trop tard, après l'envoi. D'où des chantiers
    // enregistrés sans coordonnées malgré un géocodage visiblement réussi.
    if (submitting || geocodingLockRef.current) return

    setSubmitting(true)
    setError(null)

    const input: ChantierInput = {
      nom: nom.trim(),
      adresse: adresse.trim() || null,
      ville: ville.trim() || null,
      latitude,
      longitude,
      rayonAutorise: resolveRayonMetres(),
      dureeMaxInterventionMinutes: resolveDureeMaxMinutes(),
    }

    const result = chantier ? await updateChantier(chantier.id, input) : await createChantier(input)

    if (result.error || !result.data) {
      setSubmitting(false)
      setError(result.error ?? 'Erreur lors de l’enregistrement.')
      return
    }

    const chantierId = result.data.id
    await Promise.all(
      employes.map((employe) => setAssignment(employe.id, chantierId, assignedIds.has(employe.id))),
    )

    setSubmitting(false)
    onSaved()
  }

  const title = !chantier ? 'Nouveau chantier' : resolveChantierStatut(chantier) === 'actif' ? 'Modifier le chantier' : 'Consulter le chantier'

  return (
    <Card>
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Fermer
        </Button>
      </div>

      <form className="chantier-form" onSubmit={handleSubmit}>
        <Input label="Nom du chantier" placeholder="Résidence Les Oliviers" value={nom} onChange={(event) => setNom(event.target.value)} required />

        <Input label="Adresse" placeholder="12 avenue des Oliviers" value={adresse} onChange={(event) => setAdresse(event.target.value)} />

        <Input label="Ville" placeholder="Istres" value={ville} onChange={(event) => setVille(event.target.value)} />
        <p className="field-hint">Nom de la ville (ex. Istres) — pas de code postal, nécessaire pour localiser l’adresse.</p>

        <div className="field">
          <label className="field-label">Localisation du chantier</label>

          {displayStatus === 'success' && (
            <div className="geo-status geo-status-success">
              <CheckCircle2 size={16} />
              <div>
                <p className="geo-status-label">✓ Position GPS définie</p>
                <p className="geo-status-hint">Position calculée à partir de l’adresse du chantier.</p>
              </div>
            </div>
          )}

          {displayStatus === 'idle' && <p className="geo-status-idle">Position GPS non définie</p>}

          {displayStatus === 'stale' && (
            <p className="geo-status-idle">
              {chantier ? 'Adresse modifiée — position GPS à recalculer' : 'Position GPS à recalculer'}
            </p>
          )}

          {displayStatus === 'error' && <p className="field-error">{geoErrorMessage}</p>}

          {showGeoButton && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGeocode}
              disabled={submitting || geoRequestStatus === 'loading' || !canGeocode}
            >
              {geoRequestStatus === 'loading' ? 'Localisation en cours…' : geoButtonLabel}
            </Button>
          )}
        </div>

        <div className="field">
          <label className="field-label">Rayon de pointage</label>
          <p className="field-hint">Distance maximale autour du chantier autorisée lors du pointage.</p>
          <div className="preset-group">
            {RAYON_PRESETS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={rayonPreset === String(value) ? 'primary' : 'secondary'}
                onClick={() => setRayonPreset(String(value))}
              >
                {value} m
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={rayonPreset === 'custom' ? 'primary' : 'secondary'}
              onClick={() => setRayonPreset('custom')}
            >
              Personnalisé
            </Button>
          </div>
          {rayonPreset === 'custom' && (
            <Input
              type="number"
              min="1"
              aria-label="Rayon de pointage personnalisé, en mètres"
              placeholder="Distance en mètres"
              value={rayonCustomValue}
              onChange={(event) => setRayonCustomValue(event.target.value)}
            />
          )}
        </div>

        <div className="field">
          <label className="field-label">Durée maximale d’une intervention</label>
          <p className="field-hint">Une alerte pourra être générée si une intervention dépasse cette durée.</p>
          <div className="preset-group">
            {DUREE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                size="sm"
                variant={dureeMaxPreset === preset.key ? 'primary' : 'secondary'}
                onClick={() => setDureeMaxPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={dureeMaxPreset === 'custom' ? 'primary' : 'secondary'}
              onClick={() => setDureeMaxPreset('custom')}
            >
              Personnalisé
            </Button>
          </div>
          {dureeMaxPreset === 'custom' && (
            <Input
              type="number"
              min="0.5"
              step="0.5"
              aria-label="Durée maximale personnalisée, en heures"
              placeholder="Durée en heures"
              value={dureeMaxCustomHours}
              onChange={(event) => setDureeMaxCustomHours(event.target.value)}
            />
          )}
        </div>

        {chantier && employes.length > 0 && (
          <div>
            <p className="field-label">Employés affectés</p>
            <div className="assignment-list">
              {employes.map((employe) => (
                <label className="field-checkbox" key={employe.id}>
                  <input
                    type="checkbox"
                    checked={assignedIds.has(employe.id)}
                    onChange={() => toggleEmploye(employe.id)}
                  />
                  {employe.full_name || employe.email}
                </label>
              ))}
            </div>
          </div>
        )}

        {!chantier && employes.length > 0 && (
          <p className="entity-card-meta">Vous pourrez affecter les employés après la création du chantier.</p>
        )}

        {error && <p className="field-error">{error}</p>}

        <Button type="submit" disabled={submitting || geoRequestStatus === 'loading'} block>
          {submitting ? (chantier ? 'Enregistrement…' : 'Création…') : chantier ? 'Enregistrer les modifications' : 'Créer le chantier'}
        </Button>
      </form>
    </Card>
  )
}
