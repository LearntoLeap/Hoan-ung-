/* =========================================================================
   screen-dashboard.js — Tổng quan kiểu "soft dashboard":
   4 thẻ số liệu · thẻ chào + thẻ tối · cột nền tối + đường gradient ·
   bảng phiếu gần đây có thanh tiến độ · dòng thời gian hoạt động.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const STATUS_PCT = { nhap: 15, 'da-gui': 45, 'da-duyet': 75, 'da-chi': 100, 'tu-choi': 100 };
  const TYPE_G = { TU: 'g-pp', HU: 'g-bl', TT: 'g-or' };
  const monthKey = (iso) => String(iso || '').slice(0, 7);
  const pctTxt = (a, b) => { if (!b) return a ? '<span class="up">mới</span>' : ''; const p = Math.round((a - b) / b * 100); return '<span class="' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '+' : '') + p + '%</span>'; };

  App.screens.dashboard = function (root) {
    const D = App.Docs, s = App.settings;
    const docs = App.data.docs, exps = App.data.expenses;
    const now = new Date(), cm = U.todayISO().slice(0, 7);
    const pm = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
    const sumDocs = (type, m) => docs.filter((d) => d.type === type && (!m || monthKey(d.ngayLap) === m)).reduce((a, d) => a + D.total(d), 0);
    const sumExp = (m) => exps.filter((e) => !m || monthKey(e.date) === m).reduce((a, e) => a + U.toNumber(e.amount), 0);
    const spent = sumExp(), vat = exps.filter((e) => App.vatTypeOf(e) === 'vat').reduce((a, e) => a + U.toNumber(e.amount), 0);
    const pending = docs.filter((d) => ['nhap', 'da-gui', 'tu-choi'].includes(d.status || 'nhap'));
    const settled = new Set(docs.filter((d) => d.type === 'HU' && d.tuDocId).map((d) => d.tuDocId));
    const openTU = docs.filter((d) => d.type === 'TU' && !settled.has(d.id));
    const byExp = App.imagesByExpense();
    const noProof = exps.filter((e) => !(byExp[e.id] || []).length).length;
    const pv = spent ? Math.round(vat / spent * 100) : 0;

    const kpi = (href, ic, label, value, delta) => '<a class="kpi" href="' + href + '"><div class="kb"><div class="l">' + esc(label) + '</div><div class="v">' + value + ' <small>' + (delta || '') + '</small></div></div><span class="ki">' + I(ic) + '</span></a>';
    const tuM = sumDocs('TU', cm), tuP = sumDocs('TU', pm), exM = sumExp(cm), exP = sumExp(pm), huttM = sumDocs('HU', cm) + sumDocs('TT', cm), huttP = sumDocs('HU', pm) + sumDocs('TT', pm);

    // ---- bảng phiếu gần đây
    const rows = docs.slice(0, 7).map((d) => {
      const st = D.statusOf(d.status), p = STATUS_PCT[d.status || 'nhap'];
      const who = Array.from(new Set(D.filledItems(d).map((it) => (it.nguoiThamGia || '').split(/[,;]/)[0].trim()).filter(Boolean))).slice(0, 4);
      const cols = ['g-pp', 'g-bl', 'g-or', 'g-gr'];
      return '<tr class="click" data-href="#/phieu/' + d.id + '"><td data-l="Phiếu"><div class="row" style="flex-wrap:nowrap;gap:12px"><span class="' + TYPE_G[d.type] + '" style="width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:#fff;flex:none;box-shadow:var(--bong-ic)">' + I(D.TYPES[d.type].ic, 15) + '</span>' +
        '<span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px">' + esc(d.noiDung || D.TYPES[d.type].label) + '</b><span class="sub">' + esc(d.soPhieu) + '</span></span></div></td>' +
        '<td data-l="Người" class="hide-m"><div class="av-stack">' + (who.length ? who.map((w, i) => '<span class="' + cols[i % 4] + '" title="' + esc(w) + '">' + esc(w.charAt(0).toUpperCase()) + '</span>').join('') : '<span class="g-dk">' + esc((d.nguoiDeNghi || '?').trim().split(/\s+/).pop().charAt(0)) + '</span>') + '</div></td>' +
        '<td class="num b" data-l="Số tiền">' + money(D.total(d)) + '</td>' +
        '<td data-l="Tiến độ"><div class="mini-bar"><b>' + (d.status === 'tu-choi' ? 'Trả lại' : p + '%') + ' · <span class="muted" style="font-weight:600">' + st.t + '</span></b><div class="progress lg ' + (d.status === 'tu-choi' ? 'danger' : p === 100 ? 'ok' : 'info') + '"><span style="width:' + p + '%"></span></div></div></td></tr>';
    }).join('');

    // ---- dòng thời gian hoạt động
    const acts = [];
    docs.forEach((d) => acts.push({ t: d.updatedAt || d.createdAt, ic: D.TYPES[d.type].ic, c: d.type === 'TU' ? 'c-pp' : d.type === 'HU' ? 'c-bl' : 'c-or', b: D.TYPES[d.type].label + ' ' + U.groupThousand(D.total(d)) + ' đ — ' + (d.soPhieu || ''), href: '#/phieu/' + d.id }));
    exps.forEach((e) => acts.push({ t: e.updatedAt || e.createdAt, ic: 'receipt', c: App.vatTypeOf(e) === 'vat' ? 'c-gr' : 'c-dk', b: (e.content || 'Khoản chi') + ' · ' + U.groupThousand(e.amount) + ' đ', href: '#/chi-tieu/' + e.eventId }));
    App.data.events.forEach((e) => acts.push({ t: e.createdAt, ic: 'calendar', c: 'c-rd', b: 'Sự kiện: ' + e.name, href: '#/chi-tieu/' + e.id }));
    acts.sort((a, b) => String(b.t || '').localeCompare(String(a.t || '')));
    const tl = acts.slice(0, 7).map((a) => '<a class="tl" href="' + a.href + '"><span class="td ' + a.c + '">' + I(a.ic) + '</span><span style="min-width:0"><b>' + esc(a.b) + '</b><small>' + esc(a.t ? U.fmtDateTime(a.t) : '') + '</small></span></a>').join('');

    root.innerHTML =
      (!s.hoTen || !s.soTK ? '<div class="alert warn" style="margin-bottom:20px">' + I('alert') + '<div><b>Hoàn thiện hồ sơ cá nhân</b> (họ tên, bộ phận, số tài khoản) để phiếu được điền sẵn. <a href="#/ca-nhan">Mở hồ sơ →</a></div></div>' : '') +
      '<div class="kpis k4">' +
      kpi('#/tam-ung', 'file', 'Tạm ứng tháng này', money(tuM), pctTxt(tuM, tuP)) +
      kpi('#/chi-tieu', 'receipt', 'Thực chi tháng này', money(exM), pctTxt(exM, exP)) +
      kpi('#/hoan-ung', 'wallet', 'Hoàn ứng + thanh toán', money(huttM), pctTxt(huttM, huttP)) +
      kpi('#/thanh-toan', 'alert', 'Phiếu chờ xử lý', String(pending.length), openTU.length ? '<span class="down">' + openTU.length + ' TU treo</span>' : '<span class="up">ổn</span>') +
      '</div>' +

      '<div class="grid g-75 mt24">' +
      '<div class="card"><div class="welcome"><div class="wt"><small>Learn to Leap · mẫu ' + esc(s.mauSo) + '</small><h2>Xin chào, ' + esc(s.hoTen || 'bạn') + '</h2>' +
      '<p>Lập phiếu tạm ứng, hoàn ứng, thanh toán đúng mẫu công ty — số phiếu và số tiền bằng chữ tự điền, xuất Word / Excel trong một chạm.</p>' +
      '<div class="row" style="margin-bottom:14px"><a class="btn sm" href="#/phieu/moi/TU">' + I('plus') + 'Tạm ứng</a><a class="btn sm out" href="#/phieu/moi/HU">Hoàn ứng</a><a class="btn sm out" href="#/phieu/moi/TT">Thanh toán</a></div>' +
      '<a class="link-more" href="#/chi-tieu">Ghi khoản chi ' + I('right', 15) + '</a></div>' +
      '<div class="art">' + App.waves({ seed: 3, colors: ['#ffffff'], op: 0.45, n: 22 }) + App.docArt() + '</div></div></div>' +
      '<div class="card" style="padding:16px"><div class="dark-card" style="height:100%">' + App.waves({ seed: 7, colors: ['#ff4fa3', '#9d6bff', '#4fc3ff'], op: 0.5, n: 24 }) +
      '<h3>Báo cáo tổng hợp</h3><p>Toàn bộ khoản chi và phiếu của bạn trong một file Excel / Word có logo — sẵn sàng nộp kế toán.</p>' +
      '<div class="row" style="gap:18px;margin-bottom:14px"><div><div style="font-size:22px;font-weight:700">' + exps.length + '</div><small style="opacity:.75">khoản chi</small></div><div><div style="font-size:22px;font-weight:700">' + docs.length + '</div><small style="opacity:.75">phiếu</small></div><div><div style="font-size:22px;font-weight:700">' + pv + '%</div><small style="opacity:.75">có HĐ VAT</small></div></div>' +
      '<a class="link-more" href="#/bao-cao">Xuất báo cáo ' + I('right', 15) + '</a></div></div>' +
      '</div>' +

      '<div class="grid g-57 mt24">' +
      '<div class="card"><div class="card-b" style="padding-top:16px"><div class="bars-card"><canvas id="ch-bars" aria-label="Chi theo tháng"></canvas></div>' +
      '<h3 style="font-size:16px;margin:18px 0 0">Chi tiêu 8 tháng gần nhất</h3><div class="muted" style="font-size:13px">(' + pctTxt(exM, exP) + ') so với tháng trước</div>' +
      '<div class="stat4">' +
      stat('g-pp', 'receipt', 'Khoản chi', exps.length, 100) +
      stat('g-bl', 'check', 'Có HĐ VAT', pv + '%', pv) +
      stat('g-or', 'image', 'Thiếu ảnh', noProof, exps.length ? Math.round(noProof / exps.length * 100) : 0) +
      stat('g-rd', 'calendar', 'Sự kiện', App.data.events.length, Math.min(100, App.data.events.length * 10)) +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Tổng quan theo tháng</h3><div class="muted" style="font-size:13px;margin-top:2px">' + I('right', 12).replace('class="ico"', 'class="ico" style="display:inline;transform:rotate(-90deg);color:#82d616;vertical-align:-1px"') + ' <b>' + pctTxt(exM, exP) + '</b> thực chi tháng này</div></div></div>' +
      '<div class="card-b"><div class="chart-wrap"><canvas id="ch-line" aria-label="Tạm ứng và thực chi theo tháng"></canvas></div></div></div>' +
      '</div>' +

      '<div class="grid g-84 mt24">' +
      '<div class="card"><div class="card-h"><div><h3>Phiếu gần đây</h3><div class="muted" style="font-size:13px;margin-top:2px">' + I('check', 13).replace('class="ico"', 'class="ico" style="display:inline;color:#17c1e8;vertical-align:-2px"') + ' <b>' + docs.filter((d) => d.status === 'da-chi').length + ' đã chi</b> / ' + docs.length + ' phiếu</div></div>' +
      '<a class="btn sm out" href="#/thanh-toan">Xem tất cả</a></div><div class="card-b flush">' +
      (rows ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Phiếu</th><th class="hide-m">Người tham gia</th><th class="num">Số tiền</th><th>Tiến độ</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : App.emptyState('file', 'Chưa có phiếu nào', 'Lập phiếu đầu tiên theo mẫu công ty.', '<a class="btn" href="#/phieu/moi/TU">' + I('plus') + 'Lập phiếu tạm ứng</a>')) + '</div></div>' +
      '<div class="card"><div class="card-h"><div><h3>Hoạt động gần đây</h3><div class="muted" style="font-size:13px;margin-top:2px"><b class="up">' + acts.filter((a) => monthKey(a.t) === cm).length + '</b> thay đổi tháng này</div></div></div>' +
      '<div class="card-b">' + (tl ? '<div class="timeline">' + tl + '</div>' : '<p class="muted">Chưa có hoạt động.</p>') + '</div></div>' +
      '</div>';

    buildCharts();
  };

  function stat(g, ic, label, value, pct) {
    return '<div><div class="si"><i class="' + g + '">' + I(ic) + '</i>' + esc(label) + '</div><div class="sv">' + value + '</div>' +
      '<div class="progress dark"><span style="width:' + Math.max(4, Math.min(100, pct)) + '%"></span></div></div>';
  }

  function buildCharts() {
    const D = App.Docs, docs = App.data.docs, exps = App.data.expenses;
    App.ensureLib('chart').then((Chart) => {
      if (!document.getElementById('ch-bars')) return;
      const g1 = css('--g1') || '#7928ca', g2 = css('--g2') || '#ff0080';
      const dark = App.isDark();
      Chart.defaults.font.family = '"Open Sans", Inter, system-ui, sans-serif';
      Chart.defaults.font.size = 11;
      Chart.defaults.maintainAspectRatio = false;
      const axis = dark ? '#8b93a7' : '#b2b9bf';
      const fmtAxis = (v) => v >= 1e6 ? (v / 1e6).toLocaleString('vi-VN') + 'tr' : v >= 1e3 ? (v / 1e3) + 'k' : v;
      const tip = { backgroundColor: '#1d2238', padding: 10, cornerRadius: 8, callbacks: { label: (x) => ' ' + x.dataset.label + ': ' + U.groupThousand(x.raw) + ' đ' } };
      const months = []; const d0 = new Date(); d0.setDate(1);
      for (let i = 7; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
      const spentBy = months.map((m) => exps.filter((e) => monthKey(e.date) === m).reduce((a, e) => a + U.toNumber(e.amount), 0));
      const tuBy = months.map((m) => docs.filter((d) => d.type === 'TU' && monthKey(d.ngayLap) === m).reduce((a, d) => a + D.total(d), 0));
      const labels = months.map((m) => 'Th' + parseInt(m.slice(5), 10));

      // cột trắng mảnh trên nền tối
      App.charts.bars = new Chart(document.getElementById('ch-bars'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Thực chi', data: spentBy, backgroundColor: '#fff', borderRadius: 4, borderSkipped: false, barThickness: 6, maxBarThickness: 8 }] },
        options: { plugins: { legend: { display: false }, tooltip: tip }, animation: { duration: 1100, easing: 'easeOutQuart', delay: (c) => c.dataIndex * 70 },
          scales: { y: { grid: { display: false, drawBorder: false }, border: { display: false }, ticks: { color: '#fff', callback: fmtAxis, maxTicksLimit: 4, padding: 8 } },
            x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,.6)' } } } },
      });

      // 2 đường cong có nền gradient
      const el = document.getElementById('ch-line');
      const ctx = el.getContext('2d');
      const grad = (c) => { const g = ctx.createLinearGradient(0, 230, 0, 30); g.addColorStop(1, c + '33'); g.addColorStop(0.2, c + '05'); g.addColorStop(0, c + '00'); return g; };
      App.charts.line = new Chart(el, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Tạm ứng', data: tuBy, borderColor: g2, backgroundColor: grad(g2), borderWidth: 3, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: g2 },
          { label: 'Thực chi', data: spentBy, borderColor: dark ? '#9aa5c9' : '#3a416f', backgroundColor: grad(dark ? '#9aa5c9' : '#3a416f'), borderWidth: 3, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 6 },
        ] },
        options: { interaction: { intersect: false, mode: 'index' }, animation: { duration: 1400, easing: 'easeOutQuart' },
          plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, color: axis } }, tooltip: tip },
          scales: { y: { grid: { color: dark ? 'rgba(255,255,255,.06)' : '#eef0f3', borderDash: [5, 5] }, border: { display: false }, ticks: { color: axis, callback: fmtAxis, padding: 10 } },
            x: { grid: { display: false }, border: { display: false }, ticks: { color: axis, padding: 10 } } } },
      });
      void g1;
    }).catch(() => {});
  }
})();
