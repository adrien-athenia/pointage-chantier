import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Brand } from '../components/ui/Brand'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const REDIRECT_DELAY_MS = 1800

export function SetPasswordPage() {
  // Aucun second client Supabase : useAuth() consomme le même client
  // (src/lib/supabase.ts), qui a déjà restauré la session envoyée dans
  // l'URL du lien d'invitation (detectSessionInUrl, comportement par
  // défaut de supabase-js) au démarrage de l'application.
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!success) return
    // Redirection automatique sans déconnexion : updateUser() ne modifie
    // pas la session en cours, l'utilisateur reste authentifié.
    const timer = setTimeout(() => {
      navigate('/employe', { replace: true })
    }, REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [success, navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    setErrorMsg(null)

    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Les deux mots de passe ne correspondent pas.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setErrorMsg(error.message || 'Impossible de définir le mot de passe. Réessayez.')
      return
    }

    setSuccess(true)
  }

  if (loading) {
    return (
      <div className="page">
        <p>Chargement…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <Brand size="lg" tagline="Gestion des heures terrain" />
          </div>

          <Card>
            <div className="login-heading">
              <h1 className="login-title">Lien d'invitation invalide ou expiré.</h1>
              <p className="login-lead">Demandez à votre administrateur de vous envoyer une nouvelle invitation.</p>
            </div>
            <Link to="/login">
              <Button block>Retour à la connexion</Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <Brand size="lg" tagline="Gestion des heures terrain" />
        </div>

        <Card>
          <div className="login-heading">
            <h1 className="login-title">Définir votre mot de passe</h1>
            <p className="login-lead">Choisissez un mot de passe pour accéder à votre espace employé.</p>
          </div>

          {success ? (
            <p className="entity-card-meta meta-inline">
              <CheckCircle2 size={16} />
              Mot de passe défini. Redirection vers votre espace…
            </p>
          ) : (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <Input
                label="Nouveau mot de passe"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="8 caractères minimum"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
                rightSlot={
                  <button
                    type="button"
                    className="field-icon-button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              <Input
                label="Confirmer le mot de passe"
                id="confirm-password"
                name="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Ressaisissez le mot de passe"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
                required
                rightSlot={
                  <button
                    type="button"
                    className="field-icon-button"
                    onClick={() => setShowConfirm((value) => !value)}
                    aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showConfirm}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {errorMsg && (
                <p className="field-error" role="alert">
                  {errorMsg}
                </p>
              )}

              <Button type="submit" block disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Définir le mot de passe'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
