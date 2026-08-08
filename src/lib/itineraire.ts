import type { Chantier } from '../types/database'

/**
 * Construit un lien d'itinéraire universel (ouvre l'appli de
 * cartographie du téléphone sur mobile, Google Maps dans un nouvel
 * onglet sur desktop). Priorité aux coordonnées, repli sur adresse/ville.
 * N'a besoin d'aucune permission de géolocalisation.
 */
export function buildItineraireUrl(chantier: Pick<Chantier, 'latitude' | 'longitude' | 'adresse' | 'ville'>): string | null {
  const destination =
    chantier.latitude != null && chantier.longitude != null
      ? `${chantier.latitude},${chantier.longitude}`
      : [chantier.adresse, chantier.ville].filter(Boolean).join(', ')

  if (!destination) return null

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/** Ouvre une coordonnée ponctuelle sur une carte ("Voir la position"). */
export function buildPositionUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
