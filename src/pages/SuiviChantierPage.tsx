import { useEffect, useState } from 'react'
import { AlertTriangle, Camera, ImagePlus } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { listChantiers } from '../services/chantierService'
import type { Chantier } from '../types/database'

export function SuiviChantierPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    listChantiers().then((res) => {
      if (!isMounted) return
      setChantiers(res.data)
      setError(res.error)
      if (res.data.length > 0) {
        setChantierId(res.data[0].id)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div>
      <PageHeader title="Suivi chantier" subtitle="Suivi photographique de l'avancement des chantiers" />

      {error && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}

      <div className="photo-toolbar">
        <Select label="Chantier" value={chantierId} onChange={(event) => setChantierId(event.target.value)}>
          {chantiers.length === 0 && <option value="">Aucun chantier</option>}
          {chantiers.map((chantier) => (
            <option key={chantier.id} value={chantier.id}>
              {chantier.nom}
            </option>
          ))}
        </Select>

        <Button icon={<ImagePlus size={18} />} disabled title="L'upload sera branché à Supabase Storage prochainement">
          Ajouter une photo
        </Button>
      </div>

      <Card>
        <EmptyState
          icon={Camera}
          title="Aucune photo pour ce chantier"
          description="Les photos ajoutées par les équipes s'afficheront ici avec la date, l'auteur et un commentaire."
        />
      </Card>
    </div>
  )
}
