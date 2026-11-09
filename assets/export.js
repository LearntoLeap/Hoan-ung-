/* =========================================================================
   export.js — Xuất phiếu ra Word (.docx) và Excel (.xlsx) theo đúng mẫu
   "Mau_ho_so_thanh_toan_LTL_2026.xlsx" (tab Phiếu, mẫu số 01-TT/LTL):
   cột A–H, Times New Roman, tím #6B3DBE, đầu bảng #E9E0F7, viền #BFBFBF,
   số tiền/ô điền màu đỏ như bản mẫu, logo LtL, khối quyết toán cho hoàn ứng.
   Excel: mỗi phiếu một tab (giống hướng dẫn của mẫu), giữ công thức Thành tiền/CỘNG.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App;
  const Docs = () => App.Docs;
  const PURPLE = '6B3DBE', RED = 'FF0000', HEAD = 'E9E0F7', SUMBG = 'F3EDFB', GRID = 'BFBFBF', GRAY = '808080';
  const FONT = 'Times New Roman';

  let _logo = null;
  async function logoBytes() {
    if (_logo) return _logo;
    try {
      const r = await fetch('assets/templates/logo-ltl.png');
      if (!r.ok) throw new Error('logo');
      _logo = new Uint8Array(await r.arrayBuffer());
    } catch (e) { _logo = null; }
    return _logo;
  }
  function settingsFor() { return App.settings || App.DEFAULT_SETTINGS; }
  function isoToDate(iso) {
    if (!iso) return null;
    const p = String(iso).slice(0, 10).split('-').map(Number);
    if (p.length < 3 || !p[0]) return null;
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  /* ================================ EXCEL ================================ */
  const COLW = [5.5, 20.5, 11.5, 18, 9, 13, 15.5, 20];
  const NUMFMT = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';

  function font(o) {
    o = o || {};
    return { name: FONT, size: o.size || 12, bold: !!o.b, italic: !!o.i, color: { argb: 'FF' + (o.color || '000000') } };
  }
  const thin = { style: 'thin', color: { argb: 'FF' + GRID } };
  const boxBorder = { top: thin, left: thin, bottom: thin, right: thin };

  function sheetName(base, used) {
    let n = String(base || 'Phieu').replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Phieu';
    let k = 2, out = n;
    while (used.has(out.toLowerCase())) { const suf = ' (' + k++ + ')'; out = n.slice(0, 31 - suf.length) + suf; }
    used.add(out.toLowerCase());
    return out;
  }
  // ước lượng chiều cao dòng theo độ dài chữ trong ô (ExcelJS không tự giãn dòng)
  function fitHeight(text, widthChars, base, perLine) {
    const lines = String(text || '').split('\n').reduce((s, ln) => s + Math.max(1, Math.ceil(ln.length / Math.max(4, widthChars))), 0);
    return Math.max(base, lines * perLine + 4);
  }

  function buildSheet(wb, ws, d, s, logoId) {
    const D = Docs();
    const L = D.labels(d);
    const items = D.filledItems(d);
    const hu = d.type === 'HU';
    ws.columns = COLW.map((w) => ({ width: w }));
    ws.properties.defaultRowHeight = 16.5;
    ws.views = [{ showGridLines: false }];

    const set = (addr, v, f, al, extra) => {
      const c = ws.getCell(addr);
      c.value = v;
      c.font = font(f);
      c.alignment = Object.assign({ vertical: 'middle', wrapText: true }, al || {});
      if (extra) Object.assign(c, extra);
      return c;
    };
    const merge = (rng) => { try { ws.mergeCells(rng); } catch (e) {} };
    const height = (r, h) => { ws.getRow(r).height = h; };

    // ---- 1–4: đầu phiếu
    merge('A1:B4');
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.25 }, ext: { width: 148, height: 64 }, editAs: 'oneCell' });
    [[1, s.company, { b: true, size: 10, color: PURPLE }],
     [2, s.companyAddr, { size: 10 }],
     [3, 'Mã số thuế: ' + s.mst + '   |   ĐT: ' + s.phone + '   |   Email: ' + s.email, { size: 10 }],
     [4, 'TK: ' + s.bankLine, { size: 10 }]].forEach(([r, v, f]) => { merge('C' + r + ':H' + r); set('C' + r, v, f, { horizontal: 'left', wrapText: false }); height(r, 16.5); });
    for (let c = 1; c <= 8; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF' + PURPLE } } };
    height(5, 6); height(6, 6);

    // ---- 7–9: tiêu đề, mẫu số, kính gửi
    merge('A7:H7'); set('A7', L.title, { b: true, size: 14, color: PURPLE }, { horizontal: 'center' }); height(7, 21.75);
    merge('G8:H8'); set('G8', 'Mẫu số: ' + s.mauSo + '\nLần ban hành: ' + s.lanBanHanh + '\nNgày áp dụng: ' + s.ngayApDung, { size: 10, color: RED }, { horizontal: 'center' }); height(8, 40.5);
    merge('B9:H9'); set('B9', 'Kính gửi: ' + s.kinhGui, { b: true, size: 12, color: PURPLE }, { horizontal: 'left' }); height(9, 18);
    height(10, 10);

    // ---- 11–13: thông tin phiếu
    const lab = (rng, text) => { merge(rng); set(rng.split(':')[0], text, { b: true }, { horizontal: 'right', wrapText: false }); };
    const box = (rng, v, f, al, numFmt) => {
      merge(rng);
      const c = set(rng.split(':')[0], v, f, Object.assign({ horizontal: 'left' }, al || {}));
      if (numFmt) c.numFmt = numFmt;
      const [a, b] = rng.split(':'); const r = ws.getCell(a).row; const c1 = ws.getCell(a).col, c2 = ws.getCell(b).col;
      for (let k = c1; k <= c2; k++) ws.getCell(r, k).border = boxBorder;
      return c;
    };
    lab('A11:B11', 'Loại phiếu:'); box('C11:D11', D.TYPES[d.type].label, { b: true, color: RED });
    lab('E11:F11', 'Số phiếu:'); box('G11:H11', d.soPhieu, { b: true, color: PURPLE });
    lab('A12:B12', 'Người đề nghị:'); box('C12:D12', d.nguoiDeNghi, { color: RED });
    lab('E12:F12', 'Ngày lập:'); box('G12:H12', isoToDate(d.ngayLap), { color: RED }, null, 'dd/mm/yyyy');
    lab('A13:B13', 'Bộ phận:'); box('C13:D13', d.boPhan, { color: RED });
    [11, 12, 13].forEach((r) => height(r, 18.75));

    // ---- 14–17: số tiền, bằng chữ, nội dung, mục đích
    const r0 = 20, n = Math.max(1, items.length), rSum = r0 + n;
    merge('B14:F14'); set('B14', L.amount, { b: true }, { horizontal: 'left', wrapText: false });
    merge('G14:H14'); const ca = set('G14', { formula: 'G' + rSum, result: D.total(d) }, { b: true, color: RED }, { horizontal: 'right' }); ca.numFmt = NUMFMT;
    height(14, 18.75);
    const tot = D.total(d);
    const line = (r, label, val, f, h) => {
      set('B' + r, label, { b: true }, { horizontal: 'left', vertical: 'top', wrapText: false });
      merge('C' + r + ':H' + r); set('C' + r, val, Object.assign({ color: RED }, f || {}), { horizontal: 'left', vertical: 'top' });
      height(r, fitHeight(val, 95, h || 18.75, 15.5));
    };
    line(15, 'Bằng chữ:', tot ? App.docSo(tot) : '', { i: true }, 22);
    line(16, 'Nội dung:', d.noiDung || '', null, 20);
    line(17, 'Mục đích:', d.mucDich || '', null, 18.75);
    merge('A18:H18'); set('A18', L.caption + '   ' + L.captionNote, { i: true }, { horizontal: 'left', wrapText: false }); height(18, 18);

    // ---- 19: đầu bảng kê
    ['STT', 'Nội dung', 'Ngày chi', 'Người tham gia', 'Số lượng', 'Đơn giá', 'Thành tiền (VNĐ)', 'Ghi chú'].forEach((t, i) => {
      const c = ws.getCell(19, i + 1);
      c.value = t; c.font = font({ b: true }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEAD } }; c.border = boxBorder;
    });
    height(19, 33);

    // ---- 20..: dòng bảng kê
    (items.length ? items : [D.blankItem()]).forEach((it, i) => {
      const r = r0 + i;
      const sl = String(it.soLuong == null ? '' : it.soLuong).trim();
      const slNum = sl === '' ? null : (isFinite(parseFloat(sl.replace(',', '.'))) ? parseFloat(sl.replace(',', '.')) : sl);
      const dg = U.toNumber(it.donGia) || null;
      const vals = [items.length ? i + 1 : null, it.noiDung || null, isoToDate(it.ngayChi), it.nguoiThamGia || null, slNum, dg,
        { formula: 'IF($F' + r + '="","",IF($E' + r + '="",$F' + r + ',$E' + r + '*$F' + r + '))', result: D.lineTotal(it) || '' }, it.ghiChu || null];
      const al = ['center', 'left', 'center', 'left', 'center', 'right', 'right', 'left'];
      vals.forEach((v, k) => {
        const c = ws.getCell(r, k + 1);
        c.value = v; c.font = font({ size: 11 }); c.alignment = { horizontal: al[k], vertical: 'middle', wrapText: true }; c.border = boxBorder;
        if (k === 2) c.numFmt = 'dd/mm/yyyy';
        if (k === 5 || k === 6) c.numFmt = NUMFMT;
      });
      height(r, Math.max(30, fitHeight(it.noiDung, 20, 30, 14), fitHeight(it.ghiChu, 19, 30, 14), fitHeight(it.nguoiThamGia, 17, 30, 14)));
    });

    // ---- CỘNG
    merge('A' + rSum + ':F' + rSum);
    const cs = set('A' + rSum, 'CỘNG', { b: true }, { horizontal: 'center' });
    for (let k = 1; k <= 6; k++) { const c = ws.getCell(rSum, k); c.border = boxBorder; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEAD } }; }
    void cs;
    const cg = set('G' + rSum, { formula: 'SUM($G$' + r0 + ':$G$' + (rSum - 1) + ')', result: tot }, { b: true, color: PURPLE }, { horizontal: 'right' });
    cg.numFmt = NUMFMT; cg.border = boxBorder; cg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SUMBG } };
    ws.getCell('H' + rSum).border = boxBorder;
    height(rSum, 21.75);

    // ---- Thông tin nhận tiền
    let r = rSum + 1;
    merge('A' + r + ':H' + r); set('A' + r, L.receive, { b: true }, { horizontal: 'left', wrapText: false }); height(r, 18); r++;
    const under = (rng, v, f) => {
      merge(rng); const c = set(rng.split(':')[0], v, Object.assign({ color: RED }, f || {}), { horizontal: 'left' });
      const [a, b] = rng.split(':'); const c1 = ws.getCell(a).col, c2 = ws.getCell(b).col;
      for (let k = c1; k <= c2; k++) ws.getCell(r, k).border = { bottom: thin };
      return c;
    };
    lab('A' + r + ':B' + r, 'Tên tài khoản:'); under('C' + r + ':H' + r, d.tenTK || '', { b: true }); height(r, 19.5); r++;
    lab('A' + r + ':B' + r, 'Số tài khoản:'); under('C' + r + ':D' + r, d.soTK ? String(d.soTK) : '');
    lab('E' + r + ':F' + r, 'Tại ngân hàng:'); under('G' + r + ':H' + r, d.nganHang || ''); height(r, 19.5); r++;
    merge('A' + r + ':B' + r); set('A' + r, 'Đề nghị khác:', { b: true }, { horizontal: 'right', vertical: 'top', wrapText: false });
    merge('C' + r + ':H' + r); set('C' + r, d.deNghiKhac || '', { color: RED }, { horizontal: 'left', vertical: 'top' }); height(r, fitHeight(d.deNghiKhac, 95, 31.5, 15.5)); r++;

    // ---- Khối quyết toán (chỉ phiếu hoàn ứng)
    if (hu) {
      const st = D.settle(d);
      merge('A' + r + ':B' + r); set('A' + r, 'Phiếu tạm ứng số:', { b: true, color: PURPLE }, { horizontal: 'right', wrapText: false });
      merge('C' + r + ':D' + r); set('C' + r, d.tuSoPhieu || '', { b: true, color: RED }, { horizontal: 'left' });
      merge('E' + r + ':F' + r); set('E' + r, 'Số tiền đã tạm ứng:', { b: true, color: PURPLE }, { horizontal: 'left', wrapText: false });
      merge('G' + r + ':H' + r); const cv = set('G' + r, st.has ? st.adv : null, { b: true, color: RED }, { horizontal: 'right' }); cv.numFmt = NUMFMT;
      height(r, 19.5); r++;
      merge('A' + r + ':H' + r); set('A' + r, st.line, {}, { horizontal: 'left', wrapText: false }); height(r, 19.5); r++;
      merge('A' + r + ':H' + r); set('A' + r, st.concl, { b: true, color: RED }, { horizontal: 'left', wrapText: false }); height(r, 19.5); r++;
    }

    // ---- Ngày, chữ ký
    r++;
    merge('F' + r + ':H' + r); set('F' + r, D.dateLine(d.ngayLap), { i: true }, { horizontal: 'center' }); height(r, 18); r++;
    const sig = [['A', 'B', 'NGƯỜI ĐỀ NGHỊ', '(Ký, ghi rõ họ tên)', d.nguoiDeNghi || ''], ['C', 'D', 'TRƯỞNG BỘ PHẬN', '(Ký, họ tên)', d.truongBoPhan || ''],
      ['E', 'F', 'KẾ TOÁN TRƯỞNG', '(Ký, họ tên)', s.keToanTruong || ''], ['G', 'H', s.chucDanhPheDuyet || 'GIÁM ĐỐC', '( Phê duyệt, ký, họ tên)', s.giamDoc || '']];
    sig.forEach(([a, b, t]) => { merge(a + r + ':' + b + r); set(a + r, t, { b: true }, { horizontal: 'center' }); }); height(r, 18); r++;
    sig.forEach(([a, b, , sub]) => { merge(a + r + ':' + b + r); set(a + r, sub, { i: true, size: 11, color: GRAY }, { horizontal: 'center' }); }); height(r, 15.75); r++;
    height(r, 18); height(r + 1, 18); height(r + 2, 18); r += 3;
    sig.forEach(([a, b, , , nm]) => { merge(a + r + ':' + b + r); set(a + r, nm, { b: true }, { horizontal: 'center' }); }); height(r, 18);

    ws.pageSetup = {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: items.length > 14 ? 0 : 1,
      horizontalCentered: true, printArea: 'A1:H' + r,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    };
  }

  async function excel(docs, filename) {
    if (!docs || !docs.length) return;
    try {
      const ExcelJS = await App.ensureLib('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'LtL Tạm ứng & Hoàn ứng';
      wb.created = new Date();
      wb.calcProperties = { fullCalcOnLoad: true };
      const bytes = await logoBytes();
      const logoId = bytes ? wb.addImage({ buffer: bytes, extension: 'png' }) : null;
      const used = new Set();
      const s = settingsFor();
      for (const d of docs) {
        const ws = wb.addWorksheet(sheetName(d.soPhieu, used), { pageSetup: { paperSize: 9, orientation: 'portrait' } });
        buildSheet(wb, ws, d, s, logoId);
      }
      const buf = await wb.xlsx.writeBuffer();
      U.saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename || Docs().fileName(docs[0], 'xlsx'));
      App.toast('Đã tạo file Excel', 'ok');
    } catch (e) {
      console.error(e);
      App.toast('Lỗi tạo Excel: ' + (e.message || e), 'err');
    }
  }

  /* ================================ WORD ================================ */
  // Khổ A4, lề 0,5" như bản in mẫu; độ rộng cột tỉ lệ đúng cột A–H của Excel.
  const PAGE_W = 11906, MARGIN = 720, CW = PAGE_W - 2 * MARGIN;
  const COLS = (() => { const sum = COLW.reduce((a, b) => a + b, 0); const w = COLW.map((x) => Math.round(x / sum * CW)); w[7] += CW - w.reduce((a, b) => a + b, 0); return w; })();
  const span = (a, b) => COLS.slice(a, b + 1).reduce((x, y) => x + y, 0);

  async function word(d) {
    try {
      const D = Docs();
      const X = await App.ensureLib('docx');
      const s = settingsFor();
      const L = D.labels(d);
      const items = D.filledItems(d);
      const tot = D.total(d);
      const hu = d.type === 'HU';
      const NONE = { style: X.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const NOB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
      const LINE = { style: X.BorderStyle.SINGLE, size: 4, color: GRID };
      const BOX = { top: LINE, bottom: LINE, left: LINE, right: LINE };
      const UNDER = { top: NONE, left: NONE, right: NONE, bottom: LINE };

      const R = (t, o) => { o = o || {}; return new X.TextRun({ text: t == null ? '' : String(t), bold: !!o.b, italics: !!o.i, size: o.size || 24, color: o.color, font: FONT, break: o.br }); };
      const P = (runs, o) => {
        o = o || {};
        return new X.Paragraph({
          alignment: o.al || X.AlignmentType.LEFT,
          spacing: { before: o.before || 0, after: o.after || 0, line: o.line || 240 },
          indent: o.indent, border: o.border, keepNext: o.keepNext,
          children: Array.isArray(runs) ? runs : [runs],
        });
      };
      const C = (children, o) => {
        o = o || {};
        return new X.TableCell({
          columnSpan: o.span, width: { size: o.w, type: X.WidthType.DXA },
          borders: o.borders || NOB, verticalAlign: o.va || X.VerticalAlign.CENTER,
          shading: o.fill ? { fill: o.fill, type: X.ShadingType.CLEAR, color: 'auto' } : undefined,
          margins: { top: o.mt == null ? 30 : o.mt, bottom: o.mb == null ? 30 : o.mb, left: o.ml == null ? 60 : o.ml, right: o.ml == null ? 60 : o.ml },
          children: Array.isArray(children) ? children : [children],
        });
      };
      const tc = (text, a, b, o) => { o = o || {}; return C(P(R(text, o), { al: o.al }), Object.assign({ span: b - a + 1, w: span(a, b) }, o)); };
      const T = (rows, o) => new X.Table({
        width: { size: CW, type: X.WidthType.DXA }, columnWidths: COLS, layout: X.TableLayoutType.FIXED,
        borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
        rows: rows.map((cells) => new X.TableRow({ children: cells, cantSplit: true, height: (o && o.h) ? { value: o.h, rule: X.HeightRule.ATLEAST } : undefined })),
      });
      const AL = X.AlignmentType;
      const children = [];

      // ---- Đầu phiếu: logo + thông tin công ty, gạch tím
      const logo = await logoBytes();
      const headLeft = logo ? P(new X.ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 65 } })) : P(R('Learn to Leap', { b: true, color: PURPLE }));
      const headRight = [
        P(R(s.company, { b: true, size: 20, color: PURPLE }), { line: 260 }),
        P(R(s.companyAddr, { size: 20 }), { line: 260 }),
        P(R('Mã số thuế: ' + s.mst + '   |   ĐT: ' + s.phone + '   |   Email: ' + s.email, { size: 20 }), { line: 260 }),
        P(R('TK: ' + s.bankLine, { size: 20 }), { line: 260 }),
      ];
      children.push(new X.Table({
        width: { size: CW, type: X.WidthType.DXA }, columnWidths: [span(0, 1), span(2, 7)], layout: X.TableLayoutType.FIXED,
        borders: { top: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE, bottom: NONE },
        rows: [new X.TableRow({ children: [C(headLeft, { w: span(0, 1), mb: 60 }), C(headRight, { w: span(2, 7), mb: 60 })] })],
      }));
      // gạch tím dưới đầu phiếu (dùng viền đoạn văn — hiển thị ổn định ở cả Word & WPS)
      children.push(P(R('', { size: 4 }), { border: { bottom: { style: X.BorderStyle.SINGLE, size: 18, color: PURPLE, space: 1 } } }));

      // ---- Tiêu đề + mẫu số + kính gửi
      children.push(P(R(L.title, { b: true, size: 28, color: PURPLE }), { al: AL.CENTER, before: 200, after: 40 }));
      children.push(T([[tc('', 0, 5), C([
        P(R('Mẫu số: ' + s.mauSo, { size: 20, color: RED }), { al: AL.CENTER }),
        P(R('Lần ban hành: ' + s.lanBanHanh, { size: 20, color: RED }), { al: AL.CENTER }),
        P(R('Ngày áp dụng: ' + s.ngayApDung, { size: 20, color: RED }), { al: AL.CENTER }),
      ], { span: 2, w: span(6, 7) })]]));
      children.push(T([[tc('', 0, 0), tc('Kính gửi: ' + s.kinhGui, 1, 7, { b: true, color: PURPLE })]]));
      children.push(P(R(''), { after: 120 }));

      // ---- Loại phiếu / số phiếu / người đề nghị / ngày lập / bộ phận
      const infoRow = (l1, v1, f1, l2, v2, f2) => [
        tc(l1, 0, 1, { b: true, al: AL.RIGHT }), tc(v1, 2, 3, Object.assign({ borders: BOX }, f1)),
        tc(l2 || '', 4, 5, { b: true, al: AL.RIGHT }), l2 ? tc(v2, 6, 7, Object.assign({ borders: BOX }, f2)) : tc('', 6, 7),
      ];
      children.push(T([
        infoRow('Loại phiếu:', D.TYPES[d.type].label, { b: true, color: RED }, 'Số phiếu:', d.soPhieu, { b: true, color: PURPLE }),
        infoRow('Người đề nghị:', d.nguoiDeNghi, { color: RED }, 'Ngày lập:', d.ngayLap ? U.fmtDate(d.ngayLap) : '', { color: RED }),
        infoRow('Bộ phận:', d.boPhan, { color: RED }, '', '', {}),
      ], { h: 340 }));

      // ---- Số tiền, bằng chữ, nội dung, mục đích
      children.push(T([
        [tc('', 0, 0), tc(L.amount, 1, 5, { b: true }), tc(tot ? U.groupThousand(tot) : '', 6, 7, { b: true, color: RED, al: AL.RIGHT })],
        [tc('', 0, 0), tc('Bằng chữ:', 1, 1, { b: true, va: X.VerticalAlign.TOP }), tc(tot ? App.docSo(tot) : '', 2, 7, { i: true, color: RED })],
        [tc('', 0, 0), tc('Nội dung:', 1, 1, { b: true, va: X.VerticalAlign.TOP }), tc(d.noiDung || '', 2, 7, { color: RED })],
        [tc('', 0, 0), tc('Mục đích:', 1, 1, { b: true, va: X.VerticalAlign.TOP }), tc(d.mucDich || '', 2, 7, { color: RED })],
      ], { h: 380 }));
      children.push(P([R(L.caption + '   ', { i: true }), R(L.captionNote, { i: true })], { before: 80, after: 40 }));

      // ---- Bảng kê
      const hd = ['STT', 'Nội dung', 'Ngày chi', 'Người tham gia', 'Số lượng', 'Đơn giá', 'Thành tiền (VNĐ)', 'Ghi chú'];
      const rows = [new X.TableRow({
        tableHeader: true, cantSplit: true, height: { value: 520, rule: X.HeightRule.ATLEAST },
        children: hd.map((t, i) => C(P(R(t, { b: true, size: i === 0 ? 22 : 24 }), { al: AL.CENTER }), { w: COLS[i], borders: BOX, fill: HEAD, ml: 20 })),
      })];
      const al = [AL.CENTER, AL.LEFT, AL.CENTER, AL.LEFT, AL.CENTER, AL.RIGHT, AL.RIGHT, AL.LEFT];
      (items.length ? items : [D.blankItem()]).forEach((it, i) => {
        const tt = D.lineTotal(it);
        const v = [items.length ? String(i + 1) : '', it.noiDung, it.ngayChi ? U.fmtDate(it.ngayChi) : '', it.nguoiThamGia, it.soLuong,
          U.toNumber(it.donGia) ? U.groupThousand(it.donGia) : '', tt ? U.groupThousand(tt) : '', it.ghiChu];
        rows.push(new X.TableRow({
          cantSplit: true, height: { value: 600, rule: X.HeightRule.ATLEAST },
          children: v.map((t, k) => C(P(R(t, { size: k === 2 ? 21 : 22 }), { al: al[k] }), { w: COLS[k], borders: BOX, ml: 30 })),
        }));
      });
      rows.push(new X.TableRow({
        cantSplit: true, height: { value: 430, rule: X.HeightRule.ATLEAST },
        children: [C(P(R('CỘNG', { b: true }), { al: AL.CENTER }), { span: 6, w: span(0, 5), borders: BOX, fill: HEAD }),
          C(P(R(U.groupThousand(tot), { b: true, color: PURPLE }), { al: AL.RIGHT }), { w: COLS[6], borders: BOX, fill: SUMBG }),
          C(P(R('')), { w: COLS[7], borders: BOX })],
      }));
      children.push(new X.Table({ width: { size: CW, type: X.WidthType.DXA }, columnWidths: COLS, layout: X.TableLayoutType.FIXED, rows }));

      // ---- Thông tin nhận tiền
      children.push(P(R(L.receive, { b: true }), { before: 60, after: 20 }));
      const recv = [
        [tc('Tên tài khoản:', 0, 1, { b: true, al: AL.RIGHT }), tc(d.tenTK || '', 2, 7, { b: true, color: RED, borders: UNDER })],
        [tc('Số tài khoản:', 0, 1, { b: true, al: AL.RIGHT }), tc(d.soTK || '', 2, 3, { color: RED, borders: UNDER }),
          tc('Tại ngân hàng:', 4, 5, { b: true, al: AL.RIGHT }), tc(d.nganHang || '', 6, 7, { color: RED, borders: UNDER })],
        [tc('Đề nghị khác:', 0, 1, { b: true, al: AL.RIGHT, va: X.VerticalAlign.TOP }), tc(d.deNghiKhac || '', 2, 7, { color: RED, va: X.VerticalAlign.TOP })],
      ];
      children.push(T(recv, { h: 380 }));

      // ---- Quyết toán (hoàn ứng)
      if (hu) {
        const st = D.settle(d);
        children.push(P(R(''), { after: 60 }));
        const qw = [span(0, 1), span(2, 3), span(4, 6) - 900, span(7, 7) + 900];
        children.push(new X.Table({
          width: { size: CW, type: X.WidthType.DXA }, columnWidths: qw, layout: X.TableLayoutType.FIXED,
          borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
          rows: [new X.TableRow({ cantSplit: true, height: { value: 380, rule: X.HeightRule.ATLEAST }, children: [
            C(P(R('Phiếu tạm ứng số:', { b: true, color: PURPLE }), { al: AL.RIGHT }), { w: qw[0] }),
            C(P(R(d.tuSoPhieu || '', { b: true, color: RED })), { w: qw[1] }),
            C(P(R('Số tiền đã tạm ứng:', { b: true, color: PURPLE })), { w: qw[2] }),
            C(P(R(st.has ? U.groupThousand(st.adv) : '', { b: true, color: RED }), { al: AL.RIGHT }), { w: qw[3] })] })],
        }));
        children.push(P(R(st.line), { before: 40 }));
        children.push(P(R(st.concl, { b: true, color: RED }), { before: 40 }));
      }

      // ---- Ngày + chữ ký
      children.push(T([[tc('', 0, 4), tc(D.dateLine(d.ngayLap), 5, 7, { i: true, al: AL.CENTER })]]));
      const sig = [['NGƯỜI ĐỀ NGHỊ', '(Ký, ghi rõ họ tên)', d.nguoiDeNghi || ''], ['TRƯỞNG BỘ PHẬN', '(Ký, họ tên)', d.truongBoPhan || ''],
        ['KẾ TOÁN TRƯỞNG', '(Ký, họ tên)', s.keToanTruong || ''], [s.chucDanhPheDuyet || 'GIÁM ĐỐC', '( Phê duyệt, ký, họ tên)', s.giamDoc || '']];
      // 4 ô ký chia đều để chức danh / họ tên dài không bị xuống dòng
      const sw = Math.floor(CW / 4), SW = [sw, sw, sw, CW - 3 * sw];
      const sc = (t, i, o) => C(P(R(t, o), { al: AL.CENTER }), { w: SW[i], ml: 20 });
      children.push(new X.Table({
        width: { size: CW, type: X.WidthType.DXA }, columnWidths: SW, layout: X.TableLayoutType.FIXED,
        borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
        rows: [
          sig.map((x, i) => sc(x[0], i, { b: true })),
          sig.map((x, i) => sc(x[1], i, { i: true, size: 22, color: GRAY })),
          sig.map((x, i) => C([P(R('')), P(R('')), P(R('')), P(R(''))], { w: SW[i] })),
          sig.map((x, i) => sc(x[2], i, { b: true, size: x[2].length > 18 ? 22 : 24 })),
        ].map((cells) => new X.TableRow({ children: cells, cantSplit: true })),
      }));

      const doc = new X.Document({
        creator: 'LtL Tạm ứng & Hoàn ứng', title: L.title + ' ' + d.soPhieu,
        styles: { default: { document: { run: { font: FONT, size: 24 } } } },
        sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
      });
      const blob = await X.Packer.toBlob(doc);
      U.saveBlob(blob, D.fileName(d, 'docx'));
      App.toast('Đã tạo file Word', 'ok');
    } catch (e) {
      console.error(e);
      App.toast('Lỗi tạo Word: ' + (e.message || e), 'err');
    }
  }

  App.Export = { word, excel, _buildSheet: buildSheet, _logoBytes: logoBytes, _sheetName: sheetName, _isoToDate: isoToDate };
})();
