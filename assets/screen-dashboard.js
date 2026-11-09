/* =========================================================================
   screen-dashboard.js — Tổng quan: số liệu phiếu, khoản chi, biểu đồ, việc cần làm
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hsl = (v, a) => 'hsl(' + css(v) + (a != null ? ' / ' + a : '') + ')';

  App.screens.dashboard = function (root) {
    const D = App.Docs, s = App.settings;
    const docs = App.data.docs, exps = App.data.expenses;
    const sumT = (type) => docs.filter((d) => d.type === type).reduce((a, d) => a + D.total(d), 0);
    const spent = exps.reduce((a, e) => a + U.toNumber(e.amount), 0);
    const pending = docs.filter((d) => ['nhap', 'da-gui', 'tu-choi'].includes(d.status || 'nhap'));
    const settled = new Set(docs.filter((d) => d.type === 'HU' && d.tuDocId).map((d) => d.tuDocId));
    const openTU = docs.filter((d) => d.type === 'TU' && !settled.has(d.id));
    const hour = new Date().getHours();
    const hello = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const vat = exps.filter((e) => App.vatTypeOf(e) === 'vat').reduce((a, e) => a + U.toNumber(e.amount), 0);
    const bill = exps.filter((e) => App.vatTypeOf(e) === 'bill').reduce((a, e) => a + U.toNumber(e.amount), 0);
    const none = Math.max(0, spent - vat - bill);
    const pct = (x) => spent ? Math.round(x / spent * 100) : 0;

    const stCls = (d) => D.statusOf(d.status);
    const recent = docs.slice(0, 8).map((d) =>
      '<tr class="click" data-href="#/phieu/' + d.id + '"><td data-l="Số phiếu"><span class="badge mono primary">' + esc(d.soPhieu) + '</span></td>' +
      '<td data-l="Loại">' + esc(D.TYPES[d.type].label) + '</td>' +
      '<td data-l="Nội dung" style="min-width:180px">' + esc(d.noiDung || '—') + '<span class="sub">' + esc(d.ngayLap ? U.fmtDate(d.ngayLap) : '') + '</span></td>' +
      '<td class="num b" data-l="Số tiền">' + money(D.total(d)) + '</td><td data-l="Trạng thái"><span class="badge ' + stCls(d).cls + '">' + stCls(d).t + '</span></td></tr>').join('');

    root.innerHTML =
      '<div class="page-h"><div><h1>' + hello + ', <span class="grad-text">' + esc(s.hoTen || 'bạn') + '</span></h1>' +
      '<p>' + esc(U.fmtDate(U.todayISO())) + ' · ' + docs.length + ' phiếu · ' + App.data.events.length + ' sự kiện · ' + exps.length + ' khoản chi</p></div>' +
      '<div class="actions"><a class="btn out" href="#/phieu/moi/TU">' + I('file') + 'Phiếu tạm ứng</a><a class="btn out" href="#/phieu/moi/HU">' + I('wallet') + 'Phiếu hoàn ứng</a>' +
      '<a class="btn accent" href="#/phieu/moi/TT">' + I('plus') + 'Phiếu thanh toán</a></div></div>' +
      (!s.hoTen || !s.soTK ? '<div class="alert warn" style="margin-bottom:16px">' + I('alert') + '<div><b>Hoàn thiện hồ sơ cá nhân</b> (họ tên, bộ phận, số tài khoản) để phiếu được điền sẵn. <a href="#/ca-nhan">Mở hồ sơ →</a></div></div>' : '') +
      '<div class="kpis k5">' +
      kpiLink('#/tam-ung', 'file', 'Đã đề nghị tạm ứng', money(sumT('TU')), docs.filter((d) => d.type === 'TU').length + ' phiếu', openTU.length ? openTU.length + ' phiếu chưa hoàn ứng' : 'Đã quyết toán hết') +
      kpiLink('#/chi-tieu', 'receipt', 'Thực chi', money(spent), exps.length + ' khoản chi', 'VAT ' + pct(vat) + '% giá trị') +
      kpiLink('#/hoan-ung', 'wallet', 'Đề nghị hoàn ứng', money(sumT('HU')), docs.filter((d) => d.type === 'HU').length + ' phiếu', '') +
      kpiLink('#/thanh-toan', 'calc', 'Đề nghị thanh toán', money(sumT('TT')), docs.filter((d) => d.type === 'TT').length + ' phiếu', '') +
      kpiLink('#/tam-ung', 'alert', 'Phiếu chờ xử lý', pending.length + ' <small>phiếu</small>', 'Nháp / chờ duyệt / bị trả lại', '') +
      '</div>' +

      '<div class="grid g2 mt16">' +
      '<div class="card"><div class="card-h"><div class="t">' + I('calendar') + 'Giá trị phiếu theo tháng</div></div><div class="card-b">' +
      (docs.length ? '<div class="chart-wrap"><canvas id="ch-month" aria-label="Biểu đồ giá trị phiếu theo tháng"></canvas></div>' : App.emptyState('file', 'Chưa có phiếu', 'Biểu đồ hiện khi bạn lập phiếu đầu tiên.')) + '</div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('receipt') + 'Cơ cấu hoá đơn theo số tiền chi</div>' +
      (spent ? '<span class="badge ' + (pct(vat) >= 70 ? 'ok' : pct(vat) >= 40 ? 'warn' : 'danger') + '">' + pct(vat) + '% VAT</span>' : '') + '</div><div class="card-b">' +
      (spent ? '<div class="seg-bar">' + (vat ? '<span style="flex:' + vat + ';background:var(--viz-1)"></span>' : '') + (bill ? '<span style="flex:' + bill + ';background:var(--viz-2)"></span>' : '') +
        (none ? '<span style="flex:' + none + ';background:var(--viz-nhat)"></span>' : '') + '</div>' +
        '<div class="legend"><span><i style="background:var(--viz-1)"></i>Hoá đơn VAT ' + pct(vat) + '% · ' + money(vat) + '</span><span><i style="background:var(--viz-2)"></i>Bill ' + pct(bill) + '% · ' + money(bill) + '</span>' +
        '<span><i style="background:var(--viz-nhat)"></i>Không hoá đơn ' + pct(none) + '% · ' + money(none) + '</span></div>' +
        '<div class="chart-wrap mt12" style="height:200px"><canvas id="ch-vat" aria-label="Biểu đồ cơ cấu hoá đơn"></canvas></div>'
        : App.emptyState('receipt', 'Chưa có khoản chi', 'Ghi khoản chi ở mục Chi tiêu.', '<a class="btn sm" href="#/chi-tieu">Mở Chi tiêu</a>')) + '</div></div>' +

      '<div class="card"><div class="card-h"><div class="t">' + I('list') + 'Phiếu gần đây</div><a class="btn ghost sm" href="#/thanh-toan">Xem tất cả</a></div>' +
      '<div class="card-b flush">' + (recent ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Số phiếu</th><th>Loại</th><th>Nội dung</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>' + recent + '</tbody></table></div>'
        : App.emptyState('file', 'Chưa có phiếu nào', '', '<a class="btn sm" href="#/phieu/moi/TU">' + I('plus') + 'Lập phiếu tạm ứng</a>')) + '</div></div>' +

      '<div class="card"><div class="card-h"><div class="t">' + I('alert') + 'Tạm ứng chưa hoàn ứng</div><span class="badge ' + (openTU.length ? 'warn' : 'ok') + '">' + openTU.length + '</span></div>' +
      '<div class="card-b flush">' + (openTU.length ? '<div class="tbl-wrap"><table class="tbl cards"><tbody>' + openTU.slice(0, 8).map((d) =>
        '<tr><td data-l="Phiếu"><a href="#/phieu/' + d.id + '" class="badge mono primary">' + esc(d.soPhieu) + '</a><span class="sub">' + esc((d.noiDung || '').slice(0, 60)) + '</span></td>' +
        '<td class="num b" data-l="Số tiền">' + money(D.total(d)) + '</td><td class="acts"><a class="btn sm" href="#/phieu/moi/HU?from=' + d.id + '">' + I('wallet') + 'Lập hoàn ứng</a></td></tr>').join('') + '</tbody></table></div>'
        : App.emptyState('check', 'Không còn tạm ứng treo', 'Mọi phiếu tạm ứng đã có phiếu hoàn ứng.')) + '</div></div>' +
      '</div>';

    buildCharts();
  };

  function kpiLink(href, ic, label, value, sub, foot) {
    return '<a class="kpi" href="' + href + '" style="color:inherit"><div class="l">' + I(ic) + esc(label) + '</div><div class="v">' + value + '</div>' +
      '<div class="s">' + sub + '</div>' + (foot ? '<div class="f">' + esc(foot) + '</div>' : '') + '</a>';
  }

  function buildCharts() {
    const D = App.Docs;
    const docs = App.data.docs;
    if (!document.getElementById('ch-month') && !document.getElementById('ch-vat')) return;
    App.ensureLib('chart').then((Chart) => {
      if (!document.getElementById('screen')) return;
      const c1 = css('--viz-1'), c2 = css('--viz-2'), c3 = css('--viz-3'), grid = hsl('--vien'), txt = hsl('--chu-nhat');
      Chart.defaults.font.family = 'Inter, "Segoe UI", system-ui, sans-serif';
      Chart.defaults.font.size = 12;
      Chart.defaults.color = txt;
      Chart.defaults.borderColor = grid;
      Chart.defaults.maintainAspectRatio = false;
      const fmtAxis = (v) => v >= 1e6 ? (v / 1e6).toLocaleString('vi-VN') + 'tr' : v >= 1e3 ? (v / 1e3) + 'k' : v;
      const tip = { callbacks: { label: (x) => ' ' + x.dataset.label + ': ' + U.groupThousand(x.raw) + ' đ' } };

      const el = document.getElementById('ch-month');
      if (el) {
        const months = [];
        const d0 = new Date(); d0.setDate(1);
        for (let i = 5; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
        const by = (type) => months.map((m) => docs.filter((d) => d.type === type && String(d.ngayLap || '').slice(0, 7) === m).reduce((a, d) => a + D.total(d), 0));
        App.charts.month = new Chart(el, {
          type: 'bar',
          data: { labels: months.map(U.monthLabel), datasets: [
            { label: 'Tạm ứng', data: by('TU'), backgroundColor: c1, borderRadius: 4, maxBarThickness: 22 },
            { label: 'Hoàn ứng', data: by('HU'), backgroundColor: c2, borderRadius: 4, maxBarThickness: 22 },
            { label: 'Thanh toán', data: by('TT'), backgroundColor: c3, borderRadius: 4, maxBarThickness: 22 },
          ] },
          options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 14 } }, tooltip: tip },
            scales: { x: { grid: { display: false } }, y: { ticks: { callback: fmtAxis }, grid: { color: grid } } } },
        });
      }
      const ev = document.getElementById('ch-vat');
      if (ev) {
        const exps = App.data.events.slice(0, 8).map((e) => ({ e, list: App.expensesOf(e.id) })).filter((x) => x.list.length).reverse();
        const sum = (l, t) => l.filter((x) => App.vatTypeOf(x) === t).reduce((a, x) => a + U.toNumber(x.amount), 0);
        App.charts.vat = new Chart(ev, {
          type: 'bar',
          data: { labels: exps.map((x) => x.e.name.length > 18 ? x.e.name.slice(0, 17) + '…' : x.e.name), datasets: [
            { label: 'VAT', data: exps.map((x) => sum(x.list, 'vat')), backgroundColor: c1, stack: 's' },
            { label: 'Bill', data: exps.map((x) => sum(x.list, 'bill')), backgroundColor: c2, stack: 's' },
            { label: 'Không HĐ', data: exps.map((x) => sum(x.list, 'none')), backgroundColor: css('--viz-nhat'), stack: 's' },
          ] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: tip },
            scales: { x: { stacked: true, ticks: { callback: fmtAxis }, grid: { color: grid } }, y: { stacked: true, grid: { display: false } } } },
        });
      }
    }).catch(() => {});
  }
})();
