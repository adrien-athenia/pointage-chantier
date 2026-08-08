import { HardHat } from 'lucide-react'

interface BrandProps {
  size?: 'sm' | 'md' | 'lg'
  tagline?: string
}

const ICON_SIZE: Record<NonNullable<BrandProps['size']>, number> = {
  sm: 16,
  md: 20,
  lg: 28,
}

export function Brand({ size = 'md', tagline }: BrandProps) {
  return (
    <div className={`brand brand-${size}`}>
      <span className="brand-icon">
        <HardHat size={ICON_SIZE[size]} />
      </span>
      <span className="brand-name">PointageChantier</span>
      {tagline && <p className="login-tagline">{tagline}</p>}
    </div>
  )
}
