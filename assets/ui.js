/* =========================================================================
   ui.js — Helpers giao diện dùng chung: ô nhập tiền (tự nhóm nghìn + đọc chữ),
   builder form, chọn file, tạo bản ghi ảnh, tệp đính kèm của phiếu.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc;

  /* ---- Live format ô tiền + đọc chữ ---- */
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-money]')) {
      const n = U.toNumber(t.value);
      const pos = t.value.length - (t.selectionStart || 0);
      t.value = t.value.trim() === '' ? '' : U.groupThousand(n);
      try { const p = Math.max(0, t.value.length - pos); t.setSelectionRange(p, p); } catch (er) {}
      const wid = t.getAttribute('data-words');
      if (wid) { const el = document.getElementById(wid); if (el) el.textContent = n ? ('Bằng chữ: ' + App.docSo(n)) : ''; }
    }
    const cb = t.getAttribute && t.getAttribute('data-cb');
    if (cb && App.inputCb[cb]) App.inputCb[cb](t, e);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    const cb = t.getAttribute && t.getAttribute('data-change');
    if (cb && App.inputCb[cb]) App.inputCb[cb](t, e);
  });

  /* ---- Hoạ tiết sóng (SVG tự sinh) cho banner / thẻ tối / đăng nhập ---- */
  App.waves = function (opts) {
    opts = opts || {};
    const n = opts.n || 26, w = 800, h = 500, seed = opts.seed || 1;
    const cs = opts.colors || ['#ffffff'];
    let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const a1 = rnd() * 120 + 60, a2 = rnd() * 160 + 80, ph = rnd() * 6;
    let paths = '';
    for (let i = 0; i < n; i++) {
      const k = i / n, y0 = h * (opts.y0 == null ? 0.15 : opts.y0) + k * h * (opts.spread || 0.9);
      const p = (x) => (y0 + Math.sin(x / 140 + ph + k * 2.2) * a1 * (0.4 + k) + Math.cos(x / 230 + k * 3) * a2 * 0.35).toFixed(1);
      paths += '<path d="M-20 ' + p(-20) + ' C200 ' + p(200) + ' 420 ' + p(420) + ' 600 ' + p(600) + ' S820 ' + p(820) + ' 840 ' + p(840) + '" stroke="' + cs[i % cs.length] +
        '" stroke-opacity="' + (opts.op || 0.55) * (0.35 + 0.65 * Math.sin(Math.PI * k)) + '" stroke-width="' + (opts.sw || 2.2) + '" fill="none"/>';
    }
    return '<svg class="waves" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + paths + '</svg>';
  };
  // minh hoạ chứng từ + đồng xu (thẻ chào mừng)
  App.docArt = function () {
    return '<svg class="obj" viewBox="0 0 200 200" aria-hidden="true"><defs>' +
      '<linearGradient id="pa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1e6ff"/></linearGradient>' +
      '<linearGradient id="co" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f7a72a"/></linearGradient></defs>' +
      '<rect x="52" y="34" width="96" height="124" rx="12" fill="#fff" opacity=".45" transform="rotate(-10 100 96)"/>' +
      '<rect x="50" y="30" width="100" height="130" rx="12" fill="url(#pa)"/>' +
      '<rect x="64" y="48" width="56" height="8" rx="4" fill="#c9a7ef"/><rect x="64" y="64" width="72" height="6" rx="3" fill="#e5d4f7"/>' +
      '<rect x="64" y="76" width="64" height="6" rx="3" fill="#e5d4f7"/><rect x="64" y="88" width="70" height="6" rx="3" fill="#e5d4f7"/>' +
      '<rect x="64" y="108" width="40" height="6" rx="3" fill="#e5d4f7"/><rect x="108" y="104" width="28" height="12" rx="4" fill="#ff4fa3"/>' +
      '<circle cx="126" cy="138" r="18" fill="#7cd34a"/><path d="M118 138l6 6 11-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g><ellipse cx="52" cy="150" rx="26" ry="8" fill="#d98a14"/><rect x="26" y="134" width="52" height="16" fill="#e89a1c"/><ellipse cx="52" cy="134" rx="26" ry="8" fill="url(#co)"/>' +
      '<ellipse cx="52" cy="126" rx="26" ry="8" fill="#d98a14"/><rect x="26" y="110" width="52" height="16" fill="#e89a1c"/><ellipse cx="52" cy="110" rx="26" ry="8" fill="url(#co)"/>' +
      '<text x="52" y="114" text-anchor="middle" font-size="10" font-weight="800" fill="#a45f00">đ</text></g></svg>';
  };

  App.docSo = function (n) {
    const s = App.settings || {};
    return U.docSoLTL(n, { nghin: s.docNghin, hauTo: s.hauTo });
  };

  /* ---- Field builders (trả về HTML) ---- */
  function field(label, inner, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.cls ? ' ' + opts.cls : '') + '"><label' + (opts.for ? ' for="' + opts.for + '"' : '') + '>' + esc(label) +
      (opts.req ? ' <span class="req">*</span>' : '') + '</label>' + inner +
      (opts.hint ? '<div class="hint">' + opts.hint + '</div>' : '') + '</div>';
  }
  const attrs = (o) => (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.cb ? ' data-cb="' + o.cb + '"' : '') +
    (o.change ? ' data-change="' + o.change + '"' : '') + (o.ro ? ' readonly' : '') + (o.list ? ' list="' + o.list + '"' : '') +
    (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '');
  App.ui = {
    field,
    text(id, label, val, o) {
      o = o || {};
      return field(label, '<input class="input" id="' + id + '" value="' + esc(val == null ? '' : val) + '"' + (o.type ? ' type="' + o.type + '"' : '') + attrs(o) + '>', Object.assign({ for: id }, o));
    },
    textarea(id, label, val, o) {
      o = o || {};
      return field(label, '<textarea class="textarea" id="' + id + '" rows="' + (o.rows || 2) + '"' + attrs(o) + '>' + esc(val || '') + '</textarea>', Object.assign({ for: id }, o));
    },
    date(id, label, val, o) {
      o = o || {};
      return field(label, '<input class="input" type="date" id="' + id + '" value="' + esc(val || '') + '"' + attrs(o) + '>', Object.assign({ for: id }, o));
    },
    money(id, label, val, o) {
      o = o || {};
      const wid = o.words ? (id + '-w') : '';
      return field(label,
        '<div class="inline-suffix"><input class="input money" id="' + id + '" inputmode="numeric" data-money' +
        (wid ? ' data-words="' + wid + '"' : '') + attrs(o) + ' value="' + (val ? U.groupThousand(val) : '') + '"><span class="sfx">đ</span></div>' +
        (wid ? '<div class="hint words" id="' + wid + '">' + (val ? 'Bằng chữ: ' + App.docSo(val) : '') + '</div>' : ''),
        Object.assign({ for: id }, o));
    },
    select(id, label, val, options, o) {
      o = o || {};
      const opt = options.map((x) => {
        const v = typeof x === 'object' ? x.v : x, t = typeof x === 'object' ? x.t : x;
        return '<option value="' + esc(v) + '"' + (String(v) === String(val == null ? '' : val) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      return field(label, '<select class="select" id="' + id + '"' + attrs(o) + '>' + opt + '</select>', Object.assign({ for: id }, o));
    },
    datalist(id, values) {
      return '<datalist id="' + id + '">' + (values || []).map((v) => '<option value="' + esc(v) + '">').join('') + '</datalist>';
    },
  };
  App.val = (id) => { const e = document.getElementById(id); return e ? String(e.value).trim() : ''; };
  App.valMoney = (id) => U.toNumber(App.val(id));

  /* ---- Chọn file từ thư viện / máy ---- */
  App.pickFiles = function (accept, multiple) {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || 'image/*,video/*';
      if (multiple) inp.multiple = true;
      inp.style.position = 'fixed'; inp.style.left = '-9999px';
      document.body.appendChild(inp);
      let done = false;
      const finish = () => { if (done) return; done = true; const fs = Array.from(inp.files || []); setTimeout(() => inp.remove(), 100); res(fs); };
      inp.addEventListener('change', finish);
      window.addEventListener('focus', () => setTimeout(() => { if (!done && (!inp.files || !inp.files.length)) finish(); }, 1200), { once: true });
      inp.click();
    });
  };

  // Nén ảnh chụp (thường 3–8MB) xuống ~0,3–0,8MB: cạnh dài tối đa 2000px, JPEG 0,85
  App.compressImage = async function (blob) {
    const t = (blob && blob.type) || '';
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(t) && t !== '') return blob;
    if (blob.size < 700 * 1024) return blob;
    try {
      let bmp;
      try { bmp = await createImageBitmap(blob); }
      catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); }); }
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      const out = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
      if (!out || out.size >= blob.size) return blob;
      try { return new File([out], (blob.name || 'anh').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }); } catch (e) { return out; }
    } catch (e) { return blob; }
  };
  App.prepFiles = async function (list) {
    const out = [];
    for (const b of list) out.push(await App.compressImage(b));
    const big = out.filter((b) => b.size > 6 * 1024 * 1024);
    if (big.length) App.toast(big.length + ' tệp lớn hơn 6MB chỉ lưu trên máy này, không đồng bộ được', 'err');
    return out;
  };

  // Tạo bản ghi ảnh từ File/Blob
  App.makeImage = function (blob, expenseId, eventId, extra) {
    const t = blob.type || '';
    const kind = t.startsWith('video') ? 'video' : (t.startsWith('image') || !t) ? 'image' : 'file';
    return Object.assign({
      id: U.uid(), expenseId: expenseId || null, eventId: eventId || null,
      blob, mime: t || 'image/jpeg', kind,
      note: '', amount: 0, createdAt: U.nowISO(), isNewBlob: true,
    }, extra || {});
  };

  /* ---- Chọn nhiều dòng + thanh thao tác nổi ----
     Trang gọi App.Sel.init('khoá', ids => htmlNút). Dòng có <input class="selc" value="id">,
     ô chọn tất cả <input class="sela">. Nút trong thanh dùng data-act như bình thường. */
  const Sel = {
    scope: '', ids: new Set(), actionsFn: null,
    init(scope, actionsFn) {
      if (this.scope !== scope) { this.scope = scope; this.ids = new Set(); }
      this.actionsFn = actionsFn;
      setTimeout(() => this.paint(), 0);
    },
    list() { return Array.from(this.ids); },
    clear() { this.ids = new Set(); this.paint(); },
    reset() { this.scope = ''; this.ids = new Set(); this.actionsFn = null; const b = document.getElementById('selbar'); if (b) b.classList.remove('show'); },
    paint() {
      const valid = new Set(Array.from(document.querySelectorAll('.selc')).map((c) => c.value));
      this.ids.forEach((id) => { if (!valid.has(id)) this.ids.delete(id); });
      document.querySelectorAll('.selc').forEach((c) => {
        c.checked = this.ids.has(c.value);
        const row = c.closest('tr,.exp'); if (row) row.classList.toggle('sel', c.checked);
      });
      const all = document.querySelectorAll('.selc');
      document.querySelectorAll('.sela').forEach((a) => { a.checked = all.length > 0 && this.ids.size === all.length; a.indeterminate = this.ids.size > 0 && this.ids.size < all.length; });
      let bar = document.getElementById('selbar');
      if (!bar) { bar = document.createElement('div'); bar.id = 'selbar'; bar.className = 'selbar'; document.body.appendChild(bar); }
      if (this.ids.size && this.actionsFn) {
        bar.innerHTML = '<b>Đã chọn ' + this.ids.size + '</b>' + this.actionsFn(this.list()) +
          '<button class="btn out sm icon" data-act="selClear" title="Bỏ chọn" aria-label="Bỏ chọn">' + App.icon('x') + '</button>';
        bar.classList.add('show');
      } else bar.classList.remove('show');
    },
  };
  App.Sel = Sel;
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('selc')) { if (t.checked) Sel.ids.add(t.value); else Sel.ids.delete(t.value); Sel.paint(); }
    else if (t.classList && t.classList.contains('sela')) { document.querySelectorAll('.selc').forEach((c) => { if (t.checked) Sel.ids.add(c.value); else Sel.ids.delete(c.value); }); Sel.paint(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('.chk')) e.stopPropagation(); }, true);
  App.chk = (id) => '<td class="chk"><input type="checkbox" class="selc" value="' + esc(id) + '" aria-label="Chọn"></td>';
  App.chkAll = () => '<th class="chk"><input type="checkbox" class="sela" aria-label="Chọn tất cả"></th>';
  App.actions.selClear = () => Sel.clear();

  /* ---- Trình xem ảnh (lightbox) ----
     App.lightbox([{url, kind, cap, name}], index, elementGốc)
     Mở phóng to từ vị trí ảnh nhỏ, vuốt / phím ← → để chuyển, nhấp đúp để phóng to. */
  App.lightbox = function (items, index, origin) {
    if (!items || !items.length) return;
    let i = Math.max(0, Math.min(index || 0, items.length - 1)), zoom = 1, tx = 0;
    const lb = document.createElement('div');
    lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Xem ảnh');
    lb.innerHTML = '<div class="lb-top"><span class="cnt"></span>' +
      '<button class="lb-btn" data-lb="zoom" title="Phóng to" aria-label="Phóng to">' + App.icon('zoom') + '</button>' +
      '<button class="lb-btn" data-lb="dl" title="Tải ảnh" aria-label="Tải ảnh">' + App.icon('download') + '</button>' +
      '<button class="lb-btn" data-lb="x" title="Đóng" aria-label="Đóng">' + App.icon('x') + '</button></div>' +
      '<div class="lb-stage"><button class="lb-btn lb-nav p" data-lb="p" aria-label="Ảnh trước">' + App.icon('left') + '</button><div class="lb-media"></div>' +
      '<button class="lb-btn lb-nav n" data-lb="n" aria-label="Ảnh sau">' + App.icon('right') + '</button></div>' +
      '<div class="lb-bot"><div class="lb-cap"></div><div class="lb-thumbs">' +
      items.map((it, k) => '<button data-k="' + k + '" aria-label="Ảnh ' + (k + 1) + '">' + (it.kind === 'video' ? App.icon('image') : '<img src="' + it.url + '" alt="">') + '</button>').join('') + '</div></div>';
    document.body.appendChild(lb);
    const media = lb.querySelector('.lb-media'), stage = lb.querySelector('.lb-stage');
    if (items.length < 2) { lb.querySelectorAll('.lb-nav,.lb-thumbs').forEach((x) => { x.style.display = 'none'; }); }

    function el() { return media.firstElementChild; }
    function show(dir, first) {
      const it = items[i];
      zoom = 1; tx = 0;
      media.innerHTML = it.kind === 'video' ? '<video src="' + it.url + '" controls playsinline autoplay></video>' : '<img src="' + it.url + '" alt="' + esc(it.cap || '') + '" draggable="false">';
      const m = el();
      if (!first && dir) m.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
      lb.querySelector('.cnt').textContent = (i + 1) + ' / ' + items.length;
      lb.querySelector('.lb-cap').textContent = it.cap || '';
      lb.querySelectorAll('.lb-thumbs button').forEach((b, k) => { b.classList.toggle('on', k === i); if (k === i) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
      if (first && origin && m.tagName === 'IMG') {
        // hiệu ứng phóng ra từ ảnh nhỏ (FLIP)
        const o = origin.getBoundingClientRect();
        const run = () => {
          const r = m.getBoundingClientRect(); if (!r.width) return;
          const s = Math.max(o.width / r.width, o.height / r.height);
          m.style.transition = 'none';
          m.style.transform = 'translate(' + (o.left + o.width / 2 - (r.left + r.width / 2)) + 'px,' + (o.top + o.height / 2 - (r.top + r.height / 2)) + 'px) scale(' + s + ')';
          m.style.opacity = '.4';
          requestAnimationFrame(() => requestAnimationFrame(() => { m.style.transition = ''; m.style.transform = ''; m.style.opacity = ''; }));
        };
        if (m.complete) run(); else m.onload = run;
      }
    }
    function go(d) { if (items.length < 2) return; i = (i + d + items.length) % items.length; show(d); }
    function close() {
      lb.classList.remove('show');
      const m = el(); if (m) { m.style.transform = 'scale(.92)'; m.style.opacity = '0'; }
      document.removeEventListener('keydown', key);
      setTimeout(() => lb.remove(), 280);
    }
    function setZoom(z) { zoom = z; const m = el(); if (m) m.style.transform = 'scale(' + zoom + ')'; }
    function key(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
    }
    lb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lb],[data-k]');
      if (b) {
        const a = b.getAttribute('data-lb');
        if (a === 'x') close(); else if (a === 'p') go(-1); else if (a === 'n') go(1);
        else if (a === 'zoom') setZoom(zoom > 1 ? 1 : 2);
        else if (a === 'dl') { const it = items[i]; const x = document.createElement('a'); x.href = it.url; x.download = it.name || ('minh-chung-' + (i + 1) + '.jpg'); document.body.appendChild(x); x.click(); x.remove(); }
        else if (b.hasAttribute('data-k')) { const k = +b.getAttribute('data-k'); const d = k > i ? 1 : -1; i = k; show(d); }
        return;
      }
      if (e.target === stage || e.target === media) close();
    });
    stage.addEventListener('dblclick', () => setZoom(zoom > 1 ? 1 : 2.2));
    // vuốt trái / phải trên điện thoại
    let sx = null, sy = 0;
    stage.addEventListener('pointerdown', (e) => { if (zoom > 1) return; sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointermove', (e) => { if (sx == null) return; tx = e.clientX - sx; const m = el(); if (m && Math.abs(tx) > 6) { m.style.transition = 'none'; m.style.transform = 'translateX(' + tx + 'px)'; m.style.opacity = String(1 - Math.min(.5, Math.abs(tx) / 600)); } });
    const end = (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      const m = el(); if (m) { m.style.transition = ''; m.style.transform = ''; m.style.opacity = ''; }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (dy > 110) close();
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    document.addEventListener('keydown', key);
    show(0, true);
    requestAnimationFrame(() => lb.classList.add('show'));
  };
  // ảnh của 1 khoản chi → danh sách cho lightbox
  App.imageItems = function (imgs) {
    return (imgs || []).filter((im) => im.blob && (im.kind === 'image' || im.kind === 'video')).map((im) => ({
      url: App.imgURL(im), kind: im.kind, name: im.name || '', cap: [im.note, im.amount ? U.groupThousand(im.amount) + ' đ' : ''].filter(Boolean).join(' · '),
    }));
  };

  /* ---- Tệp đính kèm của một phiếu (hoá đơn, hợp đồng, chứng từ) ---- */
  App.renderAttachments = function (docId, readonly) {
    const files = App.data.images.filter((im) => im.docId === docId);
    const list = files.map((f) =>
      '<tr><td><div class="row" style="flex-wrap:nowrap">' + App.icon(f.kind === 'image' ? 'image' : 'file', 16) +
      '<span style="word-break:break-word">' + esc(f.name || 'Tệp đính kèm') + '</span></div>' +
      '<span class="sub">' + esc(U.fmtDateTime(f.createdAt)) + '</span></td>' +
      '<td class="acts"><button class="btn out xs" data-act="viewFile:' + f.id + '">' + App.icon('eye') + 'Xem</button>' +
      (readonly ? '' : '<button class="btn ghost icon xs" data-act="delFile:' + f.id + '" title="Xoá tệp" aria-label="Xoá tệp">' + App.icon('trash') + '</button>') + '</td></tr>'
    ).join('');
    return (list ? '<div class="tbl-wrap"><table class="tbl"><tbody>' + list + '</tbody></table></div>'
      : '<p class="muted" style="margin:0;font-size:13px">Chưa có tệp nào.</p>') +
      (readonly ? '' : '<button class="btn out sm mt12" data-act="uploadFile:' + docId + '">' + App.icon('upload') + 'Tải lên hoá đơn / chứng từ</button>');
  };

  Object.assign(App.actions, {
    async uploadFile(docId) {
      const doc = App.data.docs.find((d) => d.id === docId);
      if (!doc) { App.toast('Hãy lưu phiếu trước khi đính kèm tệp', 'err'); return; }
      const files = await App.pickFiles('image/*,application/pdf,.doc,.docx,.xls,.xlsx', true);
      if (!files.length) return;
      for (const f of await App.prepFiles(files)) {
        const rec = App.makeImage(f, null, doc.eventId || null, { docId, name: f.name });
        delete rec.isNewBlob;
        await DB.put('images', rec);
      }
      App.toast('Đã tải lên ' + files.length + ' tệp', 'ok');
      App.reload();
    },
    async viewFile(id) {
      const f = await DB.get('images', id); if (!f || !f.blob) { App.toast('Tệp chưa có trên máy này', 'err'); return; }
      const url = App.imgURL(f);
      if (f.kind === 'image') {
        const imgs = App.data.images.filter((x) => x.docId && x.docId === f.docId && x.kind === 'image' && x.blob);
        App.lightbox(imgs.map((x) => ({ url: App.imgURL(x), kind: 'image', cap: x.name, name: x.name })), Math.max(0, imgs.findIndex((x) => x.id === id)));
        void url;
      } else {
        U.saveBlob(f.blob, U.safeName(f.name || 'tep'));
      }
    },
    delFile(id) {
      App.confirmSheet('Xoá tệp?', 'Tệp đính kèm này sẽ bị xoá.', async () => {
        await DB.del('images', id); App.toast('Đã xoá tệp', 'ok'); App.reload();
      }, true, 'Xoá');
    },
  });
})();
