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
      '<video id="cam-v" autoplay playsinline muted></video>' +
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
        '<div class="card">' + App.emptyState('calendar', 'Chưa có sự kiện / đợt chi nào', 'Mỗi khoản chi thuộc một sự kiện hoặc đợt chi (VD: “Ngày hội STEM Cầu Giấy”, “Chi phí vận chuyển T9–T11”).',
        '<button class="btn" data-act="addEvent">' + I('plus') + 'Tạo sự kiện / đợt chi</button>') + '</div>';
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
      return '<div class="exp" data-act="editExpense:' + e.id + '"><div class="thumb">' + (th ? '<img src="' + App.imgURL(th) + '" alt="">' : I('receipt')) + '</div>' +
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
      '<button class="btn" data-act="addExpense">' + I('plus') + 'Thêm khoản chi</button>') +
      '<div class="row" style="margin:-6px 0 16px;flex-wrap:nowrap">' +
      '<div style="flex:1;max-width:460px">' + App.selectBare('ct-ev', evId, App.data.events.map((e) => ({ v: e.id, t: e.name + (e.date ? ' · ' + U.fmtDate(e.date) : '') }))) + '</div>' +
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

    document.getElementById('ct-ev').onchange = (e) => App.nav('chi-tieu/' + e.target.value);
    App._repaintExp = () => {
      const l = document.getElementById('exp-list'); if (l) l.innerHTML = listHTML();
      const c = document.getElementById('exp-chips'); if (c) c.innerHTML = chips();
    };
    const si = document.getElementById('exp-search');
    if (si) si.oninput = () => { f.q = si.value; App._repaintExp(); };
  };

  /* ----------------- Editor khoản chi ----------------- */
  function imagesGrid(d) {
    let s = '<div class="imgrid">';
    (d.images || []).forEach((im) => {
      const url = App.imgURL(im);
      const inner = im.kind === 'video' ? '<video src="' + url + '" muted playsinline></video><span class="vbadge">video</span>' : '<img src="' + url + '" alt="">';
      s += '<div class="it" data-act="editImg:' + im.id + '">' + inner +
        (im.amount ? '<span class="vbadge" style="left:auto;right:6px">' + U.groupThousand(im.amount) + '</span>' : '') +
        '<button class="del" data-act="rmImg:' + im.id + '" aria-label="Xoá ảnh">' + I('x', 14) + '</button></div>';
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
    (initialBlobs || []).forEach((b) => d.images.push(App.makeImage(b, d.id, d.eventId)));
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
  function addImages(list) {
    const d = App.draftExpense; if (!d) return;
    (Array.isArray(list) ? list : [list]).forEach((b) => d.images.push(App.makeImage(b, d.id, d.eventId)));
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

  Object.assign(App.actions, {
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
    delExpense(id) {
      App.confirmSheet('Xoá khoản chi?', 'Khoản chi và toàn bộ minh chứng sẽ bị xoá.', async () => {
        await DB.delExpense(id); App.draftExpense = null;
        App.closeAllSheets(); App.toast('Đã xoá khoản chi', 'ok'); App.reload();
      }, true, 'Xoá');
    },
  });
})();
