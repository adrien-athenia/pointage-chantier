import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.svg',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'PointageChantier',
        short_name: 'Pointage',
        description: 'Gestion des heures et pointages chantier',
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0A0D14',
        background_color: '#0A0D14',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Prend en charge le rafraîchissement direct d'une route React
        // Router (ex. /dashboard) quand la requête n'est pas déjà en
        // precache — sert index.html et laisse React Router router côté
        // client.
        navigateFallback: '/index.html',
        // IMPORTANT : aucune règle runtimeCaching n'est ajoutée ici.
        // Le service worker généré ne précache que les fichiers statiques
        // buildés (JS/CSS/HTML/icônes) via globPatterns par défaut ; les
        // appels réseau vers Supabase (domaine distinct *.supabase.co)
        // ne sont jamais interceptés ni mis en cache. Ne pas ajouter de
        // runtimeCaching pour ces requêtes sans le vouloir explicitement.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
