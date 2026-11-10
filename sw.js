/* Service worker — Learn to Leap · Tạm ứng & Hoàn ứng
   - Cài đặt: tải sẵn toàn bộ app + thư viện (Word/Excel/biểu đồ/đăng nhập) để chạy offline.
   - Code của app (HTML/JS/CSS): ưu tiên mạng, BỎ QUA cache HTTP của trình duyệt (no-cache)
     để sau mỗi lần cập nhật không bị lẫn file cũ – mới; mất mạng thì dùng bản đã lưu.
   - Thư viện / ảnh: dùng bản đã lưu (đổi VERSION khi thay thư viện).
   Đổi VERSION ở mỗi lần phát hành để xoá cache cũ. */
'use strict';
const VERSION = 'ltl-v24';
const CORE = 'ltl-core-' + VERSION;

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
  './assets/screen-dashboard.js',
  './assets/screen-expenses.js',
  './assets/screen-events.js',
  './assets/trash.js',
  './assets/report.js',
  './assets/admin.js',
  './assets/demo.js',
  './assets/cloud.js',
  './assets/logo-mark.png',
  './assets/logo-ltl-sm.png',
  './assets/templates/logo-ltl.png',
  './assets/templates/Mau_ho_so_thanh_toan_LTL_2026.xlsx',
  './lib/docx.js',
  './lib/exceljs.min.js',
  './lib/chart.umd.min.js',
  './lib/supabase.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE)
      .then((c) => Promise.allSettled(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => { if (r.ok) return c.put(u, r); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ltl-') && k !== CORE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putCopy(req, res) {
  if (res && res.ok && res.type === 'basic' && !res.redirected) {
    const copy = res.clone();
    caches.open(CORE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, Google Fonts… đi thẳng ra mạng

  // Mở trang: ưu tiên mạng, mất mạng thì dùng trang đã lưu
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./', { ignoreSearch: true })))
    );
    return;
  }

  // Thư viện, icon, mẫu Excel: dùng bản đã lưu, chưa có thì tải và lưu lại
  if (/\/(lib|icons|assets\/templates)\//.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => putCopy(req, res))));
    return;
  }

  // Code app: ưu tiên mạng (không dùng cache HTTP), mất mạng thì dùng bản đã lưu.
  // Không trả index.html thay cho JS/CSS khi thiếu — tránh lỗi khó hiểu.
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => putCopy(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error()))
  );
});
