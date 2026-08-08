import { useState, type FormEvent } from 'react'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { inviteEmploye } from '../services/adminEmployeService'

interface EmployeInviteModalProps {
  open: boolean
  onClose: () => void
  onInvited: (email: string) => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmployeInviteModal({ open, onClose, onInvited }: EmployeInviteModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetAndClose() {
    if (submitting) return
    setFullName('')
    setEmail('')
    setError(null)
    onClose()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    const trimmedName = fullName.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) {
      setError('Le nom complet est obligatoire.')
      return
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Adresse email invalide.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { data, error: inviteError } = await inviteEmploye({ fullName: trimmedName, email: trimmedEmail })

    setSubmitting(false)

    if (inviteError) {
      setError(inviteError)
      return
    }

    setFullName('')
    setEmail('')
    onInvited(data?.email ?? trimmedEmail)
  }

  return (
    <Modal open={open} title="Nouvel employé" onClose={resetAndClose}>
      <form className="modal-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Nom complet"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          disabled={submitting}
          autoFocus
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          required
        />

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="page-header-actions">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Création…' : "Créer l'employé"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
