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
      for (const f of files) {
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
        App.openSheet(App.sheetHead(f.name || 'Ảnh') + '<img src="' + url + '" alt="" style="width:100%;border-radius:10px;background:#000">', { wide: true });
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
