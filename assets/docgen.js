/* =========================================================================
   docgen.js — Sinh file Word (đúng mẫu LtL) & Excel.
   App.Docgen = { tamUng, thanhToan, bangThongKe, excel }
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App;
  const FONT = 'Times New Roman';
  const SZ = 26;        // 13pt
  const grp = (n) => U.groupThousand(n);
  const VATLABEL = (e) => { const t = (App.vatTypeOf ? App.vatTypeOf(e) : (e && e.vatType)); return t === 'vat' ? 'VAT' : t === 'bill' ? 'Bill' : '—'; };

  /* ---------- helpers (cần docx đã load) ---------- */
  let D;
  function R(text, o) {
    o = o || {};
    return new D.TextRun({ text: text == null ? '' : String(text), bold: !!o.b, italics: !!o.i, size: o.size || SZ, font: FONT, color: o.color, break: o.break });
  }
  function P(runs, o) {
    o = o || {};
    return new D.Paragraph({
      alignment: o.al, indent: o.indent,
      spacing: { after: o.after == null ? 60 : o.after, before: o.before || 0, line: o.line || 276 },
      children: Array.isArray(runs) ? runs : [runs],
    });
  }
  const PT = (t, o) => P([R(t, o)], o);
  const EMPTY = () => PT('', { after: 0 });
  const AL = () => D.AlignmentType;
  const NOBORDER = () => { const n = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n }; };
  const LINE = () => { const b = { style: D.BorderStyle.SINGLE, size: 4, color: '888888' }; return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b }; };

  function cell(children, o) {
    o = o || {};
    return new D.TableCell({
      width: o.w ? { size: o.w, type: D.WidthType.PERCENTAGE } : undefined,
      columnSpan: o.span, verticalAlign: D.VerticalAlign.CENTER,
      shading: o.fill ? { fill: o.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: Array.isArray(children) ? children : [children],
    });
  }
  function tcell(text, o) { o = o || {}; return cell([P([R(text, { b: o.b, i: o.i, size: o.size })], { al: o.al, after: 0 })], o); }

  function borderless(rows, widths) {
    return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, borders: NOBORDER(), columnWidths: widths, rows });
  }
  function gridTable(rows) {
    return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, borders: LINE(), rows });
  }

  function quocHieuHeader(s) {
    // trái: công ty; phải: quốc hiệu
    const left = [P([R(s.company, { b: true, size: 24 })], { al: AL().CENTER, after: 0, line: 240 }),
      P([R(s.companyAddr, { i: true, size: 20 })], { al: AL().CENTER, after: 0, line: 240 })];
    const right = [P([R('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { b: true, size: 24 })], { al: AL().CENTER, after: 0, line: 240 }),
      P([R('Độc lập – Tự do – Hạnh phúc', { b: true, size: 24 })], { al: AL().CENTER, after: 0, line: 240 }),
      P([R('───────────', { size: 20 })], { al: AL().CENTER, after: 0 })];
    return borderless([new D.TableRow({ children: [cell(left, { w: 50 }), cell(right, { w: 50 })] })], [4500, 4500]);
  }

  function signatures(cols) {
    const cells = cols.map((c) => cell([
      P([R(c.title, { b: true })], { al: AL().CENTER, after: 0 }),
      P([R('(Ký, họ tên)', { i: true })], { al: AL().CENTER, after: 0 }),
      EMPTY(), EMPTY(), EMPTY(),
      P([R(c.name, { b: true })], { al: AL().CENTER, after: 0 }),
    ], { w: Math.floor(100 / cols.length) }));
    return borderless([new D.TableRow({ children: cells })]);
  }

  function pageProps(children) {
    return {
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1418 } } },
        children,
      }],
      styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    };
  }

  async function build(children) {
    D = window.docx;
    const doc = new D.Document(pageProps(children));
    return await D.Packer.toBlob(doc);
  }

  /* ---------- ảnh ---------- */
  async function prepImage(blob, maxW) {
    let bmp;
    try { bmp = await createImageBitmap(blob); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
    }
    const w = bmp.width, h = bmp.height;
    const cap = 1500; let cw = w, ch = h;
    if (Math.max(w, h) > cap) { const r = cap / Math.max(w, h); cw = Math.round(w * r); ch = Math.round(h * r); }
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
    if (bmp.close) bmp.close();
    const jpg = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.82));
    const data = new Uint8Array(await jpg.arrayBuffer());
    const md = maxW || 440; let dw = cw, dh = ch;
    if (dw > md) { const r = md / dw; dw = md; dh = Math.round(dh * r); }
    const mh = 540; if (dh > mh) { const r = mh / dh; dh = mh; dw = Math.round(dw * r); }
    return { data, width: dw, height: dh };
  }

  /* =====================================================================
     1) GIẤY ĐỀ NGHỊ TẠM ỨNG (Mẫu 03 - TT)
     ===================================================================== */
  App.Docgen = {};
  App.Docgen.tamUng = async function (g) {
    await App.ensureLib('docx'); D = window.docx;
    const { settings: s, event: ev, advance: a } = g;
    const total = (a.items || []).reduce((x, it) => x + U.toNumber(it.amount), 0);
    const dt = U.dmy(a.date);

    const headerLeft = [PT('Đơn vị: ' + s.company, { size: 22, after: 0, line: 240 }),
      PT('Số: ' + (a.soPhieu || '…/ĐNTU-LtL'), { size: 22, after: 0 })];
    const headerRight = [P([R('Mẫu số 03 - TT', { b: true, size: 22 })], { al: AL().CENTER, after: 0, line: 240 }),
      P([R('(Ban hành theo Thông tư số 133/2016/TT-BTC ngày 26/8/2016 của Bộ Tài chính)', { i: true, size: 18 })], { al: AL().CENTER, after: 0, line: 220 })];

    const itemRows = [new D.TableRow({
      tableHeader: true,
      children: [tcell('STT', { b: true, al: AL().CENTER, w: 8, fill: 'EDE9FE' }),
        tcell('Nội dung khoản chi', { b: true, al: AL().CENTER, w: 37, fill: 'EDE9FE' }),
        tcell('Diễn giải', { b: true, al: AL().CENTER, w: 30, fill: 'EDE9FE' }),
        tcell('Thành tiền (VNĐ)', { b: true, al: AL().CENTER, w: 25, fill: 'EDE9FE' })],
    })];
    (a.items || []).forEach((it, i) => {
      itemRows.push(new D.TableRow({
        children: [tcell(String(i + 1), { al: AL().CENTER }), tcell(it.content || ''), tcell(it.note || ''), tcell(grp(it.amount), { al: AL().RIGHT })],
      }));
    });
    itemRows.push(new D.TableRow({
      children: [cell([P([R('TỔNG CỘNG', { b: true })], { al: AL().CENTER, after: 0 })], { span: 3, fill: 'F5F3FF' }),
        tcell(grp(total), { b: true, al: AL().RIGHT, fill: 'F5F3FF' })],
    }));

    const children = [
      borderless([new D.TableRow({ children: [cell(headerLeft, { w: 55 }), cell(headerRight, { w: 45 })] })], [5200, 3800]),
      EMPTY(),
      P([R('GIẤY ĐỀ NGHỊ TẠM ỨNG', { b: true, size: 32 })], { al: AL().CENTER, after: 0 }),
      P([R('Ngày ' + dt.d + ' tháng ' + dt.m + ' năm ' + dt.y, { i: true })], { al: AL().CENTER, after: 120 }),
      PT('Kính gửi:    - Ban Giám đốc Công ty;', { after: 0 }),
      P([R('                    - Phòng Kế toán.')], { after: 120 }),
      PT('Họ và tên người đề nghị tạm ứng: ' + (a.requester || '')),
      PT('Bộ phận công tác: ' + (a.dept || '') + '          Chức vụ: ' + (a.position || '')),
      P([R('Số tiền đề nghị tạm ứng: '), R(grp(total) + ' đồng', { b: true })]),
      P([R('(Bằng chữ: ' + U.docSo(total) + '.)', { i: true })]),
      PT('Lý do tạm ứng: ' + (a.reason || '')),
      PT('Chi tiết các khoản chi tạm ứng:', { b: true, before: 60 }),
      gridTable(itemRows),
      EMPTY(),
      P([R('Số tiền viết bằng chữ: '), R(U.docSo(total) + '.', { i: true })]),
      P([R('Tôi xin cam kết sử dụng khoản tạm ứng đúng mục đích nêu trên và hoàn ứng (kèm chứng từ) theo đúng quy định của Công ty. Kính đề nghị Ban Giám đốc và Phòng Kế toán xem xét, phê duyệt.', { i: true })], { al: AL().JUSTIFIED, before: 60, after: 160 }),
      signatures([
        { title: s.directorTU || 'GIÁM ĐỐC', name: s.director },
        { title: s.accountantTU || 'KẾ TOÁN', name: s.accountant },
        { title: 'NGƯỜI ĐỀ NGHỊ TẠM ỨNG', name: a.requester || s.requester },
      ]),
    ];
    const blob = await build(children);
    U.saveBlob(blob, U.safeName('Giay de nghi tam ung - ' + ev.name) + '.docx');
    App.toast('Đã tạo Giấy đề nghị tạm ứng', 'ok');
  };

  /* =====================================================================
     2) GIẤY ĐỀ NGHỊ THANH TOÁN (BM01-CTKT)
     ===================================================================== */
  App.Docgen.thanhToan = async function (g) {
    await App.ensureLib('docx'); D = window.docx;
    const { settings: s, event: ev, m } = g;
    const owed = m.remaining < 0; const payAmt = Math.abs(m.remaining);
    const today = U.dmy(U.todayISO());
    const nd = ev.ndThanhToan || ('Hoàn ứng chi phí ' + ev.name + ' (đã tạm ứng ' + grp(m.advanceTotal) + ' đ; thực chi ' + grp(m.spentTotal) + ' đ; số dư tạm ứng kỳ trước: ' + grp(m.prevBalance) + ' đ).');

    const children = [
      quocHieuHeader(s),
      P([R('Hà Nội, ngày ' + today.d + ' tháng ' + today.m + ' năm ' + today.y, { i: true })], { al: AL().RIGHT, before: 40, after: 0 }),
      P([R('Số: ' + (ev.soDNTT || '……/2026/ĐNTT-LTL'))], { al: AL().CENTER, after: 60 }),
      P([R('GIẤY ĐỀ NGHỊ THANH TOÁN', { b: true, size: 32 })], { al: AL().CENTER, after: 140 }),
      PT('Kính gửi: Ban Điều hành'),
      PT('Họ tên người đề nghị thanh toán: ' + (ev.requester || s.requester)),
      PT('Bộ phận công tác: ' + (ev.dept || s.dept) + '        Chức vụ: ' + (ev.position || s.position)),
      P([R('Nội dung thanh toán: '), R(nd)]),
      P([R((owed ? 'Số tiền đề nghị thanh toán thêm: ' : 'Số tiền tạm ứng còn dư: ')), R(grp(payAmt) + ' VNĐ', { b: true })]),
      P([R('Viết bằng chữ: ' + U.docSo(payAmt) + '.', { i: true })]),
      PT('Chứng từ gốc đính kèm: Bảng kê chi phí và ảnh chụp giao dịch'),
      PT('Hình thức xử lý số chênh lệch: ' + (ev.diffHandling || 'Không nộp lại và sẽ trừ vào đợt tạm ứng tiếp theo'), { after: 160 }),
      signatures([
        { title: s.directorHU || 'TỔNG GIÁM ĐỐC', name: s.director },
        { title: s.accountantHU || 'KẾ TOÁN TRƯỞNG', name: s.accountant },
        { title: 'NGƯỜI ĐỀ NGHỊ', name: ev.requester || s.requester },
      ]),
      P([R('BM01-CTKT', { i: true, size: 20 })], { al: AL().RIGHT, before: 160 }),
    ];
    const blob = await build(children);
    U.saveBlob(blob, U.safeName('Giay de nghi thanh toan - ' + ev.name) + '.docx');
    App.toast('Đã tạo Giấy đề nghị thanh toán', 'ok');
  };

  /* =====================================================================
     3) BẢNG THỐNG KÊ CHI PHÍ HOÀN ỨNG (BM06-CTKT) + phụ lục ảnh
     ===================================================================== */
  App.Docgen.bangThongKe = async function (g) {
    await App.ensureLib('docx'); D = window.docx;
    const { settings: s, event: ev, m, expenses, images } = g;
    const today = U.dmy(U.todayISO());

    const rows = [new D.TableRow({
      tableHeader: true,
      children: [tcell('TT', { b: true, al: AL().CENTER, w: 6, fill: 'EDE9FE' }),
        tcell('Ngày', { b: true, al: AL().CENTER, w: 12, fill: 'EDE9FE' }),
        tcell('Nội dung chi phí', { b: true, al: AL().CENTER, w: 45, fill: 'EDE9FE' }),
        tcell('Loại HĐ', { b: true, al: AL().CENTER, w: 15, fill: 'EDE9FE' }),
        tcell('Số tiền', { b: true, al: AL().CENTER, w: 22, fill: 'EDE9FE' })],
    })];
    expenses.forEach((e, i) => rows.push(new D.TableRow({
      children: [tcell(String(i + 1), { al: AL().CENTER }), tcell(U.fmtDayMonth(e.date), { al: AL().CENTER }),
        tcell(e.content || ''), tcell(VATLABEL(e), { al: AL().CENTER, size: 22 }), tcell(grp(e.amount) + ' đ', { al: AL().RIGHT })],
    })));
    const totRow = (label, val, strong) => new D.TableRow({
      children: [cell([P([R(label, { b: !!strong })], { al: AL().LEFT, after: 0 })], { span: 4, fill: strong ? 'F5F3FF' : undefined }),
        tcell(grp(val) + ' đ', { b: !!strong, al: AL().RIGHT, fill: strong ? 'F5F3FF' : undefined })],
    });
    rows.push(totRow('TỔNG TIỀN CHI', m.spentTotal, true));
    rows.push(totRow('Số tiền đã tạm ứng', m.advanceTotal));
    rows.push(totRow('Số dư tạm ứng kỳ trước', m.prevBalance));
    rows.push(totRow('Số tiền tạm ứng còn dư', m.remaining, true));

    const children = [
      quocHieuHeader(s),
      P([R('Hà Nội, ngày ' + today.d + ' tháng ' + today.m + ' năm ' + today.y, { i: true })], { al: AL().RIGHT, before: 40, after: 0 }),
      P([R('Số: ' + (ev.soBKHU || '……/2026/BKHU-LTL'))], { al: AL().CENTER, after: 60 }),
      P([R('BẢNG THỐNG KÊ CHI PHÍ HOÀN ỨNG', { b: true, size: 32 })], { al: AL().CENTER, after: 60 }),
      P([R('Về việc: ' + ev.name, { i: true })], { al: AL().CENTER, after: 120 }),
      PT('Kính gửi: Ban Điều hành'),
      PT('Họ và tên người đề nghị: ' + (ev.requester || s.requester)),
      PT('Bộ phận công tác: ' + (ev.dept || s.dept) + '        Chức vụ: ' + (ev.position || s.position)),
      P([R('Số tiền đã tạm ứng: '), R(grp(m.advanceTotal) + ' đ', { b: true })]),
      PT('Tôi xin thống kê các khoản chi phí đã thanh toán như sau:', { before: 40 }),
      gridTable(rows),
      P([R('Tỷ lệ giá trị có hoá đơn VAT: ' + m.pctVatAmount + '% (' + grp(m.vatAmount) + ' đ / ' + grp(m.spentTotal) + ' đ); hoá đơn bán lẻ (bill): ' + m.pctBillAmount + '% (' + grp(m.billAmount) + ' đ).', { i: true, size: 22 })], { before: 80, after: 20 }),
      P([R('Số tiền tạm ứng còn dư viết bằng chữ: ' + U.docSo(Math.abs(m.remaining)) + '.', { i: true })], { before: 40 }),
      P([R('Ghi chú: Toàn bộ chứng từ, minh chứng thanh toán (ảnh chụp giao dịch) được đính kèm theo Bảng kê này.', { i: true })], { after: 160 }),
      signatures([
        { title: s.directorHU || 'TỔNG GIÁM ĐỐC', name: s.director },
        { title: s.accountantHU || 'KẾ TOÁN TRƯỞNG', name: s.accountant },
        { title: 'NGƯỜI ĐỀ NGHỊ', name: ev.requester || s.requester },
      ]),
      P([R('BM06-CTKT', { i: true, size: 20 })], { al: AL().RIGHT, before: 120 }),
    ];

    // ---- Phụ lục ảnh ----
    if (images && images.length) {
      children.push(new D.Paragraph({ pageBreakBefore: true, children: [R('PHỤ LỤC: ẢNH CHỨNG TỪ MINH CHỨNG', { b: true, size: 30 })], alignment: AL().CENTER, spacing: { after: 160 } }));
      const byExp = {}; images.forEach((im) => { (byExp[im.expenseId] = byExp[im.expenseId] || []).push(im); });
      let idx = 0;
      for (const e of expenses) {
        const imgs = byExp[e.id] || [];
        if (!imgs.length) continue;
        idx++;
        children.push(P([R(idx + '. ' + (e.content || '') + '  —  ' + U.fmtDayMonth(e.date) + '  —  ' + grp(e.amount) + ' đ', { b: true })], { before: 80, after: 60 }));
        for (const im of imgs) {
          try {
            const pi = await prepImage(im.blob, 440);
            children.push(new D.Paragraph({ alignment: AL().CENTER, spacing: { after: 30 }, children: [new D.ImageRun({ type: 'jpg', data: pi.data, transformation: { width: pi.width, height: pi.height } })] }));
            const cap = im.note || (im.amount ? grp(im.amount) + ' đ' : '');
            if (cap) children.push(P([R(cap, { i: true, size: 22 })], { al: AL().CENTER, after: 100 }));
            else children.push(EMPTY());
          } catch (err) { /* bỏ qua ảnh lỗi */ }
        }
      }
    }

    const blob = await build(children);
    U.saveBlob(blob, U.safeName('Bang thong ke hoan ung - ' + ev.name) + '.docx');
    App.toast('Đã tạo Bảng thống kê hoàn ứng', 'ok');
  };

  /* =====================================================================
     4) Excel — bảng tổng hợp đợt tạm ứng/hoàn ứng
     ===================================================================== */
  App.Docgen.excel = async function (g) {
    await App.ensureLib('xlsx');
    const XLSX = window.XLSX;
    const { event: ev, m, expenses, advance: a, images } = g;
    const byExp = {}; (images || []).forEach((im) => { (byExp[im.expenseId] = byExp[im.expenseId] || []).push(im); });

    const wb = XLSX.utils.book_new();

    // Tổng hợp
    const sum = [
      ['LEARN TO LEAP — TỔNG HỢP TẠM ỨNG / HOÀN ỨNG'],
      ['Sự kiện', ev.name],
      ['Ngày sự kiện', U.fmtDate(ev.date)],
      ['Người đề nghị', ev.requester || ''],
      [],
      ['Số tiền đã tạm ứng', m.advanceTotal],
      ['Số dư tạm ứng kỳ trước', m.prevBalance],
      ['Tổng thực chi', m.spentTotal],
      ['Số tiền tạm ứng còn dư', m.remaining],
      ['Bằng chữ', U.docSo(Math.abs(m.remaining))],
      [],
      ['Số khoản chi', m.count],
      ['Khoản có hoá đơn VAT', m.vatCount],
      ['Giá trị có hoá đơn VAT', m.vatAmount],
      ['Tỷ lệ giá trị có hoá đơn VAT (%)', m.pctVatAmount],
      ['Khoản có hoá đơn bill', m.billCount],
      ['Tỷ lệ giá trị có hoá đơn bill (%)', m.pctBillAmount],
      ['Khoản có ảnh minh chứng', m.withImagesCount],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(sum); ws1['!cols'] = [{ wch: 26 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp');

    // Khoản chi
    const vlabel = (e) => { const t = App.vatTypeOf(e); return t === 'vat' ? 'Hoá đơn VAT' : t === 'bill' ? 'Hoá đơn bill' : 'Không có HĐ'; };
    const head = ['TT', 'Ngày', 'Nội dung chi', 'Nội dung chuyển khoản', 'Phân loại', 'Loại hoá đơn', 'Số tiền', 'Số minh chứng', 'Ghi chú ảnh', 'Thời gian cập nhật'];
    const data = [head];
    expenses.forEach((e, i) => {
      const imgs = byExp[e.id] || [];
      const notes = imgs.map((x) => x.note).filter(Boolean).join(' | ');
      data.push([i + 1, U.fmtDate(e.date), e.content || '', e.transferNote || '', e.category || '', vlabel(e), U.toNumber(e.amount), imgs.length, notes, U.fmtDateTime(e.uploadedAt || e.createdAt)]);
    });
    data.push(['', '', 'TỔNG CỘNG', '', '', '', m.spentTotal, '', '', '']);
    const ws2 = XLSX.utils.aoa_to_sheet(data);
    ws2['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 34 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Khoản chi');

    // Tạm ứng chi tiết
    if (a && a.items && a.items.length) {
      const ad = [['STT', 'Nội dung khoản chi', 'Diễn giải', 'Thành tiền (VNĐ)']];
      a.items.forEach((it, i) => ad.push([i + 1, it.content || '', it.note || '', U.toNumber(it.amount)]));
      ad.push(['', 'TỔNG CỘNG', '', m.advanceTotal]);
      const ws3 = XLSX.utils.aoa_to_sheet(ad); ws3['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Tạm ứng');
    }

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    U.saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      U.safeName('Bang ke hoan ung - ' + ev.name) + '.xlsx');
    App.toast('Đã xuất Excel', 'ok');
  };
})();
