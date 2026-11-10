/* =========================================================================
   demo.js — Chế độ "Dùng thử" NHIỀU TÀI KHOẢN trên một máy, không cần Supabase.
   • DemoSrv: "máy chủ giả" trong IndexedDB (ltl_demo_srv) giữ dữ liệu của mọi
     tài khoản thử + duyệt, tin nhắn, thông báo — cùng giao diện với Supabase.
   • Đổi tài khoản: cất dữ liệu người đang dùng lên DemoSrv, nạp dữ liệu người kia.
   • Có sẵn 4 tài khoản: Quản trị, Kế toán, 2 Nhân sự + dữ liệu mẫu đủ mọi tình huống.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, I = App.icon, esc = U.esc;
  const money = (n) => U.groupThousand(n) + ' đ';

  const USERS = [
    { id: 'demo-admin', email: 'admin@learntoleap.vn', full_name: 'Quản trị LtL', dept: 'Ban Giám đốc', position: 'Quản trị hệ thống', role: 'admin',
      hint: 'Toàn quyền như kế toán + quản lý thành viên, phân quyền, cấp lại mật khẩu, xem ai đang dùng.' },
    { id: 'demo-ketoan', email: 'ketoan@learntoleap.vn', full_name: 'Phan Thị Thảo', dept: 'Kế toán - Hành chính', position: 'Kế toán', role: 'ketoan',
      hint: 'Duyệt / duyệt chi / trả lại phiếu, đối chiếu từng dòng chứng từ, yêu cầu giải trình, sổ theo dõi & báo cáo.' },
    { id: 'demo-nv1', email: 'an.nguyen@learntoleap.vn', full_name: 'Nguyễn Văn An', dept: 'Chuyên môn', position: 'Chuyên viên', role: 'staff', soTK: '0123456789', nganHang: 'MB Bank',
      hint: 'Nhân sự có đủ tình huống: tạm ứng đã chi, hoàn ứng thừa đã nộp lại, chi vượt có DNTT bù, phiếu bị yêu cầu bổ sung.' },
    { id: 'demo-nv2', email: 'binh.tran@learntoleap.vn', full_name: 'Trần Thị Bình', dept: 'Kinh doanh', position: 'Nhân viên kinh doanh', role: 'staff', soTK: '19035555666601', nganHang: 'Techcombank',
      hint: 'Nhân sự có tạm ứng quá 30 ngày chưa hoàn ứng, một phiếu thanh toán chờ duyệt và một phiếu nháp.' },
  ];
  const STORES = { events: 'event', expenses: 'expense', images: 'image', settings: 'settings', docs: 'doc' };
  const KIND_STORE = { event: 'events', expense: 'expenses', image: 'images', settings: 'settings', doc: 'docs' };
  const LEGACY = { '1': 'demo-nv1', admin: 'demo-admin' };

  /* ============================== IndexedDB "máy chủ" ============================== */
  const S = {
    db: null,
    open() {
      if (S.db) return Promise.resolve(S.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('ltl_demo_srv', 2);
        r.onupgradeneeded = () => { const d = r.result; ['rec', 'rev', 'msg', 'ntf', 'prof', 'dm'].forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'k' }); }); };
        r.onsuccess = () => { S.db = r.result; res(S.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async run(store, mode, fn) {
      const db = await S.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, mode), os = tx.objectStore(store);
        let out; const r = fn(os); if (r) r.onsuccess = () => { out = r.result; };
        tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
      });
    },
    all: (s) => S.run(s, 'readonly', (os) => os.getAll()).then((x) => x || []),
    get: (s, k) => S.run(s, 'readonly', (os) => os.get(k)),
    put: (s, v) => S.run(s, 'readwrite', (os) => os.put(v)),
    del: (s, k) => S.run(s, 'readwrite', (os) => os.delete(k)),
    async clear() { for (const s of ['rec', 'rev', 'msg', 'ntf', 'prof', 'dm']) await S.run(s, 'readwrite', (os) => os.clear()); },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const me = () => (App.cloud.user || {}).id;
  const isAcc = () => App.Flow && App.Flow.isAcc();
  const strip = (x) => { const o = Object.assign({}, x); delete o.k; return o; };

  const api = {
    async role() { const p = await S.get('prof', me()); return p ? p.role : 'staff'; },
    async reviews() {
      const acc = isAcc(), u = me();
      return (await S.all('rev')).filter((r) => acc || r.owner === u).map((r) => ({ owner: r.owner, doc_id: r.doc_id, updated_at: r.updated_at, data: r.data }));
    },
    async putReview(owner, docId, data) { await S.put('rev', { k: owner + '|' + docId, owner, doc_id: docId, updated_at: U.nowISO(), data: clone(data) }); },
    async msgs(owner, docId) {
      if (!isAcc() && owner !== me()) return [];
      return (await S.all('msg')).filter((m) => m.owner === owner && m.doc_id === docId).map(strip).sort((a, b) => a.at.localeCompare(b.at));
    },
    async msgsKind(kind) {
      const acc = isAcc(), u = me();
      return (await S.all('msg')).filter((m) => (m.data || {}).kind === kind && (acc || m.owner === u)).map(strip).sort((a, b) => a.at.localeCompare(b.at));
    },
    async addMsg(m) { await S.put('msg', Object.assign({ k: m.id }, clone(m))); },
    async notifs(since) {
      const acc = isAcc(), u = me();
      return (await S.all('ntf')).filter((n) => n.at >= since && (n.to_user === u || (n.to_acc && acc) || n.author === u)).map(strip);
    },
    async addNotif(n) { await S.put('ntf', Object.assign({ k: n.id }, clone(n))); },
    async profiles() { return (await S.all('prof')).map(strip); },
    async setRole(email, role) { const p = (await S.all('prof')).find((x) => x.email === email); if (!p) throw new Error('Không tìm thấy tài khoản'); p.role = role; await S.put('prof', p); },
    async setBlocked(uid, b) { const p = await S.get('prof', uid); if (p) { p.blocked = !!b; await S.put('prof', p); } },
    async setPassword() { /* dùng thử: không có mật khẩu thật */ },
    async sendReset() {},
    async ping(info) { const p = await S.get('prof', me()); if (p) { p.last_seen = U.nowISO(); p.page = info.page; p.device = info.device; await S.put('prof', p); } },
    async allRecords() {
      const u = me(), rows = [];
      (await S.all('rec')).forEach((r) => { if (r.owner !== u && r.kind !== 'image') rows.push({ owner: r.owner, id: r.id, kind: r.kind, updated_at: (r.data && r.data.updatedAt) || '', data: r.data }); });
      for (const st of ['docs', 'events', 'expenses', 'settings']) (await DB.all(st)).forEach((rec) => rows.push({ owner: u, id: rec.id, kind: STORES[st], updated_at: rec.updatedAt || '', data: rec }));
      return rows;
    },
    async contacts() {
      const acc = isAcc(), u = me();
      return (await S.all('prof')).filter((p) => p.id !== u && (acc || p.role === 'admin' || p.role === 'ketoan')).map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, dept: p.dept, role: p.role }));
    },
    async dms() { const u = me(); return (await S.all('dm')).filter((m) => m.from_user === u || m.to_user === u).map(strip); },
    async dmSend(m) { await S.put('dm', Object.assign({ k: m.id }, clone(m))); },
    async deleteUser(uid) {
      if (uid === me()) throw new Error('Không tự xoá chính mình');
      await S.del('prof', uid);
      for (const st of ['rec', 'rev', 'msg']) for (const x of await S.all(st)) if (x.owner === uid) await S.del(st, x.k);
      for (const x of await S.all('ntf')) if (x.to_user === uid || x.author === uid) await S.del('ntf', x.k);
      for (const x of await S.all('dm')) if (x.from_user === uid || x.to_user === uid) await S.del('dm', x.k);
    },
    async docImages(owner, doc) {
      if (owner === me()) return App.data.images;
      const ex = new Set((doc.items || []).map((i) => i.expenseId).filter(Boolean));
      return (await S.all('rec')).filter((r) => r.owner === owner && r.kind === 'image' && r.data && (r.data.docId === doc.id || ex.has(r.data.expenseId))).map((r) => r.data);
    },
  };
  App.DemoSrv = { api, S, USERS };

  /* ============================== Đổi tài khoản thử ============================== */
  const rawPut = (st, v) => (App.cloud._rawPut ? App.cloud._rawPut(st, v) : DB.put(st, v));
  async function dumpLocal(owner) {
    const old = (await S.all('rec')).filter((r) => r.owner === owner);
    for (const r of old) await S.del('rec', r.k);
    for (const st in STORES) for (const rec of await DB.all(st)) await S.put('rec', { k: owner + '|' + rec.id, owner, id: rec.id, kind: STORES[st], data: rec });
  }
  async function loadLocal(owner) {
    for (const st in STORES) { try { await DB.clear(st); } catch (e) {} }
    try { await DB.clear('advances'); } catch (e) {}
    try { Object.values(App.urls || {}).forEach((u) => URL.revokeObjectURL(u)); } catch (e) {}
    App.urls = {};
    for (const r of (await S.all('rec')).filter((x) => x.owner === owner)) { const st = KIND_STORE[r.kind]; if (st) await rawPut(st, r.data); }
  }
  function setUser(p) {
    const Cl = App.cloud;
    Cl.demo = true;
    Cl.user = { id: p.id, email: p.email, user_metadata: { full_name: p.full_name, dept: p.dept } };
    Cl.role = p.role; Cl.isAdmin = p.role !== 'staff';
    try { localStorage.setItem('ltl_demo', p.id); localStorage.setItem('ltl_owner', p.id); } catch (e) {}
  }
  async function profileOf(uid) { let p = await S.get('prof', uid); if (!p) p = await S.get('prof', 'demo-nv1'); return p; }
  async function ensureMySettings(p) {
    await App.ensureSettings();
    const s = App.settings;
    if (!s.hoTen) {
      Object.assign(s, { hoTen: p.full_name, tenNgan: App.lastName(p.full_name), boPhan: p.dept, chucVu: p.position || '', tenTK: U.normText ? p.full_name.toUpperCase() : p.full_name, soTK: p.soTK || '', nganHang: p.nganHang || '' });
      await rawPut('settings', s);
    }
  }
  const Demo = {
    USERS,
    async resume() {
      let uid = ''; try { uid = localStorage.getItem('ltl_demo') || ''; } catch (e) {}
      uid = LEGACY[uid] || uid;
      await S.open();
      let owner = ''; try { owner = localStorage.getItem('ltl_owner') || ''; } catch (e) {}
      if (!(await S.all('prof')).length) { await seed(); owner = ''; }
      const p = await profileOf(uid);
      if (owner !== p.id) await loadLocal(p.id);
      setUser(p);
      await ensureMySettings(p);
    },
    async start(uid) {
      await S.open();
      if (!(await S.all('prof')).length) await seed();
      const Cl = App.cloud;
      if (Cl.demo && Cl.user && Cl.user.id && Cl.user.id !== uid) await dumpLocal(Cl.user.id);
      const p = await profileOf(uid);
      if (!(Cl.demo && Cl.user && Cl.user.id === p.id)) await loadLocal(p.id);
      setUser(p);
      await ensureMySettings(p);
    },
    async wipe() { try { await S.clear(); } catch (e) {} },
    current() { return USERS.find((u) => u.id === me()) || null; },
  };
  App.Demo = Demo;

  function pickerHTML(title) {
    const cur = me();
    return App.sheetHead(title || 'Chọn tài khoản dùng thử', 'Mỗi tài khoản có quyền và dữ liệu riêng — đổi qua lại để thử trọn quy trình') +
      '<div class="demo-pick">' + USERS.map((u) => {
        const ini = u.full_name.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
        return '<button class="dp-it' + (u.id === cur && App.cloud.demo ? ' on' : '') + '" data-act="demoSwitch:' + u.id + '"><span class="av r-' + u.role + '">' + esc(ini) + '</span>' +
          '<span class="dp-b"><b>' + esc(u.full_name) + '</b> ' + App.Flow.roleBadge(u.role) + '<small>' + esc(u.dept) + ' · ' + esc(u.email) + '</small><i>' + esc(u.hint) + '</i></span>' + I('right', 18) + '</button>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:12.5px;margin:12px 0 0">Gợi ý: đăng nhập <b>Nhân sự</b> gửi phiếu → đổi sang <b>Kế toán</b> để duyệt, nhắn yêu cầu giải trình → quay lại <b>Nhân sự</b> xem trạng thái và thông báo.</p>';
  }
  App.demoPicker = () => App.openSheet(pickerHTML(), { wide: true });

  App.demoBanner = function () {
    if (!App.cloud || !App.cloud.isDemo || !App.cloud.isDemo()) return '';
    const u = Demo.current() || {};
    return '<div class="alert info demo-bar" style="margin-bottom:20px;align-items:center;flex-wrap:wrap">' + I('sparkle') +
      '<div style="flex:1;min-width:220px"><b>Dùng thử</b> với tài khoản <b>' + esc(u.full_name || '') + '</b> ' + App.Flow.roleBadge(u.role) +
      '<br><span class="muted" style="font-size:12.5px">Dữ liệu chỉ lưu trên máy này. Đổi tài khoản để thử quy trình nhân sự ↔ kế toán.</span></div>' +
      '<div class="row"><button class="btn sm" data-act="demoPick">' + I('users') + 'Đổi tài khoản thử</button>' +
      '<button class="btn sm out" data-act="seedDemo">' + I('refresh') + 'Nạp lại dữ liệu mẫu</button>' +
      '<button class="btn sm out" data-act="logout">' + I('logout') + 'Thoát</button></div></div>';
  };

  /* ============================== Dữ liệu mẫu ============================== */
  async function mkImage(color, text) {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    const x = c.getContext('2d');
    x.fillStyle = '#fbfbfd'; x.fillRect(0, 0, 600, 800);
    const g = x.createLinearGradient(0, 0, 600, 0); g.addColorStop(0, color); g.addColorStop(1, '#C2357A');
    x.fillStyle = g; x.fillRect(0, 0, 600, 110);
    x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.fillText('HOÁ ĐƠN', 34, 72);
    x.fillStyle = '#344767'; x.font = '24px Arial';
    String(text).split('\n').forEach((t, i) => x.fillText(t.slice(0, 40), 34, 180 + i * 42));
    x.strokeStyle = '#dde1ea'; x.lineWidth = 2;
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(34, 360 + i * 52); x.lineTo(566, 360 + i * 52); x.stroke(); }
    x.fillStyle = '#9aa0b4'; x.font = 'italic 18px Arial'; x.fillText('Ảnh minh hoạ dữ liệu dùng thử', 34, 770);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.75));
  }

  async function seed() {
    await S.clear();
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    const dt = (mm, d, h) => { const x = new Date(y, m + mm, mm === 0 ? Math.min(d, today) : d, h == null ? 9 : h, 0, 0); return x > now ? new Date(now.getTime() - 3600e3) : x; };
    const iso = (mm, d) => { const x = dt(mm, d, 12); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const ts = (mm, d, h) => dt(mm, d, h).toISOString();
    const D = App.Docs, P = D.TYPES;
    const U_ = {}; USERS.forEach((u) => { U_[u.id] = u; });
    for (const u of USERS) await S.put('prof', Object.assign({ k: u.id, created_at: ts(-4, 1), last_seen: ts(0, today, 7), page: 'tong-quan', device: 'Máy tính · Chrome', blocked: false }, u));
    const put = (owner, kind, data) => S.put('rec', { k: owner + '|' + data.id, owner, id: data.id, kind, data });
    for (const u of USERS) {
      await put(u.id, 'settings', Object.assign({}, App.DEFAULT_SETTINGS, { id: 'app', hoTen: u.full_name, tenNgan: App.lastName(u.full_name), boPhan: u.dept, chucVu: u.position,
        tenTK: u.full_name.toUpperCase(), soTK: u.soTK || '', nganHang: u.nganHang || '', updatedAt: ts(-4, 1) }));
    }
    const cnt = {}, soSo = { n: 0 };
    const num = (owner, type, ngay) => { const pre = P[type].prefix + '-' + D.monthKey(ngay) + '-'; const k = owner + pre; cnt[k] = (cnt[k] || 0) + 1; return pre + String(cnt[k]).padStart(2, '0'); };
    const nextSo = () => 'KT' + y + '-' + String(++soSo.n).padStart(4, '0');
    const FT = () => 'FT' + String(y).slice(2) + String(Math.floor(1e11 + Math.random() * 9e11)).slice(0, 12);
    const KT = U_['demo-ketoan'];
    const colors = ['#6B3DBE', '#2952CC', '#047857', '#C2410C'];
    let ci = 0;

    const mkEvent = async (owner, name, date, loc) => { const e = { id: U.uid(), name, date, location: loc || '', createdAt: ts(-3, 1), updatedAt: ts(-3, 1) }; await put(owner, 'event', e); return e; };
    const mkExp = async (owner, ev, content, date, amount, vatType, category, participants) => {
      const e = { id: U.uid(), eventId: ev.id, content, date, amount, vatType, category, participants, ghiChu: vatType === 'vat' ? 'HĐ số 00' + (120 + ci) : '', createdAt: date + 'T10:00:00.000Z', updatedAt: date + 'T10:00:00.000Z' };
      await put(owner, 'expense', e);
      if (vatType !== 'none') {
        const b = await mkImage(colors[ci++ % 4], content + '\n' + U.groupThousand(amount) + ' đ\nNgày ' + U.fmtDate(date));
        await put(owner, 'image', { id: U.uid(), expenseId: e.id, eventId: ev.id, blob: b, mime: 'image/jpeg', kind: 'image', note: 'Ảnh hoá đơn', amount: 0, createdAt: e.createdAt, updatedAt: e.createdAt });
      }
      return e;
    };
    const itemImg = async (owner, doc, it) => {
      const b = await mkImage(colors[ci++ % 4], it.noiDung + '\n' + U.groupThousand(D.lineTotal(it)) + ' đ\n' + doc.soPhieu);
      await put(owner, 'image', { id: U.uid(), docId: doc.id, itemId: it.id, eventId: doc.eventId, blob: b, mime: 'image/jpeg', kind: 'image', name: 'Chứng từ dòng', note: 'Chứng từ', amount: 0, createdAt: doc.createdAt, updatedAt: doc.createdAt });
    };
    const hdOfExp = (e) => (e.vatType === 'vat' ? 'vat' : e.vatType === 'bill' ? 'bill' : 'khong');
    const itemOfExp = (e, short) => ({ noiDung: e.content, ngayChi: e.date, nguoiThamGia: e.participants || short, soLuong: 1, donGia: e.amount, ghiChu: e.ghiChu || '', expenseId: e.id, hd: hdOfExp(e) });
    const mkDoc = async (owner, type, o) => {
      const u = U_[owner], short = App.lastName(u.full_name);
      const d = { id: U.uid(), type, eventId: o.ev ? o.ev.id : null, status: o.sent ? 'da-gui' : 'nhap', round: o.sent ? 1 : 0, submittedAt: o.sent || null,
        soPhieu: num(owner, type, o.ngay), ngayLap: o.ngay, nguoiDeNghi: u.full_name, boPhan: u.dept, noiDung: o.nd, mucDich: o.md || '',
        items: o.items.map((x) => Object.assign({ id: U.uid(), noiDung: '', ngayChi: o.ngay, nguoiThamGia: short, soLuong: '', donGia: 0, ghiChu: '', expenseId: null, hd: '' }, x)),
        tenTK: u.full_name.toUpperCase(), soTK: u.soTK || '', nganHang: u.nganHang || '', deNghiKhac: '', truongBoPhan: '',
        tuDocId: null, tuSoPhieu: '', daTamUng: 0, huDocId: o.hu ? o.hu.id : null, createdAt: ts(0, 1), updatedAt: o.sent || ts(0, 1) };
      d.createdAt = o.ngay + 'T08:00:00.000Z';
      if (o.tu) { d.tuDocId = o.tu.id; d.tuSoPhieu = o.tu.soPhieu; d.daTamUng = D.total(o.tu); }
      d.total = D.total(d);
      await put(owner, 'doc', d);
      if (o.itemImgs) for (const it of d.items) if (!it.expenseId && it.hd !== 'khong') await itemImg(owner, d, it);
      await msg(owner, d, owner, 'log', 'Tạo phiếu', { lines: [D.TYPES[type].label + ' · ' + money(d.total)] }, d.createdAt);
      if (o.sent) await msg(owner, d, owner, 'log', 'Gửi duyệt', { lines: ['Lần gửi thứ 1 · ' + money(d.total)] }, o.sent);
      return d;
    };
    async function msg(owner, doc, author, kind, text, extra, at) {
      const u = U_[author];
      const m = { id: U.uid(), owner, doc_id: doc.id, at, author, data: Object.assign({ kind, text, name: u.full_name, role: u.role, so: doc.soPhieu }, extra || {}) };
      await S.put('msg', Object.assign({ k: m.id }, m));
    }
    async function ntf(to, author, title, body, link, at, kind) {
      const n = { id: U.uid(), at, to_user: to === 'acc' ? null : to, to_acc: to === 'acc', author, data: { title, body, link, from: U_[author].full_name, role: U_[author].role, kind } };
      await S.put('ntf', Object.assign({ k: n.id }, n));
    }
    async function review(owner, doc, status, at, extra) {
      const r = Object.assign({ status, round: 1, note: '', by: KT.id, byName: KT.full_name, byRole: 'ketoan', at }, extra || {});
      if ((status === 'da-duyet' || status === 'da-chi') && !r.soSo) r.soSo = nextSo();
      await S.put('rev', { k: owner + '|' + doc.id, owner, doc_id: doc.id, updated_at: at, data: r });
      const lines = [];
      if (r.note) lines.push('Ghi chú: ' + r.note);
      if (r.soSo) lines.push('Số vào sổ: ' + r.soSo);
      if (r.paid) lines.push('Ngày chi ' + U.fmtDate(r.paid.at) + ' · ' + money(r.paid.amount) + ' · Mã GD ' + r.paid.ref);
      await msg(owner, doc, KT.id, 'log', { 'da-duyet': 'Duyệt phiếu', 'da-chi': 'Duyệt chi', 'can-bo-sung': 'Yêu cầu xem xét lại / bổ sung', 'tu-choi': 'Từ chối phiếu' }[status], { lines }, at);
      const t = { 'da-duyet': 'đã DUYỆT', 'da-chi': 'đã DUYỆT CHI', 'can-bo-sung': 'yêu cầu XEM XÉT LẠI / BỔ SUNG', 'tu-choi': 'đã TỪ CHỐI' }[status];
      await ntf(owner, KT.id, 'Kế toán ' + t + ' ' + P[doc.type].prefix + ' ' + doc.soPhieu, r.note || (doc.noiDung + ' · ' + money(D.total(doc))), '#/phieu/' + doc.id, at, 'decide');
      return r;
    }
    const sentN = async (owner, doc, at) => ntf('acc', owner, U_[owner].full_name + ' gửi ' + P[doc.type].prefix + ' ' + doc.soPhieu + ' chờ duyệt', doc.noiDung + ' · ' + money(D.total(doc)), '#/duyet/' + owner + '/' + doc.id, at, 'submit');

    /* ---------------- Nguyễn Văn An ---------------- */
    const A = 'demo-nv1';
    const ev3 = await mkEvent(A, 'Robotics Day Bắc Ninh', iso(-2, 5), 'Bắc Ninh');
    const ev1 = await mkEvent(A, 'Ngày hội STEM THCS Cầu Giấy', iso(-1, 18), 'THCS Cầu Giấy');
    const ev2 = await mkEvent(A, 'Chi phí vận chuyển thiết bị', iso(0, 3), 'Kho Hà Nội');
    const e31 = await mkExp(A, ev3, 'Thuê xe 16 chỗ đưa đón đoàn', iso(-2, 5), 2400000, 'vat', 'Di chuyển', 'An, Dũng, Hà');
    const e32 = await mkExp(A, ev3, 'Nước uống, bánh cho học sinh', iso(-2, 5), 650000, 'bill', 'Ăn uống', 'An');
    const e11 = await mkExp(A, ev1, 'Taxi đi trường', iso(-1, 18), 350000, 'bill', 'Di chuyển', 'An, Dũng');
    const e12 = await mkExp(A, ev1, 'Cơm trưa đội ngũ (8 suất)', iso(-1, 18), 900000, 'vat', 'Ăn uống', 'Đội ngũ 8 người');
    const e13 = await mkExp(A, ev1, 'In banner, standee', iso(-1, 16), 1200000, 'vat', 'In ấn', 'An');
    const e21 = await mkExp(A, ev2, 'Vận chuyển 10 hộp robot về kho', iso(0, 2), 230000, 'vat', 'Vận chuyển', 'An');
    const e22 = await mkExp(A, ev2, 'Mua túi zip đóng hàng', iso(0, 3), 30000, 'none', 'Vật tư / Thiết bị', 'An');
    const e23 = await mkExp(A, ev2, 'Ship màn hình tương tác', iso(0, 3), 205000, 'bill', 'Vận chuyển', 'An');

    // 1) Tạm ứng đã chi → hoàn ứng thừa 150.000 → đã nộp lại, kế toán xác nhận
    const tu1 = await mkDoc(A, 'TU', { ev: ev3, ngay: iso(-2, 1), nd: 'Tạm ứng chi phí Robotics Day Bắc Ninh', md: 'Thuê xe, ăn uống cho đoàn', sent: ts(-2, 1, 10),
      items: [{ noiDung: 'Thuê xe đưa đón đoàn', soLuong: 1, donGia: 2500000 }, { noiDung: 'Ăn uống học sinh', donGia: 700000 }] });
    await review(A, tu1, 'da-chi', ts(-2, 2, 9), { paid: { at: iso(-2, 2), ref: FT(), amount: D.total(tu1) } });
    const hu1 = await mkDoc(A, 'HU', { ev: ev3, ngay: iso(-2, 8), nd: 'Hoàn ứng chi phí Robotics Day Bắc Ninh', md: 'Quyết toán tạm ứng theo phiếu ' + tu1.soPhieu, sent: ts(-2, 8, 15), tu: tu1,
      items: [itemOfExp(e31, 'An'), itemOfExp(e32, 'An')] });
    await review(A, hu1, 'da-duyet', ts(-2, 9, 9), { items: { [hu1.items[0].id]: { ok: true, hd: true }, [hu1.items[1].id]: { ok: true, hd: true } } });
    const ref1 = FT();
    await msg(A, hu1, A, 'refund', 'Đã nộp lại 150.000 đ về tài khoản công ty · Mã GD ' + ref1, { amount: 150000, ref: ref1, date: iso(-2, 9) }, ts(-2, 9, 14));
    const r1 = await S.get('rev', A + '|' + hu1.id);
    r1.data.refund = { ok: true, at: iso(-2, 10), ref: ref1, amount: 150000, by: KT.id, byName: KT.full_name };
    await S.put('rev', r1);
    await msg(A, hu1, KT.id, 'log', 'Xác nhận đã nhận tiền nộp lại', { lines: ['150.000 đ · Mã GD ' + ref1] }, ts(-2, 10, 9));

    // 2) Tạm ứng 2.000.000 → thực chi 2.450.000 → chi vượt 450.000 → DNTT bù đang chờ duyệt
    const tu2 = await mkDoc(A, 'TU', { ev: ev1, ngay: iso(-1, 10), nd: 'Tạm ứng chi phí Ngày hội STEM THCS Cầu Giấy', md: 'Phục vụ Ngày hội STEM', sent: ts(-1, 10, 10),
      items: [{ noiDung: 'Ăn uống, đi lại đội ngũ', donGia: 1000000 }, { noiDung: 'In ấn banner, standee', soLuong: 1, donGia: 1000000 }] });
    await review(A, tu2, 'da-chi', ts(-1, 11, 9), { paid: { at: iso(-1, 11), ref: FT(), amount: D.total(tu2) } });
    const hu2 = await mkDoc(A, 'HU', { ev: ev1, ngay: iso(-1, 20), nd: 'Hoàn ứng chi phí Ngày hội STEM THCS Cầu Giấy', md: 'Quyết toán tạm ứng theo phiếu ' + tu2.soPhieu, sent: ts(-1, 20, 16), tu: tu2,
      items: [itemOfExp(e11, 'An'), itemOfExp(e12, 'An'), itemOfExp(e13, 'An')] });
    await review(A, hu2, 'da-duyet', ts(-1, 21, 9));
    const tt1 = await mkDoc(A, 'TT', { ev: ev1, ngay: iso(-1, 21), nd: 'Thanh toán chi bù vượt tạm ứng theo phiếu ' + hu2.soPhieu, md: 'Chi vượt tạm ứng ' + tu2.soPhieu, sent: ts(-1, 21, 15), hu: hu2, itemImgs: true,
      items: [{ noiDung: 'Chi bù vượt tạm ứng (theo ' + hu2.soPhieu + ')', donGia: 450000, hd: 'vat', ghiChu: 'Hoá đơn đã nộp kèm phiếu ' + hu2.soPhieu }] });
    await sentN(A, tt1, ts(-1, 21, 15));

    // 3) Thanh toán độc lập — kế toán yêu cầu giải trình dòng không có hoá đơn
    const tt2 = await mkDoc(A, 'TT', { ev: ev2, ngay: iso(0, 5), nd: 'Thanh toán chi phí vận chuyển thiết bị', md: 'Các khoản đã ứng trước, không qua tạm ứng', sent: ts(0, 5, 10),
      items: [itemOfExp(e21, 'An'), itemOfExp(e22, 'An'), itemOfExp(e23, 'An')] });
    await sentN(A, tt2, ts(0, 5, 10));
    await review(A, tt2, 'can-bo-sung', ts(0, 6, 9), { note: 'Dòng 2 (túi zip) không có hoá đơn — giải trình hoặc bổ sung bill.', items: { [tt2.items[0].id]: { ok: true, hd: true } } });
    await msg(A, tt2, KT.id, 'yc', 'Khoản mua túi zip 30.000 đ không có hoá đơn/bill. Em giải trình giúp chị lý do và bổ sung ảnh chứng từ chuyển khoản nếu có nhé.', { itemId: tt2.items[1].id }, ts(0, 6, 9));
    await ntf(A, KT.id, 'Kế toán yêu cầu giải trình về DNTT ' + tt2.soPhieu, 'Khoản mua túi zip 30.000 đ không có hoá đơn/bill…', '#/phieu/' + tt2.id, ts(0, 6, 9), 'msg');

    // 4) Tạm ứng mới đang chờ duyệt
    const tu3 = await mkDoc(A, 'TU', { ngay: iso(0, 8), nd: 'Tạm ứng mua vật tư lớp Robotics', md: 'Mua pin, dây nối, linh kiện thay thế cho 3 lớp', sent: ts(0, 8, 11),
      items: [{ noiDung: 'Pin sạc AA (40 viên)', soLuong: 40, donGia: 22500 }, { noiDung: 'Dây nối, linh kiện thay thế', donGia: 600000 }] });
    await sentN(A, tu3, ts(0, 8, 11));

    /* ---------------- Trần Thị Bình ---------------- */
    const B = 'demo-nv2';
    const evB = await mkEvent(B, 'Demo sản phẩm tại Hải Phòng', iso(-1, 6), 'Hải Phòng');
    const tu4 = await mkDoc(B, 'TU', { ev: evB, ngay: iso(-1, 3), nd: 'Tạm ứng chi phí tiếp khách, demo sản phẩm tại Hải Phòng', md: 'Đi lại, lưu trú, tiếp khách 2 trường', sent: ts(-1, 3, 9),
      items: [{ noiDung: 'Xe đi Hải Phòng (2 chiều)', donGia: 1800000 }, { noiDung: 'Lưu trú 2 đêm', soLuong: 2, donGia: 900000 }, { noiDung: 'Tiếp khách', donGia: 1400000 }] });
    await review(B, tu4, 'da-chi', ts(-1, 4, 9), { paid: { at: iso(-1, 4), ref: FT(), amount: D.total(tu4) } });
    const tt3 = await mkDoc(B, 'TT', { ngay: iso(0, 6), nd: 'Thanh toán chi phí in catalogue sản phẩm', md: 'Catalogue cho hội chợ giáo dục', sent: ts(0, 6, 14), itemImgs: true,
      items: [{ noiDung: 'In catalogue 200 cuốn', soLuong: 200, donGia: 6000, hd: 'vat', ghiChu: 'HĐ VAT số 0000456' }, { noiDung: 'Phí ship catalogue', donGia: 50000, hd: 'bill' }] });
    await sentN(B, tt3, ts(0, 6, 14));
    await mkDoc(B, 'TU', { ngay: iso(0, 9), nd: 'Tạm ứng đi công tác Đà Nẵng', md: 'Hội thảo STEM miền Trung', items: [{ noiDung: 'Vé máy bay khứ hồi', donGia: 2600000 }, { noiDung: 'Lưu trú 2 đêm', soLuong: 2, donGia: 700000 }] });
    const dm = async (from, to, text, at) => { const m = { id: U.uid(), at, from_user: from, to_user: to, data: { text, name: U_[from].full_name, role: U_[from].role } }; await S.put('dm', Object.assign({ k: m.id }, m)); };
    await dm(A, KT.id, 'Chị Thảo ơi, khoản thuê xe đi Bắc Ninh em lấy hoá đơn VAT tên công ty được không ạ?', ts(-2, 6, 9));
    await dm(KT.id, A, 'Được em, ghi đúng tên + MST công ty như trên phiếu nhé. Chụp ảnh gửi kèm phiếu hoàn ứng.', ts(-2, 6, 10));
    await dm(B, 'demo-admin', 'Em đề xuất bổ sung mục chi tiếp khách vào quy định tạm ứng ạ.', ts(0, 7, 15));
    await ntf(B, KT.id, 'Kế toán đã DUYỆT CHI DNTU ' + tu4.soPhieu, 'Nhớ lập phiếu hoàn ứng kèm hoá đơn sau chuyến đi', '#/phieu/' + tu4.id, ts(-1, 4, 9), 'decide');
  }

  /* ============================== Actions ============================== */
  Object.assign(App.actions, {
    demoPick() { App.demoPicker(); },
    async demoSwitch(uid) {
      App.closeAllSheets();
      const Cl = App.cloud;
      if (Cl.demo && Cl.user && Cl.user.id === uid && App.user) return;
      App.toast('Đang chuyển tài khoản…');
      if (App.Flow) App.Flow.stop();
      if (App.Docs && App.Docs.reset) App.Docs.reset();
      await Demo.start(uid);
      if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + '#/');
      await App.afterLogin();
      const u = Demo.current();
      App.toast('Đang dùng: ' + u.full_name + ' (' + App.Flow.ROLES[u.role].t + ')', 'ok');
    },
    seedDemo() {
      if (!App.cloud.isDemo()) return;
      App.confirmSheet('Nạp lại dữ liệu mẫu?', 'Toàn bộ dữ liệu dùng thử của cả 4 tài khoản sẽ được thay bằng dữ liệu mẫu ban đầu.', async () => {
        App.toast('Đang nạp dữ liệu mẫu…');
        const uid = me();
        if (App.Flow) App.Flow.stop();
        await seed();
        try { localStorage.removeItem('ltl_owner'); } catch (e) {}
        App.cloud.user = null;
        await Demo.start(uid);
        await App.afterLogin();
        App.toast('Đã nạp dữ liệu mẫu cho 4 tài khoản', 'ok');
      }, false, 'Nạp lại');
    },
  });
})();
