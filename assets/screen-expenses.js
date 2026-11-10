/* =========================================================================
   screen-expenses.js — Chi tiêu & minh chứng theo sự kiện / đợt chi:
   camera trực tiếp, ảnh từ thư viện, phân loại hoá đơn, lập phiếu từ khoản chi.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';

  App.CATEGORIES = ['Di chuyển', 'Vận chuyển', 'Ăn uống', 'Vật tư / Thiết bị', 'Thuê địa điểm', 'In ấn', 'Lưu trú', 'Khác'];
  App.VAT_TYPES = [{ v: 'none', t: 'Không có hoá đơn' }, { v: 'bill', t: 'Hoá đơn bán lẻ (bill)' }, { v: 'vat', t: 'Hoá đơn VAT' }];
  App.vatBadge = function (e) {
    const t = App.vatTypeOf(e);
    if (t === 'vat') return '<span class="badge ok">VAT</span>';
    if (t === 'bill') return '<span class="badge primary">Bill</span>';
    return '<span class="badge warn">Chưa có HĐ</span>';
  };

  /* ----------------- Camera trực tiếp ----------------- */
  let camStream = null, camFacing = 'environment';
  function stopCam() { if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; } }
  function openCamera(onCapture) {
    const root = document.getElementById('modal-root');
    const cam = document.createElement('div');
    cam.className = 'cam';
    cam.innerHTML =
      '<div class="cam-top"><button class="cbtn" id="cam-x" aria-label="Đóng">' + I('x') + '</button><button class="cbtn" id="cam-flip" aria-label="Đổi camera">' + I('refresh') + '</button></div>' +
      '<video id="cam-v" autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="cam-bot"><button class="cbtn" id="cam-lib" aria-label="Chọn từ thư viện">' + I('image') + '</button>' +
      '<button class="shutter" id="cam-shot" aria-label="Chụp"></button><div style="width:46px"></div></div>';
    root.appendChild(cam);
    const video = cam.querySelector('#cam-v');
    const close = () => { stopCam(); cam.remove(); };
    cam.querySelector('#cam-x').onclick = close;
    cam.querySelector('#cam-lib').onclick = async () => { close(); const fs = await App.pickFiles('image/*,video/*', true); if (fs.length) onCapture(fs); };
    cam.querySelector('#cam-flip').onclick = () => { camFacing = camFacing === 'environment' ? 'user' : 'environment'; start(); };
    cam.querySelector('#cam-shot').onclick = () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      const fl = cam.querySelector('.flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
      if (navigator.vibrate) navigator.vibrate(30);
      c.toBlob((blob) => { if (blob) { onCapture([blob]); App.toast('Đã chụp', 'ok'); } }, 'image/jpeg', 0.88);
    };
    function start() {
      stopCam();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fallback('Thiết bị không hỗ trợ camera trực tiếp.'); return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: camFacing }, width: { ideal: 1920 } }, audio: false })
        .then((s) => { camStream = s; video.srcObject = s; })
        .catch(() => fallback('Không truy cập được camera. Hãy cấp quyền hoặc chọn ảnh từ thư viện.'));
    }
    function fallback(msg) {
      video.style.display = 'none';
      if (!cam.querySelector('.cam-msg')) {
        const m = document.createElement('div'); m.className = 'cam-msg';
        m.innerHTML = esc(msg) + '<br><br><button class="btn" id="cam-lib2">Chọn từ thư viện</button>';
        cam.insertBefore(m, cam.querySelector('.cam-bot'));
        m.querySelector('#cam-lib2').onclick = cam.querySelector('#cam-lib').onclick;
      }
    }
    start();
  }
  App.openCamera = openCamera;

  function currentEventId(route) {
    const id = route.parts[1] || localStorage.getItem('ltl_event') || '';
    if (id && App.eventById(id)) return id;
    return App.data.events[0] ? App.data.events[0].id : '';
  }
  App.statsOfEvent = function (evId) {
    const exps = App.expensesOf(evId);
    const byExp = App.imagesByExpense();
    const sum = (a) => a.reduce((s, e) => s + U.toNumber(e.amount), 0);
    const spent = sum(exps);
    const vat = exps.filter((e) => App.vatTypeOf(e) === 'vat'), bill = exps.filter((e) => App.vatTypeOf(e) === 'bill');
    const docs = App.data.docs.filter((d) => d.eventId === evId);
    const t = (type) => docs.filter((d) => d.type === type).reduce((s, d) => s + App.Docs.total(d), 0);
    return {
      count: exps.length, spent, vatAmt: sum(vat), billAmt: sum(bill), vatCount: vat.length, billCount: bill.length,
      noProof: exps.filter((e) => !(byExp[e.id] || []).length).length,
      pctVat: spent ? Math.round(sum(vat) / spent * 100) : 0,
      tu: t('TU'), hu: t('HU'), tt: t('TT'),
    };
  };

  /* ----------------- Màn hình ----------------- */
  App.screens['chi-tieu'] = function (root, route) {
    if (!App.data.events.length) {
      root.innerHTML = App.pageHead('Chi tiêu & minh chứng', 'Ghi từng khoản chi, chụp bill, phân loại hoá đơn — rồi lập phiếu hoàn ứng / thanh toán từ đây.') +
        '<div class="card"><div class="card-b" style="max-width:560px;margin:auto;text-align:center;padding:36px 20px"><div class="eic" style="margin:0 auto 10px">' + I('calendar') + '</div><b>Gõ tên sự kiện / đợt chi để bắt đầu</b>' +
        '<p class="muted" style="font-size:13px">VD: “Ngày hội STEM Cầu Giấy”, “Chi phí vận chuyển T11”. Đợt chi được tạo và lưu ngay.</p>' +
        '<div class="row" style="flex-wrap:nowrap;gap:8px;justify-content:center"><input class="input" id="ct-new-ev" placeholder="Tên đợt chi…" style="max-width:340px"><button class="btn" data-act="ctNewEvent">' + I('plus') + 'Tạo</button></div></div></div>';
      setTimeout(() => { const i = document.getElementById('ct-new-ev'); if (i) i.onkeydown = (e) => { if (e.key === 'Enter') App.actions.ctNewEvent(); }; }, 0);
      return;
    }
    const evId = currentEventId(route);
    localStorage.setItem('ltl_event', evId);
    const ev = App.eventById(evId);
    const exps = App.expensesOf(evId);
    const byExp = App.imagesByExpense();
    const m = App.statsOfEvent(evId);
    if (!App.expFilter || App.expFilter.ev !== evId) App.expFilter = { ev: evId, cat: 'all', q: '' };
    const f = App.expFilter;
    const catCounts = {};
    exps.forEach((e) => { const c = e.category || 'Khác'; catCounts[c] = (catCounts[c] || 0) + 1; });

    const matches = (e) => {
      if (f.cat !== 'all' && (e.category || 'Khác') !== f.cat) return false;
      if (f.q) { const hay = U.normText([e.content, e.transferNote, e.ghiChu, e.participants, e.category, U.groupThousand(e.amount)].join(' ')); if (hay.indexOf(U.normText(f.q)) < 0) return false; }
      return true;
    };
    const itemHTML = (e) => {
      const imgs = byExp[e.id] || []; const th = imgs.find((x) => x.kind === 'image' && x.blob);
      return '<div class="exp" data-act="editExpense:' + e.id + '"><label class="chk" title="Chọn"><input type="checkbox" class="selc" value="' + e.id + '" aria-label="Chọn khoản chi"></label>' +
        '<div class="thumb"' + (th ? ' data-act="expPhotos:' + e.id + '" title="Xem ảnh" style="cursor:zoom-in"' : '') + '>' + (th ? '<img src="' + App.imgURL(th) + '" alt="">' + (imgs.length > 1 ? '<span class="n">+' + (imgs.length - 1) + '</span>' : '') : I('receipt')) + '</div>' +
        '<div class="body"><div class="top"><div class="title">' + esc(e.content || '(chưa có nội dung)') + '</div><div class="amt">' + money(e.amount) + '</div></div>' +
        '<div class="meta"><span>' + esc(U.fmtDate(e.date)) + '</span>' + App.vatBadge(e) +
        (imgs.length ? '<span class="badge out">' + I('image', 12) + imgs.length + ' ảnh</span>' : '<span class="badge warn">Thiếu ảnh</span>') +
        '<span>· ' + esc(e.category || 'Khác') + '</span>' + (e.participants ? '<span>· ' + esc(e.participants) + '</span>' : '') + '</div>' +
        (e.ghiChu || e.transferNote ? '<div class="note">' + esc([e.ghiChu, e.transferNote].filter(Boolean).join(' · ')) + '</div>' : '') + '</div></div>';
    };
    const listHTML = () => {
      if (!exps.length) return App.emptyState('receipt', 'Chưa có khoản chi', 'Bấm “Thêm khoản chi” hoặc “Chụp bill” để ghi khoản chi đầu tiên.');
      const items = exps.filter(matches);
      if (!items.length) return App.emptyState('search', 'Không tìm thấy khoản chi', 'Thử từ khoá khác hoặc chọn “Tất cả”.');
      return items.map(itemHTML).join('') + '<div class="kv" style="padding:12px 16px;border-top:1px solid hsl(var(--vien))"><div class="k">Cộng ' + items.length + ' khoản</div><div class="v">' + money(items.reduce((s, e) => s + U.toNumber(e.amount), 0)) + '</div></div>';
    };
    const chips = () => {
      const chip = (k, l, n) => '<button class="catchip' + (f.cat === k ? ' active' : '') + '" data-act="expFilterCat:' + esc(k) + '">' + esc(l) + '<span class="cc">' + n + '</span></button>';
      return chip('all', 'Tất cả', exps.length) + App.CATEGORIES.filter((c) => catCounts[c]).map((c) => chip(c, c, catCounts[c])).join('');
    };

    root.innerHTML = App.pageHead('Chi tiêu & minh chứng', esc(ev.name) + (ev.date ? ' · ' + esc(U.fmtDate(ev.date)) : '') + (ev.location ? ' · ' + esc(ev.location) : ''),
      '<a class="btn out" href="#/phieu/moi/HU?event=' + evId + '">' + I('wallet') + 'Lập phiếu hoàn ứng</a>' +
      '<a class="btn out" href="#/phieu/moi/TT?event=' + evId + '">' + I('calc') + 'Lập phiếu thanh toán</a>' +
      '<button class="btn out" data-act="bulkExpense">' + I('list') + 'Nhập nhiều khoản</button>' +
      '<button class="btn" data-act="addExpense">' + I('plus') + 'Thêm khoản chi</button>') +
      '<div class="row" style="margin:-6px 0 16px;flex-wrap:nowrap">' +
      '<div style="flex:1;max-width:460px"><label class="sr" for="ct-ev">Đợt chi</label><input class="input" id="ct-ev" list="ct-ev-dl" autocomplete="off" value="' + esc(ev.name) + '" title="Chọn hoặc gõ tên đợt chi mới rồi Enter">' +
        App.ui.datalist('ct-ev-dl', App.data.events.map((e) => e.name)) + '</div>' +
      '<button class="btn out icon" data-act="editEvent:' + evId + '" title="Sửa sự kiện" aria-label="Sửa sự kiện">' + I('edit') + '</button>' +
      '<button class="btn out icon" data-act="addEvent" title="Thêm sự kiện" aria-label="Thêm sự kiện">' + I('plus') + '</button></div>' +
      '<div class="kpis k4">' +
      App.kpi('receipt', 'Thực chi', money(m.spent), m.count + ' khoản chi') +
      App.kpi('file', 'Đã tạm ứng', money(m.tu), m.tu ? (m.tu >= m.spent ? 'Còn dư ' + money(m.tu - m.spent) : 'Chi vượt ' + money(m.spent - m.tu)) : 'Chưa có phiếu tạm ứng') +
      App.kpi('check', 'Có hoá đơn VAT', m.pctVat + '<small>% giá trị</small>', m.vatCount + ' khoản · ' + money(m.vatAmt)) +
      App.kpi('image', 'Thiếu ảnh minh chứng', m.noProof + ' <small>khoản</small>', m.noProof ? 'Bổ sung trước khi quyết toán' : 'Đủ minh chứng') +
      '</div>' +
      '<div class="card mt16"><div class="card-h"><div class="t">' + I('list') + 'Danh sách khoản chi</div>' +
      '<button class="btn sec sm" data-act="quickCapture">' + I('camera') + 'Chụp bill</button></div>' +
      '<div class="card-b" style="padding-bottom:8px">' +
      (exps.length ? '<div class="search field mb0" style="margin-bottom:10px">' + I('search') + '<input class="input" id="exp-search" type="search" placeholder="Tìm nội dung, ghi chú, số tiền…" value="' + esc(f.q) + '"></div>' +
        '<div class="catbar" id="exp-chips">' + chips() + '</div>' : '') +
      '</div><div id="exp-list">' + listHTML() + '</div></div>' +
      '<button class="fab" data-act="quickCapture" aria-label="Chụp bill nhanh">' + I('camera') + '</button>';

    const ctEv = document.getElementById('ct-ev');
    const goEv = async () => { const n = ctEv.value.trim(); if (!n || n === ev.name) return; const id = await App.resolveEvent(n); if (id) App.nav('chi-tieu/' + id); };
    ctEv.onchange = goEv; ctEv.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); goEv(); } };
    ctEv.onfocus = () => ctEv.select();
    App._repaintExp = () => {
      const l = document.getElementById('exp-list'); if (l) l.innerHTML = listHTML();
      const c = document.getElementById('exp-chips'); if (c) c.innerHTML = chips();
      App.Sel.paint();
    };
    const si = document.getElementById('exp-search');
    if (si) si.oninput = () => { f.q = si.value; App._repaintExp(); };
    App.Sel.init('exp-' + evId, (ids) => {
      const sum = App.data.expenses.filter((x) => ids.includes(x.id)).reduce((a, x) => a + U.toNumber(x.amount), 0);
      return '<span style="opacity:.8;margin-right:4px">' + money(sum) + '</span>' +
        '<button class="btn out sm" data-act="selExpDoc:HU">' + I('wallet') + 'Lập hoàn ứng</button>' +
        '<button class="btn out sm" data-act="selExpDoc:TT">' + I('calc') + 'Lập thanh toán</button>' +
        '<button class="btn danger sm" data-act="selExpTrash">' + I('trash') + 'Xoá</button>';
    });
  };

  /* ----------------- Editor khoản chi ----------------- */
  function imagesGrid(d) {
    let s = '<div class="imgrid">';
    (d.images || []).forEach((im) => {
      const url = App.imgURL(im);
      const inner = !im.blob ? '<div style="display:grid;place-items:center;height:100%;font-size:11px;text-align:center;padding:6px;color:hsl(var(--chu-nhat))">Ảnh lớn, chỉ có trên máy đã chụp</div>'
        : im.kind === 'video' ? '<video src="' + url + '" muted playsinline></video><span class="vbadge">video</span>' : '<img src="' + url + '" alt="">';
      s += '<div class="it" data-act="viewImg:' + im.id + '">' + inner +
        (im.amount ? '<span class="vbadge" style="left:auto;right:6px">' + U.groupThousand(im.amount) + '</span>' : '') +
        '<button class="ed" data-act="editImg:' + im.id + '" aria-label="Ghi chú ảnh" title="Ghi chú">' + I('edit', 13) + '</button>' +
        '<button class="del" data-act="rmImg:' + im.id + '" aria-label="Xoá ảnh" title="Xoá ảnh">' + I('x', 14) + '</button></div>';
    });
    s += '<div class="add" data-act="addImg">' + I('plus') + '<small>Camera / Thư viện</small></div></div>';
    return s;
  }

  function openExpenseEditor(expense, initialBlobs) {
    const evId = currentEventId(App.route);
    if (!evId) { App.toast('Tạo sự kiện / đợt chi trước', 'err'); return; }
    let d;
    if (expense) {
      d = Object.assign({}, expense, { images: App.data.images.filter((i) => i.expenseId === expense.id).map((i) => Object.assign({}, i, { isNewBlob: false })), removed: [], isNew: false });
    } else {
      const s = App.settings;
      d = { id: U.uid(), eventId: evId, date: U.todayISO(), content: '', transferNote: '', ghiChu: '', participants: s.tenNgan || App.lastName(s.hoTen), category: 'Khác', vatType: 'none', amount: 0, createdAt: U.nowISO(), images: [], removed: [], isNew: true };
    }
    if (initialBlobs && initialBlobs.length) setTimeout(() => addImages(initialBlobs), 0);
    App.draftExpense = d;
    App.openSheet(App.sheetHead(expense ? 'Sửa khoản chi' : 'Thêm khoản chi', (App.eventById(d.eventId) || {}).name) +
      '<div class="fgrid c2">' +
      '<div class="sall">' + ui.text('exp-content', 'Nội dung chi', d.content, { ph: 'VD: Thanh toán phí vận chuyển sa bàn', req: true }) + '</div>' +
      ui.money('exp-amt', 'Số tiền', d.amount, { words: true, req: true }) + ui.date('exp-date', 'Ngày chi', d.date) +
      ui.text('exp-who', 'Người tham gia', d.participants, { ph: 'VD: Giáp, Dũng' }) +
      ui.select('exp-cat', 'Phân loại', d.category, App.CATEGORIES) +
      ui.select('exp-vat', 'Loại hoá đơn', App.vatTypeOf(d), App.VAT_TYPES, { hint: 'Chỉ Hoá đơn VAT được tính là "có hoá đơn".' }) +
      ui.text('exp-note', 'Ghi chú (in vào cột Ghi chú của phiếu)', d.ghiChu || '', { ph: 'VD: Hoá đơn số 0012 ngày 04/11' }) +
      '<div class="sall">' + ui.textarea('exp-transfer', 'Nội dung chuyển khoản (tuỳ chọn)', d.transferNote, { rows: 2 }) + '</div>' +
      '</div>' +
      '<div class="section-t" style="margin-top:4px">Minh chứng (ảnh / video / bill)</div>' +
      '<div id="exp-images">' + imagesGrid(d) + '</div>' +
      '<div class="sheet-f">' + (expense ? '<button class="btn danger-out" data-act="delExpense:' + d.id + '">' + I('trash') + 'Xoá</button><span class="spacer"></span>' : '') +
      '<button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" data-act="saveExpense">' + I('check') + 'Lưu khoản chi</button></div>', { wide: true });
  }
  App.openExpenseEditor = openExpenseEditor;

  function refreshGrid() { const g = document.getElementById('exp-images'); if (g && App.draftExpense) g.innerHTML = imagesGrid(App.draftExpense); }
  async function addImages(list) {
    const d = App.draftExpense; if (!d) return;
    const files = await App.prepFiles(Array.isArray(list) ? list : [list]);
    if (App.draftExpense !== d) return;
    files.forEach((b) => d.images.push(App.makeImage(b, d.id, d.eventId)));
    refreshGrid();
  }

  function openImageEditor(imgId) {
    const d = App.draftExpense; const im = d && d.images.find((x) => x.id === imgId); if (!im) return;
    const url = App.imgURL(im);
    const media = im.kind === 'video' ? '<video src="' + url + '" controls playsinline style="width:100%;border-radius:10px;max-height:50vh"></video>'
      : '<img src="' + url + '" alt="" style="width:100%;border-radius:10px;max-height:50vh;object-fit:contain;background:#000">';
    const ov = App.openSheet(App.sheetHead('Minh chứng') + media + '<div class="mt12"></div>' +
      ui.textarea('img-note', 'Ghi chú cho ảnh này', im.note, { rows: 2, ph: 'VD: Bill chuyển khoản xe tải' }) +
      ui.money('img-amt', 'Số tiền trên minh chứng (tuỳ chọn)', im.amount) +
      '<div class="sheet-f"><button class="btn danger-out" data-act="rmImg:' + im.id + '">' + I('trash') + 'Xoá ảnh</button><span class="spacer"></span><button class="btn" id="img-save">Lưu ghi chú</button></div>', { focus: false });
    ov.querySelector('#img-save').onclick = () => { im.note = App.val('img-note'); im.amount = App.valMoney('img-amt'); App.closeSheet(ov); refreshGrid(); };
  }

  async function saveExpense() {
    const d = App.draftExpense; if (!d) return;
    const content = App.val('exp-content'), amount = App.valMoney('exp-amt');
    if (!content) { App.toast('Nhập nội dung chi', 'err'); return; }
    if (!amount) { App.toast('Nhập số tiền', 'err'); return; }
    const exp = {
      id: d.id, eventId: d.eventId, date: App.val('exp-date') || U.todayISO(), content, amount,
      participants: App.val('exp-who'), category: App.val('exp-cat') || 'Khác', vatType: App.val('exp-vat') || 'none',
      ghiChu: App.val('exp-note'), transferNote: App.val('exp-transfer'),
      createdAt: d.createdAt || U.nowISO(), uploadedAt: d.uploadedAt || U.nowISO(),
    };
    await DB.put('expenses', exp);
    for (const id of d.removed) await DB.del('images', id);
    for (const im of d.images) {
      const old = App.data.images.find((x) => x.id === im.id);
      if (!im.isNewBlob && old && old.note === im.note && U.toNumber(old.amount) === U.toNumber(im.amount)) continue;
      await DB.put('images', { id: im.id, expenseId: exp.id, eventId: exp.eventId, blob: im.blob, mime: im.mime, kind: im.kind, note: im.note || '', amount: U.toNumber(im.amount), createdAt: im.createdAt || U.nowISO() });
    }
    App.draftExpense = null;
    App.closeAllSheets();
    App.toast('Đã lưu khoản chi', 'ok');
    App.reload();
  }

  /* ----------------- Nhập nhiều khoản chi: điền theo dòng / dán từ Excel / file mẫu ----------------- */
  const BULK_COLS = ['Ngày chi', 'Nội dung', 'Số tiền', 'Hoá đơn (VAT/bill/không)', 'Phân loại', 'Người tham gia', 'Ghi chú'];
  const vatOf = (t) => { const x = U.normText(t || ''); return /vat|gtgt|hd do|hoa don do/.test(x) ? 'vat' : /bill|ban le|hoa don/.test(x) ? 'bill' : 'none'; };
  const catOf = (t) => { const x = U.normText(t || ''); return App.CATEGORIES.find((c) => U.normText(c) === x) || App.CATEGORIES.find((c) => x && U.normText(c).indexOf(x) >= 0) || 'Khác'; };
  function dateOf(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v == null ? '' : v).trim(); if (!s) return '';
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/.exec(s);
    if (m) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear()); return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + (+s) * 864e5); return d.toISOString().slice(0, 10); }
    return '';
  }
  function bulkRow(r, i) {
    const s = App.settings;
    r = r || { date: U.todayISO(), content: '', amount: '', vat: 'none', cat: 'Khác', who: s.tenNgan || App.lastName(s.hoTen) || '', note: '' };
    return '<tr data-b="' + i + '"><td class="ix">' + (i + 1) + '</td>' +
      '<td data-l="Ngày chi"><input class="input" type="date" data-k="date" value="' + esc(r.date) + '"></td>' +
      '<td data-l="Nội dung" style="min-width:200px"><input class="input" data-k="content" value="' + esc(r.content) + '" placeholder="Nội dung chi"></td>' +
      '<td data-l="Số tiền" style="width:130px"><input class="input money" data-k="amount" data-money inputmode="numeric" value="' + (U.toNumber(r.amount) ? U.groupThousand(r.amount) : '') + '" placeholder="0"></td>' +
      '<td data-l="Hoá đơn"><select class="select" data-k="vat">' + App.VAT_TYPES.map((o) => '<option value="' + o.v + '"' + (o.v === r.vat ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></td>' +
      '<td data-l="Phân loại"><select class="select" data-k="cat">' + App.CATEGORIES.map((c) => '<option' + (c === r.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></td>' +
      '<td data-l="Người tham gia"><input class="input" data-k="who" value="' + esc(r.who) + '"></td>' +
      '<td data-l="Ghi chú"><input class="input" data-k="note" value="' + esc(r.note) + '" placeholder="Số HĐ…"></td>' +
      '<td class="del"><button class="btn ghost icon xs" data-bdel="' + i + '" aria-label="Xoá dòng">' + I('x', 14) + '</button></td></tr>';
  }
  function openBulk() {
    const evId = currentEventId(App.route);
    const ev = App.eventById(evId);
    let rows = [null, null, null, null, null];
    const ov = App.openSheet(App.sheetHead('Nhập nhiều khoản chi', 'Điền từng dòng, dán từ Excel / Zalo, hoặc chọn file mẫu Excel') +
      '<div class="fgrid c2">' + App.ui.eventPicker('bk-ev', 'Sự kiện / đợt chi', evId) +
      '<div class="field"><label>Nhập nhanh</label><div class="row" style="gap:8px"><button class="btn out sm" id="bk-paste">' + I('copy') + 'Dán từ Excel</button><button class="btn out sm" id="bk-file">' + I('excel') + 'Chọn file Excel</button><button class="btn ghost sm" id="bk-tpl">' + I('download') + 'Tải file mẫu</button></div></div></div>' +
      '<div id="bk-pastebox" hidden class="mt8"><textarea class="textarea" id="bk-text" rows="4" placeholder="Copy các dòng trong Excel (cột: ' + esc(BULK_COLS.join(' · ')) + ') rồi dán vào đây"></textarea><div class="row mt8" style="gap:8px"><button class="btn sm" id="bk-parse">' + I('check') + 'Đưa vào bảng</button><span class="muted" style="font-size:12.5px">Ngày dạng 05/11/2026 hoặc 05/11 · Số tiền 350.000 · Hoá đơn: VAT / bill / không</span></div></div>' +
      '<div class="tbl-wrap mt12"><table class="tbl items cards"><thead><tr><th>#</th><th>Ngày chi</th><th>Nội dung</th><th>Số tiền</th><th>Hoá đơn</th><th>Phân loại</th><th>Người tham gia</th><th>Ghi chú</th><th></th></tr></thead><tbody id="bk-body"></tbody></table></div>' +
      '<div class="row mt8" style="justify-content:space-between"><button class="btn sec sm" id="bk-add">' + I('plus') + 'Thêm 5 dòng</button><b id="bk-sum"></b></div>' +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="bk-save">' + I('check') + 'Lưu các khoản chi</button></div>', { wide: true });
    const body = ov.querySelector('#bk-body');
    const read = () => Array.from(body.querySelectorAll('tr')).map((tr) => { const o = {}; tr.querySelectorAll('[data-k]').forEach((x) => { o[x.getAttribute('data-k')] = x.value; }); o.amount = U.toNumber(o.amount); return o; });
    const sum = () => { const l = read().filter((r) => r.content || r.amount); ov.querySelector('#bk-sum').textContent = l.length + ' khoản · ' + money(l.reduce((a, r) => a + r.amount, 0)); };
    const paint = () => { body.innerHTML = rows.map(bulkRow).join(''); sum(); };
    paint();
    body.addEventListener('input', sum);
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-bdel]'); if (!b) return; rows = read(); rows.splice(+b.getAttribute('data-bdel'), 1); if (!rows.length) rows = [null]; paint(); });
    ov.querySelector('#bk-add').onclick = () => { rows = read().concat([null, null, null, null, null]); paint(); };
    const fill = (list) => {
      const cur = read().filter((r) => r.content || r.amount);
      const s = App.settings, who = s.tenNgan || App.lastName(s.hoTen) || '';
      const add = list.filter((r) => r && (String(r[1] || '').trim() || U.toNumber(r[2]))).map((r) => ({ date: dateOf(r[0]) || U.todayISO(), content: String(r[1] || '').trim(), amount: U.toNumber(r[2]), vat: vatOf(r[3]), cat: catOf(r[4]), who: String(r[5] || '').trim() || who, note: String(r[6] || '').trim() }));
      rows = cur.concat(add);
      if (!rows.length) rows = [null];
      paint(); App.toast('Đã đưa ' + add.length + ' dòng vào bảng — kiểm tra rồi bấm Lưu', 'ok');
    };
    ov.querySelector('#bk-paste').onclick = () => { const b = ov.querySelector('#bk-pastebox'); b.hidden = !b.hidden; if (!b.hidden) ov.querySelector('#bk-text').focus(); };
    ov.querySelector('#bk-parse').onclick = () => {
      const txt = ov.querySelector('#bk-text').value;
      const lines = txt.split(/\r?\n/).map((l) => l.split(/\t|;/)).filter((c) => c.join('').trim());
      fill(lines.filter((c) => dateOf(c[0]) || !/^(ngay|stt)/.test(U.normText(c[0] || ''))));
      ov.querySelector('#bk-text').value = ''; ov.querySelector('#bk-pastebox').hidden = true;
    };
    ov.querySelector('#bk-tpl').onclick = async () => {
      const E = await App.ensureLib('exceljs'); const wb = new E.Workbook(); const ws = wb.addWorksheet('Khoản chi');
      ws.columns = BULK_COLS.map((h, i) => ({ header: h, width: [12, 40, 14, 22, 18, 20, 26][i] }));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B3DBE' } };
      ws.addRow(['05/11/2026', 'Taxi đi trường', 350000, 'bill', 'Di chuyển', 'An, Dũng', '']);
      ws.addRow(['05/11/2026', 'Cơm trưa đội ngũ (8 suất)', 900000, 'VAT', 'Ăn uống', 'Đội ngũ', 'HĐ số 0012']);
      const v = wb.addWorksheet('Danh mục'); v.addRow(['Phân loại']); App.CATEGORIES.forEach((c) => v.addRow([c])); v.addRow([]); v.addRow(['Hoá đơn: VAT / bill / không']);
      U.saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Mau-nhap-khoan-chi.xlsx');
    };
    ov.querySelector('#bk-file').onclick = async () => {
      const fs = await App.pickFiles('.xlsx', false); if (!fs.length) return;
      try {
        const E = await App.ensureLib('exceljs'); const wb = new E.Workbook(); await wb.xlsx.load(await fs[0].arrayBuffer());
        const ws = wb.worksheets[0], out = [];
        ws.eachRow((row, n) => { if (n === 1) return; out.push(row.values.slice(1, 8).map((x) => (x && typeof x === 'object' && !(x instanceof Date) ? (x.result != null ? x.result : x.text || '') : x))); });
        fill(out);
      } catch (e) { App.toast('Không đọc được file: ' + (e.message || e), 'err'); }
    };
    ov.querySelector('#bk-save').onclick = async () => {
      const list = read().filter((r) => r.content || r.amount);
      if (!list.length) { App.toast('Chưa có dòng nào', 'err'); return; }
      const bad = list.findIndex((r) => !r.content || !r.amount);
      if (bad >= 0) { App.toast('Dòng ' + (bad + 1) + ' thiếu nội dung hoặc số tiền', 'err'); return; }
      const evName = App.val('bk-ev');
      const eid = (await App.resolveEvent(evName || (ev && ev.name) || ('Đợt chi ' + U.fmtDate(U.todayISO())))) || evId;
      for (const r of list) await DB.put('expenses', { id: U.uid(), eventId: eid, date: r.date || U.todayISO(), content: r.content, amount: r.amount, vatType: r.vat, category: r.cat, participants: r.who, ghiChu: r.note, transferNote: '', createdAt: U.nowISO() });
      App.closeAllSheets(); App.toast('Đã lưu ' + list.length + ' khoản chi · ' + money(list.reduce((a, r) => a + r.amount, 0)), 'ok');
      App.nav('chi-tieu/' + eid);
    };
  }
  App.openBulkExpense = openBulk;

  Object.assign(App.actions, {
    bulkExpense() { openBulk(); },
    async ctNewEvent() { const n = App.val('ct-new-ev'); if (!n) { App.toast('Nhập tên đợt chi', 'err'); return; } const id = await App.resolveEvent(n); if (id) App.nav('chi-tieu/' + id); },
    addExpense() { openExpenseEditor(null, null); },
    expFilterCat(cat) { if (App.expFilter) App.expFilter.cat = cat || 'all'; if (App._repaintExp) App._repaintExp(); },
    quickCapture() { openCamera((blobs) => { if (App.draftExpense && document.getElementById('exp-images')) addImages(blobs); else openExpenseEditor(null, blobs); }); },
    editExpense(id) { const e = App.data.expenses.find((x) => x.id === id); if (e) openExpenseEditor(e, null); },
    saveExpense() { return saveExpense(); },
    editImg(id) { openImageEditor(id); },
    rmImg(id) {
      const d = App.draftExpense; if (!d) return;
      const idx = d.images.findIndex((x) => x.id === id); if (idx < 0) return;
      if (!d.images[idx].isNewBlob) d.removed.push(id);
      d.images.splice(idx, 1);
      if (document.querySelectorAll('#modal-root .overlay').length > 1) App.closeSheet();
      refreshGrid();
    },
    addImg() {
      App.openSheet(App.sheetHead('Thêm minh chứng') +
        '<div class="menu-item" data-act="imgFromCam"><div class="mic">' + I('camera') + '</div><div><div class="mt">Chụp ảnh trực tiếp</div><div class="ms">Mở camera chụp bill / chứng từ</div></div></div>' +
        '<div class="menu-item" data-act="imgFromLib"><div class="mic">' + I('image') + '</div><div><div class="mt">Chọn từ thư viện / máy tính</div><div class="ms">Ảnh hoặc video có sẵn</div></div></div>', { center: true });
    },
    imgFromCam() { App.closeSheet(); openCamera((b) => addImages(b)); },
    async imgFromLib() { App.closeSheet(); const fs = await App.pickFiles('image/*,video/*', true); if (fs.length) addImages(fs); },
    async delExpense(id) {
      // khoản chi đã nằm trong phiếu đã gửi / đã duyệt là chứng từ của phiếu → không xoá
      const used = App.data.docs.find((d) => App.Flow && App.Flow.status(d) !== 'nhap' && (d.items || []).some((it) => it.expenseId === id));
      if (used) { App.toast('Khoản chi này là chứng từ của phiếu ' + used.soPhieu + ' (' + App.Flow.ST[App.Flow.status(used)].s + ') — không xoá được', 'err'); return; }
      App.draftExpense = null; App.closeAllSheets();
      await App.Trash.soft([{ store: 'expenses', id }]);
    },
    async selExpTrash() {
      const used = new Set(); App.data.docs.forEach((d) => { if (App.Flow && App.Flow.status(d) !== 'nhap') (d.items || []).forEach((it) => { if (it.expenseId) used.add(it.expenseId); }); });
      const ids = App.Sel.list(), ok = ids.filter((id) => !used.has(id));
      if (ok.length < ids.length) App.toast((ids.length - ok.length) + ' khoản chi thuộc phiếu đã gửi duyệt — giữ lại', 'err');
      if (ok.length) await App.Trash.soft(ok.map((id) => ({ store: 'expenses', id })));
    },
    selExpDoc(type) {
      const ids = App.Sel.list(); if (!ids.length) return;
      const ev = (App.data.expenses.find((x) => x.id === ids[0]) || {}).eventId || '';
      location.hash = '#/phieu/moi/' + type + '?event=' + ev + '&exp=' + ids.join(',');
    },
    expPhotos(id, node) {
      const imgs = App.data.images.filter((x) => x.expenseId === id);
      App.lightbox(App.imageItems(imgs), 0, node.querySelector('img') || node);
    },
    viewImg(id, node) {
      const d = App.draftExpense; if (!d) return;
      const list = d.images.filter((x) => x.kind === 'image' || x.kind === 'video');
      App.lightbox(App.imageItems(list), Math.max(0, list.findIndex((x) => x.id === id)), node.querySelector('img') || node);
    },
  });
})();
