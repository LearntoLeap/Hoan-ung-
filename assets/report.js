/* =========================================================================
   report.js — Báo cáo tổng hợp: toàn bộ khoản chi + phiếu của một người
   (hoặc mọi tài khoản với quản trị). Xuất Excel nhiều tab + Word có logo,
   bảng tổng hợp, chi tiết theo sự kiện, phụ lục ảnh minh chứng, chữ ký.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';
  const PURPLE = '6B3DBE', PINK = 'D6589A', HEAD = 'E9E0F7', ZEBRA = 'FAF6FD', GRID = 'D9CCE8', FONT = 'Arial';
  const VAT_T = { vat: 'Hoá đơn VAT', bill: 'Hoá đơn bán lẻ', none: 'Không hoá đơn' };

  /* ============================== Tập dữ liệu ============================== */
  function build(src, f) {
    f = f || {};
    const inRange = (iso) => { const d = String(iso || '').slice(0, 10); if (f.from && d < f.from) return false; if (f.to && d > f.to) return false; return true; };
    const evOk = (id) => !f.ev || id === f.ev;
    const events = (src.events || []).filter((e) => !e.deletedAt && evOk(e.id));
    const evIds = new Set(events.map((e) => e.id));
    const expenses = (src.expenses || []).filter((e) => !e.deletedAt && evIds.has(e.eventId) && inRange(e.date))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const docs = (src.docs || []).filter((d) => !d.deletedAt && (!f.ev || d.eventId === f.ev) && inRange(d.ngayLap))
      .sort((a, b) => (a.ngayLap || '').localeCompare(b.ngayLap || ''));
    const D = App.Docs, sum = (a) => a.reduce((s, x) => s + U.toNumber(x.amount), 0);
    const tot = (t) => docs.filter((d) => d.type === t).reduce((s, d) => s + D.total(d), 0);
    const vt = App.vatTypeOf;
    const byEvent = events.map((e) => {
      const l = expenses.filter((x) => x.eventId === e.id);
      const tu = docs.filter((d) => d.eventId === e.id && d.type === 'TU').reduce((s, d) => s + D.total(d), 0);
      return { ev: e, list: l, count: l.length, spent: sum(l), tu, vat: sum(l.filter((x) => vt(x) === 'vat')), bill: sum(l.filter((x) => vt(x) === 'bill')), none: sum(l.filter((x) => vt(x) === 'none')) };
    }).filter((r) => r.count || r.tu || !f.from);
    const cats = {};
    expenses.forEach((x) => { const c = x.category || 'Khác'; (cats[c] = cats[c] || { count: 0, amount: 0 }); cats[c].count++; cats[c].amount += U.toNumber(x.amount); });
    const imgBy = {};
    (src.images || []).forEach((im) => { if (im.expenseId) (imgBy[im.expenseId] = imgBy[im.expenseId] || []).push(im); });
    const spent = sum(expenses);
    return {
      owner: src.owner || {}, settings: src.settings || App.settings, filter: f, events, expenses, docs, byEvent, cats, imgBy,
      spent, tu: tot('TU'), hu: tot('HU'), tt: tot('TT'),
      vat: sum(expenses.filter((x) => vt(x) === 'vat')), bill: sum(expenses.filter((x) => vt(x) === 'bill')),
      evName: (id) => ((src.events || []).find((e) => e.id === id) || {}).name || '',
    };
  }
  function period(f) {
    if (!f.from && !f.to) return 'Toàn bộ thời gian';
    return (f.from ? 'Từ ' + U.fmtDate(f.from) : 'Đến') + (f.to ? (f.from ? ' đến ' : ' ') + U.fmtDate(f.to) : ' đến nay');
  }
  const fname = (r, ext) => U.safeName('Bao-cao-tong-hop - ' + (r.owner.name || 'LtL') + ' - ' + U.todayISO()) + '.' + ext;

  /* ============================== EXCEL ============================== */
  const thin = { style: 'thin', color: { argb: 'FF' + GRID } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fnt = (o) => ({ name: FONT, size: (o && o.size) || 10, bold: !!(o && o.b), italic: !!(o && o.i), color: { argb: 'FF' + ((o && o.color) || '222222') } });
  const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
  const NUM = '#,##0';

  function brandHeader(ws, r, title, ncols, logoId) {
    const s = r.settings, last = String.fromCharCode(64 + ncols);
    // cột bắt đầu chữ: sau phần rộng đủ chỗ cho logo (~19 ký tự)
    let acc = 0, k = 0; while (k < ncols - 1 && acc < 19) { acc += (ws.getColumn(k + 1).width || 9); k++; }
    const tc = String.fromCharCode(65 + k);
    ws.views = [{ showGridLines: false }];
    ws.getRow(1).height = 22; ws.getRow(2).height = 16; ws.getRow(3).height = 16;
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0.1, row: 0.15 }, ext: { width: 120, height: 52 }, editAs: 'oneCell' });
    ws.mergeCells(tc + '1:' + last + '1'); ws.getCell(tc + '1').value = s.company; ws.getCell(tc + '1').font = fnt({ b: true, size: 12, color: PURPLE });
    ws.mergeCells(tc + '2:' + last + '2'); ws.getCell(tc + '2').value = s.companyAddr + '  ·  MST ' + s.mst; ws.getCell(tc + '2').font = fnt({ size: 9, color: '555555' });
    ws.mergeCells(tc + '3:' + last + '3'); ws.getCell(tc + '3').value = 'ĐT ' + s.phone + '  ·  ' + s.email; ws.getCell(tc + '3').font = fnt({ size: 9, color: '555555' });
    ws.getRow(4).height = 6;
    ws.mergeCells('A5:' + last + '5');
    const t = ws.getCell('A5'); t.value = title; t.font = fnt({ b: true, size: 15, color: 'FFFFFF' }); t.alignment = { horizontal: 'center', vertical: 'middle' };
    t.fill = { type: 'gradient', gradient: 'angle', degree: 0, stops: [{ position: 0, color: { argb: 'FF' + PURPLE } }, { position: 1, color: { argb: 'FF' + PINK } }] };
    ws.getRow(5).height = 30;
    ws.mergeCells('A6:' + last + '6');
    const o = r.owner;
    const c6 = ws.getCell('A6'); c6.value = 'Người lập: ' + (o.name || '') + (o.dept ? '  ·  Bộ phận: ' + o.dept : '') + '  ·  Kỳ: ' + period(r.filter) + '  ·  Xuất ngày ' + U.fmtDate(U.todayISO());
    c6.font = fnt({ i: true, size: 9.5, color: '444444' }); c6.alignment = { horizontal: 'center' };
    ws.getRow(7).height = 8;
    return 8;
  }
  function tableHead(ws, row, heads) {
    heads.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.font = fnt({ b: true, color: 'FFFFFF' }); c.fill = fill(PURPLE); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = box; });
    ws.getRow(row).height = 30;
  }
  function tableRow(ws, row, vals, fmts, zebra) {
    vals.forEach((v, i) => {
      const c = ws.getCell(row, i + 1); c.value = v; c.font = fnt(); c.border = box;
      const f = fmts[i] || '';
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: f === 'n' || f === 'p' ? 'right' : f === 'c' || f === 'd' ? 'center' : 'left' };
      if (f === 'n') c.numFmt = NUM; if (f === 'd') c.numFmt = 'dd/mm/yyyy'; if (f === 'p') c.numFmt = '0%';
      if (zebra) c.fill = fill(ZEBRA);
    });
  }
  function totalRow(ws, row, ncols, label, sums) {
    for (let i = 1; i <= ncols; i++) { const c = ws.getCell(row, i); c.fill = fill(HEAD); c.border = box; c.font = fnt({ b: true, color: PURPLE }); }
    ws.getCell(row, 1).value = label;
    Object.keys(sums).forEach((col) => { const c = ws.getCell(row, +col); c.value = sums[col]; c.numFmt = NUM; c.alignment = { horizontal: 'right' }; });
    ws.getRow(row).height = 22;
  }
  function signBlock(ws, row, r, cols) {
    const s = r.settings;
    const parts = [['NGƯỜI LẬP', r.owner.name || ''], ['KẾ TOÁN TRƯỞNG', s.keToanTruong || ''], [s.chucDanhPheDuyet || 'GIÁM ĐỐC', s.giamDoc || '']];
    ws.mergeCells(row, cols[2][0], row, cols[2][1]);
    const dc = ws.getCell(row, cols[2][0]); dc.value = App.Docs.dateLine(U.todayISO()); dc.font = fnt({ i: true }); dc.alignment = { horizontal: 'center' };
    row++;
    parts.forEach((p, k) => {
      ws.mergeCells(row, cols[k][0], row, cols[k][1]); const a = ws.getCell(row, cols[k][0]); a.value = p[0]; a.font = fnt({ b: true }); a.alignment = { horizontal: 'center' };
      ws.mergeCells(row + 1, cols[k][0], row + 1, cols[k][1]); const b = ws.getCell(row + 1, cols[k][0]); b.value = '(Ký, ghi rõ họ tên)'; b.font = fnt({ i: true, size: 9, color: '888888' }); b.alignment = { horizontal: 'center' };
      ws.mergeCells(row + 5, cols[k][0], row + 5, cols[k][1]); const n = ws.getCell(row + 5, cols[k][0]); n.value = p[1]; n.font = fnt({ b: true }); n.alignment = { horizontal: 'center' };
    });
  }
  function pageSetup(ws, lastRow, ncols, landscape) {
    ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      printArea: 'A1:' + String.fromCharCode(64 + ncols) + lastRow, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
    ws.headerFooter = { oddFooter: '&L&8Learn to Leap · Báo cáo tổng hợp&R&8Trang &P/&N' };
  }

  function sheetSummary(wb, r, logoId) {
    const ws = wb.addWorksheet('Tổng hợp', { properties: { tabColor: { argb: 'FF' + PURPLE } } });
    ws.columns = [6, 34, 12, 10, 16, 16, 16, 15, 15, 16].map((w) => ({ width: w }));
    let row = brandHeader(ws, r, 'BÁO CÁO TỔNG HỢP CHI PHÍ', 10, logoId);
    // khối số liệu chính
    const kpis = [['Tổng tạm ứng', r.tu], ['Thực chi', r.spent], ['Đề nghị hoàn ứng', r.hu], ['Đề nghị thanh toán', r.tt], ['Tạm ứng − Thực chi', r.tu - r.spent]];
    const spans = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];
    kpis.forEach((k, i) => {
      ws.mergeCells(row, spans[i][0], row, spans[i][1]); ws.mergeCells(row + 1, spans[i][0], row + 1, spans[i][1]);
      const a = ws.getCell(row, spans[i][0]); a.value = k[0].toUpperCase(); a.font = fnt({ b: true, size: 8.5, color: '7A6A8C' }); a.alignment = { horizontal: 'center' }; a.fill = fill(ZEBRA);
      const b = ws.getCell(row + 1, spans[i][0]); b.value = k[1]; b.numFmt = NUM + ' "đ"'; b.font = fnt({ b: true, size: 14, color: i === 4 && k[1] < 0 ? 'C0392B' : PURPLE }); b.alignment = { horizontal: 'center', vertical: 'middle' }; b.fill = fill(ZEBRA);
      for (let c = spans[i][0]; c <= spans[i][1]; c++) { ws.getCell(row, c).border = { top: { style: 'medium', color: { argb: 'FF' + (i % 2 ? PINK : PURPLE) } } }; ws.getCell(row + 1, c).fill = fill(ZEBRA); ws.getCell(row, c).fill = fill(ZEBRA); }
    });
    ws.getRow(row).height = 18; ws.getRow(row + 1).height = 30;
    row += 2;
    ws.mergeCells(row, 1, row, 10);
    const pv = r.spent ? Math.round(r.vat / r.spent * 100) : 0;
    ws.getCell(row, 1).value = r.expenses.length + ' khoản chi · ' + r.docs.length + ' phiếu · ' + r.byEvent.length + ' sự kiện · Có hoá đơn VAT ' + pv + '% giá trị';
    ws.getCell(row, 1).font = fnt({ i: true, size: 9, color: '666666' }); ws.getCell(row, 1).alignment = { horizontal: 'center' };
    row += 2;

    ws.mergeCells(row, 1, row, 10); ws.getCell(row, 1).value = 'I. TỔNG HỢP THEO SỰ KIỆN / ĐỢT CHI'; ws.getCell(row, 1).font = fnt({ b: true, size: 11, color: PURPLE }); row++;
    tableHead(ws, row, ['STT', 'Sự kiện / đợt chi', 'Ngày', 'Khoản', 'Tạm ứng', 'Thực chi', 'Có HĐ VAT', 'Bill', 'Không HĐ', 'Còn dư (+) / Vượt (−)']); row++;
    const first = row;
    r.byEvent.forEach((x, i) => { tableRow(ws, row, [i + 1, x.ev.name, App.Export._isoToDate(x.ev.date), x.count, x.tu, x.spent, x.vat, x.bill, x.none, x.tu - x.spent], ['c', '', 'd', 'c', 'n', 'n', 'n', 'n', 'n', 'n'], i % 2); row++; });
    const sumCol = (c) => ({ formula: 'SUM(' + c + first + ':' + c + (row - 1) + ')', result: 0 });
    totalRow(ws, row, 10, 'CỘNG', r.byEvent.length ? { 4: sumCol('D'), 5: sumCol('E'), 6: sumCol('F'), 7: sumCol('G'), 8: sumCol('H'), 9: sumCol('I'), 10: sumCol('J') } : {});
    ws.getCell(row, 4).numFmt = '0';
    row += 2;

    ws.mergeCells(row, 1, row, 10); ws.getCell(row, 1).value = 'II. CƠ CẤU THEO PHÂN LOẠI CHI'; ws.getCell(row, 1).font = fnt({ b: true, size: 11, color: PURPLE }); row++;
    tableHead(ws, row, ['STT', 'Phân loại', '', 'Số khoản', 'Số tiền', 'Tỷ lệ']);
    ws.mergeCells(row, 2, row, 3); row++;
    Object.keys(r.cats).sort((a, b) => r.cats[b].amount - r.cats[a].amount).forEach((c, i) => {
      tableRow(ws, row, [i + 1, c, null, r.cats[c].count, r.cats[c].amount, r.spent ? r.cats[c].amount / r.spent : 0], ['c', '', '', 'c', 'n', 'p'], i % 2);
      ws.mergeCells(row, 2, row, 3); row++;
    });
    row += 1;
    signBlock(ws, row, r, [[1, 3], [4, 7], [8, 10]]);
    pageSetup(ws, row + 6, 10, true);
  }

  function sheetExpenses(wb, r, logoId, withOwner) {
    const ws = wb.addWorksheet('Chi tiết khoản chi', { properties: { tabColor: { argb: 'FF' + PINK } } });
    const heads = ['STT', 'Ngày chi', withOwner ? 'Người' : 'Sự kiện / đợt chi', 'Nội dung', 'Phân loại', 'Người tham gia', 'Loại hoá đơn', 'Số tiền', 'Ghi chú', withOwner ? 'Sự kiện' : 'Ảnh'];
    ws.columns = [6, 11, 24, 40, 15, 16, 15, 14, 28, withOwner ? 22 : 7].map((w) => ({ width: w }));
    let row = brandHeader(ws, r, 'BẢNG KÊ CHI TIẾT KHOẢN CHI', 10, logoId);
    tableHead(ws, row, heads);
    const hr = row; row++;
    const first = row;
    r.expenses.forEach((x, i) => {
      tableRow(ws, row, [i + 1, App.Export._isoToDate(x.date), withOwner ? x._owner : r.evName(x.eventId), x.content, x.category || 'Khác', x.participants || '', VAT_T[App.vatTypeOf(x)], U.toNumber(x.amount),
        [x.ghiChu, x.transferNote].filter(Boolean).join(' · '), withOwner ? r.evName(x.eventId) : (r.imgBy[x.id] || []).length],
        ['c', 'd', '', '', '', '', '', 'n', '', withOwner ? '' : 'c'], i % 2);
      ws.getRow(row).height = Math.max(18, Math.ceil(String(x.content || '').length / 42) * 14 + 4, Math.ceil(String(withOwner ? (x._owner || '') : r.evName(x.eventId)).length / 23) * 14 + 4, Math.ceil(String(x.ghiChu || '').length / 28) * 14 + 4);
      row++;
    });
    totalRow(ws, row, 10, 'CỘNG (theo bộ lọc đang hiển thị)', { 8: { formula: 'SUBTOTAL(9,H' + first + ':H' + (row - 1) + ')', result: r.spent } });
    ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: row - 1, column: 10 } };
    ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
    pageSetup(ws, row, 10, true);
  }

  function sheetDocs(wb, r, logoId, withOwner) {
    const ws = wb.addWorksheet('Danh sách phiếu', { properties: { tabColor: { argb: 'FF16A2A8' } } });
    const heads = ['STT', 'Số phiếu', 'Loại', 'Ngày lập', withOwner ? 'Người đề nghị' : 'Sự kiện', 'Nội dung', 'Số tiền', 'Trạng thái', 'Phiếu TU / đã ứng', 'Kết luận'];
    ws.columns = [6, 18, 12, 11, 22, 40, 14, 16, 22, 34].map((w) => ({ width: w }));
    let row = brandHeader(ws, r, 'DANH SÁCH PHIẾU ĐỀ NGHỊ', 10, logoId);
    tableHead(ws, row, heads); const hr = row; row++;
    const first = row, D = App.Docs;
    r.docs.forEach((d, i) => {
      const st = d.type === 'HU' ? D.settle(d) : null;
      tableRow(ws, row, [i + 1, d.soPhieu, D.TYPES[d.type] ? D.TYPES[d.type].label : d.type, App.Export._isoToDate(d.ngayLap), withOwner ? d.nguoiDeNghi : r.evName(d.eventId), d.noiDung || '',
        D.total(d), D.statusOf(d.status).t, st && st.has ? (d.tuSoPhieu || '') + ' · ' + U.groupThousand(st.adv) : '', st ? st.concl.replace(/^→ /, '') : ''],
        ['c', '', 'c', 'd', '', '', 'n', 'c', '', ''], i % 2);
      row++;
    });
    totalRow(ws, row, 10, 'CỘNG', { 7: { formula: 'SUBTOTAL(9,G' + first + ':G' + (row - 1) + ')', result: r.docs.reduce((s, d) => s + D.total(d), 0) } });
    ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: row - 1, column: 10 } };
    ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
    pageSetup(ws, row, 10, true);
  }

  async function excel(r, opts) {
    opts = opts || {};
    try {
      const ExcelJS = await App.ensureLib('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'LtL Tạm ứng & Hoàn ứng'; wb.created = new Date(); wb.calcProperties = { fullCalcOnLoad: true };
      const bytes = await App.Export._logoBytes();
      const logoId = bytes ? wb.addImage({ buffer: bytes, extension: 'png' }) : null;
      if (opts.people) sheetPeople(wb, r, opts.people, logoId);
      sheetSummary(wb, r, logoId);
      sheetExpenses(wb, r, logoId, !!opts.people);
      sheetDocs(wb, r, logoId, !!opts.people);
      if (opts.forms && r.docs.length) {
        const used = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
        for (const d of r.docs) App.Export._buildSheet(wb, wb.addWorksheet(App.Export._sheetName(d.soPhieu, used)), d, r.settings, logoId);
      }
      const buf = await wb.xlsx.writeBuffer();
      U.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), opts.filename || fname(r, 'xlsx'));
      App.toast('Đã tạo báo cáo Excel', 'ok');
    } catch (e) { console.error(e); App.toast('Lỗi tạo Excel: ' + (e.message || e), 'err'); }
  }

  function sheetPeople(wb, r, people, logoId) {
    const ws = wb.addWorksheet('Theo người', { properties: { tabColor: { argb: 'FFD6589A' } } });
    ws.columns = [6, 26, 28, 18, 10, 16, 16, 16, 16, 10].map((w) => ({ width: w }));
    let row = brandHeader(ws, r, 'TỔNG HỢP THEO TÀI KHOẢN', 10, logoId);
    tableHead(ws, row, ['STT', 'Họ tên', 'Email', 'Bộ phận', 'Số phiếu', 'Tạm ứng', 'Hoàn ứng', 'Thanh toán', 'Thực chi', 'Khoản chi']); row++;
    const first = row;
    people.forEach((p, i) => { tableRow(ws, row, [i + 1, p.name, p.email, p.dept, p.docs, p.tu, p.hu, p.tt, p.spent, p.count], ['c', '', '', '', 'c', 'n', 'n', 'n', 'n', 'c'], i % 2); row++; });
    const sc = (c) => ({ formula: 'SUM(' + c + first + ':' + c + (row - 1) + ')', result: 0 });
    totalRow(ws, row, 10, 'CỘNG', people.length ? { 5: sc('E'), 6: sc('F'), 7: sc('G'), 8: sc('H'), 9: sc('I'), 10: sc('J') } : {});
    ws.getCell(row, 5).numFmt = '0'; ws.getCell(row, 10).numFmt = '0';
    pageSetup(ws, row, 10, true);
  }

  /* ============================== WORD ============================== */
  async function prepImage(blob, maxW) {
    let bmp;
    try { bmp = await createImageBitmap(blob); }
    catch (e) { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); }); }
    const cap = 1400; let w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > cap) { const k = cap / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const jpg = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.8));
    const data = new Uint8Array(await jpg.arrayBuffer());
    let dw = w, dh = h; const mw = maxW || 300, mh = 300;
    if (dw > mw) { dh = Math.round(dh * mw / dw); dw = mw; } if (dh > mh) { dw = Math.round(dw * mh / dh); dh = mh; }
    return { data, width: dw, height: dh };
  }

  async function word(r, opts) {
    opts = opts || {};
    try {
      const X = await App.ensureLib('docx');
      const s = r.settings, D = App.Docs;
      const W = 11906, M = 850, CW = W - 2 * M;
      const NONE = { style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const NOB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
      const L = { style: X.BorderStyle.SINGLE, size: 4, color: GRID };
      const BOX = { top: L, bottom: L, left: L, right: L };
      const R = (t, o) => { o = o || {}; return new X.TextRun({ text: t == null ? '' : String(t), bold: !!o.b, italics: !!o.i, size: o.size || 20, color: o.color, font: FONT }); };
      const P = (runs, o) => { o = o || {}; return new X.Paragraph({ alignment: o.al, spacing: { before: o.before || 0, after: o.after == null ? 40 : o.after }, keepNext: o.keepNext, border: o.border, children: Array.isArray(runs) ? runs : [runs] }); };
      const C = (ch, o) => { o = o || {}; return new X.TableCell({ width: { size: o.w, type: X.WidthType.DXA }, columnSpan: o.span, borders: o.borders || BOX, verticalAlign: X.VerticalAlign.CENTER,
        shading: o.fill ? { fill: o.fill, type: X.ShadingType.CLEAR, color: 'auto' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: Array.isArray(ch) ? ch : [ch] }); };
      const AL = X.AlignmentType;
      const table = (widths, head, rows, foot) => {
        const tr = [];
        if (head) tr.push(new X.TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => C(P(R(h, { b: true, color: 'FFFFFF', size: 18 }), { al: AL.CENTER, after: 0 }), { w: widths[i], fill: PURPLE })) }));
        rows.forEach((cells, k) => tr.push(new X.TableRow({ cantSplit: true, children: cells.map((v, i) => {
          const isNum = typeof v === 'number';
          return C(P(R(isNum ? U.groupThousand(v) : v, { size: 18 }), { al: isNum ? AL.RIGHT : (i === 0 ? AL.CENTER : AL.LEFT), after: 0 }), { w: widths[i], fill: k % 2 ? ZEBRA : undefined });
        }) })));
        if (foot) tr.push(new X.TableRow({ cantSplit: true, children: foot.map((v, i) => C(P(R(typeof v === 'number' ? U.groupThousand(v) : v, { b: true, color: PURPLE, size: 18 }), { al: typeof v === 'number' ? AL.RIGHT : AL.LEFT, after: 0 }), { w: widths[i], fill: HEAD })) }));
        return new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: widths, layout: X.TableLayoutType.FIXED, rows: tr });
      };
      const scale = (arr) => { const t = arr.reduce((a, b) => a + b, 0); const w = arr.map((x) => Math.round(x / t * CW)); w[w.length - 1] += CW - w.reduce((a, b) => a + b, 0); return w; };
      const H = (t) => P(R(t, { b: true, size: 24, color: PURPLE }), { before: 240, after: 100, keepNext: true, border: { bottom: { style: X.BorderStyle.SINGLE, size: 6, color: 'E3D3F0', space: 2 } } });
      const ch = [];

      // ---- đầu trang: logo + công ty + dải tiêu đề
      const logo = await App.Export._logoBytes();
      ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: [2600, CW - 2600], layout: X.TableLayoutType.FIXED,
        borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
        rows: [new X.TableRow({ children: [
          C(logo ? P(new X.ImageRun({ type: 'png', data: logo, transformation: { width: 140, height: 60 } })) : P(R('Learn to Leap', { b: true })), { w: 2600, borders: NOB }),
          C([P(R(s.company, { b: true, size: 21, color: PURPLE }), { after: 10 }), P(R(s.companyAddr, { size: 17, color: '555555' }), { after: 10 }),
            P(R('MST ' + s.mst + '  ·  ĐT ' + s.phone + '  ·  ' + s.email, { size: 17, color: '555555' }), { after: 0 })], { w: CW - 2600, borders: NOB })] })] }));
      ch.push(P(R('', { size: 4 }), { after: 120, border: { bottom: { style: X.BorderStyle.SINGLE, size: 18, color: PURPLE, space: 1 } } }));
      ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: [CW], layout: X.TableLayoutType.FIXED,
        rows: [new X.TableRow({ children: [C([P(R(opts.title || 'BÁO CÁO TỔNG HỢP CHI PHÍ', { b: true, size: 32, color: 'FFFFFF' }), { al: AL.CENTER, after: 20 }),
          P(R(period(r.filter) + '  ·  Xuất ngày ' + U.fmtDate(U.todayISO()), { size: 18, color: 'F3E8FF' }), { al: AL.CENTER, after: 0 })], { w: CW, fill: PURPLE, borders: NOB })] })] }));
      ch.push(P(R(''), { after: 80 }));
      const o = r.owner;
      ch.push(table(scale([1, 2, 1, 2]), null, [['Người lập', o.name || '', 'Bộ phận', o.dept || ''], ['Email', o.email || '', 'Phạm vi', r.filter.ev ? r.evName(r.filter.ev) : 'Tất cả sự kiện']]));

      // ---- số liệu chính
      ch.push(H('I. SỐ LIỆU TỔNG HỢP'));
      const kp = [['Tổng tạm ứng', r.tu], ['Thực chi', r.spent], ['Đề nghị hoàn ứng', r.hu], ['Đề nghị thanh toán', r.tt], ['Tạm ứng − Thực chi', r.tu - r.spent], ['Có HĐ VAT', (r.spent ? Math.round(r.vat / r.spent * 100) : 0) + '%']];
      const kw = scale([1, 1, 1]);
      const kcell = (k, i) => C([P(R(k[0].toUpperCase(), { b: true, size: 15, color: '7A6A8C' }), { al: AL.CENTER, after: 30 }),
        P(R(typeof k[1] === 'number' ? U.groupThousand(k[1]) + ' đ' : k[1], { b: true, size: 26, color: typeof k[1] === 'number' && k[1] < 0 ? 'C0392B' : PURPLE }), { al: AL.CENTER, after: 0 })],
        { w: kw[i % 3], fill: ZEBRA, borders: { top: { style: X.BorderStyle.SINGLE, size: 18, color: i % 2 ? PINK : PURPLE }, bottom: L, left: L, right: L } });
      ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: kw, layout: X.TableLayoutType.FIXED,
        rows: [new X.TableRow({ children: kp.slice(0, 3).map(kcell) }), new X.TableRow({ children: kp.slice(3).map((k, i) => kcell(k, i + 3)) })] }));
      ch.push(P(R(r.expenses.length + ' khoản chi · ' + r.docs.length + ' phiếu · ' + r.byEvent.length + ' sự kiện / đợt chi', { i: true, size: 17, color: '666666' }), { al: AL.CENTER, before: 60 }));

      // ---- theo sự kiện
      ch.push(H('II. TỔNG HỢP THEO SỰ KIỆN / ĐỢT CHI'));
      const ew = scale([0.75, 3, 1.4, 0.85, 1.4, 1.4, 1.4, 1.45]);
      ch.push(table(ew, ['STT', 'Sự kiện / đợt chi', 'Ngày', 'Số khoản', 'Tạm ứng', 'Thực chi', 'Có HĐ VAT', 'Dư (+) / Vượt (−)'],
        r.byEvent.map((x, i) => [String(i + 1), x.ev.name, x.ev.date ? U.fmtDate(x.ev.date) : '', String(x.count), x.tu, x.spent, x.vat, x.tu - x.spent]),
        ['', 'CỘNG', '', String(r.expenses.length), r.byEvent.reduce((a, x) => a + x.tu, 0), r.spent, r.vat, r.byEvent.reduce((a, x) => a + x.tu - x.spent, 0)]));

      // ---- chi tiết từng sự kiện
      ch.push(H('III. CHI TIẾT KHOẢN CHI'));
      const dw = scale([0.75, 1, 3.2, 1.3, 1.35, 1.4, 2]);
      r.byEvent.filter((x) => x.count).forEach((x) => {
        ch.push(P([R(x.ev.name, { b: true, size: 21 }), R('   ' + x.count + ' khoản · ' + U.groupThousand(x.spent) + ' đ', { size: 18, color: '666666' })], { before: 120, after: 60, keepNext: true }));
        ch.push(table(dw, ['STT', 'Ngày', 'Nội dung', 'Phân loại', 'Hoá đơn', 'Số tiền', 'Ghi chú'],
          x.list.map((e, i) => [String(i + 1), U.fmtDayMonth(e.date), e.content || '', e.category || 'Khác', VAT_T[App.vatTypeOf(e)], U.toNumber(e.amount), [e.participants, e.ghiChu].filter(Boolean).join(' · ')]),
          ['', 'Cộng', '', '', '', x.spent, '']));
      });
      if (!r.expenses.length) ch.push(P(R('Không có khoản chi trong phạm vi báo cáo.', { i: true, color: '888888' })));

      // ---- danh sách phiếu
      ch.push(H('IV. DANH SÁCH PHIẾU ĐỀ NGHỊ'));
      const pw = scale([0.75, 1.9, 1.1, 1.3, 3.1, 1.5, 1.5]);
      ch.push(r.docs.length ? table(pw, ['STT', 'Số phiếu', 'Loại', 'Ngày lập', 'Nội dung', 'Số tiền', 'Trạng thái'],
        r.docs.map((d, i) => [String(i + 1), d.soPhieu || '', D.TYPES[d.type] ? D.TYPES[d.type].label : '', d.ngayLap ? U.fmtDate(d.ngayLap) : '', d.noiDung || '', D.total(d), D.statusOf(d.status).t]),
        ['', 'Cộng', '', '', '', r.docs.reduce((a, d) => a + D.total(d), 0), '']) : P(R('Không có phiếu trong phạm vi báo cáo.', { i: true, color: '888888' })));

      // ---- phụ lục ảnh minh chứng
      if (opts.images) {
        const withImg = r.expenses.filter((e) => (r.imgBy[e.id] || []).some((im) => im.blob && im.kind === 'image'));
        if (withImg.length) {
          ch.push(new X.Paragraph({ children: [new X.PageBreak()] }));
          ch.push(H('PHỤ LỤC: ẢNH MINH CHỨNG'));
          let n = 0;
          for (const e of withImg) {
            ch.push(P([R(++n + '. ' + (e.content || ''), { b: true, size: 19 }), R('  ·  ' + U.fmtDate(e.date) + '  ·  ' + U.groupThousand(e.amount) + ' đ', { size: 18, color: '666666' })], { before: 120, after: 60, keepNext: true }));
            const ims = (r.imgBy[e.id] || []).filter((im) => im.blob && im.kind === 'image');
            const half = Math.floor(CW / 2);
            for (let i = 0; i < ims.length; i += 2) {
              const cells = [];
              for (const im of ims.slice(i, i + 2)) {
                try {
                  const p = await prepImage(im.blob, 300);
                  cells.push(C([P(new X.ImageRun({ type: 'jpg', data: p.data, transformation: { width: p.width, height: p.height } }), { al: AL.CENTER, after: 30 }),
                    P(R(im.note || '', { i: true, size: 16, color: '666666' }), { al: AL.CENTER, after: 0 })], { w: half, borders: NOB }));
                } catch (er) { cells.push(C(P(R('(không đọc được ảnh)', { i: true, size: 16 })), { w: half, borders: NOB })); }
              }
              while (cells.length < 2) cells.push(C(P(R('')), { w: half, borders: NOB }));
              ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: [half, CW - half], layout: X.TableLayoutType.FIXED, rows: [new X.TableRow({ cantSplit: true, children: cells })] }));
            }
          }
        }
      }

      // ---- chữ ký
      ch.push(P(R(D.dateLine(U.todayISO()), { i: true }), { al: AL.RIGHT, before: 300, after: 60, keepNext: true }));
      const sw = scale([1, 1, 1]);
      const sig = [['NGƯỜI LẬP', o.name || ''], ['KẾ TOÁN TRƯỞNG', s.keToanTruong || ''], [s.chucDanhPheDuyet || 'GIÁM ĐỐC', s.giamDoc || '']];
      ch.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: sw, layout: X.TableLayoutType.FIXED,
        rows: [new X.TableRow({ cantSplit: true, children: sig.map((x, i) => C([P(R(x[0], { b: true }), { al: AL.CENTER, after: 0 }), P(R('(Ký, ghi rõ họ tên)', { i: true, size: 16, color: '888888' }), { al: AL.CENTER, after: 900 }),
          P(R(x[1], { b: true }), { al: AL.CENTER, after: 0 })], { w: sw[i], borders: NOB })) })] }));

      const doc = new X.Document({
        creator: 'LtL Tạm ứng & Hoàn ứng', title: 'Báo cáo tổng hợp chi phí',
        styles: { default: { document: { run: { font: FONT, size: 20 } } } },
        sections: [{
          properties: { page: { size: { width: W, height: 16838 }, margin: { top: 720, bottom: 720, left: M, right: M } } },
          footers: { default: new X.Footer({ children: [new X.Paragraph({ alignment: AL.CENTER, children: [new X.TextRun({ text: 'Learn to Leap · Báo cáo tổng hợp · Trang ', size: 15, color: '999999', font: FONT }), new X.TextRun({ children: [X.PageNumber.CURRENT], size: 15, color: '999999', font: FONT })] })] }) },
          children: ch,
        }],
      });
      U.saveBlob(await X.Packer.toBlob(doc), opts.filename || fname(r, 'docx'));
      App.toast('Đã tạo báo cáo Word', 'ok');
    } catch (e) { console.error(e); App.toast('Lỗi tạo Word: ' + (e.message || e), 'err'); }
  }

  App.Report = { build, excel, word, period };

  /* ============================== Trang Báo cáo ============================== */
  App.screens['bao-cao'] = function (root) {
    const s = App.settings;
    const f = App.reportFilter || (App.reportFilter = { from: '', to: '', ev: '', forms: false, images: true });
    const src = { events: App.data.events, docs: App.data.docs, expenses: App.data.expenses, images: App.data.images, settings: s,
      owner: { name: s.hoTen, dept: s.boPhan, email: (App.cloud.user || {}).email } };
    const r = build(src, f);
    const nImg = r.expenses.reduce((a, e) => a + (r.imgBy[e.id] || []).filter((x) => x.kind === 'image').length, 0);
    const presets = [['Tháng này', 0], ['Tháng trước', -1], ['Quý này', 'q'], ['Năm nay', 'y'], ['Tất cả', null]];
    root.innerHTML = App.pageHead('Báo cáo tổng hợp', 'Xuất toàn bộ khoản chi và phiếu của bạn ra Excel / Word có logo nhận diện — dùng nộp kế toán hoặc lưu trữ.',
      '<button class="btn out" data-act="repWord">' + I('word') + 'Xuất Word</button><button class="btn accent" data-act="repExcel">' + I('excel') + 'Xuất Excel tổng hợp</button>', null, 'chart') +
      '<div class="card"><div class="card-h"><div class="t"><span class="tic">' + I('calendar') + '</span>Phạm vi báo cáo</div>' +
      '<div class="seg">' + presets.map((p) => '<button data-act="repPreset:' + p[1] + '">' + p[0] + '</button>').join('') + '</div></div>' +
      '<div class="card-b"><div class="fgrid c3">' +
      App.ui.date('rp-from', 'Từ ngày', f.from, { change: 'repFilter' }) + App.ui.date('rp-to', 'Đến ngày', f.to, { change: 'repFilter' }) +
      App.ui.select('rp-ev', 'Sự kiện / đợt chi', f.ev, [{ v: '', t: 'Tất cả sự kiện' }].concat(App.data.events.map((e) => ({ v: e.id, t: e.name }))), { change: 'repFilter' }) + '</div>' +
      '<div class="row" style="gap:18px"><label class="check"><input type="checkbox" id="rp-forms"' + (f.forms ? ' checked' : '') + ' data-change="repFilter"> Excel: kèm từng phiếu theo mẫu (mỗi phiếu 1 tab)</label>' +
      '<label class="check"><input type="checkbox" id="rp-img"' + (f.images ? ' checked' : '') + ' data-change="repFilter"> Word: kèm phụ lục ảnh minh chứng (' + nImg + ' ảnh)</label></div></div></div>' +
      '<div class="kpis k5 mt16">' +
      App.kpi('file', 'Tổng tạm ứng', money(r.tu), r.docs.filter((d) => d.type === 'TU').length + ' phiếu') +
      App.kpi('receipt', 'Thực chi', money(r.spent), r.expenses.length + ' khoản chi', 'c2') +
      App.kpi('wallet', 'Đề nghị hoàn ứng', money(r.hu), r.docs.filter((d) => d.type === 'HU').length + ' phiếu', 'c3') +
      App.kpi('calc', 'Đề nghị thanh toán', money(r.tt), r.docs.filter((d) => d.type === 'TT').length + ' phiếu') +
      App.kpi('alert', 'Tạm ứng − Thực chi', '<span class="' + (r.tu - r.spent >= 0 ? 'pos' : 'neg') + '">' + money(r.tu - r.spent) + '</span>', 'VAT ' + (r.spent ? Math.round(r.vat / r.spent * 100) : 0) + '% giá trị', 'c4') +
      '</div>' +
      '<div class="grid g-side mt16">' +
      '<div class="card"><div class="card-h"><div class="t"><span class="tic">' + I('calendar') + '</span>Theo sự kiện / đợt chi</div></div><div class="card-b flush">' +
      (r.byEvent.length ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Sự kiện</th><th class="num">Khoản</th><th class="num">Tạm ứng</th><th class="num">Thực chi</th><th class="num">Dư / vượt</th></tr></thead><tbody>' +
        r.byEvent.map((x) => '<tr><td data-l="Sự kiện"><b>' + esc(x.ev.name) + '</b><span class="sub">' + esc(x.ev.date ? U.fmtDate(x.ev.date) : '') + '</span></td><td class="num" data-l="Khoản">' + x.count + '</td>' +
          '<td class="num" data-l="Tạm ứng">' + money(x.tu) + '</td><td class="num b" data-l="Thực chi">' + money(x.spent) + '</td><td class="num ' + (x.tu - x.spent >= 0 ? 'pos' : 'neg') + '" data-l="Dư / vượt">' + U.groupThousand(x.tu - x.spent) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>Cộng</td><td class="num">' + r.expenses.length + '</td><td class="num">' + money(r.byEvent.reduce((a, x) => a + x.tu, 0)) + '</td><td class="num">' + money(r.spent) + '</td><td></td></tr></tfoot></table></div>'
        : App.emptyState('receipt', 'Không có dữ liệu trong phạm vi', 'Đổi khoảng thời gian hoặc sự kiện.')) + '</div></div>' +
      '<div class="card"><div class="card-h"><div class="t"><span class="tic">' + I('chart') + '</span>Theo phân loại</div></div><div class="card-b">' +
      (Object.keys(r.cats).length ? Object.keys(r.cats).sort((a, b) => r.cats[b].amount - r.cats[a].amount).map((c) => {
        const p = r.spent ? Math.round(r.cats[c].amount / r.spent * 100) : 0;
        return '<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between;font-size:13.5px"><span class="b">' + esc(c) + ' <span class="muted" style="font-weight:400">· ' + r.cats[c].count + ' khoản</span></span><span>' + money(r.cats[c].amount) + '</span></div>' +
          '<div class="progress mt4"><span style="width:' + p + '%"></span></div></div>';
      }).join('') : '<p class="muted">Chưa có khoản chi.</p>') +
      '<div class="alert info mt16">' + I('info') + '<div>File Excel gồm các tab <b>Tổng hợp</b>, <b>Chi tiết khoản chi</b> (có lọc), <b>Danh sách phiếu</b>' + (f.forms ? ' và từng phiếu theo mẫu' : '') + '. Word có logo, bảng tổng hợp, chi tiết theo sự kiện' + (f.images ? ', phụ lục ảnh' : '') + ' và ô ký.</div></div>' +
      '</div></div></div>';
  };

  function presetRange(p) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    if (p === 'null') return ['', ''];
    if (p === 'y') return [y + '-01-01', iso(d)];
    if (p === 'q') { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(d)]; }
    const k = +p; return [iso(new Date(y, m + k, 1)), iso(new Date(y, m + k + 1, 0))];
  }
  App.inputCb.repFilter = function () {
    const f = App.reportFilter;
    f.from = App.val('rp-from'); f.to = App.val('rp-to'); f.ev = App.val('rp-ev');
    f.forms = document.getElementById('rp-forms').checked; f.images = document.getElementById('rp-img').checked;
    App.render();
  };
  function current() {
    const s = App.settings;
    return build({ events: App.data.events, docs: App.data.docs, expenses: App.data.expenses, images: App.data.images, settings: s,
      owner: { name: s.hoTen, dept: s.boPhan, email: (App.cloud.user || {}).email } }, App.reportFilter || {});
  }
  Object.assign(App.actions, {
    repPreset(p) { const [a, b] = presetRange(p); App.reportFilter.from = a; App.reportFilter.to = b; App.render(); },
    async repExcel() { App.toast('Đang tạo báo cáo Excel…'); await excel(current(), { forms: App.reportFilter.forms }); },
    async repWord() { App.toast('Đang tạo báo cáo Word…'); await word(current(), { images: App.reportFilter.images }); },
  });
})();
