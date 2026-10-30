// KDO service worker: lets the app open like an installed app, and keeps it up to date.
// Network first: whenever a new version is published, everyone gets it the next time they open KDO.
const CACHE = 'kdo-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only the app's own files; Firebase and fonts go straight to the network
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
  );
});

// Notifications sent by the KDO server (someone reacted to your story)
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const d = payload.data || payload.notification || payload;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // When KDO is open and in front, it shows its own little alert; iPhone still needs a notification every time
    const inFront = list.some(c => c.visibilityState === 'visible' && c.focused);
    if (inFront && !/iPhone|iPad|iPod/.test(self.navigator.userAgent)) return;
    return self.registration.showNotification(d.title || 'KDO', {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: d.tag || 'kdo',
      renotify: true,
      data: { url: d.url || './?story=me' },
    });
  }));
});

// Tapping the notification opens KDO on "Ta story"
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './?story=me', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ kdo: 'open-replies' }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
