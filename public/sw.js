const CACHE_NAME = 'purela-pharmacy-pos-v4'
const APP_SHELL = ['./', './manifest.webmanifest', './favicon.svg', './supabase-config.js']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('purela-pharmacy-pos-') && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const scope = new URL(self.registration.scope)
  // Database responses must always come from the server, never the app cache.
  if (event.request.method !== 'GET' || url.origin !== scope.origin) return
  const path = url.pathname.slice(scope.pathname.length)
  const asset = /^(assets\/|manifest\.webmanifest$|favicon\.svg$|supabase-config\.js$)/.test(path)
  if (event.request.mode !== 'navigate' && !asset) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    try {
      const response = await fetch(event.request)
      if (response.ok) {
        await cache.put(event.request, response.clone())
        if (event.request.mode === 'navigate') await cache.put('./', response.clone())
      }
      return response
    } catch {
      const cached = await cache.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') {
        const shell = await cache.match('./')
        if (shell) return shell
      }
      return Response.error()
    }
  })())
})
