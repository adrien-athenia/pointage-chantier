import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { listChantiers } from '../services/chantierService'
import { listAssignmentsForEmploye, setAssignment } from '../services/employeChantierService'
import { resolveChantierStatut } from '../lib/chantierStatut'
import { getInitials } from '../lib/formatters'
import type { Chantier, Profile } from '../types/database'

interface EmployeManageModalProps {
  employe: Profile | null
  onClose: () => void
  /** Prévenu après une sauvegarde réussie, pour rafraîchir les compteurs de la liste. */
  onSaved: () => void
}

/**
 * Affecte/désaffecte un employé aux chantiers actifs — réutilise
 * intégralement le service employe_chantiers existant (setAssignment,
 * déjà utilisé par ChantierForm dans l'autre sens) : aucun second système
 * d'affectation n'est créé ici.
 */
export function EmployeManageModal({ employe, onClose, onSaved }: EmployeManageModalProps) {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Verrou synchrone : voir la même remarque dans EmployeInviteModal.
  const savingLockRef = useRef(false)

  const employeId = employe?.id ?? null

  useEffect(() => {
    if (!employeId) return
    let isMounted = true

    setLoading(true)
    setLoadError(null)
    setSaveError(null)
    setSaved(false)

    Promise.all([listChantiers(), listAssignmentsForEmploye(employeId)]).then(([chantiersRes, assignRes]) => {
      if (!isMounted) return

      // listActiveChantiers() filtre côté serveur sur chantiers.statut, une
      // colonne absente de cette base locale (voir lib/chantierStatut.ts) —
      // on repart donc de listChantiers() (select('*'), toujours sûre) et on
      // filtre nous-mêmes avec le même filet de sécurité que la page
      // Chantiers, plutôt que d'utiliser une fonction qui échouerait ici.
      const activeChantiers = chantiersRes.data.filter((chantier) => resolveChantierStatut(chantier) === 'actif')
      setChantiers(activeChantiers)
      setAssignedIds(new Set(assignRes.data.filter((a) => a.actif).map((a) => a.chantier_id)))

      const loadErr = chantiersRes.error ?? assignRes.error
      if (loadErr) {
        console.error('[EmployeManageModal] erreur Supabase lors du chargement :', loadErr)
      }
      setLoadError(loadErr ? 'Impossible de charger les chantiers. Réessayez.' : null)
      setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [employeId])

  function toggleChantier(chantierId: string) {
    setAssignedIds((current) => {
      const next = new Set(current)
      if (next.has(chantierId)) {
        next.delete(chantierId)
      } else {
        next.add(chantierId)
      }
      return next
    })
  }

  async function handleSave() {
    if (!employeId || savingLockRef.current) return // empêche toute double soumission
    savingLockRef.current = true

    setSaving(true)
    setSaveError(null)
    setSaved(false)

    const results = await Promise.all(
      chantiers.map((chantier) => setAssignment(employeId, chantier.id, assignedIds.has(chantier.id))),
    )

    savingLockRef.current = false
    setSaving(false)

    const failed = results.find((result) => result.error)
    if (failed) {
      console.error('[EmployeManageModal] erreur Supabase lors de la sauvegarde :', failed.error)
      setSaveError('Impossible d’enregistrer les affectations. Réessayez.')
      return
    }

    setSaved(true)
    onSaved()
  }

  const count = assignedIds.size
  const countLabel = count === 0 ? 'Aucun chantier affecté' : `${count} chantier${count > 1 ? 's' : ''} affecté${count > 1 ? 's' : ''}`

  return (
    <Modal open={employe != null} title="Gérer l’employé" onClose={onClose}>
      {employe && (
        <div className="modal-form">
          <div className="entity-person">
            <span className="avatar">{getInitials(employe.full_name, employe.email)}</span>
            <div>
              <p className="entity-card-title">{employe.full_name || 'Sans nom'}</p>
              <p className="entity-card-meta">{employe.email}</p>
            </div>
          </div>

          <Badge variant="neutral">Rôle : Employé</Badge>

          <div>
            <div className="card-header">
              <p className="field-label">Chantiers affectés</p>
              <span className="entity-card-meta">{countLabel}</span>
            </div>

            {loading ? (
              <div className="loading-block">Chargement…</div>
            ) : loadError ? (
              <p className="error-banner">
                <AlertTriangle size={16} />
                {loadError}
              </p>
            ) : chantiers.length === 0 ? (
              <p className="entity-card-meta">Aucun chantier actif disponible.</p>
            ) : (
              <div className="assignment-list">
                {chantiers.map((chantier) => (
                  <label className="field-checkbox" key={chantier.id}>
                    <input
                      type="checkbox"
                      checked={assignedIds.has(chantier.id)}
                      onChange={() => toggleChantier(chantier.id)}
                    />
                    {chantier.nom}
                  </label>
                ))}
              </div>
            )}
          </div>

          {saveError && <p className="field-error">{saveError}</p>}
          {saved && !saveError && <p className="inline-notice">Affectations enregistrées.</p>}

          <div className="page-header-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Fermer
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || loading || Boolean(loadError)}>
              {saving ? 'Enregistrement…' : 'Enregistrer les affectations'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
