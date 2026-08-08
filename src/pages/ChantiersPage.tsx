import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Camera, HardHat, MapPin, Pencil, Plus } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ChantierForm } from '../components/ChantierForm'
import { listChantiers } from '../services/chantierService'
import { listEmployeeProfiles } from '../services/employeService'
import type { Chantier, Profile } from '../types/database'

export function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [employes, setEmployes] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingChantier, setEditingChantier] = useState<Chantier | null>(null)
  const navigate = useNavigate()

  function loadChantiers() {
    setLoading(true)
    listChantiers().then((res) => {
      setChantiers(res.data)
      setError(res.error)
      setLoading(false)
    })
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([listChantiers(), listEmployeeProfiles()]).then(([chantiersRes, employesRes]) => {
      if (!isMounted) return
      setChantiers(chantiersRes.data)
      setEmployes(employesRes.data)
      setError(chantiersRes.error ?? employesRes.error)
      setLoading(false)
    })

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
      ) : chantiers.length === 0 ? (
        <Card>
          <EmptyState
            icon={HardHat}
            title="Aucun chantier"
            description="Les chantiers créés apparaîtront ici."
          />
        </Card>
      ) : (
        <div className="entity-grid">
          {chantiers.map((chantier) => (
            <Card key={chantier.id}>
              <div className="entity-card-top">
                <div>
                  <p className="entity-card-title">{chantier.nom}</p>
                  {chantier.ville && (
                    <p className="entity-card-meta meta-inline">
                      <MapPin size={13} />
                      {chantier.ville}
                    </p>
                  )}
                </div>
                <Badge variant={chantier.actif ? 'success' : 'neutral'}>
                  {chantier.actif ? 'Actif' : 'Inactif'}
                </Badge>
              </div>

              <p className="entity-card-meta">
                Rayon autorisé : {chantier.rayon_autorise} m
                {chantier.duree_max_intervention_minutes != null &&
                  ` · Durée max. : ${Math.round(chantier.duree_max_intervention_minutes / 60)} h`}
              </p>

              <div className="entity-card-footer">
                <Button variant="ghost" size="sm" icon={<Pencil size={16} />} onClick={() => openEditForm(chantier)}>
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Camera size={16} />}
                  onClick={() => navigate('/suivi-chantier')}
                >
                  Suivi photo
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
