/* =========================================================================
   review.js — Kế toán / Quản trị: DUYỆT CHỨNG TỪ
   • #/duyet                 hàng chờ duyệt mọi nhân sự (lọc theo trạng thái, loại, người, tháng)
   • #/duyet/<owner>/<docId> duyệt 1 phiếu: đối chiếu từng dòng + ảnh chứng từ, hoá đơn,
                             yêu cầu giải trình, trao đổi, lịch sử, duyệt / duyệt chi / trả lại
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const F = () => App.Flow, D = () => App.Docs;
  const imgCache = {};

  function guard(root) {
    if (F().isAcc()) return false;
    root.innerHTML = App.pageHead('Duyệt chứng từ', '') + '<div class="alert warn">' + I('shield') + '<div><b>Chỉ kế toán / quản trị mới xem được trang này.</b><br>Nhân sự xem trạng thái phiếu của mình ở từng danh sách phiếu.</div></div>';
    return true;
  }
  const skel = '<div class="card"><div class="card-b"><div class="skel" style="width:40%"></div><div class="skel mt12"></div><div class="skel mt12" style="width:70%"></div></div></div>';
  function errBox(e) {
    return '<div class="alert danger">' + I('alert') + '<div><b>Chưa tải được dữ liệu.</b> ' + esc(e && e.message || e || '') +
      (App.cloud.demo ? '' : '<br>Hãy chạy lại file <code>supabase/setup.sql</code> (bản mới) trong Supabase → SQL Editor rồi tải lại trang.') + '</div></div>';
  }

  App.screens.duyet = function (root, route) {
    if (guard(root)) return;
    if (route.parts[1] && route.parts[2]) return detail(root, route.parts[1], route.parts[2]);
    if (route.q.tab) { (App.dyF || (App.dyF = { tab: 'cho-duyet', type: '', who: '', m: '', q: '' })).tab = route.q.tab; history.replaceState(null, '', '#/duyet'); }
    list(root);
  };

  /* ============================== Hàng chờ duyệt ============================== */
  async function list(root, force) {
    root.innerHTML = App.pageHead('Duyệt chứng từ', 'Phiếu tạm ứng, hoàn ứng, thanh toán của mọi nhân sự') + skel;
    let all; try { all = await F().loadAll(force); } catch (e) { root.innerHTML = App.pageHead('Duyệt chứng từ', '') + errBox(e); return; }
    if (App.route.name !== 'duyet' || App.route.parts[1]) return;
    const Fl = F(), Dc = D();
    const f = App.dyF || (App.dyF = { tab: 'cho-duyet', type: '', who: '', m: '', q: '' });
    const st = (d) => Fl.status(d, d._owner);
    const docs = all.docs;
    const done = (d) => Fl.isDone(d, d._owner);
    const cnt = { xong: 0 }; Fl.ST_ORDER.forEach((k) => { cnt[k] = 0; }); docs.forEach((d) => { if (done(d)) cnt.xong++; else cnt[st(d)]++; });
    const people = Array.from(new Map(docs.map((d) => [d._owner, d._ownerName])).entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const months = Array.from(new Set(docs.map((d) => String(d.ngayLap || '').slice(0, 7)).filter(Boolean))).sort().reverse();
    const match = (d) => {
      if (f.tab === 'xong') { if (!done(d)) return false; } else if (f.tab !== 'all' && (done(d) || st(d) !== f.tab)) return false;
      if (f.type && d.type !== f.type) return false;
      if (f.who && d._owner !== f.who) return false;
      if (f.m && String(d.ngayLap || '').slice(0, 7) !== f.m) return false;
      if (f.q) { const hay = U.normText([d.soPhieu, d.noiDung, d._ownerName, d._dept, U.groupThousand(Dc.total(d)), (Fl.reviewOf(d, d._owner) || {}).soSo].join(' ')); if (hay.indexOf(U.normText(f.q)) < 0) return false; }
      return true;
    };
    const rows = docs.filter(match);
    const an = Fl.analyze(all);
    const pendAmt = docs.filter((d) => st(d) === 'cho-duyet').reduce((a, d) => a + Dc.total(d), 0);
    const open = an.tus.filter((x) => x.k === 'open');
    const rw = an.hus.filter((x) => x.k === 'refund-wait' || x.k === 'refund-due');
    const missHd = an.lines.filter((x) => !x.has);
    const apprN = docs.filter((d) => d.type !== 'HU' && st(d) === 'da-duyet' && !done(d));
    const topN = an.hus.filter((x) => x.k === 'topup-due' || x.k === 'topup-pending');

    const tabs = [['cho-duyet', 'Chờ duyệt'], ['can-bo-sung', 'Cần bổ sung'], ['da-duyet', 'Đã duyệt'], ['da-chi', 'Đã duyệt chi'], ['xong', 'Đã hoàn tất'], ['tu-choi', 'Từ chối'], ['nhap', 'Nháp (chưa gửi)'], ['all', 'Tất cả']];
    const tabBtn = (t) => '<button class="' + (f.tab === t[0] ? 'on' : '') + '" data-act="dyTab:' + t[0] + '">' + t[1] + ' <span class="cnt0">' + (t[0] === 'all' ? docs.length : cnt[t[0]]) + '</span></button>';
    const hdSum = (d) => {
      if (d.type === 'TU') return '<span class="muted">—</span>';
      const it = Dc.filledItems(d), miss = it.filter((x) => !['vat', 'bill'].includes(Fl.hdOf(x))).length;
      return miss ? '<span class="badge warn">' + miss + '/' + it.length + ' thiếu HĐ</span>' : '<span class="badge ok">Đủ HĐ</span>';
    };
    const rowHTML = (d) => {
      const rv = Fl.reviewOf(d, d._owner) || {}, T = Dc.TYPES[d.type];
      return '<tr class="click" data-href="#/duyet/' + esc(d._owner) + '/' + esc(d.id) + '">' + (st(d) === 'cho-duyet' ? App.chk(d._owner + '~' + d.id) : '<td class="chk"></td>') +
        '<td data-l="Người đề nghị"><b>' + esc(d._ownerName) + '</b><span class="sub">' + esc(d._dept || '') + '</span></td>' +
        '<td data-l="Số phiếu"><span class="badge mono primary">' + esc(d.soPhieu || '—') + '</span>' + (rv.soSo ? '<span class="sub mono">Sổ ' + esc(rv.soSo) + '</span>' : '') + '</td>' +
        '<td data-l="Loại"><span class="tchip t-' + d.type + '">' + esc(T ? T.label : d.type) + '</span>' + (d.type === 'TT' ? '<span class="sub">' + (d.huDocId ? 'Bù hoàn ứng' : 'Độc lập') + '</span>' : '') + '</td>' +
        '<td data-l="Nội dung" style="min-width:200px">' + esc(d.noiDung || '') + '<span class="sub">' + Dc.filledItems(d).length + ' dòng · lập ' + esc(d.ngayLap ? U.fmtDate(d.ngayLap) : '') + '</span></td>' +
        '<td class="num b" data-l="Số tiền">' + money(Dc.total(d)) + '</td>' +
        '<td data-l="Hoá đơn">' + hdSum(d) + '</td>' +
        '<td data-l="Gửi lúc" class="nowrap">' + (d.submittedAt ? esc(Fl.ago(d.submittedAt)) + '<span class="sub">lần ' + (d.round || 1) + '</span>' : '<span class="muted">chưa gửi</span>') + '</td>' +
        '<td data-l="Trạng thái">' + Fl.badge(d, d._owner, true) + '</td>' +
        '<td class="acts"><a class="btn ' + (st(d) === 'cho-duyet' ? '' : 'out ') + 'xs" href="#/duyet/' + esc(d._owner) + '/' + esc(d.id) + '">' + I(st(d) === 'cho-duyet' ? 'check' : 'eye', 14) + (st(d) === 'cho-duyet' ? 'Duyệt' : 'Xem') + '</a></td></tr>';
    };
    root.innerHTML = App.pageHead('Duyệt chứng từ', 'Phiếu của mọi nhân sự · cập nhật ' + esc(Fl.ago(new Date(all.at).toISOString())),
      '<a class="btn accent" href="#/doi-chieu">' + I('book') + 'Sổ theo dõi & đối chiếu</a><button class="btn out" data-act="dyRefresh">' + I('refresh') + 'Làm mới</button>') +
      '<div class="kpis k4">' +
      App.kpi('inbox', 'Chờ duyệt', cnt['cho-duyet'] + ' <small>phiếu</small>', money(pendAmt), cnt['cho-duyet'] ? 'hot' : '') +
      App.kpi('wallet', 'Tạm ứng chưa hoàn ứng', open.length + ' <small>phiếu</small>', money(open.reduce((a, x) => a + x.adv, 0))) +
      App.kpi('lock', 'Đã duyệt, chưa chi', apprN.length + ' <small>phiếu</small>', money(apprN.reduce((a, d) => a + Dc.total(d), 0)), apprN.length ? 'hot' : '') +
      App.kpi('restore', 'Nộp lại / chi bù', (rw.length + topN.length) + ' <small>khoản</small>', 'Nộp lại ' + money(rw.reduce((a, x) => a + x.diff, 0)) + ' · bù ' + money(topN.reduce((a, x) => a + -x.diff, 0))) + '</div>' +
      (missHd.length ? '<div class="alert warn mt12">' + I('receipt') + '<div>' + missHd.length + ' dòng chi chưa có hoá đơn (' + money(missHd.reduce((a, x) => a + x.amount, 0)) + ') — xem <a href="#/doi-chieu?tab=hd">Đối chiếu → Hoá đơn</a>.</div></div>' : '') +
      '<div class="card mt16"><div class="card-h" style="flex-wrap:wrap;gap:10px"><div class="seg scroll">' + tabs.map(tabBtn).join('') + '</div></div>' +
      '<div class="card-b" style="padding-bottom:12px"><div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
      '<div class="search field mb0"><label class="sr" for="dy-q">Tìm</label>' + I('search') + '<input class="input" id="dy-q" type="search" placeholder="Tìm số phiếu, người, nội dung, số tiền…" value="' + esc(f.q) + '"></div>' +
      App.selectBare('dy-type', f.type, [{ v: '', t: 'Mọi loại phiếu' }, { v: 'TU', t: 'Tạm ứng' }, { v: 'HU', t: 'Hoàn ứng' }, { v: 'TT', t: 'Thanh toán' }]) +
      App.selectBare('dy-who', f.who, [{ v: '', t: 'Mọi nhân sự' }].concat(people.map((p) => ({ v: p[0], t: p[1] })))) +
      App.selectBare('dy-m', f.m, [{ v: '', t: 'Mọi tháng' }].concat(months.map((m) => ({ v: m, t: U.monthLabel(m) })))) +
      '</div></div>' +
      '<div id="dy-body">' + (rows.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr>' + App.chkAll() + '<th>Người đề nghị</th><th>Số phiếu</th><th>Loại</th><th>Nội dung</th><th class="num">Số tiền</th><th>Hoá đơn</th><th>Gửi lúc</th><th>Trạng thái</th><th class="acts"></th></tr></thead><tbody>' +
        rows.map(rowHTML).join('') + '</tbody><tfoot><tr><td colspan="5">Cộng ' + rows.length + ' phiếu</td><td class="num">' + money(rows.reduce((a, d) => a + Dc.total(d), 0)) + '</td><td colspan="4"></td></tr></tfoot></table></div>'
        : App.emptyState(f.tab === 'cho-duyet' ? 'check' : 'search', f.tab === 'cho-duyet' ? 'Không còn phiếu chờ duyệt' : 'Không có phiếu phù hợp', f.tab === 'cho-duyet' ? 'Phiếu mới gửi lên sẽ hiện ở đây và có thông báo.' : 'Thử đổi bộ lọc.')) + '</div></div>';
    const q = document.getElementById('dy-q');
    q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { f.q = q.value; list(root); setTimeout(() => { const x = document.getElementById('dy-q'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); }, 250); };
    [['dy-type', 'type'], ['dy-who', 'who'], ['dy-m', 'm']].forEach(([id, k]) => { document.getElementById(id).onchange = (e) => { f[k] = e.target.value; list(root); }; });
    App.Sel.init('duyet', () => '<button class="btn sm" data-act="dyBulk:da-duyet">' + I('check') + 'Duyệt</button><button class="btn out sm" data-act="dyBulk:da-chi">' + I('lock') + 'Duyệt chi</button>');
    F().updateBell();
  }

  /* ============================== Duyệt 1 phiếu ============================== */
  let cur = null;   // { owner, doc, imgs, all }
  async function detail(root, owner, docId) {
    root.innerHTML = '<div class="crumbs"><a href="#/duyet">' + I('left', 14) + 'Duyệt chứng từ</a></div>' + skel;
    let all, doc;
    try {
      all = await F().loadAll();
      doc = all.docs.find((d) => d._owner === owner && d.id === docId);
      if (!doc) { all = await F().loadAll(true); doc = all.docs.find((d) => d._owner === owner && d.id === docId); }
    } catch (e) { root.innerHTML = errBox(e); return; }
    if (!doc) { root.innerHTML = '<div class="card">' + App.emptyState('alert', 'Không tìm thấy phiếu', 'Phiếu có thể đã bị người lập xoá.', '<a class="btn" href="#/duyet">Về danh sách</a>') + '</div>'; return; }
    let imgs = imgCache[owner + '|' + docId];
    if (!imgs || Date.now() - imgs.at > 60000) {
      try { imgs = { at: Date.now(), list: await F().B().docImages(owner, doc) }; imgCache[owner + '|' + docId] = imgs; } catch (e) { imgs = { at: 0, list: [] }; }
    }
    if (App.route.parts[2] !== docId) return;
    cur = { owner, doc, imgs: imgs.list || [], all };
    App.adminDocs = [doc];
    paint(root);
  }

  function paint(root) {
    const { owner, doc, imgs, all } = cur, Fl = F(), Dc = D();
    const st = Fl.status(doc, owner), rv = Fl.reviewOf(doc, owner) || {}, T = Dc.TYPES[doc.type];
    const items = Dc.filledItems(doc), ev = Fl.evidence(doc, imgs), chk = rv.items || {};
    const total = Dc.total(doc), evName = ((all.events.find((e) => e.id === doc.eventId && e._owner === owner)) || {}).name || '';
    const an = Fl.analyze(all), key = (d) => (d._owner || owner) + '|' + d.id;
    const locked = Fl.locked(doc, owner), pending = st === 'cho-duyet';
    const prof = all.pmap[owner] || {};

    // nút quyết định theo loại & trạng thái
    const B = (s, cls, ic, t) => '<button class="btn ' + cls + '" data-act="dyDecide:' + s + '">' + I(ic) + t + '</button>';
    let acts = '';
    if (st === 'nhap') acts = '<span class="badge out">Người lập chưa gửi phiếu này</span>';
    else if (locked) acts = (st === 'da-duyet' && doc.type !== 'HU' ? B('da-chi', 'accent', 'lock', 'Duyệt chi') : '') +
      (Fl.isDone(doc, owner) ? '<button class="btn out" data-act="dyDone:0">' + I('restore') + 'Bỏ hoàn tất</button>' : '<button class="btn sec" data-act="dyDone:1">' + I('check') + 'Xác nhận hoàn tất hồ sơ</button>') +
      '<button class="btn out" data-act="proofAdd">' + I('upload') + 'Minh chứng chi</button>' + B('mo-lai', 'out', 'unlock', 'Mở lại');
    else acts = B('da-duyet', '', 'check', doc.type === 'HU' ? 'Duyệt quyết toán' : 'Duyệt') + (doc.type !== 'HU' ? B('da-chi', 'accent', 'lock', 'Duyệt chi') : '') +
      B('can-bo-sung', 'out warn-b', 'alert', 'Cần xem xét lại') + B('tu-choi', 'out danger-b', 'x', 'Từ chối');
    const exp = '<button class="btn out" data-act="docWord:' + esc(doc.id) + '">' + I('word') + 'Word</button><button class="btn out" data-act="docExcel:' + esc(doc.id) + '">' + I('excel') + 'Excel</button>' +
      '<button class="btn out" data-act="docPdf:' + esc(doc.id) + '">' + I('pdf') + 'PDF</button><button class="btn out" data-act="docShare:' + esc(doc.id) + '">' + I('share') + 'Gửi Zalo</button>';

    // khối liên kết tạm ứng ↔ hoàn ứng ↔ DNTT
    let link = '';
    const docA = (d) => '<a href="#/duyet/' + esc(d._owner || owner) + '/' + esc(d.id) + '"><b>' + esc(d.soPhieu) + '</b></a> ' + Fl.badge(d, d._owner || owner, true);
    if (doc.type === 'TU') {
      const x = an.tus.find((t) => key(t.tu) === key(doc)) || {};
      link = '<div class="alert ' + (x.done ? 'ok' : 'info') + '">' + I('wallet') + '<div style="flex:1"><b>Theo dõi tạm ứng:</b> <span class="badge ' + (x.cls || 'out') + '">' + esc(x.label || '') + '</span>' +
        (x.hu ? '<br>Hoàn ứng: ' + docA(x.hu) + ' · thực chi ' + money(x.spent) + ' · chênh lệch ' + money(Math.abs(x.diff)) : '') +
        (x.tt ? '<br>DNTT bù: ' + docA(x.tt) : '') + (x.paid ? '<br>Đã chi ' + U.fmtDate(x.paid.at) + (x.paid.ref ? ' · Mã GD <span class="mono">' + esc(x.paid.ref) + '</span>' : '') : '') +
        (x.k === 'open' ? '<div class="mt8"><button class="btn sm" data-act="dyRemind">' + I('bell') + 'Nhắc nhân sự hoàn ứng</button></div>' : '') + '</div></div>';
    } else if (doc.type === 'HU') {
      const x = an.hus.find((h) => key(h.hu) === key(doc)) || {};
      const rr = x.refundReport && x.refundReport.data;
      link = '<div class="alert ' + (x.done ? 'ok' : x.k === 'hu-pending' ? 'info' : 'warn') + '">' + I('calc') + '<div style="flex:1"><b>Quyết toán:</b> ' + (x.tu ? 'tạm ứng ' + docA(x.tu) : 'phiếu tạm ứng ' + esc(doc.tuSoPhieu || '?')) +
        '<br>Đã ứng <b>' + money(x.adv) + '</b> · thực chi <b>' + money(x.spent) + '</b> · ' + (x.diff > 0 ? 'thừa <b>' + money(x.diff) + '</b> → nhân sự nộp lại' : x.diff < 0 ? 'thiếu <b>' + money(-x.diff) + '</b> → DNTT bù' : 'khớp') +
        '<div class="mt8"><span class="badge ' + (x.cls || 'out') + '">' + esc(x.label || '') + '</span></div>' +
        (x.tt ? '<div class="mt8">DNTT bù: ' + docA(x.tt) + '</div>' : '') +
        (rr ? '<div class="mt8">Nhân sự báo: ' + esc(rr.text || '') + (rr.img ? ' <a href="#" data-act="dyRefImg">[ảnh biên lai]</a>' : '') + '</div>' : '') +
        (x.diff > 0 && locked && !(x.refund && x.refund.ok) ? '<div class="mt8"><button class="btn sm" data-act="dyRefund">' + I('check') + 'Xác nhận đã nhận ' + money(x.diff) + ' về TK công ty</button></div>' : '') +
        (x.diff < 0 && locked && (x.k === 'topup-due' || x.k === 'topup-pending') ? '<div class="mt8"><button class="btn sm" data-act="dyTopup">' + I('check') + 'Xác nhận công ty đã chi bù ' + money(-x.diff) + '</button></div>' : '') +
        (x.topup && x.topup.ok ? '<div class="mt8 ok-t">' + I('check', 14) + ' Công ty đã chi bù ' + money(x.topup.amount) + ' ngày ' + esc(U.fmtDate(x.topup.at)) + (x.topup.ref ? ' · Mã GD ' + esc(x.topup.ref) : '') + '</div>' : '') +
        (x.refund && x.refund.ok ? '<div class="mt8 ok-t">' + I('check', 14) + ' Đã nhận ' + money(x.refund.amount) + ' ngày ' + esc(U.fmtDate(x.refund.at)) + (x.refund.ref ? ' · Mã GD ' + esc(x.refund.ref) : '') + ' (' + esc(x.refund.byName || '') + ')</div>' : '') + '</div></div>';
    } else {
      const hu = doc.huDocId ? all.docs.find((d) => d._owner === owner && d.id === doc.huDocId) : null;
      link = '<div class="alert info">' + I('calc') + '<div><b>Phân loại:</b> ' + (doc.huDocId ? 'DNTT <b>bù chi vượt tạm ứng</b> của phiếu hoàn ứng ' + (hu ? docA(hu) : '') : 'DNTT <b>độc lập</b> — khoản chi ngoài tạm ứng') + '</div></div>';
    }

    const thumbs = (it) => {
      const l = ev.by[it.id] || [], pics = l.filter((x) => x.blob && (x.kind === 'image' || !x.kind));
      return '<a href="#" class="ev-mini" data-act="dyEv:' + esc(it.id) + '">' + (pics.slice(0, 3).map((im) => '<img src="' + esc(App.imgURL(im)) + '" alt="">').join('') || '<span class="ev-none">' + I('camera', 14) + '</span>') +
        '<b>' + l.length + '</b></a>';
    };
    const itemRows = items.map((it, i) => {
      const c = chk[it.id] || {}, hd = Fl.hdOf(it);
      return '<tr class="' + (c.ok ? 'row-ok' : '') + '"><td class="ix">' + (i + 1) + '</td>' +
        '<td data-l="Nội dung" style="min-width:200px"><b>' + esc(it.noiDung) + '</b><span class="sub">' + esc(it.ngayChi ? U.fmtDate(it.ngayChi) : '') + (it.nguoiThamGia ? ' · ' + esc(it.nguoiThamGia) : '') + (it.soLuong !== '' && it.soLuong != null ? ' · SL ' + esc(it.soLuong) + ' × ' + U.groupThousand(it.donGia) : '') + '</span>' + (it.ghiChu ? '<span class="sub">' + esc(it.ghiChu) + '</span>' : '') + '</td>' +
        '<td class="num b" data-l="Thành tiền">' + money(Dc.lineTotal(it)) + '</td>' +
        '<td data-l="Hoá đơn">' + Fl.hdBadge(hd) + '</td>' +
        '<td data-l="Chứng từ">' + thumbs(it) + '</td>' +
        '<td data-l="Đối chiếu" class="nowrap"><label class="switch sm"><input type="checkbox" data-chk="ok" data-it="' + esc(it.id) + '"' + (c.ok ? ' checked' : '') + '> Khớp</label>' +
        (doc.type !== 'TU' ? '<label class="switch sm"><input type="checkbox" data-chk="hd" data-it="' + esc(it.id) + '"' + (c.hd ? ' checked' : '') + '> Nhận HĐ</label>' : '') + '</td>' +
        '<td class="acts"><button class="btn ghost xs" data-act="dyAsk:' + esc(it.id) + '" title="Yêu cầu giải trình dòng này">' + I('chat', 14) + 'Giải trình</button></td></tr>';
    }).join('');
    const okN = items.filter((it) => (chk[it.id] || {}).ok).length;
    const general = ev.general;

    root.innerHTML = '<div class="crumbs"><a href="#/duyet">' + I('left', 14) + 'Duyệt chứng từ</a><span>/</span><span>' + esc(doc._ownerName) + '</span><span>/</span><span>' + esc(doc.soPhieu) + '</span></div>' +
      App.pageHead(esc(T.label) + ' <span class="badge mono primary" style="vertical-align:middle;font-size:13px">' + esc(doc.soPhieu) + '</span>',
        '<b>' + esc(doc._ownerName) + '</b> · ' + esc(doc._dept || '') + (prof.email ? ' · ' + esc(prof.email) : '') + ' &nbsp;' + Fl.badge(doc, owner) + (rv.soSo ? ' <span class="badge out mono">Sổ ' + esc(rv.soSo) + '</span>' : ''),
        '', '', T.ic) +
      '<div class="decide-bar">' + acts + '<span class="spacer"></span>' + exp + '</div>' +
      (rv.note && st !== 'cho-duyet' ? '<div class="alert ' + (st === 'can-bo-sung' ? 'warn' : st === 'tu-choi' ? 'danger' : 'ok') + ' mt12">' + I('chat') + '<div>Ghi chú của ' + esc(rv.byName || 'kế toán') + ': “' + esc(rv.note) + '”</div></div>' : '') +
      (pending && doc.round > 1 ? '<div class="alert info mt12">' + I('refresh') + '<div>Phiếu được <b>gửi lại lần ' + doc.round + '</b> sau khi bổ sung — xem tab <b>Lịch sử sửa</b> để biết đã thay đổi gì.</div></div>' : '') +
      '<div class="grid g-side2 mt16"><div class="stack">' +
      '<div class="card"><div class="card-h"><div class="t">' + I('file') + 'Thông tin phiếu</div><span class="muted" style="font-size:12.5px">Gửi ' + esc(doc.submittedAt ? U.fmtDateTime(doc.submittedAt) : '—') + '</span></div><div class="card-b"><div class="kvs">' +
      kv('Người đề nghị', esc(doc.nguoiDeNghi || doc._ownerName)) + kv('Bộ phận', esc(doc.boPhan || doc._dept || '')) + kv('Ngày lập', esc(doc.ngayLap ? U.fmtDate(doc.ngayLap) : '—')) +
      kv('Sự kiện / đợt chi', esc(evName || '—')) + kv('Nội dung', esc(doc.noiDung || '')) + kv('Mục đích', esc(doc.mucDich || '—')) +
      kv('Số tiền', '<b class="grad-text" style="font-size:18px">' + money(total) + '</b><br><i class="muted" style="font-size:12.5px">' + esc(App.docSo(total)) + '</i>') +
      kv('Nhận tiền', esc(doc.tenTK || '') + (doc.soTK ? ' · <span class="mono">' + esc(doc.soTK) + '</span>' : '') + (doc.nganHang ? ' · ' + esc(doc.nganHang) : '')) +
      '</div>' + link + '</div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('list') + 'Đối chiếu từng dòng</div><span class="badge ' + (okN === items.length && items.length ? 'ok' : 'out') + '">' + okN + '/' + items.length + ' dòng khớp</span></div>' +
      '<div class="card-b flush"><div class="tbl-wrap"><table class="tbl cards dy-items"><thead><tr><th>#</th><th>Khoản chi</th><th class="num">Thành tiền</th><th>Hoá đơn</th><th>Chứng từ</th><th>Đối chiếu</th><th class="acts"></th></tr></thead><tbody>' + itemRows +
      '</tbody><tfoot><tr><td colspan="2">CỘNG</td><td class="num">' + money(total) + '</td><td colspan="4"></td></tr></tfoot></table></div>' +
      (general.length ? '<div style="padding:12px 16px"><b style="font-size:13px">Tệp đính kèm chung (' + general.length + ')</b><div class="row mt8" style="gap:8px">' + general.map((g) => '<a href="#" class="btn out xs" data-act="dyGen:' + esc(g.id) + '">' + I(g.kind === 'image' ? 'image' : 'file', 14) + esc((g.name || 'Tệp').slice(0, 28)) + '</a>').join('') + '</div></div>' : '') +
      '</div></div>' +
      '<div id="proof-box"></div>' + Fl.threadCard(owner, doc) +
      '</div>' +
      '<div class="pv-col"><div class="sticky-pv" style="position:sticky;top:80px"><div class="row" style="margin-bottom:8px"><b>Tờ phiếu</b><span class="spacer"></span><button class="btn ghost xs" data-act="adminPrint:' + esc(doc.id) + '">' + I('printer', 14) + 'In</button></div>' +
      '<div id="doc-preview">' + Dc.previewBox(doc) + '</div></div></div></div>';
    setTimeout(Dc.fitPaper, 0);
    Fl.loadThread(owner, doc);
    root.querySelectorAll('[data-chk]').forEach((cb) => {
      cb.onchange = async () => {
        const patch = {}; patch[cb.getAttribute('data-chk')] = cb.checked;
        try { await Fl.checkItem(owner, doc, cb.getAttribute('data-it'), patch); cb.closest('tr').classList.toggle('row-ok', !!(Fl.reviewOf(doc, owner).items[cb.getAttribute('data-it')] || {}).ok); }
        catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); cb.checked = !cb.checked; }
        const b = root.querySelector('.card-h .badge'); const r = Fl.reviewOf(doc, owner) || {}; const n = items.filter((it) => ((r.items || {})[it.id] || {}).ok).length;
        if (b) { b.textContent = n + '/' + items.length + ' dòng khớp'; b.className = 'badge ' + (n === items.length ? 'ok' : 'out'); }
      };
    });
  }
  const kv = (k, v) => '<div class="kvr"><span>' + k + '</span><div>' + v + '</div></div>';

  /* ============================== Quyết định ============================== */
  const DEC = {
    'da-duyet': { t: 'Duyệt phiếu', d: 'Phiếu sẽ được KHOÁ (nhân sự không sửa / xoá được) và cấp số vào sổ.', btn: 'Duyệt', note: false },
    'da-chi': { t: 'Duyệt chi', d: 'Xác nhận đã chi tiền / chuyển khoản. Phiếu KHOÁ, ghi vào sổ giao dịch.', btn: 'Duyệt chi', note: false },
    'can-bo-sung': { t: 'Yêu cầu xem xét lại / bổ sung', d: 'Phiếu trả về cho nhân sự sửa, bổ sung chứng từ rồi gửi lại.', btn: 'Gửi yêu cầu', note: true },
    'tu-choi': { t: 'Từ chối phiếu', d: 'Phiếu không được chấp nhận. Nhân sự được thông báo kèm lý do.', btn: 'Từ chối', note: true },
    'mo-lai': { t: 'Mở lại phiếu đã khoá', d: 'Phiếu chuyển sang "Cần xem xét lại" để nhân sự sửa. Ghi vào lịch sử.', btn: 'Mở lại', note: true },
  };
  function decideSheet(status) {
    if (!cur) return;
    const { owner, doc } = cur, x = DEC[status], ui = App.ui, total = D().total(doc);
    const ov = App.openSheet(App.sheetHead(x.t, doc.soPhieu + ' · ' + doc._ownerName + ' · ' + money(total)) +
      '<p class="muted" style="margin:0 0 12px;font-size:13px">' + x.d + '</p>' +
      (status === 'da-chi' ? '<div class="fgrid c2">' + ui.date('dc-date', 'Ngày chi', U.todayISO()) + ui.money('dc-amt', 'Số tiền chi', total) +
        '<div class="sall">' + ui.text('dc-ref', 'Mã giao dịch ngân hàng', '', { ph: 'VD: FT26306430305389' }) + '</div></div>' : '') +
      ui.textarea('dc-note', x.note ? 'Lý do / nội dung cần bổ sung (bắt buộc)' : 'Ghi chú (không bắt buộc)', '', { rows: 3, ph: x.note ? 'VD: Dòng 2 thiếu hoá đơn, bổ sung ảnh bill…' : '' }) +
      (x.note ? '<div class="row" style="gap:6px;flex-wrap:wrap">' + ['Thiếu hoá đơn / chứng từ', 'Sai số tiền so với hoá đơn', 'Cần giải trình mục đích chi', 'Thiếu chữ ký / xác nhận'].map((t) => '<button class="btn sec xs" data-q="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' : '') +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn ' + (status === 'tu-choi' ? 'danger' : '') + '" id="dc-ok">' + esc(x.btn) + '</button></div>', { center: true });
    ov.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { const t = ov.querySelector('#dc-note'); t.value = (t.value ? t.value + '; ' : '') + b.getAttribute('data-q'); t.focus(); }; });
    ov.querySelector('#dc-ok').onclick = async () => {
      const note = App.val('dc-note');
      if (x.note && !note) { App.toast('Nhập lý do để nhân sự biết cần sửa gì', 'err'); return; }
      const btn = ov.querySelector('#dc-ok'); btn.disabled = true;
      try {
        await F().decide(owner, doc, status, { note, paidAt: App.val('dc-date'), ref: App.val('dc-ref'), amount: status === 'da-chi' ? App.valMoney('dc-amt') : undefined });
        App.closeSheet(ov); App.toast(x.btn + ': ' + doc.soPhieu + ' — đã báo cho ' + doc._ownerName, 'ok');
        paint(document.getElementById('screen'));
        if (status === 'da-chi') setTimeout(() => F().proofSheet(owner, doc, () => F().loadThread(owner, doc)), 350);
      } catch (e) { btn.disabled = false; App.toast('Lỗi: ' + (e.message || e), 'err'); }
    };
  }

  Object.assign(App.actions, {
    dyTab(t) { (App.dyF || (App.dyF = {})).tab = t; list(document.getElementById('screen')); },
    dyRefresh() { Object.keys(imgCache).forEach((k) => delete imgCache[k]); list(document.getElementById('screen'), true); },
    dyDecide(s) { decideSheet(s); },
    async dyBulk(status) {
      const ids = App.Sel.list(); if (!ids.length) return;
      const all = await F().loadAll();
      const docs = ids.map((k) => { const [o, id] = k.split('~'); return all.docs.find((d) => d._owner === o && d.id === id); }).filter((d) => d && F().status(d, d._owner) === 'cho-duyet');
      App.confirmSheet((status === 'da-chi' ? 'Duyệt chi ' : 'Duyệt ') + docs.length + ' phiếu?', 'Các phiếu sẽ được khoá, cấp số vào sổ và báo cho người lập. Tổng ' + money(docs.reduce((a, d) => a + D().total(d), 0)) + '.', async () => {
        let n = 0;
        for (const d of docs) { try { await F().decide(d._owner, d, status, {}); n++; } catch (e) { App.toast(d.soPhieu + ': ' + (e.message || e), 'err'); } }
        App.toast('Đã ' + (status === 'da-chi' ? 'duyệt chi ' : 'duyệt ') + n + ' phiếu', 'ok'); App.Sel.clear(); list(document.getElementById('screen'));
      }, false, status === 'da-chi' ? 'Duyệt chi' : 'Duyệt');
    },
    dyEv(itemId) {
      if (!cur) return;
      const { doc, imgs } = cur, it = D().filledItems(doc).find((x) => x.id === itemId); if (!it) return;
      const i = D().filledItems(doc).indexOf(it);
      F().openEvidence({ title: 'Chứng từ dòng ' + (i + 1), sub: it.noiDung + ' · ' + money(D().lineTotal(it)) + ' · ' + F().HD_T[F().hdOf(it)], imgs: () => F().evidence(doc, imgs).by[it.id] || [], editable: false });
    },
    dyGen(id) {
      if (!cur) return;
      const g = cur.imgs.find((x) => x.id === id); if (!g || !g.blob) { App.toast('Tệp chưa có trên máy chủ', 'err'); return; }
      if (g.kind === 'image') App.lightbox(App.imageItems([g]), 0); else U.saveBlob(g.blob, U.safeName(g.name || 'tep'));
    },
    dyAsk(itemId) { if (cur) F().askRequest(cur.owner, cur.doc, itemId); },
    async dyDone(v) {
      if (!cur) return;
      try { await F().markDone(cur.owner, cur.doc, v === '1'); App.toast(v === '1' ? 'Đã chuyển sang “Đã hoàn tất”' : 'Đã bỏ hoàn tất', 'ok'); paint(document.getElementById('screen')); }
      catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); }
    },
    async dyRemind() { if (!cur) return; if (await F().remind(cur.owner, cur.doc)) { App.toast('Đã nhắc ' + cur.doc._ownerName, 'ok'); F().loadThread(cur.owner, cur.doc); } },
    dyTopup() {
      if (!cur) return;
      const { owner, doc } = cur, ui = App.ui, x = F().analyze(cur.all).hus.find((h) => h.hu.id === doc.id && h.o === owner) || {};
      const ov = App.openSheet(App.sheetHead('Xác nhận công ty đã chi bù', doc.soPhieu + ' · ' + doc._ownerName) +
        '<p class="muted" style="font-size:13px;margin:0 0 10px">Dùng khi chuyển trả phần chi vượt trực tiếp cho nhân sự (không qua DNTT bù).</p>' +
        '<div class="fgrid c2">' + ui.money('tp-amt', 'Số tiền chi bù', -x.diff) + ui.date('tp-date', 'Ngày chuyển', U.todayISO()) + '<div class="sall">' + ui.text('tp-ref', 'Mã giao dịch', '') + '</div></div>' +
        '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="tp-ok">' + I('check') + 'Xác nhận</button></div>', { center: true });
      ov.querySelector('#tp-ok').onclick = async () => {
        try { await F().confirmTopup(owner, doc, { amount: App.valMoney('tp-amt'), date: App.val('tp-date'), ref: App.val('tp-ref') }); App.closeSheet(ov); cur.all = await F().loadAll(true); paint(document.getElementById('screen')); App.toast('Đã xác nhận chi bù', 'ok'); setTimeout(() => F().proofSheet(owner, doc, () => F().loadThread(owner, doc)), 350); }
        catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); }
      };
    },
    dyRefImg() {
      if (!cur) return;
      const m = (F().refunds || []).filter((x) => x.owner === cur.owner && x.doc_id === cur.doc.id).pop();
      if (m && m.data && m.data.img) App.lightbox([{ url: m.data.img, kind: 'image', cap: m.data.text }], 0);
    },
    dyRefund() {
      if (!cur) return;
      const { owner, doc } = cur, ui = App.ui;
      const an = F().analyze(cur.all), x = an.hus.find((h) => h.hu.id === doc.id && h.o === owner) || {};
      const rr = (x.refundReport && x.refundReport.data) || {};
      const ov = App.openSheet(App.sheetHead('Xác nhận nhận tiền nộp lại', doc.soPhieu + ' · ' + doc._ownerName) +
        '<div class="fgrid c2">' + ui.money('rc-amt', 'Số tiền đã nhận', rr.amount || x.diff) + ui.date('rc-date', 'Ngày nhận', rr.date || U.todayISO()) +
        '<div class="sall">' + ui.text('rc-ref', 'Mã giao dịch', rr.ref || '') + '</div></div>' +
        '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="rc-ok">' + I('check') + 'Xác nhận</button></div>', { center: true });
      ov.querySelector('#rc-ok').onclick = async () => {
        try { await F().confirmRefund(owner, doc, { amount: App.valMoney('rc-amt'), date: App.val('rc-date'), ref: App.val('rc-ref') }); App.closeSheet(ov); App.toast('Đã xác nhận — tạm ứng ' + (doc.tuSoPhieu || '') + ' tất toán', 'ok'); cur.all = await F().loadAll(true); paint(document.getElementById('screen')); }
        catch (e) { App.toast('Lỗi: ' + (e.message || e), 'err'); }
      };
    },
  });
})();
