import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'alt'
}

export function Card({ variant = 'default', className, children, ...rest }: CardProps) {
  const classes = ['card', variant === 'alt' ? 'card-alt' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
