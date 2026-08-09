export type GeoErrorCode = 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported'

export interface GeoResult {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  errorCode: GeoErrorCode | null
  /** Message court, déjà traduit, prêt à afficher à l'employé. */
  error: string | null
}

// Résout dès qu'une position à cette précision (ou meilleure) est captée,
// sans attendre le reste de la fenêtre — évite de faire patienter un
// employé en extérieur avec un bon signal.
const GOOD_ENOUGH_ACCURACY_M = 25

// Fenêtre totale pendant laquelle on accepte d'écouter plusieurs relevés
// successifs (watchPosition) au lieu de se contenter du tout premier :
// sur mobile, ce premier relevé est très souvent une position réseau/
// Wi-Fi grossière (parfois >1000 m) renvoyée quasi instantanément, avant
// que la puce GPS n'ait eu le temps de s'affiner.
const MAX_WATCH_MS = 10000

const ERROR_MESSAGES: Record<GeoErrorCode, string> = {
  permission_denied: 'Autorisez la localisation pour pouvoir pointer.',
  position_unavailable: 'Position GPS introuvable. Vérifiez que la localisation est activée.',
  timeout: 'Impossible d’obtenir une position à temps. Réessayez, si possible à l’extérieur.',
  unsupported: 'Cet appareil ne prend pas en charge la géolocalisation.',
}

function mapErrorCode(code: number): GeoErrorCode {
  if (code === GeolocationPositionError.PERMISSION_DENIED) return 'permission_denied'
  if (code === GeolocationPositionError.POSITION_UNAVAILABLE) return 'position_unavailable'
  if (code === GeolocationPositionError.TIMEOUT) return 'timeout'
  return 'position_unavailable'
}

/**
 * Demande la position au moment d'une action de pointage volontaire —
 * jamais de suivi permanent, jamais appelée en dehors d'un clic sur un
 * bouton de pointage.
 *
 * Contrairement à un simple appel unique à getCurrentPosition() — qui
 * renvoie souvent la position la plus rapide disponible plutôt que
 * d'attendre que la puce GPS s'affine — cette fonction écoute plusieurs
 * relevés successifs via watchPosition pendant une fenêtre bornée,
 * conserve le relevé le plus précis obtenu, et s'arrête dès qu'une
 * précision jugée suffisante est atteinte.
 *
 * watchPosition est TOUJOURS arrêté (clearWatch) avant résolution de la
 * promesse, quelle que soit l'issue (succès, erreur ou expiration du
 * délai) : aucune écoute ne reste active après le pointage.
 *
 * Ne rejette jamais : en cas d'échec total, résout avec des valeurs null
 * et un code d'erreur explicite plutôt que de bloquer le pointage ou
 * d'inventer une position.
 */
export function getCurrentPositionSafe(maxWaitMs = MAX_WATCH_MS): Promise<GeoResult> {
  return new Promise((resolve) => {
    const startedAt = performance.now()

    function withDiagnostics(result: GeoResult): GeoResult {
      if (import.meta.env.DEV) {
        console.debug('[geolocation] position', {
          latitude: result.latitude,
          longitude: result.longitude,
          accuracy: result.accuracy,
          errorCode: result.errorCode,
          elapsedMs: Math.round(performance.now() - startedAt),
        })
      }
      return result
    }

    if (!('geolocation' in navigator)) {
      resolve(
        withDiagnostics({
          latitude: null,
          longitude: null,
          accuracy: null,
          errorCode: 'unsupported',
          error: ERROR_MESSAGES.unsupported,
        }),
      )
      return
    }

    let best: GeolocationPosition | null = null
    let settled = false
    let watchId: number | null = null

    function cleanup() {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
        watchId = null
      }
      clearTimeout(timer)
    }

    function finish(result: GeoResult) {
      if (settled) return
      settled = true
      cleanup()
      resolve(withDiagnostics(result))
    }

    function finishWithBest() {
      if (best) {
        finish({
          latitude: best.coords.latitude,
          longitude: best.coords.longitude,
          accuracy: best.coords.accuracy,
          errorCode: null,
          error: null,
        })
      } else {
        finish({
          latitude: null,
          longitude: null,
          accuracy: null,
          errorCode: 'timeout',
          error: ERROR_MESSAGES.timeout,
        })
      }
    }

    const timer = setTimeout(finishWithBest, maxWaitMs)

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) {
          best = position
        }
        if (position.coords.accuracy <= GOOD_ENOUGH_ACCURACY_M) {
          finishWithBest()
        }
      },
      (err) => {
        // Une position déjà captée (même imprécise) vaut mieux qu'une
        // erreur : on la garde plutôt que de faire échouer l'acquisition.
        if (best) {
          finishWithBest()
          return
        }
        const code = mapErrorCode(err.code)
        finish({ latitude: null, longitude: null, accuracy: null, errorCode: code, error: ERROR_MESSAGES[code] })
      },
      // Pas de `timeout` ici : le délai global est géré par notre propre
      // minuteur (comportement de watchPosition moins uniforme selon les
      // navigateurs sur ce point que sur getCurrentPosition).
      { enableHighAccuracy: true, maximumAge: 0 },
    )
  })
}
