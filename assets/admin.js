/* =========================================================================
   admin.js — Trang quản trị: chỉ tài khoản quản trị (bảng ltl_admins) thấy.
   Xem danh sách mọi tài khoản đang dùng + dữ liệu từng tài khoản (CHỈ ĐỌC),
   xuất Word / Excel phiếu của bất kỳ tài khoản nào để kiểm soát.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const cache = { list: null, owner: {} };

  App.screens['tai-khoan'] = function (root, route) {
    if (!App.isAdmin()) {
      root.innerHTML = App.pageHead('Quản lý tài khoản', '') +
        '<div class="alert warn">' + I('shield') + '<div><b>Chỉ tài khoản quản trị mới xem được trang này.</b><br>Mỗi tài khoản chỉ thấy dữ liệu của chính mình.</div></div>';
      return;
    }
    if (route.parts[1]) return ownerView(root, route.parts[1], route.q.tab || 'docs');
    listView(root);
  };

  async function loadList(force) {
    if (cache.list && !force) return cache.list;
    const [profiles, rows] = await Promise.all([App.cloud.admin.profiles(), App.cloud.admin.summary()]);
    const by = {};
    rows.forEach((r) => {
      const o = by[r.owner] || (by[r.owner] = { docs: 0, TU: 0, HU: 0, TT: 0, amount: 0, expenses: 0, spent: 0, events: 0, last: '' });
      if (r.kind === 'doc') { o.docs++; if (o[r.type] != null) o[r.type]++; o.amount += U.toNumber(r.total); }
      if (r.kind === 'expense') { o.expenses++; o.spent += U.toNumber(r.amount); }
      if (r.kind === 'event') o.events++;
      if ((r.updated_at || '') > o.last) o.last = r.updated_at;
    });
    // tài khoản có dữ liệu nhưng chưa có hồ sơ (đăng nhập bằng bản cũ)
    Object.keys(by).forEach((id) => { if (!profiles.some((p) => p.id === id)) profiles.push({ id, email: '(chưa cập nhật hồ sơ)', full_name: '', created_at: '', last_seen: by[id].last }); });
    cache.list = { profiles, by, at: new Date() };
    return cache.list;
  }

  function setupHelp(err) {
    return '<div class="alert danger">' + I('alert') + '<div><b>Chưa đọc được danh sách tài khoản.</b> ' + esc(err && err.message || err || '') +
      '<br>Hãy chạy file <code>supabase/setup.sql</code> trong Supabase → SQL Editor (một lần), rồi tải lại trang.</div></div>';
  }

  async function listView(root, force) {
    root.innerHTML = App.pageHead('Quản lý tài khoản', 'Danh sách mọi tài khoản đang sử dụng — chế độ chỉ đọc để kiểm soát.',
      '<button class="btn out" data-act="adminRefresh">' + I('refresh') + 'Làm mới</button>') +
      '<div class="card"><div class="card-b"><div class="skel" style="width:40%"></div><div class="skel mt12"></div><div class="skel mt12" style="width:70%"></div></div></div>';
    let data;
    try { data = await loadList(force); } catch (e) { root.querySelector('.card').outerHTML = setupHelp(e); return; }
    if (App.route.name !== 'tai-khoan' || App.route.parts[1]) return;
    const { profiles, by } = data;
    const f = App.adminFilter || (App.adminFilter = { q: '' });
    const tot = (k) => Object.values(by).reduce((a, o) => a + o[k], 0);
    const active7 = profiles.filter((p) => p.last_seen && (Date.now() - Date.parse(p.last_seen)) < 7 * 864e5).length;
    const rowsHTML = () => profiles.filter((p) => !f.q || U.normText([p.email, p.full_name, p.dept].join(' ')).indexOf(U.normText(f.q)) >= 0).map((p) => {
      const o = by[p.id] || { docs: 0, TU: 0, HU: 0, TT: 0, amount: 0, expenses: 0, spent: 0, events: 0 };
      return '<tr class="click" data-href="#/tai-khoan/' + p.id + '"><td data-l="Tài khoản"><b>' + esc(p.full_name || '—') + '</b><span class="sub">' + esc(p.email || '') + '</span></td>' +
        '<td data-l="Bộ phận">' + esc(p.dept || '—') + '</td>' +
        '<td data-l="Phiếu" class="nowrap">' + o.docs + ' <span class="sub">TU ' + o.TU + ' · HU ' + o.HU + ' · TT ' + o.TT + '</span></td>' +
        '<td class="num" data-l="Giá trị phiếu">' + money(o.amount) + '</td>' +
        '<td class="num" data-l="Khoản chi">' + money(o.spent) + '<span class="sub">' + o.expenses + ' khoản · ' + o.events + ' sự kiện</span></td>' +
        '<td data-l="Hoạt động" class="nowrap">' + esc(p.last_seen ? U.fmtDateTime(p.last_seen) : '—') + '<span class="sub">Tạo: ' + esc(p.created_at ? U.fmtDate(p.created_at.slice(0, 10)) : '—') + '</span></td>' +
        '<td class="acts"><a class="btn out xs" href="#/tai-khoan/' + p.id + '">' + I('eye') + 'Xem</a></td></tr>';
    }).join('');
    root.innerHTML = App.pageHead('Quản lý tài khoản', 'Danh sách mọi tài khoản đang sử dụng — chế độ chỉ đọc để kiểm soát. Cập nhật lúc ' + esc(U.fmtDateTime(data.at.toISOString())) + '.',
      '<button class="btn accent" data-act="adminReportAll">' + I('excel') + 'Xuất tổng tất cả tài khoản</button><button class="btn out" data-act="adminRefresh">' + I('refresh') + 'Làm mới</button>') +
      '<div class="kpis k4">' + App.kpi('users', 'Tài khoản', profiles.length, active7 + ' hoạt động 7 ngày qua') +
      App.kpi('file', 'Tổng số phiếu', tot('docs'), 'TU ' + tot('TU') + ' · HU ' + tot('HU') + ' · TT ' + tot('TT')) +
      App.kpi('wallet', 'Giá trị phiếu', money(tot('amount')), '') + App.kpi('receipt', 'Tổng khoản chi', money(tot('spent')), tot('expenses') + ' khoản') + '</div>' +
      '<div class="card mt16"><div class="card-b" style="padding-bottom:12px"><div class="search field mb0" style="max-width:420px">' + I('search') +
      '<input class="input" id="ad-q" type="search" placeholder="Tìm tên, email, bộ phận…" value="' + esc(f.q) + '"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Tài khoản</th><th>Bộ phận</th><th>Phiếu</th><th class="num">Giá trị phiếu</th><th class="num">Khoản chi</th><th>Hoạt động gần nhất</th><th class="acts"></th></tr></thead>' +
      '<tbody id="ad-body">' + rowsHTML() + '</tbody></table></div></div>';
    const q = document.getElementById('ad-q');
    q.oninput = () => { f.q = q.value; document.getElementById('ad-body').innerHTML = rowsHTML(); };
  }

  async function ownerView(root, ownerId, tab) {
    root.innerHTML = '<div class="crumbs"><a href="#/tai-khoan">' + I('left', 14) + 'Quản lý tài khoản</a></div>' +
      '<div class="card"><div class="card-b"><div class="skel" style="width:40%"></div><div class="skel mt12"></div></div></div>';
    let rows, list;
    try {
      [rows, list] = await Promise.all([cache.owner[ownerId] ? Promise.resolve(cache.owner[ownerId]) : App.cloud.admin.ownerData(ownerId), loadList(false)]);
      cache.owner[ownerId] = rows;
    } catch (e) { root.innerHTML = setupHelp(e); return; }
    if (App.route.parts[1] !== ownerId) return;
    const p = list.profiles.find((x) => x.id === ownerId) || { email: ownerId };
    const pick = (k) => rows.filter((r) => r.kind === k).map((r) => Object.assign({}, r.data, { id: r.id, updatedAt: r.updated_at }));
    const docs = pick('doc').sort((a, b) => (b.ngayLap || '').localeCompare(a.ngayLap || ''));
    const events = pick('event'); const exps = pick('expense').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const st = pick('settings')[0] || {};
    App.adminDocs = docs;
    App.adminOwner = { name: p.full_name || st.hoTen || p.email, email: p.email, dept: p.dept || st.boPhan, events, docs, expenses: exps, settings: st };
    App.adminOwnerSettings = st;
    const D = App.Docs;
    const evName = (id) => (events.find((e) => e.id === id) || {}).name || '';
    const sumT = (t) => docs.filter((d) => d.type === t).reduce((a, d) => a + D.total(d), 0);

    const docRows = docs.map((d) => '<tr><td data-l="Số phiếu"><span class="badge mono primary">' + esc(d.soPhieu) + '</span></td><td data-l="Loại">' + esc(D.TYPES[d.type] ? D.TYPES[d.type].label : d.type) + '</td>' +
      '<td data-l="Nội dung" style="min-width:200px">' + esc(d.noiDung || '—') + '<span class="sub">' + esc(d.ngayLap ? U.fmtDate(d.ngayLap) : '') + (d.eventId ? ' · ' + esc(evName(d.eventId)) : '') + '</span></td>' +
      '<td class="num b" data-l="Số tiền">' + money(D.total(d)) + '</td><td data-l="Trạng thái"><span class="badge ' + D.statusOf(d.status).cls + '">' + D.statusOf(d.status).t + '</span></td>' +
      '<td class="acts"><button class="btn out xs" data-act="adminPreview:' + esc(d.id) + '">' + I('eye') + 'Xem</button><button class="btn out xs" data-act="docWord:' + esc(d.id) + '">' + I('word') + 'Word</button>' +
      '<button class="btn out xs" data-act="docExcel:' + esc(d.id) + '">' + I('excel') + 'Excel</button></td></tr>').join('');
    const expRows = exps.map((e) => '<tr><td data-l="Ngày" class="nowrap">' + esc(U.fmtDate(e.date)) + '</td><td data-l="Nội dung">' + esc(e.content) + '<span class="sub">' + esc(evName(e.eventId)) + '</span></td>' +
      '<td data-l="Hoá đơn">' + App.vatBadge(e) + '</td><td class="num b" data-l="Số tiền">' + money(e.amount) + '</td></tr>').join('');
    const evRows = events.map((e) => {
      const l = exps.filter((x) => x.eventId === e.id);
      return '<tr><td data-l="Sự kiện"><b>' + esc(e.name) + '</b><span class="sub">' + esc(e.date ? U.fmtDate(e.date) : '') + '</span></td><td class="num" data-l="Khoản chi">' + l.length + '</td><td class="num b" data-l="Thực chi">' + money(l.reduce((a, x) => a + U.toNumber(x.amount), 0)) + '</td></tr>';
    }).join('');
    const tabBtn = (k, l) => '<button class="' + (tab === k ? 'on' : '') + '" data-act="adminTab:' + esc(ownerId) + '|' + k + '">' + l + '</button>';

    root.innerHTML = '<div class="crumbs"><a href="#/tai-khoan">' + I('left', 14) + 'Quản lý tài khoản</a><span>/</span><span>' + esc(p.full_name || p.email) + '</span></div>' +
      App.pageHead(esc(p.full_name || st.hoTen || p.email), esc(p.email || '') + (p.dept ? ' · ' + esc(p.dept) : '') + ' · <span class="badge out">Chỉ đọc</span>',
        '<button class="btn accent" data-act="adminReportOwner:excel">' + I('chart') + 'Báo cáo tổng (Excel)</button><button class="btn out" data-act="adminReportOwner:word">' + I('word') + 'Báo cáo Word</button>' +
        (docs.length ? '<button class="btn out" data-act="adminExcelAll">' + I('excel') + 'Từng phiếu theo mẫu</button>' : '') +
        '<button class="btn out" data-act="adminRefreshOwner:' + ownerId + '">' + I('refresh') + 'Làm mới</button>') +
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
  }

  Object.assign(App.actions, {
    adminRefresh() { cache.list = null; listView(document.getElementById('screen'), true); },
    adminRefreshOwner(id) { delete cache.owner[id]; cache.list = null; ownerView(document.getElementById('screen'), id, App.route.q.tab || 'docs'); },
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
      let rows;
      try { rows = await App.cloud.admin.allData(); } catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); return; }
      const list = await loadList(false);
      const nameOf = {}; list.profiles.forEach((p) => { nameOf[p.id] = p; });
      const by = {};
      rows.forEach((x) => {
        const o = by[x.owner] || (by[x.owner] = { events: [], docs: [], expenses: [], settings: {} });
        const rec = Object.assign({}, x.data, { id: x.id });
        if (x.kind === 'event') o.events.push(rec); else if (x.kind === 'doc') o.docs.push(rec); else if (x.kind === 'expense') o.expenses.push(rec); else if (x.kind === 'settings') o.settings = rec;
      });
      const all = { events: [], docs: [], expenses: [] }; const people = [];
      Object.keys(by).forEach((id) => {
        const o = by[id], p = nameOf[id] || {};
        const name = p.full_name || o.settings.hoTen || p.email || id.slice(0, 8);
        o.expenses.forEach((e) => { e._owner = name; });
        all.events.push(...o.events); all.docs.push(...o.docs); all.expenses.push(...o.expenses);
        const r1 = App.Report.build({ events: o.events, docs: o.docs, expenses: o.expenses, settings: App.settings }, {});
        people.push({ name, email: p.email || '', dept: p.dept || o.settings.boPhan || '', docs: r1.docs.length, tu: r1.tu, hu: r1.hu, tt: r1.tt, spent: r1.spent, count: r1.expenses.length });
      });
      people.sort((a, b) => b.spent - a.spent);
      const r = App.Report.build(Object.assign(all, { settings: App.settings, owner: { name: 'Tất cả tài khoản (' + people.length + ')', dept: 'Quản trị' } }), {});
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
