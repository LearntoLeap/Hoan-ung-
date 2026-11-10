/* =========================================================================
   flow.js — Quy trình chứng từ nhiều người dùng
   • Phân quyền: admin / ketoan (quyền như nhau, xem tất cả) · staff (chỉ của mình)
   • Trạng thái duyệt do KẾ TOÁN ghi (bảng ltl_reviews) — nhân sự không tự đổi được
       nhap → cho-duyet → (can-bo-sung | da-duyet | da-chi | tu-choi)
     Đã duyệt / Đã duyệt chi ⇒ KHOÁ: không sửa, không xoá, không bổ sung.
   • Trao đổi + yêu cầu giải trình + lịch sử sửa theo từng phiếu (ltl_msgs)
   • Thông báo trong app + thông báo thiết bị (ltl_notifs), nhắc việc hằng tháng
   • Theo dõi tạm ứng → hoàn ứng → nộp lại / DNTT bù, phân loại DNTT, hoá đơn
   Hai "máy chủ": Supabase (thật) và DemoSrv (dùng thử, nhiều tài khoản trên 1 máy).
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const CL = () => App.cloud || {};

  const ROLES = {
    admin: { t: 'Quản trị', cls: 'accent' },
    ketoan: { t: 'Kế toán', cls: 'primary' },
    staff: { t: 'Nhân sự', cls: 'out' },
  };
  const ST = {
    'nhap': { t: 'Nháp – chưa gửi', s: 'Nháp', cls: 'out', ic: 'edit' },
    'cho-duyet': { t: 'Chờ duyệt', s: 'Chờ duyệt', cls: 'primary', ic: 'clock' },
    'can-bo-sung': { t: 'Cần xem xét lại', s: 'Cần bổ sung', cls: 'warn', ic: 'alert' },
    'da-duyet': { t: 'Đã duyệt', s: 'Đã duyệt', cls: 'accent', ic: 'check' },
    'da-chi': { t: 'Đã duyệt chi', s: 'Đã chi', cls: 'ok', ic: 'lock' },
    'tu-choi': { t: 'Từ chối', s: 'Từ chối', cls: 'danger', ic: 'x' },
  };
  const ST_ORDER = ['cho-duyet', 'can-bo-sung', 'da-duyet', 'da-chi', 'tu-choi', 'nhap'];
  const LOCKED = ['da-duyet', 'da-chi'];
  const HD = [
    { v: '', t: '— Hoá đơn? —' },
    { v: 'vat', t: 'Có HĐ VAT' },
    { v: 'bill', t: 'Có HĐ bán lẻ / bill' },
    { v: 'chua', t: 'Chưa có HĐ (bổ sung sau)' },
    { v: 'khong', t: 'Không có HĐ' },
  ];
  const HD_T = { vat: 'HĐ VAT', bill: 'Bill / HĐ bán lẻ', chua: 'Chưa có HĐ', khong: 'Không HĐ', '': 'Chưa khai báo' };
  const HD_CLS = { vat: 'ok', bill: 'accent', chua: 'warn', khong: 'danger', '': 'out' };

  const Flow = { ROLES, ST, ST_ORDER, HD, HD_T, HD_CLS, rev: {}, notifs: [], all: null, refunds: [], _timers: [] };
  App.Flow = Flow;

  /* ============================== Người dùng ============================== */
  Flow.role = () => CL().role || 'staff';
  Flow.isAcc = () => Flow.role() === 'admin' || Flow.role() === 'ketoan';
  Flow.me = () => CL().user || null;
  Flow.myId = () => (Flow.me() || {}).id || '';
  Flow.myName = () => (App.settings && App.settings.hoTen) || ((Flow.me() || {}).user_metadata || {}).full_name || (Flow.me() || {}).email || 'Tôi';
  Flow.roleBadge = (r) => { const x = ROLES[r] || ROLES.staff; return '<span class="badge ' + x.cls + '">' + x.t + '</span>'; };
  Flow.ago = function (iso) {
    const t = Date.parse(iso); if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'vừa xong';
    if (s < 3600) return Math.floor(s / 60) + ' phút trước';
    if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' ngày trước';
    return U.fmtDateTime(iso);
  };
  Flow.device = function () {
    const ua = navigator.userAgent || '';
    const kind = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'Máy tính bảng' : /iPhone|Android.+Mobile|Mobile/i.test(ua) ? 'Điện thoại' : /Android/i.test(ua) ? 'Máy tính bảng' : 'Máy tính';
    const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
    return kind + ' · ' + br + (matchMedia && matchMedia('(display-mode: standalone)').matches ? ' (app)' : '');
  };

  /* ============================== Máy chủ thật (Supabase) ============================== */
  const C = () => CL().client;
  async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
  async function pagedQ(build) {
    const out = [];
    for (let f = 0; ; f += 1000) { const d = await q(build().range(f, f + 999)); out.push(...(d || [])); if (!d || d.length < 1000) break; }
    return out;
  }
  async function b64ToBlob(u) { const r = await fetch(u); return r.blob(); }
  const Real = {
    async role() {
      try { const r = await q(C().rpc('ltl_role')); if (r) return String(r); } catch (e) {}
      try { return (await q(C().rpc('ltl_is_admin'))) === true ? 'admin' : 'staff'; } catch (e) { return null; }
    },
    async reviews() { return pagedQ(() => C().from('ltl_reviews').select('owner,doc_id,updated_at,data').order('doc_id')); },
    async putReview(owner, docId, data) { await q(C().from('ltl_reviews').upsert({ owner, doc_id: docId, updated_at: U.nowISO(), data }, { onConflict: 'owner,doc_id' })); },
    async msgs(owner, docId) { return q(C().from('ltl_msgs').select('id,owner,doc_id,at,author,data').eq('owner', owner).eq('doc_id', docId).order('at')); },
    async msgsKind(kind) { return pagedQ(() => C().from('ltl_msgs').select('id,owner,doc_id,at,author,data').eq('data->>kind', kind).order('at')); },
    async addMsg(m) { await q(C().from('ltl_msgs').insert(m)); },
    async notifs(since) { return q(C().from('ltl_notifs').select('id,at,to_user,to_acc,author,data').gte('at', since).order('at', { ascending: false }).limit(200)); },
    async addNotif(n) { await q(C().from('ltl_notifs').insert(n)); },
    async profiles() {
      let p;
      try { p = await pagedQ(() => C().from('ltl_profiles').select('id,email,full_name,dept,position,created_at,last_seen,page,device').order('id')); }
      catch (e) { p = await pagedQ(() => C().from('ltl_profiles').select('id,email,full_name,dept,position,created_at,last_seen').order('id')); }
      let roles = [], blocked = [];
      try { roles = await q(C().from('ltl_roles').select('email,role')); } catch (e) {}
      try { blocked = await q(C().from('ltl_blocked').select('user_id')); } catch (e) {}
      const rm = {}; (roles || []).forEach((r) => { rm[String(r.email || '').toLowerCase()] = r.role; });
      const bl = new Set((blocked || []).map((b) => b.user_id));
      return p.map((x) => Object.assign(x, { role: rm[String(x.email || '').toLowerCase()] || 'staff', blocked: bl.has(x.id) }));
    },
    async setRole(email, role) { await q(C().rpc('ltl_set_role', { p_email: email, p_role: role })); },
    async setBlocked(uid, b) { await q(C().rpc('ltl_set_blocked', { p_user: uid, p_blocked: !!b })); },
    async setPassword(uid, pw) { await q(C().rpc('ltl_admin_set_password', { p_user: uid, p_password: pw })); },
    async sendReset(email) { const { error } = await C().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; },
    async ping(info) {
      try { await q(C().from('ltl_profiles').update({ last_seen: U.nowISO(), page: info.page, device: info.device }).eq('id', Flow.myId())); }
      catch (e) { await q(C().from('ltl_profiles').update({ last_seen: U.nowISO() }).eq('id', Flow.myId())); }
    },
    async allRecords() { return CL().admin.allData(); },
    async contacts() { return (await q(C().rpc('ltl_contacts'))) || []; },
    async dms() { return pagedQ(() => C().from('ltl_dm').select('id,at,from_user,to_user,data').order('at')); },
    async dmSend(m) { await q(C().from('ltl_dm').insert(m)); },
    async deleteUser(uid) { await q(C().rpc('ltl_delete_user', { p_user: uid })); },
    async docImages(owner, doc) {
      const conv = async (rows) => {
        const out = [];
        for (const r of rows || []) {
          const d = r.data || {}; if (d._deleted) continue;
          const rec = Object.assign({}, d, { id: r.id }); delete rec.b64;
          if (d.b64 && !d._skipped) { try { rec.blob = await b64ToBlob(d.b64); } catch (e) {} }
          out.push(rec);
        }
        return out;
      };
      const ex = (doc.items || []).map((i) => i.expenseId).filter((x) => x && U.isId(x));
      const a = await q(C().from('ltl_records').select('id,data').eq('owner', owner).eq('kind', 'image').eq('data->>docId', doc.id));
      const b = ex.length ? await q(C().from('ltl_records').select('id,data').eq('owner', owner).eq('kind', 'image').in('data->>expenseId', ex)) : [];
      return conv((a || []).concat(b || []));
    },
  };
  Flow.B = () => (CL().demo && App.DemoSrv ? App.DemoSrv.api : Real);
  const online = () => !!(CL().demo || (CL().ready && CL().ready()));

  /* ---- hàng đợi gửi khi mất mạng (tin nhắn, lịch sử, thông báo) ---- */
  const OB = () => 'ltl_outbox_' + Flow.myId();
  const outbox = () => { try { return JSON.parse(localStorage.getItem(OB()) || '[]') || []; } catch (e) { return []; } };
  const saveOutbox = (a) => { try { localStorage.setItem(OB(), JSON.stringify(a.slice(-300))); } catch (e) {} };
  async function send(fn, payload) {
    if (CL().demo) return Flow.B()[fn](payload);
    if (!online()) { saveOutbox(outbox().concat([{ fn, payload }])); return; }
    try { await Real[fn](payload); }
    catch (e) {
      if (/fetch|network|Failed/i.test(String(e && e.message))) saveOutbox(outbox().concat([{ fn, payload }]));
      else console.warn('flow send', fn, e);
    }
  }
  Flow.flushOutbox = async function () {
    if (CL().demo || !online()) return;
    const box = outbox(); if (!box.length) return;
    const left = [];
    for (const it of box) { try { await Real[it.fn](it.payload); } catch (e) { if (/fetch|network|Failed/i.test(String(e && e.message))) left.push(it); } }
    saveOutbox(left);
  };

  /* ============================== Trạng thái & khoá ============================== */
  Flow.key = (owner, id) => owner + '|' + id;
  Flow.ownerOf = (doc, owner) => owner || (doc && doc._owner) || Flow.myId();
  Flow.reviewOf = (doc, owner) => (doc ? Flow.rev[Flow.key(Flow.ownerOf(doc, owner), doc.id)] || null : null);
  Flow.status = function (doc, owner) {
    if (!doc) return 'nhap';
    const s = doc.status || 'nhap';
    if (s === 'nhap') return 'nhap';
    const r = Flow.reviewOf(doc, owner);
    if (r && ST[r.status] && (r.round || 1) >= (doc.round || 1)) return r.status;
    return 'cho-duyet';   // đã gửi, chưa có quyết định cho lần gửi này (gồm phiếu bản cũ)
  };
  Flow.stInfo = (v) => ST[v] || ST.nhap;
  Flow.badge = function (doc, owner, short) {
    const v = Flow.status(doc, owner), s = ST[v];
    return '<span class="badge ' + s.cls + '">' + I(s.ic, 12) + (short ? s.s : s.t) + '</span>';
  };
  Flow.isMine = (owner) => !owner || owner === Flow.myId();
  Flow.locked = (doc, owner) => LOCKED.includes(Flow.status(doc, owner));
  Flow.canEdit = (doc, owner) => Flow.isMine(Flow.ownerOf(doc, owner)) && ['nhap', 'can-bo-sung'].includes(Flow.status(doc, owner));
  Flow.canDelete = (doc, owner) => Flow.isMine(Flow.ownerOf(doc, owner)) && !LOCKED.includes(Flow.status(doc, owner));
  // khoá theo máy chủ (giống điều kiện RLS) — dùng khi đồng bộ
  Flow.serverLocked = function (id) {
    const r = Flow.rev[Flow.key(Flow.myId(), id)];
    return !!(r && LOCKED.includes(r.status));
  };

  /* ============================== Minh chứng / hoá đơn ============================== */
  // ảnh theo từng dòng: ảnh gắn itemId + ảnh của khoản chi gốc (expenseId)
  Flow.evidence = function (doc, images) {
    const by = {}, general = [];
    (doc.items || []).forEach((it) => { by[it.id] = []; });
    (images || []).forEach((im) => {
      if (im.deletedAt) return;
      if (im.itemId && by[im.itemId]) by[im.itemId].push(im);
      else if (im.docId === doc.id && !im.itemId) general.push(im);
    });
    (doc.items || []).forEach((it) => {
      if (!it.expenseId) return;
      (images || []).forEach((im) => { if (im.expenseId === it.expenseId && !im.itemId && !im.docId) by[it.id].push(im); });
    });
    return { by, general };
  };
  Flow.hdBadge = (v) => '<span class="badge ' + (HD_CLS[v || ''] || 'out') + '">' + esc(HD_T[v || ''] || 'Chưa khai báo') + '</span>';
  Flow.hdOf = function (it) {
    if (it.hd) return it.hd;
    const g = String(it.ghiChu || '');
    if (/VAT/i.test(g)) return 'vat';
    if (/bill|bán lẻ/i.test(g)) return 'bill';
    return '';
  };
  Flow.checkSubmit = function (doc) {
    const D = App.Docs, items = D.filledItems(doc), errs = [];
    if (!items.length) errs.push('Bảng kê chưa có dòng nào.');
    if (!U.toNumber(D.total(doc))) errs.push('Số tiền phiếu đang bằng 0.');
    if (doc.type !== 'TU') {
      const ev = Flow.evidence(doc, App.data.images);
      const noImg = [], noHd = [];
      items.forEach((it, i) => { if (!(ev.by[it.id] || []).length) noImg.push(i + 1); if (!Flow.hdOf(it)) noHd.push(i + 1); });
      if (noImg.length) errs.push('Dòng ' + noImg.join(', ') + ' chưa có ảnh minh chứng / chứng từ (bấm nút camera ở từng dòng).');
      if (noHd.length) errs.push('Dòng ' + noHd.join(', ') + ' chưa chọn tình trạng hoá đơn.');
      if (doc.type === 'HU' && !doc.tuDocId && !doc.tuSoPhieu) errs.push('Phiếu hoàn ứng chưa chọn phiếu tạm ứng cần quyết toán.');
    }
    return errs;
  };

  /* ============================== Ghi chép: tin nhắn, lịch sử, thông báo ============================== */
  Flow.addMsg = async function (owner, doc, data) {
    const m = { id: U.uid(), owner, doc_id: doc.id, at: U.nowISO(), author: Flow.myId(),
      data: Object.assign({ name: Flow.myName(), role: Flow.role(), so: doc.soPhieu || '' }, data) };
    await send('addMsg', m);
    return m;
  };
  Flow.log = (owner, doc, action, lines) => Flow.addMsg(owner, doc, { kind: 'log', text: action, lines: (lines || []).filter(Boolean).slice(0, 40) });
  Flow.notify = async function (to, d) {
    if (!to || to === Flow.myId()) return;
    const n = { id: U.uid(), at: U.nowISO(), to_user: to === 'acc' ? null : to, to_acc: to === 'acc', author: Flow.myId(), data: Object.assign({ from: Flow.myName(), role: Flow.role() }, d) };
    await send('addNotif', n);
  };
  const docLink = (owner, doc, forAcc) => forAcc ? '#/duyet/' + owner + '/' + doc.id : '#/phieu/' + doc.id;
  Flow.docLabel = (d) => (App.Docs.TYPES[d.type] ? App.Docs.TYPES[d.type].prefix : 'Phiếu') + ' ' + (d.soPhieu || '');

  // so sánh trước / sau để ghi lịch sử chỉnh sửa
  const F_LABEL = { soPhieu: 'Số phiếu', ngayLap: 'Ngày lập', nguoiDeNghi: 'Người đề nghị', boPhan: 'Bộ phận', noiDung: 'Nội dung', mucDich: 'Mục đích',
    tenTK: 'Tên TK', soTK: 'Số TK', nganHang: 'Ngân hàng', deNghiKhac: 'Đề nghị khác', truongBoPhan: 'Trưởng bộ phận', tuSoPhieu: 'Phiếu tạm ứng số', daTamUng: 'Số tiền đã tạm ứng' };
  const I_LABEL = { noiDung: 'nội dung', ngayChi: 'ngày chi', nguoiThamGia: 'người tham gia', soLuong: 'SL', donGia: 'đơn giá', ghiChu: 'ghi chú', hd: 'hoá đơn' };
  const fv = (k, v) => k === 'daTamUng' || k === 'donGia' ? (v === '' || v == null ? '(trống)' : U.groupThousand(v)) : k === 'ngayLap' || k === 'ngayChi' ? (v ? U.fmtDate(v) : '(trống)') : k === 'hd' ? (HD_T[v || ''] || v) : (v === '' || v == null ? '(trống)' : String(v).slice(0, 60));
  Flow.diff = function (a, b) {
    const out = [];
    if (!a) return out;
    Object.keys(F_LABEL).forEach((k) => {
      const x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k];
      if (String(x) !== String(y)) out.push(F_LABEL[k] + ': ' + fv(k, x) + ' → ' + fv(k, y));
    });
    if ((a.eventId || '') !== (b.eventId || '')) out.push('Đổi sự kiện / đợt chi');
    const D = App.Docs, ai = {}, bi = {};
    (a.items || []).forEach((it, i) => { ai[it.id] = [it, i]; });
    (b.items || []).forEach((it, i) => { bi[it.id] = [it, i]; });
    Object.keys(bi).forEach((id) => {
      const [it, i] = bi[id];
      if (!ai[id]) { out.push('Thêm dòng ' + (i + 1) + ': ' + (it.noiDung || '') + ' · ' + money(D.lineTotal(it))); return; }
      const old = ai[id][0], ch = [];
      Object.keys(I_LABEL).forEach((k) => { if (String(old[k] == null ? '' : old[k]) !== String(it[k] == null ? '' : it[k])) ch.push(I_LABEL[k] + ' ' + fv(k, old[k]) + ' → ' + fv(k, it[k])); });
      if (ch.length) out.push('Sửa dòng ' + (i + 1) + ' (' + (it.noiDung || '').slice(0, 30) + '): ' + ch.join('; '));
    });
    Object.keys(ai).forEach((id) => { if (!bi[id]) { const [it, i] = ai[id]; out.push('Xoá dòng ' + (i + 1) + ': ' + (it.noiDung || '') + ' · ' + money(D.lineTotal(it))); } });
    const ta = D.total(a), tb = D.total(b);
    if (ta !== tb) out.push('Tổng tiền: ' + money(ta) + ' → ' + money(tb));
    return out;
  };

  /* ============================== Nhân sự: gửi / rút lại ============================== */
  Flow.submit = async function (doc) {
    const errs = Flow.checkSubmit(doc);
    if (errs.length) {
      App.openSheet(App.sheetHead('Chưa gửi được phiếu', 'Bổ sung các mục sau rồi gửi lại') +
        '<div class="alert warn">' + I('alert') + '<div><ul style="margin:0;padding-left:18px">' + errs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div></div>' +
        '<p class="muted" style="font-size:13px">Kế toán cần ảnh hoá đơn / chứng từ của <b>từng dòng</b> để đối chiếu. Bấm nút ' + I('camera', 14) + ' ở mỗi dòng bảng kê để chụp hoặc chọn ảnh.</p>' +
        '<div class="sheet-f"><button class="btn" data-act="closeTop">Đã hiểu</button></div>', { center: true });
      return false;
    }
    const was = Flow.status(doc);
    doc.status = 'da-gui'; doc.round = (doc.round || 0) + 1; doc.submittedAt = U.nowISO();
    await DB.put('docs', doc);
    const me = Flow.myId();
    await Flow.log(me, doc, was === 'can-bo-sung' ? 'Gửi lại sau khi bổ sung' : 'Gửi duyệt', ['Lần gửi thứ ' + doc.round + ' · ' + money(App.Docs.total(doc))]);
    await Flow.notify('acc', { title: Flow.myName() + ' gửi ' + Flow.docLabel(doc) + (was === 'can-bo-sung' ? ' (đã bổ sung)' : '') + ' chờ duyệt',
      body: (doc.noiDung || '') + ' · ' + money(App.Docs.total(doc)), link: docLink(me, doc, true), owner: me, docId: doc.id, kind: 'submit' });
    App.toast('Đã gửi ' + doc.soPhieu + ' cho kế toán duyệt', 'ok');
    return true;
  };
  Flow.withdraw = async function (doc) {
    doc.status = 'nhap';
    await DB.put('docs', doc);
    const me = Flow.myId();
    await Flow.log(me, doc, 'Rút lại phiếu để sửa', []);
    await Flow.notify('acc', { title: Flow.myName() + ' rút lại ' + Flow.docLabel(doc), body: 'Phiếu chưa được duyệt — người lập rút lại để sửa', link: docLink(me, doc, true), owner: me, docId: doc.id });
    App.toast('Đã rút lại — bạn có thể sửa và gửi lại', 'ok');
  };
  Flow.reportRefund = async function (doc, o) {
    const me = Flow.myId();
    await Flow.addMsg(me, doc, { kind: 'refund', text: 'Đã nộp lại ' + money(o.amount) + ' về tài khoản công ty' + (o.ref ? ' · Mã GD ' + o.ref : '') + (o.note ? ' · ' + o.note : ''),
      amount: o.amount, ref: o.ref || '', date: o.date || U.todayISO(), img: o.img || null });
    await Flow.notify('acc', { title: Flow.myName() + ' báo đã nộp lại ' + money(o.amount), body: Flow.docLabel(doc) + (o.ref ? ' · Mã GD ' + o.ref : ''), link: docLink(me, doc, true), owner: me, docId: doc.id, kind: 'refund' });
    Flow.refunds.push({ owner: me, doc_id: doc.id, at: U.nowISO(), data: { kind: 'refund', amount: o.amount, ref: o.ref } });
    App.toast('Đã báo kế toán — chờ xác nhận', 'ok');
  };

  /* ============================== Kế toán: quyết định ============================== */
  Flow.nextSoSo = function () {
    const y = String(new Date().getFullYear()), pre = 'KT' + y + '-';
    let max = 0;
    Object.values(Flow.rev).forEach((r) => { if (r && r.soSo && r.soSo.indexOf(pre) === 0) { const n = parseInt(r.soSo.slice(pre.length), 10); if (n > max) max = n; } });
    return pre + String(max + 1).padStart(4, '0');
  };
  const DECIDE_T = { 'da-duyet': 'Duyệt phiếu', 'da-chi': 'Duyệt chi', 'can-bo-sung': 'Yêu cầu xem xét lại / bổ sung', 'tu-choi': 'Từ chối phiếu', 'mo-lai': 'Mở lại phiếu đã khoá' };
  Flow.decide = async function (owner, doc, status, o) {
    o = o || {};
    if (!Flow.isAcc()) throw new Error('Chỉ kế toán / quản trị được duyệt');
    if (!online()) throw new Error('Cần có mạng để duyệt phiếu');
    const prev = Flow.reviewOf(doc, owner) || {};
    const reopen = status === 'mo-lai';
    const st = reopen ? 'can-bo-sung' : status;
    const r = Object.assign({}, prev, { status: st, round: doc.round || 1, note: o.note || '', by: Flow.myId(), byName: Flow.myName(), byRole: Flow.role(), at: U.nowISO() });
    if (LOCKED.includes(st) && !r.soSo) r.soSo = Flow.nextSoSo();
    if (st === 'da-chi') r.paid = { at: o.paidAt || U.todayISO(), ref: o.ref || '', amount: o.amount != null ? o.amount : App.Docs.total(doc) };
    await Flow.B().putReview(owner, doc.id, r);
    Flow.rev[Flow.key(owner, doc.id)] = r;
    const lines = [];
    if (o.note) lines.push('Ghi chú: ' + o.note);
    if (r.soSo && LOCKED.includes(st)) lines.push('Số vào sổ: ' + r.soSo);
    if (st === 'da-chi') lines.push('Ngày chi ' + U.fmtDate(r.paid.at) + ' · ' + money(r.paid.amount) + (r.paid.ref ? ' · Mã GD ' + r.paid.ref : ''));
    await Flow.log(owner, doc, DECIDE_T[status] || status, lines);
    const msg = { 'da-duyet': 'đã DUYỆT', 'da-chi': 'đã DUYỆT CHI', 'can-bo-sung': 'yêu cầu XEM XÉT LẠI / BỔ SUNG', 'tu-choi': 'đã TỪ CHỐI', 'mo-lai': 'đã MỞ LẠI để bạn sửa' }[status];
    await Flow.notify(owner, { title: (ROLES[Flow.role()] || {}).t + ' ' + msg + ' ' + Flow.docLabel(doc), body: o.note || ((doc.noiDung || '') + ' · ' + money(App.Docs.total(doc))), link: docLink(owner, doc, false), owner, docId: doc.id, kind: 'decide' });
    Flow.invalidate();
    return r;
  };
  Flow.checkItem = async function (owner, doc, itemId, patch) {
    if (!Flow.isAcc()) return;
    // chưa có quyết định: tạo bản ghi chỉ chứa dấu đối chiếu (trạng thái 'cho-xem' không đổi trạng thái phiếu)
    const r = Object.assign({}, Flow.reviewOf(doc, owner) || { status: 'cho-xem', round: 0 });
    r.items = Object.assign({}, r.items || {});
    r.items[itemId] = Object.assign({}, r.items[itemId] || {}, patch, { by: Flow.myName(), at: U.nowISO() });
    await Flow.B().putReview(owner, doc.id, r);
    Flow.rev[Flow.key(owner, doc.id)] = r;
  };
  Flow.confirmRefund = async function (owner, hu, o) {
    const r = Object.assign({}, Flow.reviewOf(hu, owner) || {});
    r.refund = { ok: true, at: o.date || U.todayISO(), ref: o.ref || '', amount: o.amount, by: Flow.myId(), byName: Flow.myName() };
    await Flow.B().putReview(owner, hu.id, r);
    Flow.rev[Flow.key(owner, hu.id)] = r;
    await Flow.log(owner, hu, 'Xác nhận đã nhận tiền nộp lại', [money(o.amount) + ' · ngày ' + U.fmtDate(r.refund.at) + (o.ref ? ' · Mã GD ' + o.ref : '')]);
    await Flow.notify(owner, { title: 'Kế toán đã xác nhận nhận ' + money(o.amount) + ' nộp lại', body: Flow.docLabel(hu) + ' đã tất toán', link: docLink(owner, hu, false), owner, docId: hu.id });
    Flow.invalidate();
  };

  /* ---- minh chứng chi tiền của kế toán (ảnh bill CK, uỷ nhiệm chi, PDF…) ---- */
  async function fileToData(f) {
    const t = f.type || '';
    if (/^image\//.test(t)) return { name: f.name || 'anh.jpg', type: 'image/jpeg', data: await smallDataURL(f) };
    if (f.size > 1.5 * 1024 * 1024) throw new Error('Tệp ' + (f.name || '') + ' lớn hơn 1,5MB — hãy chụp ảnh hoặc nén lại');
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
    return { name: f.name || 'tep', type: t || 'application/octet-stream', data };
  }
  Flow.addProof = async function (owner, doc, files, note) {
    const out = [];
    for (const f of files || []) {
      const x = await fileToData(f);
      out.push(await Flow.addMsg(owner, doc, { kind: 'proof', text: note || ('Minh chứng chi: ' + x.name), file: x.type.indexOf('image/') === 0 ? null : x, img: x.type.indexOf('image/') === 0 ? x.data : null, fname: x.name }));
    }
    if (!files || !files.length) { if (note) out.push(await Flow.addMsg(owner, doc, { kind: 'proof', text: note })); }
    if (out.length) {
      await Flow.log(owner, doc, 'Kế toán đính kèm minh chứng chi', [out.length + ' mục' + (note ? ' · ' + note : '')]);
      if (owner !== Flow.myId()) await Flow.notify(owner, { title: 'Kế toán đã đính kèm minh chứng chi tiền cho ' + Flow.docLabel(doc), body: note || 'Bill chuyển khoản / uỷ nhiệm chi', link: docLink(owner, doc, false), owner, docId: doc.id, kind: 'decide' });
    }
    return out;
  };
  // hồ sơ đã xong hết (chứng từ, hoá đơn, tiền) → chuyển sang "Đã hoàn tất" để kế toán đỡ rối
  Flow.isDone = (doc, owner) => !!((Flow.reviewOf(doc, owner) || {}).done);
  Flow.markDone = async function (owner, doc, done) {
    const r = Object.assign({}, Flow.reviewOf(doc, owner) || {});
    r.done = done ? { at: U.nowISO(), by: Flow.myId(), byName: Flow.myName() } : null;
    await Flow.B().putReview(owner, doc.id, r);
    Flow.rev[Flow.key(owner, doc.id)] = r;
    await Flow.log(owner, doc, done ? 'Xác nhận hoàn tất hồ sơ' : 'Mở lại hồ sơ (bỏ hoàn tất)', []);
    Flow.invalidate();
  };
  // chi vượt tạm ứng: kế toán xác nhận công ty đã chuyển trả nhân sự (khi không qua DNTT)
  Flow.confirmTopup = async function (owner, hu, o) {
    const r = Object.assign({}, Flow.reviewOf(hu, owner) || {});
    r.topup = { ok: true, at: o.date || U.todayISO(), ref: o.ref || '', amount: o.amount, by: Flow.myId(), byName: Flow.myName() };
    await Flow.B().putReview(owner, hu.id, r);
    Flow.rev[Flow.key(owner, hu.id)] = r;
    await Flow.log(owner, hu, 'Xác nhận công ty đã chi bù', [money(o.amount) + ' · ngày ' + U.fmtDate(r.topup.at) + (o.ref ? ' · Mã GD ' + o.ref : '')]);
    await Flow.notify(owner, { title: 'Công ty đã chuyển bù ' + money(o.amount) + ' cho bạn', body: Flow.docLabel(hu) + ' đã tất toán', link: docLink(owner, hu, false), owner, docId: hu.id, kind: 'decide' });
    Flow.invalidate();
  };
  // nhắc qua lại (giới hạn 1 lần / phiếu / ngày)
  function once(key) {
    const k = 'ltl_once_' + Flow.myId() + '_' + key + '_' + U.todayISO();
    try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); } catch (e) {}
    return true;
  }
  Flow.remind = async function (owner, doc, text) {
    if (!once('r' + doc.id)) { App.toast('Hôm nay đã nhắc phiếu này rồi', 'err'); return false; }
    const t = text || ('Nhắc: ' + Flow.docLabel(doc) + ' chưa hoàn ứng — vui lòng lập phiếu hoàn ứng kèm hoá đơn, bảng kê.');
    await Flow.addMsg(owner, doc, { kind: 'yc', text: t });
    await Flow.notify(owner, { title: 'Kế toán nhắc: ' + Flow.docLabel(doc), body: t, link: docLink(owner, doc, false), owner, docId: doc.id, kind: 'msg' });
    return true;
  };
  Flow.nudge = async function (doc) {
    if (!once('n' + doc.id)) { App.toast('Hôm nay bạn đã nhắc kế toán về phiếu này', 'err'); return false; }
    const me = Flow.myId(), s = Flow.status(doc);
    const t = 'Nhờ kế toán ' + (s === 'da-duyet' ? 'lên lệnh chi' : 'xem và duyệt') + ' giúp ' + Flow.docLabel(doc) + ' (' + money(App.Docs.total(doc)) + ').';
    await Flow.addMsg(me, doc, { kind: 'msg', text: t });
    await Flow.notify('acc', { title: Flow.myName() + ' nhắc: ' + Flow.docLabel(doc), body: t, link: docLink(me, doc, true), owner: me, docId: doc.id, kind: 'msg' });
    App.toast('Đã nhắc kế toán', 'ok');
    if (thr && thr.doc.id === doc.id) Flow.loadThread(me, doc);
    return true;
  };

  /* ============================== Dữ liệu toàn công ty (kế toán) ============================== */
  Flow.invalidate = () => { if (Flow.all) Flow.all.at = 0; };
  Flow.loadAll = async function (force) {
    if (Flow.all && !force && Date.now() - Flow.all.at < 60000) return Flow.all;
    const B = Flow.B();
    const [rows, profs, refunds] = await Promise.all([B.allRecords(), B.profiles().catch(() => []), B.msgsKind('refund').catch(() => [])]);
    const pmap = {}; (profs || []).forEach((p) => { pmap[p.id] = p; });
    const docs = [], events = [], expenses = [], settingsBy = {};
    (rows || []).forEach((r) => {
      const rec = Object.assign({}, r.data, { id: r.id, updatedAt: r.updated_at, _owner: r.owner });
      if (rec.deletedAt || rec._deleted) return;
      if (r.kind === 'settings') settingsBy[r.owner] = rec; else if (r.kind === 'doc') docs.push(rec);
      else if (r.kind === 'event') events.push(rec); else if (r.kind === 'expense') expenses.push(rec);
    });
    docs.forEach((d) => {
      const p = pmap[d._owner] || {}, st = settingsBy[d._owner] || {};
      d._ownerName = p.full_name || st.hoTen || d.nguoiDeNghi || p.email || '—';
      d._dept = p.dept || st.boPhan || d.boPhan || '';
    });
    docs.sort((a, b) => (b.submittedAt || b.ngayLap || '').localeCompare(a.submittedAt || a.ngayLap || ''));
    Flow.refunds = refunds || [];
    Flow.all = { at: Date.now(), docs, events, expenses, settingsBy, profiles: profs || [], pmap };
    return Flow.all;
  };
  // phạm vi dữ liệu theo vai trò: kế toán = cả công ty, nhân sự = của mình
  Flow.scope = async function (force) {
    if (Flow.isAcc()) return Flow.loadAll(force);
    const me = Flow.myId();
    if (!Flow._refAt || force || Date.now() - Flow._refAt > 60000) {
      try { Flow.refunds = (await Flow.B().msgsKind('refund')).filter((m) => m.owner === me); Flow._refAt = Date.now(); } catch (e) {}
    }
    const docs = App.data.docs.map((d) => Object.assign({}, d, { _owner: me, _ownerName: d.nguoiDeNghi || Flow.myName(), _dept: d.boPhan || '' }));
    return { docs, events: App.data.events, expenses: App.data.expenses, profiles: [], pmap: {}, settingsBy: { [me]: App.settings } };
  };

  /* ============================== Đối chiếu: tạm ứng → hoàn ứng → nộp lại / DNTT bù ============================== */
  Flow.analyze = function (scope) {
    const D = App.Docs, me = Flow.myId();
    const docs = (scope.docs || []).filter((d) => !d.deletedAt);
    const own = (d) => d._owner || me;
    const st = (d) => Flow.status(d, own(d));
    const tot = (d) => D.total(d);
    const k2 = (o, id) => o + '|' + id;
    const huByTu = {}, ttByHu = {}, refBy = {};
    docs.forEach((d) => {
      if (d.type === 'HU' && d.tuDocId) (huByTu[k2(own(d), d.tuDocId)] = huByTu[k2(own(d), d.tuDocId)] || []).push(d);
      if (d.type === 'TT' && d.huDocId) (ttByHu[k2(own(d), d.huDocId)] = ttByHu[k2(own(d), d.huDocId)] || []).push(d);
    });
    (Flow.refunds || []).forEach((m) => { refBy[k2(m.owner, m.doc_id)] = m; });
    const byId = {}; docs.forEach((d) => { byId[k2(own(d), d.id)] = d; });

    const huInfo = (hu) => {
      const o = own(hu), tu = hu.tuDocId ? byId[k2(o, hu.tuDocId)] : null;
      const adv = tu ? tot(tu) : U.toNumber(hu.daTamUng), spent = tot(hu), diff = adv - spent, hs = st(hu);
      const rv = Flow.reviewOf(hu, o) || {};
      let k, label, cls;
      const tl = (ttByHu[k2(o, hu.id)] || []).filter((t) => st(t) !== 'tu-choi'); const tt = tl[0] || null;
      if (!LOCKED.includes(hs)) { k = 'hu-pending'; label = 'Hoàn ứng ' + ST[hs].s.toLowerCase(); cls = ST[hs].cls; }
      else if (diff === 0) { k = 'ok'; label = 'Khớp – đã tất toán'; cls = 'ok'; }
      else if (diff > 0) {
        if (rv.refund && rv.refund.ok) { k = 'refunded'; label = 'Đã nộp lại ' + money(diff); cls = 'ok'; }
        else if (refBy[k2(o, hu.id)]) { k = 'refund-wait'; label = 'Chờ KT xác nhận nộp lại ' + money(diff); cls = 'accent'; }
        else { k = 'refund-due'; label = 'Phải nộp lại ' + money(diff); cls = 'warn'; }
      } else if (rv.topup && rv.topup.ok) { k = 'topup-done'; label = 'Công ty đã chi bù ' + money(-diff); cls = 'ok'; }
      else if (!tt) { k = 'topup-due'; label = 'Chi vượt ' + money(-diff) + ' – công ty cần chi bù'; cls = 'warn'; }
      else { const ts = st(tt); k = ts === 'da-chi' ? 'topup-done' : 'topup-pending'; label = (ts === 'da-chi' ? 'Đã chi bù ' : 'DNTT bù ' + ST[ts].s.toLowerCase() + ' ') + money(-diff); cls = ts === 'da-chi' ? 'ok' : 'primary'; }
      return { hu, tu, o, adv, spent, diff, hs, k, label, cls, tt, refund: rv.refund || null, topup: rv.topup || null, refundReport: refBy[k2(o, hu.id)] || null, done: ['ok', 'refunded', 'topup-done'].includes(k) };
    };

    const tus = docs.filter((d) => d.type === 'TU').map((tu) => {
      const o = own(tu), s = st(tu), adv = tot(tu), r = Flow.reviewOf(tu, o) || {};
      const hl = (huByTu[k2(o, tu.id)] || []).filter((h) => st(h) !== 'tu-choi'); const hu = hl[0] || null;
      let x = { k: '', label: '', cls: '' };
      if (s === 'nhap') x = { k: 'draft', label: 'Chưa gửi', cls: 'out' };
      else if (s !== 'da-chi') x = { k: 'not-paid', label: 'Tạm ứng ' + ST[s].s.toLowerCase() + (s === 'da-duyet' ? ' – chờ chi' : ''), cls: ST[s].cls };
      else if (!hu) {
        const days = r.paid && r.paid.at ? Math.floor((Date.now() - Date.parse(r.paid.at)) / 864e5) : 0;
        x = { k: 'open', label: 'Chưa hoàn ứng' + (days ? ' · ' + days + ' ngày' : ''), cls: days > 30 ? 'danger' : 'warn', days };
      } else x = huInfo(hu);
      return Object.assign({ tu, o, s, adv, hu, spent: hu ? tot(hu) : 0, diff: hu ? adv - tot(hu) : adv, paid: r.paid || null, soSo: r.soSo || '' }, x,
        { done: ['ok', 'refunded', 'topup-done'].includes(x.k) });
    });
    const hus = docs.filter((d) => d.type === 'HU').map(huInfo);
    const tts = docs.filter((d) => d.type === 'TT').map((t) => {
      const o = own(t), hu = t.huDocId ? byId[k2(o, t.huDocId)] : null, r = Flow.reviewOf(t, o) || {};
      return { t, o, s: st(t), kind: t.huDocId ? 'bu' : 'doc-lap', hu, total: tot(t), paid: r.paid || null, soSo: r.soSo || '' };
    });
    // dòng chi phí & hoá đơn (hoàn ứng + thanh toán đã gửi)
    const lines = [];
    docs.filter((d) => d.type !== 'TU' && st(d) !== 'nhap').forEach((d) => {
      const o = own(d), rv = Flow.reviewOf(d, o) || {};
      D.filledItems(d).forEach((it, i) => {
        const hd = Flow.hdOf(it), chk = (rv.items || {})[it.id] || {};
        lines.push({ d, o, it, i, hd, has: hd === 'vat' || hd === 'bill', got: !!chk.hd, ok: !!chk.ok, amount: D.lineTotal(it), s: st(d) });
      });
    });
    // sổ giao dịch (giống sao kê: ngày · số tiền · người · diễn giải · mã GD · loại · ghi chú · theo dõi)
    const ledger = [];
    const tuOf = {}; tus.forEach((x) => { tuOf[k2(x.o, x.tu.id)] = x; });
    docs.forEach((d) => {
      const o = own(d), s = st(d); if (s === 'nhap') return;
      const r = Flow.reviewOf(d, o) || {}, name = d._ownerName || d.nguoiDeNghi || '', paid = r.paid || {};
      const base = { d, o, s, name, so: d.soPhieu, soSo: r.soSo || '' };
      if (d.type === 'TU') {
        const x = tuOf[k2(o, d.id)] || {};
        ledger.push(Object.assign({}, base, { date: paid.at || d.ngayLap, amount: tot(d), dir: 'chi', desc: d.noiDung || '', ref: paid.ref || '', cat: 'Tạm ứng nhân viên',
          note: 'Phiếu ' + d.soPhieu + ' ' + ST[s].t.toLowerCase() + '; theo dõi hoàn ứng (DNHU) kèm hoá đơn, bảng kê', follow: x.k === 'open' || x.k === 'not-paid' ? 'Theo dõi hoàn ứng (DNHU)' : x.label }));
      } else if (d.type === 'HU') {
        const x = huInfo(d);
        ledger.push(Object.assign({}, base, { date: d.ngayLap, amount: x.spent, dir: 'qt', desc: d.noiDung || '', ref: '', cat: 'Hoàn ứng – quyết toán tạm ứng',
          note: 'Quyết toán ' + (d.tuSoPhieu || '') + ': ứng ' + U.groupThousand(x.adv) + ' · thực chi ' + U.groupThousand(x.spent), follow: x.label }));
        if (x.topup && x.topup.ok) ledger.push(Object.assign({}, base, { date: x.topup.at, amount: -x.diff, dir: 'chi', desc: 'Công ty chi bù vượt tạm ứng ' + (d.tuSoPhieu || ''), ref: x.topup.ref || '', cat: 'Chi bù hoàn ứng',
          note: 'Kế toán xác nhận đã chuyển trả nhân sự', follow: 'Đã tất toán' }));
        if (x.refund && x.refund.ok) ledger.push(Object.assign({}, base, { date: x.refund.at, amount: x.diff, dir: 'thu', desc: 'Nộp lại tạm ứng thừa ' + (d.tuSoPhieu || ''), ref: x.refund.ref || '', cat: 'Thu hồi tạm ứng thừa',
          note: 'Kế toán xác nhận đã nhận về TK công ty', follow: 'Đã tất toán' }));
      } else {
        const bu = !!d.huDocId;
        ledger.push(Object.assign({}, base, { date: paid.at || d.ngayLap, amount: tot(d), dir: 'chi', desc: d.noiDung || '', ref: paid.ref || '', cat: bu ? 'Thanh toán bù hoàn ứng' : 'Thanh toán chi phí',
          note: 'Phiếu ' + d.soPhieu + ' ' + ST[s].t.toLowerCase() + (bu ? '; bù chi vượt tạm ứng' : '; ngoài tạm ứng'), follow: s === 'da-chi' ? 'Đã thanh toán' : 'Chờ ' + (s === 'da-duyet' ? 'chi' : 'duyệt') }));
      }
    });
    ledger.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return { docs, tus, hus, tts, lines, ledger };
  };

  /* ============================== Nhắc việc ============================== */
  Flow.reminders = function () {
    const out = [], today = new Date(), day = today.getDate(), me = Flow.myId();
    const mLabel = (d) => 'tháng ' + (d.getMonth() + 1) + '/' + d.getFullYear();
    if (Flow.isAcc()) {
      const all = Flow.all;
      if (all) {
        const a = Flow.analyze(all);
        const pend = all.docs.filter((d) => Flow.status(d, d._owner) === 'cho-duyet');
        if (pend.length) out.push({ ic: 'inbox', lv: 'primary', t: pend.length + ' phiếu đang chờ duyệt', s: 'Tạm ứng · hoàn ứng · thanh toán từ nhân sự', link: '#/duyet' });
        const rw = a.hus.filter((x) => x.k === 'refund-wait');
        if (rw.length) out.push({ ic: 'wallet', lv: 'accent', t: rw.length + ' khoản nộp lại chờ xác nhận', s: rw.map((x) => x.hu._ownerName + ' ' + money(x.diff)).slice(0, 3).join(' · '), link: '#/doi-chieu?tab=tu' });
        const open = a.tus.filter((x) => x.k === 'open' && x.days > 30);
        if (open.length) out.push({ ic: 'alert', lv: 'danger', t: open.length + ' tạm ứng quá 30 ngày chưa hoàn ứng', s: open.map((x) => x.tu._ownerName).slice(0, 3).join(', '), link: '#/doi-chieu?tab=tu' });
        const appr = all.docs.filter((d) => d.type !== 'HU' && Flow.status(d, d._owner) === 'da-duyet');
        if (appr.length) out.push({ ic: 'lock', lv: 'warn', t: appr.length + ' phiếu đã duyệt nhưng chưa chi (chưa lên lệnh)', s: appr.map((d) => d.soPhieu + ' · ' + d._ownerName).slice(0, 3).join(' · '), link: '#/duyet?tab=da-duyet' });
        const top = a.hus.filter((x) => x.k === 'topup-due' || x.k === 'topup-pending');
        if (top.length) out.push({ ic: 'calc', lv: 'warn', t: 'Công ty cần chi bù ' + top.length + ' khoản cho nhân sự', s: top.map((x) => x.hu._ownerName + ' ' + money(-x.diff)).slice(0, 3).join(' · '), link: '#/doi-chieu?tab=tu' });
        const late = a.tus.filter((x) => x.k === 'open' && x.days > 15 && x.days <= 30);
        if (late.length) out.push({ ic: 'clock', lv: 'warn', t: late.length + ' tạm ứng quá 15 ngày chưa hoàn ứng', s: 'Bấm “Nhắc” để gửi thông báo cho nhân sự', link: '#/doi-chieu?tab=tu' });
        const miss = a.lines.filter((x) => x.hd === 'chua' || x.hd === '');
        if (miss.length) out.push({ ic: 'receipt', lv: 'warn', t: miss.length + ' dòng chi chưa có hoá đơn', s: 'Theo dõi bù hoá đơn', link: '#/doi-chieu?tab=hd' });
      }
      if (day <= 5) { const pm = new Date(today.getFullYear(), today.getMonth() - 1, 1); out.push({ ic: 'book', lv: 'accent', t: 'Chốt sổ & báo cáo ' + mLabel(pm), s: 'Xuất báo cáo đối chiếu tháng trước cho BCTC', link: '#/doi-chieu?p=prev' }); }
    } else {
      const docs = App.data.docs;
      docs.forEach((d) => {
        const s = Flow.status(d);
        if (s === 'can-bo-sung') { const r = Flow.reviewOf(d) || {}; out.push({ ic: 'alert', lv: 'warn', t: d.soPhieu + ' cần xem xét lại', s: r.note || 'Kế toán yêu cầu bổ sung', link: '#/phieu/' + d.id }); }
        if (s === 'tu-choi') out.push({ ic: 'x', lv: 'danger', t: d.soPhieu + ' bị từ chối', s: (Flow.reviewOf(d) || {}).note || '', link: '#/phieu/' + d.id });
      });
      const a = Flow.analyze({ docs: docs.map((d) => Object.assign({}, d, { _owner: me })) });
      a.tus.filter((x) => x.k === 'open').forEach((x) => out.push({ ic: 'wallet', lv: x.days > 30 ? 'danger' : 'warn', t: 'Tạm ứng ' + x.tu.soPhieu + ' chưa hoàn ứng', s: money(x.adv) + (x.days ? ' · đã ' + x.days + ' ngày' : ''), link: '#/phieu/moi/HU?from=' + x.tu.id }));
      a.hus.filter((x) => x.k === 'refund-due').forEach((x) => out.push({ ic: 'wallet', lv: 'warn', t: 'Nộp lại ' + money(x.diff) + ' về TK công ty', s: 'Theo phiếu ' + x.hu.soPhieu, link: '#/phieu/' + x.hu.id }));
      a.hus.filter((x) => x.k === 'topup-due').forEach((x) => out.push({ ic: 'calc', lv: 'warn', t: 'Lập DNTT bù ' + money(-x.diff), s: 'Chi vượt tạm ứng ở ' + x.hu.soPhieu, link: '#/phieu/moi/TT?bu=' + x.hu.id }));
      docs.filter((d) => Flow.status(d) === 'cho-duyet' && d.submittedAt && Date.now() - Date.parse(d.submittedAt) > 3 * 864e5).forEach((d) =>
        out.push({ ic: 'bell', lv: 'accent', t: d.soPhieu + ' chờ duyệt đã ' + Math.floor((Date.now() - Date.parse(d.submittedAt)) / 864e5) + ' ngày', s: 'Mở phiếu → “Nhắc kế toán” hoặc nhắn tin', link: '#/phieu/' + d.id }));
      const drafts = docs.filter((d) => Flow.status(d) === 'nhap').length;
      if (drafts) out.push({ ic: 'edit', lv: 'out', t: drafts + ' phiếu nháp chưa gửi duyệt', s: 'Gửi kế toán khi đã đủ chứng từ', link: '#/' });
      if (day >= 25) out.push({ ic: 'calendar', lv: 'accent', t: 'Cuối ' + mLabel(today) + ': hoàn tất chứng từ', s: 'Gửi hoàn ứng, bổ sung hoá đơn trước khi chốt sổ', link: '#/doi-chieu' });
    }
    return out;
  };

  /* ============================== Thông báo thiết bị ============================== */
  Flow.pushState = () => !('Notification' in window) ? 'unsupported' : Notification.permission;
  async function deviceNotify(title, body, link, tag) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const opts = { body: body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: tag || ('ltl-' + Date.now()), data: { link: link || '#/' }, renotify: false };
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) await reg.showNotification(title, opts);
      else { const n = new Notification(title, opts); n.onclick = () => { window.focus(); if (link) location.hash = link.replace(/^#/, ''); n.close(); }; }
    } catch (e) { console.warn('notify', e); }
  }
  Flow.deviceNotify = deviceNotify;
  Flow.enablePush = async function () {
    if (!('Notification' in window)) {
      App.toast('Trình duyệt chưa hỗ trợ thông báo. Trên iPhone/iPad: Chia sẻ → Thêm vào MH chính, rồi mở app từ biểu tượng và bật lại.', 'err');
      return;
    }
    const p = await Notification.requestPermission();
    if (p === 'granted') { App.toast('Đã bật thông báo trên thiết bị này', 'ok'); deviceNotify('LtL · Đã bật thông báo', 'Bạn sẽ nhận thông báo khi có phiếu mới, phiếu được duyệt và tin nhắn.', '#/'); }
    else App.toast('Thông báo đang bị chặn — mở cài đặt trang web của trình duyệt để cho phép', 'err');
    updateBell();
  };
  function setBadge(n) { try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) {} }

  /* ============================== Chuông thông báo ============================== */
  const RK = () => 'ltl_nread_' + Flow.myId();
  Flow.unread = function () { let r = ''; try { r = localStorage.getItem(RK()) || ''; } catch (e) {} return Flow.notifs.filter((n) => n.at > r).length; };
  function updateBell() {
    const n = Flow.unread(), b = document.getElementById('bell-n');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; }
    setBadge(n);
    if (App.dmUpdateBadge) App.dmUpdateBadge();
    const c = document.getElementById('duyet-cnt');
    if (c && Flow.isAcc()) { const p = Flow.pendingCount(); c.textContent = p || ''; c.hidden = !p; }
  }
  Flow.updateBell = updateBell;
  Flow.pendingCount = function () {
    if (!Flow.all) return 0;
    return Flow.all.docs.filter((d) => Flow.status(d, d._owner) === 'cho-duyet').length;
  };
  function bellHTML() {
    let r = ''; try { r = localStorage.getItem(RK()) || ''; } catch (e) {}
    const rem = Flow.reminders();
    const ps = Flow.pushState();
    const push = ps === 'granted' ? '' : '<div class="alert info" style="margin-bottom:12px">' + I('bell') + '<div style="flex:1"><b>Nhận thông báo trên điện thoại / máy tính</b><br><span class="muted" style="font-size:12.5px">' +
      (ps === 'unsupported' ? 'Trình duyệt này chưa hỗ trợ. Trên iPhone/iPad: Chia sẻ → Thêm vào Màn hình chính rồi mở app từ biểu tượng.' : ps === 'denied' ? 'Đang bị chặn — mở cài đặt trang web để cho phép thông báo.' : 'Báo ngay khi có phiếu mới, phiếu được duyệt, tin nhắn hay nhắc việc.') +
      '</span></div>' + (ps === 'default' ? '<button class="btn sm" data-act="enablePush">Bật</button>' : '') + '</div>';
    const remH = rem.length ? '<div class="nt-sec">Việc cần làm (' + rem.length + ')</div>' + rem.map((x) =>
      '<a class="nt-it rem" href="' + esc(x.link) + '" data-act="bellGo"><span class="nt-ic ' + esc(x.lv) + '">' + I(x.ic, 16) + '</span><span class="nt-b"><b>' + esc(x.t) + '</b><small>' + esc(x.s || '') + '</small></span></a>').join('') : '';
    const list = Flow.notifs.slice(0, 60).map((n) => {
      const d = n.data || {};
      return '<a class="nt-it' + (n.at > r ? ' new' : '') + '" href="' + esc(d.link || '#/') + '" data-act="bellGo"><span class="nt-ic ' + (d.kind === 'decide' ? 'ok' : d.kind === 'refund' ? 'accent' : 'primary') + '">' +
        I(d.kind === 'msg' || d.kind === 'dm' ? 'chat' : d.kind === 'decide' ? 'check' : d.kind === 'refund' ? 'wallet' : 'bell', 16) + '</span><span class="nt-b"><b>' + esc(d.title || '') + '</b><small>' + esc(d.body || '') + '</small><i>' + esc(Flow.ago(n.at)) + '</i></span></a>';
    }).join('');
    return App.sheetHead('Thông báo', Flow.unread() ? Flow.unread() + ' thông báo mới' : 'Không có thông báo mới') + push + remH +
      '<div class="nt-sec">Thông báo' + (Flow.notifs.length ? '' : '') + '</div>' + (list || '<p class="muted" style="font-size:13px;margin:6px 0 0">Chưa có thông báo nào.</p>') +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Đóng</button><button class="btn" data-act="bellRead">' + I('check') + 'Đánh dấu đã đọc</button></div>';
  }

  /* ============================== Vòng cập nhật ============================== */
  Flow.poll = async function (opts) {
    opts = opts || {};
    const me = Flow.myId(); if (!me || !online()) return;
    try {
      await Flow.flushOutbox();
      const B = Flow.B();
      const since = new Date(Date.now() - 45 * 864e5).toISOString();
      const [revs, ns] = await Promise.all([B.reviews(), B.notifs(since)]);
      const rev = {};
      (revs || []).forEach((r) => { rev[Flow.key(r.owner, r.doc_id)] = r.data || {}; });
      const sig = JSON.stringify((revs || []).map((r) => [r.owner, r.doc_id, r.updated_at]).sort());
      Flow.rev = rev;
      const acc = Flow.isAcc();
      Flow.notifs = (ns || []).filter((n) => n.author !== me && (n.to_user === me || (n.to_acc && acc))).sort((a, b) => b.at.localeCompare(a.at));
      // thông báo mới kể từ lần trước → bật thông báo thiết bị
      const SK = 'ltl_nseen_' + me;
      let seen = ''; try { seen = localStorage.getItem(SK) || ''; } catch (e) {}
      if (!seen) seen = new Date(Date.now() - 864e5).toISOString();
      const fresh = Flow.notifs.filter((n) => n.at > seen);
      if (fresh.length) {
        fresh.slice(0, 3).reverse().forEach((n) => deviceNotify((n.data || {}).title || 'LtL', (n.data || {}).body || '', (n.data || {}).link, n.id));
        if (!opts.quiet) App.toast(fresh.length === 1 ? (fresh[0].data || {}).title : fresh.length + ' thông báo mới', 'ok', { label: 'Xem', fn: () => App.actions.openBell() });
        try { localStorage.setItem(SK, fresh[0].at); } catch (e) {}
      } else if (!localStorage.getItem(SK)) { try { localStorage.setItem(SK, seen); } catch (e) {} }
      if (acc && (!Flow.all || Date.now() - Flow.all.at > 120000)) { try { await Flow.loadAll(true); } catch (e) {} }
      updateBell();
      if (Flow._sig != null && sig !== Flow._sig) { Flow.invalidate(); onChange(); }
      Flow._sig = sig;
      dailyReminder();
    } catch (e) { console.warn('flow poll', e); }
  };
  function onChange() {
    const n = App.route && App.route.name;
    if (!App.user || document.querySelector('#modal-root .overlay')) return;
    if (n === 'phieu' && App.Docs.isDirty && App.Docs.isDirty()) return;
    if (['', 'tam-ung', 'hoan-ung', 'thanh-toan', 'phieu', 'duyet', 'doi-chieu'].includes(n)) App.reload();
  }
  function dailyReminder() {
    const k = 'ltl_rday_' + Flow.myId(), today = U.todayISO();
    let last = ''; try { last = localStorage.getItem(k) || ''; } catch (e) {}
    if (last === today) return;
    const rem = Flow.reminders().filter((x) => x.lv !== 'out');
    try { localStorage.setItem(k, today); } catch (e) {}
    if (!rem.length) return;
    deviceNotify('Nhắc việc hôm nay (' + rem.length + ')', rem.slice(0, 3).map((x) => '• ' + x.t).join('\n'), rem[0].link, 'ltl-remind');
  }
  Flow.ping = async function () {
    if (!Flow.myId() || !online() || document.visibilityState === 'hidden') return;
    try { await Flow.B().ping({ page: (App.route && App.route.name) || 'tong-quan', device: Flow.device() }); } catch (e) {}
  };
  Flow.start = async function () {
    Flow.stop();
    if (!Flow.myId()) return;
    Flow._sig = null; Flow.all = null; Flow.refunds = []; Flow._refAt = 0;
    const t0 = Date.now();
    await Flow.poll({ quiet: true });
    if (Date.now() - t0 > 2300) onChange();   // tải chậm hơn lúc vào app → vẽ lại với trạng thái mới
    Flow.ping();
    Flow._timers.push(setInterval(() => { if (document.visibilityState !== 'hidden') Flow.poll(); }, 30000));
    Flow._timers.push(setInterval(() => Flow.ping(), 60000));
    if (!CL().demo && C() && C().channel) {
      try {
        Flow._ch = C().channel('ltl-flow-' + Flow.myId())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ltl_notifs' }, () => Flow.poll())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ltl_reviews' }, () => Flow.poll())
          .subscribe();
      } catch (e) {}
    }
  };
  Flow.stop = function () {
    Flow._timers.forEach((t) => clearInterval(t)); Flow._timers = [];
    if (Flow._ch) { try { C().removeChannel(Flow._ch); } catch (e) {} Flow._ch = null; }
    Flow.rev = {}; Flow.notifs = []; Flow.all = null; setBadge(0);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && App.user) { Flow.poll(); Flow.ping(); } });
  window.addEventListener('hashchange', () => { clearTimeout(Flow._pt); Flow._pt = setTimeout(() => Flow.ping(), 1500); });
  // bấm vào thông báo hệ thống → service worker gửi đường dẫn về
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open' && e.data.link) location.hash = String(e.data.link).replace(/^#/, ''); });

  /* ============================== Trao đổi & lịch sử của một phiếu ============================== */
  let thr = null;   // { owner, doc, msgs, tab, att }
  Flow.threadCard = function (owner, doc) {
    return '<div class="card" id="thr-card"><div class="card-h"><div class="t">' + I('chat') + 'Trao đổi &amp; lịch sử</div>' +
      '<div class="seg" id="thr-tabs"><button class="on" data-act="thrTab:chat">Trao đổi <span class="cnt0" id="thr-nc"></span></button><button data-act="thrTab:log">Lịch sử sửa <span class="cnt0" id="thr-nl"></span></button></div></div>' +
      '<div class="card-b" id="thr-body"><div class="skel"></div><div class="skel mt12" style="width:60%"></div></div></div>';
  };
  Flow.loadThread = async function (owner, doc) {
    thr = { owner, doc, msgs: [], tab: thr && thr.doc && thr.doc.id === doc.id ? thr.tab : 'chat', att: null };
    try { thr.msgs = (await Flow.B().msgs(owner, doc.id)) || []; }
    catch (e) { const b = document.getElementById('thr-body'); if (b) b.innerHTML = '<div class="alert warn">' + I('alert') + '<div>Chưa tải được trao đổi: ' + esc(e.message || e) + (CL().demo ? '' : '<br>Kiểm tra mạng hoặc chạy lại supabase/setup.sql.') + '</div></div>'; return; }
    paintThread();
    paintProofs();
  };
  function paintProofs() {
    const box = document.getElementById('proof-box'); if (!box || !thr) return;
    const pr = thr.msgs.filter((m) => (m.data || {}).kind === 'proof');
    const acc = Flow.isAcc() && thr.owner !== Flow.myId();
    if (!pr.length && !acc) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card"><div class="card-h"><div class="t">' + I('receipt') + 'Minh chứng chi tiền của kế toán <span class="cnt0">' + pr.length + '</span></div>' +
      (acc ? '<button class="btn sm out" data-act="proofAdd">' + I('upload') + 'Thêm minh chứng chi</button>' : '') + '</div><div class="card-b">' +
      (pr.length ? '<div class="ev-grid">' + pr.map((m) => { const d = m.data || {};
        return '<div class="pf-it">' + (d.img ? '<img src="' + esc(d.img) + '" alt="" data-act="proofView:' + esc(m.id) + '">' : '<a href="#" class="pf-file" data-act="proofView:' + esc(m.id) + '">' + I(d.file ? 'file' : 'chat', 22) + '<span>' + esc(d.fname || (d.file ? 'Tệp' : 'Ghi chú')) + '</span></a>') +
          '<small>' + esc(d.text || '') + '<br><i>' + esc(d.name || '') + ' · ' + esc(U.fmtDateTime(m.at)) + '</i></small></div>'; }).join('') + '</div>'
        : '<p class="muted" style="margin:0;font-size:13px">Sau khi chuyển khoản thành công, đính kèm bill chuyển khoản / uỷ nhiệm chi hoặc ghi chú để làm minh chứng sau này.</p>') + '</div></div>';
  }
  Flow.paintProofs = paintProofs;
  function lineRef(itemId) {
    if (!itemId || !thr) return '';
    const items = App.Docs.filledItems(thr.doc), i = items.findIndex((x) => x.id === itemId);
    if (i < 0) return '<div class="mref">' + I('list', 12) + 'Dòng đã xoá</div>';
    const it = items[i];
    return '<div class="mref">' + I('list', 12) + 'Dòng ' + (i + 1) + ': ' + esc((it.noiDung || '').slice(0, 50)) + ' · ' + money(App.Docs.lineTotal(it)) + '</div>';
  }
  const KIND = { yc: ['Yêu cầu / nhắc', 'warn'], gt: ['Giải trình', 'ok'], refund: ['Báo đã nộp lại', 'accent'], proof: ['Minh chứng chi', 'ok'], msg: null };
  function paintThread() {
    const b = document.getElementById('thr-body'); if (!b || !thr) return;
    const me = Flow.myId(), chat = thr.msgs.filter((m) => (m.data || {}).kind !== 'log'), logs = thr.msgs.filter((m) => (m.data || {}).kind === 'log');
    const nc = document.getElementById('thr-nc'), nl = document.getElementById('thr-nl');
    if (nc) nc.textContent = chat.length ? '(' + chat.length + ')' : ''; if (nl) nl.textContent = logs.length ? '(' + logs.length + ')' : '';
    document.querySelectorAll('#thr-tabs button').forEach((x) => x.classList.toggle('on', x.getAttribute('data-act') === 'thrTab:' + thr.tab));
    if (thr.tab === 'log') {
      b.innerHTML = logs.length ? '<div class="tline">' + logs.slice().reverse().map((m) => {
        const d = m.data || {};
        return '<div class="tl-it"><span class="tl-dot"></span><div><b>' + esc(d.text || '') + '</b> <span class="muted" style="font-size:12px">· ' + esc(d.name || '') + ' ' + Flow.roleBadge(d.role) + ' · ' + esc(U.fmtDateTime(m.at)) + '</span>' +
          ((d.lines || []).length ? '<ul class="tl-l">' + d.lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') + '</div></div>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0;font-size:13px">Chưa có lịch sử. Mọi lần lưu, gửi, duyệt, sửa đều được ghi lại ở đây — kế toán, quản trị và người lập đều xem được.</p>';
      return;
    }
    const acc = Flow.isAcc();
    const items = App.Docs.filledItems(thr.doc);
    const openYc = chat.some((m) => (m.data || {}).kind === 'yc');
    const list = chat.length ? chat.map((m) => {
      const d = m.data || {}, mine = m.author === me, k = KIND[d.kind];
      return '<div class="msg ' + (mine ? 'me' : 'them') + (d.kind ? ' k-' + esc(d.kind) : '') + '"><div class="mh"><b>' + esc(d.name || '') + '</b> ' + Flow.roleBadge(d.role) +
        (k ? ' <span class="badge ' + k[1] + '">' + k[0] + '</span>' : '') + '<span class="tm">' + esc(Flow.ago(m.at)) + '</span></div>' + lineRef(d.itemId) +
        '<div class="mtx">' + esc(d.text || '').replace(/\n/g, '<br>') + '</div>' +
        (d.img ? '<img class="mimg" src="' + esc(d.img) + '" alt="Ảnh đính kèm" data-act="thrImg:' + esc(m.id) + '">' : '') + '</div>';
    }).join('') : '<p class="muted" style="margin:0 0 6px;font-size:13px">' + (acc ? 'Nhắn trực tiếp cho người lập phiếu để sửa lỗi, hoặc chọn <b>Yêu cầu giải trình</b> cho khoản chưa hợp lý.' : 'Trao đổi với kế toán về phiếu này. Khi kế toán yêu cầu giải trình, trả lời bằng loại <b>Giải trình</b>.') + '</p>';
    const kinds = acc ? [['msg', 'Tin nhắn'], ['yc', 'Yêu cầu giải trình']] : [['msg', 'Tin nhắn'], ['gt', 'Giải trình']];
    b.innerHTML = '<div class="thr-list" id="thr-list">' + list + '</div>' +
      '<div class="thr-comp"><div class="row" style="gap:8px;flex-wrap:wrap">' +
      '<select class="select sm" id="thr-kind" aria-label="Loại tin">' + kinds.map((x) => '<option value="' + x[0] + '"' + (!acc && openYc && x[0] === 'gt' ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
      '<select class="select sm" id="thr-item" aria-label="Gắn với dòng" style="flex:1;min-width:160px"><option value="">Cả phiếu</option>' + items.map((it, i) => '<option value="' + esc(it.id) + '">Dòng ' + (i + 1) + ': ' + esc((it.noiDung || '').slice(0, 40)) + '</option>').join('') + '</select></div>' +
      '<div class="thr-in"><textarea class="textarea" id="thr-text" rows="2" placeholder="Nhập nội dung… (Ctrl+Enter để gửi)"></textarea>' +
      '<div class="thr-btns"><button class="btn out icon" data-act="thrPhoto" title="Đính kèm ảnh" aria-label="Đính kèm ảnh">' + I('camera') + '</button><button class="btn icon" data-act="thrSend" title="Gửi" aria-label="Gửi">' + I('send') + '</button></div></div>' +
      '<div id="thr-att"></div></div>';
    const l = document.getElementById('thr-list'); if (l) l.scrollTop = l.scrollHeight;
    const t = document.getElementById('thr-text');
    if (t) t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); App.actions.thrSend(); } });
    paintAtt();
  }
  function paintAtt() {
    const a = document.getElementById('thr-att'); if (!a) return;
    a.innerHTML = thr && thr.att ? '<div class="row mt8" style="gap:8px"><img src="' + esc(thr.att) + '" alt="" style="height:56px;border-radius:8px"><button class="btn ghost xs" data-act="thrAttX">' + I('x', 14) + 'Bỏ ảnh</button></div>' : '';
  }
  async function smallDataURL(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob); }
    catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); }); }
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.72);
  }
  Flow.smallDataURL = smallDataURL;
  Flow.askRequest = function (owner, doc, itemId) {
    if (!thr || thr.doc.id !== doc.id) return;
    thr.tab = 'chat'; paintThread();
    const k = document.getElementById('thr-kind'), it = document.getElementById('thr-item'), t = document.getElementById('thr-text');
    if (k) k.value = Flow.isAcc() ? 'yc' : 'gt'; if (it) it.value = itemId || '';
    if (t) { t.focus(); t.placeholder = Flow.isAcc() ? 'Nêu khoản chưa hợp lý và yêu cầu giải trình…' : 'Giải trình cho khoản này…'; }
    const card = document.getElementById('thr-card'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ============================== Xem minh chứng từng dòng ============================== */
  // opts: { title, sub, imgs, editable, onAdd(files), onDel(id) }
  Flow.openEvidence = function (opts) {
    const render = () => {
      const imgs = opts.imgs();
      const pics = imgs.filter((x) => x.blob && (x.kind === 'image' || !x.kind));
      const files = imgs.filter((x) => !(x.blob && (x.kind === 'image' || !x.kind)));
      return App.sheetHead(opts.title, opts.sub) +
        (pics.length ? '<div class="ev-grid">' + pics.map((im, i) => '<div class="ev-th"><img src="' + esc(App.imgURL(im)) + '" alt="Minh chứng" data-evi="' + i + '">' +
          (im.expenseId && !im.itemId ? '<span class="ev-tag">từ khoản chi</span>' : '') +
          (opts.editable && im.itemId ? '<button class="ev-del" data-evd="' + esc(im.id) + '" aria-label="Xoá ảnh">' + I('x', 14) + '</button>' : '') + '</div>').join('') + '</div>' : '') +
        (files.length ? '<div class="mt12">' + files.map((f) => '<div class="row" style="gap:8px;margin:4px 0">' + I('file', 16) + '<span style="flex:1">' + esc(f.name || 'Tệp') + (f._noBlob ? ' <span class="muted">(chưa có trên máy này)</span>' : '') + '</span>' +
          (f.blob ? '<button class="btn out xs" data-evf="' + esc(f.id) + '">Tải</button>' : '') + '</div>').join('') + '</div>' : '') +
        (!imgs.length ? '<div class="empty" style="padding:22px 10px"><div class="eic">' + I('camera') + '</div><div class="et">Chưa có minh chứng</div><div class="es">' + (opts.editable ? 'Chụp ảnh hoá đơn / bill / chứng từ chuyển khoản cho dòng này.' : 'Người lập chưa đính kèm ảnh cho dòng này.') + '</div></div>' : '') +
        (opts.editable ? '<div class="sheet-f"><button class="btn out" id="ev-lib">' + I('image') + 'Chọn ảnh / tệp</button><button class="btn" id="ev-cam">' + I('camera') + 'Chụp ảnh</button></div>'
          : '<div class="sheet-f"><button class="btn" data-act="closeTop">Đóng</button></div>');
    };
    const ov = App.openSheet(render(), { wide: true });
    const sheet = ov.querySelector('.sheet');
    const bind = () => {
      sheet.querySelectorAll('[data-evi]').forEach((im) => { im.onclick = () => { const pics = opts.imgs().filter((x) => x.blob && (x.kind === 'image' || !x.kind)); App.lightbox(App.imageItems(pics), +im.getAttribute('data-evi'), im); }; });
      sheet.querySelectorAll('[data-evd]').forEach((b) => { b.onclick = async () => { await opts.onDel(b.getAttribute('data-evd')); refresh(); }; });
      sheet.querySelectorAll('[data-evf]').forEach((b) => { b.onclick = () => { const f = opts.imgs().find((x) => x.id === b.getAttribute('data-evf')); if (f && f.blob) U.saveBlob(f.blob, U.safeName(f.name || 'tep')); }; });
      const lib = sheet.querySelector('#ev-lib'), cam = sheet.querySelector('#ev-cam');
      if (lib) lib.onclick = async () => { const fs = await App.pickFiles(App.FILE_ACCEPT, true); if (fs.length) { await opts.onAdd(fs); refresh(); } };
      if (cam) cam.onclick = () => App.openCamera(async (blobs) => { await opts.onAdd(blobs); refresh(); });
    };
    const refresh = () => { sheet.innerHTML = '<div class="grip"></div>' + render(); bind(); };
    bind();
    return ov;
  };

  // sheet đính kèm minh chứng chi: ảnh (camera / thư viện), PDF, ghi chú
  Flow.proofSheet = function (owner, doc, done) {
    let files = [];
    const ov = App.openSheet(App.sheetHead('Minh chứng chi tiền', Flow.docLabel(doc) + ' · ' + (doc._ownerName || doc.nguoiDeNghi || '')) +
      App.ui.textarea('pf-note', 'Ghi chú (mã giao dịch, ngân hàng, nội dung CK…)', '', { rows: 2, ph: 'VD: CK Techcombank FT26314… ngày 10/11' }) +
      '<div class="row" style="gap:8px"><button class="btn out sm" id="pf-cam">' + I('camera') + 'Chụp bill</button><button class="btn out sm" id="pf-lib">' + I('image') + 'Chọn ảnh / PDF</button><span id="pf-n" class="muted" style="font-size:12.5px"></span></div>' +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Bỏ qua</button><button class="btn" id="pf-ok">' + I('check') + 'Lưu minh chứng</button></div>', { center: true });
    const n = () => { ov.querySelector('#pf-n').textContent = files.length ? files.length + ' tệp: ' + files.map((f) => f.name || 'ảnh').join(', ') : ''; };
    ov.querySelector('#pf-cam').onclick = () => App.openCamera((b) => { files = files.concat(b.map((x, i) => (x.name ? x : new File([x], 'bill-' + (files.length + i + 1) + '.jpg', { type: 'image/jpeg' })))); n(); });
    ov.querySelector('#pf-lib').onclick = async () => { const fs = await App.pickFiles('image/*,application/pdf', true); files = files.concat(fs); n(); };
    ov.querySelector('#pf-ok').onclick = async () => {
      const note = App.val('pf-note');
      if (!files.length && !note) { App.toast('Chọn ảnh / tệp hoặc nhập ghi chú', 'err'); return; }
      const btn = ov.querySelector('#pf-ok'); btn.disabled = true;
      try { await Flow.addProof(owner, doc, files, note); App.closeSheet(ov); App.toast('Đã lưu minh chứng chi', 'ok'); if (done) done(); }
      catch (e) { btn.disabled = false; App.toast(e.message || String(e), 'err'); }
    };
  };

  /* ============================== Actions ============================== */
  Object.assign(App.actions, {
    openBell() { App.openSheet(bellHTML(), { wide: false }); },
    proofAdd() {
      if (!thr) return;
      const { owner, doc } = thr;
      Flow.proofSheet(owner, doc, async () => { await Flow.loadThread(owner, doc); });
    },
    proofView(id) {
      const m = thr && thr.msgs.find((x) => x.id === id); if (!m) return;
      const d = m.data || {};
      if (d.img) App.lightbox([{ url: d.img, kind: 'image', cap: d.text || '' }], 0);
      else if (d.file && d.file.data) fetch(d.file.data).then((r) => r.blob()).then((b) => U.saveBlob(b, U.safeName(d.file.name || 'tep')));
      else App.toast(d.text || '', 'ok');
    },
    bellGo() { App.closeAllSheets(); },
    bellRead() {
      try { localStorage.setItem(RK(), Flow.notifs.length ? Flow.notifs[0].at : U.nowISO()); } catch (e) {}
      updateBell(); App.closeAllSheets(); App.toast('Đã đánh dấu đã đọc', 'ok');
    },
    enablePush() { App.closeAllSheets(); return Flow.enablePush(); },
    thrTab(t) { if (!thr) return; thr.tab = t; paintThread(); },
    async thrPhoto() {
      const fs = await App.pickFiles('image/*', false); if (!fs.length || !thr) return;
      try { thr.att = await smallDataURL(fs[0]); paintAtt(); } catch (e) { App.toast('Không đọc được ảnh', 'err'); }
    },
    thrAttX() { if (thr) { thr.att = null; paintAtt(); } },
    thrImg(id) {
      const m = thr && thr.msgs.find((x) => x.id === id); if (!m || !m.data.img) return;
      App.lightbox([{ url: m.data.img, kind: 'image', cap: m.data.text || '' }], 0);
    },
    async thrSend() {
      if (!thr) return;
      const t = document.getElementById('thr-text'); const text = t ? t.value.trim() : '';
      if (!text && !thr.att) { App.toast('Nhập nội dung tin nhắn', 'err'); return; }
      const kind = App.val('thr-kind') || 'msg', itemId = App.val('thr-item') || null;
      const { owner, doc } = thr, acc = Flow.isAcc(), me = Flow.myId();
      const m = await Flow.addMsg(owner, doc, { kind, text, itemId, img: thr.att || null });
      thr.msgs.push(m); thr.att = null;
      const what = kind === 'yc' ? 'yêu cầu giải trình' : kind === 'gt' ? 'gửi giải trình' : 'nhắn tin';
      if (acc && owner !== me) await Flow.notify(owner, { title: (ROLES[Flow.role()] || {}).t + ' ' + what + ' về ' + Flow.docLabel(doc), body: text.slice(0, 140), link: docLink(owner, doc, false), owner, docId: doc.id, kind: 'msg' });
      else await Flow.notify('acc', { title: Flow.myName() + ' ' + what + ' về ' + Flow.docLabel(doc), body: text.slice(0, 140), link: docLink(owner, doc, true), owner, docId: doc.id, kind: 'msg' });
      paintThread();
    },
  });
})();
