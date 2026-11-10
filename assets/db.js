/* =========================================================================
   db.js — Lớp dữ liệu IndexedDB (offline). Lưu sự kiện, khoản chi, ảnh minh
   chứng (blob), phiếu đề nghị (tạm ứng / hoàn ứng / thanh toán), cài đặt.
   v2: thêm store "docs" cho phiếu theo mẫu 01-TT/LTL.
   ========================================================================= */
(function (global) {
  'use strict';

  const DB_NAME = 'ltl_hoanung';
  const DB_VER = 2;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const ensure = (name, indexes) => {
          if (db.objectStoreNames.contains(name)) return;
          const s = db.createObjectStore(name, { keyPath: 'id' });
          (indexes || []).forEach((ix) => s.createIndex(ix, ix, { unique: false }));
        };
        ensure('settings');
        ensure('events');
        ensure('advances', ['eventId']);   // dữ liệu cũ (v1) — chỉ đọc để chuyển sang phiếu
        ensure('expenses', ['eventId']);
        ensure('images', ['expenseId', 'eventId']);
        ensure('docs', ['eventId', 'type']);
      };
      req.onsuccess = () => {
        _db = req.result;
        _db.onversionchange = () => { try { _db.close(); } catch (e) {} _db = null; };
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Hãy đóng các tab khác của ứng dụng rồi tải lại trang.'));
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }
  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const DB = {
    open,
    put(store, value) { return tx(store, 'readwrite').then((s) => wrap(s.put(value))).then(() => value); },
    get(store, id) { return tx(store, 'readonly').then((s) => wrap(s.get(id))); },
    del(store, id) { return tx(store, 'readwrite').then((s) => wrap(s.delete(id))); },
    all(store) { return tx(store, 'readonly').then((s) => wrap(s.getAll())); },
    byIndex(store, index, val) {
      return tx(store, 'readonly').then((s) => wrap(s.index(index).getAll(val)));
    },
    clear(store) { return tx(store, 'readwrite').then((s) => wrap(s.clear())); },

    // Xoá theo cascade — luôn đi qua DB.del (đã được cloud.js bọc) để bản ghi
    // trên đám mây cũng bị xoá, không "sống lại" ở lần đồng bộ sau.
    async delImagesByExpense(expenseId) {
      const imgs = await DB.byIndex('images', 'expenseId', expenseId);
      // ảnh chứng từ của phiếu (docId) đi theo phiếu, không xoá theo sự kiện
      for (const i of imgs) if (!i.docId) await DB.del('images', i.id);
    },
    async delExpense(expenseId) {
      await DB.delImagesByExpense(expenseId);
      await DB.del('expenses', expenseId);
    },
    async delEventCascade(eventId) {
      const [exps, advs, imgs, docs] = await Promise.all([
        DB.byIndex('expenses', 'eventId', eventId),
        DB.byIndex('advances', 'eventId', eventId),
        DB.byIndex('images', 'eventId', eventId),
        DB.byIndex('docs', 'eventId', eventId),
      ]);
      for (const i of imgs) await DB.del('images', i.id);
      for (const e of exps) await DB.del('expenses', e.id);
      for (const a of advs) await DB.del('advances', a.id);
      // Phiếu giữ lại (chỉ bỏ liên kết sự kiện) — phiếu là chứng từ, không xoá theo sự kiện.
      // phiếu đã được kế toán khoá thì giữ nguyên (không được sửa)
      for (const d of docs) { if (App.Flow && App.Flow.locked(d)) continue; d.eventId = null; await DB.put('docs', d); }
      await DB.del('events', eventId);
    },
    async clearAllUserData() {
      for (const s of ['events', 'advances', 'expenses', 'images', 'docs']) {
        const rows = await DB.all(s);
        for (const r of rows) await DB.del(s, r.id);
      }
    },

    // xuất toàn bộ dữ liệu (không gồm blob ảnh để gọn — ảnh giữ trong máy)
    async exportJSON() {
      const [settings, events, docs, expenses] = await Promise.all([
        DB.all('settings'), DB.all('events'), DB.all('docs'), DB.all('expenses'),
      ]);
      return { settings, events, docs, expenses, exportedAt: new Date().toISOString() };
    },
  };

  global.DB = DB;
})(window);
