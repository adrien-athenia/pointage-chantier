import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuration Supabase manquante : VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY ne sont pas définies. ' +
      'Copiez .env.example vers .env à la racine du projet et renseignez ces deux variables, puis redémarrez le serveur de dev.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
