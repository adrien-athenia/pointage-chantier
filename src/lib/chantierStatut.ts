import type { Chantier, ChantierStatut } from '../types/database'

/**
 * Filet de sécurité temporaire : la colonne chantiers.statut (ajoutée par
 * supabase/migrations/007_chantier_lifecycle.sql) n'est pas encore
 * appliquée sur l'environnement Supabase local actuellement utilisé —
 * chantier.statut y vaut donc `undefined` à l'exécution, même si le type
 * Chantier le déclare non-nullable (select('*') ne fait jamais échouer la
 * requête pour une colonne manquante, contrairement à un embed qui la
 * nomme explicitement).
 *
 * Tant que la migration n'est pas appliquée, un chantier sans statut est
 * considéré 'actif' (comportement historique d'avant la migration, où
 * tout chantier existant était de facto actif — aucun autre cycle de vie
 * n'existait). Une fois la migration appliquée partout, chantier.statut
 * sera toujours défini et cette fonction pourra être supprimée au profit
 * d'un accès direct à `chantier.statut`.
 */
export function resolveChantierStatut(chantier: Chantier): ChantierStatut {
  return chantier.statut ?? 'actif'
}
