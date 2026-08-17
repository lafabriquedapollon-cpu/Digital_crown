import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css' // <--- VERIFIE BIEN CETTE LIGNE
import * as Sentry from "@sentry/react";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

import { registerSW } from 'virtual:pwa-register'

if ('serviceWorker' in navigator) {
  // Un seul service worker peut contrôler le scope racine. Enregistrer aussi
  // /sw.js au même scope faisait alterner les deux workers en continu et
  // rechargeait toute l'application. La file mobile hors ligne est gérée par
  // MobileStorage ; Workbox reste l'unique worker applicatif.
  registerSW({
    immediate: true,
    // Une nouvelle release sera chargée au prochain démarrage de l'application.
    // Ne jamais recharger automatiquement une session de travail en cours.
    onNeedRefresh() {},
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
