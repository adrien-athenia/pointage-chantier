import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Users } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { listAllProfiles } from '../services/employeService'
import { getInitials } from '../lib/formatters'
import type { Profile } from '../types/database'

export function EmployesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    listAllProfiles().then((res) => {
      if (!isMounted) return
      setProfiles(res.data)
      setError(res.error)
      setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div>
      <PageHeader
        title="Employés"
        subtitle={`${profiles.length} employé${profiles.length > 1 ? 's' : ''}`}
        actions={
          <Button icon={<Plus size={18} />} disabled title="Fonctionnalité à venir">
            Nouvel employé
          </Button>
        }
      />

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
          <EmptyState icon={Users} title="Aucun employé" description="Les comptes créés apparaîtront ici." />
        </Card>
      ) : (
        <div className="entity-grid">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <div className="entity-person">
                <span className="avatar">{getInitials(profile.full_name, profile.email)}</span>
                <div>
                  <p className="entity-card-title">{profile.full_name || 'Sans nom'}</p>
                  <p className="entity-card-meta">{profile.email}</p>
                </div>
              </div>
              <div className="entity-card-footer">
                <Badge variant={profile.role === 'admin' ? 'info' : 'neutral'}>
                  {profile.role === 'admin' ? 'Administrateur' : 'Employé'}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
