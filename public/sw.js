// Service Worker — 离线缓存,适配 Next.js 静态导出
// 策略: stale-while-revalidate for assets, network-first for HTML(保证页面更新及时)
// v2: 静态资源由 cache-first 改为 stale-while-revalidate，
//     防止开发期旧版本 chunks 被永久缓存导致 "module factory is not available" 报错。
const CACHE_VERSION = 'v2'
const STATIC_CACHE = `oh-my-tools-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `oh-my-tools-runtime-${CACHE_VERSION}`

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 不缓存分析/广告脚本
  if (url.hostname.includes('googletagmanager') || url.hostname.includes('googlesyndication')) {
    return
  }

  const isHTML = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html')

  if (isHTML) {
    // HTML: network-first,失败回退到 cache
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    )
    return
  }

  // 静态资源: stale-while-revalidate（有缓存先返回，同时后台拉新；无缓存则直取网络）
  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((res) => {
        if (res.ok && res.status === 200) {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      }).catch(() => cached)
      return cached || update
    })
  )
})
