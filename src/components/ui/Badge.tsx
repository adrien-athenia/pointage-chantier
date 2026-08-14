import type { HTMLAttributes } from 'react'

export type BadgeVariant = 'success' | 'danger' | 'neutral' | 'info' | 'warning'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  const classes = ['badge', `badge-${variant}`, className].filter(Boolean).join(' ')

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}
