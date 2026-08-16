import { supabase } from '../lib/supabase'
import type { ChantierStatut, Pointage, PointageType } from '../types/database'
import type { ServiceResult } from './chantierService'

export interface PointageWithRelations extends Pointage {
  profiles: { full_name: string | null; email: string | null } | null
  // Embed élargi (au-delà du seul nom) : permet d'afficher ville/adresse
  // et de construire un lien d'itinéraire pour le chantier d'une
  // intervention même une fois celui-ci terminé/archivé (l'employé garde
  // le droit de lire ce chantier précis via la policy chantiers_select,
  // qui autorise la lecture de tout chantier référencé par un de ses
  // propres pointages, quel que soit son statut courant).
  chantiers: {
    nom: string
    ville: string | null
    adresse: string | null
    latitude: number | null
    longitude: number | null
    statut: ChantierStatut
  } | null
}

export interface PointageFilters {
  employeId?: string
  chantierId?: string
  date?: string // format yyyy-mm-dd
}

const RELATIONS_SELECT =
  'id, employe_id, chantier_id, type, pointe_at, created_at, latitude, longitude, gps_accuracy, distance_chantier_m, profiles(full_name, email), chantiers(nom, ville, adresse, latitude, longitude, statut)'

// Variante utilisée uniquement par listPointagesWithRelations (page
// Pointages admin), qui ne lit jamais chantiers.statut : cette colonne,
// ajoutée par la migration 007_chantier_lifecycle.sql, n'existe pas
// encore sur cette base locale (migration écrite mais pas encore
// appliquée), ce qui fait échouer l'embed avec "column chantiers_1.statut
// does not exist". RELATIONS_SELECT ci-dessus reste inchangée pour
// listOwnPointages (espace employé, qui lit bien ce champ pour "Chantiers
// terminés") afin de ne rien modifier sur cette page-là. Les deux
// constantes pourront refusionner une fois la migration appliquée.
const RELATIONS_SELECT_ADMIN =
  'id, employe_id, chantier_id, type, pointe_at, created_at, latitude, longitude, gps_accuracy, distance_chantier_m, profiles(full_name, email), chantiers(nom, ville, adresse, latitude, longitude)'

export async function listPointagesWithRelations(
  filters: PointageFilters = {},
): Promise<ServiceResult<PointageWithRelations[]>> {
  let query = supabase.from('pointages').select(RELATIONS_SELECT_ADMIN).order('pointe_at', { ascending: false })

  if (filters.employeId) {
    query = query.eq('employe_id', filters.employeId)
  }
  if (filters.chantierId) {
    query = query.eq('chantier_id', filters.chantierId)
  }
  if (filters.date) {
    query = query.gte('pointe_at', `${filters.date}T00:00:00`).lte('pointe_at', `${filters.date}T23:59:59.999`)
  }

  const { data, error } = await query.limit(300)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as unknown as PointageWithRelations[], error: null }
}

export interface ExportPointageFilters {
  employeId?: string
  chantierId?: string
}

// Volontairement généreuse et non filtrée par date côté serveur : comme
// EmployeePage (POINTAGES_FETCH_LIMIT), on récupère l'historique large
// puis on reconstruit les interventions avec buildInterventions() avant
// de ne garder que celles dont l'arrivée tombe dans la période demandée
// — un filtre `pointe_at >= debut` côté requête risquerait de couper une
// séquence arrivée/pause/départ à cheval sur la borne et de fausser les
// totaux exportés. Un export reste une action ponctuelle admin, pas un
// chemin chaud : le coût d'une requête plus large est acceptable.
const EXPORT_FETCH_LIMIT = 20000

export async function listPointagesForExport(
  filters: ExportPointageFilters = {},
): Promise<ServiceResult<PointageWithRelations[]>> {
  let query = supabase.from('pointages').select(RELATIONS_SELECT_ADMIN).order('pointe_at', { ascending: true })

  if (filters.employeId) {
    query = query.eq('employe_id', filters.employeId)
  }
  if (filters.chantierId) {
    query = query.eq('chantier_id', filters.chantierId)
  }

  const { data, error } = await query.limit(EXPORT_FETCH_LIMIT)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as unknown as PointageWithRelations[], error: null }
}

export async function listAllPointages(limit = 500): Promise<ServiceResult<Pointage[]>> {
  const { data, error } = await supabase
    .from('pointages')
    .select('id, employe_id, chantier_id, type, pointe_at, created_at, latitude, longitude, gps_accuracy, distance_chantier_m')
    .order('pointe_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as Pointage[], error: null }
}

export async function listOwnPointages(
  employeId: string,
  limit = 50,
  sinceIso?: string,
): Promise<ServiceResult<PointageWithRelations[]>> {
  let query = supabase
    .from('pointages')
    .select(RELATIONS_SELECT)
    .eq('employe_id', employeId)
    .order('pointe_at', { ascending: false })

  if (sinceIso) {
    query = query.gte('pointe_at', sinceIso)
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as unknown as PointageWithRelations[], error: null }
}

export interface CreatePointageInput {
  chantierId: string
  type: PointageType
  latitude: number | null
  longitude: number | null
  accuracy: number | null
}

export interface CreatePointageResult {
  pointage: Pointage | null
  error: string | null
}

/**
 * Crée un pointage via la fonction RPC `create_pointage` plutôt qu'un
 * INSERT direct : employe_id = auth.uid() est fixé côté base (jamais
 * fourni par le client), la machine à états arrivée/pause/départ et
 * l'affectation employé↔chantier sont validées côté serveur, la distance
 * au chantier est calculée côté PostgreSQL (Haversine), et un verrou
 * transactionnel par employé empêche tout double-pointage en cas de
 * double-clic ou de requêtes concurrentes.
 */
export async function createPointage({
  chantierId,
  type,
  latitude,
  longitude,
  accuracy,
}: CreatePointageInput): Promise<CreatePointageResult> {
  const { data, error } = await supabase.rpc('create_pointage', {
    p_chantier_id: chantierId,
    p_type: type,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy: accuracy,
  })

  if (import.meta.env.DEV) {
    console.debug('[pointageService.createPointage]', { chantierId, type, latitude, longitude, accuracy, data, error })
  }

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[pointageService.createPointage] erreur Supabase', error)
    }
    return { pointage: null, error: error.message }
  }

  return { pointage: data as Pointage, error: null }
}
