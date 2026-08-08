import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Brand } from '../components/ui/Brand'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function LoginPage() {
  const { user, role, loading, error, signIn, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (loading || !user) return

    if (role === 'admin') {
      navigate('/dashboard', { replace: true })
    } else if (role === 'employe') {
      navigate('/employe', { replace: true })
    }
  }, [loading, user, role, navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      setSubmitting(false)
      setErrorMsg('Email ou mot de passe incorrect.')
    }
    // Succès : on reste affiché en "connexion…", la redirection est gérée
    // par l'effet ci-dessus dès que loading/role sont prêts.
  }

  if (loading) {
    return (
      <div className="page">
        <p>Chargement…</p>
      </div>
    )
  }

  // Connecté mais aucun profil correspondant n'a pu être chargé (RLS, ligne
  // manquante, timeout réseau...) : jamais de spinner muet indéfini.
  if (user && !role) {
    return (
      <div className="page">
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Profil introuvable"
            description={error ?? 'Votre compte est authentifié mais aucun profil correspondant n’a pu être chargé.'}
            action={
              <div className="page-header-actions">
                <Button variant="secondary" onClick={() => refreshProfile()}>
                  Réessayer
                </Button>
                <Button variant="ghost" onClick={() => void signOut()}>
                  Se déconnecter
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    )
  }

  if (user && role) {
    return (
      <div className="page">
        <p>Redirection…</p>
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
            <h1 className="login-title">Connexion</h1>
            <p className="login-lead">Connectez-vous avec vos identifiants pour continuer.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <Input
              label="Email"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@entreprise.fr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <Input
              label="Mot de passe"
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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

            <div className="login-options">
              <label className="field-checkbox" htmlFor="stay-signed-in">
                <input
                  id="stay-signed-in"
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(event) => setStaySignedIn(event.target.checked)}
                />
                Rester connecté
              </label>
            </div>

            {errorMsg && (
              <p className="field-error" role="alert">
                {errorMsg}
              </p>
            )}

            <Button type="submit" block disabled={submitting}>
              {submitting ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
