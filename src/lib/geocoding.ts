export interface GeocodeResult {
  latitude: number
  longitude: number
}

export type GeocodeErrorCode = 'not_found' | 'network_error'

export interface GeocodeOutcome {
  result: GeocodeResult | null
  errorCode: GeocodeErrorCode | null
  /** Message court, déjà traduit, prêt à afficher au patron. */
  error: string | null
}

/** Adresse complète à envoyer au service de géocodage. */
export function buildFullAddress(adresse: string, ville: string): string {
  return [adresse.trim(), ville.trim(), 'France'].filter(Boolean).join(', ')
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

const ERROR_MESSAGES: Record<GeocodeErrorCode, string> = {
  not_found: 'Adresse introuvable. Vérifiez l’adresse et réessayez.',
  network_error: 'Impossible de localiser cette adresse pour le moment. Réessayez.',
}

interface NominatimRawResult {
  lat?: unknown
  lon?: unknown
}

/**
 * Géocodage adresse → coordonnées GPS via Nominatim (OpenStreetMap),
 * l'API de recherche publique — pas de clé requise. N'est appelée que
 * depuis un clic explicite sur "Localiser/Recalculer à partir de
 * l'adresse" dans ChantierForm (jamais au fil de la frappe, jamais en
 * boucle ou en polling) : ce point d'entrée unique, déclenché
 * volontairement, est ce qui rend cet usage léger et conforme à la
 * politique d'utilisation de Nominatim.
 *
 * Politique Nominatim : impose d'identifier l'application via un
 * en-tête User-Agent ou Referer. Un fetch() depuis le navigateur ne peut
 * PAS fixer lui-même ces deux en-têtes (forbidden header names de la
 * Fetch spec) — on s'appuie donc sur le Referer envoyé automatiquement
 * par le navigateur, que la politique Nominatim accepte explicitement
 * comme alternative au User-Agent.
 *
 * LIMITES POUR LA PRODUCTION (voir aussi le compte-rendu de la tâche) :
 * l'instance publique nominatim.openstreetmap.org est prévue pour un
 * usage léger/occasionnel (~1 req/s max, pas d'usage commercial à
 * volume, pas de garantie de disponibilité). Convient à cette V1/démo
 * (géocodage volontaire, un clic = un chantier = une requête). Pour la
 * production, prévoir soit une instance Nominatim auto-hébergée, soit un
 * petit proxy serveur (ex. Supabase Edge Function) qui ajoute un
 * User-Agent identifiant réellement l'application et peut mettre en
 * cache/limiter les appels, soit un fournisseur de géocodage payant.
 */
export async function geocodeAddress(adresse: string, ville: string): Promise<GeocodeOutcome> {
  const query = buildFullAddress(adresse, ville)
  const url = `${NOMINATIM_SEARCH_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    console.error('[geocoding] échec réseau lors de l’appel à Nominatim :', err)
    return { result: null, errorCode: 'network_error', error: ERROR_MESSAGES.network_error }
  }

  if (!response.ok) {
    console.error('[geocoding] réponse Nominatim non OK :', response.status, response.statusText)
    return { result: null, errorCode: 'network_error', error: ERROR_MESSAGES.network_error }
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    console.error('[geocoding] réponse Nominatim illisible :', err)
    return { result: null, errorCode: 'network_error', error: ERROR_MESSAGES.network_error }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { result: null, errorCode: 'not_found', error: ERROR_MESSAGES.not_found }
  }

  const first = data[0] as NominatimRawResult
  const latitude = Number(first.lat)
  const longitude = Number(first.lon)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error('[geocoding] coordonnées Nominatim invalides :', first)
    return { result: null, errorCode: 'not_found', error: ERROR_MESSAGES.not_found }
  }

  return { result: { latitude, longitude }, errorCode: null, error: null }
}
