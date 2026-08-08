export interface GeoResult {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  error: string | null
}

/**
 * Demande la position UNE SEULE FOIS (getCurrentPosition, jamais
 * watchPosition), uniquement appelée au moment d'une action de pointage
 * volontaire. Ne rejette jamais : si la géolocalisation échoue ou est
 * refusée, résout avec des valeurs null plutôt que de bloquer le
 * pointage ou d'inventer une position.
 */
export function getCurrentPositionSafe(timeoutMs = 8000): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ latitude: null, longitude: null, accuracy: null, error: 'Géolocalisation non disponible sur cet appareil.' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
        })
      },
      (err) => {
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
          error: err.message || 'Localisation indisponible.',
        })
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}
