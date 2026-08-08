import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'

interface SidebarNavItemProps {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

export function SidebarNavItem({ to, label, icon: Icon }: SidebarNavItemProps) {
  return (
    <NavLink to={to} className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}>
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  )
}
