import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  Camera,
  CheckCircle2,
  HardHat,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { ChantierForm } from '../components/ChantierForm'
import { listChantiers, setChantierStatut, deleteChantier } from '../services/chantierService'
import { listEmployeeProfiles } from '../services/employeService'
import { listActiveAssignmentCounts } from '../services/employeChantierService'
import { resolveChantierStatut } from '../lib/chantierStatut'
import type { Chantier, ChantierStatut, Profile } from '../types/database'

const GENERIC_LOAD_ERROR = 'Impossible de charger les chantiers. Réessayez.'

const TABS: { key: ChantierStatut; label: string }[] = [
  { key: 'actif', label: 'Actifs' },
  { key: 'termine', label: 'Terminés' },
  { key: 'archive', label: 'Archivés' },
]

const STATUT_BADGE: Record<ChantierStatut, { label: string; variant: 'success' | 'neutral' }> = {
  actif: { label: 'Actif', variant: 'success' },
  termine: { label: 'Terminé', variant: 'neutral' },
  archive: { label: 'Archivé', variant: 'neutral' },
}

const EMPTY_STATE_CONTENT: Record<ChantierStatut, { title: string; description: string }> = {
  actif: { title: 'Aucun chantier actif', description: 'Les chantiers actifs apparaîtront ici.' },
  termine: { title: 'Aucun chantier terminé', description: 'Les chantiers terminés apparaîtront ici.' },
  archive: { title: 'Aucun chantier archivé', description: 'Les chantiers archivés apparaîtront ici.' },
}

type ConfirmActionType = 'terminer' | 'archiver' | 'restaurer' | 'supprimer'

const CONFIRM_CONTENT: Record<
  ConfirmActionType,
  { title: string; message: (nom: string) => string; confirmLabel: string; danger?: boolean }
> = {
  terminer: {
    title: 'Terminer ce chantier',
    message: (nom) =>
      `Terminer « ${nom} » ? Il ne sera plus sélectionnable pour un nouveau pointage, mais son historique et ses heures restent conservés.`,
    confirmLabel: 'Terminer',
  },
  archiver: {
    title: 'Archiver ce chantier',
    message: (nom) =>
      `Archiver « ${nom} » ? Il sera masqué des listes courantes ; son historique et ses heures restent conservés.`,
    confirmLabel: 'Archiver',
  },
  restaurer: {
    title: 'Restaurer ce chantier',
    message: (nom) => `Restaurer « ${nom} » en chantier actif ? Il redeviendra sélectionnable par les employés affectés.`,
    confirmLabel: 'Restaurer',
  },
  supprimer: {
    title: 'Supprimer définitivement',
    message: (nom) =>
      `Supprimer définitivement « ${nom} » ? Cette action est irréversible et n'est possible que si aucun pointage n'existe sur ce chantier.`,
    confirmLabel: 'Supprimer définitivement',
    danger: true,
  },
}

const STATUT_BY_ACTION: Partial<Record<ConfirmActionType, ChantierStatut>> = {
  terminer: 'termine',
  archiver: 'archive',
  restaurer: 'actif',
}

interface ConfirmState {
  type: ConfirmActionType
  chantier: Chantier
}

