/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

import { VitePWA } from 'vite-plugin-pwa'

const certPath = path.resolve(__dirname, '../certs/cert.pem')
const keyPath = path.resolve(__dirname, '../certs/key.pem')
const enableHttps = process.env.VITE_ENABLE_HTTPS === 'true'
const httpsConfig = enableHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)
  ? {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }
  : undefined

function getVendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/') || id.includes('zustand')) return 'react-vendor'
  if (id.includes('@tanstack/react-query') || id.includes('axios')) return 'data-vendor'
  if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor'
  if (id.includes('html5-qrcode') || id.includes('onnxruntime-web') || id.includes('@noble/')) return 'scanner-vendor'
  if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('date-fns') || id.includes('react-hot-toast')) return 'ui-vendor'
  if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) return 'markdown-vendor'
  if (id.includes('@dnd-kit/')) return 'dnd-vendor'
  if (id.includes('localforage') || id.includes('@supabase/supabase-js')) return 'storage-vendor'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: 'pwa-sw.js', // Worker applicatif unique pour le scope racine
      includeAssets: ['logo.svg', 'logo.png'],
      manifest: false, // Utilise public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Pas de BackgroundSync Workbox : la file offline est gérée par MobileStorage (localforage)
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/mobile\/snapshot.*/i,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-snapshot-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: httpsConfig,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getVendorChunk(id)
        }
      }
    }
  }
})
