/* =========================================================================
   admin.js — THÀNH VIÊN & PHÂN QUYỀN (kế toán / quản trị — quyền như nhau)
   • Danh sách mọi tài khoản: vai trò, bộ phận, đang dùng app (trang, thiết bị), số phiếu…
   • Đổi vai trò (nhân sự / kế toán / quản trị), cấp lại mật khẩu, gửi email đặt lại,
     khoá / mở khoá tài khoản con
   • Xem dữ liệu từng tài khoản (chỉ đọc) + xuất báo cáo
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const F = () => App.Flow;
  const ONLINE_MS = 3 * 60 * 1000;
  const PAGE_T = { 'tong-quan': 'Tổng quan', '': 'Tổng quan', 'tam-ung': 'Tạm ứng', 'hoan-ung': 'Hoàn ứng', 'thanh-toan': 'Thanh toán', 'chi-tieu': 'Chi tiêu', 'su-kien': 'Sự kiện',
    phieu: 'Đang soạn phiếu', duyet: 'Duyệt chứng từ', 'doi-chieu': 'Đối chiếu', 'bao-cao': 'Báo cáo', 'tai-khoan': 'Thành viên', 'ca-nhan': 'Hồ sơ', 'cai-dat': 'Cấu hình', 'thung-rac': 'Thùng rác', 'huong-dan': 'Hướng dẫn' };
  const online = (p) => p.last_seen && Date.now() - Date.parse(p.last_seen) < ONLINE_MS;

  App.screens['tai-khoan'] = function (root, route) {
    if (!App.isAdmin()) {
      root.innerHTML = App.pageHead('Thành viên & phân quyền', '') +
        '<div class="alert warn">' + I('shield') + '<div><b>Chỉ kế toán / quản trị mới xem được trang này.</b><br>Mỗi nhân sự chỉ thấy dữ liệu của chính mình.</div></div>';
      return;
    }
    if (route.parts[1]) return ownerView(root, route.parts[1], route.q.tab || 'docs');
    listView(root);
  };

  function setupHelp(err) {
    return '<div class="alert danger">' + I('alert') + '<div><b>Chưa đọc được danh sách tài khoản.</b> ' + esc(err && err.message || err || '') +
      '<br>Hãy chạy file <code>supabase/setup.sql</code> (bản mới) trong Supabase → SQL Editor (một lần), rồi tải lại trang.</div></div>';
  }
  function statsBy(all) {
    const by = {};
    const o = (id) => by[id] || (by[id] = { docs: 0, TU: 0, HU: 0, TT: 0, amount: 0, expenses: 0, spent: 0, events: 0, pend: 0 });
    all.docs.forEach((d) => { const x = o(d._owner); x.docs++; if (x[d.type] != null) x[d.type]++; x.amount += App.Docs.total(d); if (F().status(d, d._owner) === 'cho-duyet') x.pend++; });
    all.expenses.forEach((e) => { const x = o(e._owner); x.expenses++; x.spent += U.toNumber(e.amount); });
    all.events.forEach((e) => { o(e._owner).events++; });
    return by;
  }

  async function listView(root, force) {
    root.innerHTML = App.pageHead('Thành viên & phân quyền', 'Mọi tài khoản đang sử dụng') +
      '<div class="card"><div class="card-b"><div class="skel" style="width:40%"></div><div class="skel mt12"></div><div class="skel mt12" style="width:70%"></div></div></div>';
    let all;
    try { all = await F().loadAll(force); } catch (e) { root.innerHTML = App.pageHead('Thành viên & phân quyền', '') + setupHelp(e); return; }
    if (App.route.name !== 'tai-khoan' || App.route.parts[1]) return;
    const by = statsBy(all);
    const profiles = all.profiles.slice();
    Object.keys(by).forEach((id) => { if (!profiles.some((p) => p.id === id)) profiles.push({ id, email: '(chưa cập nhật hồ sơ)', full_name: (all.settingsBy[id] || {}).hoTen || '', role: 'staff' }); });
    const f = App.adminFilter || (App.adminFilter = { q: '', role: '' });
    const me = F().myId();
    const roleOrder = { admin: 0, ketoan: 1, staff: 2 };
    profiles.sort((a, b) => (online(b) - online(a)) || (roleOrder[a.role] - roleOrder[b.role]) || String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
    const on = profiles.filter(online);
    const cnt = (r) => profiles.filter((p) => (p.role || 'staff') === r).length;
    const rowsHTML = () => profiles.filter((p) => (!f.role || (p.role || 'staff') === f.role) && (!f.q || U.normText([p.email, p.full_name, p.dept].join(' ')).indexOf(U.normText(f.q)) >= 0)).map((p) => {
      const o = by[p.id] || { docs: 0, TU: 0, HU: 0, TT: 0, amount: 0, expenses: 0, spent: 0, events: 0, pend: 0 };
      const ini = String(p.full_name || p.email || '?').trim().split(/\s+/).slice(-2).map((w) => w.charAt(0)).join('').toUpperCase();
      return '<tr class="' + (p.blocked ? 'row-off' : '') + '"><td data-l="Thành viên"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="av sm r-' + esc(p.role || 'staff') + '">' + esc(ini) + (online(p) ? '<i class="on-dot"></i>' : '') + '</span>' +
        '<span><b>' + esc(p.full_name || '—') + '</b>' + (p.id === me ? ' <span class="badge out">Bạn</span>' : '') + '<span class="sub">' + esc(p.email || '') + '</span></span></div></td>' +
        '<td data-l="Vai trò">' + F().roleBadge(p.role || 'staff') + (p.blocked ? ' <span class="badge danger">' + I('lock', 12) + 'Đã khoá</span>' : '') + '</td>' +
        '<td data-l="Bộ phận">' + esc(p.dept || '—') + '</td>' +
        '<td data-l="Phiếu" class="nowrap">' + o.docs + (o.pend ? ' <span class="badge primary">' + o.pend + ' chờ duyệt</span>' : '') + '<span class="sub">TU ' + o.TU + ' · HU ' + o.HU + ' · TT ' + o.TT + ' · ' + money(o.amount) + '</span></td>' +
        '<td data-l="Hoạt động" class="nowrap">' + (online(p) ? '<span class="ok-t b">● Đang dùng</span><span class="sub">' + esc(PAGE_T[p.page] || p.page || '') + (p.device ? ' · ' + esc(p.device) : '') + '</span>'
          : esc(p.last_seen ? F().ago(p.last_seen) : '—') + (p.device ? '<span class="sub">' + esc(p.device) + '</span>' : '')) + '</td>' +
        '<td class="acts"><a class="btn out xs" href="#/tai-khoan/' + esc(p.id) + '">' + I('eye') + 'Dữ liệu</a>' +
        '<button class="btn ghost icon xs" data-act="memMenu:' + esc(p.id) + '" title="Quyền, mật khẩu, khoá" aria-label="Thao tác">' + I('more') + '</button></td></tr>';
    }).join('');
    App._members = profiles;
    root.innerHTML = App.pageHead('Thành viên & phân quyền', 'Kế toán và quản trị có quyền như nhau: xem mọi dữ liệu, duyệt chứng từ, quản lý thành viên. Cập nhật ' + esc(F().ago(new Date(all.at).toISOString())) + '.',
      '<button class="btn accent" data-act="adminReportAll">' + I('excel') + 'Báo cáo chi phí tất cả</button><button class="btn out" data-act="adminRefresh">' + I('refresh') + 'Làm mới</button>') +
      '<div class="kpis k4">' + App.kpi('users', 'Thành viên', profiles.length, cnt('staff') + ' nhân sự · ' + cnt('ketoan') + ' kế toán · ' + cnt('admin') + ' quản trị') +
      App.kpi('sparkle', 'Đang dùng app', on.length + ' <small>người</small>', on.slice(0, 3).map((p) => p.full_name || p.email).join(', ') || 'Không ai', on.length ? 'hot' : '') +
      App.kpi('inbox', 'Phiếu chờ duyệt', Object.values(by).reduce((a, o) => a + o.pend, 0), 'Toàn công ty') +
      App.kpi('wallet', 'Giá trị phiếu', money(Object.values(by).reduce((a, o) => a + o.amount, 0)), Object.values(by).reduce((a, o) => a + o.docs, 0) + ' phiếu') + '</div>' +
      '<div class="card mt16"><div class="card-b" style="padding-bottom:12px"><div class="row" style="gap:10px;flex-wrap:wrap"><div class="search field mb0" style="flex:1;min-width:220px;max-width:420px">' + I('search') +
      '<input class="input" id="ad-q" type="search" placeholder="Tìm tên, email, bộ phận…" value="' + esc(f.q) + '"></div>' +
      App.selectBare('ad-role', f.role, [{ v: '', t: 'Mọi vai trò' }, { v: 'staff', t: 'Nhân sự' }, { v: 'ketoan', t: 'Kế toán' }, { v: 'admin', t: 'Quản trị' }]) + '</div></div>' +
      '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Thành viên</th><th>Vai trò</th><th>Bộ phận</th><th>Phiếu</th><th>Hoạt động</th><th class="acts"></th></tr></thead>' +
      '<tbody id="ad-body">' + rowsHTML() + '</tbody></table></div></div>' +
      '<div class="alert info mt16">' + I('info') + '<div><b>Tài khoản con</b>: nhân sự tự tạo bằng email công việc, mặc định là <b>Nhân sự</b> (chỉ thấy dữ liệu của mình). Kế toán / quản trị có thể đổi vai trò, khoá tài khoản hoặc cấp lại mật khẩu khi nhân sự quên.</div></div>';
    const q = document.getElementById('ad-q');
    q.oninput = () => { f.q = q.value; document.getElementById('ad-body').innerHTML = rowsHTML(); };
    document.getElementById('ad-role').onchange = (e) => { f.role = e.target.value; document.getElementById('ad-body').innerHTML = rowsHTML(); };
  }

  function genPass() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const r = new Uint32Array(10); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 1e9; });
    return 'Ltl' + Array.from(r).map((x) => a[x % a.length]).join('').slice(0, 7) + '@' + (r[0] % 90 + 10);
  }
  function memMenu(id) {
    const p = (App._members || []).find((x) => x.id === id); if (!p) return;
    const me = F().myId(), self = p.id === me;
    const ov = App.openSheet(App.sheetHead(p.full_name || p.email, (p.email || '') + ' · ' + F().ROLES[p.role || 'staff'].t) +
      '<div class="field"><label>Vai trò</label><div class="seg" id="mm-role">' + ['staff', 'ketoan', 'admin'].map((r) => '<button class="' + ((p.role || 'staff') === r ? 'on' : '') + '" data-r="' + r + '"' + (self ? ' disabled' : '') + '>' + F().ROLES[r].t + '</button>').join('') + '</div>' +
      '<div class="hint">' + (self ? 'Không tự đổi vai trò của chính mình (tránh mất quyền).' : 'Nhân sự: chỉ dữ liệu của mình · Kế toán / Quản trị: xem tất cả, duyệt, quản lý thành viên.') + '</div></div>' +
      '<div class="menu-item" data-mm="pw"><div class="mic">' + I('key') + '</div><div><div class="mt">Cấp lại mật khẩu</div><div class="ms">Đặt mật khẩu tạm, gửi cho nhân sự qua Zalo — nhắc đổi lại sau khi đăng nhập</div></div></div>' +
      '<div class="menu-item" data-mm="mail"><div class="mic">' + I('send') + '</div><div><div class="mt">Gửi email đặt lại mật khẩu</div><div class="ms">Nhân sự tự đặt mật khẩu mới qua liên kết trong email</div></div></div>' +
      (self ? '' : '<div class="menu-item" data-mm="block"><div class="mic" style="' + (p.blocked ? '' : 'background:hsl(var(--nguy-hiem)/.1);color:hsl(var(--nguy-hiem-dam))') + '">' + I(p.blocked ? 'unlock' : 'lock') + '</div><div><div class="mt">' + (p.blocked ? 'Mở khoá tài khoản' : 'Khoá tài khoản') + '</div><div class="ms">' + (p.blocked ? 'Cho phép ghi dữ liệu trở lại' : 'Tài khoản không thêm / sửa được dữ liệu (vẫn giữ lịch sử)') + '</div></div></div>') +
      '<a class="menu-item" href="#/tai-khoan/' + esc(p.id) + '" style="color:inherit;text-decoration:none"><div class="mic">' + I('eye') + '</div><div><div class="mt">Xem dữ liệu</div><div class="ms">Phiếu, khoản chi, sự kiện (chỉ đọc)</div></div></a>', { center: true });
    ov.addEventListener('click', async (e) => {
      if (e.target.closest('a.menu-item')) { App.closeSheet(ov); return; }
      const rb = e.target.closest('#mm-role button[data-r]');
      if (rb && !rb.disabled) {
        const r = rb.getAttribute('data-r'); if (r === (p.role || 'staff')) return;
        try { await F().B().setRole(p.email, r); p.role = r; App.toast('Đã đổi ' + (p.full_name || p.email) + ' thành ' + F().ROLES[r].t, 'ok'); App.closeSheet(ov); F().invalidate(); listView(document.getElementById('screen'), true); }
        catch (er) { App.toast('Lỗi: ' + (er.message || er), 'err'); }
        return;
      }
      const it = e.target.closest('[data-mm]'); if (!it) return;
      const k = it.getAttribute('data-mm');
      if (k === 'pw') { App.closeSheet(ov); pwSheet(p); }
      else if (k === 'mail') {
        try { await F().B().sendReset(p.email); App.toast(App.cloud.demo ? 'Dùng thử: giả lập đã gửi email đặt lại mật khẩu' : 'Đã gửi email đặt lại mật khẩu tới ' + p.email, 'ok'); App.closeSheet(ov); }
        catch (er) { App.toast('Lỗi: ' + (er.message || er), 'err'); }
      } else if (k === 'block') {
        App.closeSheet(ov);
        App.confirmSheet(p.blocked ? 'Mở khoá tài khoản?' : 'Khoá tài khoản?', (p.full_name || p.email) + (p.blocked ? ' sẽ được thêm / sửa dữ liệu trở lại.' : ' sẽ không thêm / sửa được dữ liệu. Dữ liệu và lịch sử vẫn được giữ.'), async () => {
          try { await F().B().setBlocked(p.id, !p.blocked); App.toast(p.blocked ? 'Đã mở khoá' : 'Đã khoá tài khoản', 'ok'); F().invalidate(); listView(document.getElementById('screen'), true); }
          catch (er) { App.toast('Lỗi: ' + (er.message || er), 'err'); }
        }, !p.blocked, p.blocked ? 'Mở khoá' : 'Khoá');
      }
    });
  }
  function pwSheet(p) {
    const pw = genPass();
    const ov = App.openSheet(App.sheetHead('Cấp lại mật khẩu', (p.full_name || '') + ' · ' + (p.email || '')) +
      App.ui.text('pw-new', 'Mật khẩu mới (tạm thời)', pw, { hint: 'Tối thiểu 8 ký tự. Gửi riêng cho nhân sự, nhắc đổi lại tại Hồ sơ cá nhân → Đổi mật khẩu.' }) +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn out" id="pw-copy">' + I('copy') + 'Sao chép</button><button class="btn" id="pw-ok">' + I('key') + 'Đặt mật khẩu</button></div>', { center: true });
    ov.querySelector('#pw-copy').onclick = () => { try { navigator.clipboard.writeText(ov.querySelector('#pw-new').value); App.toast('Đã sao chép', 'ok'); } catch (e) {} };
    ov.querySelector('#pw-ok').onclick = async () => {
      const v = ov.querySelector('#pw-new').value.trim();
      if (v.length < 8) { App.toast('Mật khẩu tối thiểu 8 ký tự', 'err'); return; }
      try {
        await F().B().setPassword(p.id, v);
        App.closeSheet(ov);
        App.toast(App.cloud.demo ? 'Dùng thử: giả lập đã đặt mật khẩu mới' : 'Đã đặt mật khẩu mới cho ' + (p.full_name || p.email), 'ok');
        F().notify(p.id, { title: 'Kế toán / quản trị đã cấp lại mật khẩu cho bạn', body: 'Hãy đổi mật khẩu tại Hồ sơ cá nhân sau khi đăng nhập', link: '#/ca-nhan' });
      } catch (e) { App.toast('Lỗi: ' + (e.message || e) + ' — kiểm tra đã chạy setup.sql bản mới', 'err'); }
    };
  }

  async function ownerView(root, ownerId, tab) {
    root.innerHTML = '<div class="crumbs"><a href="#/tai-khoan">' + I('left', 14) + 'Thành viên</a></div>' +
      '<div class="card"><div class="card-b"><div class="skel" style="width:40%"></div><div class="skel mt12"></div></div></div>';
    let all;
    try { all = await F().loadAll(); } catch (e) { root.innerHTML = setupHelp(e); return; }
    if (App.route.parts[1] !== ownerId) return;
    const p = all.pmap[ownerId] || { email: ownerId };
    const docs = all.docs.filter((d) => d._owner === ownerId).sort((a, b) => (b.ngayLap || '').localeCompare(a.ngayLap || ''));
    const events = all.events.filter((e) => e._owner === ownerId), exps = all.expenses.filter((e) => e._owner === ownerId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const st = all.settingsBy[ownerId] || {};
    App.adminDocs = docs;
    App.adminOwner = { name: p.full_name || st.hoTen || p.email, email: p.email, dept: p.dept || st.boPhan, events, docs, expenses: exps, settings: st };
    App.adminOwnerSettings = st;
    const D = App.Docs;
    const evName = (id) => (events.find((e) => e.id === id) || {}).name || '';
    const sumT = (t) => docs.filter((d) => d.type === t).reduce((a, d) => a + D.total(d), 0);
    const docRows = docs.map((d) => '<tr class="click" data-href="#/duyet/' + esc(ownerId) + '/' + esc(d.id) + '"><td data-l="Số phiếu"><span class="badge mono primary">' + esc(d.soPhieu) + '</span></td><td data-l="Loại">' + esc(D.TYPES[d.type] ? D.TYPES[d.type].label : d.type) + '</td>' +
      '<td data-l="Nội dung" style="min-width:200px">' + esc(d.noiDung || '—') + '<span class="sub">' + esc(d.ngayLap ? U.fmtDate(d.ngayLap) : '') + (d.eventId ? ' · ' + esc(evName(d.eventId)) : '') + '</span></td>' +
      '<td class="num b" data-l="Số tiền">' + money(D.total(d)) + '</td><td data-l="Trạng thái">' + F().badge(d, ownerId, true) + '</td>' +
      '<td class="acts"><a class="btn out xs" href="#/duyet/' + esc(ownerId) + '/' + esc(d.id) + '">' + I('eye') + 'Xem / duyệt</a><button class="btn out xs" data-act="docWord:' + esc(d.id) + '">' + I('word') + 'Word</button></td></tr>').join('');
    const expRows = exps.map((e) => '<tr><td data-l="Ngày" class="nowrap">' + esc(U.fmtDate(e.date)) + '</td><td data-l="Nội dung">' + esc(e.content) + '<span class="sub">' + esc(evName(e.eventId)) + '</span></td>' +
      '<td data-l="Hoá đơn">' + App.vatBadge(e) + '</td><td class="num b" data-l="Số tiền">' + money(e.amount) + '</td></tr>').join('');
    const evRows = events.map((e) => {
      const l = exps.filter((x) => x.eventId === e.id);
      return '<tr><td data-l="Sự kiện"><b>' + esc(e.name) + '</b><span class="sub">' + esc(e.date ? U.fmtDate(e.date) : '') + '</span></td><td class="num" data-l="Khoản chi">' + l.length + '</td><td class="num b" data-l="Thực chi">' + money(l.reduce((a, x) => a + U.toNumber(x.amount), 0)) + '</td></tr>';
    }).join('');
    const tabBtn = (k, l) => '<button class="' + (tab === k ? 'on' : '') + '" data-act="adminTab:' + esc(ownerId) + '|' + k + '">' + l + '</button>';
    root.innerHTML = '<div class="crumbs"><a href="#/tai-khoan">' + I('left', 14) + 'Thành viên</a><span>/</span><span>' + esc(p.full_name || p.email) + '</span></div>' +
      App.pageHead(esc(p.full_name || st.hoTen || p.email), esc(p.email || '') + (p.dept ? ' · ' + esc(p.dept) : '') + ' · ' + F().roleBadge(p.role || 'staff') + ' <span class="badge out">Chỉ đọc</span>',
        '<button class="btn accent" data-act="adminReportOwner:excel">' + I('chart') + 'Báo cáo chi phí (Excel)</button><button class="btn out" data-act="adminReportOwner:word">' + I('word') + 'Báo cáo Word</button>' +
        (docs.length ? '<button class="btn out" data-act="adminExcelAll">' + I('excel') + 'Từng phiếu theo mẫu</button>' : '') +
        '<button class="btn out" data-act="memMenu:' + esc(ownerId) + '">' + I('key') + 'Quyền & mật khẩu</button>') +
      '<div class="kpis k4">' + App.kpi('file', 'Tạm ứng', money(sumT('TU')), docs.filter((d) => d.type === 'TU').length + ' phiếu') +
      App.kpi('wallet', 'Hoàn ứng', money(sumT('HU')), docs.filter((d) => d.type === 'HU').length + ' phiếu') +
      App.kpi('calc', 'Thanh toán', money(sumT('TT')), docs.filter((d) => d.type === 'TT').length + ' phiếu') +
      App.kpi('receipt', 'Thực chi', money(exps.reduce((a, x) => a + U.toNumber(x.amount), 0)), exps.length + ' khoản · ' + events.length + ' sự kiện') + '</div>' +
      '<div class="card mt16"><div class="card-h"><div class="seg">' + tabBtn('docs', 'Phiếu (' + docs.length + ')') + tabBtn('exp', 'Khoản chi (' + exps.length + ')') + tabBtn('ev', 'Sự kiện (' + events.length + ')') + '</div></div>' +
      '<div class="card-b flush">' +
      (tab === 'docs' ? (docRows ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Số phiếu</th><th>Loại</th><th>Nội dung</th><th class="num">Số tiền</th><th>Trạng thái</th><th class="acts"></th></tr></thead><tbody>' + docRows + '</tbody></table></div>' : App.emptyState('file', 'Chưa có phiếu', ''))
        : tab === 'exp' ? (expRows ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Hoá đơn</th><th class="num">Số tiền</th></tr></thead><tbody>' + expRows + '</tbody></table></div>' : App.emptyState('receipt', 'Chưa có khoản chi', ''))
          : (evRows ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Sự kiện</th><th class="num">Khoản chi</th><th class="num">Thực chi</th></tr></thead><tbody>' + evRows + '</tbody></table></div>' : App.emptyState('calendar', 'Chưa có sự kiện', ''))) +
      '</div></div>';
    if (!App._members || !App._members.some((x) => x.id === ownerId)) App._members = (App._members || []).concat([p]);
  }

  Object.assign(App.actions, {
    memMenu(id) { memMenu(id); },
    adminRefresh() { listView(document.getElementById('screen'), true); },
    adminTab(arg) { const [id, tab] = arg.split('|'); history.replaceState(null, '', '#/tai-khoan/' + id + '?tab=' + tab); App.route.q.tab = tab; ownerView(document.getElementById('screen'), id, tab); },
    adminPreview(id) {
      const d = (App.adminDocs || []).find((x) => x.id === id); if (!d) return;
      App.openSheet(App.sheetHead(d.soPhieu, (d.nguoiDeNghi || '') + ' · chỉ đọc') + App.Docs.previewBox(d) +
        '<div class="sheet-f"><button class="btn out" data-act="adminPrint:' + esc(id) + '">' + I('printer') + 'In / PDF</button><button class="btn out" data-act="docWord:' + esc(id) + '">' + I('word') + 'Word</button><button class="btn" data-act="docExcel:' + esc(id) + '">' + I('excel') + 'Excel</button></div>', { wide: true });
      setTimeout(App.Docs.fitPaper, 30);
    },
    async adminReportOwner(kind) {
      const o = App.adminOwner; if (!o) return;
      const r = App.Report.build({ events: o.events, docs: o.docs, expenses: o.expenses, images: [], settings: App.settings, owner: { name: o.name, email: o.email, dept: o.dept } }, {});
      App.toast('Đang tạo báo cáo của ' + o.name + '…');
      if (kind === 'word') await App.Report.word(r, { images: false }); else await App.Report.excel(r, {});
    },
    async adminReportAll() {
      App.toast('Đang tải dữ liệu mọi tài khoản…');
      let all;
      try { all = await F().loadAll(true); } catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); return; }
      const by = {};
      const o = (id) => by[id] || (by[id] = { events: [], docs: [], expenses: [] });
      all.events.forEach((x) => o(x._owner).events.push(x)); all.docs.forEach((x) => o(x._owner).docs.push(x)); all.expenses.forEach((x) => o(x._owner).expenses.push(x));
      const people = [], allE = { events: [], docs: [], expenses: [] };
      Object.keys(by).forEach((id) => {
        const x = by[id], p = all.pmap[id] || {}, st = all.settingsBy[id] || {};
        const name = p.full_name || st.hoTen || p.email || id.slice(0, 8);
        x.expenses.forEach((e) => { e._owner = name; });
        allE.events.push(...x.events); allE.docs.push(...x.docs); allE.expenses.push(...x.expenses);
        const r1 = App.Report.build({ events: x.events, docs: x.docs, expenses: x.expenses, settings: App.settings }, {});
        people.push({ name, email: p.email || '', dept: p.dept || st.boPhan || '', docs: r1.docs.length, tu: r1.tu, hu: r1.hu, tt: r1.tt, spent: r1.spent, count: r1.expenses.length });
      });
      people.sort((a, b) => b.spent - a.spent);
      const r = App.Report.build(Object.assign(allE, { settings: App.settings, owner: { name: 'Tất cả tài khoản (' + people.length + ')', dept: 'Kế toán / Quản trị' } }), {});
      await App.Report.excel(r, { people, filename: 'Bao-cao-tong-tat-ca-tai-khoan-' + U.todayISO() + '.xlsx' });
    },
    adminPrint(id) { const d = (App.adminDocs || []).find((x) => x.id === id); if (d) App.Docs.print(d); },
    async adminExcelAll() {
      const docs = App.adminDocs || []; if (!docs.length) return;
      App.toast('Đang tạo Excel ' + docs.length + ' phiếu…');
      await App.Export.excel(docs.slice().reverse(), U.safeName('Phieu - ' + ((App.adminOwnerSettings || {}).hoTen || 'tai-khoan') + ' - ' + U.todayISO()) + '.xlsx');
    },
  });
})();
