import type { ComponentType } from 'react'
import { Card } from './Card'

interface StatCardProps {
  label: string
  value: string
  icon: ComponentType<{ size?: number }>
}

export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-icon">
          <Icon size={18} />
        </span>
      </div>
      <span className="stat-card-value">{value}</span>
    </Card>
  )
}
