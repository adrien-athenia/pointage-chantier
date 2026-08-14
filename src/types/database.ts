export type UserRole = 'admin' | 'employe'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export type ChantierStatut = 'actif' | 'termine' | 'archive'

export interface Chantier {
  id: string
  nom: string
  adresse: string | null
  ville: string | null
  /** @deprecated Miroir dérivé de `statut` côté base (trigger) — utiliser `statut`. Conservé pour compatibilité descendante. */
  actif: boolean
  statut: ChantierStatut
  latitude: number | null
  longitude: number | null
  rayon_autorise: number
  duree_max_intervention_minutes: number | null
  created_at: string
  updated_at: string
}

export type PointageType = 'arrivee' | 'pause_debut' | 'pause_fin' | 'depart'

export interface Pointage {
  id: string
  employe_id: string
  chantier_id: string
  type: PointageType
  pointe_at: string
  created_at: string
  latitude: number | null
  longitude: number | null
  gps_accuracy: number | null
  distance_chantier_m: number | null
}

export interface EmployeChantier {
  employe_id: string
  chantier_id: string
  actif: boolean
  created_at: string
}

export interface ChantierPhoto {
  id: string
  chantier_id: string
  auteur_profile_id: string
  storage_path: string
  commentaire: string | null
  created_at: string
}
