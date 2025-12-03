// Service Worker para PWA
// IMPORTANTE: NUNCA cachear requisições de API - dados devem ser sempre frescos
const CACHE_NAME = 'mvcash-v1'
const RUNTIME_CACHE = 'mvcash-runtime-v1'
const STATIC_CACHE = 'mvcash-static-v1'

// Arquivos para cache inicial (instalação)
const PRECACHE_ASSETS = [
  '/',
  '/login',
  '/offline',
  '/manifest.json',
]

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Precaching assets')
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => self.skipWaiting())
  )
})

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== STATIC_CACHE) {
            console.log('Service Worker: Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Estratégia de cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorar requisições que não sejam GET
  if (request.method !== 'GET') return

  // Ignorar extensões do Chrome e hot reload
  if (url.protocol === 'chrome-extension:' || url.pathname.includes('_next/webpack-hmr')) {
    return
  }

  // Estratégia para API - SEMPRE Network First, NUNCA cachear
  // Dados devem ser sempre frescos em tempo real
  if (url.pathname.startsWith('/api') || url.port === '4010' || url.hostname.includes('localhost:4010') || url.hostname.includes('core.mvcash.com.br')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // NUNCA cachear respostas de API - sempre retornar dados frescos
          return response
        })
        .catch(() => {
          // Se offline, retornar erro imediatamente (sem cache)
          return new Response(
            JSON.stringify({ error: 'Offline', message: 'Sem conexão com a internet' }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            }
          )
        })
    )
    return
  }

  // Estratégia para assets estáticos (JS, CSS, imagens, fontes) - Cache First
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf|eot|webp)$/)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
      })
    )
    return
  }

  // Estratégia para páginas HTML - Network First (sem cache agressivo)
  // Páginas podem ter dados dinâmicos, então sempre buscar versão fresca
  if (url.origin === self.location.origin && request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cachear apenas para offline fallback, não para uso normal
          if (response && response.status === 200) {
            const responseClone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Se offline, tentar servir página offline ou cached
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            if (request.mode === 'navigate') {
              return caches.match('/offline')
            }
            return new Response('Offline', { status: 503 })
          })
        })
    )
    return
  }
})

// Background Sync (opcional)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync:', event.tag)
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Implementar lógica de sincronização
      Promise.resolve()
    )
  }
})

// Push Notifications (opcional - para futuro)
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.message || 'Nova notificação',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'MVCash', options)
  )
})

// Clique em notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  )
})

