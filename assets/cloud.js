/* =========================================================================
   cloud.js — Tài khoản (Supabase Auth) + đồng bộ đám mây, offline-first.
   - Bắt buộc đăng nhập. Mỗi tài khoản chỉ thấy dữ liệu của chính mình
     (RLS owner = auth.uid() trên bảng ltl_records + chỉ lọc owner khi đồng bộ).
   - 1 tài khoản quản trị (bảng ltl_admins) được ĐỌC dữ liệu mọi tài khoản để
     kiểm soát — không sửa được dữ liệu của người khác.
   - IndexedDB là nguồn chính; hợp nhất theo updatedAt (last-write-wins).
   - Xoá: xoá ngay trên đám mây nếu online, nếu offline thì ghi "bia mộ" để xoá
     ở lần đồng bộ sau (tránh bản ghi đã xoá sống lại).
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const esc = U.esc, I = App.icon;

  const TABLE = 'ltl_records';
  const OWNER_KEY = 'ltl_owner';
  const TOMB_KEY = 'ltl_tombs';
  const SYNCED = { events: 'event', advances: 'advance', expenses: 'expense', images: 'image', settings: 'settings', docs: 'doc' };
  const KIND_STORE = { event: 'events', advance: 'advances', expense: 'expenses', image: 'images', settings: 'settings', doc: 'docs' };

  const Cloud = {
    client: null, user: null, isAdmin: false,
    state: 'idle',       // idle | offline | signedout | syncing | ok | error
    lastSync: localStorage.getItem('ltl_lastsync') || '',
    _applying: false, _pushTimer: null,
  };
  App.cloud = Cloud;

  // Kết nối Supabase nhúng sẵn (anon key là khoá công khai; dữ liệu được bảo vệ bằng RLS).
  const CFG = {
    url: 'https://ddjujhydpvnsnckwnmyf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkanVqaHlkcHZuc25ja3dubXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NDEzNTEsImV4cCI6MjA5NTExNzM1MX0.vvNKQDtyfhaVyeeNi1uiJeS5oKQEQOrrAgsgLAE3Hgo',
  };
  Cloud.ready = () => !!(Cloud.client && Cloud.user && navigator.onLine && !Cloud.demo);
  // Chế độ demo CHỈ dùng khi chạy thử trên máy (localhost): không kết nối đám mây.
  const LOCAL_DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (LOCAL_DEV && /[?&]demo=(1|admin)/.test(location.search)) { try { localStorage.setItem('ltl_demo', /demo=admin/.test(location.search) ? 'admin' : '1'); } catch (e) {} }
  // Dùng thử: chạy hoàn toàn trên máy, không cần tài khoản, không đồng bộ
  Cloud.isDemo = () => !!Cloud.demo;

  async function ensureClient() {
    if (Cloud.client) return Cloud.client;
    const lib = await App.ensureLib('supabase');
    const createClient = (lib && lib.createClient) || (window.supabase && window.supabase.createClient);
    if (!createClient) throw new Error('Không tải được thư viện Supabase');
    Cloud.client = createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ltl-auth', detectSessionInUrl: true } });
    Cloud.client.auth.onAuthStateChange((evt, session) => {
      Cloud.user = (session && session.user) || null;
      if (evt === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 300);
      updateBadge();
    });
    try {
      const { data } = await Cloud.client.auth.getSession();
      Cloud.user = (data && data.session && data.session.user) || null;
    } catch (e) { Cloud.user = null; }
    return Cloud.client;
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
    const c = await ensureClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    Cloud.user = (data && data.user) || null;
  }
  async function signUp(email, password, meta) {
    const c = await ensureClient();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: meta || {}, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    Cloud.user = (data && data.session && data.user) || null;
    return data;
  }
  async function signOut() {
    if (Cloud.demo) { try { localStorage.removeItem('ltl_demo'); } catch (e) {} Cloud.demo = false; }
    try { if (Cloud.ready()) await sync(); } catch (e) {}
    if (Cloud.client) { try { await Cloud.client.auth.signOut(); } catch (e) {} }
    Cloud.user = null; Cloud.isAdmin = false;
    await clearLocalData();
    try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
    setState('signedout');
    try { await App.ensureSettings(); } catch (e) {}
  }

  async function checkAdmin() {
    Cloud.isAdmin = false;
    if (!Cloud.ready()) { Cloud.isAdmin = localStorage.getItem('ltl_admin_' + (Cloud.user && Cloud.user.id)) === '1'; return; }
    try {
      const { data, error } = await Cloud.client.rpc('ltl_is_admin');
      Cloud.isAdmin = !error && data === true;
    } catch (e) { Cloud.isAdmin = false; }
    try { localStorage.setItem('ltl_admin_' + Cloud.user.id, Cloud.isAdmin ? '1' : '0'); } catch (e) {}
  }
  // Ghi hồ sơ tài khoản để quản trị thấy danh sách người dùng (bỏ qua nếu bảng chưa tạo)
  async function upsertProfile() {
    if (!Cloud.ready()) return;
    const s = App.settings || {};
    const meta = (Cloud.user && Cloud.user.user_metadata) || {};
    try {
      await Cloud.client.from('ltl_profiles').upsert({
        id: Cloud.user.id, email: Cloud.user.email, full_name: s.hoTen || meta.full_name || '',
        dept: s.boPhan || meta.dept || '', position: s.chucVu || '', last_seen: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch (e) {}
  }
  Cloud.upsertProfile = upsertProfile;

  // Sau khi có phiên: cách ly dữ liệu → kéo dữ liệu → quyền admin → vào app
  async function onSignedIn() {
    if (!Cloud.user) return;
    await enforceAccount(Cloud.user.id);
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
  const tsOf = (rec) => rec.updatedAt || rec.createdAt || '1970-01-01T00:00:00.000Z';
  async function gatherLocal() {
    const rows = [];
    for (const store in SYNCED) {
      let recs; try { recs = await DB.all(store); } catch (e) { recs = []; }
      (recs || []).forEach((rec) => { if (rec && rec.id) rows.push({ id: String(rec.id), kind: SYNCED[store], updated_at: tsOf(rec), rec }); });
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
        if (r.blob.size > 6 * 1024 * 1024) data._skipped = true;
        else { try { data.b64 = await blobToDataURL(r.blob); } catch (e) { data._skipped = true; } }
      }
    } else {
      data = Object.assign({}, item.rec, { updatedAt: item.updated_at });
      if (item.kind === 'doc' && App.Docs) data.total = App.Docs.total(item.rec);
    }
    return { owner: Cloud.user.id, id: item.id, kind: item.kind, updated_at: item.updated_at, data };
  }
  async function applyRemoteToLocal(row) {
    const store = KIND_STORE[row.kind]; if (!store) return;
    const data = row.data || {};
    const rec = Object.assign({}, data, { id: row.id, updatedAt: row.updated_at });
    if (row.kind === 'image') {
      if (data._skipped || !data.b64) return;
      try { rec.blob = await dataURLToBlob(data.b64); } catch (e) { return; }
      delete rec.b64; delete rec._skipped;
    }
    await DB.put(store, rec);
  }
  function tombs() { try { return JSON.parse(localStorage.getItem(TOMB_KEY) || '[]'); } catch (e) { return []; } }
  function saveTombs(t) { try { localStorage.setItem(TOMB_KEY, JSON.stringify(t)); } catch (e) {} }

  async function sync(opts) {
    opts = opts || {};
    if (Cloud.demo) { if (opts.loud) App.toast('Chế độ demo trên máy — không đồng bộ', 'err'); return; }
    await ensureClient();
    if (!Cloud.user) { if (opts.loud) App.toast('Chưa đăng nhập', 'err'); return; }
    if (!navigator.onLine) { setState('offline'); if (opts.loud) App.toast('Đang offline — sẽ đồng bộ khi có mạng', 'err'); return; }
    if (Cloud.state === 'syncing') return;
    setState('syncing');
    const owner = Cloud.user.id;
    try {
      // 0) xoá trên đám mây những bản ghi đã xoá lúc offline
      const t = tombs();
      if (t.length) {
        for (let i = 0; i < t.length; i += 50) {
          const ids = t.slice(i, i + 50);
          const { error } = await Cloud.client.from(TABLE).delete().eq('owner', owner).in('id', ids);
          if (error) throw error;
        }
        saveTombs([]);
      }
      const tombSet = new Set(t);
      const localRows = await gatherLocal();
      // 1) chỉ kéo metadata của CHÍNH tài khoản này (admin đọc được mọi dòng nên bắt buộc lọc owner)
      const { data: remoteMeta, error } = await Cloud.client.from(TABLE).select('id,kind,updated_at').eq('owner', owner);
      if (error) throw error;
      const remoteMap = new Map((remoteMeta || []).map((r) => [String(r.id), r]));
      const localMap = new Map(localRows.map((r) => [r.id, r]));
      const ids = new Set([...remoteMap.keys(), ...localMap.keys()]);
      const toRemote = [], toLocalIds = [];
      ids.forEach((id) => {
        if (tombSet.has(id)) return;
        const L = localMap.get(id), R = remoteMap.get(id);
        if (L && R) { const lt = Date.parse(L.updated_at) || 0, rt = Date.parse(R.updated_at) || 0; if (lt > rt) toRemote.push(L); else if (rt > lt) toLocalIds.push(id); }
        else if (L) toRemote.push(L); else if (R) toLocalIds.push(id);
      });
      if (toRemote.length) {
        const rows = [];
        for (const it of toRemote) rows.push(await serializeForRemote(it));
        for (let i = 0; i < rows.length; i += 30) {
          const { error: e2 } = await Cloud.client.from(TABLE).upsert(rows.slice(i, i + 30), { onConflict: 'owner,id' });
          if (e2) throw e2;
        }
      }
      if (toLocalIds.length) {
        Cloud._applying = true;
        try {
          for (let i = 0; i < toLocalIds.length; i += 12) {
            const { data: rows, error: e3 } = await Cloud.client.from(TABLE).select('id,kind,updated_at,data').eq('owner', owner).in('id', toLocalIds.slice(i, i + 12));
            if (e3) throw e3;
            for (const R of (rows || [])) await applyRemoteToLocal(R);
          }
        } finally { Cloud._applying = false; }
      }
      Cloud.lastSync = U.nowISO();
      localStorage.setItem('ltl_lastsync', Cloud.lastSync);
      setState('ok');
      if (opts.loud) App.toast('Đã đồng bộ (' + toRemote.length + ' lên · ' + toLocalIds.length + ' về)', 'ok');
      if (toLocalIds.length && App.user && !(App.route && App.route.name === 'phieu')) App.reload();
    } catch (e) {
      setState('error');
      if (opts.loud || !opts.quiet) App.toast('Lỗi đồng bộ: ' + (e.message || e), 'err');
      throw e;
    }
  }
  Cloud.sync = sync;

  function schedulePush() {
    if (!Cloud.ready()) return;
    clearTimeout(Cloud._pushTimer);
    Cloud._pushTimer = setTimeout(() => { sync({ quiet: true }).catch(() => {}); }, 2500);
  }
  Cloud.maybeSync = () => { if (Cloud.ready()) sync({ quiet: true }).catch(() => {}); };

  /* ----------------------------- Bọc DB.put / DB.del ----------------------------- */
  const _put = DB.put.bind(DB);
  DB.put = function (store, value) {
    if (!Cloud._applying && SYNCED[store] && value && typeof value === 'object') value.updatedAt = U.nowISO();
    return _put(store, value).then((v) => { if (!Cloud._applying && SYNCED[store]) schedulePush(); return v; });
  };
  const _del = DB.del.bind(DB);
  DB.del = function (store, id) {
    return _del(store, id).then((v) => {
      if (!Cloud._applying && SYNCED[store] && Cloud.user) {
        const sid = String(id);
        const remember = () => { const t = tombs(); if (!t.includes(sid)) { t.push(sid); saveTombs(t); } };
        if (Cloud.ready()) {
          Cloud.client.from(TABLE).delete().eq('owner', Cloud.user.id).eq('id', sid).then(({ error }) => { if (error) remember(); }, remember);
        } else remember();
      }
      return v;
    });
  };

  /* ----------------------------- Khởi động ----------------------------- */
  Cloud.init = async function () {
    let demo = ''; try { demo = localStorage.getItem('ltl_demo') || ''; if (demo === 'admin' && !LOCAL_DEV) demo = '1'; } catch (e) {}
    if (demo) {
      Cloud.demo = true; Cloud.user = { id: 'local-demo', email: 'dung-thu@may-nay', user_metadata: { full_name: 'Người dùng thử' } };
      Cloud.isAdmin = demo === 'admin';
      await enforceAccount(Cloud.user.id); await App.ensureSettings(); setState('ok');
      return;
    }
    if (!Cloud._interval) Cloud._interval = setInterval(() => { Cloud.maybeSync(); }, 60000);
    try { await ensureClient(); } catch (e) { setState('error'); }
    if (Cloud.user) {
      // đã có phiên lưu trên máy (kể cả offline) → vào thẳng app
      await enforceAccount(Cloud.user.id);
      await App.ensureSettings();
      Cloud.isAdmin = localStorage.getItem('ltl_admin_' + Cloud.user.id) === '1';
      setState(navigator.onLine ? 'ok' : 'offline');
      // đồng bộ + kiểm tra quyền chạy nền, không chặn giao diện
      setTimeout(async () => {
        try { await sync({ quiet: true }); } catch (e) {}
        const was = Cloud.isAdmin;
        await checkAdmin(); upsertProfile();
        if (was !== Cloud.isAdmin && App.user) App.render();
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
          '<div class="sn-hr" style="margin:18px 0"></div><button class="btn out block" data-act="tryDemo">' + I('sparkle') + 'Dùng thử không cần tài khoản</button>' +
          '<p class="muted center" style="font-size:12px;margin:8px 0 0">Chạy ngay trên máy này, không đồng bộ. Có sẵn nút nạp dữ liệu mẫu.</p>'
        : '<h2 class="t">Tạo tài khoản</h2><p class="lead">Mỗi người tự tạo tài khoản bằng email công việc. Thông tin này được điền sẵn vào phiếu.</p>' +
          '<form id="auth-form" novalidate>' + ui.text('au-name', 'Họ và tên', '', { auto: 'name', ph: 'Nguyễn Văn A', req: true }) +
          ui.text('au-dept', 'Bộ phận', '', { list: 'au-dl', ph: 'Chọn hoặc gõ bộ phận' }) + ui.datalist('au-dl', App.DEFAULT_SETTINGS.boPhanList) +
          ui.text('au-email', 'Email', '', { type: 'email', auto: 'username', req: true }) +
          ui.text('au-pass', 'Mật khẩu', '', { type: 'password', auto: 'new-password', ph: 'Tối thiểu 6 ký tự', req: true }) +
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
    if (pass.length < 6) { App.toast('Mật khẩu tối thiểu 6 ký tự', 'err'); return; }
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
      App.toast(/Invalid login/i.test(m) ? 'Sai email hoặc mật khẩu' : /already registered/i.test(m) ? 'Email này đã có tài khoản — hãy đăng nhập' :
        /Email not confirmed/i.test(m) ? 'Email chưa được xác nhận — kiểm tra hộp thư' : 'Lỗi: ' + m, 'err');
      if (btn) btn.disabled = false;
    }
  }

  function openNewPassword() {
    const ov = App.openSheet(App.sheetHead('Đặt mật khẩu mới') + App.ui.text('np-pass', 'Mật khẩu mới', '', { type: 'password', auto: 'new-password' }) +
      '<div class="sheet-f"><button class="btn" id="np-ok">Lưu mật khẩu</button></div>', { center: true });
    ov.querySelector('#np-ok').onclick = async () => {
      const p = ov.querySelector('#np-pass').value;
      if (p.length < 6) { App.toast('Mật khẩu tối thiểu 6 ký tự', 'err'); return; }
      const { error } = await Cloud.client.auth.updateUser({ password: p });
      if (error) { App.toast('Lỗi: ' + error.message, 'err'); return; }
      App.closeSheet(ov); App.toast('Đã đổi mật khẩu', 'ok');
    };
  }
  Cloud.openNewPassword = openNewPassword;

  /* ----------------------------- API cho trang quản trị ----------------------------- */
  Cloud.admin = {
    async profiles() {
      const { data, error } = await Cloud.client.from('ltl_profiles').select('id,email,full_name,dept,position,created_at,last_seen').order('last_seen', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    // tóm tắt mọi bản ghi (không kéo ảnh) để đếm phiếu / tiền theo tài khoản
    async summary() {
      const { data, error } = await Cloud.client.from(TABLE).select('owner,kind,updated_at,type:data->>type,total:data->>total,amount:data->>amount').neq('kind', 'image').neq('kind', 'settings');
      if (error) throw error;
      return data || [];
    },
    // toàn bộ dữ liệu (trừ ảnh) của mọi tài khoản — đọc theo trang 1000 dòng
    async allData() {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await Cloud.client.from(TABLE).select('owner,id,kind,updated_at,data').in('kind', ['doc', 'event', 'expense', 'settings']).range(from, from + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    async ownerData(ownerId) {
      const { data, error } = await Cloud.client.from(TABLE).select('id,kind,updated_at,data').eq('owner', ownerId).in('kind', ['doc', 'event', 'expense', 'settings']);
      if (error) throw error;
      return data || [];
    },
  };

  /* ----------------------------- Actions ----------------------------- */
  Object.assign(App.actions, {
    authTab(t) { authTab = t; App.render(); },
    async tryDemo() {
      try { localStorage.setItem('ltl_demo', '1'); } catch (e) {}
      await Cloud.init();
      await App.afterLogin();
      App.toast('Đang dùng thử — dữ liệu chỉ lưu trên máy này', 'ok');
    },
    async forgotPass() {
      const email = App.val('au-email');
      if (!/^\S+@\S+\.\S+$/.test(email)) { App.toast('Nhập email ở ô trên trước', 'err'); return; }
      try {
        await ensureClient();
        const { error } = await Cloud.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        App.toast('Đã gửi email đặt lại mật khẩu', 'ok');
      } catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); }
    },
    async syncNow() { try { await sync({ loud: true }); } catch (e) {} },
    logout() {
      if (Cloud.demo) {
        App.confirmSheet('Thoát dùng thử?', 'Toàn bộ dữ liệu bạn nhập thử trên máy này sẽ bị xoá.', async () => { await signOut(); App.afterLogout(); }, true, 'Thoát dùng thử');
        return;
      }
      App.confirmSheet('Đăng xuất?', 'Dữ liệu đã được đồng bộ lên đám mây và sẽ được xoá khỏi máy này để bảo mật. Đăng nhập lại sẽ tự tải về.', async () => {
        App.toast('Đang đăng xuất…');
        await signOut();
        App.afterLogout();
      }, false, 'Đăng xuất');
    },
    changePassword() { openNewPassword(); },
  });
})();
