import { supabase } from '../lib/supabase'
import type { ChantierPhoto } from '../types/database'
import type { ServiceResult } from './chantierService'

export interface ChantierPhotoWithAuthor extends ChantierPhoto {
  profiles: { full_name: string | null; email: string | null } | null
}

const BUCKET = 'chantier-photos'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const PHOTO_SELECT = 'id, chantier_id, auteur_profile_id, storage_path, commentaire, created_at, profiles(full_name, email)'

/**
 * Validation client (UX rapide, message clair) — la même règle est aussi
 * appliquée côté Storage (bucket chantier-photos, voir migration 008) qui
 * reste la vraie limite de sécurité si jamais ce contrôle est contourné.
 */
export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Format de fichier non pris en charge.'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'La photo dépasse la taille maximale autorisée de 10 Mo.'
  }
  return null
}

function extensionFor(file: File): string {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'bin'
}

export async function listChantierPhotos(chantierId: string): Promise<ServiceResult<ChantierPhotoWithAuthor[]>> {
  const { data, error } = await supabase
    .from('chantier_photos')
    .select(PHOTO_SELECT)
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as unknown as ChantierPhotoWithAuthor[], error: null }
}

export interface UploadChantierPhotoInput {
  chantierId: string
  file: File
  commentaire: string
}

export interface UploadChantierPhotoResult {
  photo: ChantierPhotoWithAuthor | null
  error: string | null
}

/**
 * Upload une photo : Storage d'abord, puis seulement en cas de succès la
 * ligne de métadonnées. Si l'insertion DB échoue après un upload réussi,
 * le fichier orphelin est retiré du bucket plutôt que laissé sans ligne
 * associée.
 */
export async function uploadChantierPhoto({
  chantierId,
  file,
  commentaire,
}: UploadChantierPhotoInput): Promise<UploadChantierPhotoResult> {
  const validationError = validatePhotoFile(file)
  if (validationError) {
    return { photo: null, error: validationError }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { photo: null, error: 'Session expirée. Reconnectez-vous.' }
  }

  const path = `${chantierId}/${crypto.randomUUID()}.${extensionFor(file)}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (uploadError) {
    console.error('[chantierPhotoService.uploadChantierPhoto] échec upload Storage :', uploadError)
    return { photo: null, error: 'Impossible d’ajouter la photo. Réessayez.' }
  }

  const { data, error: insertError } = await supabase
    .from('chantier_photos')
    .insert({
      chantier_id: chantierId,
      auteur_profile_id: user.id,
      storage_path: path,
      commentaire: commentaire.trim() || null,
    })
    .select(PHOTO_SELECT)
    .single()

  if (insertError || !data) {
    console.error('[chantierPhotoService.uploadChantierPhoto] échec insertion métadonnées, nettoyage du fichier :', insertError)
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path])
    if (removeError) {
      console.error('[chantierPhotoService.uploadChantierPhoto] échec du nettoyage après échec DB :', removeError)
    }
    return { photo: null, error: 'Impossible d’ajouter la photo. Réessayez.' }
  }

  return { photo: data as unknown as ChantierPhotoWithAuthor, error: null }
}

export interface DeleteChantierPhotoInput {
  id: string
  storagePath: string
}

export interface DeleteChantierPhotoResult {
  success: boolean
  error: string | null
}

/**
 * Supprime une photo : la ligne de métadonnées d'abord, PUIS le fichier
 * Storage — ordre volontairement inverse de l'upload (Storage puis DB).
 *
 * L'UI ne lit que la ligne DB pour afficher le journal : c'est donc elle
 * qui doit disparaître pour que la suppression soit fiable et visible. Si
 * la ligne est bien supprimée mais que le retrait Storage échoue ensuite,
 * la photo est déjà correctement absente du journal pour l'utilisateur —
 * seul un fichier orphelin reste dans le bucket (invisible, sans impact
 * fonctionnel), simplement loggé pour diagnostic plutôt que remonté comme
 * un échec. À l'inverse, supprimer le fichier Storage en premier
 * risquerait, si la suppression DB échouait ensuite, de laisser une ligne
 * pointant vers un fichier disparu — une photo "cassée" visible dans le
 * journal, un défaut bien plus gênant qu'un fichier orphelin invisible.
 */
export async function deleteChantierPhoto({
  id,
  storagePath,
}: DeleteChantierPhotoInput): Promise<DeleteChantierPhotoResult> {
  const { error: deleteError } = await supabase.from('chantier_photos').delete().eq('id', id)

  if (deleteError) {
    console.error('[chantierPhotoService.deleteChantierPhoto] échec suppression métadonnées :', deleteError)
    return { success: false, error: 'Impossible de supprimer la photo. Réessayez.' }
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (removeError) {
    console.error(
      '[chantierPhotoService.deleteChantierPhoto] ligne supprimée mais échec du retrait Storage (fichier orphelin) :',
      removeError,
    )
  }

  return { success: true, error: null }
}

/**
 * URLs signées temporaires (bucket privé) pour afficher un lot de photos —
 * un seul appel groupé plutôt qu'une requête par photo.
 */
export async function getSignedPhotoUrls(storagePaths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
  if (storagePaths.length === 0) return new Map()

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(storagePaths, expiresInSeconds)

  if (error || !data) {
    console.error('[chantierPhotoService.getSignedPhotoUrls] échec génération des URLs signées :', error)
    return new Map()
  }

  const urls = new Map<string, string>()
  for (const item of data) {
    if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl)
  }
  return urls
}
