import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)
void import('./App.tsx').then(({ default: App }) => {
  root.render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  const exportSavedData = () => {
    const saved: Record<string, string | null> = {}
    for (const key of ['purela.offline.v1', 'purela.clean.inventory', 'purela.customers', 'purela.clean.prescriptions', 'purela.clean.sales', 'purela.pendingDeletes', 'purela.cart.v1']) {
      try { saved[key] = localStorage.getItem(key) } catch { saved[key] = null }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'purela-recovery-data.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  root.render(createElement('main', { style: { padding: '32px', maxWidth: '640px', margin: 'auto' } },
    createElement('h1', null, 'The register could not be opened'),
    createElement('p', null, 'Preserve your saved data before reloading or repairing this device. Keep browser storage intact.'),
    createElement('button', { onClick: exportSavedData }, 'Export recovery data')))
})

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister()
      })
    })

    if ('caches' in window) {
      void caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key.startsWith('purela-pharmacy-pos')) {
            void caches.delete(key)
          }
        })
      })
    }
  })
}
