/* =========================================================================
   screen-refund.js — Hoàn ứng (Bảng thống kê + Giấy đề nghị thanh toán) &
   tab Thanh toán riêng. Tự tính số dư, sinh Word kèm ảnh, xuất Excel.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui;
  const money = (n) => U.groupThousand(n) + ' đ';

  function settleOf(ev) {
    return App.computeEvent(ev, App.view.advance, App.view.expenses || [], App.view.images || []);
  }
  function ndThanhToan(ev, m) {
    return 'Hoàn ứng chi phí ' + ev.name + ' (đã tạm ứng ' + U.groupThousand(m.advanceTotal) +
      ' đ; thực chi ' + U.groupThousand(m.spentTotal) + ' đ; số dư tạm ứng kỳ trước: ' + U.groupThousand(m.prevBalance) + ' đ).';
  }
  function proofImages() { return (App.view.images || []).filter((i) => i.expenseId && i.kind === 'image'); }

  async function saveEvent(patch) {
    const ev = App.currentEvent(); Object.assign(ev, patch);
    await DB.put('events', ev);
  }

  /* ----------------------- HOÀN ỨNG ----------------------- */
  App.screens.refund = function (root) {
    const ev = App.currentEvent();
    if (!ev) { root.innerHTML = App.noEvent(); return; }
    const exps = App.view.expenses || [];
    const m = settleOf(ev);

    const rows = exps.length ? exps.map((e, i) =>
      '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(U.fmtDayMonth(e.date)) + '</td><td>' + esc(e.content) +
      '</td><td class="num">' + money(e.amount) + '</td></tr>').join('')
      : '<tr><td colspan="4" class="muted center">Chưa có khoản chi</td></tr>';

    root.innerHTML =
      '<div class="screen-title">Hoàn ứng</div>' +
      '<div class="screen-sub">' + esc(ev.name) + '</div>' +

      '<div class="card">' +
      '<div class="row2">' +
      ui.money('rf-prev', 'Số dư tạm ứng kỳ trước', m.prevBalance, { cb: 'rfCalc' }) +
      ui.text('rf-so', 'Số (BK hoàn ứng)', ev.soBKHU || '', { ph: '…/2026/BKHU-LTL' }) +
      '</div>' +
      ui.textarea('rf-diff', 'Hình thức xử lý số chênh lệch', ev.diffHandling || 'Không nộp lại và sẽ trừ vào đợt tạm ứng tiếp theo', { rows: 2 }) +
      '<button class="btn btn-line btn-sm" data-act="rfSave" style="margin-top:4px">Lưu thông tin</button>' +
      '</div>' +

      '<div class="section-label">Bảng thống kê chi phí hoàn ứng</div>' +
      '<div class="card"><table class="tbl"><thead><tr><th class="num">TT</th><th>Ngày</th><th>Nội dung</th><th class="num">Số tiền</th></tr></thead>' +
      '<tbody>' + rows +
      '<tr class="total"><td colspan="3">TỔNG TIỀN CHI</td><td class="num" id="rf-spent">' + money(m.spentTotal) + '</td></tr>' +
      '</tbody></table>' +
      '<div class="kv"><div class="k">Số tiền đã tạm ứng</div><div class="v">' + money(m.advanceTotal) + '</div></div>' +
      '<div class="kv"><div class="k">Số dư tạm ứng kỳ trước</div><div class="v" id="rf-prevv">' + money(m.prevBalance) + '</div></div>' +
      '<div class="kv big"><div class="k">Số tiền tạm ứng còn dư</div><div class="v ' + (m.remaining >= 0 ? 'pos' : 'neg') + '" id="rf-remain">' + money(m.remaining) + '</div></div>' +
      '<div class="hint words" id="rf-remain-w">' + U.docSoCau(Math.abs(m.remaining)) + '</div>' +
      '</div>' +

      '<div class="note-banner"><span class="nb-ic">🧾</span><div>Hoá đơn VAT: <b>' + m.pctVatAmount + '%</b> giá trị (' + money(m.vatAmount) + ' · ' + m.vatCount + '/' + m.count + ' khoản) · ' +
      'Hoá đơn bill: <b>' + m.pctBillAmount + '%</b> giá trị (' + money(m.billAmount) + ') · Có ảnh minh chứng: <b>' + m.withImagesCount + '/' + m.count + '</b>. ' +
      'Ảnh minh chứng sẽ được chèn vào cuối Bảng thống kê.</div></div>' +

      '<div class="section-label">Xuất hồ sơ hoàn ứng</div>' +
      '<button class="btn btn-primary" data-act="genPdfHoanUng">Hồ sơ hoàn ứng đầy đủ (PDF: đề nghị + bảng kê + ảnh)</button>' +
      '<div class="btn-row mt8">' +
      '<button class="btn btn-soft" data-act="genBangThongKe">Bảng kê + ảnh (Word)</button>' +
      '<button class="btn btn-line" data-act="genExcel">Xuất Excel</button></div>' +
      '<div class="btn-row mt8">' +
      '<button class="btn btn-line" data-act="genThanhToan">Giấy đề nghị thanh toán (Word)</button></div>' +

      App.renderAttachments(App.view.images, 'hoanung', 'File hoàn ứng đính kèm') +
      '<div style="height:6px"></div>';
  };

  App.inputCb.rfCalc = function () {
    const ev = App.currentEvent(); const m = settleOf(ev);
    const prev = App.valMoney('rf-prev');
    const remain = m.advanceTotal + prev - m.spentTotal;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('rf-prevv', money(prev));
    const r = document.getElementById('rf-remain'); if (r) { r.textContent = money(remain); r.className = 'v ' + (remain >= 0 ? 'pos' : 'neg'); }
    set('rf-remain-w', U.docSoCau(Math.abs(remain)));
  };

  /* ----------------------- THANH TOÁN ----------------------- */
  App.screens.payment = function (root) {
    const ev = App.currentEvent();
    if (!ev) { root.innerHTML = App.noEvent(); return; }
    const m = settleOf(ev);
    const owed = m.remaining < 0;
    const payAmt = Math.abs(m.remaining);

    root.innerHTML =
      '<div class="screen-title">Giấy đề nghị thanh toán</div>' +
      '<div class="screen-sub">' + esc(ev.name) + ' · tách riêng với hoàn ứng</div>' +

      '<div class="card">' +
      ui.text('pm-so', 'Số phiếu (ĐNTT)', ev.soDNTT || '', { ph: '…/2026/ĐNTT-LTL' }) +
      ui.text('pm-req', 'Người đề nghị', ev.requester || App.settings.requester) +
      '<div class="row2">' + ui.text('pm-dept', 'Bộ phận', ev.dept || App.settings.dept) + ui.text('pm-pos', 'Chức vụ', ev.position || App.settings.position) + '</div>' +
      ui.textarea('pm-nd', 'Nội dung thanh toán', ev.ndThanhToan || ndThanhToan(ev, m), { rows: 3 }) +
      '</div>' +

      '<div class="card">' +
      '<div class="kv"><div class="k">Đã tạm ứng</div><div class="v">' + money(m.advanceTotal) + '</div></div>' +
      '<div class="kv"><div class="k">Thực chi</div><div class="v">' + money(m.spentTotal) + '</div></div>' +
      '<div class="kv"><div class="k">Dư kỳ trước</div><div class="v">' + money(m.prevBalance) + '</div></div>' +
      '<div class="kv big"><div class="k">' + (owed ? 'Đề nghị thanh toán thêm' : 'Tạm ứng còn dư') + '</div>' +
      '<div class="v ' + (owed ? 'neg' : 'pos') + '">' + money(payAmt) + '</div></div>' +
      '<div class="hint words">' + U.docSoCau(payAmt) + '</div>' +
      '</div>' +

      '<button class="btn btn-primary" data-act="genPdfThanhToan">Hồ sơ thanh toán đầy đủ (PDF: đề nghị + bảng kê + ảnh)</button>' +
      '<div class="btn-row mt8">' +
      '<button class="btn btn-soft" data-act="genThanhToan">Giấy đề nghị (Word)</button>' +
      '<button class="btn btn-line" data-act="genExcel">Xuất Excel</button></div>' +

      App.renderAttachments(App.view.images, 'thanhtoan', 'File đề nghị thanh toán đính kèm') +
      '<div style="height:6px"></div>';
  };

  /* ----------------------- Actions ----------------------- */
  function gather() {
    const ev = App.currentEvent();
    const m = settleOf(ev);
    return { event: ev, ev, m, settings: App.settings, expenses: App.view.expenses || [], images: proofImages(), advance: App.view.advance };
  }

  Object.assign(App.actions, {
    async rfSave() {
      await saveEvent({ prevBalance: App.valMoney('rf-prev'), soBKHU: App.val('rf-so'), diffHandling: App.val('rf-diff') });
      App.toast('Đã lưu', 'ok'); App.reload();
    },
    async genBangThongKe() {
      await saveEvent({ prevBalance: App.valMoney('rf-prev'), soBKHU: App.val('rf-so'), diffHandling: App.val('rf-diff') });
      const g = gather();
      App.toast('Đang tạo Word (kèm ' + g.images.length + ' ảnh)…');
      try { await App.Docgen.bangThongKe(g); } catch (e) { App.toast('Lỗi: ' + e.message, 'err'); }
    },
    async genPdfHoanUng() {
      if (document.getElementById('rf-prev')) await saveEvent({ prevBalance: App.valMoney('rf-prev'), soBKHU: App.val('rf-so'), diffHandling: App.val('rf-diff') });
      const g = gather();
      App.toast('Đang tạo PDF (kèm ' + g.images.length + ' ảnh)…');
      try { await App.Pdfgen.hoanUng(g); App.toast('Đã tạo PDF hồ sơ hoàn ứng', 'ok'); } catch (e) { App.toast('Lỗi PDF: ' + e.message, 'err'); }
    },
    async genPdfThanhToan() {
      const ev = App.currentEvent();
      const patch = {};
      if (document.getElementById('pm-so')) { patch.soDNTT = App.val('pm-so'); patch.ndThanhToan = App.val('pm-nd'); patch.requester = App.val('pm-req'); patch.dept = App.val('pm-dept'); patch.position = App.val('pm-pos'); }
      if (document.getElementById('rf-prev')) patch.prevBalance = App.valMoney('rf-prev');
      await saveEvent(patch);
      const g = gather();
      App.toast('Đang tạo PDF (kèm ' + g.images.length + ' ảnh)…');
      try { await App.Pdfgen.thanhToan(g); App.toast('Đã tạo PDF đề nghị thanh toán', 'ok'); } catch (e) { App.toast('Lỗi PDF: ' + e.message, 'err'); }
    },
    async genThanhToan() {
      const ev = App.currentEvent();
      const patch = {};
      if (document.getElementById('pm-so')) { patch.soDNTT = App.val('pm-so'); patch.ndThanhToan = App.val('pm-nd'); patch.requester = App.val('pm-req'); patch.dept = App.val('pm-dept'); patch.position = App.val('pm-pos'); }
      if (document.getElementById('rf-prev')) patch.prevBalance = App.valMoney('rf-prev');
      await saveEvent(patch);
      const g = gather();
      App.toast('Đang tạo Word…');
      try { await App.Docgen.thanhToan(g); } catch (e) { App.toast('Lỗi: ' + e.message, 'err'); }
    },
    async genExcel() {
      if (document.getElementById('rf-prev')) await saveEvent({ prevBalance: App.valMoney('rf-prev') });
      const g = gather();
      App.toast('Đang tạo Excel…');
      try { await App.Docgen.excel(g); } catch (e) { App.toast('Lỗi: ' + e.message, 'err'); }
    },
  });
})();
