import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Clock, HardHat, Users, Camera, Download, Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Brand } from '../components/ui/Brand'
import { SidebarNavItem } from '../components/ui/SidebarNavItem'
import { getInitials } from '../lib/formatters'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pointages', label: 'Pointages', icon: Clock },
  { to: '/chantiers', label: 'Chantiers', icon: HardHat },
  { to: '/employes', label: 'Employés', icon: Users },
  { to: '/suivi-chantier', label: 'Suivi chantier', icon: Camera },
  { to: '/exports', label: 'Exports', icon: Download },
]

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, signOut } = useAuth()
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const displayName = profile?.full_name || user?.email || 'Administrateur'

  return (
    <div className="admin-shell">
      <header className="mobile-header">
        <button
          type="button"
          className="icon-button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>
        <Brand size="sm" />
      </header>

      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <Brand size="md" />
          <p className="sidebar-subtitle">Administration</p>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          <p className="sidebar-section-label">Navigation</p>
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{getInitials(profile?.full_name, user?.email)}</span>
            <div>
              <p className="sidebar-user-name">{displayName}</p>
              <p className="sidebar-user-role">Administrateur</p>
            </div>
          </div>
          <button type="button" className="sidebar-signout" onClick={() => void signOut()}>
            <LogOut size={16} />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}
