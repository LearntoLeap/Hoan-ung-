/* =========================================================================
   cloud.js — Tài khoản + đồng bộ với MÁY CHỦ RIÊNG trên VPS (/api), offline-first.
   - Bắt buộc đăng nhập. Mỗi tài khoản chỉ thấy dữ liệu của chính mình
     (máy chủ chỉ trả dữ liệu của người đăng nhập).
   - 1 Quản trị + 1 Kế toán cố định được ĐỌC dữ liệu mọi tài khoản để kiểm soát.
   - IndexedDB là nguồn chính; hợp nhất theo updatedAt (last-write-wins).
   - Xoá: xoá ngay trên đám mây nếu online, nếu offline thì ghi "bia mộ" để xoá
     ở lần đồng bộ sau (tránh bản ghi đã xoá sống lại).
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const esc = U.esc, I = App.icon;

  const OWNER_KEY = 'ltl_owner';
  const TOMB_KEY = 'ltl_tombs';
  const SYNCED = { events: 'event', advances: 'advance', expenses: 'expense', images: 'image', settings: 'settings', docs: 'doc' };
  const KIND_STORE = { event: 'events', advance: 'advances', expense: 'expenses', image: 'images', settings: 'settings', doc: 'docs' };

  const Cloud = {
    client: null, user: null, isAdmin: false, role: 'staff',
    state: 'idle',       // idle | offline | signedout | syncing | ok | error
    lastSync: localStorage.getItem('ltl_lastsync') || '',
    _applying: false, _pushTimer: null,
  };
  App.cloud = Cloud;

  // Máy chủ riêng: cùng tên miền, đường dẫn /api (aaPanel → Node trên VPS)
  const API_BASE = (window.LTL_API || '') + '/api';
  const TOKEN_KEY = 'ltl_token', USER_KEY = 'ltl_user';
  Cloud.ready = () => !!(Cloud.user && Cloud.token && navigator.onLine && !Cloud.demo);
  try { Cloud.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { Cloud.token = ''; }
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (Cloud.token) headers.Authorization = 'Bearer ' + Cloud.token;
    const r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && Cloud.token && !/^\/auth\/(login|signup)/.test(path)) sessionExpired();
    if (!r.ok) { const e = new Error((j && j.error) || ('Máy chủ trả lỗi ' + r.status)); e.status = r.status; throw e; }
    return j || {};
  }
  Cloud.api = api;
  function toUser(u) { return u ? { id: u.id, email: u.email, role: u.role, blocked: !!u.blocked, user_metadata: { full_name: u.full_name || '', dept: u.dept || '' } } : null; }
  function setSession(res) {
    Cloud.token = res.token || Cloud.token; Cloud.user = toUser(res.user);
    try { localStorage.setItem(TOKEN_KEY, Cloud.token); localStorage.setItem(USER_KEY, JSON.stringify(res.user)); } catch (e) {}
  }
  // mật khẩu bị đổi / phiên hết hạn: về màn đăng nhập, GIỮ dữ liệu trên máy (đăng nhập lại cùng tài khoản sẽ đồng bộ tiếp)
  function sessionExpired() {
    if (!Cloud.token) return;
    Cloud.token = ''; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    if (App.Flow) App.Flow.stop();
    Cloud.user = null; setState('signedout');
    App.toast('Phiên đăng nhập hết hạn hoặc mật khẩu đã đổi — vui lòng đăng nhập lại', 'err');
    if (App.afterLogout) App.afterLogout();
  }
    // Chế độ demo CHỈ dùng khi chạy thử trên máy (localhost): không kết nối đám mây.
  const LOCAL_DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (LOCAL_DEV && /[?&]demo=(1|admin)/.test(location.search)) { try { localStorage.setItem('ltl_demo', /demo=admin/.test(location.search) ? 'admin' : '1'); } catch (e) {} }
  // Dùng thử: chạy hoàn toàn trên máy, không cần tài khoản, không đồng bộ
  Cloud.isDemo = () => !!Cloud.demo;

  async function ensureClient() {
    if (!Cloud.user && Cloud.token) { try { Cloud.user = toUser(JSON.parse(localStorage.getItem(USER_KEY) || 'null')); } catch (e) { Cloud.user = null; } }
    return true;
  }

  /* ----------------------------- Trạng thái ----------------------------- */
  function setState(s) { Cloud.state = s; updateBadge(); }
  function updateBadge() {
    const st = !navigator.onLine ? 'offline' : Cloud.state === 'syncing' ? 'syncing' : Cloud.state === 'error' ? 'error' : Cloud.user ? 'ok' : 'off';
    const el = document.getElementById('sync-dot');
    if (el) {
      el.setAttribute('data-state', st);
      const b = el.closest('button');
      if (b) b.title = st === 'offline' ? 'Đang offline — sẽ đồng bộ khi có mạng' : st === 'syncing' ? 'Đang đồng bộ…' : st === 'error' ? 'Lỗi đồng bộ — bấm để thử lại' :
        'Đã đồng bộ' + (Cloud.lastSync ? ' lúc ' + U.fmtDateTime(Cloud.lastSync) : '') + ' — bấm để đồng bộ ngay';
    }
  }
  Cloud.updateBadge = updateBadge;

  /* ----------------------------- Cách ly dữ liệu theo tài khoản ----------------------------- */
  async function clearLocalData() {
    Cloud._applying = true;
    try { for (const store in SYNCED) { try { await DB.clear(store); } catch (e) {} } }
    finally { Cloud._applying = false; }
    try { Object.values(App.urls || {}).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} }); } catch (e) {}
    App.urls = {};
    try { localStorage.removeItem(TOMB_KEY); localStorage.removeItem('ltl_lastsync'); } catch (e) {}
    Cloud.lastSync = '';
  }
  async function enforceAccount(userId) {
    let prev = '';
    try { prev = localStorage.getItem(OWNER_KEY) || ''; } catch (e) {}
    if (prev && prev !== userId) await clearLocalData();
    try { localStorage.setItem(OWNER_KEY, userId); } catch (e) {}
  }

  /* ----------------------------- Auth ----------------------------- */
  async function signIn(email, password) {
    setSession(await api('POST', '/auth/login', { email, password }));
  }
  async function signUp(email, password, meta) {
    setSession(await api('POST', '/auth/signup', { email, password, name: (meta || {}).full_name || '', dept: (meta || {}).dept || '' }));
    return { session: true };
  }
  async function signOut() {
    const wasDemo = Cloud.demo;
    if (App.Flow) App.Flow.stop();
    if (wasDemo) { try { localStorage.removeItem('ltl_demo'); } catch (e) {} Cloud.demo = false; if (App.Demo) await App.Demo.wipe(); }
    Cloud.token = ''; try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
    Cloud.user = null; Cloud.isAdmin = false; Cloud.role = 'staff'; authTab = 'login';
    await clearLocalData();
    try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
    setState('signedout');
    try { await App.ensureSettings(); } catch (e) {}
  }

  // Vai trò: admin / ketoan (quyền như nhau, xem tất cả) / staff (chỉ dữ liệu của mình)
  const ROLE_KEY = (id) => 'ltl_role_' + id;
  function setRole(r) {
    Cloud.role = r === 'admin' || r === 'ketoan' ? r : 'staff';
    Cloud.isAdmin = Cloud.role !== 'staff';
  }
  function cachedRole() {
    let r = ''; try { r = localStorage.getItem(ROLE_KEY(Cloud.user && Cloud.user.id)) || ''; } catch (e) {}
    if (!r) { try { r = localStorage.getItem('ltl_admin_' + (Cloud.user && Cloud.user.id)) === '1' ? 'admin' : 'staff'; } catch (e) {} }
    setRole(r);
  }
  async function checkAdmin() {
    if (Cloud.demo) return;
    if (!Cloud.ready()) { cachedRole(); return; }
    let r = null;
    try { const me = await api('GET', '/auth/me'); r = me.user.role; try { localStorage.setItem(USER_KEY, JSON.stringify(me.user)); } catch (e) {} Cloud.user.blocked = !!me.user.blocked; } catch (e) { r = null; }
    if (r == null) { cachedRole(); return; }
    setRole(r);
    try { localStorage.setItem(ROLE_KEY(Cloud.user.id), Cloud.role); } catch (e) {}
  }
  // Ghi hồ sơ tài khoản để quản trị thấy danh sách người dùng (bỏ qua nếu bảng chưa tạo)
  async function upsertProfile() {
    if (!Cloud.ready()) return;
    const s = App.settings || {};
    const meta = (Cloud.user && Cloud.user.user_metadata) || {};
    try { await api('PUT', '/profile', { full_name: s.hoTen || meta.full_name || '', dept: s.boPhan || meta.dept || '', position: s.chucVu || '' }); } catch (e) {}
  }
  Cloud.upsertProfile = upsertProfile;

  // Sau khi có phiên: cách ly dữ liệu → kéo dữ liệu → quyền admin → vào app
  async function onSignedIn() {
    if (!Cloud.user) return;
    await enforceAccount(Cloud.user.id);
    await checkAdmin();
    try { if (App.Flow) await App.Flow.poll({ quiet: true }); } catch (e) {}   // biết phiếu nào đã khoá trước khi đẩy lên
    try { await sync(); } catch (e) {}
    await App.ensureSettings();
    const meta = Cloud.user.user_metadata || {};
    if (!App.settings.hoTen && meta.full_name) {
      App.settings.hoTen = meta.full_name; App.settings.boPhan = App.settings.boPhan || meta.dept || '';
      App.settings.tenTK = App.settings.tenTK || meta.full_name;
      await DB.put('settings', App.settings);
    }
    await checkAdmin();
    upsertProfile();
    setState(navigator.onLine ? 'ok' : 'offline');
    await App.afterLogin();
  }

  /* ----------------------------- base64 ↔ blob ----------------------------- */
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  async function dataURLToBlob(u) { const r = await fetch(u); return r.blob(); }

  /* ----------------------------- Đồng bộ ----------------------------- */
  // Thiết kế:
  //  • Xoá = ghi "bia mộ" lên server (dòng giữ nguyên id, data = {_deleted:true}) để
  //    mọi thiết bị khác cũng xoá theo, không bao giờ đẩy bản ghi đã xoá lên lại.
  //  • Đọc metadata theo trang 1000 dòng (giới hạn mặc định của Supabase).
  //  • Ghi dữ liệu kéo về bằng hàm put gốc (không đóng dấu, không đẩy), và bỏ qua
  //    bản ghi người dùng vừa sửa trong lúc đang đồng bộ.
  //  • Đẩy lên theo lô giới hạn dung lượng; ảnh quá lớn chỉ đẩy thông tin.
  const tsOf = (rec) => rec.updatedAt || rec.createdAt || '1970-01-01T00:00:00.000Z';
  const MAX_BLOB = 6 * 1024 * 1024, BATCH_BYTES = 3 * 1024 * 1024;
  async function gatherLocal() {
    const rows = [];
    for (const store in SYNCED) {
      let recs; try { recs = await DB.all(store); } catch (e) { recs = []; }
      (recs || []).forEach((rec) => { if (rec && rec.id) rows.push({ id: String(rec.id), store, kind: SYNCED[store], updated_at: tsOf(rec), rec }); });
    }
    return rows;
  }
  async function serializeForRemote(item) {
    let data;
    if (item.kind === 'image') {
      const r = item.rec;
      data = {
        id: r.id, eventId: r.eventId || null, expenseId: r.expenseId || null, docId: r.docId || null,
        kind: r.kind || 'image', mime: r.mime || 'image/jpeg', name: r.name || '',
        note: r.note || '', amount: r.amount || 0, docType: r.docType || null,
        createdAt: r.createdAt || null, updatedAt: item.updated_at,
      };
      if (r.blob) {
        if (r.blob.size > MAX_BLOB) data._skipped = true;
        else { try { data.b64 = await blobToDataURL(r.blob); } catch (e) { data._skipped = true; } }
      } else data._skipped = true;
    } else {
      data = Object.assign({}, item.rec, { updatedAt: item.updated_at });
      if (item.kind === 'doc' && App.Docs) data.total = App.Docs.total(item.rec);
    }
    return { id: item.id, kind: item.kind, updated_at: item.updated_at, data };
  }
  // làm sạch mã định danh trong dữ liệu kéo về (chặn chèn mã qua id)
  const ID_FIELDS = ['eventId', 'expenseId', 'docId', 'tuDocId', 'huDocId', 'itemId', 'legacyId'];
  function cleanIds(rec) {
    ID_FIELDS.forEach((k) => { if (rec[k] != null && !U.isId(String(rec[k]))) rec[k] = null; });
    if (Array.isArray(rec.items)) rec.items.forEach((it) => { if (it && it.id && !U.isId(String(it.id))) it.id = U.uid(); if (it && it.expenseId && !U.isId(String(it.expenseId))) it.expenseId = null; });
    return rec;
  }
  Cloud.cleanIds = cleanIds;
  async function applyRemoteToLocal(row, gathered) {
    const store = KIND_STORE[row.kind]; if (!store || !U.isId(String(row.id))) return false;
    // người dùng vừa sửa bản ghi này trong lúc đồng bộ → giữ bản trên máy, lần sau đẩy lên
    const cur = await DB.get(store, row.id);
    const g = gathered.get(String(row.id));
    if (cur && (!g || tsOf(cur) !== g.updated_at)) return false;
    const data = row.data || {};
    const rec = cleanIds(Object.assign({}, data, { id: row.id, updatedAt: row.updated_at }));
    if (row.kind === 'image') {
      delete rec.b64; delete rec._skipped;
      if (data.b64 && !data._skipped) { try { rec.blob = await dataURLToBlob(data.b64); } catch (e) { rec._noBlob = true; } }
      else rec._noBlob = true;   // ảnh quá lớn chỉ có trên máy gốc — vẫn lưu thông tin để khỏi kéo lại mãi
    }
    await _put(store, rec);
    return true;
  }
  // bia mộ chờ đẩy lên: [{id, kind}]
  function tombs() {
    try { return (JSON.parse(localStorage.getItem(TOMB_KEY) || '[]') || []).map((t) => (typeof t === 'string' ? { id: t, kind: 'doc' } : t)).filter((t) => t && t.id); }
    catch (e) { return []; }
  }
  function saveTombs(t) { try { localStorage.setItem(TOMB_KEY, JSON.stringify(t)); } catch (e) {} }
  function addTomb(id, kind) { const t = tombs(); if (!t.some((x) => x.id === id)) { t.push({ id, kind, at: U.nowISO() }); saveTombs(t); } }
  Cloud.pendingDeletes = () => tombs().length;

  async function pagedMeta() { return (await api('GET', '/sync/meta')).rows || []; }
  // rejected: Set nhận id các dòng máy chủ từ chối (phiếu đã được kế toán khoá) — bỏ qua, không làm hỏng cả lô
  async function upsertBatches(rows, rejected) {
    let batch = [], bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const res = await api('POST', '/sync/push', { rows: batch });
      (res.rejected || []).forEach((id) => { if (rejected) rejected.add(String(id)); });
      batch = []; bytes = 0;
    };
    for (const r of rows) {
      const sz = JSON.stringify(r.data).length;
      if (batch.length && (bytes + sz > BATCH_BYTES || batch.length >= 30)) await flush();
      batch.push(r); bytes += sz;
    }
    await flush();
  }

  async function sync(opts) {
    opts = opts || {};
    if (Cloud.demo) { if (opts.loud) App.toast('Đang dùng thử — không đồng bộ', 'err'); return false; }
    await ensureClient();
    if (!Cloud.user) { if (opts.loud) App.toast('Chưa đăng nhập', 'err'); return false; }
    if (!navigator.onLine) { setState('offline'); if (opts.loud) App.toast('Đang offline — sẽ đồng bộ khi có mạng', 'err'); return false; }
    if (Cloud.state === 'syncing') { Cloud._again = true; return false; }
    setState('syncing');
    const startedAt = Date.now();
    let pushed = 0, pulled = 0, removed = 0;
    try {
      // 0) đẩy các lần xoá (bia mộ) lên server
      const locked = (id) => !!(App.Flow && App.Flow.serverLocked(id));
      const rejected = new Set();
      const t = tombs();
      if (t.length) {
        const now = U.nowISO();
        // phiếu đã khoá không được xoá → bỏ bia mộ, lần kéo về sẽ khôi phục
        const okT = t.filter((x) => !(x.kind === 'doc' && locked(x.id)));
        await upsertBatches(okT.map((x) => ({ id: x.id, kind: x.kind || 'doc', updated_at: x.at || now, data: { _deleted: true } })), rejected);
        const done = new Set(t.map((x) => x.id));
        saveTombs(tombs().filter((x) => !done.has(x.id)));   // giữ bia mộ phát sinh trong lúc đẩy
      }
      const localRows = await gatherLocal();
      const remoteMeta = await pagedMeta();
      const remoteMap = new Map(remoteMeta.map((r) => [String(r.id), r]));
      const localMap = new Map(localRows.map((r) => [r.id, r]));
      const ids = new Set([...remoteMap.keys(), ...localMap.keys()]);
      const toRemote = [], toLocalIds = [], toDelete = [];
      ids.forEach((id) => {
        const L = localMap.get(id), R = remoteMap.get(id);
        const lt = L ? Date.parse(L.updated_at) || 0 : 0, rt = R ? Date.parse(R.updated_at) || 0 : 0;
        if (R && R.del) { if (L) { if (lt > rt) toRemote.push(L); else toDelete.push(L); } return; }
        // phiếu đã được kế toán khoá: không đẩy bản trên máy, luôn lấy bản máy chủ
        if (L && R && L.kind === 'doc' && locked(id)) { if (lt !== rt) toLocalIds.push(id); return; }
        if (L && R) { if (lt > rt) toRemote.push(L); else if (rt > lt) toLocalIds.push(id); }
        else if (L) toRemote.push(L); else if (R) toLocalIds.push(id);
      });
      if (toRemote.length) {
        const rows = [];
        for (const it of toRemote) rows.push(await serializeForRemote(it));
        await upsertBatches(rows, rejected);
        pushed = rows.length - rejected.size;
        rejected.forEach((id) => { if (remoteMap.has(id) && !toLocalIds.includes(id)) toLocalIds.push(id); });
      }
      for (const L of toDelete) { await _del(L.store, L.id); removed++; }
      for (let i = 0; i < toLocalIds.length; i += 12) {
        const { rows } = await api('POST', '/sync/pull', { ids: toLocalIds.slice(i, i + 12) });
        for (const R of (rows || [])) if (await applyRemoteToLocal(R, localMap)) pulled++;
      }
      Cloud.lastSync = U.nowISO();
      Cloud._syncedAt = startedAt;
      localStorage.setItem('ltl_lastsync', Cloud.lastSync);
      setState('ok');
      if (opts.loud) App.toast('Đã đồng bộ (' + pushed + ' lên · ' + pulled + ' về' + (removed ? ' · ' + removed + ' xoá' : '') + ')', 'ok');
      if ((pulled || removed) && App.user && !(App.route && App.route.name === 'phieu') && !document.querySelector('#modal-root .overlay')) App.reload();
      return true;
    } catch (e) {
      setState('error');
      if (opts.loud || !opts.quiet) App.toast('Lỗi đồng bộ: ' + (e.message || e), 'err');
      if (opts.throw) throw e;
      return false;
    } finally {
      if (Cloud._again) { Cloud._again = false; setTimeout(() => Cloud.maybeSync(), 1500); }
    }
  }
  Cloud.sync = sync;
  // Đồng bộ hết trước khi đăng xuất: true nếu không còn gì chưa đẩy lên
  Cloud.flush = async function () {
    if (Cloud.demo) return true;
    for (let i = 0; i < 30 && Cloud.state === 'syncing'; i++) await new Promise((r) => setTimeout(r, 500));
    if (!Cloud.ready()) return false;
    clearTimeout(Cloud._pushTimer);
    const ok = await sync({ quiet: true });
    if (!ok) return false;
    if (tombs().length) return false;
    // có sửa gì sau khi lần đồng bộ vừa rồi bắt đầu không?
    return !(Cloud._dirtyAt && Cloud._dirtyAt >= (Cloud._syncedAt || 0));
  };

  function schedulePush() {
    if (!Cloud.ready()) return;
    clearTimeout(Cloud._pushTimer);
    Cloud._pushTimer = setTimeout(() => { sync({ quiet: true }); }, 2500);
  }
  Cloud.maybeSync = () => { if (Cloud.ready()) sync({ quiet: true }); };

  /* ----------------------------- Bọc DB.put / DB.del ----------------------------- */
  const _put = DB.put.bind(DB);
  Cloud._rawPut = _put;   // ghi nguyên trạng (không đóng dấu giờ, không đẩy) — dùng khi nạp dữ liệu
  DB.put = function (store, value) {
    if (SYNCED[store] && value && typeof value === 'object') { value.updatedAt = U.nowISO(); Cloud._dirtyAt = Date.now(); }
    return _put(store, value).then((v) => { if (SYNCED[store]) schedulePush(); return v; });
  };
  const _del = DB.del.bind(DB);
  DB.del = function (store, id) {
    return _del(store, id).then((v) => {
      // luôn ghi bia mộ (kể cả khi offline / phiên hết hạn); lần đồng bộ sau sẽ đẩy lên
      if (SYNCED[store] && !Cloud.demo) { addTomb(String(id), SYNCED[store]); Cloud._dirtyAt = Date.now(); schedulePush(); }
      return v;
    });
  };

  /* ----------------------------- Khởi động ----------------------------- */
  Cloud.init = async function () {
    let demo = ''; try { demo = localStorage.getItem('ltl_demo') || ''; } catch (e) {}
    // BẢN CHÍNH THỨC: không còn chế độ dùng thử (chỉ giữ trên máy lập trình localhost để kiểm thử)
    if (demo && !LOCAL_DEV) {
      demo = '';
      try { localStorage.removeItem('ltl_demo'); } catch (e) {}
      let ow = ''; try { ow = localStorage.getItem(OWNER_KEY) || ''; } catch (e) {}
      if (/^(demo-|local-demo)/.test(ow)) { await clearLocalData(); try { localStorage.removeItem(OWNER_KEY); } catch (e) {} }
      try { indexedDB.deleteDatabase('ltl_demo_srv'); } catch (e) {}
    }
    if (demo && App.Demo) {
      try { await App.Demo.resume(); setState('ok'); return; }
      catch (e) { console.error(e); try { localStorage.removeItem('ltl_demo'); } catch (er) {} Cloud.demo = false; Cloud.user = null; }
    }
    if (!Cloud._interval) Cloud._interval = setInterval(() => { Cloud.maybeSync(); }, 60000);
    try { await ensureClient(); } catch (e) { setState('error'); }
    if (Cloud.user) {
      // đã có phiên lưu trên máy (kể cả offline) → vào thẳng app
      await enforceAccount(Cloud.user.id);
      await App.ensureSettings();
      cachedRole();
      setState(navigator.onLine ? 'ok' : 'offline');
      // đồng bộ + kiểm tra quyền chạy nền, không chặn giao diện
      setTimeout(async () => {
        const was = Cloud.role;
        await checkAdmin();
        try { if (App.Flow && App.user) await App.Flow.poll({ quiet: true }); } catch (e) {}
        try { await sync({ quiet: true }); } catch (e) {}
        upsertProfile();
        if (was !== Cloud.role && App.user) { if (App.Flow) App.Flow.start(); App.render(); }
      }, 50);
    } else setState('signedout');
  };
  window.addEventListener('online', () => { updateBadge(); Cloud.maybeSync(); });
  window.addEventListener('offline', () => setState('offline'));

  /* ----------------------------- Màn đăng nhập / đăng ký ----------------------------- */
  let authTab = 'login';
  App.screens.login = function (root) {
    const dark = App.isDark();
    const ui = App.ui;
    const chip = (ic, t) => '<span>' + I(ic, 14) + t + '</span>';
    const signup = authTab === 'signup';
    root.innerHTML = '<div class="auth">' +
      '<div class="auth-main"><div class="auth-box fade-in">' +
      '<div class="auth-brand"><div class="row"><span class="bm"><img src="assets/logo-mark.png" alt=""></span><span><b>Tạm ứng &amp; Hoàn ứng</b><small>Learn to Leap · Hệ thống quản lý chứng từ</small></span></div>' +
      '<button class="tb-btn" data-act="toggleTheme" aria-label="Đổi giao diện sáng/tối">' + I(dark ? 'sun' : 'moon') + '</button></div>' +
      '<div class="card">' +
      (!signup
        ? '<h2 class="t">Chào mừng trở lại</h2><p class="lead">Nhập email và mật khẩu để đăng nhập.</p>' +
          '<form id="auth-form" novalidate>' + ui.text('au-email', 'Email', '', { type: 'email', auto: 'username', ph: 'ban@learntoleap.vn' }) +
          ui.text('au-pass', 'Mật khẩu', '', { type: 'password', auto: 'current-password', ph: 'Mật khẩu' }) +
          '<label class="switch" style="margin:-2px 0 14px"><input type="checkbox" checked disabled> Ghi nhớ đăng nhập trên máy này</label>' +
          '<button class="btn block lg" type="submit" id="au-go">Đăng nhập</button></form>' +
          '<div class="center mt16 muted" style="font-size:13.5px">Chưa có tài khoản? <a href="#" data-act="authTab:signup"><b class="grad-text">Tạo tài khoản</b></a></div>' +
          '<div class="center mt8"><button class="btn ghost sm" data-act="forgotPass" style="text-transform:none">Quên mật khẩu?</button></div>' +
          (LOCAL_DEV ? '<div class="sn-hr" style="margin:18px 0"></div><button class="btn out block" data-act="tryDemo">' + I('sparkle') + 'Dùng thử (chỉ trên máy lập trình)</button>' : '')
        : '<h2 class="t">Tạo tài khoản</h2><p class="lead">Mỗi người tự tạo tài khoản bằng email công việc. Thông tin này được điền sẵn vào phiếu.</p>' +
          '<form id="auth-form" novalidate>' + ui.text('au-name', 'Họ và tên', '', { auto: 'name', ph: 'Nguyễn Văn A', req: true }) +
          ui.text('au-dept', 'Bộ phận', '', { list: 'au-dl', ph: 'Chọn hoặc gõ bộ phận' }) + ui.datalist('au-dl', App.DEFAULT_SETTINGS.boPhanList) +
          ui.text('au-email', 'Email', '', { type: 'email', auto: 'username', req: true }) +
          ui.text('au-pass', 'Mật khẩu', '', { type: 'password', auto: 'new-password', ph: 'Tối thiểu 8 ký tự', req: true }) +
          '<button class="btn dark block lg" type="submit" id="au-go">Tạo tài khoản</button></form>' +
          '<div class="center mt16 muted" style="font-size:13.5px">Đã có tài khoản? <a href="#" data-act="authTab:login"><b class="grad-text">Đăng nhập</b></a></div>') +
      (!navigator.onLine ? '<div class="alert warn mt16">' + I('alert') + '<div>Đang offline. Lần đăng nhập đầu tiên trên máy này cần có mạng.</div></div>' : '') +
      '</div><p class="foot-note">© ' + new Date().getFullYear() + ' Learn to Leap · Dữ liệu đồng bộ an toàn, chạy cả khi mất mạng.</p></div></div>' +
      '<aside class="auth-art">' + App.waves({ seed: 11, colors: ['#ffffff', '#ffd0ec', '#b9a2ff', '#ffb36b', '#7fe3ff'], op: 0.7, n: 46, sw: 2.6, y0: -0.05, spread: 1.1 }) +
      '<div class="logo-w"><img src="assets/logo-ltl-sm.png" alt="Learn to Leap"></div>' +
      '<div class="ac"><h3>Tạm ứng · Hoàn ứng · Thanh toán<br>gọn trong một nơi.</h3><p>Lập phiếu đúng mẫu 01-TT/LTL, lưu minh chứng từng khoản chi, xuất Word / Excel và báo cáo tổng hợp.</p>' +
      '<div class="feat">' + chip('file', 'Phiếu đúng mẫu') + chip('camera', 'Chụp bill') + chip('excel', 'Word / Excel') + chip('shield', 'Tài khoản riêng') + '</div></div></aside></div>';
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
  };

  async function submitAuth() {
    const btn = document.getElementById('au-go');
    const email = App.val('au-email').toLowerCase(), pass = (document.getElementById('au-pass') || {}).value || '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { App.toast('Email chưa hợp lệ', 'err'); return; }
    if (pass.length < (authTab === 'signup' ? 8 : 1)) { App.toast(authTab === 'signup' ? 'Mật khẩu tối thiểu 8 ký tự' : 'Nhập mật khẩu', 'err'); return; }
    btn.disabled = true;
    try {
      if (authTab === 'signup') {
        const name = App.val('au-name'); const dept = App.val('au-dept');
        if (!name) { App.toast('Nhập họ và tên', 'err'); btn.disabled = false; return; }
        const data = await signUp(email, pass, { full_name: name, dept });
        if (!(data && data.session)) { try { await signIn(email, pass); } catch (e2) {} }
        if (!Cloud.user) {
          App.toast('Đã tạo tài khoản. Kiểm tra email để xác nhận rồi đăng nhập.', 'ok');
          authTab = 'login'; App.render(); return;
        }
        App.toast('Tạo tài khoản thành công', 'ok');
      } else {
        await signIn(email, pass);
      }
      await onSignedIn();
    } catch (e) {
      const m = String(e.message || e);
      App.toast(/fetch|network/i.test(m) ? 'Không kết nối được máy chủ — kiểm tra mạng' : m, 'err');
      if (btn) btn.disabled = false;
    }
  }

  function openNewPassword() {
    const ov = App.openSheet(App.sheetHead('Đổi mật khẩu') + App.ui.text('np-old', 'Mật khẩu hiện tại', '', { type: 'password', auto: 'current-password' }) +
      App.ui.text('np-pass', 'Mật khẩu mới (tối thiểu 8 ký tự)', '', { type: 'password', auto: 'new-password' }) +
      App.ui.text('np-pass2', 'Nhập lại mật khẩu mới', '', { type: 'password', auto: 'new-password' }) +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="np-ok">Lưu mật khẩu</button></div>', { center: true });
    ov.querySelector('#np-ok').onclick = async () => {
      const o = ov.querySelector('#np-old').value, p = ov.querySelector('#np-pass').value, p2 = ov.querySelector('#np-pass2').value;
      if (p.length < 8) { App.toast('Mật khẩu mới tối thiểu 8 ký tự', 'err'); return; }
      if (p !== p2) { App.toast('Hai lần nhập mật khẩu mới không khớp', 'err'); return; }
      try { const r = await api('POST', '/auth/password', { old: o, password: p }); Cloud.token = r.token; try { localStorage.setItem(TOKEN_KEY, r.token); } catch (e) {} App.closeSheet(ov); App.toast('Đã đổi mật khẩu', 'ok'); }
      catch (e) { App.toast(e.message || String(e), 'err'); }
    };
  }
  Cloud.openNewPassword = openNewPassword;

  /* ----------------------------- API cho trang quản trị ----------------------------- */
  const okRow = (r) => r && U.isId(String(r.id || 'x')) && !(r.data && r.data._deleted);
  const cleanRow = (r) => { if (r.data) r.data = cleanIds(Object.assign({}, r.data)); return r; };
  Cloud.admin = {
    async profiles() { return (await api('GET', '/profiles')).rows || []; },
    // toàn bộ dữ liệu (trừ ảnh) của mọi tài khoản
    async allData() { return ((await api('GET', '/all/records')).rows || []).filter((r) => okRow(r) && !(r.data && r.data.deletedAt)).map(cleanRow); },
  };

  /* ----------------------------- Actions ----------------------------- */
  Object.assign(App.actions, {
    authTab(t) { authTab = t; App.render(); },
    async tryDemo() {
      // máy đang giữ dữ liệu của một tài khoản thật (chưa đăng xuất) → không cho dùng thử kẻo xoá mất
      let owner = ''; try { owner = localStorage.getItem(OWNER_KEY) || ''; } catch (e) {}
      if (owner && owner !== 'local-demo' && !/^demo-/.test(owner)) {
        const n = (await DB.all('docs')).length + (await DB.all('expenses')).length + (await DB.all('events')).length;
        if (n) { App.toast('Máy này còn dữ liệu của tài khoản đang dùng. Hãy đăng nhập lại và đăng xuất trước khi dùng thử.', 'err'); return; }
      }
      App.demoPicker();
    },
    forgotPass() {
      App.openSheet(App.sheetHead('Quên mật khẩu') + '<p class="muted" style="margin:0 0 12px">Liên hệ <b>Kế toán</b> hoặc <b>Quản trị</b> để được cấp mật khẩu tạm (mục Thành viên & quyền → Cấp lại mật khẩu). Đăng nhập xong hãy đổi lại mật khẩu ở Hồ sơ cá nhân.</p>' +
        '<div class="sheet-f"><button class="btn" data-act="closeTop">Đã hiểu</button></div>', { center: true });
    },
    async syncNow() { try { await sync({ loud: true }); } catch (e) {} },
    logout() {
      if (Cloud.demo) {
        App.confirmSheet('Thoát dùng thử?', 'Toàn bộ dữ liệu bạn nhập thử trên máy này sẽ bị xoá.', async () => { await signOut(); App.afterLogout(); }, true, 'Thoát dùng thử');
        return;
      }
      const doOut = async () => { App.toast('Đang đăng xuất…'); await signOut(); App.afterLogout(); };
      App.toast('Đang đồng bộ trước khi đăng xuất…');
      Cloud.flush().catch(() => false).then((ok) => {
        if (ok) {
          App.confirmSheet('Đăng xuất?', 'Dữ liệu đã đồng bộ lên máy chủ và sẽ được xoá khỏi máy này để bảo mật. Đăng nhập lại sẽ tự tải về.', doOut, false, 'Đăng xuất');
        } else {
          App.confirmSheet('Chưa đồng bộ được — vẫn đăng xuất?', (navigator.onLine ? 'Đồng bộ đang lỗi.' : 'Máy đang mất mạng.') + ' Nếu đăng xuất bây giờ, các thay đổi chưa đồng bộ trên máy này sẽ bị MẤT. Nên kết nối mạng, bấm chấm tròn đồng bộ trên thanh trên, rồi đăng xuất sau.', doOut, true, 'Vẫn đăng xuất');
        }
      });
    },
    changePassword() { openNewPassword(); },
  });
})();
