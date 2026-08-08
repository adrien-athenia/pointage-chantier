import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import type { UserRole } from '../types/database'
import { useAuth } from '../hooks/useAuth'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: UserRole[]
}

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/dashboard',
  employe: '/employe',
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading, error, signOut } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <p>Chargement…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Connecté mais le profil n'a pas pu être résolu : on l'explique plutôt
  // que de rediriger silencieusement vers /login.
  if (!role) {
    return (
      <div className="page">
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Profil introuvable"
            description={error ?? 'Votre compte est authentifié mais aucun profil correspondant n’a pu être chargé.'}
            action={
              <Button variant="secondary" onClick={() => void signOut()}>
                Se déconnecter
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role]} replace />
  }

  return <>{children}</>
}
