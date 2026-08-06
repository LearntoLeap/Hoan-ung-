/* =========================================================================
   screen-advance.js — Tạm ứng: nhập phiếu + sinh Giấy đề nghị tạm ứng (Word)
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui;

  function emptyItem() { return { id: U.uid(), content: '', note: '', amount: 0 }; }

  function buildDraft() {
    const ev = App.currentEvent();
    const a = App.view.advance;
    if (a) {
      App.draftAdvance = JSON.parse(JSON.stringify(a));
      if (!App.draftAdvance.items || !App.draftAdvance.items.length) App.draftAdvance.items = [emptyItem()];
    } else {
      App.draftAdvance = {
        id: U.uid(), eventId: ev.id, soPhieu: '', date: U.todayISO(),
        requester: ev.requester || App.settings.requester, dept: ev.dept || App.settings.dept,
        position: ev.position || App.settings.position, reason: ev.name ? ('Phục vụ ' + ev.name) : '',
        items: [emptyItem()], createdAt: U.nowISO(),
      };
    }
    return App.draftAdvance;
  }

  function itemsHTML(items) {
    return items.map((it, i) =>
      '<div class="line-item adv-row" data-i="' + i + '"><div class="ix">' + (i + 1) + '</div>' +
      '<div class="li-body">' +
      '<input class="input adv-content" placeholder="Nội dung khoản chi" value="' + esc(it.content) + '" style="margin-bottom:7px">' +
      '<input class="input adv-note" placeholder="Diễn giải (tuỳ chọn)" value="' + esc(it.note) + '" style="margin-bottom:7px">' +
      '<div class="inline-suffix"><input class="input money adv-amt" inputmode="numeric" data-money data-cb="advTotal" placeholder="Thành tiền" value="' +
      (it.amount ? U.groupThousand(it.amount) : '') + '"><span class="sfx">đ</span></div>' +
      '</div><button class="li-rm" data-act="advDelItem:' + i + '">✕</button></div>'
    ).join('');
  }

  function syncItems() {
    const rows = document.querySelectorAll('.adv-row');
    const items = [];
    rows.forEach((r) => items.push({
      id: U.uid(),
      content: r.querySelector('.adv-content').value.trim(),
      note: r.querySelector('.adv-note').value.trim(),
      amount: U.toNumber(r.querySelector('.adv-amt').value),
    }));
    if (App.draftAdvance) App.draftAdvance.items = items.length ? items : [emptyItem()];
    return App.draftAdvance.items;
  }

  function total() { return (App.draftAdvance.items || []).reduce((s, it) => s + U.toNumber(it.amount), 0); }

  App.inputCb.advTotal = function () {
    syncItems();
    const t = total();
    const el = document.getElementById('adv-total'); if (el) el.textContent = U.groupThousand(t) + ' đ';
    const w = document.getElementById('adv-total-w'); if (w) w.textContent = t ? U.docSoCau(t) : '';
  };

  App.screens.advance = function (root) {
    const ev = App.currentEvent();
    if (!ev) { root.innerHTML = noEvent(); return; }
    const d = buildDraft();

    root.innerHTML =
      '<div class="screen-title">📝 Giấy đề nghị tạm ứng</div>' +
      '<div class="screen-sub">' + esc(ev.name) + '</div>' +
      '<div class="card">' +
      '<div class="row2">' + ui.text('adv-so', 'Số phiếu', d.soPhieu, { ph: '02/ĐNTU-LtL' }) + ui.date('adv-date', 'Ngày đề nghị', d.date) + '</div>' +
      ui.text('adv-req', 'Người đề nghị', d.requester) +
      '<div class="row2">' + ui.text('adv-dept', 'Bộ phận', d.dept) + ui.text('adv-pos', 'Chức vụ', d.position) + '</div>' +
      ui.textarea('adv-reason', 'Lý do tạm ứng', d.reason, { rows: 2, ph: 'Lý do / mục đích sử dụng khoản tạm ứng' }) +
      '</div>' +

      '<div class="section-label">📋 Chi tiết khoản chi tạm ứng</div>' +
      '<div class="card flush" style="padding:13px">' +
      '<div id="adv-items">' + itemsHTML(d.items) + '</div>' +
      '<button class="btn btn-ghost btn-sm" data-act="advAddItem">＋ Thêm khoản</button>' +
      '<div class="divider"></div>' +
      '<div class="kv big"><div class="k">TỔNG CỘNG</div><div class="v" id="adv-total">' + U.groupThousand(total()) + ' đ</div></div>' +
      '<div class="hint words" id="adv-total-w">' + (total() ? U.docSoCau(total()) : '') + '</div>' +
      '</div>' +

      '<div class="btn-row mt8">' +
      '<button class="btn btn-line" data-act="advSave">💾 Lưu</button>' +
      '<button class="btn btn-primary" data-act="genTamUng">📄 Tạo Word</button>' +
      '</div>' +

      App.renderAttachments(App.view.images, 'tamung', 'File tạm ứng đính kèm') +
      '<div style="height:6px"></div>';
  };

  function collect() {
    syncItems();
    const d = App.draftAdvance;
    d.soPhieu = App.val('adv-so'); d.date = App.val('adv-date');
    d.requester = App.val('adv-req'); d.dept = App.val('adv-dept'); d.position = App.val('adv-pos');
    d.reason = App.val('adv-reason'); d.updatedAt = U.nowISO();
    return d;
  }

  Object.assign(App.actions, {
    advAddItem() { syncItems(); App.draftAdvance.items.push(emptyItem()); document.getElementById('adv-items').innerHTML = itemsHTML(App.draftAdvance.items); App.inputCb.advTotal(); },
    advDelItem(i) { syncItems(); App.draftAdvance.items.splice(+i, 1); if (!App.draftAdvance.items.length) App.draftAdvance.items = [emptyItem()]; document.getElementById('adv-items').innerHTML = itemsHTML(App.draftAdvance.items); App.inputCb.advTotal(); },
    async advSave() {
      const d = collect();
      await DB.put('advances', d);
      App.toast('Đã lưu phiếu tạm ứng', 'ok');
      App.reload();
    },
    async genTamUng() {
      const d = collect();
      if (!total()) { App.toast('Chưa có khoản chi nào', 'err'); return; }
      await DB.put('advances', d);
      App.toast('Đang tạo file Word…');
      try { await App.Docgen.tamUng({ settings: App.settings, event: App.currentEvent(), advance: d }); }
      catch (e) { App.toast('Lỗi tạo file: ' + e.message, 'err'); }
    },
  });

  function noEvent() {
    return '<div class="empty"><div class="ic">📅</div><div class="et">Chưa chọn sự kiện</div>' +
      '<div class="es">Hãy tạo hoặc chọn một sự kiện để lập phiếu tạm ứng.</div>' +
      '<button class="btn btn-primary" data-act="addEvent" style="max-width:240px;margin:0 auto">＋ Tạo sự kiện</button></div>';
  }
  App.noEvent = noEvent;
})();
