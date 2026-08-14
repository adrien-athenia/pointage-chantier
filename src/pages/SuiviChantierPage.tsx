import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, ImagePlus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { ChantierPhotoModal } from '../components/ChantierPhotoModal'
import { useAuth } from '../hooks/useAuth'
import { listChantiers } from '../services/chantierService'
import {
  listChantierPhotos,
  getSignedPhotoUrls,
  deleteChantierPhoto,
  type ChantierPhotoWithAuthor,
} from '../services/chantierPhotoService'
import { formatDateTimeLong } from '../lib/formatters'
import type { Chantier } from '../types/database'

const PHOTOS_LOAD_ERROR = 'Impossible de charger le suivi du chantier. Réessayez.'
const DELETE_ERROR = 'Impossible de supprimer la photo. Réessayez.'

export function SuiviChantierPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [photos, setPhotos] = useState<ChantierPhotoWithAuthor[]>([])
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map())
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState<ChantierPhotoWithAuthor | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deletingLockRef = useRef(false)

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

  useEffect(() => {
    if (!chantierId) {
      setPhotos([])
      setSignedUrls(new Map())
      return
    }

    let isMounted = true
    setPhotosLoading(true)
    setPhotosError(null)

    listChantierPhotos(chantierId).then(async (res) => {
      if (!isMounted) return

      if (res.error) {
        console.error('[SuiviChantierPage] erreur Supabase lors du chargement du journal photo :', res.error)
        setPhotos([])
        setSignedUrls(new Map())
        setPhotosError(PHOTOS_LOAD_ERROR)
        setPhotosLoading(false)
        return
      }

      const urls = await getSignedPhotoUrls(res.data.map((photo) => photo.storage_path))
      if (!isMounted) return

      setPhotos(res.data)
      setSignedUrls(urls)
      setPhotosLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [chantierId])

  async function handleUploaded(photo: ChantierPhotoWithAuthor) {
    setModalOpen(false)
    // Affichage immédiat sans recharger tout le journal : la ligne créée
    // vient directement de la réponse Supabase (donnée réelle, pas
    // optimiste), il ne manque que son URL signée.
    setPhotos((current) => [photo, ...current])
    const urls = await getSignedPhotoUrls([photo.storage_path])
    setSignedUrls((current) => new Map([...current, ...urls]))
  }

  function closeConfirmDelete() {
    if (deleting) return
    setConfirmDeletePhoto(null)
    setDeleteError(null)
  }

  async function handleConfirmDelete() {
    if (!confirmDeletePhoto || deletingLockRef.current) return
    deletingLockRef.current = true

    setDeleting(true)
    setDeleteError(null)

    const { success, error: deleteErr } = await deleteChantierPhoto({
      id: confirmDeletePhoto.id,
      storagePath: confirmDeletePhoto.storage_path,
    })

    deletingLockRef.current = false
    setDeleting(false)

    if (!success) {
      setDeleteError(deleteErr ?? DELETE_ERROR)
      return
    }

    // Retrait immédiat du journal, sans recharger toute la liste — si
    // c'était la dernière photo, l'état vide réapparaît automatiquement
    // (déjà dérivé de photos.length === 0 plus bas).
    setPhotos((current) => current.filter((p) => p.id !== confirmDeletePhoto.id))
    setConfirmDeletePhoto(null)
  }

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

        <Button icon={<ImagePlus size={18} />} onClick={() => setModalOpen(true)} disabled={!chantierId}>
          Ajouter une photo
        </Button>
      </div>

      {photosError && (
        <p className="error-banner">
          <AlertTriangle size={16} />
          {photosError}
        </p>
      )}

      {photosLoading ? (
        <div className="loading-block">Chargement…</div>
      ) : photos.length === 0 && !photosError ? (
        <Card>
          <EmptyState
            icon={Camera}
            title="Aucune photo pour ce chantier"
            description="Les photos ajoutées par les équipes s'afficheront ici avec la date, l'auteur et un commentaire."
          />
        </Card>
      ) : (
        <div className="entity-grid">
          {photos.map((photo) => {
            const url = signedUrls.get(photo.storage_path)
            return (
              <Card key={photo.id}>
                <p className="entity-card-title">{photo.profiles?.full_name || photo.profiles?.email || 'Employé'}</p>
                <p className="entity-card-meta">{formatDateTimeLong(photo.created_at)}</p>

                {url ? (
                  <img src={url} alt="Photo du chantier" className="chantier-photo-img" />
                ) : (
                  <div className="chantier-photo-img chantier-photo-img-placeholder" />
                )}

                {photo.commentaire && <p className="entity-card-meta">{photo.commentaire}</p>}

                {isAdmin && (
                  <div className="entity-card-footer">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => setConfirmDeletePhoto(photo)}
                    >
                      Supprimer
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {chantierId && (
        <ChantierPhotoModal
          open={modalOpen}
          chantierId={chantierId}
          onClose={() => setModalOpen(false)}
          onUploaded={handleUploaded}
        />
      )}

      {confirmDeletePhoto && (
        <Modal open title="Supprimer cette photo ?" onClose={closeConfirmDelete}>
          <div className="modal-form">
            <p className="entity-card-meta">Cette action est définitive.</p>

            {deleteError && <p className="field-error">{deleteError}</p>}

            <div className="page-header-actions">
              <Button type="button" variant="secondary" onClick={closeConfirmDelete} disabled={deleting}>
                Annuler
              </Button>
              <Button type="button" variant="danger" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
