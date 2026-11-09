/* =========================================================================
   trash.js — Xoá mềm vào Thùng rác, khôi phục, xoá vĩnh viễn, dọn sạch.
   Bản ghi xoá mềm có deletedAt (đồng bộ lên đám mây như mọi thay đổi khác),
   tự xoá vĩnh viễn sau App.TRASH_DAYS ngày.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';

  async function getRec(store, id) { return DB.get(store, id); }

  const Trash = {
    // Chuyển vào thùng rác. items: [{store, id}]
    async soft(items, silent) {
      const now = U.nowISO(), done = [];
      for (const it of items) {
        const r = await getRec(it.store, it.id); if (!r || r.deletedAt) continue;
        r.deletedAt = now; await DB.put(it.store, r); done.push(it);
        if (it.store === 'events') {
          // khoản chi của sự kiện đi theo nhóm để khôi phục cùng lúc
          for (const e of await DB.byIndex('expenses', 'eventId', it.id)) {
            if (e.deletedAt) continue; e.deletedAt = now; e.trashGroup = it.id; await DB.put('expenses', e);
          }
        }
      }
      if (!done.length) return;
      await App.reload();
      if (!silent) App.toast('Đã chuyển ' + done.length + ' mục vào thùng rác', 'ok', { label: 'Hoàn tác', fn: () => Trash.restore(done, true) });
    },
    async restore(items, quiet) {
      let n = 0;
      for (const it of items) {
        const r = await getRec(it.store, it.id); if (!r || !r.deletedAt) continue;
        delete r.deletedAt; await DB.put(it.store, r); n++;
        if (it.store === 'events') {
          for (const e of await DB.byIndex('expenses', 'eventId', it.id)) {
            if (e.trashGroup === it.id) { delete e.deletedAt; delete e.trashGroup; await DB.put('expenses', e); }
          }
        }
        if (it.store === 'expenses' && r.eventId) {
          const ev = await getRec('events', r.eventId);
          if (ev && ev.deletedAt) { delete ev.deletedAt; await DB.put('events', ev); }
        }
      }
      await App.reload();
      App.toast(quiet ? 'Đã hoàn tác' : 'Đã khôi phục ' + n + ' mục', 'ok');
    },
    // Xoá vĩnh viễn 1 bản ghi (kèm ảnh / tệp)
    async purge(store, rec) {
      if (store === 'docs') {
        for (const im of await DB.all('images')) if (im.docId === rec.id) await DB.del('images', im.id);
        await DB.del('docs', rec.id);
      } else if (store === 'expenses') {
        await DB.delExpense(rec.id);
      } else if (store === 'events') {
        for (const e of await DB.byIndex('expenses', 'eventId', rec.id)) await DB.delExpense(e.id);
        for (const d of await DB.byIndex('docs', 'eventId', rec.id)) { d.eventId = null; await DB.put('docs', d); }
        await DB.del('events', rec.id);
      }
    },
    async purgeMany(items) {
      for (const it of items) { const r = await getRec(it.store, it.id); if (r) await Trash.purge(it.store, r); }
      await App.reload();
      App.toast('Đã xoá vĩnh viễn ' + items.length + ' mục', 'ok');
    },
  };
  App.Trash = Trash;

  /* ----------------------------- Trang Thùng rác ----------------------------- */
  const KIND = { docs: 'Phiếu', expenses: 'Khoản chi', events: 'Sự kiện' };
  function rowsOf() {
    const t = App.trash || { docs: [], expenses: [], events: [] };
    const deadEv = new Set(t.events.map((e) => e.id));
    const rows = [];
    t.docs.forEach((d) => rows.push({ store: 'docs', rec: d, title: (d.soPhieu || '') + ' — ' + (d.noiDung || ''), sub: App.Docs.TYPES[d.type] ? 'Phiếu ' + App.Docs.TYPES[d.type].label.toLowerCase() : 'Phiếu', amount: App.Docs.total(d), ic: 'file' }));
    t.events.forEach((e) => {
      rows.push({ store: 'events', rec: e, title: e.name, sub: 'Sự kiện · kèm ' + t.expenses.filter((x) => x.trashGroup === e.id).length + ' khoản chi', amount: t.expenses.filter((x) => x.trashGroup === e.id).reduce((a, x) => a + U.toNumber(x.amount), 0), ic: 'calendar' });
    });
    t.expenses.filter((x) => !deadEv.has(x.eventId) && x.trashGroup == null).forEach((x) => rows.push({ store: 'expenses', rec: x, title: x.content, sub: 'Khoản chi · ' + ((App.eventById(x.eventId) || {}).name || ''), amount: U.toNumber(x.amount), ic: 'receipt' }));
    rows.sort((a, b) => (b.rec.deletedAt || '').localeCompare(a.rec.deletedAt || ''));
    return rows;
  }
  const keyOf = (r) => r.store + ':' + r.rec.id;
  const parseKeys = (keys) => keys.map((k) => { const i = k.indexOf(':'); return { store: k.slice(0, i), id: k.slice(i + 1) }; });

  App.screens['thung-rac'] = function (root, route) {
    const tab = route.q.tab || 'all';
    const all = rowsOf();
    const rows = tab === 'all' ? all : all.filter((r) => r.store === tab);
    const daysLeft = (r) => Math.max(0, App.TRASH_DAYS - Math.floor((Date.now() - Date.parse(r.rec.deletedAt)) / 864e5));
    const tb = (k, l, n) => '<button class="' + (tab === k ? 'on' : '') + '" data-act="trashTab:' + k + '">' + l + ' (' + n + ')</button>';
    root.innerHTML = App.pageHead('Thùng rác', 'Mục đã xoá được giữ ' + App.TRASH_DAYS + ' ngày rồi tự xoá vĩnh viễn. Khôi phục bất cứ lúc nào trong thời gian đó.',
      all.length ? '<button class="btn danger-out" data-act="trashEmpty">' + I('trash') + 'Dọn sạch thùng rác</button>' : '', null, 'trash') +
      '<div class="card"><div class="card-h"><div class="seg">' + tb('all', 'Tất cả', all.length) + tb('docs', 'Phiếu', all.filter((r) => r.store === 'docs').length) +
      tb('expenses', 'Khoản chi', all.filter((r) => r.store === 'expenses').length) + tb('events', 'Sự kiện', all.filter((r) => r.store === 'events').length) + '</div></div>' +
      '<div class="card-b flush">' + (rows.length
        ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr>' + App.chkAll() + '<th>Mục</th><th class="num">Số tiền</th><th>Đã xoá lúc</th><th>Tự xoá sau</th><th class="acts"></th></tr></thead><tbody>' +
          rows.map((r) => '<tr>' + App.chk(keyOf(r)) + '<td data-l="' + KIND[r.store] + '"><div class="row" style="flex-wrap:nowrap"><span class="badge out">' + I(r.ic, 13) + KIND[r.store] + '</span><b style="word-break:break-word">' + esc(r.title) + '</b></div><span class="sub">' + esc(r.sub) + '</span></td>' +
            '<td class="num" data-l="Số tiền">' + money(r.amount) + '</td><td data-l="Đã xoá" class="nowrap">' + esc(U.fmtDateTime(r.rec.deletedAt)) + '</td>' +
            '<td data-l="Tự xoá sau"><span class="badge ' + (daysLeft(r) <= 3 ? 'danger' : 'warn') + '">' + daysLeft(r) + ' ngày</span></td>' +
            '<td class="acts"><button class="btn out xs" data-act="trashRestore:' + keyOf(r) + '">' + I('restore') + 'Khôi phục</button>' +
            '<button class="btn danger-out xs" data-act="trashPurge:' + keyOf(r) + '">' + I('trash') + 'Xoá hẳn</button></td></tr>').join('') + '</tbody></table></div>'
        : App.emptyState('trash', 'Thùng rác trống', 'Phiếu, khoản chi hay sự kiện bạn xoá sẽ nằm ở đây ' + App.TRASH_DAYS + ' ngày để có thể khôi phục.')) + '</div></div>';
    App.Sel.init('trash', () => '<button class="btn out sm" data-act="trashRestoreSel">' + I('restore') + 'Khôi phục</button>' +
      '<button class="btn danger sm" data-act="trashPurgeSel">' + I('trash') + 'Xoá vĩnh viễn</button>');
  };

  function confirmPurge(items, after) {
    App.confirmSheet('Xoá vĩnh viễn ' + items.length + ' mục?', 'Không thể khôi phục lại. Ảnh minh chứng và tệp đính kèm cũng bị xoá trên mọi thiết bị.', async () => {
      await Trash.purgeMany(items); if (after) after();
    }, true, 'Xoá vĩnh viễn');
  }

  Object.assign(App.actions, {
    trashTab(t) { App.nav('thung-rac?tab=' + t); },
    trashRestore(k) { return Trash.restore(parseKeys([k])); },
    trashPurge(k) { confirmPurge(parseKeys([k])); },
    trashRestoreSel() { const ks = App.Sel.list(); App.Sel.clear(); return Trash.restore(parseKeys(ks)); },
    trashPurgeSel() { confirmPurge(parseKeys(App.Sel.list()), () => App.Sel.clear()); },
    trashEmpty() { confirmPurge(rowsOf().map((r) => ({ store: r.store, id: r.rec.id }))); },
  });
})();
