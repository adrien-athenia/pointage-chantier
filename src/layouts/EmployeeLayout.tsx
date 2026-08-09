import { Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Brand } from '../components/ui/Brand'

export function EmployeeLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  function handleBack() {
    // Jamais de navigate(-1) aveugle : l'employé peut arriver directement
    // sur /employe (connexion, ouverture PWA, lien direct), auquel cas
    // il n'existe aucune page précédente pertinente dans l'historique.
    // window.history.state.idx est posé par React Router à chaque
    // navigation "push" interne (jamais lors d'un "replace", comme ceux
    // utilisés par le login et les redirections de ProtectedRoute) : il
    // ne dépasse 0 que s'il existe vraiment une entrée précédente issue
    // de la navigation dans l'app. Sinon, on reste sur /employe — jamais
    // vers /login ni une route admin.
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate('/employe', { replace: true })
    }
  }

  return (
    <div className="employee-shell">
      <header className="employee-header">
        <div className="employee-header-start">
          <button type="button" className="icon-button" onClick={handleBack} aria-label="Retour">
            <ArrowLeft size={18} />
          </button>
          <Brand size="sm" />
        </div>
        <button type="button" className="icon-button" onClick={() => void signOut()} aria-label="Déconnexion">
          <LogOut size={18} />
        </button>
      </header>
      <main className="employee-content">
        <Outlet />
      </main>
    </div>
  )
}
