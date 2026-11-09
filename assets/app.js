/* =========================================================================
   app.js — Khung ứng dụng: trạng thái, định tuyến (#/…), header điều hướng
   kiểu AssetOps, sáng/tối, cổng đăng nhập, tiện ích dùng chung.
   ========================================================================= */
(function () {
  'use strict';

  const App = {
    settings: null,
    data: { events: [], docs: [], expenses: [], images: [] },
    route: { name: '', parts: [] },
    charts: {},
    urls: {},
    actions: {},
    screens: {},
    inputCb: {},
    draftExpense: null,
  };
  window.App = App;
  const esc = U.esc;
  const $ = (sel, root) => (root || document).querySelector(sel);
  App.$ = $;

  /* ----------------------------- Icon (nét, offline) ----------------------------- */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    receipt: '<path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z"/><path d="M9 9h6M9 13h6"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5z"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    word: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m8.5 12 1.2 5 1.3-4 1.3 4 1.2-5"/>',
    excel: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 12 5 6M14 12l-5 6"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    cloud: '<path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  };
  function icon(name, size) {
    size = size || 18;
    return '<svg class="ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  App.icon = icon;

  /* ----------------------------- Menu ----------------------------- */
  const MENU = [
    { r: '', label: 'Tổng quan', ic: 'grid' },
    { r: 'tam-ung', label: 'Tạm ứng', ic: 'file' },
    { r: 'chi-tieu', label: 'Chi tiêu', ic: 'receipt' },
    { r: 'hoan-ung', label: 'Hoàn ứng', ic: 'wallet' },
    { r: 'thanh-toan', label: 'Thanh toán', ic: 'calc' },
    { r: 'su-kien', label: 'Sự kiện', ic: 'calendar' },
    { r: 'tai-khoan', label: 'Tài khoản', ic: 'users', admin: true },
  ];
  const MENU_MORE = [
    { r: 'ca-nhan', label: 'Hồ sơ cá nhân', ic: 'user' },
    { r: 'cai-dat', label: 'Cấu hình mẫu phiếu', ic: 'settings' },
    { r: 'huong-dan', label: 'Hướng dẫn sử dụng', ic: 'help' },
    { act: 'downloadBlank', label: 'Tải mẫu Excel trống', ic: 'download' },
    { act: 'exportData', label: 'Sao lưu dữ liệu (JSON)', ic: 'database' },
  ];
  // route con → mục menu cha để tô sáng
  const ROUTE_PARENT = { phieu: null };

  /* ----------------------------- Cài đặt mặc định (tab "Cấu hình" của mẫu) ----------------------------- */
  const DEFAULT_SETTINGS = {
    id: 'app',
    company: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC LEARN TO LEAP',
    companyAddr: 'Tầng 06, Toà nhà IPH, số 241 Xuân Thuỷ, Cầu Giấy, Hà Nội',
    mst: '0110407398', phone: '0777 308 883', email: 'contact@learntoleap.vn',
    bankLine: '46860868 - Ngân Hàng Quân Đội MB Bank',
    kinhGui: 'Ban Giám đốc; Phòng Tài chính - Kế toán',
    mauSo: '01-TT/LTL', lanBanHanh: '01', ngayApDung: '01/10/2026',
    chucDanhPheDuyet: 'GIÁM ĐỐC', docNghin: 'ngàn', hauTo: 'đồng chẵn.',
    keToanTruong: 'Phan Thị Thảo', giamDoc: 'Lê Văn Trí',
    boPhanList: ['Kế toán - Hành chính', 'Kinh doanh', 'Kỹ thuật', 'Vận hành', 'Ban Giám đốc', 'Mua hàng', 'Chuyên môn', 'Khác'],
    // hồ sơ người đề nghị (điền sẵn vào phiếu)
    hoTen: '', tenNgan: '', boPhan: '', chucVu: '', tenTK: '', soTK: '', nganHang: '',
    schema: 2,
  };
  App.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

  /* ----------------------------- Lib loader ----------------------------- */
  const LIBS = {
    docx: { src: 'lib/docx.js', g: 'docx' },
    exceljs: { src: 'lib/exceljs.min.js', g: 'ExcelJS' },
    chart: { src: 'lib/chart.umd.min.js', g: 'Chart' },
    supabase: { src: 'lib/supabase.js', g: 'supabase' },
  };
  const _libP = {};
  function ensureLib(name) {
    const L = LIBS[name];
    if (window[L.g]) return Promise.resolve(window[L.g]);
    if (_libP[name]) return _libP[name];
    _libP[name] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = L.src; s.async = true;
      s.onload = () => res(window[L.g]);
      s.onerror = () => { delete _libP[name]; rej(new Error('Không tải được thư viện: ' + L.src)); };
      document.head.appendChild(s);
    });
    return _libP[name];
  }
  App.ensureLib = ensureLib;

  /* ----------------------------- Theme ----------------------------- */
  function applyTheme() {
    let t = 'system';
    try { t = localStorage.getItem('ltl_theme') || 'system'; } catch (e) {}
    const dark = t === 'dark' || (t === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0b1220' : '#ffffff');
    return dark;
  }
  App.isDark = () => document.documentElement.classList.contains('dark');
  applyTheme();
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (App.user) render(); }); } catch (e) {}
  }

  /* ----------------------------- Toast / sheet / confirm ----------------------------- */
  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, type === 'err' ? 4200 : 2400);
    setTimeout(() => t.remove(), type === 'err' ? 4600 : 2800);
  }
  App.toast = toast;

  function openSheet(html, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="sheet ' + (opts.center ? 'center ' : '') + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true"><div class="grip"></div>' + html + '</div>';
    root.appendChild(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && opts.dismiss !== false) closeSheet(ov); });
    requestAnimationFrame(() => ov.classList.add('show'));
    const f = ov.querySelector('input:not([type=hidden]),textarea,select');
    if (f && opts.focus !== false && window.innerWidth >= 640) setTimeout(() => f.focus(), 60);
    return ov;
  }
  function closeSheet(ov) {
    if (!ov) { const all = document.querySelectorAll('#modal-root .overlay'); ov = all[all.length - 1]; }
    if (!ov) return;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 200);
  }
  function closeAllSheets() { document.querySelectorAll('#modal-root .overlay').forEach((o) => closeSheet(o)); }
  App.openSheet = openSheet; App.closeSheet = closeSheet; App.closeAllSheets = closeAllSheets;
  App.sheetHead = (title, sub) => '<div class="sheet-h"><div><div class="st">' + esc(title) + '</div>' +
    (sub ? '<div class="ss">' + esc(sub) + '</div>' : '') + '</div>' +
    '<button class="btn ghost icon sm x" data-act="closeTop" aria-label="Đóng">' + icon('x') + '</button></div>';

  function confirmSheet(title, msg, onYes, danger, yesLabel) {
    const ov = openSheet(
      '<div class="sheet-h"><div class="st">' + esc(title) + '</div></div>' +
      '<p class="muted" style="margin:0">' + esc(msg) + '</p>' +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button>' +
      '<button class="btn ' + (danger ? 'danger' : '') + '" id="cf-yes">' + esc(yesLabel || 'Đồng ý') + '</button></div>',
      { center: true });
    $('#cf-yes', ov).addEventListener('click', () => { closeSheet(ov); if (onYes) onYes(); });
  }
  App.confirmSheet = confirmSheet;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const pop = document.querySelector('.menu-pop.open');
      if (pop) { pop.classList.remove('open'); return; }
      if (document.querySelector('#modal-root .overlay')) closeSheet();
    }
  });

  function imgURL(img) {
    if (!img || !img.blob) return '';
    if (App.urls[img.id]) return App.urls[img.id];
    const u = URL.createObjectURL(img.blob);
    App.urls[img.id] = u;
    return u;
  }
  App.imgURL = imgURL;

  /* ----------------------------- Dữ liệu ----------------------------- */
  async function loadData() {
    const [events, docs, expenses, images] = await Promise.all([
      DB.all('events'), DB.all('docs'), DB.all('expenses'), DB.all('images'),
    ]);
    events.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    docs.sort((a, b) => (b.ngayLap || '').localeCompare(a.ngayLap || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    expenses.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
    App.data = { events, docs, expenses, images };
  }
  App.loadData = loadData;
  App.eventById = (id) => App.data.events.find((e) => e.id === id) || null;
  App.expensesOf = (eventId) => App.data.expenses.filter((e) => e.eventId === eventId);
  App.imagesByExpense = function (images) {
    const m = {};
    (images || App.data.images).forEach((im) => { if (im.expenseId) (m[im.expenseId] = m[im.expenseId] || []).push(im); });
    return m;
  };
  App.vatTypeOf = (e) => { const t = e && e.vatType; return t === 'vat' || t === 'bill' ? t : 'none'; };

  // Chuyển phiếu tạm ứng kiểu cũ (store "advances") sang phiếu mẫu mới — chạy 1 lần.
  async function migrateLegacy() {
    let advs = [];
    try { advs = await DB.all('advances'); } catch (e) { return; }
    if (!advs.length) return;
    const docs = await DB.all('docs');
    const have = new Set(docs.map((d) => d.legacyId).filter(Boolean));
    for (const a of advs) {
      if (have.has(a.id)) continue;
      const ev = (await DB.get('events', a.eventId)) || {};
      const d = App.Docs.blank('TU', { eventId: a.eventId || null });
      Object.assign(d, {
        legacyId: a.id,
        ngayLap: a.date || d.ngayLap,
        soPhieu: '',
        nguoiDeNghi: a.requester || d.nguoiDeNghi, boPhan: a.dept || d.boPhan,
        noiDung: a.reason || (ev.name ? 'Tạm ứng chi phí ' + ev.name : ''),
        mucDich: ev.name ? 'Phục vụ ' + ev.name : '',
        items: (a.items || []).filter((it) => it.content || it.amount).map((it) => App.Docs.blankItem({
          noiDung: it.content + (it.note ? ' (' + it.note + ')' : ''), ngayChi: a.date || '', soLuong: 1, donGia: U.toNumber(it.amount),
        })),
      });
      d.soPhieu = App.Docs.nextNumber('TU', d.ngayLap, docs);
      docs.push(d);
      await DB.put('docs', d);
    }
  }
  App.migrateLegacy = migrateLegacy;

  async function ensureSettings() {
    let s = await DB.get('settings', 'app');
    if (!s) s = Object.assign({}, DEFAULT_SETTINGS);
    let changed = false;
    // nâng cấp cài đặt cũ (v1) → khung "Cấu hình" của mẫu mới
    if (!s.schema || s.schema < 2) {
      const old = s;
      s = Object.assign({}, DEFAULT_SETTINGS, {
        hoTen: old.requester || '', boPhan: '', chucVu: old.position || '',
      });
      changed = true;
    }
    for (const k in DEFAULT_SETTINGS) if (s[k] === undefined) { s[k] = DEFAULT_SETTINGS[k]; changed = true; }
    if (!Array.isArray(s.boPhanList) || !s.boPhanList.length) { s.boPhanList = DEFAULT_SETTINGS.boPhanList.slice(); changed = true; }
    if (changed) await DB.put('settings', s);
    App.settings = s;
    return s;
  }
  App.ensureSettings = ensureSettings;

  /* ----------------------------- Định tuyến ----------------------------- */
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const q = {};
    (qs || '').split('&').forEach((kv) => { if (!kv) return; const [k, v] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { name: parts[0] || '', parts, q };
  }
  App.nav = function (path) {
    const h = '#/' + (path || '');
    if (location.hash === h) go(); else location.hash = h;
  };
  window.addEventListener('hashchange', () => { if (App.user) go(); });

  async function go() {
    App.route = parseHash();
    closeMenus();
    try { await loadData(); } catch (e) { toast('Không đọc được dữ liệu: ' + e.message, 'err'); }
    render();
    window.scrollTo(0, 0);
  }
  App.go = go;
  App.reload = async function () {
    const y = window.scrollY;
    try { await loadData(); } catch (e) {}
    render();
    window.scrollTo(0, y);
  };

  /* ----------------------------- Render ----------------------------- */
  function isAdmin() { return !!(App.cloud && App.cloud.isAdmin); }
  App.isAdmin = isAdmin;

  function navHTML(mobile) {
    const cur = App.route.name;
    const items = MENU.filter((m) => !m.admin || isAdmin());
    const link = (m) => m.act
      ? '<button class="nav-a" data-act="' + m.act + '">' + icon(m.ic) + '<span>' + m.label + '</span></button>'
      : '<a class="nav-a' + (isActive(m.r, cur) ? ' on' : '') + '" href="#/' + m.r + '">' + icon(m.ic) + '<span>' + m.label + '</span></a>';
    if (mobile) {
      return items.map(link).join('') + '<div class="menu-sep"></div>' + MENU_MORE.map(link).join('');
    }
    return '<nav class="nav" aria-label="Điều hướng chính"><div class="nav-scroll">' + items.map(link).join('') + '</div>' +
      '<div class="nav-more"><button class="nav-a' + (MENU_MORE.some((m) => m.r && m.r === cur) ? ' on' : '') + '" data-act="toggleMore" aria-haspopup="true">' + icon('more') + '<span>Thêm</span></button>' +
      '<div class="menu-pop" id="more-pop">' + MENU_MORE.map(link).join('') + '</div></div></nav>';
  }
  function isActive(r, cur) {
    if (r === cur) return true;
    if (cur === 'phieu') {
      const d = App.route.parts[1] === 'moi' ? { type: App.route.parts[2] } : App.data.docs.find((x) => x.id === App.route.parts[1]);
      const map = { TU: 'tam-ung', HU: 'hoan-ung', TT: 'thanh-toan' };
      return !!(d && map[d.type] === r);
    }
    return false;
  }

  function headerHTML() {
    const s = App.settings || {};
    const u = App.cloud && App.cloud.user;
    const name = s.hoTen || (u && u.user_metadata && u.user_metadata.full_name) || (u && u.email) || 'Tài khoản';
    const role = (isAdmin() ? 'Quản trị · ' : '') + (s.boPhan || (u && u.email) || '');
    const dark = App.isDark();
    return '<header class="hdr"><div class="container hdr-in">' +
      '<a class="brand" href="#/"><span class="brand-logo">LtL</span><span class="brand-t"><b>Tạm ứng <span>&amp;</span> Hoàn ứng</b><small>Learn to Leap</small></span></a>' +
      navHTML(false) +
      '<div class="hdr-right">' +
      '<div class="who"><b title="' + esc(name) + '">' + esc(name) + '</b><small title="' + esc(role) + '">' + esc(role) + '</small></div>' +
      '<button class="btn out icon" data-act="syncNow" title="Đồng bộ dữ liệu" aria-label="Đồng bộ"><span class="sync-dot" id="sync-dot"></span></button>' +
      '<button class="btn out icon" data-act="toggleTheme" title="' + (dark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối') + '" aria-label="Đổi giao diện sáng/tối">' + icon(dark ? 'sun' : 'moon') + '</button>' +
      '<button class="btn out icon" data-act="logout" title="Đăng xuất" aria-label="Đăng xuất">' + icon('logout') + '</button>' +
      '<button class="btn out icon only-mobile" data-act="toggleMobileNav" aria-label="Mở menu">' + icon('menu') + '</button>' +
      '</div></div>' +
      '<nav class="container mnav" id="mnav" aria-label="Điều hướng (màn hình nhỏ)">' + navHTML(true) + '</nav>' +
      '</header>';
  }

  function render() {
    Object.values(App.charts).forEach((c) => { try { c.destroy(); } catch (e) {} });
    App.charts = {};
    const app = document.getElementById('app');
    if (!App.user) { if (App.screens.login) App.screens.login(app); return; }
    app.innerHTML = headerHTML() +
      '<main class="main"><div class="container fade-in" id="screen"></div></main>' +
      '<footer class="foot"><div class="container">Learn to Leap — Tạm ứng · Hoàn ứng · Thanh toán theo mẫu 01-TT/LTL. Mỗi tài khoản chỉ xem dữ liệu của chính mình.</div></footer>';
    const screen = document.getElementById('screen');
    const name = App.route.name;
    const R = App.screens[name === '' ? 'dashboard' : name];
    if (R) {
      try { R(screen, App.route); }
      catch (e) { console.error(e); screen.innerHTML = errorBox(e); }
    } else {
      screen.innerHTML = '<div class="card"><div class="empty"><div class="eic">' + icon('alert') + '</div><div class="et">Không tìm thấy trang</div>' +
        '<div class="es">Đường dẫn không tồn tại.</div><a class="btn" href="#/">Về Tổng quan</a></div></div>';
    }
    if (App.cloud) App.cloud.updateBadge();
  }
  App.render = render;
  function errorBox(e) {
    return '<div class="alert danger">' + icon('alert') + '<div><b>Có lỗi khi hiển thị trang.</b><br>' + esc(e && e.message || e) + '</div></div>';
  }

  function closeMenus() {
    document.querySelectorAll('.menu-pop.open').forEach((p) => p.classList.remove('open'));
    const m = document.getElementById('mnav'); if (m) m.classList.remove('open');
  }
  document.addEventListener('pointerdown', (e) => {
    const pop = document.querySelector('.menu-pop.open');
    if (pop && !e.target.closest('.nav-more')) pop.classList.remove('open');
  });

  /* ----------------------------- Trang tiêu đề dùng chung ----------------------------- */
  App.pageHead = function (title, sub, actions, crumbs) {
    return (crumbs ? '<div class="crumbs">' + crumbs + '</div>' : '') +
      '<div class="page-h"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  };
  App.emptyState = function (ic, title, sub, btn) {
    return '<div class="empty"><div class="eic">' + icon(ic) + '</div><div class="et">' + esc(title) + '</div>' +
      (sub ? '<div class="es">' + sub + '</div>' : '') + (btn || '') + '</div>';
  };
  App.money = (n) => U.groupThousand(n) + ' đ';

  /* ----------------------------- Khởi động ----------------------------- */
  async function init() {
    try {
      await DB.open();
      await ensureSettings();
    } catch (e) {
      document.getElementById('app').innerHTML = '<div class="auth"><div class="auth-box"><div class="alert danger">' + icon('alert') +
        '<div><b>Không mở được bộ nhớ trình duyệt.</b><br>' + esc(e.message || e) + '<br>Hãy tắt chế độ ẩn danh và tải lại trang.</div></div></div></div>';
      return;
    }
    App.user = null;
    document.getElementById('app').innerHTML = '<div class="auth"><div class="muted">Đang mở…</div></div>';
    if (App.cloud) await App.cloud.init();
    if (!App.cloud || !App.cloud.user) { render(); return; }
    await App.afterLogin();
  }
  // gọi sau khi có phiên đăng nhập hợp lệ
  App.afterLogin = async function () {
    App.user = App.cloud.user;
    await ensureSettings();
    try { await migrateLegacy(); } catch (e) { console.warn(e); }
    await go();
  };
  App.afterLogout = function () {
    App.user = null;
    App.data = { events: [], docs: [], expenses: [], images: [] };
    if (location.hash) history.replaceState(null, '', location.pathname);
    render();
  };

  // dispatch click
  document.addEventListener('click', (e) => {
    const node = e.target.closest('[data-act]');
    if (!node) return;
    const raw = node.getAttribute('data-act');
    const i = raw.indexOf(':');
    const act = i < 0 ? raw : raw.slice(0, i);
    const arg = i < 0 ? '' : raw.slice(i + 1);
    const fn = App.actions[act];
    if (fn) { e.preventDefault(); Promise.resolve(fn(arg, node, e)).catch((err) => { console.error(err); toast(err.message || String(err), 'err'); }); }
  });

  Object.assign(App.actions, {
    closeTop: () => closeSheet(),
    toggleMore() { const p = document.getElementById('more-pop'); if (p) p.classList.toggle('open'); },
    toggleMobileNav() { const m = document.getElementById('mnav'); if (m) m.classList.toggle('open'); },
    toggleTheme() {
      const next = App.isDark() ? 'light' : 'dark';
      try { localStorage.setItem('ltl_theme', next); } catch (e) {}
      applyTheme(); render();
    },
    async downloadBlank() {
      closeMenus();
      try {
        const r = await fetch('assets/templates/Mau_ho_so_thanh_toan_LTL_2026.xlsx');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        U.saveBlob(await r.blob(), 'Mau_ho_so_thanh_toan_LTL_2026.xlsx');
      } catch (e) { toast('Không tải được mẫu: ' + e.message, 'err'); }
    },
    async exportData() {
      closeMenus();
      const data = await DB.exportJSON();
      U.saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'LtL-sao-luu-' + U.todayISO() + '.json');
      toast('Đã tải file sao lưu', 'ok');
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
