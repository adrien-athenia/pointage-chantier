import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { uploadChantierPhoto, validatePhotoFile, type ChantierPhotoWithAuthor } from '../services/chantierPhotoService'

interface ChantierPhotoModalProps {
  open: boolean
  chantierId: string
  onClose: () => void
  onUploaded: (photo: ChantierPhotoWithAuthor) => void
}

export function ChantierPhotoModal({ open, chantierId, onClose, onUploaded }: ChantierPhotoModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingLockRef = useRef(false)

  // Révoque l'URL d'aperçu précédente à chaque changement de fichier et au
  // démontage — sinon chaque sélection fuit un object URL.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function resetState() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setCommentaire('')
    setFileError(null)
    setSubmitError(null)
  }

  function handleClose() {
    if (submitting) return
    resetState()
    onClose()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    setSubmitError(null)

    if (previewUrl) URL.revokeObjectURL(previewUrl)

    if (!selected) {
      setFile(null)
      setPreviewUrl(null)
      setFileError(null)
      return
    }

    const validationError = validatePhotoFile(selected)
    if (validationError) {
      setFile(null)
      setPreviewUrl(null)
      setFileError(validationError)
      // Permet de resélectionner le même fichier après correction sans que
      // le navigateur ignore un second choix identique.
      event.target.value = ''
      return
    }

    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setFileError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submittingLockRef.current || !file) return
    submittingLockRef.current = true

    setSubmitting(true)
    setSubmitError(null)

    const { photo, error } = await uploadChantierPhoto({ chantierId, file, commentaire })

    submittingLockRef.current = false
    setSubmitting(false)

    if (error || !photo) {
      setSubmitError(error ?? 'Impossible d’ajouter la photo. Réessayez.')
      return
    }

    onUploaded(photo)
    resetState()
  }

  return (
    <Modal open={open} title="Ajouter une photo" onClose={handleClose}>
      <form className="modal-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={submitting}
        />

        {fileError && <p className="field-error">{fileError}</p>}

        {previewUrl && (
          <img src={previewUrl} alt="Aperçu de la photo sélectionnée" className="chantier-photo-preview" />
        )}

        <Input
          label="Commentaire (facultatif)"
          placeholder="Décrivez brièvement l’avancement des travaux…"
          value={commentaire}
          onChange={(event) => setCommentaire(event.target.value)}
          disabled={submitting}
        />

        {submitError && <p className="field-error">{submitError}</p>}

        <div className="page-header-actions">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting || !file}>
            {submitting ? 'Ajout en cours…' : 'Ajouter au suivi'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
