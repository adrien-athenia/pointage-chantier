import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Brand } from '../components/ui/Brand'

export function EmployeeLayout() {
  const { signOut } = useAuth()

  return (
    <div className="employee-shell">
      <header className="employee-header">
        <Brand size="sm" />
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
