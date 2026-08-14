export function getInitials(name: string | null | undefined, fallback: string | null | undefined): string {
  const source = name?.trim() || fallback?.trim() || ''
  if (!source) return '?'

  const parts = source.split(/[\s.@]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '')
  const initials = letters.join('')

  return initials || source[0]?.toUpperCase() || '?'
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes)
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining === 0 ? `${hours}h` : `${hours}h${String(remaining).padStart(2, '0')}`
}

/**
 * Variante "lecture rapide" de formatMinutes, pour les colonnes/cartes où
 * une durée courte en heures pleines (ex. "0h42") est moins lisible qu'un
 * format dédié aux minutes seules. N'affecte que ses propres appelants —
 * formatMinutes reste inchangée pour le reste de l'app.
 */
export function formatDurationHuman(totalMinutes: number): string {
  if (totalMinutes < 1) return '< 1 min'

  const minutes = Math.round(totalMinutes)
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  if (hours === 0) return `${remaining} min`
  return remaining === 0 ? `${hours}h` : `${hours}h${String(remaining).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`
}

export function isSameDay(iso: string, reference: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

/** "14 août 2026 · 10:32" — utilisé par le journal photo de Suivi chantier. */
export function formatDateTimeLong(iso: string): string {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const timePart = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${datePart} · ${timePart}`
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Minuit, heure locale du navigateur, le jour de `date`. */
export function startOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/** Lundi 00:00, heure locale, de la semaine contenant `date`. */
export function startOfLocalWeek(date: Date): Date {
  const result = startOfLocalDay(date)
  const day = result.getDay() // 0 = dimanche, 1 = lundi, ...
  const diffToMonday = (day + 6) % 7
  result.setDate(result.getDate() - diffToMonday)
  return result
}

/** 1er jour du mois, 00:00, heure locale, de `date`. */
export function startOfLocalMonth(date: Date): Date {
  const result = startOfLocalDay(date)
  result.setDate(1)
  return result
}
