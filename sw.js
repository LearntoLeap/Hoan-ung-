/* Service worker — Learn to Leap · Tạm ứng & Hoàn ứng
   Offline-first: precache app shell, runtime-cache heavy libs on first use. */
'use strict';
const VERSION = 'ltl-v22';
const CORE = 'ltl-core-' + VERSION;
const RUNTIME = 'ltl-rt-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/utils.js',
  './assets/db.js',
  './assets/app.js',
  './assets/ui.js',
  './assets/forms.js',
  './assets/export.js',
  './assets/admin.js',
  './assets/trash.js',
  './assets/report.js',
  './assets/logo-mark.png',
  './assets/logo-ltl-sm.png',
  './assets/screen-dashboard.js',
  './assets/screen-expenses.js',
  './assets/screen-events.js',
  './assets/cloud.js',
  './assets/logo-mark-white.png',
  './assets/templates/logo-ltl.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation → network first, fall back to cached shell (offline).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Heavy third-party libs + icons rarely change → cache first (fast, offline-safe).
  const isStatic = /\/lib\/|\/icons\//.test(url.pathname);
  if (isStatic) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // App's own code (HTML/CSS/JS, manifest) → network first so updates land
  // immediately when online; fall back to cache when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CORE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
