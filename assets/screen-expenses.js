/* =========================================================================
   screen-expenses.js — Chi tiêu & Minh chứng: camera trực tiếp, thư viện,
   ghi chú từng ảnh/khoản, số tiền, thời gian upload tự động.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui;
  const money = (n) => U.groupThousand(n) + ' đ';

  /* ----------------- Camera trực tiếp ----------------- */
  let camStream = null, camFacing = 'environment';
  function stopCam() { if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; } }

  function openCamera(onCapture) {
    const root = document.getElementById('modal-root');
    const cam = document.createElement('div');
    cam.className = 'cam';
    cam.innerHTML =
      '<div class="cam-top"><button class="cbtn" id="cam-x">✕</button><button class="cbtn" id="cam-flip">🔄</button></div>' +
      '<video id="cam-v" autoplay playsinline muted></video>' +
      '<div class="cam-bot"><button class="cbtn" id="cam-lib">🖼️</button>' +
      '<button class="shutter" id="cam-shot"></button><div style="width:48px"></div></div>';
    root.appendChild(cam);
    const video = cam.querySelector('#cam-v');

    function close() { stopCam(); cam.remove(); }
    cam.querySelector('#cam-x').onclick = close;
    cam.querySelector('#cam-lib').onclick = async () => {
      close();
      const fs = await App.pickFiles('image/*,video/*', true);
      fs.forEach((f) => onCapture(f));
    };
    cam.querySelector('#cam-flip').onclick = () => { camFacing = camFacing === 'environment' ? 'user' : 'environment'; start(); };
    cam.querySelector('#cam-shot').onclick = () => {
      const c = document.createElement('canvas');
      c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      c.toBlob((blob) => { if (blob) onCapture(blob); App.toast('Đã chụp ✓', 'ok'); }, 'image/jpeg', 0.9);
    };

    function start() {
      stopCam();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fallback('Thiết bị không hỗ trợ camera trực tiếp.'); return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: camFacing } }, audio: false })
        .then((s) => { camStream = s; video.srcObject = s; })
        .catch(() => fallback('Không truy cập được camera. Hãy cấp quyền hoặc chọn ảnh từ thư viện.'));
    }
    function fallback(msg) {
      cam.querySelector('#cam-v').style.display = 'none';
      if (!cam.querySelector('.cam-msg')) {
        const m = document.createElement('div'); m.className = 'cam-msg';
        m.innerHTML = esc(msg) + '<br><br><button class="btn btn-primary" id="cam-lib2" style="max-width:240px">🖼️ Chọn từ thư viện</button>';
        cam.insertBefore(m, cam.querySelector('.cam-bot'));
        m.querySelector('#cam-lib2').onclick = cam.querySelector('#cam-lib').onclick;
      }
    }
    start();
  }
  App.openCamera = openCamera;

  /* ----------------- Màn hình ----------------- */
  App.screens.expenses = function (root) {
    const ev = App.currentEvent();
    if (!ev) { root.innerHTML = App.noEvent(); return; }
    const exps = App.view.expenses || [];
    const byExp = App.imagesByExpense(App.view.images);
    const m = App.computeEvent(ev, App.view.advance, exps, App.view.images);

    // Bộ lọc danh mục + tìm kiếm — reset khi chuyển sang sự kiện khác.
    if (!App.expFilter || App._expFilterEvent !== ev.id) { App.expFilter = { cat: 'all', q: '' }; App._expFilterEvent = ev.id; }
    const catCounts = {};
    exps.forEach((e) => { const c = e.category || 'Khác'; catCounts[c] = (catCounts[c] || 0) + 1; });
    const cats = App.CATEGORIES.filter((c) => catCounts[c]);

    function itemHTML(e) {
      const imgs = byExp[e.id] || [];
      const thumb = imgs[0];
      const proof = imgs.length
        ? '<span class="badge ok">📎 ' + imgs.length + '</span>'
        : '<span class="badge warn">Thiếu ảnh</span>';
      return '<div class="exp" data-act="editExpense:' + e.id + '">' +
        '<div class="thumb">' + (thumb ? (thumb.kind === 'video' ? '🎬' : '<img src="' + App.imgURL(thumb) + '">') : '🧾') + '</div>' +
        '<div class="body"><div class="top"><div class="title">' + esc(e.content || '(chưa có nội dung)') + '</div>' +
        '<div class="amt">' + money(e.amount) + '</div></div>' +
        '<div class="meta"><span>📅 ' + esc(U.fmtDayMonth(e.date)) + '</span>' + App.vatBadge(e) + proof +
        (e.category ? '<span>· ' + esc(e.category) + '</span>' : '') + '</div>' +
        (e.transferNote ? '<div class="note">💸 ' + esc(e.transferNote) + '</div>' : '') +
        '<div class="meta" style="margin-top:4px">🕒 ' + esc(U.fmtDateTime(e.uploadedAt || e.createdAt)) + '</div>' +
        '</div></div>';
    }

    function matches(e) {
      const f = App.expFilter;
      if (f.cat && f.cat !== 'all' && (e.category || 'Khác') !== f.cat) return false;
      const q = U.normText(f.q);
      if (q) {
        const hay = U.normText([e.content, e.transferNote, e.category, U.groupThousand(e.amount)].join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }

    function listHTML() {
      if (!exps.length) {
        return '<div class="empty"><div class="ic">🧾</div><div class="et">Chưa có khoản chi</div>' +
          '<div class="es">Bấm “Chụp bill nhanh” (nút 📷) hoặc “Thêm khoản chi”.</div></div>';
      }
      const items = exps.filter(matches);
      if (!items.length) {
        return '<div class="empty"><div class="ic">🔍</div><div class="et">Không tìm thấy khoản chi</div>' +
          '<div class="es">Thử từ khoá khác hoặc chọn danh mục “Tất cả”.</div></div>';
      }
      return items.map(itemHTML).join('');
    }

    function toolbarHTML() {
      if (!exps.length) return '';
      const f = App.expFilter;
      const chip = (key, label, count, active) =>
        '<button class="catchip' + (active ? ' active' : '') + '" data-act="expFilterCat:' + esc(key) + '">' +
        esc(label) + '<span class="cc">' + count + '</span></button>';
      let chips = chip('all', 'Tất cả', exps.length, (f.cat === 'all' || !f.cat));
      cats.forEach((c) => { chips += chip(c, c, catCounts[c], f.cat === c); });
      return '<div class="exp-tools">' +
        '<div class="searchbar' + (f.q ? ' has-q' : '') + '"><span class="si">🔍</span>' +
        '<input id="exp-search" type="search" placeholder="Tìm nội dung, ghi chú, số tiền…" value="' + esc(f.q || '') + '">' +
        '<button class="sx" data-act="expSearchClear" aria-label="Xoá tìm kiếm">✕</button></div>' +
        '<div class="catbar">' + chips + '</div></div>';
    }

    root.innerHTML =
      '<div class="screen-title">🧾 Chi tiêu & Minh chứng</div>' +
      '<div class="screen-sub">' + esc(ev.name) + '</div>' +
      '<div class="card"><div class="kv"><div class="k">💼 Đã tạm ứng</div><div class="v">' + money(m.advanceTotal) + '</div></div>' +
      '<div class="kv"><div class="k">🧾 Thực chi (' + m.count + ' khoản)</div><div class="v">' + money(m.spentTotal) + '</div></div>' +
      '<div class="kv"><div class="k">💰 Còn lại</div><div class="v ' + (m.remaining >= 0 ? 'pos' : 'neg') + '">' + money(m.remaining) + '</div></div>' +
      '<div style="margin-top:12px"><div class="kv" style="border:none;padding-bottom:6px"><div class="k">🧾 Tỷ lệ giá trị có hoá đơn VAT</div><div class="v">' + m.pctVatAmount + '%</div></div>' +
      '<div class="progress ' + (m.pctVatAmount >= 80 ? 'ok' : m.pctVatAmount >= 40 ? '' : 'warn') + '"><span style="width:' + m.pctVatAmount + '%"></span></div>' +
      '<div class="hint" style="margin:6px 0 0">% theo <b>số tiền</b> (giá trị có HĐ VAT / tổng chi), không phải theo số khoản.</div>' +
      '<div class="vchip-row mt8">' +
      '<span class="vchip vat">🧾 VAT: ' + m.vatCount + ' khoản · ' + money(m.vatAmount) + '</span>' +
      '<span class="vchip bill">🧾 Bill: ' + m.billCount + ' khoản · ' + money(m.billAmount) + '</span>' +
      '<span class="vchip none">📎 Có ảnh: ' + m.withImagesCount + '/' + m.count + '</span>' +
      '</div></div></div>' +

      '<div class="btn-row mt8">' +
      '<button class="btn btn-soft" data-act="addExpense">＋ Thêm khoản chi</button>' +
      '<button class="btn btn-primary" data-act="quickCapture">📷 Chụp bill nhanh</button></div>' +

      '<div class="section-label">📒 Danh sách khoản chi</div>' +
      toolbarHTML() +
      '<div id="exp-list">' + listHTML() + '</div>' +
      '<div style="height:6px"></div>';

    // Lọc/tìm tại chỗ — không reload để giữ focus ô tìm & vị trí cuộn.
    App._repaintExp = function () {
      const lst = document.getElementById('exp-list');
      if (lst) lst.innerHTML = listHTML();
      document.querySelectorAll('.catbar .catchip').forEach((b) => {
        const raw = b.getAttribute('data-act') || '';
        const key = raw.slice(raw.indexOf(':') + 1);
        b.classList.toggle('active', (App.expFilter.cat || 'all') === key);
      });
    };
    const si = document.getElementById('exp-search');
    if (si) si.oninput = function () {
      App.expFilter.q = si.value;
      const sb = si.closest('.searchbar'); if (sb) sb.classList.toggle('has-q', !!si.value);
      App._repaintExp();
    };
  };

  /* ----------------- Editor khoản chi ----------------- */
  function imagesGrid(d) {
    let s = '<div class="imgrid">';
    (d.images || []).forEach((im) => {
      const url = App.imgURL(im);
      const inner = im.kind === 'video'
        ? '<video src="' + url + '" muted playsinline></video><span class="vbadge">▶ video</span>'
        : '<img src="' + url + '">';
      s += '<div class="it" data-act="editImg:' + im.id + '">' + inner +
        (im.amount ? '<span class="vbadge" style="left:auto;right:6px">' + U.groupThousand(im.amount) + '</span>' : '') +
        '<button class="del" data-act="rmImg:' + im.id + '">✕</button></div>';
    });
    s += '<div class="add" data-act="addImg"><span class="ic">＋</span><small>Camera / Thư viện</small></div></div>';
    return s;
  }

  function openExpenseEditor(expense, initialBlob) {
    const ev = App.currentEvent();
    let d;
    if (expense) {
      d = { id: expense.id, eventId: ev.id, date: expense.date, content: expense.content, transferNote: expense.transferNote || '', category: expense.category || 'Khác', vatType: App.vatTypeOf(expense), amount: expense.amount, createdAt: expense.createdAt, uploadedAt: expense.uploadedAt, images: [], removed: [], isNew: false };
      const imgs = (App.view.images || []).filter((i) => i.expenseId === expense.id);
      d.images = imgs.map((i) => Object.assign({}, i));
    } else {
      d = { id: U.uid(), eventId: ev.id, date: U.todayISO(), content: '', transferNote: '', category: 'Khác', vatType: 'none', amount: 0, createdAt: U.nowISO(), uploadedAt: U.nowISO(), images: [], removed: [], isNew: true };
    }
    if (initialBlob) d.images.push(App.makeImage(initialBlob, d.id, ev.id));
    App.draftExpense = d;

    const ov = App.openSheet(
      '<div class="sheet-h"><div class="st">' + (expense ? '✏️ Sửa khoản chi' : '🧾 Thêm khoản chi') + '</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      ui.text('exp-content', 'Nội dung chi', d.content, { ph: 'VD: Tiền vận chuyển thiết bị' }) +
      '<div class="row2">' + ui.money('exp-amt', 'Số tiền', d.amount) + ui.date('exp-date', 'Ngày chi', d.date) + '</div>' +
      ui.textarea('exp-transfer', 'Nội dung chuyển khoản', d.transferNote, { rows: 2, ph: 'Nội dung CK / người nhận (tuỳ chọn)' }) +
      '<div class="row2">' + ui.select('exp-cat', 'Phân loại', d.category, App.CATEGORIES) +
      ui.select('exp-vat', 'Loại hoá đơn', d.vatType, App.VAT_TYPES) + '</div>' +
      '<div class="hint" style="margin:-4px 0 8px">📌 Chỉ <b>Hoá đơn VAT</b> mới được tính là “có hoá đơn”.</div>' +
      '<div class="section-label" style="margin-top:12px">📎 Minh chứng (ảnh / video / bill)</div>' +
      '<div id="exp-images">' + imagesGrid(d) + '</div>' +
      '<div class="hint">🕒 Cập nhật: <span id="exp-uploaded">' + esc(U.fmtDateTime(d.uploadedAt)) + '</span></div>' +
      '<div class="btn-row mt16">' +
      (expense ? '<button class="btn btn-danger" data-act="delExpense:' + d.id + '">🗑️ Xoá</button>' : '') +
      '<button class="btn btn-primary" data-act="saveExpense">💾 Lưu khoản chi</button></div>');
    return ov;
  }
  App.openExpenseEditor = openExpenseEditor;

  function refreshGrid() {
    const g = document.getElementById('exp-images'); if (g) g.innerHTML = imagesGrid(App.draftExpense);
    const u = document.getElementById('exp-uploaded'); if (u) u.textContent = U.fmtDateTime(App.draftExpense.uploadedAt);
  }

  function addImages(filesOrBlobs) {
    const d = App.draftExpense; if (!d) return;
    (Array.isArray(filesOrBlobs) ? filesOrBlobs : [filesOrBlobs]).forEach((b) => d.images.push(App.makeImage(b, d.id, d.eventId)));
    d.uploadedAt = U.nowISO();
    refreshGrid();
  }

  /* ----------------- Image detail (ghi chú từng ảnh) ----------------- */
  function openImageEditor(imgId) {
    const d = App.draftExpense; const im = d.images.find((x) => x.id === imgId); if (!im) return;
    const url = App.imgURL(im);
    const media = im.kind === 'video' ? '<video src="' + url + '" controls playsinline style="width:100%;border-radius:14px;max-height:46vh"></video>'
      : '<img src="' + url + '" style="width:100%;border-radius:14px;max-height:46vh;object-fit:contain;background:#000">';
    const ov = App.openSheet(
      '<div class="sheet-h"><div class="st">📎 Minh chứng</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      media +
      ui.textarea('img-note', 'Ghi chú cho ảnh này', im.note, { rows: 2, ph: 'VD: Bill chuyển khoản xe Van qua CVA' }) +
      ui.money('img-amt', 'Số tiền của minh chứng (tuỳ chọn)', im.amount) +
      '<div class="btn-row mt12"><button class="btn btn-danger" data-act="rmImg:' + im.id + '">🗑️ Xoá ảnh</button>' +
      '<button class="btn btn-primary" id="img-save">💾 Lưu ghi chú</button></div>');
    ov.querySelector('#img-save').onclick = () => {
      im.note = App.val('img-note'); im.amount = App.valMoney('img-amt');
      App.closeSheet(ov); refreshGrid(); App.toast('Đã lưu ghi chú ảnh', 'ok');
    };
  }

  /* ----------------- Save ----------------- */
  async function saveExpense() {
    const d = App.draftExpense; if (!d) return;
    const exp = {
      id: d.id, eventId: d.eventId, date: App.val('exp-date') || U.todayISO(),
      content: App.val('exp-content'), transferNote: App.val('exp-transfer'),
      category: App.val('exp-cat'), vatType: App.val('exp-vat') || 'none',
      amount: App.valMoney('exp-amt'), createdAt: d.createdAt, uploadedAt: d.uploadedAt || U.nowISO(),
    };
    await DB.put('expenses', exp);
    for (const id of d.removed) await DB.del('images', id);
    for (const im of d.images) {
      await DB.put('images', { id: im.id, expenseId: exp.id, eventId: exp.eventId, blob: im.blob, mime: im.mime, kind: im.kind, note: im.note || '', amount: U.toNumber(im.amount), createdAt: im.createdAt || U.nowISO() });
    }
    App.draftExpense = null;
    App.closeSheet();
    App.toast('Đã lưu khoản chi', 'ok');
    App.reload();
  }

  Object.assign(App.actions, {
    addExpense() { openExpenseEditor(null, null); },
    expFilterCat(cat) {
      if (!App.expFilter) App.expFilter = { cat: 'all', q: '' };
      App.expFilter.cat = cat || 'all';
      if (App._repaintExp) App._repaintExp(); else App.reload();
    },
    expSearchClear() {
      if (!App.expFilter) App.expFilter = { cat: 'all', q: '' };
      App.expFilter.q = '';
      const si = document.getElementById('exp-search');
      if (si) { si.value = ''; const sb = si.closest('.searchbar'); if (sb) sb.classList.remove('has-q'); si.focus(); }
      if (App._repaintExp) App._repaintExp();
    },
    async quickCapture() { openCamera((blob) => { if (App.draftExpense) addImages(blob); else openExpenseEditor(null, blob); }); },
    async editExpense(id) { const e = (App.view.expenses || []).find((x) => x.id === id); if (e) openExpenseEditor(e, null); },
    saveExpense() { saveExpense(); },
    editImg(id) { openImageEditor(id); },
    rmImg(id) {
      const d = App.draftExpense; if (!d) return;
      const idx = d.images.findIndex((x) => x.id === id); if (idx < 0) return;
      if (!d.images[idx].isNewBlob && !App.draftExpense.isNew) d.removed.push(id);
      d.images.splice(idx, 1);
      // đóng image detail nếu đang mở
      const sheets = document.querySelectorAll('#modal-root .overlay');
      if (sheets.length > 1) App.closeSheet();
      refreshGrid();
    },
    addImg() {
      const ov = App.openSheet(
        '<div class="sheet-h"><div class="st">Thêm minh chứng</div></div>' +
        '<div class="menu-item" data-act="imgFromCam"><div class="mic">📷</div><div><div class="mt">Chụp ảnh trực tiếp</div><div class="ms">Mở camera chụp bill/chứng từ</div></div><span class="mchev">›</span></div>' +
        '<div class="menu-item" data-act="imgFromLib"><div class="mic">🖼️</div><div><div class="mt">Chọn từ thư viện</div><div class="ms">Ảnh hoặc video có sẵn trong máy</div></div><span class="mchev">›</span></div>',
        { center: true });
      ov.dataset.chooser = '1';
    },
    imgFromCam() { App.closeSheet(); openCamera((b) => addImages(b)); },
    async imgFromLib() { App.closeSheet(); const fs = await App.pickFiles('image/*,video/*', true); if (fs.length) addImages(fs); },
    delExpense(id) {
      App.confirmSheet('Xoá khoản chi?', 'Khoản chi và toàn bộ minh chứng sẽ bị xoá.', async () => {
        await DB.delExpense(id); App.draftExpense = null;
        document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
        App.toast('Đã xoá', 'ok'); App.reload();
      }, true);
    },
  });

  App.CATEGORIES = ['Di chuyển', 'Vận chuyển', 'Ăn uống', 'Vật tư / Thiết bị', 'Thuê địa điểm', 'In ấn', 'Lưu trú', 'Khác'];
  App.VAT_TYPES = [
    { v: 'none', t: 'Không có hoá đơn' },
    { v: 'bill', t: 'Hoá đơn bán lẻ (bill)' },
    { v: 'vat', t: 'Hoá đơn VAT' },
  ];
  App.vatBadge = function (e) {
    const t = App.vatTypeOf(e);
    if (t === 'vat') return '<span class="badge ok">🧾 VAT</span>';
    if (t === 'bill') return '<span class="badge">🧾 Bill</span>';
    return '<span class="badge warn">Chưa có HĐ</span>';
  };
})();
