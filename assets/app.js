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
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    zoom: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
    grid4: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    square: '<rect x="3" y="3" width="18" height="18" rx="3"/>',
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
    { r: 'bao-cao', label: 'Báo cáo', ic: 'chart' },
    { r: 'tai-khoan', label: 'Tài khoản', ic: 'users', admin: true },
  ];
  const MENU_MORE = [
    { r: 'thung-rac', label: 'Thùng rác', ic: 'trash', trash: true },
    { r: 'ca-nhan', label: 'Hồ sơ cá nhân', ic: 'user' },
    { r: 'cai-dat', label: 'Cấu hình mẫu phiếu', ic: 'settings' },
    { r: 'huong-dan', label: 'Hướng dẫn sử dụng', ic: 'help' },
    { act: 'downloadBlank', label: 'Tải mẫu Excel trống', ic: 'download' },
    { act: 'exportData', label: 'Sao lưu dữ liệu (JSON)', ic: 'database' },
  ];
  const BNAV = ['', 'tam-ung', 'chi-tieu', 'hoan-ung'];
  const ROUTE_ICON = { phieu: 'file', 'ca-nhan': 'user', 'cai-dat': 'settings', 'huong-dan': 'help', 'thung-rac': 'trash' };
  App.routeIcon = (name) => ROUTE_ICON[name] || ((MENU.find((m) => m.r === name) || {}).ic) || 'grid';
  const TRASH_DAYS = 30;
  App.TRASH_DAYS = TRASH_DAYS;

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
    if (m) m.setAttribute('content', dark ? '#140b1c' : '#ffffff');
    return dark;
  }
  App.isDark = () => document.documentElement.classList.contains('dark');
  applyTheme();
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (App.user) render(); }); } catch (e) {}
  }

  /* ----------------------------- Toast / sheet / confirm ----------------------------- */
  // toast(msg, 'ok'|'err', { label: 'Hoàn tác', fn }) — nút thao tác tuỳ chọn
  function toast(msg, type, action) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
    const life = action ? 6500 : type === 'err' ? 4500 : 2600;
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
    if (action) {
      const b = document.createElement('button'); b.className = 'tb'; b.textContent = action.label || 'Hoàn tác';
      b.onclick = () => { kill(); try { action.fn(); } catch (e) {} };
      t.appendChild(b);
    }
    root.appendChild(t);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(kill, life);
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
      const cf = document.getElementById('cfg'); if (cf && cf.classList.contains('open')) { cf.classList.remove('open'); return; }
      if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); return; }
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
    // Thùng rác: bản ghi có deletedAt không hiện ở các trang, chỉ hiện trong Thùng rác
    const live = (a) => a.filter((x) => !x.deletedAt), dead = (a) => a.filter((x) => x.deletedAt);
    App.trash = { events: dead(events), docs: dead(docs), expenses: dead(expenses) };
    const deadEv = new Set(App.trash.events.map((e) => e.id)), deadExp = new Set(App.trash.expenses.map((e) => e.id)), deadDoc = new Set(App.trash.docs.map((d) => d.id));
    App.data = { events: live(events), docs: live(docs), expenses: live(expenses).filter((e) => !deadEv.has(e.eventId)),
      images: images.filter((im) => !deadExp.has(im.expenseId) && !deadDoc.has(im.docId)) };
    App.trashCount = App.trash.events.length + App.trash.docs.length + App.trash.expenses.filter((e) => !deadEv.has(e.eventId)).length;
  }
  // Xoá vĩnh viễn những gì nằm trong thùng rác quá 30 ngày
  async function purgeOldTrash() {
    const limit = Date.now() - TRASH_DAYS * 864e5;
    const old = (x) => x.deletedAt && Date.parse(x.deletedAt) < limit;
    for (const d of (await DB.all('docs')).filter(old)) await App.Trash.purge('docs', d);
    for (const e of (await DB.all('expenses')).filter(old)) await App.Trash.purge('expenses', e);
    for (const e of (await DB.all('events')).filter(old)) await App.Trash.purge('events', e);
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
    // Chỉ giữ ký tự an toàn trong đường dẫn: mã định danh, danh sách mã — chặn chèn mã HTML qua link
    const clean = (s) => { let v = ''; try { v = decodeURIComponent(s || ''); } catch (e) { v = ''; } return v.replace(/[^A-Za-z0-9_,.|-]/g, '').slice(0, 2000); };
    const parts = path.split('/').filter(Boolean).map(clean);
    const q = {};
    (qs || '').split('&').forEach((kv) => { if (!kv) return; const i = kv.indexOf('='); const k = clean(i < 0 ? kv : kv.slice(0, i)); if (k) q[k] = clean(i < 0 ? '' : kv.slice(i + 1)); });
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
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce && document.getElementById('screen')) {
      const vt = document.startViewTransition(() => { render(true); window.scrollTo(0, 0); });
      // chuyển trang liên tiếp / tab ẩn: hiệu ứng có thể bị bỏ qua — không phải lỗi
      [vt.ready, vt.finished, vt.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
    } else { render(true); window.scrollTo(0, 0); }
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

  /* ---------- Tuỳ chỉnh giao diện (lưu trên máy) ---------- */
  const UI_DEF = { accent: 'tim', side: 'white', fixed: '1', mini: '0', motion: '1' };
  function uiPrefs() { try { return Object.assign({}, UI_DEF, JSON.parse(localStorage.getItem('ltl_ui') || '{}')); } catch (e) { return Object.assign({}, UI_DEF); } }
  function applyUI() {
    const p = uiPrefs(), h = document.documentElement;
    if (p.accent === 'tim') h.removeAttribute('data-accent'); else h.setAttribute('data-accent', p.accent);
    h.setAttribute('data-side', p.side); h.setAttribute('data-fixed', p.fixed); h.setAttribute('data-mini', p.mini); h.setAttribute('data-motion', p.motion);
  }
  function setUI(k, v) { const p = uiPrefs(); p[k] = v; try { localStorage.setItem('ltl_ui', JSON.stringify(p)); } catch (e) {} applyUI(); }
  applyUI();
  App.uiPrefs = uiPrefs;

  const ACCENTS = [['tim', '#6B3DBE', '#C2357A', 'Tím LtL'], ['hong', '#BE185D', '#E2556F', 'Hồng'], ['xanh', '#2952CC', '#0E7490', 'Xanh dương'],
    ['luc', '#047857', '#0F766E', 'Xanh lá'], ['cam', '#C2410C', '#B91C1C', 'Cam'], ['toi', '#334155', '#1E293B', 'Xanh đen']];
  const GROUPS = [
    { label: 'Quản lý', items: ['', 'tam-ung', 'chi-tieu', 'hoan-ung', 'thanh-toan', 'su-kien', 'bao-cao'] },
    { label: 'Tài khoản', items: ['ca-nhan', 'tai-khoan', 'thung-rac', 'cai-dat', 'huong-dan'] },
  ];
  const ALL = MENU.concat(MENU_MORE);
  const mOf = (r) => ALL.find((m) => m.r === r);
  App.titleOf = (name) => { const m = mOf(name); if (m) return m.label; if (name === 'phieu') return 'Phiếu đề nghị'; return 'Trang'; };

  function sidebarHTML() {
    let s = '<aside class="sidenav" id="sidenav" aria-label="Điều hướng chính">' +
      '<a class="sn-brand" href="#/"><span class="bm"><img src="assets/logo-mark.png" alt="Learn to Leap"></span><span class="bt"><b>Tạm ứng &amp; Hoàn ứng</b><small>Learn to Leap</small></span></a>' +
      '<div class="sn-hr"></div><div class="sn-scroll" id="sn-scroll"><span class="sn-pill" id="sn-pill"></span>';
    GROUPS.forEach((g) => {
      s += '<div class="sn-group">' + g.label + '</div>';
      g.items.forEach((r) => {
        const m = mOf(r); if (!m || (m.admin && !isAdmin())) return;
        s += '<a class="sn-link" data-r="' + r + '" href="#/' + r + '" title="' + m.label + '"><span class="sn-ic">' + icon(m.ic) + '</span><span class="sl">' + m.label + '</span>' +
          (m.trash ? '<span class="cnt" id="trash-cnt"' + (App.trashCount ? '' : ' hidden') + '>' + (App.trashCount || '') + '</span>' : '') + '</a>';
      });
    });
    s += '</div><div class="sn-help"><span class="hi">' + icon('help') + '</span><b>Cần trợ giúp?</b><p>Xem hướng dẫn lập phiếu &amp; quyết toán.</p>' +
      '<a class="btn white sm block" href="#/huong-dan">Hướng dẫn</a></div>' +
      '<div class="sn-out"><button class="btn ghost sm block" data-act="logout" style="justify-content:flex-start;text-transform:none;font-size:13px">' + icon('logout') + '<span class="sl">Đăng xuất</span></button></div></aside>' +
      '<div class="nav-backdrop" data-act="closeNav"></div>';
    return s;
  }
  function topbarHTML() {
    const s = App.settings || {}, u = App.cloud && App.cloud.user;
    const name = s.hoTen || (u && u.user_metadata && u.user_metadata.full_name) || (u && u.email) || 'Tài khoản';
    const role = (isAdmin() ? 'Quản trị · ' : '') + (s.boPhan || (u && u.email) || '');
    const ini = String(name).trim().split(/\s+/).slice(-2).map((w) => w.charAt(0)).join('').toUpperCase() || 'U';
    const dark = App.isDark();
    return '<header class="topbar" id="topbar">' +
      '<button class="tb-btn tb-menu" data-act="openNav" aria-label="Mở menu">' + icon('menu') + '</button>' +
      '<div class="tb-title"><div class="crumb">Trang <span>/</span> <b id="tb-crumb"></b></div><h6 id="tb-title"></h6></div>' +
      '<div class="tb-right">' +
      '<div class="gsearch" id="gsearch">' + icon('search') + '<input id="gs-in" type="search" placeholder="Tìm phiếu, khoản chi…" autocomplete="off" aria-label="Tìm kiếm"><kbd class="hide-m">Ctrl K</kbd><div class="gs-pop" id="gs-pop"></div></div>' +
      '<button class="tb-btn hide-d" data-act="openSearch" aria-label="Tìm kiếm">' + icon('search') + '</button>' +
      '<button class="tb-btn" data-act="syncNow" title="Đồng bộ dữ liệu" aria-label="Đồng bộ"><span class="sync-dot" id="sync-dot"></span></button>' +
      '<button class="tb-btn" data-act="toggleTheme" id="tb-theme" title="Đổi nền sáng / tối" aria-label="Đổi nền sáng / tối">' + icon(dark ? 'sun' : 'moon') + '</button>' +
      '<button class="tb-btn" data-act="openCfg" title="Tuỳ chỉnh giao diện" aria-label="Tuỳ chỉnh giao diện">' + icon('settings') + '</button>' +
      '<a class="who" href="#/ca-nhan" title="Hồ sơ cá nhân"><span class="av">' + esc(ini) + '</span><span class="wt"><b>' + esc(name) + '</b><small>' + esc(role) + '</small></span></a>' +
      '</div></header>';
  }
  function bottomNavHTML() {
    const it = (r) => { const m = mOf(r); return '<a data-r="' + r + '" href="#/' + r + '"><span class="bi">' + icon(m.ic) + '</span>' + m.label + '</a>'; };
    return '<nav class="bnav" aria-label="Điều hướng nhanh">' + BNAV.map(it).join('') + '<button data-act="openNav" data-r="_more"><span class="bi">' + icon('grid4') + '</span>Thêm</button></nav>';
  }
  function cfgHTML() {
    const p = uiPrefs();
    const opt = (k, v, l) => '<button class="' + (p[k] === v ? 'on' : '') + '" data-act="setUI:' + k + '=' + v + '">' + l + '</button>';
    const sw = (k, l, d) => '<label class="switch"><input type="checkbox" data-ui="' + k + '"' + (p[k] === '1' ? ' checked' : '') + '>' + l + '</label>' + (d ? '<p>' + d + '</p>' : '');
    return '<div class="cfg-h"><div><b>Tuỳ chỉnh giao diện</b><small>Chọn màu, kiểu thanh bên, hiệu ứng.</small></div><button class="tb-btn" data-act="closeCfg" style="margin-left:auto" aria-label="Đóng">' + icon('x') + '</button></div>' +
      '<div class="sn-hr"></div><div class="cfg-b">' +
      '<h6>Màu nhấn</h6><div class="swatches">' + ACCENTS.map((a) => '<button title="' + a[3] + '" aria-label="' + a[3] + '" class="' + (p.accent === a[0] ? 'on' : '') + '" data-act="setUI:accent=' + a[0] + '" style="background:linear-gradient(310deg,' + a[1] + ',' + a[2] + ')"></button>').join('') + '</div>' +
      '<h6>Kiểu thanh bên</h6><p>Chọn nền cho thanh menu bên trái.</p><div class="opt-row">' + opt('side', 'white', 'Trắng') + opt('side', 'glass', 'Trong suốt') + opt('side', 'dark', 'Tối') + '</div>' +
      '<h6>Bố cục</h6>' + sw('mini', 'Thu gọn thanh bên (chỉ icon)') + sw('fixed', 'Cố định thanh trên khi cuộn') +
      '<h6>Hiệu ứng</h6>' + sw('motion', 'Hiệu ứng chuyển cảnh & chuyển động', 'Tắt nếu máy chậm.') +
      '<h6>Chế độ</h6>' + '<label class="switch"><input type="checkbox" id="cfg-dark"' + (App.isDark() ? ' checked' : '') + '>Nền tối</label>' +
      '<div class="btn-row mt24"><button class="btn sec" data-act="resetUI">Khôi phục mặc định</button></div></div>';
  }

  // Dựng khung 1 lần; các lần chuyển trang chỉ thay nội dung + trạng thái menu
  function ensureShell() {
    if (document.getElementById('screen') && document.getElementById('sidenav') && App._shellUser === App.user && App._shellAdmin === isAdmin()) return false;
    const app = document.getElementById('app');
    app.innerHTML = '<div class="layout">' + sidebarHTML() +
      '<div class="main-wrap">' + topbarHTML() +
      '<main class="main"><div class="container" id="screen"></div></main>' +
      '<footer class="foot"><div class="fl"><img src="assets/logo-ltl-sm.png" alt="Learn to Leap"><span>© ' + new Date().getFullYear() + ' Learn to Leap · Tạm ứng · Hoàn ứng · Thanh toán (mẫu 01-TT/LTL)</span></div>' +
      '<div class="fr"><a href="#/huong-dan">Hướng dẫn</a><a href="#/bao-cao">Báo cáo</a><a href="#/cai-dat">Cấu hình</a></div></footer></div>' +
      bottomNavHTML() + '<button class="cfg-fab" data-act="openCfg" aria-label="Tuỳ chỉnh giao diện">' + icon('settings') + '</button>' +
      '<aside class="cfg" id="cfg" aria-label="Tuỳ chỉnh giao diện"></aside></div>';
    App._shellUser = App.user; App._shellAdmin = isAdmin();
    bindSearch();
    return true;
  }
  function activeRoute() {
    const cur = App.route.name;
    if (cur === 'phieu') {
      const d = App.route.parts[1] === 'moi' ? { type: App.route.parts[2] } : App.data.docs.find((x) => x.id === App.route.parts[1]);
      return ({ TU: 'tam-ung', HU: 'hoan-ung', TT: 'thanh-toan' })[d && d.type] || 'tam-ung';
    }
    return cur;
  }
  function isActive(r) { return r === activeRoute(); }
  function updateShell() {
    const ar = activeRoute();
    document.querySelectorAll('.sn-link').forEach((a) => a.classList.toggle('on', a.getAttribute('data-r') === ar));
    document.querySelectorAll('.bnav [data-r]').forEach((a) => a.classList.toggle('on', a.getAttribute('data-r') === ar || (a.getAttribute('data-r') === '_more' && !BNAV.includes(ar))));
    const title = App.route.name === 'phieu' ? (App.route.parts[1] === 'moi' ? 'Lập phiếu mới' : 'Chi tiết phiếu') : App.titleOf(App.route.name);
    const c = document.getElementById('tb-crumb'); if (c) c.textContent = App.titleOf(ar);
    const t = document.getElementById('tb-title'); if (t) t.textContent = title;
    const tc = document.getElementById('trash-cnt'); if (tc) { tc.textContent = App.trashCount || ''; tc.hidden = !App.trashCount; }
    const who = document.querySelector('.topbar .who');
    if (who) { const tmp = document.createElement('div'); tmp.innerHTML = topbarHTML(); const nw = tmp.querySelector('.who'); if (nw) who.innerHTML = nw.innerHTML; }
    const th = document.getElementById('tb-theme'); if (th) th.innerHTML = icon(App.isDark() ? 'sun' : 'moon');
    document.title = title + ' · LtL Tạm ứng & Hoàn ứng';
    movePill();
    document.body.classList.remove('nav-open');
  }
  // "viên" nền trượt tới mục menu đang chọn
  function movePill() {
    const pill = document.getElementById('sn-pill'), on = document.querySelector('.sn-link.on');
    if (!pill) return;
    if (!on) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.height = on.offsetHeight + 'px';
    pill.style.transform = 'translateY(' + on.offsetTop + 'px)';
  }
  window.addEventListener('resize', () => movePill());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill());
  window.addEventListener('load', () => setTimeout(movePill, 50));
  window.addEventListener('scroll', () => { const t = document.getElementById('topbar'); if (t) t.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });

  /* ---------- Tìm kiếm toàn cục ---------- */
  function bindSearch() {
    const inp = document.getElementById('gs-in'), pop = document.getElementById('gs-pop');
    if (!inp) return;
    let hl = -1;
    const run = () => {
      const q = U.normText(inp.value.trim());
      if (!q) { pop.classList.remove('open'); return; }
      const D = App.Docs, res = [];
      App.data.docs.forEach((d) => { if (U.normText([d.soPhieu, d.noiDung, d.nguoiDeNghi, U.groupThousand(D.total(d))].join(' ')).includes(q)) res.push({ g: 'Phiếu', ic: D.TYPES[d.type].ic, href: '#/phieu/' + d.id, t: d.soPhieu + ' · ' + (d.noiDung || ''), s: D.TYPES[d.type].label + ' · ' + U.groupThousand(D.total(d)) + ' đ' }); });
      App.data.expenses.forEach((e) => { if (U.normText([e.content, e.ghiChu, e.participants, U.groupThousand(e.amount)].join(' ')).includes(q)) res.push({ g: 'Khoản chi', ic: 'receipt', href: '#/chi-tieu/' + e.eventId, t: e.content, s: U.fmtDate(e.date) + ' · ' + U.groupThousand(e.amount) + ' đ' }); });
      App.data.events.forEach((e) => { if (U.normText(e.name).includes(q)) res.push({ g: 'Sự kiện', ic: 'calendar', href: '#/chi-tieu/' + e.id, t: e.name, s: e.date ? U.fmtDate(e.date) : '' }); });
      ALL.forEach((m) => { if (m.r != null && U.normText(m.label).includes(q) && (!m.admin || isAdmin())) res.push({ g: 'Trang', ic: m.ic, href: '#/' + m.r, t: m.label, s: 'Mở trang' }); });
      hl = -1;
      if (!res.length) { pop.innerHTML = '<div class="ge">Không tìm thấy “' + esc(inp.value) + '”</div>'; pop.classList.add('open'); return; }
      let g = '', h = '';
      res.slice(0, 14).forEach((r) => { if (r.g !== g) { g = r.g; h += '<div class="gh">' + g + '</div>'; } h += '<a href="' + r.href + '"><span class="gi">' + icon(r.ic) + '</span><span style="min-width:0"><b>' + esc(r.t) + '</b><small>' + esc(r.s) + '</small></span></a>'; });
      pop.innerHTML = h; pop.classList.add('open');
    };
    inp.addEventListener('input', run);
    inp.addEventListener('focus', run);
    inp.addEventListener('keydown', (e) => {
      const links = pop.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links.forEach((a, i) => a.classList.toggle('hl', i === hl)); }
      else if (e.key === 'Enter' && links.length) { (links[hl] || links[0]).click(); }
      else if (e.key === 'Escape') { inp.value = ''; pop.classList.remove('open'); inp.blur(); e.stopPropagation(); }
    });
    pop.addEventListener('click', (e) => { if (e.target.closest('a')) { inp.value = ''; pop.classList.remove('open'); document.getElementById('gsearch').classList.remove('open'); } });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#gsearch') && !e.target.closest('[data-act=openSearch]')) { pop.classList.remove('open'); document.getElementById('gsearch') && document.getElementById('gsearch').classList.remove('open'); } });
  }
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && document.getElementById('gs-in')) { e.preventDefault(); App.actions.openSearch(); }
  });

  function render(anim) {
    Object.values(App.charts).forEach((c) => { try { c.destroy(); } catch (e) {} });
    App.charts = {};
    if (!App.user) { App._shellUser = null; if (App.screens.login) App.screens.login(document.getElementById('app')); return; }
    ensureShell();
    const screen = document.getElementById('screen');
    screen.className = 'container' + (anim && uiPrefs().motion !== '0' ? ' stagger' : '');
    const name = App.route.name;
    if (App.Sel) App.Sel.reset();
    const R = App.screens[name === '' ? 'dashboard' : name];
    if (R) {
      try { R(screen, App.route); }
      catch (e) { console.error(e); screen.innerHTML = errorBox(e); }
    } else {
      screen.innerHTML = '<div class="card"><div class="empty"><div class="eic">' + icon('alert') + '</div><div class="et">Không tìm thấy trang</div>' +
        '<div class="es">Đường dẫn không tồn tại.</div><a class="btn" href="#/">Về Tổng quan</a></div></div>';
    }
    updateShell();
    if (anim) countUp(screen);
    if (App.cloud) App.cloud.updateBadge();
  }
  // số liệu chạy từ 0 lên khi mở trang
  function countUp(root) {
    if (uiPrefs().motion === '0') return;
    root.querySelectorAll('.kpi .v, .stat4 .sv, .hstats b').forEach((el) => {
      const txt = el.textContent; const m = txt.match(/^(−|-)?([\d.]+)(.*)$/);
      if (!m) return; const target = U.toNumber(m[2]); if (!target || target < 10) return;
      const t0 = performance.now(), dur = 900;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.firstChild && el.firstChild.nodeType === 3 ? (el.firstChild.nodeValue = (m[1] || '') + U.groupThousand(Math.round(target * e)) + m[3]) : null;
        if (k < 1) requestAnimationFrame(step); };
      if (el.firstChild && el.firstChild.nodeType === 3) requestAnimationFrame(step);
    });
  }
  App.render = render;
  function errorBox(e) {
    return '<div class="alert danger">' + icon('alert') + '<div><b>Có lỗi khi hiển thị trang.</b><br>' + esc(e && e.message || e) + '</div></div>';
  }

  function closeMenus() {
    document.querySelectorAll('.menu-pop.open').forEach((p) => p.classList.remove('open'));
  }
  // hiệu ứng gợn sóng khi bấm nút / mục menu
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn,.sn-link,.tb-btn,.kpi,.bnav a,.bnav button,.catchip,.menu-grid a,.menu-grid button,.fab,.seg button');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(); const s = Math.max(r.width, r.height);
    const sp = document.createElement('span'); sp.className = 'ripple';
    sp.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(sp); setTimeout(() => sp.remove(), 600);
  });
  document.addEventListener('pointerdown', (e) => {
    const pop = document.querySelector('.menu-pop.open');
    if (pop && !e.target.closest('.nav-more')) pop.classList.remove('open');
  });

  /* ----------------------------- Trang tiêu đề dùng chung ----------------------------- */
  App.pageHead = function (title, sub, actions, crumbs, ic) {
    return (crumbs ? '<div class="crumbs">' + crumbs + '</div>' : '') +
      '<div class="page-h"><div class="ph-l"><span class="page-ic">' + icon(ic || App.routeIcon(App.route.name)) + '</span><div style="min-width:0"><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div></div>' +
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
    try { await purgeOldTrash(); } catch (e) { console.warn(e); }
    await go();
  };
  App.afterLogout = function () {
    App.user = null;
    App.data = { events: [], docs: [], expenses: [], images: [] };
    if (location.hash) history.replaceState(null, '', location.pathname);
    render();
  };

  // công tắc trong bảng tuỳ chỉnh
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-ui]')) {
      setUI(t.getAttribute('data-ui'), t.checked ? '1' : '0');
      setTimeout(movePill, 320);
    } else if (t.id === 'cfg-dark') {
      try { localStorage.setItem('ltl_theme', t.checked ? 'dark' : 'light'); } catch (er) {}
      applyTheme(); render();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    const c = document.getElementById('cfg');
    if (c && c.classList.contains('open') && !e.target.closest('#cfg') && !e.target.closest('[data-act=openCfg]')) c.classList.remove('open');
  });

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
    openNav() { document.body.classList.add('nav-open'); },
    closeNav() { document.body.classList.remove('nav-open'); },
    openSearch() { const g = document.getElementById('gsearch'); if (!g) return; g.classList.add('open'); const i = document.getElementById('gs-in'); i.focus(); i.select(); },
    openCfg() { const c = document.getElementById('cfg'); if (!c) return; c.innerHTML = cfgHTML(); requestAnimationFrame(() => c.classList.add('open')); },
    closeCfg() { const c = document.getElementById('cfg'); if (c) c.classList.remove('open'); },
    setUI(arg) { const [k, v] = arg.split('='); setUI(k, v); const c = document.getElementById('cfg'); if (c) c.innerHTML = cfgHTML(); movePill(); if (k === 'accent') render(); },
    resetUI() { try { localStorage.removeItem('ltl_ui'); } catch (e) {} applyUI(); const c = document.getElementById('cfg'); if (c) c.innerHTML = cfgHTML(); render(); },
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