/** "10 h" pour une valeur ronde, "7h30" sinon — cohérent avec l'exemple de carte demandé. */
function formatDureeMaxCard(minutes: number | null): string {
  if (minutes == null) return 'aucune limite'
  if (minutes % 60 === 0) return `${minutes / 60} h`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours}h${String(remaining).padStart(2, '0')}`
}

export function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [employes, setEmployes] = useState<Profile[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ChantierStatut>('actif')
  const [formOpen, setFormOpen] = useState(false)
  const [editingChantier, setEditingChantier] = useState<Chantier | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Réutilisée après création/modification/changement de statut : ne
  // recharge que chantiers + compteurs d'affectation (la liste des
  // employés, elle, ne change pas suite à ces actions).
  function loadChantiers() {
    setLoading(true)
    Promise.all([listChantiers(), listActiveAssignmentCounts()]).then(([chantiersRes, countsRes]) => {
      setChantiers(chantiersRes.data)
      setAssignmentCounts(countsRes.data)
      const loadError = chantiersRes.error ?? countsRes.error
      if (loadError) {
        console.error('[ChantiersPage] erreur Supabase lors du chargement :', loadError)
      }
      setError(loadError ? GENERIC_LOAD_ERROR : null)
      setLoading(false)
    })
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([listChantiers(), listEmployeeProfiles(), listActiveAssignmentCounts()]).then(
      ([chantiersRes, employesRes, countsRes]) => {
        if (!isMounted) return
        setChantiers(chantiersRes.data)
        setEmployes(employesRes.data)
        setAssignmentCounts(countsRes.data)
        const loadError = chantiersRes.error ?? employesRes.error ?? countsRes.error
        if (loadError) {
          console.error('[ChantiersPage] erreur Supabase lors du chargement :', loadError)
        }
        setError(loadError ? GENERIC_LOAD_ERROR : null)
        setLoading(false)
      },
    )

    return () => {
      isMounted = false
    }
  }, [])

  function openCreateForm() {
    setEditingChantier(null)
    setFormOpen(true)
  }

  function openEditForm(chantier: Chantier) {
    setEditingChantier(chantier)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingChantier(null)
  }

  function handleSaved() {
    closeForm()
    loadChantiers()
  }

  function closeConfirm() {
    setConfirmState(null)
    setActionError(null)
  }

  async function handleConfirm() {
    if (!confirmState) return
    setActionLoading(true)
    setActionError(null)

    if (confirmState.type === 'supprimer') {
      const res = await deleteChantier(confirmState.chantier.id)
      setActionLoading(false)
      if (!res.success) {
        if (res.error) console.error('[ChantiersPage] erreur suppression chantier :', res.error)
        setActionError(res.error)
        return
      }
      setConfirmState(null)
      loadChantiers()
      return
    }

    const statut = STATUT_BY_ACTION[confirmState.type]
    if (!statut) return
    const res = await setChantierStatut(confirmState.chantier.id, statut)
    setActionLoading(false)
    if (res.error) {
      console.error('[ChantiersPage] erreur changement de statut :', res.error)
      setActionError('Impossible de mettre à jour ce chantier. Réessayez.')
      return
    }
    setConfirmState(null)
    loadChantiers()
  }

  const filteredChantiers = chantiers.filter((chantier) => resolveChantierStatut(chantier) === activeTab)
  const emptyContent = EMPTY_STATE_CONTENT[activeTab]

  return (
    <div>
      <PageHeader
        title="Chantiers"
        subtitle={`${chantiers.length} chantier${chantiers.length > 1 ? 's' : ''} au total`}
        actions={
          <Button icon={<Plus size={18} />} onClick={openCreateForm}>
            Nouveau chantier
          </Button>
        }
      />

      <div className="page-header-actions">
        {TABS.map((tab) => {
          const count = chantiers.filter((c) => resolveChantierStatut(c) === tab.key).length
          return (
            <Button
              key={tab.key}
              size="sm"
              variant={activeTab === tab.key ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({count})
            </Button>
          )
        })}
      </div>

      {error && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      {formOpen && (
        <ChantierForm chantier={editingChantier} employes={employes} onSaved={handleSaved} onCancel={closeForm} />
      )}

      {loading ? (
        <div className="loading-block">Chargement…</div>
      ) : filteredChantiers.length === 0 ? (
        <Card>
          <EmptyState icon={HardHat} title={emptyContent.title} description={emptyContent.description} />
        </Card>
      ) : (
        <div className="entity-grid">
          {filteredChantiers.map((chantier) => {
            const statut = resolveChantierStatut(chantier)
            const badge = STATUT_BADGE[statut]
            const localisation = chantier.ville || chantier.adresse
            const employeCount = assignmentCounts.get(chantier.id) ?? 0

            return (
              <Card key={chantier.id}>
                <div className="entity-card-top">
                  <div>
                    <p className="entity-card-title">{chantier.nom}</p>
                    {localisation && (
                      <p className="entity-card-meta meta-inline">
                        <MapPin size={13} />
                        {localisation}
                      </p>
                    )}
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>

                {employeCount > 0 && (
                  <p className="entity-card-meta">
                    {employeCount} employé{employeCount > 1 ? 's' : ''} affecté{employeCount > 1 ? 's' : ''}
                  </p>
                )}
                <p className="entity-card-meta">Rayon GPS : {chantier.rayon_autorise} m</p>
                <p className="entity-card-meta">
                  Durée max. : {formatDureeMaxCard(chantier.duree_max_intervention_minutes)}
                </p>

                <div className="entity-card-footer">
                  {statut === 'actif' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={16} />}
                        onClick={() => openEditForm(chantier)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CheckCircle2 size={16} />}
                        onClick={() => setConfirmState({ type: 'terminer', chantier })}
                      >
                        Terminer
                      </Button>
                    </>
                  )}
                  {statut === 'termine' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={16} />}
                        onClick={() => openEditForm(chantier)}
                      >
                        Consulter
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Archive size={16} />}
                        onClick={() => setConfirmState({ type: 'archiver', chantier })}
                      >
                        Archiver
                      </Button>
                    </>
                  )}
                  {statut === 'archive' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw size={16} />}
                      onClick={() => setConfirmState({ type: 'restaurer', chantier })}
                    >
                      Restaurer
                    </Button>
                  )}
                </div>

                <div className="entity-card-footer">
                  {statut === 'actif' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Camera size={16} />}
                      onClick={() => navigate('/suivi-chantier')}
                    >
                      Suivi photo
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={16} />}
                    onClick={() => setConfirmState({ type: 'supprimer', chantier })}
                  >
                    Supprimer
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {confirmState && (
        <Modal open title={CONFIRM_CONTENT[confirmState.type].title} onClose={closeConfirm}>
          <div className="modal-form">
            <p className="entity-card-meta">{CONFIRM_CONTENT[confirmState.type].message(confirmState.chantier.nom)}</p>
            {actionError && <p className="field-error">{actionError}</p>}
            <div className="page-header-actions">
              <Button type="button" variant="secondary" onClick={closeConfirm} disabled={actionLoading}>
                Annuler
              </Button>
              <Button
                type="button"
                variant={CONFIRM_CONTENT[confirmState.type].danger ? 'danger' : 'primary'}
                onClick={handleConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Traitement…' : CONFIRM_CONTENT[confirmState.type].confirmLabel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
