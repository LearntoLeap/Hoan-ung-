/* =========================================================================
   my-report.js — Báo cáo TỐI GIẢN cho nhân sự: chỉ biết đã chi những khoản gì,
   bao nhiêu tiền. Kế toán / quản trị vẫn dùng báo cáo đầy đủ như cũ.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const full = App.screens['bao-cao'];
  const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const P = [['thang', 'Tháng này'], ['prev', 'Tháng trước'], ['nam', 'Năm nay'], ['all', 'Tất cả']];
  function range(p) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    if (p === 'thang') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0)), 'Tháng ' + (m + 1) + '/' + y];
    if (p === 'prev') { const a = new Date(y, m - 1, 1); return [iso(a), iso(new Date(y, m, 0)), 'Tháng ' + (a.getMonth() + 1) + '/' + a.getFullYear()]; }
    if (p === 'nam') return [y + '-01-01', y + '-12-31', 'Năm ' + y];
    return ['', '', 'Tất cả'];
  }
  function rows() {
    const p = App.myRepP || 'thang', [a, b, label] = range(p);
    const l = App.data.expenses.filter((e) => { const x = String(e.date || ''); return (!a || x >= a) && (!b || x <= b); })
      .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
    return { p, label, l, sum: l.reduce((s, e) => s + U.toNumber(e.amount), 0) };
  }

  App.screens['bao-cao'] = function (root, route) {
    if (App.Flow && App.Flow.isAcc()) return full(root, route);   // kế toán / quản trị: báo cáo đầy đủ
    const r = rows();
    root.innerHTML = App.pageHead('Khoản chi của tôi', r.label,
      r.l.length ? '<button class="btn out" data-act="myRepExcel">' + I('excel') + 'Xuất Excel</button>' : '') +
      '<div class="seg" style="margin-bottom:16px">' + P.map((x) => '<button class="' + (r.p === x[0] ? 'on' : '') + '" data-act="myRepP:' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="card"><div class="card-b myrep-total"><span>Đã chi</span><b>' + money(r.sum) + '</b><small>' + r.l.length + ' khoản chi</small></div></div>' +
      '<div class="card mt16">' + (r.l.length
        ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Ngày</th><th>Khoản chi</th><th class="num">Số tiền</th></tr></thead><tbody>' +
          r.l.map((e) => '<tr><td data-l="Ngày" class="nowrap">' + esc(U.fmtDate(e.date)) + '</td><td data-l="Khoản chi">' + esc(e.content || '') + '</td><td class="num b" data-l="Số tiền">' + money(e.amount) + '</td></tr>').join('') +
          '</tbody><tfoot><tr><td colspan="2">Cộng</td><td class="num">' + money(r.sum) + '</td></tr></tfoot></table></div>'
        : App.emptyState('receipt', 'Chưa có khoản chi', 'Ghi khoản chi ở mục Chi tiêu.', '<a class="btn" href="#/chi-tieu">' + I('plus') + 'Ghi khoản chi</a>')) + '</div>';
  };

  Object.assign(App.actions, {
    myRepP(p) { App.myRepP = p; App.render(); },
    async myRepExcel() {
      const r = rows();
      const E = await App.ensureLib('exceljs'), wb = new E.Workbook(), ws = wb.addWorksheet('Khoản chi');
      ws.columns = [{ header: 'Ngày', width: 12 }, { header: 'Khoản chi', width: 46 }, { header: 'Số tiền', width: 16 }];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B3DBE' } };
      r.l.forEach((e) => ws.addRow([App.Export._isoToDate(e.date), e.content || '', U.toNumber(e.amount)]));
      const t = ws.addRow(['', 'CỘNG', r.sum]); t.font = { bold: true };
      ws.getColumn(1).numFmt = 'dd/mm/yyyy'; ws.getColumn(3).numFmt = '#,##0';
      U.saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        U.safeName('Khoan-chi - ' + ((App.settings || {}).hoTen || '') + ' - ' + r.label) + '.xlsx');
    },
  });
})();
