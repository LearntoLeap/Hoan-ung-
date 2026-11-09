/* =========================================================================
   app.js — Learn to Leap · Tạm ứng & Hoàn ứng (mobile-first)
   ========================================================================= */
(function () {
  'use strict';

  /* ----------------------------- State ----------------------------- */
  const App = {
    settings: null,
    events: [],
    tab: 'dashboard',
    currentEventId: localStorage.getItem('ltl_event') || null,
    view: {},          // dữ liệu cho màn hình hiện tại
    urls: {},          // imageId -> objectURL
    charts: {},
    draftExpense: null,
    draftAdvance: null,
  };
  window.App = App;

  const TABS = {
    dashboard: { ic: 'grid',    label: 'Tổng quan',  scoped: false, desc: 'Số liệu tổng hợp tất cả sự kiện' },
    advance:   { ic: 'file',    label: 'Tạm ứng',    scoped: true,  desc: 'Giấy đề nghị tạm ứng' },
    expenses:  { ic: 'receipt', label: 'Chi tiêu',   scoped: true,  desc: 'Khoản chi & chứng từ' },
    refund:    { ic: 'wallet',  label: 'Hoàn ứng',   scoped: true,  desc: 'Quyết toán hoàn ứng' },
    payment:   { ic: 'calc',    label: 'Thanh toán', scoped: true,  desc: 'Đề nghị thanh toán' },
  };

  /* ----------------------------- Icons (SVG nét, offline) ----------------------------- */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    receipt: '<path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z"/><path d="M9 9h6M9 13h6"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5z"/><circle cx="16.5" cy="12" r=".6"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    cloud: '<path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  };
  function icon(name, size) {
    size = size || 18;
    return '<svg class="ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  App.icon = icon;

  const CATEGORIES = ['Di chuyển', 'Vận chuyển', 'Ăn uống', 'Vật tư / Thiết bị', 'Thuê địa điểm', 'In ấn', 'Lưu trú', 'Khác'];

  const DEFAULT_SETTINGS = {
    id: 'app',
    company: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC LEARN TO LEAP',
    companyAddr: 'Tầng 6, Toà nhà IPH, 241 Xuân Thuỷ, Cầu Giấy, TP. Hà Nội',
    director: 'Lê Văn Trí', directorTU: 'GIÁM ĐỐC', directorHU: 'TỔNG GIÁM ĐỐC',
    accountant: 'Phan Thị Thảo', accountantTU: 'KẾ TOÁN', accountantHU: 'KẾ TOÁN TRƯỞNG',
    requester: 'Lê Ngọc Giáp', dept: 'Phòng Chuyên môn', position: 'Lead Chuyên môn',
  };

  /* ----------------------------- Lib loader ----------------------------- */
  const LIBS = {
    docx: { src: 'lib/docx.js', g: 'docx' },
    xlsx: { src: 'lib/xlsx.full.min.js', g: 'XLSX' },
    chart: { src: 'lib/chart.umd.min.js', g: 'Chart' },
    jspdf: { src: 'lib/jspdf.umd.min.js', g: 'jspdf' },
    html2canvas: { src: 'lib/html2canvas.min.js', g: 'html2canvas' },
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
      s.onerror = () => rej(new Error('Không tải được thư viện: ' + L.src));
      document.head.appendChild(s);
    });
    return _libP[name];
  }
  App.ensureLib = ensureLib;

  /* ----------------------------- Helpers ----------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = U.esc;

  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.innerHTML = (type === 'ok' ? '✓ ' : type === 'err' ? '⚠ ' : '') + esc(msg);
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; t.style.transition = '.3s'; }, 2200);
    setTimeout(() => t.remove(), 2600);
  }
  App.toast = toast;

  // Sheet stack
  function openSheet(html, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'overlay' + (opts.center ? ' center' : '');
    ov.innerHTML = '<div class="sheet ' + (opts.center ? 'center' : '') + '">' +
      (opts.center ? '' : '<div class="grip"></div>') + html + '</div>';
    root.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov && opts.dismiss !== false) closeSheet(ov); });
    requestAnimationFrame(() => ov.classList.add('show'));
    return ov;
  }
  function closeSheet(ov) {
    if (!ov) { const all = document.querySelectorAll('#modal-root .overlay'); ov = all[all.length - 1]; }
    if (!ov) return;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 240);
  }
  App.openSheet = openSheet; App.closeSheet = closeSheet;

  function confirmSheet(title, msg, onYes, danger) {
    const ov = openSheet(
      '<div class="sheet-h"><div class="st">' + esc(title) + '</div></div>' +
      '<p class="muted" style="margin:0 0 18px">' + esc(msg) + '</p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-line" data-act="closeTop">Huỷ</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cf-yes">Đồng ý</button></div>',
      { center: true });
    $('#cf-yes', ov).addEventListener('click', () => { closeSheet(ov); onYes && onYes(); });
  }
  App.confirmSheet = confirmSheet;

  function imgURL(img) {
    if (!img) return null;
    if (App.urls[img.id]) return App.urls[img.id];
    const u = URL.createObjectURL(img.blob);
    App.urls[img.id] = u;
    return u;
  }
  App.imgURL = imgURL;

  /* ----------------------------- Data loading ----------------------------- */
  function currentEvent() { return App.events.find((e) => e.id === App.currentEventId) || null; }
  App.currentEvent = currentEvent;

  async function loadData() {
    App.events = await DB.all('events');
    App.events.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (App.currentEventId && !App.events.some((e) => e.id === App.currentEventId)) App.currentEventId = null;
    if (!App.currentEventId && App.events.length) App.currentEventId = App.events[0].id;

    const v = {};
    if (App.tab === 'dashboard') {
      const [adv, exp, imgs] = await Promise.all([DB.all('advances'), DB.all('expenses'), DB.all('images')]);
      v.advances = adv; v.expenses = exp; v.images = imgs;
    } else if (App.currentEventId) {
      const ev = App.currentEventId;
      const [advs, exps, imgs] = await Promise.all([
        DB.byIndex('advances', 'eventId', ev),
        DB.byIndex('expenses', 'eventId', ev),
        DB.byIndex('images', 'eventId', ev),
      ]);
      v.advance = advs[0] || null;
      v.expenses = exps.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
      v.images = imgs;
    }
    App.view = v;
  }

  function imagesByExpense(images) {
    const m = {};
    (images || []).forEach((im) => { if (im.expenseId) (m[im.expenseId] = m[im.expenseId] || []).push(im); });
    return m;
  }
  App.imagesByExpense = imagesByExpense;

  function eventFiles(images, docType) {
    return (images || []).filter((im) => !im.expenseId && (!docType || im.docType === docType));
  }
  App.eventFiles = eventFiles;

  /* ----------------------------- Computations ----------------------------- */
  // vatType của khoản chi: 'vat' (hoá đơn VAT) | 'bill' (hoá đơn bán lẻ) | 'none'.
  // "Có hoá đơn" = chỉ tính khi vatType === 'vat'.
  function vatTypeOf(e) {
    const t = e && e.vatType;
    return t === 'vat' || t === 'bill' ? t : 'none';
  }
  App.vatTypeOf = vatTypeOf;

  function computeEvent(ev, advance, expenses, images) {
    const exps = expenses || [];
    const advanceTotal = advance ? (advance.items || []).reduce((s, it) => s + U.toNumber(it.amount), 0) : 0;
    const prevBalance = U.toNumber(ev && ev.prevBalance);
    const spentTotal = exps.reduce((s, e) => s + U.toNumber(e.amount), 0);
    const remaining = advanceTotal + prevBalance - spentTotal;
    const byExp = imagesByExpense(images);
    const sum = (arr) => arr.reduce((s, e) => s + U.toNumber(e.amount), 0);

    const withImages = exps.filter((e) => (byExp[e.id] || []).length > 0);
    const vat = exps.filter((e) => vatTypeOf(e) === 'vat');
    const bill = exps.filter((e) => vatTypeOf(e) === 'bill');
    const vatAmount = sum(vat), billAmount = sum(bill), imgAmount = sum(withImages);
    const count = exps.length;
    const pc = (n) => count ? Math.round(n / count * 100) : 0;
    const pa = (n) => spentTotal ? Math.round(n / spentTotal * 100) : 0;

    return {
      advanceTotal, prevBalance, spentTotal, remaining,
      count,
      // minh chứng ảnh đính kèm (bất kỳ ảnh nào)
      withImagesCount: withImages.length, imgAmount,
      pctImages: pc(withImages.length), pctImagesAmount: pa(imgAmount),
      // phân loại hoá đơn
      vatCount: vat.length, billCount: bill.length, noneCount: count - vat.length - bill.length,
      vatAmount, billAmount,
      pctVat: pc(vat.length), pctBill: pc(bill.length),
      pctVatAmount: pa(vatAmount), pctBillAmount: pa(billAmount),
      // alias tương thích ngược: "có hoá đơn" = VAT
      withProofCount: vat.length, pctCount: pc(vat.length), pctAmount: pa(vatAmount),
    };
  }
  App.computeEvent = computeEvent;

  /* ----------------------------- Render shell ----------------------------- */
  function render() {
    // dọn charts cũ
    Object.values(App.charts).forEach((c) => { try { c.destroy(); } catch (e) {} });
    App.charts = {};

    const app = document.getElementById('app');
    app.innerHTML = topbarHTML() + '<div class="screen fade-in" id="screen" data-tab="' + App.tab + '"></div>' + bottomnavHTML();
    const screen = document.getElementById('screen');

    const R = App.screens[App.tab];
    if (R) R(screen);

    if (App.cloud && App.cloud.updateBadge) App.cloud.updateBadge();

    // FAB chỉ ở màn Chi tiêu
    const oldFab = document.getElementById('fab'); if (oldFab) oldFab.remove();
    if (App.tab === 'expenses' && App.currentEventId) {
      const fab = document.createElement('button');
      fab.id = 'fab'; fab.className = 'fab'; fab.title = 'Chụp bill nhanh';
      fab.setAttribute('data-act', 'quickCapture'); fab.innerHTML = icon('camera', 24);
      document.body.appendChild(fab);
    }
  }
  App.render = render;

  function topbarHTML() {
    const ev = currentEvent();
    const scoped = TABS[App.tab].scoped;
    const t = TABS[App.tab];
    let evbar = '';
    if (scoped) {
      evbar = '<div class="evbar"><button class="evpick" data-act="openEvents" title="Chọn sự kiện">' +
        '<span class="ev-ic">' + icon('calendar', 16) + '</span>' +
        '<span class="ev-txt"><span class="ev-lab">Sự kiện</span>' +
        '<span class="ev-name">' + (ev ? esc(ev.name) : 'Chọn / tạo sự kiện') + '</span></span>' +
        (ev ? '<span class="ev-meta">' + esc(U.fmtDate(ev.date)) + '</span>' : '') +
        '<span class="chev">' + icon('chevron', 16) + '</span></button>' +
        '<button class="icon-btn accent" data-act="addEvent" title="Thêm sự kiện">' + icon('plus') + '</button></div>';
    }
    return '<header class="topbar">' +
      '<div class="brand">' +
      '<img class="logo-mark" src="assets/logo-mark-white.png" alt="Learn to Leap" width="32" height="32" decoding="async">' +
      '<div class="page-h"><div class="crumb">Learn to Leap <span>/</span> Tạm ứng & Hoàn ứng <span>/</span> <b>' + esc(t.label) + '</b></div>' +
      '<div class="ttl">Tạm ứng & Hoàn ứng</div><div class="ttl-sub">Learn to Leap · ' + esc(t.label) + '</div></div>' +
      '<div class="top-actions">' +
      '<button class="icon-btn" id="cloud-badge" data-act="openAccount" title="Tài khoản & Đồng bộ">' + icon('cloud') + '<i class="dot"></i></button>' +
      '<button class="icon-btn" data-act="openEvents" title="Sự kiện">' + icon('calendar') + '</button>' +
      '<button class="icon-btn" data-act="openSettings" title="Cài đặt">' + icon('settings') + '</button>' +
      '</div></div>' + evbar + '</header>';
  }

  function bottomnavHTML() {
    let s = '<nav class="bottomnav">';
    // Sidebar brand (desktop only — hidden on phone)
    s += '<div class="nav-head">' +
      '<img class="nav-logo" src="assets/logo-mark-white.png" alt="" width="34" height="34">' +
      '<div class="nav-bd"><div class="nav-ttl">Learn to Leap</div>' +
      '<div class="nav-sub">Tạm ứng · Hoàn ứng</div></div></div>';
    s += '<div class="nav-group">Quản lý</div><div class="nav-list">';
    Object.keys(TABS).forEach((k) => {
      const t = TABS[k];
      s += '<button class="navb ' + (App.tab === k ? 'active' : '') + '" data-act="tab:' + k + '" title="' + esc(t.desc) + '">' +
        '<span class="ni">' + icon(t.ic, 20) + '</span><span class="nl">' + t.label + '</span></button>';
    });
    s += '</div>';
    // Sidebar footer (desktop only)
    s += '<div class="nav-foot">' +
      '<button class="nf-row" data-act="openEvents">' + icon('calendar') + '<span>Danh sách sự kiện</span></button>' +
      '<button class="nf-row" data-act="helpSheet">' + icon('help') + '<span>Hướng dẫn sử dụng</span></button>' +
      '<button class="nf-row" data-act="openSettings">' + icon('settings') + '<span>Cài đặt</span></button>' +
      '<button class="nf-acc" data-act="openAccount"><i class="dot"></i><span class="nf-acc-b"><b>Đồng bộ đám mây</b>' +
      '<span id="cloud-text">Chưa kết nối</span></span></button>' +
      '</div>';
    return s + '</nav>';
  }

  App.screens = {}; // điền ở các file/đoạn sau

  /* ----------------------------- Robot mascot (SVG, offline) ----------------------------- */
  // Dùng currentColor để tự đổi màu theo nền (trắng trên hero tím, tím trên thẻ trắng).
  App.robot = function (size, cls) {
    size = size || 64;
    return '<svg class="robot ' + (cls || '') + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
      '<line x1="32" y1="4" x2="32" y2="13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<circle cx="32" cy="4" r="3" fill="currentColor" class="r-ant"/>' +
      '<rect x="5.5" y="27" width="6" height="13" rx="3" fill="currentColor" opacity=".5"/>' +
      '<rect x="52.5" y="27" width="6" height="13" rx="3" fill="currentColor" opacity=".5"/>' +
      '<rect x="12" y="13" width="40" height="38" rx="13" fill="currentColor" opacity=".15"/>' +
      '<rect x="12" y="13" width="40" height="38" rx="13" stroke="currentColor" stroke-width="2.6"/>' +
      '<rect x="18.5" y="20" width="27" height="18" rx="7" fill="currentColor" opacity=".22"/>' +
      '<circle cx="26" cy="29" r="3.3" fill="currentColor" class="r-eye"/>' +
      '<circle cx="38" cy="29" r="3.3" fill="currentColor" class="r-eye"/>' +
      '<path d="M25.5 43.5 q6.5 5 13 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  };

  /* ----------------------------- Navigation ----------------------------- */
  async function go(tab) {
    if (tab) App.tab = tab;
    await loadData();
    render();
    window.scrollTo(0, 0);
  }
  App.go = go;
  App.reload = () => go(App.tab);

  /* ----------------------------- Init ----------------------------- */
  // Đọc (hoặc tạo mặc định) cài đặt vào App.settings. Dùng lại khi đổi tài khoản.
  async function ensureSettings() {
    let s = await DB.get('settings', 'app');
    if (!s) { s = Object.assign({}, DEFAULT_SETTINGS); await DB.put('settings', s); }
    App.settings = s;
    return s;
  }
  App.ensureSettings = ensureSettings;

  async function init() {
    try {
      await ensureSettings();
    } catch (e) {
      document.getElementById('app').innerHTML =
        '<div class="screen"><div class="empty"><div class="ic">⚠️</div><div class="et">Không mở được bộ nhớ</div>' +
        '<div class="es">Trình duyệt đang chặn lưu trữ. Hãy tắt chế độ ẩn danh và thử lại.</div></div></div>';
      return;
    }
    await go(App.tab);
    if (App.cloud) App.cloud.init();
  }

  // dispatch click
  document.addEventListener('click', (e) => {
    const node = e.target.closest('[data-act]');
    if (!node) return;
    const raw = node.getAttribute('data-act');
    const i = raw.indexOf(':');
    const act = i < 0 ? raw : raw.slice(0, i);
    const arg = i < 0 ? '' : raw.slice(i + 1);
    const fn = App.actions[act];
    if (fn) { e.preventDefault(); fn(arg, node, e); }
  });

  App.actions = {
    tab: (t) => go(t),
    closeTop: () => closeSheet(),
  };

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
