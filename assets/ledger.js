/* =========================================================================
   ledger.js — ĐỐI CHIẾU & SỔ THEO DÕI (kế toán: cả công ty · nhân sự: của mình)
   Kỳ: tháng / tháng trước / quý / năm / tuỳ chọn — phục vụ BCTC.
   • Tổng quan + phương trình đối chiếu tạm ứng (khớp / lệch)
   • Theo dõi tạm ứng: đã / chưa hoàn ứng, nộp lại thừa, DNTT bù thiếu
   • Sổ giao dịch (kiểu sao kê): ngày · số tiền · người · diễn giải · mã GD · loại · ghi chú · theo dõi
   • DNTT: bù hoàn ứng vs độc lập · Hoá đơn: dòng có / thiếu HĐ · Theo nhân sự
   Xuất Excel (nhiều tab, tô màu trạng thái), Word, PDF, gửi Zalo.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const F = () => App.Flow, D = () => App.Docs;

  const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  /* ---------------- kỳ đối chiếu: ngày / tháng / quý / năm / tuỳ chọn ---------------- */
  const MODES = [['ngay', 'Ngày'], ['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm'], ['tuy', 'Tuỳ chọn'], ['all', 'Tất cả']];
  function period(f) {
    const a = new Date((f.d || U.todayISO()) + 'T00:00:00'), y = a.getFullYear(), m = a.getMonth();
    if (f.mode === 'ngay') return [iso(a), iso(a), 'Ngày ' + U.fmtDate(iso(a))];
    if (f.mode === 'thang') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0)), 'Tháng ' + (m + 1) + '/' + y];
    if (f.mode === 'quy') { const q = Math.floor(m / 3); return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0)), 'Quý ' + (q + 1) + '/' + y]; }
    if (f.mode === 'nam') return [y + '-01-01', y + '-12-31', 'Năm ' + y];
    if (f.mode === 'tuy') return [f.from0 || '', f.to0 || '', (f.from0 ? U.fmtDate(f.from0) : '…') + ' – ' + (f.to0 ? U.fmtDate(f.to0) : '…')];
    return ['', '', 'Toàn bộ thời gian'];
  }
  function filt() {
    const f = App.dcF || (App.dcF = { mode: 'thang', d: U.todayISO(), from0: '', to0: '', who: '', type: '', st: '', quick: 'all', q: '', tab: 'phieu', onlyMiss: true });
    if (!f.mode) { f.mode = 'thang'; f.d = U.todayISO(); f.quick = 'all'; f.tab = 'phieu'; }
    const r = period(f); f.from = r[0]; f.to = r[1]; f.label = r[2]; f.st = '';
    return f;
  }
  function shift(f, dir) {
    const a = new Date(f.d + 'T00:00:00');
    if (f.mode === 'ngay') a.setDate(a.getDate() + dir);
    else if (f.mode === 'thang') a.setMonth(a.getMonth() + dir, 1);
    else if (f.mode === 'quy') a.setMonth(a.getMonth() + 3 * dir, 1);
    else if (f.mode === 'nam') a.setFullYear(a.getFullYear() + dir, 0, 1);
    f.d = iso(a);
  }
  const inR = (f, d) => { const x = String(d || '').slice(0, 10); if (!x) return !f.from && !f.to; return (!f.from || x >= f.from) && (!f.to || x <= f.to); };

  /* ---------------- tính số liệu của kỳ ---------------- */
  function compute(scope, f) {
    const Fl = F(), Dc = D();
    const sc = Object.assign({}, scope, { docs: scope.docs.filter((d) => !f.who || d._owner === f.who) });
    const a = Fl.analyze(sc);
    const okT = (t) => !f.type || f.type === t, okS = (d) => !f.st || (f.st === 'xong' ? Fl.isDone(d, d._owner) : Fl.status(d, d._owner) === f.st);
    const tus = a.tus.filter((x) => okT('TU') && okS(x.tu) && x.k !== 'draft' && inR(f, (x.paid && x.paid.at) || x.tu.ngayLap));
    const hus = a.hus.filter((x) => okT('HU') && okS(x.hu) && inR(f, x.hu.ngayLap));
    const tts = a.tts.filter((x) => okT('TT') && okS(x.t) && x.s !== 'nhap' && inR(f, (x.paid && x.paid.at) || x.t.ngayLap));
    const lines = a.lines.filter((x) => okT(x.d.type) && okS(x.d) && inR(f, x.it.ngayChi || x.d.ngayLap));
    const ledger = a.ledger.filter((x) => okT(x.d.type) && okS(x.d) && inR(f, x.date)).map((x, i) => Object.assign({ stt: i + 1 }, x));
    const docsP = sc.docs.filter((d) => !d.deletedAt && okT(d.type) && okS(d) && inR(f, d.ngayLap)).sort((x, y) => String(x.ngayLap || '').localeCompare(String(y.ngayLap || '')));
    const paid = tus.filter((x) => x.s === 'da-chi');
    const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
    const settledHu = paid.filter((x) => x.hu && ['da-duyet', 'da-chi'].includes(x.hs));
    const E = {
      A: sum(paid, (x) => x.adv),
      S: sum(settledHu, (x) => x.spent),
      Rok: sum(paid.filter((x) => x.k === 'refunded'), (x) => x.diff),
      Rwait: sum(paid.filter((x) => x.k === 'refund-wait'), (x) => x.diff),
      Rdue: sum(paid.filter((x) => x.k === 'refund-due'), (x) => x.diff),
      Over: sum(settledHu.filter((x) => x.diff < 0), (x) => -x.diff),
      O: sum(paid.filter((x) => !x.hu || !['da-duyet', 'da-chi'].includes(x.hs)), (x) => x.adv),
    };
    E.right = E.S - E.Over + E.Rok + E.Rwait + E.Rdue + E.O;
    E.ok = E.right === E.A;
    const k = {
      tuN: paid.length, tuOpen: paid.filter((x) => x.k === 'open'), tuDone: paid.filter((x) => x.done), tuPend: paid.filter((x) => !x.done && x.k !== 'open'),
      topDue: paid.filter((x) => x.k === 'topup-due'), topPend: paid.filter((x) => x.k === 'topup-pending'), topDone: paid.filter((x) => x.k === 'topup-done'),
      ttBu: tts.filter((x) => x.kind === 'bu'), ttDl: tts.filter((x) => x.kind === 'doc-lap'),
      hdHas: lines.filter((x) => x.has), hdMiss: lines.filter((x) => !x.has), hdGot: lines.filter((x) => x.got),
    };
    // theo nhân sự
    const people = {};
    const P = (o, name) => people[o] || (people[o] = { o, name: name || '', tu: 0, tuAmt: 0, open: 0, openAmt: 0, rdue: 0, over: 0, bu: 0, dl: 0, miss: 0, docs: 0 });
    tus.forEach((x) => { const p = P(x.o, x.tu._ownerName); p.tu++; p.tuAmt += x.adv; if (x.k === 'open') { p.open++; p.openAmt += x.adv; } if (['refund-due', 'refund-wait'].includes(x.k)) p.rdue += x.diff; if (x.k === 'topup-due') p.over += -x.diff; });
    tts.forEach((x) => { const p = P(x.o, x.t._ownerName); if (x.kind === 'bu') p.bu += x.total; else p.dl += x.total; });
    lines.forEach((x) => { const p = P(x.o, x.d._ownerName); if (!x.has) p.miss++; });
    sc.docs.filter((d) => inR(f, d.ngayLap) && Fl.status(d, d._owner) !== 'nhap').forEach((d) => { P(d._owner, d._ownerName).docs++; });
    return { a, tus, hus, tts, lines, ledger, docsP, E, k, people: Object.values(people).sort((x, y) => String(x.name).localeCompare(String(y.name))), f, dc: Dc };
  }

  /* ---------------- dòng đối chiếu cho từng phiếu ---------------- */
  function rowsOf(R) {
    const Fl = F(), Dc = D(), a = R.a, M = (l, k) => { const m = {}; l.forEach((x) => { m[x.o + '|' + x[k].id] = x; }); return m; };
    const tuM = M(a.tus, 'tu'), huM = M(a.hus, 'hu'), ttM = M(a.tts, 't');
    return R.docsP.map((d) => {
      const o = d._owner, s = Fl.status(d, o), r = Fl.reviewOf(d, o) || {}, key = o + '|' + d.id;
      const row = { d, o, s, r, done: Fl.isDone(d, o), total: Dc.total(d), codes: { tu: '', hu: '', tt: '' }, adv: '', spent: '', diff: '', xl: '', set: null };
      if (d.type === 'HU') {
        const x = huM[key] || {};
        row.pay = ['da-duyet', 'da-chi'].includes(s) ? { t: 'Đã quyết toán', cls: 'ok' } : { t: 'Chưa quyết toán', cls: 'out' };
        row.codes = { tu: x.tu ? x.tu.soPhieu : (d.tuSoPhieu || ''), hu: d.soPhieu, tt: x.tt ? x.tt.soPhieu : '' };
        Object.assign(row, { adv: x.adv, spent: x.spent, diff: x.diff, xl: x.label || '', set: x.k ? { t: x.label, cls: x.cls, k: x.k } : null });
      } else {
        const pd = r.paid || {};
        row.pay = s === 'da-chi' ? { t: 'Đã chi', cls: 'ok', at: pd.at, ref: pd.ref } : s === 'da-duyet' ? { t: 'Chưa chi', cls: 'warn' } : { t: '—', cls: 'out' };
        if (d.type === 'TU') {
          const x = tuM[key] || {};
          row.codes = { tu: d.soPhieu, hu: x.hu ? x.hu.soPhieu : '', tt: x.tt ? x.tt.soPhieu : '' };
          Object.assign(row, { adv: x.adv, spent: x.hu ? x.spent : '', diff: x.hu ? x.diff : '', xl: s === 'da-chi' ? x.label : '', set: s === 'da-chi' && x.k ? { t: x.label, cls: x.cls, k: x.k } : null });
        } else {
          const x = ttM[key] || {};
          row.codes = { tu: x.tuSo || '', hu: x.hu ? x.hu.soPhieu : '', tt: d.soPhieu };
          row.xl = x.hu ? 'Bù chi vượt tạm ứng' : 'Độc lập (ngoài tạm ứng)';
        }
      }
      row.miss = d.type === 'TU' ? 0 : Dc.filledItems(d).filter((it) => !['vat', 'bill'].includes(Fl.hdOf(it))).length;
      return row;
    });
  }
  const LECH = ['refund-due', 'refund-wait', 'topup-due', 'topup-pending'];
  const QUICK = [
    ['all', 'Tất cả phiếu', 'grid', 'primary', (x) => x.s !== 'nhap'],
    ['cho', 'Chờ duyệt', 'clock', 'primary', (x) => x.s === 'cho-duyet' || x.s === 'can-bo-sung'],
    ['chuachi', 'Đã duyệt – chưa chi', 'lock', 'warn', (x) => x.d.type !== 'HU' && x.s === 'da-duyet'],
    ['dachi', 'Đã chi / quyết toán', 'check', 'ok', (x) => (x.d.type !== 'HU' && x.s === 'da-chi') || (x.d.type === 'HU' && ['da-duyet', 'da-chi'].includes(x.s))],
    ['open', 'Tạm ứng chưa hoàn ứng', 'wallet', 'danger', (x) => !!(x.set && x.set.k === 'open')],
    ['lech', 'Chênh lệch chưa xử lý', 'calc', 'accent', (x) => x.d.type === 'HU' && !!(x.set && LECH.includes(x.set.k))],
    ['hd', 'Thiếu hoá đơn', 'receipt', 'warn', (x) => x.miss > 0 && x.s !== 'nhap'],
    ['xong', 'Đã hoàn tất', 'flag', 'ok', (x) => x.done],
    ['tuchoi', 'Từ chối', 'x', 'danger', (x) => x.s === 'tu-choi'],
    ['nhap', 'Nháp', 'edit', 'out', (x) => x.s === 'nhap'],
  ];
  function viewRows(R) {
    const f = R.f, q = QUICK.find((x) => x[0] === f.quick) || QUICK[0], k = U.normText(f.q || '');
    return rowsOf(R).filter(q[4]).filter((x) => !k || U.normText([x.d.soPhieu, x.r.soSo, x.d._ownerName, x.d.noiDung, x.codes.tu, x.codes.hu, x.codes.tt, U.groupThousand(x.total), (x.r.paid || {}).ref].join(' ')).indexOf(k) >= 0)
      .sort((a, b) => String(b.d.ngayLap || '').localeCompare(String(a.d.ngayLap || '')));
  }

  /* ---------------- màn hình ---------------- */
  App.screens['doi-chieu'] = async function (root, route) {
    const f = filt();
    if (route.q.tab) f.tab = ({ tong: 'tu', loai: 'phieu', hu: 'tu', tt: 'phieu', nguoi: 'phieu' })[route.q.tab] || route.q.tab;
    if (route.q.p) { if (route.q.p === 'all') f.mode = 'all'; else if (route.q.p === 'prev') { f.mode = 'thang'; const a = new Date(); a.setMonth(a.getMonth() - 1, 1); f.d = iso(a); } filt(); }
    if (route.q.tab === 'hd') f.quick = 'hd';
    if (route.q.tab || route.q.p) history.replaceState(null, '', '#/doi-chieu');
    const acc = F().isAcc();
    root.innerHTML = App.pageHead('Đối chiếu & sổ theo dõi', acc ? 'Toàn công ty' : 'Chứng từ của bạn') + '<div class="card"><div class="card-b"><div class="skel"></div><div class="skel mt12" style="width:60%"></div></div></div>';
    let scope; try { scope = await F().scope(); } catch (e) { root.innerHTML = App.pageHead('Đối chiếu & sổ theo dõi', '') + '<div class="alert danger">' + I('alert') + '<div>Chưa tải được dữ liệu: ' + esc(e.message || e) + '</div></div>'; return; }
    if (App.route.name !== 'doi-chieu') return;
    App._dcScope = scope;
    draw(root, scope);
  };
  function pickerHTML(f, scope) {
    const a = new Date(f.d + 'T00:00:00'), y = a.getFullYear();
    const ys = scope.docs.map((d) => +String(d.ngayLap || '').slice(0, 4)).filter(Boolean);
    const y0 = Math.min(y, new Date().getFullYear(), ...ys), y1 = Math.max(y, new Date().getFullYear(), ...ys);
    const ysel = '<select class="select" id="dc-y" aria-label="Năm">' + Array.from({ length: y1 - y0 + 1 }, (_, i) => y1 - i).map((v) => '<option' + (v === y ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>';
    let inp = '';
    if (f.mode === 'ngay') inp = '<input class="input" type="date" id="dc-d" value="' + esc(f.d) + '" aria-label="Ngày">';
    else if (f.mode === 'thang') inp = '<input class="input" type="month" id="dc-mo" value="' + esc(f.d.slice(0, 7)) + '" aria-label="Tháng">';
    else if (f.mode === 'quy') inp = '<select class="select" id="dc-q" aria-label="Quý">' + [1, 2, 3, 4].map((q) => '<option value="' + q + '"' + (Math.floor(a.getMonth() / 3) + 1 === q ? ' selected' : '') + '>Quý ' + q + '</option>').join('') + '</select>' + ysel;
    else if (f.mode === 'nam') inp = ysel;
    else if (f.mode === 'tuy') inp = '<input class="input" type="date" id="dc-from" value="' + esc(f.from0 || '') + '" aria-label="Từ ngày"><span class="muted">→</span><input class="input" type="date" id="dc-to" value="' + esc(f.to0 || '') + '" aria-label="Đến ngày">';
    const nav = ['ngay', 'thang', 'quy', 'nam'].includes(f.mode);
    return '<div class="dc-period"><div class="seg">' + MODES.map((m) => '<button class="' + (f.mode === m[0] ? 'on' : '') + '" data-act="dcMode:' + m[0] + '">' + m[1] + '</button>').join('') + '</div>' +
      '<div class="dc-pick">' + (nav ? '<button class="btn out icon" data-act="dcShift:-1" aria-label="Kỳ trước">' + I('left') + '</button>' : '') + inp +
      (nav ? '<button class="btn out icon" data-act="dcShift:1" aria-label="Kỳ sau">' + I('right') + '</button><button class="btn ghost sm" data-act="dcNow">Hiện tại</button>' : '') + '</div></div>';
  }
  function draw(root, scope) {
    const f = filt(), acc = F().isAcc(), R = compute(scope, f);
    App._dcR = R;
    const people = Array.from(new Map(scope.docs.map((d) => [d._owner, d._ownerName])).entries());
    const tabs = [['phieu', 'Danh sách phiếu', 'list'], ['tu', 'Tạm ứng ↔ Hoàn ứng', 'wallet'], ['so', 'Sổ giao dịch', 'book'], ['hd', 'Hoá đơn', 'receipt']];
    const body = { phieu: phieuHTML, tu: tuTabHTML, so: soHTML, hd: hdHTML }[f.tab] || phieuHTML;
    root.innerHTML = App.pageHead('Đối chiếu & sổ theo dõi', 'Kỳ <b>' + esc(f.label) + '</b>' + (f.who ? ' · ' + esc((people.find((p) => p[0] === f.who) || [])[1] || '') : '') + (f.type ? ' · ' + esc(D().TYPES[f.type].label) : ''),
      '<button class="btn accent" data-act="dcExcel">' + I('excel') + 'Xuất Excel</button><button class="btn out" data-act="dcPdf">' + I('pdf') + 'PDF</button>' +
      '<button class="btn out" data-act="dcWord">' + I('word') + 'Word</button><button class="btn out" data-act="dcShare">' + I('share') + 'Gửi Zalo</button>') +
      '<div class="card dc-bar"><div class="card-b">' + pickerHTML(f, scope) +
      '<div class="dc-filters">' + App.selectBare('dc-type', f.type, [{ v: '', t: 'Mọi loại phiếu' }, { v: 'TU', t: 'Tạm ứng (DNTU)' }, { v: 'HU', t: 'Hoàn ứng (DNHU)' }, { v: 'TT', t: 'Thanh toán (DNTT)' }]) +
      (acc ? App.selectBare('dc-who', f.who, [{ v: '', t: 'Mọi nhân sự' }].concat(people.map((p) => ({ v: p[0], t: p[1] })))) : '') + '</div></div></div>' +
      '<div class="tabs-line mt16">' + tabs.map((t) => '<button class="' + (f.tab === t[0] ? 'on' : '') + '" data-act="dcTab:' + t[0] + '">' + I(t[2], 15) + t[1] + '</button>').join('') + '</div>' +
      '<div class="mt16">' + body(R) + '</div>';
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onchange = () => { fn(el.value); draw(root, scope); }; };
    on('dc-who', (v) => { f.who = v; }); on('dc-type', (v) => { f.type = v; });
    on('dc-d', (v) => { if (v) f.d = v; }); on('dc-mo', (v) => { if (v) f.d = v + '-01'; });
    on('dc-q', (v) => { const y = +App.val('dc-y'); f.d = iso(new Date(y, (+v - 1) * 3, 1)); });
    on('dc-y', (v) => { const q = document.getElementById('dc-q'); f.d = iso(new Date(+v, q ? (+q.value - 1) * 3 : 0, 1)); });
    on('dc-from', (v) => { f.from0 = v; }); on('dc-to', (v) => { f.to0 = v; });
    const om = document.getElementById('hd-only'); if (om) om.onchange = () => { f.onlyMiss = om.checked; draw(root, scope); };
    const qi = document.getElementById('dc-q2');
    if (qi) qi.oninput = () => { f.q = qi.value; const b = document.getElementById('dc-list'); if (b) b.innerHTML = listHTML(R); };
  }
  function phieuHTML(R) {
    const all = rowsOf(R), f = R.f;
    const cards = QUICK.filter((q) => q[0] !== 'nhap' || all.some(q[4])).map((q) => {
      const l = all.filter(q[4]);
      return '<button class="dc-q ' + q[3] + (f.quick === q[0] ? ' on' : '') + '" data-act="dcQuick:' + q[0] + '"><span class="dc-qi">' + I(q[2], 16) + '</span><span class="dc-qb"><small>' + q[1] + '</small><b>' + l.length + '</b><i>' + money(l.reduce((a, x) => a + x.total, 0)) + '</i></span></button>';
    }).join('');
    return '<div class="dc-qs">' + cards + '</div>' +
      '<div class="card mt16"><div class="card-h" style="flex-wrap:wrap;gap:10px"><div class="t">' + I('list') + esc((QUICK.find((q) => q[0] === f.quick) || QUICK[0])[1]) + '</div>' +
      '<div class="search field mb0" style="flex:1;max-width:380px;margin-left:auto">' + I('search') + '<input class="input" id="dc-q2" type="search" placeholder="Tìm mã phiếu, số sổ, mã GD, người, số tiền…" value="' + esc(f.q || '') + '"></div></div>' +
      '<div class="card-b flush" id="dc-list">' + listHTML(R) + '</div></div>';
  }
  function listHTML(R) {
    const l = viewRows(R), T = D().TYPES, Fl = F();
    if (!l.length) return App.emptyState('search', 'Không có phiếu phù hợp', 'Thử đổi kỳ, ô lọc hoặc từ khoá.');
    const href = (x) => (Fl.isAcc() ? '#/duyet/' + esc(x.o) + '/' + esc(x.d.id) : '#/phieu/' + esc(x.d.id));
    const code = (t, v) => v ? '<span class="dc-code">' + t + ' <b>' + esc(v) + '</b></span>' : '';
    return '<div class="tbl-wrap"><table class="tbl cards dc-tbl"><thead><tr><th>Ngày lập</th><th>Mã phiếu</th><th>Người đề nghị</th><th>Nội dung</th><th class="num">Số tiền</th><th>Duyệt</th><th>Chi tiền</th><th>Liên quan · đối chiếu</th></tr></thead><tbody>' +
      l.map((x) => '<tr class="click" data-href="' + href(x) + '"><td data-l="Ngày lập" class="nowrap">' + esc(U.fmtDate(x.d.ngayLap)) + '</td>' +
        '<td data-l="Mã phiếu"><span class="tchip t-' + x.d.type + '">' + T[x.d.type].prefix + '</span> <b class="mono">' + esc(x.d.soPhieu) + '</b>' + (x.r.soSo ? '<span class="sub mono">Sổ ' + esc(x.r.soSo) + '</span>' : '') + '</td>' +
        '<td data-l="Người"><b>' + esc(x.d._ownerName) + '</b><span class="sub">' + esc(x.d._dept || '') + '</span></td>' +
        '<td data-l="Nội dung" style="min-width:200px">' + esc(x.d.noiDung || '') + (x.miss ? '<span class="sub warn-t">' + x.miss + ' dòng thiếu HĐ</span>' : '') + '</td>' +
        '<td class="num b" data-l="Số tiền">' + money(x.total) + '</td>' +
        '<td data-l="Duyệt">' + Fl.badge(x.d, x.o, true) + (x.done ? ' ' + B('ok', 'Hoàn tất') : '') + '</td>' +
        '<td data-l="Chi tiền">' + B(x.pay.cls, x.pay.t) + (x.pay.at ? '<span class="sub">' + esc(U.fmtDate(x.pay.at)) + (x.pay.ref ? ' · <span class="mono">' + esc(x.pay.ref) + '</span>' : '') + '</span>' : '') + '</td>' +
        '<td data-l="Liên quan">' + (x.d.type !== 'TU' || x.codes.hu ? '<div class="dc-codes">' + (x.d.type !== 'TU' ? code('TU', x.codes.tu) : '') + (x.d.type !== 'HU' ? code('HU', x.codes.hu) : '') + (x.d.type !== 'TT' ? code('Bù', x.codes.tt) : '') + '</div>' : '') +
        (x.set ? B(x.set.cls || 'out', x.set.t) : x.xl ? '<span class="sub">' + esc(x.xl) + '</span>' : '') + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="4">Cộng ' + l.length + ' phiếu</td><td class="num">' + money(l.reduce((a, x) => a + x.total, 0)) + '</td><td colspan="3"></td></tr></tfoot></table></div>';
  }
  function tuTabHTML(R) {
    const E = R.E;
    const eq = (l, v, cls) => '<div class="eq-it ' + (cls || '') + '"><small>' + l + '</small><b>' + money(v) + '</b></div>';
    return '<div class="card"><div class="card-h"><div class="t">' + I('calc') + 'Đối chiếu tạm ứng · ' + esc(R.f.label) + '</div>' + (E.ok ? B('ok', '✓ Khớp') : B('danger', 'Lệch ' + money(E.A - E.right))) + '</div><div class="card-b">' +
      '<div class="eq">' + eq('Tạm ứng đã chi', E.A, 'big') + '<span class="eq-op">=</span>' + eq('Thực chi quyết toán', E.S) + '<span class="eq-op">−</span>' + eq('Chi vượt (bù)', E.Over, 'warn') +
      '<span class="eq-op">+</span>' + eq('Đã nộp lại', E.Rok, 'ok') + '<span class="eq-op">+</span>' + eq('Chờ nộp lại', E.Rwait + E.Rdue, 'warn') + '<span class="eq-op">+</span>' + eq('Chưa hoàn ứng', E.O, 'danger') + '</div></div></div>' + tuHTML(R);
  }
  const docLink = (d) => {
    const acc = F().isAcc();
    return '<a href="' + (acc ? '#/duyet/' + esc(d._owner) + '/' + esc(d.id) : '#/phieu/' + esc(d.id)) + '" class="mono b">' + esc(d.soPhieu || '—') + '</a>';
  };
  const B = (cls, t) => '<span class="badge ' + cls + '">' + esc(t) + '</span>';

  function tongHTML(R) {
    const E = R.E, k = R.k;
    const eq = (l, v, cls, sub) => '<div class="eq-it ' + (cls || '') + '"><small>' + l + '</small><b>' + money(v) + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
    return '<div class="kpis k4">' +
      App.kpi('wallet', 'Tạm ứng đã chi', money(E.A), k.tuN + ' phiếu · ' + k.tuDone.length + ' đã tất toán') +
      App.kpi('alert', 'Chưa hoàn ứng', money(k.tuOpen.reduce((a, x) => a + x.adv, 0)), k.tuOpen.length + ' phiếu', k.tuOpen.length ? 'hot' : '') +
      App.kpi('restore', 'Nộp lại (thừa)', money(E.Rok), 'Đã nhận · còn chờ ' + money(E.Rwait + E.Rdue)) +
      App.kpi('calc', 'Chi bù (thiếu)', money(E.Over), k.topDue.length + ' chưa lập DNTT bù') + '</div>' +
      '<div class="card mt16"><div class="card-h"><div class="t">' + I('calc') + 'Đối chiếu tạm ứng trong kỳ</div>' + (E.ok ? B('ok', '✓ Khớp') : B('danger', 'Lệch ' + money(E.A - E.right))) + '</div><div class="card-b">' +
      '<div class="eq">' + eq('Tạm ứng đã chi', E.A, 'big') + '<span class="eq-op">=</span>' + eq('Thực chi đã quyết toán', E.S, '', 'theo phiếu hoàn ứng đã duyệt') + '<span class="eq-op">−</span>' +
      eq('Chi vượt (bù qua DNTT)', E.Over, 'warn') + '<span class="eq-op">+</span>' + eq('Đã nộp lại', E.Rok, 'ok') + '<span class="eq-op">+</span>' + eq('Phải / chờ nộp lại', E.Rwait + E.Rdue, 'warn') +
      '<span class="eq-op">+</span>' + eq('Chưa hoàn ứng', E.O, 'danger', 'chưa có / chưa duyệt HU') + '</div>' +
      '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Mỗi khoản tạm ứng đã chi phải được giải thích bằng thực chi đã quyết toán, tiền nộp lại (nếu thừa) hoặc DNTT bù (nếu thiếu). Phần “Chưa hoàn ứng” là số còn treo cần đôn đốc.</p></div></div>' +
      '<div class="grid g2 mt16">' +
      '<div class="card"><div class="card-h"><div class="t">' + I('calc') + 'Thanh toán (DNTT)</div></div><div class="card-b"><div class="kvs">' +
      '<div class="kvr"><span>DNTT bù hoàn ứng</span><div><b>' + money(k.ttBu.reduce((a, x) => a + x.total, 0)) + '</b> · ' + k.ttBu.length + ' phiếu</div></div>' +
      '<div class="kvr"><span>DNTT độc lập (ngoài tạm ứng)</span><div><b>' + money(k.ttDl.reduce((a, x) => a + x.total, 0)) + '</b> · ' + k.ttDl.length + ' phiếu</div></div>' +
      '<div class="kvr"><span>Đã duyệt chi</span><div>' + money([].concat(k.ttBu, k.ttDl).filter((x) => x.s === 'da-chi').reduce((a, x) => a + x.total, 0)) + '</div></div>' +
      '<div class="kvr"><span>Chờ duyệt / bổ sung</span><div>' + money([].concat(k.ttBu, k.ttDl).filter((x) => ['cho-duyet', 'can-bo-sung'].includes(x.s)).reduce((a, x) => a + x.total, 0)) + '</div></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('receipt') + 'Hoá đơn của các dòng chi</div></div><div class="card-b">' + hdBar(k) + '<div class="kvs mt12">' +
      '<div class="kvr"><span>Có hoá đơn (VAT / bill)</span><div><b>' + k.hdHas.length + '</b> dòng · ' + money(k.hdHas.reduce((a, x) => a + x.amount, 0)) + '</div></div>' +
      '<div class="kvr"><span>Chưa có / không có HĐ</span><div><b>' + k.hdMiss.length + '</b> dòng · ' + money(k.hdMiss.reduce((a, x) => a + x.amount, 0)) + '</div></div>' +
      '<div class="kvr"><span>Kế toán đã nhận HĐ gốc</span><div>' + k.hdGot.length + ' dòng</div></div></div></div></div></div>' +
      (R.tus.filter((x) => !x.done).length ? '<div class="card mt16"><div class="card-h"><div class="t">' + I('flag') + 'Cần xử lý</div></div><div class="card-b flush">' + tuTable(R.tus.filter((x) => !x.done), true) + '</div></div>' : '');
  }
  function hdBar(k) {
    const n = k.hdHas.length + k.hdMiss.length || 1, a = Math.round(k.hdHas.length / n * 100);
    return '<div class="stackbar"><span class="ok" style="width:' + a + '%"></span><span class="warn" style="width:' + (100 - a) + '%"></span></div><div class="row mt4" style="justify-content:space-between;font-size:12px"><span>Có HĐ ' + a + '%</span><span>Thiếu ' + (100 - a) + '%</span></div>';
  }
  function tuTable(list, compact) {
    if (!list.length) return App.emptyState('wallet', 'Không có tạm ứng trong kỳ', '');
    const acc = F().isAcc();
    return '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>#</th><th>Người</th><th>Phiếu tạm ứng</th><th>Ngày chi</th><th class="num">Đã ứng</th><th>Hoàn ứng</th><th class="num">Thực chi</th><th class="num">Chênh lệch</th><th>Xử lý</th><th>Trạng thái</th>' + (acc ? '<th class="acts"></th>' : '') + '</tr></thead><tbody>' +
      list.map((x, i) => '<tr class="' + (x.done ? 'row-ok' : '') + '"><td class="ix">' + (i + 1) + '</td><td data-l="Người"><b>' + esc(x.tu._ownerName) + '</b></td>' +
        '<td data-l="Tạm ứng">' + docLink(x.tu) + '<span class="sub">' + esc((x.tu.noiDung || '').slice(0, 50)) + '</span>' + (x.soSo ? '<span class="sub mono">Sổ ' + esc(x.soSo) + '</span>' : '') + '</td>' +
        '<td data-l="Ngày chi" class="nowrap">' + esc(x.paid ? U.fmtDate(x.paid.at) : '—') + (x.paid && x.paid.ref ? '<span class="sub mono">' + esc(x.paid.ref) + '</span>' : '') + '</td>' +
        '<td class="num b" data-l="Đã ứng">' + money(x.adv) + '</td>' +
        '<td data-l="Hoàn ứng">' + (x.hu ? docLink(x.hu) + '<span class="sub">' + esc(F().ST[x.hs].s) + '</span>' : '<span class="muted">chưa có</span>') + '</td>' +
        '<td class="num" data-l="Thực chi">' + (x.hu ? money(x.spent) : '—') + '</td>' +
        '<td class="num" data-l="Chênh lệch">' + (x.hu ? (x.diff > 0 ? '<span class="ok-t">+' + U.groupThousand(x.diff) + '</span>' : x.diff < 0 ? '<span class="danger-t">−' + U.groupThousand(-x.diff) + '</span>' : '0') : '—') + '</td>' +
        '<td data-l="Xử lý">' + (x.diff > 0 && x.hu ? 'Nộp lại ' + U.groupThousand(x.diff) : x.diff < 0 && x.hu ? (x.tt ? 'DNTT bù ' + docLink(x.tt) : 'Cần DNTT bù') : x.hu ? 'Khớp' : 'Lập hoàn ứng') + '</td>' +
        '<td data-l="Trạng thái">' + B(x.cls || 'out', x.label) + '</td>' + (acc ? '<td class="acts">' + (x.k === 'open' ? '<button class="btn out xs" data-act="dcRemind:' + esc(x.o) + '|' + esc(x.tu.id) + '">' + I('bell', 14) + 'Nhắc</button>' : '') + '</td>' : '') + '</tr>').join('') +
      (compact ? '' : '<tfoot><tr><td colspan="4">Cộng ' + list.length + ' phiếu</td><td class="num">' + money(list.reduce((a, x) => a + x.adv, 0)) + '</td><td></td><td class="num">' + money(list.reduce((a, x) => a + (x.hu ? x.spent : 0), 0)) + '</td><td colspan="3"></td></tr></tfoot>') + '</tbody></table></div>';
  }
  function tuHTML(R) {
    const grp = [['Chưa hoàn ứng', R.tus.filter((x) => x.k === 'open')], ['Đang xử lý (hoàn ứng chờ duyệt, phải nộp lại, chi bù)', R.tus.filter((x) => !x.done && x.k !== 'open' && x.s === 'da-chi')],
      ['Đã tất toán', R.tus.filter((x) => x.done)], ['Tạm ứng chưa chi (chờ duyệt / đã duyệt)', R.tus.filter((x) => x.s !== 'da-chi')]];
    const late = R.tus.filter((x) => x.k === 'open' && x.days > 15);
    return (F().isAcc() && late.length ? '<div class="alert warn">' + I('clock') + '<div style="flex:1"><b>' + late.length + ' tạm ứng quá 15 ngày chưa hoàn ứng</b> · ' + money(late.reduce((a, x) => a + x.adv, 0)) + '</div><button class="btn sm" data-act="dcRemindAll">' + I('bell') + 'Nhắc tất cả</button></div>' : '') +
      grp.map(([t, l]) => '<div class="card mt16"><div class="card-h"><div class="t">' + esc(t) + ' <span class="cnt0">' + l.length + '</span></div><b>' + money(l.reduce((a, x) => a + x.adv, 0)) + '</b></div><div class="card-b flush">' + (l.length ? tuTable(l) : '<p class="muted" style="padding:14px 18px;margin:0;font-size:13px">Không có.</p>') + '</div></div>').join('');
  }
  function loaiHTML(R) {
    const Fl = F(), D_ = D(), T = D_.TYPES, docs = R.docsP;
    const sts = Fl.ST_ORDER;
    const mat = ['TU', 'HU', 'TT'].map((t) => {
      const l = docs.filter((d) => d.type === t), c = (s) => l.filter((d) => Fl.status(d, d._owner) === s);
      return '<tr><td data-l="Loại"><span class="tchip t-' + t + '">' + T[t].label + '</span></td><td class="num b" data-l="Tổng">' + l.length + '<span class="sub">' + money(l.reduce((a, d) => a + D_.total(d), 0)) + '</span></td>' +
        sts.map((s) => { const x = c(s); return '<td class="num" data-l="' + Fl.ST[s].s + '">' + (x.length ? '<b>' + x.length + '</b><span class="sub">' + U.groupThousand(x.reduce((a, d) => a + D_.total(d), 0)) + '</span>' : '<span class="muted">—</span>') + '</td>'; }).join('') +
        '<td class="num" data-l="Hoàn tất">' + l.filter((d) => Fl.isDone(d, d._owner)).length + '</td></tr>';
    }).join('');
    const list = docs.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>#</th><th>Loại</th><th>Số phiếu</th><th>Người</th><th>Ngày lập</th><th>Nội dung</th><th class="num">Số tiền</th><th>Trạng thái</th><th>Đã chi</th></tr></thead><tbody>' +
      docs.map((d, i) => { const r = Fl.reviewOf(d, d._owner) || {}, pd = r.paid;
        return '<tr><td class="ix">' + (i + 1) + '</td><td data-l="Loại"><span class="tchip t-' + d.type + '">' + T[d.type].label + '</span>' + (d.type === 'TT' ? '<span class="sub">' + (d.huDocId ? 'Bù hoàn ứng' : 'Độc lập') + '</span>' : '') + '</td>' +
          '<td data-l="Số phiếu">' + docLink(d) + (r.soSo ? '<span class="sub mono">Sổ ' + esc(r.soSo) + '</span>' : '') + '</td><td data-l="Người"><b>' + esc(d._ownerName) + '</b></td><td data-l="Ngày lập" class="nowrap">' + esc(U.fmtDate(d.ngayLap)) + '</td>' +
          '<td data-l="Nội dung" style="min-width:200px">' + esc(d.noiDung || '') + '</td><td class="num b" data-l="Số tiền">' + money(D_.total(d)) + '</td>' +
          '<td data-l="Trạng thái">' + Fl.badge(d, d._owner, true) + (Fl.isDone(d, d._owner) ? ' ' + B('ok', 'Hoàn tất') : '') + '</td><td data-l="Đã chi" class="nowrap">' + (pd ? esc(U.fmtDate(pd.at)) + (pd.ref ? '<span class="sub mono">' + esc(pd.ref) + '</span>' : '') : '—') + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="6">Cộng ' + docs.length + ' phiếu</td><td class="num">' + money(docs.reduce((a, d) => a + D_.total(d), 0)) + '</td><td colspan="2"></td></tr></tfoot></table></div>' : App.emptyState('file', 'Không có phiếu', 'Thử đổi kỳ hoặc bộ lọc.');
    return '<div class="card"><div class="card-h"><div class="t">' + I('grid') + 'Tổng hợp theo loại phiếu & trạng thái</div></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Loại</th><th class="num">Tổng</th>' +
      sts.map((s) => '<th class="num">' + Fl.ST[s].s + '</th>').join('') + '<th class="num">Hoàn tất</th></tr></thead><tbody>' + mat + '</tbody></table></div></div></div>' +
      '<div class="card mt16"><div class="card-h"><div class="t">' + I('list') + 'Danh sách phiếu <span class="cnt0">' + docs.length + '</span></div><span class="muted" style="font-size:12.5px">Dùng bộ lọc Loại phiếu / Trạng thái ở trên</span></div><div class="card-b flush">' + list + '</div></div>';
  }
  function huHTML(R) {
    const l = R.hus;
    if (!l.length) return '<div class="card">' + App.emptyState('restore', 'Không có phiếu hoàn ứng trong kỳ', '') + '</div>';
    return '<div class="card"><div class="card-h"><div class="t">' + I('restore') + 'Phiếu hoàn ứng & quyết toán <span class="cnt0">' + l.length + '</span></div></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>#</th><th>Người</th><th>Phiếu HU</th><th>Tạm ứng</th><th class="num">Đã ứng</th><th class="num">Thực chi</th><th class="num">Chênh lệch</th><th>Xử lý</th></tr></thead><tbody>' +
      l.map((x, i) => '<tr class="' + (x.done ? 'row-ok' : '') + '"><td class="ix">' + (i + 1) + '</td><td data-l="Người"><b>' + esc(x.hu._ownerName) + '</b></td><td data-l="Phiếu HU">' + docLink(x.hu) + '<span class="sub">' + esc(U.fmtDate(x.hu.ngayLap)) + '</span></td>' +
        '<td data-l="Tạm ứng">' + (x.tu ? docLink(x.tu) : esc(x.hu.tuSoPhieu || '—')) + '</td><td class="num" data-l="Đã ứng">' + money(x.adv) + '</td><td class="num b" data-l="Thực chi">' + money(x.spent) + '</td>' +
        '<td class="num" data-l="Chênh lệch">' + (x.diff > 0 ? '<span class="ok-t">+' + U.groupThousand(x.diff) + '</span>' : x.diff < 0 ? '<span class="danger-t">−' + U.groupThousand(-x.diff) + '</span>' : '0') + '</td>' +
        '<td data-l="Xử lý">' + B(x.cls || 'out', x.label) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="4">Cộng</td><td class="num">' + money(l.reduce((a, x) => a + x.adv, 0)) + '</td><td class="num">' + money(l.reduce((a, x) => a + x.spent, 0)) + '</td><td colspan="2"></td></tr></tfoot></table></div></div></div>';
  }
  function soHTML(R) {
    const L = R.ledger;
    if (!L.length) return '<div class="card">' + App.emptyState('book', 'Sổ trống trong kỳ', 'Chỉ phiếu đã gửi duyệt mới vào sổ.') + '</div>';
    const chi = L.filter((x) => x.dir === 'chi').reduce((a, x) => a + x.amount, 0), thu = L.filter((x) => x.dir === 'thu').reduce((a, x) => a + x.amount, 0);
    return '<div class="card"><div class="card-h"><div class="t">' + I('book') + 'Sổ giao dịch · ' + L.length + ' dòng</div><span class="muted" style="font-size:12.5px">Chi ' + money(chi) + ' · Thu hồi ' + money(thu) + '</span></div><div class="card-b flush"><div class="tbl-wrap"><table class="tbl cards ledger"><thead><tr><th>STT</th><th>Ngày</th><th class="num">Số tiền</th><th>Người</th><th>Diễn giải</th><th>Mã giao dịch</th><th>Loại</th><th>Ghi chú</th><th>Theo dõi</th></tr></thead><tbody>' +
      L.map((x) => '<tr class="dir-' + x.dir + '"><td class="ix">' + x.stt + '</td><td data-l="Ngày" class="nowrap">' + esc(U.fmtDate(x.date)) + '</td>' +
        '<td class="num b" data-l="Số tiền">' + (x.dir === 'thu' ? '+' : '') + U.groupThousand(x.amount) + '</td><td data-l="Người">' + esc(x.name) + '</td>' +
        '<td data-l="Diễn giải" style="min-width:200px">' + esc(x.desc) + '<span class="sub">' + docLink(x.d) + (x.soSo ? ' · Sổ ' + esc(x.soSo) : '') + '</span></td>' +
        '<td data-l="Mã GD" class="mono" style="font-size:12px">' + esc(x.ref || '—') + '</td><td data-l="Loại">' + esc(x.cat) + '</td>' +
        '<td data-l="Ghi chú" style="min-width:180px;font-size:12.5px">' + esc(x.note) + '</td><td data-l="Theo dõi">' + B(/tất toán|Khớp|Đã thanh toán|Đã nộp|Đã chi/.test(x.follow) ? 'ok' : /Phải|chưa|Chi vượt/i.test(x.follow) ? 'warn' : 'primary', x.follow) + '</td></tr>').join('') +
      '</tbody></table></div></div></div>';
  }
  function ttHTML(R) {
    const tbl = (l) => l.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>#</th><th>Người</th><th>Số phiếu</th><th>Ngày lập</th><th>Nội dung</th><th class="num">Số tiền</th><th>Liên quan</th><th>Đã chi</th><th>Trạng thái</th></tr></thead><tbody>' +
      l.map((x, i) => '<tr><td class="ix">' + (i + 1) + '</td><td data-l="Người"><b>' + esc(x.t._ownerName) + '</b></td><td data-l="Số phiếu">' + docLink(x.t) + '</td><td data-l="Ngày lập" class="nowrap">' + esc(U.fmtDate(x.t.ngayLap)) + '</td>' +
        '<td data-l="Nội dung" style="min-width:200px">' + esc(x.t.noiDung || '') + '</td><td class="num b" data-l="Số tiền">' + money(x.total) + '</td>' +
        '<td data-l="Liên quan">' + (x.hu ? 'Bù vượt tạm ứng ' + (x.tu ? docLink(x.tu) : '<b>' + esc(x.tuSo || '?') + '</b>') + '<span class="sub">quyết toán ' + esc(x.hu.soPhieu) + '</span>' : '<span class="muted">Ngoài tạm ứng</span>') + '</td>' +
        '<td data-l="Đã chi" class="nowrap">' + (x.paid ? esc(U.fmtDate(x.paid.at)) + (x.paid.ref ? '<span class="sub mono">' + esc(x.paid.ref) + '</span>' : '') : '—') + '</td><td data-l="Trạng thái">' + F().badge(x.t, x.o, true) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="5">Cộng</td><td class="num">' + money(l.reduce((a, x) => a + x.total, 0)) + '</td><td colspan="3"></td></tr></tfoot></table></div>' : '<p class="muted" style="padding:14px 18px;margin:0;font-size:13px">Không có.</p>';
    return '<div class="card"><div class="card-h"><div class="t">' + I('link') + 'DNTT bù chi vượt tạm ứng <span class="cnt0">' + R.k.ttBu.length + '</span></div></div><div class="card-b flush">' + tbl(R.k.ttBu) + '</div></div>' +
      '<div class="card mt16"><div class="card-h"><div class="t">' + I('calc') + 'DNTT độc lập — chi ngoài tạm ứng <span class="cnt0">' + R.k.ttDl.length + '</span></div></div><div class="card-b flush">' + tbl(R.k.ttDl) + '</div></div>';
  }
  function hdHTML(R) {
    const f = R.f, l = f.onlyMiss ? R.k.hdMiss : R.lines;
    return '<div class="card"><div class="card-h"><div class="t">' + I('receipt') + (f.onlyMiss ? 'Dòng chi chưa có hoá đơn' : 'Tất cả dòng chi') + ' <span class="cnt0">' + l.length + '</span></div>' +
      '<label class="switch"><input type="checkbox" id="hd-only"' + (f.onlyMiss ? ' checked' : '') + '> Chỉ dòng thiếu HĐ</label></div><div class="card-b flush">' +
      (l.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>#</th><th>Người</th><th>Phiếu</th><th>Khoản chi</th><th>Ngày chi</th><th class="num">Số tiền</th><th>Hoá đơn</th><th>KT nhận HĐ</th><th>Ghi chú</th></tr></thead><tbody>' +
        l.map((x, i) => '<tr><td class="ix">' + (i + 1) + '</td><td data-l="Người"><b>' + esc(x.d._ownerName) + '</b></td><td data-l="Phiếu">' + docLink(x.d) + '<span class="sub">Dòng ' + (x.i + 1) + '</span></td>' +
          '<td data-l="Khoản chi" style="min-width:180px">' + esc(x.it.noiDung || '') + '</td><td data-l="Ngày chi" class="nowrap">' + esc(x.it.ngayChi ? U.fmtDate(x.it.ngayChi) : '') + '</td>' +
          '<td class="num b" data-l="Số tiền">' + money(x.amount) + '</td><td data-l="Hoá đơn">' + F().hdBadge(x.hd) + '</td><td data-l="KT nhận HĐ">' + (x.got ? B('ok', 'Đã nhận') : '—') + '</td>' +
          '<td data-l="Ghi chú" style="font-size:12.5px">' + esc(x.it.ghiChu || '') + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="5">Cộng</td><td class="num">' + money(l.reduce((a, x) => a + x.amount, 0)) + '</td><td colspan="3"></td></tr></tfoot></table></div>' : App.emptyState('check', 'Không có dòng nào', f.onlyMiss ? 'Mọi dòng chi trong kỳ đều có hoá đơn.' : '')) + '</div></div>';
  }
  function nguoiHTML(R) {
    const l = R.people;
    return '<div class="card"><div class="card-h"><div class="t">' + I('users') + 'Tổng hợp theo nhân sự</div></div><div class="card-b flush">' + (l.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Nhân sự</th><th class="num">Phiếu gửi</th><th class="num">Tạm ứng</th><th class="num">Chưa hoàn ứng</th><th class="num">Phải nộp lại</th><th class="num">Chi vượt chưa bù</th><th class="num">DNTT bù</th><th class="num">DNTT độc lập</th><th class="num">Dòng thiếu HĐ</th></tr></thead><tbody>' +
      l.map((p) => '<tr><td data-l="Nhân sự"><b>' + esc(p.name) + '</b></td><td class="num" data-l="Phiếu gửi">' + p.docs + '</td><td class="num" data-l="Tạm ứng">' + money(p.tuAmt) + '<span class="sub">' + p.tu + ' phiếu</span></td>' +
        '<td class="num" data-l="Chưa hoàn ứng">' + (p.open ? '<span class="danger-t b">' + money(p.openAmt) + '</span><span class="sub">' + p.open + ' phiếu</span>' : '—') + '</td>' +
        '<td class="num" data-l="Phải nộp lại">' + (p.rdue ? '<span class="warn-t b">' + money(p.rdue) + '</span>' : '—') + '</td><td class="num" data-l="Chi vượt chưa bù">' + (p.over ? money(p.over) : '—') + '</td>' +
        '<td class="num" data-l="DNTT bù">' + money(p.bu) + '</td><td class="num" data-l="DNTT độc lập">' + money(p.dl) + '</td><td class="num" data-l="Thiếu HĐ">' + (p.miss || '—') + '</td></tr>').join('') +
      '</tbody></table></div>' : App.emptyState('users', 'Chưa có dữ liệu', '')) + '</div></div>';
  }

  /* ============================== XUẤT FILE ============================== */
  const ST_FILL = { ok: 'E3F6EA', warn: 'FFF1D6', danger: 'FDE2E2', primary: 'E9E0F7', accent: 'FBE3EF', out: 'F2F2F5' };
  function meta(R) {
    const acc = F().isAcc(), s = App.settings;
    return { settings: s, filter: { from: R.f.from, to: R.f.to }, owner: { name: acc ? (F().myName() + ' (' + F().ROLES[F().role()].t + ')') : (s.hoTen || ''), dept: acc ? 'Toàn công ty' : (s.boPhan || '') } };
  }
  const fileBase = (R) => U.safeName('Doi-chieu - ' + R.f.label + ' - ' + U.todayISO());

  async function excel(R, blobOnly) {
    const ExcelJS = await App.ensureLib('exceljs'), X = App.Report.xl, Dc = D();
    const wb = new ExcelJS.Workbook(); wb.creator = 'LtL Tạm ứng & Hoàn ứng'; wb.created = new Date();
    const bytes = await App.Export._logoBytes(); const logoId = bytes ? wb.addImage({ buffer: bytes, extension: 'png' }) : null;
    const r = meta(R);
    const stCell = (ws, row, col, cls, text) => { const c = ws.getCell(row, col); c.value = text; c.fill = X.fill(ST_FILL[cls] || 'FFFFFF'); c.font = X.fnt({ b: true, size: 9.5 }); c.alignment = { wrapText: true, vertical: 'middle' }; c.border = X.box; };
    const sheet = (name, tab, widths, title, heads) => {
      const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: 'FF' + tab } } });
      ws.columns = widths.map((w) => ({ width: w }));
      let row = X.brandHeader(ws, r, title, widths.length, logoId);
      X.tableHead(ws, row, heads); return { ws, row: row + 1, hr: row };
    };
    // 0) BẢNG ĐỐI CHIẾU THEO CỘT — đúng bộ lọc đang xem, đủ mã phiếu / mã liên quan / mã giao dịch
    {
      const Fl = F(), rows = viewRows(R);
      const H = ['STT', 'Ngày lập', 'Loại', 'Mã phiếu', 'Số vào sổ', 'Người đề nghị', 'Bộ phận', 'Nội dung', 'Số tiền', 'Trạng thái duyệt', 'Ngày duyệt', 'Người duyệt',
        'Chi tiền', 'Ngày chi', 'Mã giao dịch', 'Mã tạm ứng (DNTU)', 'Mã hoàn ứng (DNHU)', 'Mã DNTT bù', 'Đã tạm ứng', 'Thực chi', 'Chênh lệch (+thừa / −thiếu)', 'Xử lý / đối chiếu', 'Dòng thiếu HĐ', 'Hoàn tất'];
      const W = [5, 11, 7, 17, 13, 20, 16, 34, 13, 15, 11, 18, 13, 11, 19, 17, 17, 17, 13, 13, 14, 30, 9, 10];
      const { ws, hr } = sheet('Đối chiếu', '6B3DBE', W, 'BẢNG ĐỐI CHIẾU CHỨNG TỪ · ' + R.f.label.toUpperCase() + ((QUICK.find((q) => q[0] === R.f.quick) || [])[0] !== 'all' ? ' · ' + (QUICK.find((q) => q[0] === R.f.quick) || [])[1].toUpperCase() : ''), H);
      let row = hr + 1;
      rows.forEach((x, i) => {
        const d = x.d, rv = x.r, st = Fl.ST[x.s], decided = rv.at && Fl.ST[rv.status];
        X.tableRow(ws, row, [i + 1, App.Export._isoToDate(d.ngayLap), Dc.TYPES[d.type].prefix, d.soPhieu, rv.soSo || '', d._ownerName, d._dept || d.boPhan || '', d.noiDung || '', x.total,
          st.s, decided ? App.Export._isoToDate(rv.at.slice(0, 10)) : '', decided ? rv.byName || '' : '',
          x.pay.t === '—' ? '' : x.pay.t, x.pay.at ? App.Export._isoToDate(x.pay.at) : '', x.pay.ref || '',
          x.codes.tu, x.codes.hu, x.codes.tt, x.adv === '' || x.adv == null ? '' : x.adv, x.spent === '' || x.spent == null ? '' : x.spent, x.diff === '' || x.diff == null ? '' : x.diff,
          x.xl || '', x.miss || '', x.done ? 'Đã hoàn tất' : ''],
          ['c', 'd', 'c', '', '', '', '', '', 'n', '', 'd', '', '', 'd', '', '', '', '', 'n', 'n', 'n', '', 'c', 'c'], i % 2);
        stCell(ws, row, 10, st.cls, st.s);
        if (x.pay.t !== '—') stCell(ws, row, 13, x.pay.cls, x.pay.t);
        if (x.set) stCell(ws, row, 22, x.set.cls, x.set.t);
        row++;
      });
      X.totalRow(ws, row, H.length, 'CỘNG ' + rows.length + ' PHIẾU', rows.length ? { 9: { formula: 'SUM(I' + (hr + 1) + ':I' + (row - 1) + ')', result: 0 } } : {});
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: H.length } };
      ws.views = [{ state: 'frozen', ySplit: hr, xSplit: 4, showGridLines: false }];
      X.pageSetup(ws, row, H.length, true);
    }
    // 1) Tổng hợp
    {
      const ws = wb.addWorksheet('Tổng hợp', { properties: { tabColor: { argb: 'FF6B3DBE' } } });
      ws.columns = [34, 20, 14, 46].map((w) => ({ width: w }));
      let row = X.brandHeader(ws, r, 'ĐỐI CHIẾU TẠM ỨNG – HOÀN ỨNG – THANH TOÁN · ' + R.f.label.toUpperCase(), 4, logoId);
      const E = R.E, k = R.k;
      X.tableHead(ws, row, ['Chỉ tiêu', 'Số tiền (VNĐ)', 'Số phiếu / dòng', 'Ghi chú']); row++;
      const L = [
        ['Tạm ứng đã chi (A)', E.A, k.tuN, 'Phiếu DNTU đã duyệt chi trong kỳ', 'primary'],
        ['Thực chi đã quyết toán (S)', E.S, '', 'Theo phiếu DNHU đã duyệt', ''],
        ['Chi vượt tạm ứng – bù qua DNTT (V)', E.Over, k.topDue.length + k.topPend.length + k.topDone.length, k.topDue.length + ' chưa lập DNTT bù', 'warn'],
        ['Đã nộp lại tạm ứng thừa (R1)', E.Rok, '', 'Kế toán đã xác nhận nhận về TK công ty', 'ok'],
        ['Phải / chờ xác nhận nộp lại (R2)', E.Rwait + E.Rdue, '', 'Nhân sự còn phải chuyển trả / KT chưa xác nhận', 'warn'],
        ['Chưa hoàn ứng (O)', E.O, k.tuOpen.length, 'Chưa có phiếu hoàn ứng hoặc hoàn ứng chưa duyệt', 'danger'],
        ['KIỂM TRA: A = S − V + R1 + R2 + O', E.right, '', E.ok ? 'KHỚP' : 'LỆCH ' + U.groupThousand(E.A - E.right), E.ok ? 'ok' : 'danger'],
        ['DNTT bù hoàn ứng', k.ttBu.reduce((a, x) => a + x.total, 0), k.ttBu.length, 'Gắn với phiếu DNHU chi vượt', ''],
        ['DNTT độc lập (ngoài tạm ứng)', k.ttDl.reduce((a, x) => a + x.total, 0), k.ttDl.length, 'Chi phí thanh toán trực tiếp', ''],
        ['Dòng chi có hoá đơn', k.hdHas.reduce((a, x) => a + x.amount, 0), k.hdHas.length, 'HĐ VAT / bill', 'ok'],
        ['Dòng chi chưa có / không có hoá đơn', k.hdMiss.reduce((a, x) => a + x.amount, 0), k.hdMiss.length, 'Theo dõi bù hoá đơn', 'warn'],
      ];
      L.forEach((x, i) => { X.tableRow(ws, row, [x[0], x[1], x[2], x[3]], ['', 'n', 'c', ''], i % 2); if (x[4]) stCell(ws, row, 4, x[4], x[3]); ws.getCell(row, 1).font = X.fnt({ b: i === 0 || i === 6 }); row++; });
      row++; X.signBlock(ws, row, r, [[1, 1], [2, 3], [4, 4]]);
      X.pageSetup(ws, row + 6, 4, false);
    }
    // 2) Theo dõi tạm ứng
    {
      const { ws, hr } = sheet('Theo dõi tạm ứng', 'C2357A', [5, 20, 18, 34, 11, 14, 18, 14, 13, 22, 30], 'THEO DÕI TẠM ỨNG · ' + R.f.label.toUpperCase(),
        ['STT', 'Người', 'Phiếu tạm ứng', 'Nội dung', 'Ngày chi', 'Đã ứng', 'Phiếu hoàn ứng', 'Thực chi', 'Chênh lệch', 'Xử lý', 'Trạng thái']);
      let row = hr + 1;
      R.tus.forEach((x, i) => {
        X.tableRow(ws, row, [i + 1, x.tu._ownerName, x.tu.soPhieu + (x.soSo ? '\n' + x.soSo : ''), x.tu.noiDung || '', x.paid ? App.Export._isoToDate(x.paid.at) : '', x.adv, x.hu ? x.hu.soPhieu : '(chưa có)', x.hu ? x.spent : '', x.hu ? x.diff : '',
          x.diff > 0 && x.hu ? 'Nộp lại ' + U.groupThousand(x.diff) : x.diff < 0 && x.hu ? (x.tt ? 'DNTT bù ' + x.tt.soPhieu : 'Cần DNTT bù') : x.hu ? 'Khớp' : 'Lập hoàn ứng', x.label], ['c', '', '', '', 'd', 'n', '', 'n', 'n', '', ''], i % 2);
        stCell(ws, row, 11, x.cls, x.label); row++;
      });
      X.totalRow(ws, row, 11, 'CỘNG', R.tus.length ? { 6: { formula: 'SUM(F' + (hr + 1) + ':F' + (row - 1) + ')', result: 0 }, 8: { formula: 'SUM(H' + (hr + 1) + ':H' + (row - 1) + ')', result: 0 } } : {});
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: 11 } };
      ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
      X.pageSetup(ws, row, 11, true);
    }
    // 3) Sổ giao dịch (kiểu sao kê)
    {
      const { ws, hr } = sheet('Sổ giao dịch', '2952CC', [5, 11, 14, 20, 36, 20, 22, 36, 24, 16], 'SỔ GIAO DỊCH TẠM ỨNG – HOÀN ỨNG – THANH TOÁN · ' + R.f.label.toUpperCase(),
        ['STT', 'Ngày', 'Số tiền', 'Tên', 'Diễn giải', 'Mã giao dịch', 'Loại', 'Ghi chú', 'Theo dõi', 'Số phiếu / sổ']);
      let row = hr + 1;
      R.ledger.forEach((x, i) => {
        X.tableRow(ws, row, [x.stt, App.Export._isoToDate(x.date), x.dir === 'thu' ? x.amount : x.amount, String(x.name || '').toUpperCase(), x.desc, x.ref || '', x.cat, x.note, x.follow, x.so + (x.soSo ? ' · ' + x.soSo : '')],
          ['c', 'd', 'n', '', '', '', '', '', '', ''], i % 2);
        if (x.dir === 'thu') ws.getCell(row, 3).font = X.fnt({ b: true, color: '047857' });
        stCell(ws, row, 9, /tất toán|Khớp|Đã thanh toán|Đã nộp|Đã chi/.test(x.follow) ? 'ok' : /Phải|chưa|Chi vượt/i.test(x.follow) ? 'warn' : 'primary', x.follow);
        row++;
      });
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: 10 } };
      ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
      X.pageSetup(ws, row, 10, true);
    }
    // 4) Thanh toán
    {
      const { ws, hr } = sheet('DNTT', '047857', [5, 20, 18, 11, 38, 14, 20, 20, 16], 'GIẤY ĐỀ NGHỊ THANH TOÁN · ' + R.f.label.toUpperCase(),
        ['STT', 'Người', 'Số phiếu', 'Ngày lập', 'Nội dung', 'Số tiền', 'Phân loại', 'Đã chi (mã GD)', 'Trạng thái']);
      let row = hr + 1;
      [].concat(R.k.ttBu, R.k.ttDl).forEach((x, i) => {
        X.tableRow(ws, row, [i + 1, x.t._ownerName, x.t.soPhieu, App.Export._isoToDate(x.t.ngayLap), x.t.noiDung || '', x.total, x.kind === 'bu' ? 'Bù vượt tạm ứng ' + (x.tuSo || '?') + (x.hu ? ' (quyết toán ' + x.hu.soPhieu + ')' : '') : 'Độc lập (ngoài tạm ứng)',
          x.paid ? U.fmtDate(x.paid.at) + (x.paid.ref ? ' · ' + x.paid.ref : '') : '', F().ST[x.s].s], ['c', '', '', 'd', '', 'n', '', '', ''], i % 2);
        stCell(ws, row, 9, F().ST[x.s].cls, F().ST[x.s].s); row++;
      });
      X.totalRow(ws, row, 9, 'CỘNG', row > hr + 1 ? { 6: { formula: 'SUM(F' + (hr + 1) + ':F' + (row - 1) + ')', result: 0 } } : {});
      X.pageSetup(ws, row, 9, true);
    }
    // 5) Hoá đơn
    {
      const { ws, hr } = sheet('Hoá đơn', 'C2410C', [5, 20, 18, 7, 36, 11, 14, 20, 13, 30], 'THEO DÕI HOÁ ĐƠN CÁC DÒNG CHI · ' + R.f.label.toUpperCase(),
        ['STT', 'Người', 'Phiếu', 'Dòng', 'Khoản chi', 'Ngày chi', 'Số tiền', 'Hoá đơn', 'KT nhận HĐ', 'Ghi chú']);
      let row = hr + 1;
      R.lines.forEach((x, i) => {
        X.tableRow(ws, row, [i + 1, x.d._ownerName, x.d.soPhieu, x.i + 1, x.it.noiDung || '', App.Export._isoToDate(x.it.ngayChi), x.amount, F().HD_T[x.hd], x.got ? 'Đã nhận' : '', x.it.ghiChu || ''], ['c', '', '', 'c', '', 'd', 'n', '', 'c', ''], i % 2);
        stCell(ws, row, 8, F().HD_CLS[x.hd], F().HD_T[x.hd]); row++;
      });
      X.totalRow(ws, row, 10, 'CỘNG', row > hr + 1 ? { 7: { formula: 'SUM(G' + (hr + 1) + ':G' + (row - 1) + ')', result: 0 } } : {});
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: 10 } };
      X.pageSetup(ws, row, 10, true);
    }
    // 6) Danh sách phiếu đầy đủ (mọi thông tin để đối chiếu)
    {
      const Fl = F();
      const { ws, hr } = sheet('Danh sách phiếu', '6B3DBE', [5, 9, 18, 14, 20, 16, 11, 36, 14, 16, 18, 13, 14, 20, 12, 14, 12],
        'DANH SÁCH PHIẾU · ' + R.f.label.toUpperCase(),
        ['STT', 'Loại', 'Số phiếu', 'Số vào sổ', 'Người đề nghị', 'Bộ phận', 'Ngày lập', 'Nội dung', 'Số tiền', 'Trạng thái', 'Liên kết', 'Ngày gửi', 'Ngày duyệt', 'Người duyệt', 'Ngày chi', 'Mã GD', 'Hoàn tất']);
      let row = hr + 1;
      R.docsP.forEach((d, i) => {
        const r = Fl.reviewOf(d, d._owner) || {}, s = Fl.status(d, d._owner);
        X.tableRow(ws, row, [i + 1, Dc.TYPES[d.type].prefix, d.soPhieu, r.soSo || '', d._ownerName, d._dept || d.boPhan || '', App.Export._isoToDate(d.ngayLap), d.noiDung || '', Dc.total(d), Fl.ST[s].s,
          d.type === 'HU' ? 'TU ' + (d.tuSoPhieu || '') : d.huDocId ? 'Bù HU' : d.type === 'TT' ? 'Độc lập' : '', d.submittedAt ? U.fmtDate(d.submittedAt.slice(0, 10)) : '', r.at && Fl.ST[r.status] ? U.fmtDate(r.at.slice(0, 10)) : '', r.byName || '',
          r.paid ? U.fmtDate(r.paid.at) : '', r.paid ? r.paid.ref || '' : '', Fl.isDone(d, d._owner) ? 'Đã hoàn tất' : ''], ['c', 'c', '', '', '', '', 'd', '', 'n', '', '', 'c', 'c', '', 'c', '', 'c'], i % 2);
        stCell(ws, row, 10, Fl.ST[s].cls, Fl.ST[s].s); row++;
      });
      X.totalRow(ws, row, 17, 'CỘNG', row > hr + 1 ? { 9: { formula: 'SUM(I' + (hr + 1) + ':I' + (row - 1) + ')', result: 0 } } : {});
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: 17 } };
      ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
      X.pageSetup(ws, row, 17, true);
    }
    // 7) Chi tiết từng dòng chi của mọi phiếu
    {
      const Fl = F();
      const { ws, hr } = sheet('Chi tiết dòng chi', '0E7490', [5, 9, 18, 20, 6, 36, 11, 18, 8, 13, 14, 18, 12, 12, 28, 14],
        'CHI TIẾT DÒNG CHI · ' + R.f.label.toUpperCase(),
        ['STT', 'Loại', 'Số phiếu', 'Người', 'Dòng', 'Nội dung', 'Ngày chi', 'Người tham gia', 'SL', 'Đơn giá', 'Thành tiền', 'Hoá đơn', 'KT đối chiếu', 'KT nhận HĐ', 'Ghi chú', 'Trạng thái phiếu']);
      let row = hr + 1, n = 0;
      R.docsP.forEach((d) => {
        const r = Fl.reviewOf(d, d._owner) || {}, s = Fl.status(d, d._owner);
        Dc.filledItems(d).forEach((it, j) => {
          const c = (r.items || {})[it.id] || {};
          X.tableRow(ws, row, [++n, Dc.TYPES[d.type].prefix, d.soPhieu, d._ownerName, j + 1, it.noiDung || '', App.Export._isoToDate(it.ngayChi), it.nguoiThamGia || '', it.soLuong === '' ? '' : U.toNumber(it.soLuong) || it.soLuong,
            U.toNumber(it.donGia), Dc.lineTotal(it), d.type === 'TU' ? '(tạm ứng)' : Fl.HD_T[Fl.hdOf(it)], c.ok ? '✓' : '', c.hd ? '✓' : '', it.ghiChu || '', Fl.ST[s].s], ['c', 'c', '', '', 'c', '', 'd', '', 'c', 'n', 'n', '', 'c', 'c', '', ''], n % 2);
          if (d.type !== 'TU') stCell(ws, row, 12, Fl.HD_CLS[Fl.hdOf(it)], Fl.HD_T[Fl.hdOf(it)]);
          row++;
        });
      });
      X.totalRow(ws, row, 16, 'CỘNG', row > hr + 1 ? { 11: { formula: 'SUM(K' + (hr + 1) + ':K' + (row - 1) + ')', result: 0 } } : {});
      ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: Math.max(hr, row - 1), column: 16 } };
      ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
      X.pageSetup(ws, row, 16, true);
    }
    // 8) Theo nhân sự
    if (R.people.length > 1 || F().isAcc()) {
      const { ws, hr } = sheet('Theo nhân sự', 'D6589A', [24, 10, 16, 16, 16, 16, 16, 16, 12], 'TỔNG HỢP THEO NHÂN SỰ · ' + R.f.label.toUpperCase(),
        ['Nhân sự', 'Phiếu gửi', 'Tạm ứng', 'Chưa hoàn ứng', 'Phải nộp lại', 'Chi vượt chưa bù', 'DNTT bù', 'DNTT độc lập', 'Dòng thiếu HĐ']);
      let row = hr + 1;
      R.people.forEach((p, i) => { X.tableRow(ws, row, [p.name, p.docs, p.tuAmt, p.openAmt, p.rdue, p.over, p.bu, p.dl, p.miss], ['', 'c', 'n', 'n', 'n', 'n', 'n', 'n', 'c'], i % 2); row++; });
      X.pageSetup(ws, row, 9, true);
    }
    void Dc;
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!blobOnly) { U.saveBlob(blob, fileBase(R) + '.xlsx'); App.toast('Đã tạo file Excel đối chiếu', 'ok'); }
    return blob;
  }

  // HTML in / PDF (mỗi khối .pdf-blk tự xuống trang khi cần)
  function printHTML(R) {
    const s = App.settings, E = R.E, k = R.k, m = meta(R);
    const t = (heads, rows, foot) => '<table class="rp-t"><thead><tr>' + heads.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody>' + (foot || '') + '</table>';
    const td = (v, c) => '<td' + (c ? ' class="' + c + '"' : '') + '>' + v + '</td>';
    const st = (cls, txt) => '<span class="rp-b ' + cls + '">' + esc(txt) + '</span>';
    const head = '<div class="pdf-blk rp-head"><img src="assets/templates/logo-ltl.png" alt=""><div><b>' + esc(s.company) + '</b><br>' + esc(s.companyAddr) + ' · MST ' + esc(s.mst) + '</div></div>' +
      '<div class="pdf-blk rp-title"><h1>ĐỐI CHIẾU TẠM ỨNG – HOÀN ỨNG – THANH TOÁN</h1><p>Kỳ: <b>' + esc(R.f.label) + '</b> · ' + esc(m.owner.dept) + ' · Người lập: ' + esc(m.owner.name) + ' · Xuất ngày ' + esc(U.fmtDate(U.todayISO())) + '</p></div>';
    const eqB = '<div class="pdf-blk"><h2>I. Đối chiếu tạm ứng ' + (E.ok ? st('ok', 'KHỚP') : st('danger', 'LỆCH ' + U.groupThousand(E.A - E.right))) + '</h2>' +
      t(['Tạm ứng đã chi (A)', 'Thực chi quyết toán (S)', 'Chi vượt – DNTT bù (V)', 'Đã nộp lại (R1)', 'Phải / chờ nộp lại (R2)', 'Chưa hoàn ứng (O)', 'S − V + R1 + R2 + O'],
        ['<tr>' + [E.A, E.S, E.Over, E.Rok, E.Rwait + E.Rdue, E.O, E.right].map((v) => td(U.groupThousand(v), 'n b')).join('') + '</tr>']) +
      '<div class="rp-kp"><span>DNTT bù: <b>' + money(k.ttBu.reduce((a, x) => a + x.total, 0)) + '</b> (' + k.ttBu.length + ')</span><span>DNTT độc lập: <b>' + money(k.ttDl.reduce((a, x) => a + x.total, 0)) + '</b> (' + k.ttDl.length + ')</span><span>Dòng thiếu HĐ: <b>' + k.hdMiss.length + '</b> · ' + money(k.hdMiss.reduce((a, x) => a + x.amount, 0)) + '</span></div></div>';
    const tuB = '<div class="pdf-blk"><h2>II. Theo dõi tạm ứng (' + R.tus.length + ')</h2>' + t(['STT', 'Người', 'Phiếu TU', 'Ngày chi', 'Đã ứng', 'Phiếu HU', 'Thực chi', 'Chênh lệch', 'Trạng thái'],
      R.tus.map((x, i) => '<tr>' + td(i + 1, 'c') + td(esc(x.tu._ownerName)) + td(esc(x.tu.soPhieu)) + td(x.paid ? esc(U.fmtDate(x.paid.at)) : '—', 'c') + td(U.groupThousand(x.adv), 'n') +
        td(x.hu ? esc(x.hu.soPhieu) : '—') + td(x.hu ? U.groupThousand(x.spent) : '—', 'n') + td(x.hu ? (x.diff > 0 ? '+' : '') + U.groupThousand(x.diff) : '—', 'n') + td(st(x.cls, x.label)) + '</tr>')) + '</div>';
    const ldB = '<div class="pdf-blk"><h2>III. Sổ giao dịch (' + R.ledger.length + ')</h2>' + t(['STT', 'Ngày', 'Số tiền', 'Tên', 'Diễn giải', 'Mã GD', 'Loại', 'Theo dõi'],
      R.ledger.map((x) => '<tr>' + td(x.stt, 'c') + td(esc(U.fmtDate(x.date)), 'c') + td((x.dir === 'thu' ? '+' : '') + U.groupThousand(x.amount), 'n b') + td(esc(String(x.name).toUpperCase())) +
        td(esc(x.desc) + '<br><small>' + esc(x.so) + '</small>') + td(esc(x.ref || '—'), 'mono') + td(esc(x.cat)) + td(st(/tất toán|Khớp|Đã thanh toán|Đã nộp|Đã chi/.test(x.follow) ? 'ok' : /Phải|chưa|Chi vượt/i.test(x.follow) ? 'warn' : 'primary', x.follow)) + '</tr>')) + '</div>';
    const ttB = '<div class="pdf-blk"><h2>IV. Thanh toán (DNTT)</h2>' + t(['STT', 'Người', 'Số phiếu', 'Nội dung', 'Số tiền', 'Phân loại', 'Trạng thái'],
      [].concat(k.ttBu, k.ttDl).map((x, i) => '<tr>' + td(i + 1, 'c') + td(esc(x.t._ownerName)) + td(esc(x.t.soPhieu)) + td(esc(x.t.noiDung || '')) + td(U.groupThousand(x.total), 'n') +
        td(x.kind === 'bu' ? 'Bù vượt ' + esc(x.tuSo || '?') + '<br><small>' + esc(x.hu ? x.hu.soPhieu : '') + '</small>' : 'Độc lập') + td(st(F().ST[x.s].cls, F().ST[x.s].s)) + '</tr>')) + '</div>';
    const hdB = '<div class="pdf-blk"><h2>V. Dòng chi chưa có hoá đơn (' + k.hdMiss.length + ')</h2>' + (k.hdMiss.length ? t(['STT', 'Người', 'Phiếu', 'Khoản chi', 'Số tiền', 'Hoá đơn'],
      k.hdMiss.map((x, i) => '<tr>' + td(i + 1, 'c') + td(esc(x.d._ownerName)) + td(esc(x.d.soPhieu) + ' · dòng ' + (x.i + 1)) + td(esc(x.it.noiDung || '')) + td(U.groupThousand(x.amount), 'n') + td(st(F().HD_CLS[x.hd], F().HD_T[x.hd])) + '</tr>')) : '<p>Mọi dòng chi đều có hoá đơn.</p>') + '</div>';
    const sign = '<div class="pdf-blk rp-sign"><p class="rp-date">' + esc(D().dateLine(U.todayISO())) + '</p><div><span><b>NGƯỜI LẬP</b><i>(Ký, ghi rõ họ tên)</i><br><br><br>' + esc(m.owner.name.replace(/ \(.+\)$/, '')) + '</span><span><b>KẾ TOÁN TRƯỞNG</b><i>(Ký, họ tên)</i><br><br><br>' + esc(s.keToanTruong || '') + '</span><span><b>' + esc(s.chucDanhPheDuyet || 'GIÁM ĐỐC') + '</b><i>(Ký, họ tên)</i><br><br><br>' + esc(s.giamDoc || '') + '</span></div></div>';
    return head + eqB + tuB + ldB + ttB + hdB + sign;
  }

  async function word(R, blobOnly) {
    const X = await App.ensureLib('docx'), s = App.settings, E = R.E, k = R.k, m = meta(R);
    const PURPLE = '6B3DBE', FONT = 'Arial', W = 16838, H = 11906, M = 720, CW = W - 2 * M;
    const L = { style: X.BorderStyle.SINGLE, size: 4, color: 'D9CCE8' }, BOX = { top: L, bottom: L, left: L, right: L };
    const NONE = { style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, NOB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
    const FILL = { ok: 'E3F6EA', warn: 'FFF1D6', danger: 'FDE2E2', primary: 'E9E0F7', accent: 'FBE3EF', out: 'F2F2F5' };
    const R_ = (t, o) => { o = o || {}; return new X.TextRun({ text: t == null ? '' : String(t), bold: !!o.b, italics: !!o.i, size: o.size || 17, color: o.color, font: FONT }); };
    const P = (runs, o) => { o = o || {}; return new X.Paragraph({ alignment: o.al, spacing: { before: o.before || 0, after: o.after == null ? 30 : o.after }, keepNext: o.keepNext, children: Array.isArray(runs) ? runs : [runs] }); };
    const C = (ch, o) => { o = o || {}; return new X.TableCell({ width: { size: o.w, type: X.WidthType.DXA }, borders: o.borders || BOX, verticalAlign: X.VerticalAlign.CENTER, shading: o.fill ? { fill: o.fill, type: X.ShadingType.CLEAR, color: 'auto' } : undefined, margins: { top: 40, bottom: 40, left: 70, right: 70 }, children: Array.isArray(ch) ? ch : [ch] }); };
    const scale = (arr) => { const t = arr.reduce((a, b) => a + b, 0); const w = arr.map((x) => Math.round(x / t * CW)); w[w.length - 1] += CW - w.reduce((a, b) => a + b, 0); return w; };
    const AL = X.AlignmentType;
    const table = (rel, head, rows) => {
      const w = scale(rel);
      const tr = [new X.TableRow({ tableHeader: true, children: head.map((h, i) => C(P(R_(h, { b: true, color: 'FFFFFF', size: 16 }), { al: AL.CENTER, after: 0 }), { w: w[i], fill: PURPLE })) })];
      rows.forEach((cells, r) => tr.push(new X.TableRow({ cantSplit: true, children: cells.map((v, i) => {
        const o = v && typeof v === 'object' && !Array.isArray(v) ? v : { t: v };
        const isNum = typeof o.t === 'number';
        return C(P(R_(isNum ? U.groupThousand(o.t) : o.t, { b: o.b, size: 16 }), { al: isNum ? AL.RIGHT : i === 0 ? AL.CENTER : AL.LEFT, after: 0 }), { w: w[i], fill: o.cls ? FILL[o.cls] : r % 2 ? 'FAF6FD' : undefined });
      }) })));
      return new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: w, layout: X.TableLayoutType.FIXED, rows: tr });
    };
    const Hh = (t) => P(R_(t, { b: true, size: 22, color: PURPLE }), { before: 220, after: 80, keepNext: true });
    const ch = [];
    const logo = await App.Export._logoBytes();
    ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: [2400, CW - 2400], layout: X.TableLayoutType.FIXED,
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: [new X.TableRow({ children: [C(logo ? P(new X.ImageRun({ type: 'png', data: logo, transformation: { width: 130, height: 56 } })) : P(R_('Learn to Leap', { b: true })), { w: 2400, borders: NOB }),
        C([P(R_(s.company, { b: true, size: 20, color: PURPLE })), P(R_(s.companyAddr + ' · MST ' + s.mst, { size: 16, color: '555555' }), { after: 0 })], { w: CW - 2400, borders: NOB })] })] }));
    ch.push(P(R_('ĐỐI CHIẾU TẠM ỨNG – HOÀN ỨNG – THANH TOÁN', { b: true, size: 30, color: PURPLE }), { al: AL.CENTER, before: 160, after: 40 }));
    ch.push(P(R_('Kỳ: ' + R.f.label + ' · ' + m.owner.dept + ' · Người lập: ' + m.owner.name + ' · Xuất ngày ' + U.fmtDate(U.todayISO()), { i: true, size: 17, color: '555555' }), { al: AL.CENTER, after: 120 }));
    ch.push(Hh('I. ĐỐI CHIẾU TẠM ỨNG — ' + (E.ok ? 'KHỚP' : 'LỆCH ' + U.groupThousand(E.A - E.right))));
    ch.push(table([1, 1, 1, 1, 1, 1, 1], ['Tạm ứng đã chi (A)', 'Thực chi quyết toán (S)', 'Chi vượt – DNTT bù (V)', 'Đã nộp lại (R1)', 'Phải / chờ nộp lại (R2)', 'Chưa hoàn ứng (O)', 'S − V + R1 + R2 + O'],
      [[{ t: E.A, b: true }, E.S, { t: E.Over, cls: 'warn' }, { t: E.Rok, cls: 'ok' }, { t: E.Rwait + E.Rdue, cls: 'warn' }, { t: E.O, cls: 'danger' }, { t: E.right, b: true, cls: E.ok ? 'ok' : 'danger' }]]));
    ch.push(Hh('II. THEO DÕI TẠM ỨNG (' + R.tus.length + ')'));
    ch.push(table([0.5, 2, 1.8, 1.1, 1.3, 1.8, 1.3, 1.2, 2.8], ['STT', 'Người', 'Phiếu TU', 'Ngày chi', 'Đã ứng', 'Phiếu HU', 'Thực chi', 'Chênh lệch', 'Trạng thái'],
      R.tus.map((x, i) => [String(i + 1), x.tu._ownerName, x.tu.soPhieu, x.paid ? U.fmtDate(x.paid.at) : '—', x.adv, x.hu ? x.hu.soPhieu : '—', x.hu ? x.spent : '—', x.hu ? x.diff : '—', { t: x.label, cls: x.cls }])));
    ch.push(Hh('III. SỔ GIAO DỊCH (' + R.ledger.length + ')'));
    ch.push(table([0.5, 1, 1.2, 1.8, 3.2, 1.8, 1.8, 2.4], ['STT', 'Ngày', 'Số tiền', 'Tên', 'Diễn giải', 'Mã giao dịch', 'Loại', 'Theo dõi'],
      R.ledger.map((x) => [String(x.stt), U.fmtDate(x.date), x.amount, String(x.name).toUpperCase(), x.desc + ' (' + x.so + ')', x.ref || '—', x.cat, { t: x.follow, cls: /tất toán|Khớp|Đã thanh toán|Đã nộp|Đã chi/.test(x.follow) ? 'ok' : /Phải|chưa|Chi vượt/i.test(x.follow) ? 'warn' : 'primary' }])));
    ch.push(Hh('IV. THANH TOÁN (DNTT)'));
    ch.push(table([0.5, 2, 1.8, 3.6, 1.4, 2.2, 1.5], ['STT', 'Người', 'Số phiếu', 'Nội dung', 'Số tiền', 'Phân loại', 'Trạng thái'],
      [].concat(k.ttBu, k.ttDl).map((x, i) => [String(i + 1), x.t._ownerName, x.t.soPhieu, x.t.noiDung || '', x.total, x.kind === 'bu' ? 'Bù vượt ' + (x.tuSo || '?') + (x.hu ? ' / ' + x.hu.soPhieu : '') : 'Độc lập', { t: F().ST[x.s].s, cls: F().ST[x.s].cls }])));
    ch.push(Hh('V. DÒNG CHI CHƯA CÓ HOÁ ĐƠN (' + k.hdMiss.length + ')'));
    ch.push(k.hdMiss.length ? table([0.5, 2, 2.4, 4, 1.4, 2], ['STT', 'Người', 'Phiếu', 'Khoản chi', 'Số tiền', 'Hoá đơn'],
      k.hdMiss.map((x, i) => [String(i + 1), x.d._ownerName, x.d.soPhieu + ' · dòng ' + (x.i + 1), x.it.noiDung || '', x.amount, { t: F().HD_T[x.hd], cls: F().HD_CLS[x.hd] }])) : P(R_('Mọi dòng chi đều có hoá đơn.', { i: true })));
    ch.push(P(R_(D().dateLine(U.todayISO()), { i: true }), { al: AL.RIGHT, before: 300 }));
    const w3 = scale([1, 1, 1]);
    ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: w3, layout: X.TableLayoutType.FIXED,
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: [new X.TableRow({ children: [['NGƯỜI LẬP', m.owner.name.replace(/ \(.+\)$/, '')], ['KẾ TOÁN TRƯỞNG', s.keToanTruong || ''], [s.chucDanhPheDuyet || 'GIÁM ĐỐC', s.giamDoc || '']].map((p, i) =>
        C([P(R_(p[0], { b: true }), { al: AL.CENTER }), P(R_('(Ký, ghi rõ họ tên)', { i: true, size: 15, color: '888888' }), { al: AL.CENTER, after: 900 }), P(R_(p[1], { b: true }), { al: AL.CENTER })], { w: w3[i], borders: NOB })) })] }));
    const doc = new X.Document({ creator: 'LtL Tạm ứng & Hoàn ứng', title: 'Đối chiếu ' + R.f.label, styles: { default: { document: { run: { font: FONT, size: 17 } } } },
      sections: [{ properties: { page: { size: { width: W, height: H, orientation: X.PageOrientation.LANDSCAPE }, margin: { top: M, bottom: M, left: M, right: M } } }, children: ch }] });
    const blob = await X.Packer.toBlob(doc);
    if (!blobOnly) { U.saveBlob(blob, fileBase(R) + '.docx'); App.toast('Đã tạo file Word đối chiếu', 'ok'); }
    return blob;
  }
  const pdf = (R) => App.PDF.report(printHTML(R), { landscape: true, title: 'Đối chiếu ' + R.f.label, footer: 'Doi chieu ' + R.f.label });
  App.Ledger = { compute, printHTML, excel, word, pdf };

  Object.assign(App.actions, {
    dcMode(m) { const f = filt(); f.mode = m; if (m === 'tuy' && !f.from0) { const r = period(Object.assign({}, f, { mode: 'thang' })); f.from0 = r[0]; f.to0 = r[1]; } draw(document.getElementById('screen'), App._dcScope); },
    dcShift(n) { const f = filt(); shift(f, +n); draw(document.getElementById('screen'), App._dcScope); },
    dcNow() { filt().d = U.todayISO(); draw(document.getElementById('screen'), App._dcScope); },
    dcQuick(q) { const f = filt(); f.quick = q; f.tab = 'phieu'; draw(document.getElementById('screen'), App._dcScope); },
    dcTab(t) { filt().tab = t; draw(document.getElementById('screen'), App._dcScope); },
    async dcRemind(arg) {
      const [o, id] = arg.split('|'); const d = (App._dcScope.docs || []).find((x) => x._owner === o && x.id === id); if (!d) return;
      if (await F().remind(o, d)) App.toast('Đã nhắc ' + d._ownerName + ' hoàn ứng ' + d.soPhieu, 'ok');
    },
    async dcRemindAll() {
      const late = (App._dcR ? App._dcR.tus : []).filter((x) => x.k === 'open' && x.days > 15);
      let n = 0; for (const x of late) { if (await F().remind(x.o, x.tu)) n++; }
      App.toast(n ? 'Đã gửi nhắc ' + n + ' nhân sự' : 'Hôm nay đã nhắc hết rồi', n ? 'ok' : 'err');
    },
    async dcExcel() { if (!App._dcR) return; App.toast('Đang tạo Excel…'); try { await excel(App._dcR); } catch (e) { console.error(e); App.toast('Lỗi Excel: ' + (e.message || e), 'err'); } },
    async dcWord() { if (!App._dcR) return; App.toast('Đang tạo Word…'); try { await word(App._dcR); } catch (e) { console.error(e); App.toast('Lỗi Word: ' + (e.message || e), 'err'); } },
    async dcPdf() { if (!App._dcR) return; App.toast('Đang tạo PDF…'); const b = await pdf(App._dcR); if (b) { U.saveBlob(b, fileBase(App._dcR) + '.pdf'); App.toast('Đã tạo PDF', 'ok'); } },
    dcShare() {
      const R = App._dcR; if (!R) return;
      App.PDF.shareSheet('Đối chiếu ' + R.f.label, [
        { label: 'PDF báo cáo đối chiếu', ic: 'pdf', make: async () => ({ blob: await pdf(R), name: fileBase(R) + '.pdf' }) },
        { label: 'Word báo cáo đối chiếu', ic: 'word', make: async () => ({ blob: await word(R, true), name: fileBase(R) + '.docx' }) },
        { label: 'Excel (đủ các sổ)', ic: 'excel', make: async () => ({ blob: await excel(R, true), name: fileBase(R) + '.xlsx' }) },
      ], 'Báo cáo đối chiếu tạm ứng – hoàn ứng – thanh toán ' + R.f.label);
    },
  });
})();
