/* =========================================================================
   cloud.js — Tài khoản + đồng bộ đám mây (Supabase), tuỳ chọn & offline-first.
   - IndexedDB vẫn là nguồn dữ liệu chính. Đồng bộ chỉ UPSERT, không bao giờ xoá
     dữ liệu cục bộ dựa trên đám mây → an toàn cho số liệu tài chính.
   - Hợp nhất theo updatedAt (last-write-wins). Ảnh minh chứng đồng bộ dạng base64.
   - Chưa cấu hình / chưa đăng nhập ⇒ app chạy y như offline thuần.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const esc = U.esc;

  const TABLE = 'ltl_records';
  const OWNER_KEY = 'ltl_owner';   // user.id của tài khoản đang giữ dữ liệu cục bộ
  // store IndexedDB  ->  kind bản ghi đám mây
  const SYNCED = { events: 'event', advances: 'advance', expenses: 'expense', images: 'image', settings: 'settings' };
  const KIND_STORE = { event: 'events', advance: 'advances', expense: 'expenses', image: 'images', settings: 'settings' };

  const Cloud = {
    client: null,
    user: null,
    state: 'idle',       // idle | offline | signedout | syncing | ok | error
    lastSync: localStorage.getItem('ltl_lastsync') || '',
    _applying: false,    // true khi đang ghi dữ liệu kéo về (bỏ qua đóng dấu updatedAt)
    _pushTimer: null,
  };
  App.cloud = Cloud;

  /* ----------------------------- Cấu hình ----------------------------- */
  // Nhúng sẵn kết nối Supabase vào app → người dùng CHỈ cần đăng nhập email + mật khẩu,
  // không phải nhập URL/key bao giờ. (anon key là khoá công khai, an toàn để nhúng,
  // dữ liệu vẫn được bảo vệ bằng RLS theo từng tài khoản.)
  const BUILTIN = {
    url: 'https://ddjujhydpvnsnckwnmyf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkanVqaHlkcHZuc25ja3dubXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NDEzNTEsImV4cCI6MjA5NTExNzM1MX0.vvNKQDtyfhaVyeeNi1uiJeS5oKQEQOrrAgsgLAE3Hgo',
  };
  function getCfg() {
    if (BUILTIN.url && BUILTIN.key) return { url: BUILTIN.url, key: BUILTIN.key, builtin: true };
    const s = App.settings || {};
    return {
      url: (s.cloudUrl || localStorage.getItem('ltl_cloud_url') || '').trim(),
      key: (s.cloudKey || localStorage.getItem('ltl_cloud_key') || '').trim(),
      builtin: false,
    };
  }
  function configured() { const c = getCfg(); return !!(c.url && c.key); }
  Cloud.configured = configured;
  Cloud.isAuthed = () => !!Cloud.user;
  Cloud.ready = () => !!(Cloud.client && Cloud.user && navigator.onLine);

  async function saveConfig(url, key) {
    url = (url || '').trim().replace(/\/+$/, '');
    key = (key || '').trim();
    localStorage.setItem('ltl_cloud_url', url);
    localStorage.setItem('ltl_cloud_key', key);
    if (App.settings) {
      App.settings.cloudUrl = url; App.settings.cloudKey = key;
      try { await DB.put('settings', App.settings); } catch (e) {}
    }
    Cloud.client = null; Cloud.user = null;
  }

  /* ----------------------------- Khởi tạo client ----------------------------- */
  async function ensureClient() {
    if (Cloud.client) return Cloud.client;
    const cfg = getCfg();
    if (!cfg.url || !cfg.key) throw new Error('Chưa cấu hình Supabase');
    const lib = await App.ensureLib('supabase');
    const createClient = (lib && lib.createClient) || (window.supabase && window.supabase.createClient);
    if (!createClient) throw new Error('Không tải được thư viện Supabase');
    Cloud.client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ltl-auth' },
    });
    Cloud.client.auth.onAuthStateChange((_evt, session) => {
      Cloud.user = (session && session.user) || null;
      setState(Cloud.user ? 'ok' : 'signedout');
    });
    try {
      const { data } = await Cloud.client.auth.getSession();
      Cloud.user = (data && data.session && data.session.user) || null;
    } catch (e) { Cloud.user = null; }
    return Cloud.client;
  }

  /* ----------------------------- Trạng thái / badge ----------------------------- */
  function setState(s) { Cloud.state = s; updateBadge(); refreshAccountSheet(); }
  Cloud.updateBadge = updateBadge;
  function updateBadge() {
    const el = document.getElementById('cloud-badge');
    if (!el) return;
    const st = !configured() ? 'off' : !navigator.onLine ? 'offline' : Cloud.state === 'syncing' ? 'syncing' : Cloud.user ? 'ok' : 'off';
    el.setAttribute('data-state', st);
    el.title = badgeText();
    const tx = document.getElementById('cloud-text');
    if (tx) {
      tx.textContent = Cloud.user ? (Cloud.user.email || 'Đã đăng nhập') : badgeText();
      tx.parentNode.setAttribute('data-state', st);
    }
  }
  function badgeIcon() {
    if (!configured()) return '☁️';
    if (!navigator.onLine) return '⚡';
    if (Cloud.state === 'syncing') return '🔄';
    if (Cloud.user) return '✅';
    return '☁️';
  }
  function badgeText() {
    if (!configured()) return 'Chưa kết nối đám mây';
    if (!navigator.onLine) return 'Đang offline — sẽ đồng bộ khi có mạng';
    if (Cloud.state === 'syncing') return 'Đang đồng bộ…';
    if (Cloud.user) return 'Đã đăng nhập: ' + (Cloud.user.email || '');
    return 'Đã cấu hình — chưa đăng nhập';
  }

  /* ----------------------------- Auth ----------------------------- */
  async function signUp(email, password) {
    const c = await ensureClient();
    const { data, error } = await c.auth.signUp({ email, password });
    if (error) throw error;
    // Chỉ coi là đã đăng nhập khi có session thật. Nếu project bật xác nhận email,
    // signUp trả về user nhưng session = null → vẫn CHƯA đăng nhập.
    Cloud.user = (data && data.session && data.user) || null;
    return data;
  }
  async function signIn(email, password) {
    const c = await ensureClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    Cloud.user = (data && data.user) || null;
    setState('ok');
    return data;
  }
  async function signOut() {
    // Đẩy nốt thay đổi đang chờ lên đám mây trước khi xoá cục bộ (tránh mất dữ liệu).
    try { if (Cloud.ready()) await sync(); } catch (e) {}
    if (Cloud.client) { try { await Cloud.client.auth.signOut(); } catch (e) {} }
    Cloud.user = null;
    await clearLocalData();
    try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
    setState('signedout');
    try { if (App.ensureSettings) await App.ensureSettings(); } catch (e) {}
    if (App.reload) App.reload();
  }

  /* ------------------- Cách ly dữ liệu theo tài khoản (an toàn tài chính) ------------------- */
  // Mỗi thiết bị chỉ giữ dữ liệu của 1 tài khoản tại một thời điểm. Khi một tài khoản
  // KHÁC đăng nhập, hoặc khi đăng xuất → xoá sạch dữ liệu cục bộ để không tài khoản nào
  // nhìn thấy khoản chi của tài khoản khác. (Đám mây đã có RLS theo owner; đây là chốt
  // chặn phía thiết bị dùng chung.)
  async function clearLocalData() {
    Cloud._applying = true; // ngăn wrapper DB.put/del đẩy ngược lên đám mây khi đang xoá
    try {
      for (const store in SYNCED) { try { await DB.clear(store); } catch (e) {} }
    } finally { Cloud._applying = false; }
    try { Object.values(App.urls || {}).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} }); } catch (e) {}
    App.urls = {};
    App.currentEventId = null;
    try { localStorage.removeItem('ltl_event'); } catch (e) {}
  }
  Cloud.clearLocalData = clearLocalData;

  // Trả về true nếu vừa chuyển sang tài khoản khác (đã xoá dữ liệu của tài khoản cũ).
  async function enforceAccount(userId) {
    if (!userId) return false;
    let prev = '';
    try { prev = localStorage.getItem(OWNER_KEY) || ''; } catch (e) {}
    let switched = false;
    if (prev && prev !== userId) { await clearLocalData(); switched = true; }
    try { localStorage.setItem(OWNER_KEY, userId); } catch (e) {}
    return switched;
  }
  Cloud.enforceAccount = enforceAccount;

  // Sau khi đăng nhập: cách ly tài khoản → kéo dữ liệu của chính tài khoản này → nạp lại UI.
  async function onSignedIn(opts) {
    if (!Cloud.user) return;
    await enforceAccount(Cloud.user.id);
    try { await sync(opts); } catch (e) {}
    try { if (App.ensureSettings) await App.ensureSettings(); } catch (e) {}
    if (App.reload) App.reload();
  }
  Cloud.onSignedIn = onSignedIn;

  /* ----------------------------- Chuyển đổi base64 ↔ blob ----------------------------- */
  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('read blob lỗi'));
      r.readAsDataURL(blob);
    });
  }
  async function dataURLToBlob(dataURL) {
    const r = await fetch(dataURL);
    return r.blob();
  }

  /* ----------------------------- Thu thập dữ liệu cục bộ ----------------------------- */
  function tsOf(rec) {
    return rec.updatedAt || rec.createdAt || '1970-01-01T00:00:00.000Z';
  }
  async function gatherLocal() {
    const rows = [];
    for (const store in SYNCED) {
      const kind = SYNCED[store];
      let recs;
      try { recs = await DB.all(store); } catch (e) { recs = []; }
      (recs || []).forEach((rec) => {
        if (!rec || !rec.id) return;
        rows.push({ id: String(rec.id), kind: kind, updated_at: tsOf(rec), rec: rec });
      });
    }
    return rows;
  }

  async function serializeForRemote(item) {
    const owner = Cloud.user.id;
    let data;
    if (item.kind === 'image') {
      const r = item.rec;
      data = {
        id: r.id, eventId: r.eventId || null, expenseId: r.expenseId || null,
        kind: r.kind || 'image', mime: r.mime || 'image/jpeg', name: r.name || '',
        note: r.note || '', amount: r.amount || 0, docType: r.docType || null,
        createdAt: r.createdAt || null, updatedAt: item.updated_at,
      };
      if (r.blob) {
        if (r.blob.size && r.blob.size > 6 * 1024 * 1024) {
          // ảnh quá lớn — bỏ qua phần base64 để tránh lỗi, vẫn giữ metadata
          data._skipped = true;
        } else {
          try { data.b64 = await blobToDataURL(r.blob); } catch (e) { data._skipped = true; }
        }
      }
    } else {
      data = Object.assign({}, item.rec);
      data.updatedAt = item.updated_at;
    }
    return { owner: owner, id: item.id, kind: item.kind, updated_at: item.updated_at, data: data };
  }

  async function applyRemoteToLocal(row) {
    const store = KIND_STORE[row.kind];
    if (!store) return;
    const data = row.data || {};
    const rec = Object.assign({}, data);
    rec.id = row.id;
    rec.updatedAt = row.updated_at;
    if (row.kind === 'image') {
      if (data._skipped || !data.b64) return; // không có ảnh để dựng lại → bỏ qua
      try { rec.blob = await dataURLToBlob(data.b64); } catch (e) { return; }
      delete rec.b64; delete rec._skipped;
    }
    await DB.put(store, rec); // _applying=true ⇒ wrapper bỏ qua đóng dấu & đẩy
  }

  /* ----------------------------- Đồng bộ (hợp nhất LWW) ----------------------------- */
  async function sync(opts) {
    opts = opts || {};
    if (!configured()) { if (opts.loud) App.toast('Chưa cấu hình đám mây', 'err'); return; }
    await ensureClient();
    if (!Cloud.user) { if (opts.loud) App.toast('Chưa đăng nhập', 'err'); return; }
    if (!navigator.onLine) { setState('offline'); if (opts.loud) App.toast('Đang offline', 'err'); return; }
    if (Cloud.state === 'syncing') return;
    setState('syncing');
    try {
      const localRows = await gatherLocal();
      // Bước 1: CHỈ kéo metadata (id,kind,updated_at) — KHÔNG kéo cột data nặng (ảnh base64).
      // Nhờ vậy lần đồng bộ định kỳ rất nhẹ, không làm quá tải DB / không timeout.
      const { data: remoteMeta, error } = await Cloud.client.from(TABLE).select('id,kind,updated_at');
      if (error) throw error;
      const remoteMap = new Map((remoteMeta || []).map((r) => [String(r.id), r]));
      const localMap = new Map(localRows.map((r) => [r.id, r]));
      const ids = new Set([...remoteMap.keys(), ...localMap.keys()]);
      const toRemote = [], toLocalIds = [];
      ids.forEach((id) => {
        const L = localMap.get(id), R = remoteMap.get(id);
        if (L && R) {
          const lt = Date.parse(L.updated_at) || 0, rt = Date.parse(R.updated_at) || 0;
          if (lt > rt) toRemote.push(L); else if (rt > lt) toLocalIds.push(id);
        } else if (L) { toRemote.push(L); } else if (R) { toLocalIds.push(id); }
      });

      if (toRemote.length) {
        const rows = [];
        for (const it of toRemote) rows.push(await serializeForRemote(it));
        // chia lô để tránh payload quá lớn
        for (let i = 0; i < rows.length; i += 40) {
          const { error: upErr } = await Cloud.client.from(TABLE).upsert(rows.slice(i, i + 40), { onConflict: 'owner,id' });
          if (upErr) throw upErr;
        }
      }
      if (toLocalIds.length) {
        Cloud._applying = true;
        try {
          // Bước 2: chỉ kéo dữ liệu ĐẦY ĐỦ cho các bản ghi thực sự thay đổi, chia lô nhỏ.
          for (let i = 0; i < toLocalIds.length; i += 12) {
            const chunk = toLocalIds.slice(i, i + 12);
            const { data: rows, error: dlErr } = await Cloud.client.from(TABLE).select('id,kind,updated_at,data').in('id', chunk);
            if (dlErr) throw dlErr;
            for (const R of (rows || [])) await applyRemoteToLocal(R);
          }
        } finally { Cloud._applying = false; }
      }

      Cloud.lastSync = U.nowISO();
      localStorage.setItem('ltl_lastsync', Cloud.lastSync);
      setState('ok');
      if (opts.loud) App.toast('Đã đồng bộ (' + toRemote.length + '↑ ' + toLocalIds.length + '↓)', 'ok');
      if (toLocalIds.length && App.reload) App.reload();
    } catch (e) {
      setState('error');
      App.toast('Lỗi đồng bộ: ' + (e.message || e), 'err');
      throw e;
    }
  }
  Cloud.sync = sync;

  function schedulePush() {
    if (!Cloud.ready()) return;
    clearTimeout(Cloud._pushTimer);
    Cloud._pushTimer = setTimeout(() => { sync().catch(() => {}); }, 2500);
  }
  Cloud.maybeSync = () => { if (Cloud.ready()) sync().catch(() => {}); };

  /* ----------------------------- Bọc DB.put / DB.del ----------------------------- */
  const _put = DB.put.bind(DB);
  DB.put = function (store, value) {
    if (!Cloud._applying && SYNCED[store] && value && typeof value === 'object') {
      value.updatedAt = U.nowISO();
    }
    return _put(store, value).then((v) => {
      if (!Cloud._applying && SYNCED[store]) schedulePush();
      return v;
    });
  };
  const _del = DB.del.bind(DB);
  DB.del = function (store, id) {
    return _del(store, id).then((v) => {
      if (!Cloud._applying && SYNCED[store] && Cloud.ready()) {
        Cloud.client.from(TABLE).delete().eq('id', String(id)).then(() => {}, () => {});
      }
      return v;
    });
  };

  /* ----------------------------- Khởi tạo lúc mở app ----------------------------- */
  Cloud.init = async function () {
    updateBadge();
    // Đồng bộ tự động mỗi 1 phút (maybeSync tự bỏ qua nếu chưa đăng nhập / offline).
    if (!Cloud._interval) Cloud._interval = setInterval(() => { Cloud.maybeSync(); }, 60000);
    if (!configured()) { setState('idle'); return; }
    try {
      await ensureClient();
      if (Cloud.user) { await enforceAccount(Cloud.user.id); setState('ok'); sync().catch(() => {}); }
      else setState('signedout');
    } catch (e) { setState('error'); }
  };

  window.addEventListener('online', () => { updateBadge(); Cloud.maybeSync(); });
  window.addEventListener('offline', () => { setState('offline'); });

  /* ----------------------------- SQL khởi tạo (cho người dùng dán) ----------------------------- */
  const SCHEMA_SQL =
    'create table if not exists public.ltl_records (\n' +
    '  owner uuid not null default auth.uid(),\n' +
    '  id text not null,\n' +
    '  kind text not null,\n' +
    '  updated_at timestamptz not null default now(),\n' +
    '  data jsonb not null,\n' +
    '  primary key (owner, id)\n' +
    ');\n' +
    'alter table public.ltl_records enable row level security;\n' +
    'drop policy if exists "own rows" on public.ltl_records;\n' +
    'create policy "own rows" on public.ltl_records\n' +
    '  for all using (owner = auth.uid()) with check (owner = auth.uid());';
  Cloud.SCHEMA_SQL = SCHEMA_SQL;

  /* ----------------------------- Giao diện: Tài khoản & Đồng bộ ----------------------------- */
  function accountSheet() {
    const cfg = getCfg();
    const head = '<div class="sheet-h"><div class="st">Tài khoản & Đồng bộ</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>';

    let body;
    if (!configured()) {
      body = '<div class="note-banner" style="display:block">Đăng nhập để dùng <b>cùng dữ liệu trên mọi thiết bị</b> (điện thoại + máy tính), tự sao lưu đám mây. App vẫn chạy offline bình thường.</div>' +
        '<div class="section-label">① Kết nối Supabase (miễn phí)</div>' +
        App.ui.text('cl-url', 'Project URL', cfg.url, { ph: 'https://xxxx.supabase.co' }) +
        App.ui.textarea('cl-key', 'Anon public key', cfg.key, { rows: 2, ph: 'eyJhbGciOi…' }) +
        '<button class="btn btn-primary mt8" data-act="cloudSaveConfig">Lưu kết nối</button>' +
        schemaBlock();
    } else if (!Cloud.user) {
      body = '<div class="note-banner" style="display:block">Đăng nhập bằng <b>email + mật khẩu</b> để dùng chung dữ liệu trên mọi thiết bị. Lần đầu bấm <b>Đăng ký</b>, các lần sau bấm <b>Đăng nhập</b>.</div>' +
        '<div class="section-label">Đăng nhập / Đăng ký</div>' +
        App.ui.text('cl-email', 'Email', '', { ph: 'ban@email.com', type: 'email' }) +
        App.ui.text('cl-pass', 'Mật khẩu', '', { ph: 'tối thiểu 6 ký tự', type: 'password' }) +
        '<div class="btn-row mt8">' +
        '<button class="btn btn-primary" data-act="cloudSignIn">Đăng nhập</button>' +
        '<button class="btn btn-soft" data-act="cloudSignUp">Đăng ký</button></div>' +
        (cfg.builtin ? '' :
          '<button class="btn btn-line btn-sm mt12" data-act="cloudEditConfig">Sửa kết nối Supabase</button>' + schemaBlock());
    } else {
      body = '<div class="kv"><div class="k">Đã đăng nhập</div><div class="v">' + esc(Cloud.user.email || '') + '</div></div>' +
        '<div class="kv"><div class="k">Lần đồng bộ gần nhất</div><div class="v">' + (Cloud.lastSync ? esc(U.fmtDateTime(Cloud.lastSync)) : '—') + '</div></div>' +
        '<div class="kv"><div class="k">Mạng</div><div class="v">' + (navigator.onLine ? 'Online' : 'Offline') + '</div></div>' +
        '<div class="note-banner" style="display:block;font-size:12px;margin-top:12px">Mỗi tài khoản chỉ xem được dữ liệu của chính mình. Ứng dụng <b>tự đồng bộ mỗi phút</b> khi có mạng.</div>' +
        '<button class="btn btn-primary mt12" data-act="cloudSyncNow">Đồng bộ ngay</button>' +
        '<button class="btn btn-line mt8" data-act="cloudSignOut">Đăng xuất</button>';
    }
    return head + '<div id="account-body">' + body + '</div>';
  }

  function schemaBlock() {
    return '<div class="section-label">Thiết lập 1 lần trên Supabase</div>' +
      '<div class="note-banner" style="display:block;font-size:12px">Vào Supabase → <b>SQL Editor</b> → dán đoạn dưới rồi <b>Run</b> (tạo bảng + bảo mật theo từng tài khoản).' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;margin:10px 0 0;font-size:11px;max-height:160px;overflow:auto">' +
      esc(SCHEMA_SQL) + '</pre>' +
      '<button class="btn btn-soft btn-sm mt8" data-act="cloudCopySchema">Copy SQL</button></div>';
  }

  function refreshAccountSheet() {
    const body = document.getElementById('account-body');
    if (!body) return;
    const sheet = body.closest('.sheet');
    if (!sheet) return;
    const hadGrip = !!sheet.querySelector('.grip');
    sheet.innerHTML = (hadGrip ? '<div class="grip"></div>' : '') + accountSheet();
  }

  Object.assign(App.actions, {
    openAccount() { App.openSheet(accountSheet()); },
    async cloudSaveConfig() {
      const url = App.val('cl-url'), key = App.val('cl-key');
      if (!url || !key) { App.toast('Nhập đủ URL và key', 'err'); return; }
      await saveConfig(url, key);
      App.toast('Đã lưu kết nối', 'ok');
      try { await ensureClient(); } catch (e) {}
      setState(Cloud.user ? 'ok' : 'signedout');
      refreshAccountSheet();
    },
    async cloudEditConfig() { await saveConfig('', ''); /* mở lại form cấu hình */ App.toast('Nhập lại kết nối'); setState('idle'); },
    async cloudSignUp() {
      const email = App.val('cl-email'), pass = App.val('cl-pass');
      if (!email || pass.length < 6) { App.toast('Email + mật khẩu ≥ 6 ký tự', 'err'); return; }
      App.toast('Đang đăng ký…');
      try {
        const data = await signUp(email, pass);
        // Tài khoản được kích hoạt sẵn (server tự xác nhận) → đăng nhập luôn cho liền mạch.
        if (!(data && data.session)) {
          try { await signIn(email, pass); } catch (e2) {}
        }
        if (Cloud.user) {
          App.toast('Đăng ký xong, đang đồng bộ…', 'ok'); refreshAccountSheet(); await onSignedIn({ loud: true });
        } else {
          refreshAccountSheet();
          App.toast('Đã tạo tài khoản. Bấm "Đăng nhập" để vào.', 'ok');
        }
      } catch (e) { App.toast('Lỗi đăng ký: ' + (e.message || e), 'err'); }
    },
    async cloudSignIn() {
      const email = App.val('cl-email'), pass = App.val('cl-pass');
      if (!email || !pass) { App.toast('Nhập email và mật khẩu', 'err'); return; }
      App.toast('Đang đăng nhập…');
      try {
        await signIn(email, pass);
        refreshAccountSheet();
        App.toast('Đã đăng nhập, đang đồng bộ…', 'ok');
        await onSignedIn({ loud: true });
      } catch (e) { App.toast('Lỗi đăng nhập: ' + (e.message || e), 'err'); }
    },
    cloudSignOut() {
      App.confirmSheet('Đăng xuất tài khoản này?',
        'Dữ liệu trên máy sẽ được xoá để bảo mật giữa các tài khoản. Dữ liệu vẫn an toàn trên đám mây — đăng nhập lại sẽ tự tải về.',
        async () => {
          App.toast('Đang đăng xuất…');
          try { await signOut(); } catch (e) {}
          document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
          App.toast('Đã đăng xuất', 'ok');
        });
    },
    async cloudSyncNow() { try { await sync({ loud: true }); } catch (e) {} },
    cloudCopySchema() {
      const done = () => App.toast('Đã copy SQL', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SCHEMA_SQL).then(done, () => App.toast('Hãy copy thủ công', 'err'));
      else App.toast('Hãy copy thủ công', 'err');
    },
  });
})();
