/* =========================================================================
   my-report.js — Báo cáo TỐI GIẢN cho nhân sự: các khoản đã chi, nhóm theo
   sự kiện / loại chi / tháng, trong kỳ tháng hoặc năm.
   Kế toán / quản trị vẫn dùng báo cáo đầy đủ như cũ.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const full = App.screens['bao-cao'];
  const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const P = [['thang', 'Tháng này'], ['prev', 'Tháng trước'], ['nam', 'Năm nay'], ['namtruoc', 'Năm trước'], ['all', 'Tất cả']];
  const G = [['ev', 'Theo sự kiện', 'calendar'], ['cat', 'Theo loại chi', 'list'], ['thang', 'Theo tháng', 'clock']];
  function range(p) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    if (p === 'thang') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0)), 'Tháng ' + (m + 1) + '/' + y];
    if (p === 'prev') { const a = new Date(y, m - 1, 1); return [iso(a), iso(new Date(y, m, 0)), 'Tháng ' + (a.getMonth() + 1) + '/' + a.getFullYear()]; }
    if (p === 'nam') return [y + '-01-01', y + '-12-31', 'Năm ' + y];
    if (p === 'namtruoc') return [(y - 1) + '-01-01', (y - 1) + '-12-31', 'Năm ' + (y - 1)];
    return ['', '', 'Tất cả thời gian'];
  }
  const st = () => App.myRep || (App.myRep = { p: 'thang', g: 'ev' });
  function data() {
    const s = st(), [a, b, label] = range(s.p);
    const l = App.data.expenses.filter((e) => { const x = String(e.date || ''); return (!a || x >= a) && (!b || x <= b); })
      .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    const key = (e) => s.g === 'ev' ? ((App.eventById(e.eventId) || {}).name || '(Không gắn sự kiện)')
      : s.g === 'cat' ? (e.category || 'Khác') : String(e.date || '').slice(0, 7);
    const groups = {};
    l.forEach((e) => { const k = key(e); (groups[k] = groups[k] || { k, list: [], sum: 0 }).list.push(e); groups[k].sum += U.toNumber(e.amount); });
    let gs = Object.values(groups);
    gs = s.g === 'thang' ? gs.sort((x, y) => y.k.localeCompare(x.k)) : gs.sort((x, y) => y.sum - x.sum);
    gs.forEach((g) => { g.label = s.g === 'thang' ? (g.k ? U.monthLabel(g.k) : '(Không có ngày)') : g.k; });
    return { s, label, l, gs, sum: l.reduce((t, e) => t + U.toNumber(e.amount), 0) };
  }

  App.screens['bao-cao'] = function (root, route) {
    if (App.Flow && App.Flow.isAcc()) return full(root, route);   // kế toán / quản trị: báo cáo đầy đủ
    const r = data(), s = r.s;
    const sub = s.g === 'ev' ? (e) => esc(e.category || 'Khác') : (e) => esc((App.eventById(e.eventId) || {}).name || '');
    const body = r.gs.map((g) => {
      const pct = r.sum ? Math.round(g.sum / r.sum * 100) : 0;
      return '<tbody class="myrep-g"><tr class="myrep-gh"><td colspan="2"><b>' + esc(g.label) + '</b><span class="sub">' + g.list.length + ' khoản · ' + pct + '%</span>' +
        '<div class="progress mt4"><span style="width:' + pct + '%"></span></div></td><td class="num"><b>' + money(g.sum) + '</b></td></tr>' +
        g.list.map((e) => '<tr><td data-l="Ngày" class="nowrap">' + esc(U.fmtDate(e.date)) + '</td><td data-l="Khoản chi">' + esc(e.content || '') + '<span class="sub">' + sub(e) + '</span></td><td class="num" data-l="Số tiền">' + money(e.amount) + '</td></tr>').join('') + '</tbody>';
    }).join('');
    root.innerHTML = App.pageHead('Khoản chi của tôi', r.label,
      r.l.length ? '<button class="btn out" data-act="myRepExcel">' + I('excel') + 'Xuất Excel</button>' : '') +
      '<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<div class="seg scroll">' + P.map((x) => '<button class="' + (s.p === x[0] ? 'on' : '') + '" data-act="myRepP:' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="seg scroll">' + G.map((x) => '<button class="' + (s.g === x[0] ? 'on' : '') + '" data-act="myRepG:' + x[0] + '">' + I(x[2], 14) + ' ' + x[1] + '</button>').join('') + '</div></div>' +
      '<div class="card"><div class="card-b myrep-total"><span>Đã chi</span><b>' + money(r.sum) + '</b><small>' + r.l.length + ' khoản chi · ' + r.gs.length + ' ' + (s.g === 'ev' ? 'sự kiện' : s.g === 'cat' ? 'loại chi' : 'tháng') + '</small></div></div>' +
      '<div class="card mt16">' + (r.l.length
        ? '<div class="tbl-wrap"><table class="tbl cards myrep"><thead><tr><th>Ngày</th><th>Khoản chi</th><th class="num">Số tiền</th></tr></thead>' + body +
          '<tfoot><tr><td colspan="2">Cộng</td><td class="num">' + money(r.sum) + '</td></tr></tfoot></table></div>'
        : App.emptyState('receipt', 'Chưa có khoản chi trong kỳ này', 'Ghi khoản chi ở mục Chi tiêu.', '<a class="btn" href="#/chi-tieu">' + I('plus') + 'Ghi khoản chi</a>')) + '</div>';
  };

  Object.assign(App.actions, {
    myRepP(p) { st().p = p; App.render(); },
    myRepG(g) { st().g = g; App.render(); },
    async myRepExcel() {
      const r = data(), gName = (G.find((x) => x[0] === r.s.g) || [])[1] || '';
      const E = await App.ensureLib('exceljs'), wb = new E.Workbook(), ws = wb.addWorksheet('Khoản chi');
      ws.columns = [{ width: 12 }, { width: 46 }, { width: 26 }, { width: 16 }];
      ws.addRow(['KHOẢN CHI CỦA ' + String((App.settings || {}).hoTen || '').toUpperCase() + ' · ' + r.label.toUpperCase() + ' · ' + gName.toUpperCase()]).font = { bold: true, size: 13, color: { argb: 'FF6B3DBE' } };
      ws.addRow([]);
      const h = ws.addRow(['Ngày', 'Khoản chi', r.s.g === 'ev' ? 'Loại chi' : 'Sự kiện', 'Số tiền']);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B3DBE' } }; });
      r.gs.forEach((g) => {
        const gr = ws.addRow(['', g.label + ' (' + g.list.length + ' khoản)', '', g.sum]);
        gr.font = { bold: true }; gr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E0F7' } }; });
        g.list.forEach((e) => ws.addRow([App.Export._isoToDate(e.date), e.content || '', r.s.g === 'ev' ? (e.category || 'Khác') : ((App.eventById(e.eventId) || {}).name || ''), U.toNumber(e.amount)]));
      });
      const t = ws.addRow(['', 'CỘNG', '', r.sum]); t.font = { bold: true };
      ws.getColumn(1).numFmt = 'dd/mm/yyyy'; ws.getColumn(4).numFmt = '#,##0';
      U.saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        U.safeName('Khoan-chi - ' + ((App.settings || {}).hoTen || '') + ' - ' + r.label + ' - ' + gName) + '.xlsx');
    },
  });
})();
