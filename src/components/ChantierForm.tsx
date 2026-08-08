import { useEffect, useState, type FormEvent } from 'react'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { createChantier, updateChantier, type ChantierInput } from '../services/chantierService'
import { listAssignmentsForChantier, setAssignment } from '../services/employeChantierService'
import type { Chantier, Profile } from '../types/database'

interface ChantierFormProps {
  chantier: Chantier | null
  employes: Profile[]
  onSaved: () => void
  onCancel: () => void
}

export function ChantierForm({ chantier, employes, onSaved, onCancel }: ChantierFormProps) {
  const [nom, setNom] = useState(chantier?.nom ?? '')
  const [adresse, setAdresse] = useState(chantier?.adresse ?? '')
  const [ville, setVille] = useState(chantier?.ville ?? '')
  const [latitude, setLatitude] = useState(chantier?.latitude != null ? String(chantier.latitude) : '')
  const [longitude, setLongitude] = useState(chantier?.longitude != null ? String(chantier.longitude) : '')
  const [rayon, setRayon] = useState(String(chantier?.rayon_autorise ?? 100))
  const [dureeMax, setDureeMax] = useState(
    chantier?.duree_max_intervention_minutes != null ? String(chantier.duree_max_intervention_minutes) : '',
  )
  const [actif, setActif] = useState(chantier?.actif ?? true)
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const input: ChantierInput = {
      nom: nom.trim(),
      adresse: adresse.trim() || null,
      ville: ville.trim() || null,
      latitude: latitude.trim() ? Number(latitude) : null,
      longitude: longitude.trim() ? Number(longitude) : null,
      rayonAutorise: rayon.trim() ? Number(rayon) : 100,
      dureeMaxInterventionMinutes: dureeMax.trim() ? Number(dureeMax) : null,
      actif,
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

  return (
    <Card>
      <div className="card-header">
        <h2 className="card-title">{chantier ? 'Modifier le chantier' : 'Nouveau chantier'}</h2>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Fermer
        </Button>
      </div>

      <form className="chantier-form" onSubmit={handleSubmit}>
        <Input label="Nom du chantier" value={nom} onChange={(event) => setNom(event.target.value)} required />

        <div className="form-grid-2">
          <Input label="Adresse" value={adresse} onChange={(event) => setAdresse(event.target.value)} />
          <Input label="Ville" value={ville} onChange={(event) => setVille(event.target.value)} />
        </div>

        <div className="form-grid-2">
          <Input
            label="Latitude"
            type="number"
            step="any"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="ex. 48.8566"
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="ex. 2.3522"
          />
        </div>

        <div className="form-grid-2">
          <Input
            label="Rayon autorisé (m)"
            type="number"
            min="1"
            value={rayon}
            onChange={(event) => setRayon(event.target.value)}
          />
          <Input
            label="Durée max. intervention (min)"
            type="number"
            min="1"
            placeholder="Aucune limite"
            value={dureeMax}
            onChange={(event) => setDureeMax(event.target.value)}
          />
        </div>

        <label className="field-checkbox" htmlFor="chantier-actif">
          <input
            id="chantier-actif"
            type="checkbox"
            checked={actif}
            onChange={(event) => setActif(event.target.checked)}
          />
          Chantier actif
        </label>

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
          <p className="entity-card-meta">
            L’affectation des employés se fait après la création, en modifiant le chantier.
          </p>
        )}

        {error && <p className="field-error">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Card>
  )
}
