/* =========================================================================
   db.js — Lớp dữ liệu IndexedDB (offline). Lưu sự kiện, tạm ứng, khoản chi,
   ảnh minh chứng (blob), cài đặt. Trả về Promise.
   ========================================================================= */
(function (global) {
  'use strict';

  const DB_NAME = 'ltl_hoanung';
  const DB_VER = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('advances')) {
          const s = db.createObjectStore('advances', { keyPath: 'id' });
          s.createIndex('eventId', 'eventId', { unique: false });
        }
        if (!db.objectStoreNames.contains('expenses')) {
          const s = db.createObjectStore('expenses', { keyPath: 'id' });
          s.createIndex('eventId', 'eventId', { unique: false });
        }
        if (!db.objectStoreNames.contains('images')) {
          const s = db.createObjectStore('images', { keyPath: 'id' });
          s.createIndex('expenseId', 'expenseId', { unique: false });
          s.createIndex('eventId', 'eventId', { unique: false });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
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
    put(store, value) { return tx(store, 'readwrite').then((s) => wrap(s.put(value))).then(() => value); },
    get(store, id) { return tx(store, 'readonly').then((s) => wrap(s.get(id))); },
    del(store, id) { return tx(store, 'readwrite').then((s) => wrap(s.delete(id))); },
    all(store) { return tx(store, 'readonly').then((s) => wrap(s.getAll())); },
    byIndex(store, index, val) {
      return tx(store, 'readonly').then((s) => wrap(s.index(index).getAll(val)));
    },
    clear(store) { return tx(store, 'readwrite').then((s) => wrap(s.clear())); },

    // xoá theo cascade khi xoá sự kiện / khoản chi
    delImagesByExpense(expenseId) {
      return DB.byIndex('images', 'expenseId', expenseId).then((imgs) =>
        Promise.all(imgs.map((i) => DB.del('images', i.id))));
    },
    delExpense(expenseId) {
      return DB.delImagesByExpense(expenseId).then(() => DB.del('expenses', expenseId));
    },
    delEventCascade(eventId) {
      return Promise.all([
        DB.byIndex('expenses', 'eventId', eventId),
        DB.byIndex('advances', 'eventId', eventId),
        DB.byIndex('images', 'eventId', eventId),
      ]).then(([exps, advs, imgs]) => Promise.all([
        ...imgs.map((i) => DB.del('images', i.id)),
        ...exps.map((e) => DB.del('expenses', e.id)),
        ...advs.map((a) => DB.del('advances', a.id)),
      ])).then(() => DB.del('events', eventId));
    },

    // xuất / nhập toàn bộ dữ liệu (không gồm blob ảnh để gọn — ảnh giữ trong máy)
    async exportJSON() {
      const [settings, events, advances, expenses] = await Promise.all([
        DB.all('settings'), DB.all('events'), DB.all('advances'), DB.all('expenses'),
      ]);
      return { settings, events, advances, expenses, exportedAt: new Date().toISOString() };
    },
  };

  global.DB = DB;
})(window);
