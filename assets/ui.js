/* =========================================================================
   ui.js — Helpers giao diện dùng chung: ô nhập tiền, builder form, chọn file,
   tệp đính kèm, đọc số thành chữ trực tiếp.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc;
  App.inputCb = {};

  /* ---- Live format ô tiền + đọc chữ ---- */
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-money]')) return;
    const n = U.toNumber(t.value);
    t.value = n ? U.groupThousand(n) : '';
    const wid = t.getAttribute('data-words');
    if (wid) { const el = document.getElementById(wid); if (el) el.textContent = n ? ('Bằng chữ: ' + U.docSoCau(n)) : ''; }
    const cb = t.getAttribute('data-cb'); if (cb && App.inputCb[cb]) App.inputCb[cb](t);
  });

  /* ---- Field builders (trả về HTML) ---- */
  function field(label, inner, req) {
    return '<div class="field"><label>' + esc(label) + (req ? ' <span class="req">*</span>' : '') + '</label>' + inner + '</div>';
  }
  App.ui = {
    field,
    text(id, label, val, opts) {
      opts = opts || {};
      return field(label,
        '<input class="input" id="' + id + '" value="' + esc(val || '') + '"' +
        (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.type ? ' type="' + opts.type + '"' : '') + '>',
        opts.req);
    },
    textarea(id, label, val, opts) {
      opts = opts || {};
      return field(label,
        '<textarea class="textarea" id="' + id + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') +
        (opts.rows ? ' rows="' + opts.rows + '"' : '') + '>' + esc(val || '') + '</textarea>', opts.req);
    },
    date(id, label, val, opts) {
      opts = opts || {};
      return field(label, '<input class="input" type="date" id="' + id + '" value="' + esc(val || '') + '">', opts.req);
    },
    money(id, label, val, opts) {
      opts = opts || {};
      const wid = opts.words ? (id + '-w') : '';
      return field(label,
        '<div class="inline-suffix"><input class="input money" id="' + id + '" inputmode="numeric" data-money' +
        (wid ? ' data-words="' + wid + '"' : '') + (opts.cb ? ' data-cb="' + opts.cb + '"' : '') +
        ' value="' + (val ? U.groupThousand(val) : '') + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') +
        '><span class="sfx">đ</span></div>' +
        (wid ? '<div class="hint words" id="' + wid + '">' + (val ? 'Bằng chữ: ' + U.docSoCau(val) : '') + '</div>' : ''),
        opts.req);
    },
    select(id, label, val, options, opts) {
      opts = opts || {};
      let o = options.map((x) => {
        const v = typeof x === 'object' ? x.v : x, t = typeof x === 'object' ? x.t : x;
        return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      return field(label, '<select class="select" id="' + id + '">' + o + '</select>', opts.req);
    },
  };
  App.val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
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
      window.addEventListener('focus', () => setTimeout(() => { if (!done && (!inp.files || !inp.files.length)) finish(); }, 800), { once: true });
      inp.click();
    });
  };

  // Tạo bản ghi ảnh từ File/Blob
  App.makeImage = function (blob, expenseId, eventId, extra) {
    const kind = (blob.type || '').startsWith('video') ? 'video' : 'image';
    return Object.assign({
      id: U.uid(), expenseId: expenseId || null, eventId: eventId || null,
      blob, mime: blob.type || 'image/jpeg', kind,
      note: '', amount: 0, createdAt: U.nowISO(),
    }, extra || {});
  };

  /* ---- Tệp đính kèm cấp sự kiện (file tạm ứng / hoàn ứng / thanh toán) ---- */
  App.renderAttachments = function (images, docType, title) {
    const files = App.eventFiles(images, docType);
    let list = files.map((f) => {
      const isImg = f.kind === 'image';
      return '<div class="line-item"><div class="ix">📎</div><div class="li-body">' +
        '<div class="b" style="font-size:13.5px;word-break:break-word">' + esc(f.name || (f.kind + ' đính kèm')) + '</div>' +
        '<div class="muted" style="font-size:11.5px">' + esc(U.fmtDateTime(f.createdAt)) + '</div></div>' +
        '<button class="btn btn-sm btn-soft" data-act="viewFile:' + f.id + '">Xem</button>' +
        '<button class="li-rm" data-act="delFile:' + f.id + '">✕</button></div>';
    }).join('');
    return '<div class="section-label">' + esc(title) + '</div>' +
      (list || '<p class="muted" style="font-size:12.5px;margin:0 0 10px">Chưa có tệp nào.</p>') +
      '<button class="btn btn-ghost btn-sm" data-act="uploadFile:' + docType + '">Tải lên tệp</button>';
  };

  // actions dùng chung cho attachments
  Object.assign(App.actions, {
    async uploadFile(docType) {
      const ev = App.currentEvent(); if (!ev) return;
      const files = await App.pickFiles('*/*', true);
      if (!files.length) return;
      for (const f of files) {
        const rec = App.makeImage(f, null, ev.id, { docType, name: f.name });
        await DB.put('images', rec);
      }
      App.toast('Đã tải lên ' + files.length + ' tệp', 'ok');
      App.reload();
    },
    async viewFile(id) {
      const f = await DB.get('images', id); if (!f) return;
      const url = App.imgURL(f);
      if (f.kind === 'image') {
        App.openSheet('<div class="sheet-h"><div class="st">' + esc(f.name || 'Ảnh') + '</div>' +
          '<button class="icon-btn x" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
          '<img src="' + url + '" style="width:100%;border-radius:14px">');
      } else {
        U.saveBlob(f.blob, U.safeName(f.name || 'tep'));
      }
    },
    delFile(id) {
      App.confirmSheet('Xoá tệp?', 'Tệp đính kèm này sẽ bị xoá khỏi sự kiện.', async () => {
        await DB.del('images', id); App.toast('Đã xoá tệp', 'ok'); App.reload();
      }, true);
    },
  });
})();
