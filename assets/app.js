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
    dashboard: { ic: '📊', label: 'Tổng quan', scoped: false },
    advance:   { ic: '📝', label: 'Tạm ứng',  scoped: true },
    expenses:  { ic: '🧾', label: 'Chi tiêu',  scoped: true },
    refund:    { ic: '💰', label: 'Hoàn ứng',  scoped: true },
    payment:   { ic: '🧮', label: 'Thanh toán', scoped: true },
  };

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
      fab.setAttribute('data-act', 'quickCapture'); fab.innerHTML = '📷';
      document.body.appendChild(fab);
    }
  }
  App.render = render;

  function topbarHTML() {
    const ev = currentEvent();
    const scoped = TABS[App.tab].scoped;
    let evbar = '';
    if (scoped) {
      evbar = '<div class="evbar"><div class="evpick" data-act="openEvents">' +
        '<span class="ev-ic">📅</span>' +
        '<span class="ev-name">' + (ev ? esc(ev.name) : 'Chọn / tạo sự kiện') + '</span>' +
        (ev ? '<span class="ev-meta">' + esc(U.fmtDate(ev.date)) + '</span>' : '') +
        '<span class="chev">▾</span></div>' +
        '<button class="icon-btn" data-act="addEvent" title="Thêm sự kiện">＋</button></div>';
    }
    return '<div class="topbar">' +
      '<div class="brand">' +
      '<img class="logo-mark" src="assets/logo-mark-white.png" alt="Learn to Leap" width="38" height="38" decoding="async">' +
      '<div><div class="ttl">Tạm ứng & Hoàn ứng</div><div class="sub">Learn to Leap</div></div>' +
      '<div class="brand-bot">' + App.robot(30, 'robot-float') + '</div>' +
      '<div class="top-actions">' +
      '<button class="icon-btn" id="cloud-badge" data-act="openAccount" title="Tài khoản & Đồng bộ">☁️</button>' +
      '<button class="icon-btn" data-act="openEvents" title="Sự kiện">📅</button>' +
      '<button class="icon-btn" data-act="openSettings" title="Cài đặt">⚙️</button>' +
      '</div></div>' + evbar + '</div>';
  }

  function bottomnavHTML() {
    let s = '<nav class="bottomnav">';
    // Sidebar brand + mascot (desktop only — hidden on phone)
    s += '<div class="nav-head">' +
      '<div class="nav-bot">' + App.robot(38, 'robot-float') + '</div>' +
      '<div class="nav-bd"><div class="nav-ttl">Learn to Leap</div>' +
      '<div class="nav-sub">Trợ lý chi tiêu</div></div></div>';
    s += '<div class="nav-list">';
    Object.keys(TABS).forEach((k) => {
      const t = TABS[k];
      s += '<button class="navb ' + (App.tab === k ? 'active' : '') + '" data-act="tab:' + k + '">' +
        '<span class="ni">' + t.ic + '</span><span>' + t.label + '</span></button>';
    });
    s += '</div>';
    // Sidebar footer mascot tip (desktop only)
    s += '<div class="nav-foot"><div class="nf-bot">' + App.robot(40, 'robot-float') + '</div>' +
      '<div class="nf-tip"><b>Mẹo nhỏ</b>Chụp hoá đơn ngay khi chi để không quên minh chứng.</div></div>';
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
