/* =========================================================================
   screen-dashboard.js — Tổng quan: số liệu + biểu đồ toàn bộ sự kiện
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc;

  function groupBy(arr, key) {
    const m = {}; (arr || []).forEach((x) => { const k = x[key]; if (k) (m[k] = m[k] || []).push(x); }); return m;
  }
  const money = (n) => U.groupThousand(n) + ' đ';

  App.screens.dashboard = function (root) {
    const events = App.events;
    if (!events.length) {
      root.innerHTML =
        '<div class="welcome-hero">' +
        '<div class="wh-robot wh-photo"><img src="assets/robot-cruzr.jpg" alt="Robot Cruzr · Learn to Leap" class="robot-float" decoding="async"></div>' +
        '<div class="wh-glow"></div>' +
        '<div class="wh-t">Chào mừng đến Learn to Leap</div>' +
        '<div class="wh-s">Trợ lý tạm ứng · hoàn ứng · thanh toán. Tạo sự kiện đầu tiên để bắt đầu.</div>' +
        '<button class="btn btn-primary" data-act="addEvent" style="max-width:260px;margin:14px auto 0">＋ Tạo sự kiện</button>' +
        '<button class="btn btn-ghost" data-act="helpSheet" style="max-width:260px;margin:9px auto 0">Xem hướng dẫn</button>' +
        '</div>';
      return;
    }
    const advByEv = {}; (App.view.advances || []).forEach((a) => { if (!advByEv[a.eventId]) advByEv[a.eventId] = a; });
    const expByEv = groupBy(App.view.expenses, 'eventId');
    const imgByEv = groupBy(App.view.images, 'eventId');

    let totAdv = 0, totSpent = 0, proofAmt = 0, billAmt = 0, surplus = 0, deficit = 0;
    const perEvent = events.map((ev) => {
      const m = App.computeEvent(ev, advByEv[ev.id], expByEv[ev.id] || [], imgByEv[ev.id] || []);
      totAdv += m.advanceTotal; totSpent += m.spentTotal;
      proofAmt += m.vatAmount; billAmt += m.billAmount;
      if (m.remaining >= 0) surplus++; else deficit++;
      return { ev, m };
    });
    const noneAmt = Math.max(0, totSpent - proofAmt - billAmt);
    const diff = totAdv - totSpent;
    const thisMonth = U.monthKey(U.todayISO());
    const monthSpent = (App.view.expenses || []).filter((e) => U.monthKey(e.date) === thisMonth).reduce((s, e) => s + U.toNumber(e.amount), 0);
    const pctProof = totSpent ? Math.round(proofAmt / totSpent * 100) : 0;
    const pctBill = totSpent ? Math.round(billAmt / totSpent * 100) : 0;
    const pctNone = Math.max(0, 100 - pctProof - pctBill);
    const settlePct = totAdv ? Math.min(100, Math.round(totSpent / totAdv * 100)) : 0;

    // monthly
    const byMonth = {}; (App.view.expenses || []).forEach((e) => { const k = U.monthKey(e.date); if (k) byMonth[k] = (byMonth[k] || 0) + U.toNumber(e.amount); });
    const months = Object.keys(byMonth).sort().slice(-6);

    root.innerHTML =
      '<div class="screen-title">Tổng quan</div>' +
      '<div class="screen-sub">' + events.length + ' sự kiện · cập nhật ' + esc(U.fmtDate(U.todayISO())) + '</div>' +

      '<div class="stat-grid">' +
      '<div class="stat hero"><div class="deco"></div><div class="hero-bot hero-photo"><img src="assets/robot-mini.png" alt="Robot Alpha Mini" class="robot-float" decoding="async"></div>' +
      '<div class="lab">Tổng đã tạm ứng</div>' +
      '<div class="val">' + money(totAdv) + '</div>' +
      '<div class="hero-bar"><div class="hb-track"><span style="width:' + settlePct + '%"></span></div>' +
      '<div class="hb-cap">Đã chi ' + settlePct + '% · ' + money(totSpent) + '</div></div>' +
      '</div>' +
      '<div class="stat"><div class="lab">Chênh lệch</div><div class="val ' + (diff >= 0 ? 'tone-pos' : 'tone-neg') + '">' +
      (diff >= 0 ? '' : '−') + money(Math.abs(diff)) + '</div>' +
      '<div class="stat-sub">' + surplus + ' dư · ' + deficit + ' thiếu</div></div>' +
      '<div class="stat"><div class="lab">Chi tháng này</div><div class="val">' + money(monthSpent) + '</div>' +
      '<div class="stat-sub">' + esc(U.monthLabel(thisMonth)) + '</div></div>' +
      '</div>' +

      '<div class="dash-grid mt16">' +
      '<div class="card mb0"><div class="card-h"><div class="t">Cơ cấu hoá đơn theo số tiền</div>' +
      '<span class="badge ' + (pctProof >= 70 ? 'ok' : pctProof >= 40 ? 'warn' : 'danger') + '">' + pctProof + '% VAT</span></div>' +
      '<div class="seg-bar">' +
      (proofAmt > 0 ? '<span class="seg vat" style="flex:' + proofAmt + '" title="VAT"></span>' : '') +
      (billAmt > 0 ? '<span class="seg bill" style="flex:' + billAmt + '" title="Bill"></span>' : '') +
      (noneAmt > 0 ? '<span class="seg none" style="flex:' + noneAmt + '" title="Không HĐ"></span>' : '') +
      (totSpent <= 0 ? '<span class="seg none" style="flex:1"></span>' : '') +
      '</div>' +
      '<div class="seg-legend">' +
      '<span class="lg"><i class="d vat"></i>VAT ' + pctProof + '% · ' + money(proofAmt) + '</span>' +
      '<span class="lg"><i class="d bill"></i>Bill ' + pctBill + '% · ' + money(billAmt) + '</span>' +
      '<span class="lg"><i class="d none"></i>Không ' + pctNone + '% · ' + money(noneAmt) + '</span>' +
      '</div>' +
      '<div class="chart-wrap mt12"><canvas id="ch-proof"></canvas></div></div>' +

      '<div class="card mb0"><div class="card-h"><div class="t">Chi theo tháng</div></div>' +
      (months.length ? '<div class="chart-wrap"><canvas id="ch-month"></canvas></div>' : '<p class="muted center">Chưa có dữ liệu chi.</p>') + '</div>' +

      '<div class="card mb0 span2"><div class="card-h"><div class="t">Tạm ứng vs Thực chi theo sự kiện</div></div>' +
      '<div class="chart-wrap tall"><canvas id="ch-event"></canvas></div></div>' +
      '</div>' +

      '<div class="section-label">Chi tiết theo từng sự kiện</div>' +
      '<div class="ev-detail">' +
      perEvent.map(({ ev, m }) => {
        const tone = m.remaining >= 0 ? 'ok' : 'danger';
        return '<div class="evd" data-act="gotoEvent:' + ev.id + '">' +
          '<div class="evd-h"><div class="evd-t">' + esc(ev.name) + '</div>' +
          '<span class="badge ' + tone + '">' + (m.remaining >= 0 ? 'Dư ' : 'Thiếu ') + U.groupThousand(Math.abs(m.remaining)) + '</span></div>' +
          '<div class="evd-sub">' + esc(U.fmtDate(ev.date)) + ' · ' + m.count + ' khoản chi</div>' +
          '<div class="evd-grid">' +
          '<div class="evd-cell"><div class="ec-l">Đã tạm ứng</div><div class="ec-v">' + money(m.advanceTotal) + '</div></div>' +
          '<div class="evd-cell"><div class="ec-l">Thực chi</div><div class="ec-v">' + money(m.spentTotal) + '</div></div>' +
          '<div class="evd-cell"><div class="ec-l">Còn lại</div><div class="ec-v ' + (m.remaining >= 0 ? 'pos' : 'neg') + '">' + money(m.remaining) + '</div></div>' +
          '<div class="evd-cell"><div class="ec-l">VAT theo tiền</div><div class="ec-v">' + m.pctVatAmount + '%</div></div>' +
          '</div>' +
          '<div class="evd-bar"><span style="width:' + m.pctVatAmount + '%"></span></div>' +
          '<div class="evd-foot">Giá trị có VAT ' + money(m.vatAmount) + ' · Bill ' + m.pctBillAmount + '% · Có ảnh ' + m.withImagesCount + '/' + m.count + '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div style="height:6px"></div>';

    buildCharts({ proofAmt, billAmt, noneAmt, totSpent, byMonth, months, perEvent });
  };

  function buildCharts(d) {
    App.ensureLib('chart').then((Chart) => {
      const purple = '#8a3f97', purple2 = '#e3cdea', green = '#0f9f6e', amber = '#f0a630';
      Chart.defaults.font.family = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
      Chart.defaults.font.size = 11.5;
      Chart.defaults.color = '#7a8196';
      Chart.defaults.borderColor = '#eef0f5';
      Chart.defaults.maintainAspectRatio = false;

      const c1 = document.getElementById('ch-proof');
      const hasData = (d.proofAmt + d.billAmt + d.noneAmt) > 0;
      if (c1) App.charts.proof = new Chart(c1, {
        type: 'doughnut',
        data: {
          labels: ['Hoá đơn VAT', 'Hoá đơn bill', 'Không hoá đơn'],
          datasets: [{ data: hasData ? [d.proofAmt, d.billAmt, d.noneAmt] : [0, 0, 1], backgroundColor: [purple, amber, '#f1e4ee'], borderWidth: 0, hoverOffset: 6 }],
        },
        options: { cutout: '66%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: (x) => x.label + ': ' + U.groupThousand(x.raw) + ' đ' } } } },
      });

      const c2 = document.getElementById('ch-month');
      if (c2 && d.months.length) App.charts.month = new Chart(c2, {
        type: 'bar',
        data: {
          labels: d.months.map(U.monthLabel),
          datasets: [{ label: 'Chi', data: d.months.map((m) => d.byMonth[m]), backgroundColor: purple, borderRadius: 7, maxBarThickness: 38 }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => v >= 1e6 ? (v / 1e6) + 'tr' : v / 1e3 + 'k' } } } },
      });

      const c3 = document.getElementById('ch-event');
      if (c3) App.charts.event = new Chart(c3, {
        type: 'bar',
        data: {
          labels: d.perEvent.map((p) => p.ev.name.length > 14 ? p.ev.name.slice(0, 13) + '…' : p.ev.name),
          datasets: [
            { label: 'Tạm ứng', data: d.perEvent.map((p) => p.m.advanceTotal), backgroundColor: purple2, borderRadius: 6 },
            { label: 'Thực chi', data: d.perEvent.map((p) => p.m.spentTotal), backgroundColor: purple, borderRadius: 6 },
          ],
        },
        options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { callback: (v) => v >= 1e6 ? (v / 1e6) + 'tr' : v / 1e3 + 'k' } } } },
      });
    }).catch(() => {});
  }

  Object.assign(App.actions, {
    gotoEvent(id) { App.currentEventId = id; localStorage.setItem('ltl_event', id); App.go('expenses'); },
  });
})();
