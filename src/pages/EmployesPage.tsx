import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Users } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { EmployeInviteModal } from '../components/EmployeInviteModal'
import { EmployeManageModal } from '../components/EmployeManageModal'
import { listEmployeeProfiles } from '../services/employeService'
import { listActiveAssignmentCountsByEmploye } from '../services/employeChantierService'
import { getInitials } from '../lib/formatters'
import type { Profile } from '../types/database'

const GENERIC_LOAD_ERROR = 'Impossible de charger les employés. Réessayez.'

/** "Aucun chantier" / "1 chantier" / "X chantiers" — exactement le libellé compact demandé pour la carte. */
function formatChantiersAffectesCard(count: number): string {
  if (count === 0) return 'Aucun chantier'
  if (count === 1) return '1 chantier'
  return `${count} chantiers`
}

export function EmployesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [managingEmployeeId, setManagingEmployeeId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  function loadProfiles() {
    setLoading(true)
    Promise.all([listEmployeeProfiles(), listActiveAssignmentCountsByEmploye()]).then(([profilesRes, countsRes]) => {
      setProfiles(profilesRes.data)
      setAssignmentCounts(countsRes.data)
      const loadErr = profilesRes.error ?? countsRes.error
      if (loadErr) {
        console.error('[EmployesPage] erreur Supabase lors du chargement :', loadErr)
      }
      setError(loadErr ? GENERIC_LOAD_ERROR : null)
      setLoading(false)
    })
  }

  // Ne rafraîchit que les compteurs d'affectation après une sauvegarde
  // dans le panneau "Gérer" — pas besoin de recharger toute la liste des
  // profils, qui n'a pas changé.
  function refreshAssignmentCounts() {
    listActiveAssignmentCountsByEmploye().then((res) => {
      setAssignmentCounts(res.data)
      if (res.error) {
        console.error('[EmployesPage] erreur Supabase lors du rafraîchissement des compteurs :', res.error)
      }
    })
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([listEmployeeProfiles(), listActiveAssignmentCountsByEmploye()]).then(([profilesRes, countsRes]) => {
      if (!isMounted) return
      setProfiles(profilesRes.data)
      setAssignmentCounts(countsRes.data)
      const loadErr = profilesRes.error ?? countsRes.error
      if (loadErr) {
        console.error('[EmployesPage] erreur Supabase lors du chargement :', loadErr)
      }
      setError(loadErr ? GENERIC_LOAD_ERROR : null)
      setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  function handleOpenModal() {
    setSuccessMessage(null)
    setModalOpen(true)
  }

  function handleInvited(email: string) {
    setModalOpen(false)
    setSuccessMessage(`Invitation envoyée à ${email}.`)
    loadProfiles()
  }

  const managingEmploye = profiles.find((p) => p.id === managingEmployeeId) ?? null

  return (
    <div>
      <PageHeader
        title="Employés"
        subtitle={`${profiles.length} employé${profiles.length > 1 ? 's' : ''}`}
        actions={
          <Button icon={<Plus size={18} />} onClick={handleOpenModal}>
            Nouvel employé
          </Button>
        }
      />

      {successMessage && <p className="inline-notice">{successMessage}</p>}

      {error && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      {loading ? (
        <div className="loading-block">Chargement…</div>
      ) : profiles.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Aucun employé"
            description="Ajoutez votre premier employé pour commencer."
            action={
              <Button size="sm" icon={<Plus size={16} />} onClick={handleOpenModal}>
                Ajouter un employé
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="entity-grid">
          {profiles.map((profile) => {
            const chantiersCount = assignmentCounts.get(profile.id) ?? 0
            return (
              <Card key={profile.id}>
                <div className="entity-person">
                  <span className="avatar">{getInitials(profile.full_name, profile.email)}</span>
                  <div>
                    <p className="entity-card-title">{profile.full_name || 'Sans nom'}</p>
                    <p className="entity-card-meta">{profile.email}</p>
                  </div>
                </div>

                <div className="entity-card-footer">
                  <Badge variant="neutral">Employé</Badge>
                </div>

                <p className="entity-card-meta">
                  Chantiers affectés : {formatChantiersAffectesCard(chantiersCount)}
                </p>

                <div className="entity-card-footer">
                  <Button variant="secondary" size="sm" onClick={() => setManagingEmployeeId(profile.id)}>
                    Gérer
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <EmployeInviteModal open={modalOpen} onClose={() => setModalOpen(false)} onInvited={handleInvited} />

      <EmployeManageModal
        employe={managingEmploye}
        onClose={() => setManagingEmployeeId(null)}
        onSaved={refreshAssignmentCounts}
      />
    </div>
  )
}
