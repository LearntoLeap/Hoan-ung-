/* =========================================================================
   pdfgen.js — Xuất PDF gộp: Giấy đề nghị + Bảng kê + Ảnh minh chứng.
   Dùng html2canvas (chữ tiếng Việt chuẩn) → jsPDF (A4). Chạy offline.
   App.Pdfgen = { hoanUng(g), thanhToan(g) }
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc;
  const grp = U.groupThousand;
  const money = (n) => grp(n) + ' đ';
  const vatLabel = (e) => { const t = App.vatTypeOf(e); return t === 'vat' ? 'VAT' : t === 'bill' ? 'Bill' : '—'; };

  const STAGE_CSS = `
  #pdfstage-host{position:fixed;left:-10000px;top:0;width:794px;z-index:-1;pointer-events:none}
  .pdfdoc,.pdfblk{width:794px;box-sizing:border-box;background:#fff;color:#111;
    font-family:'Times New Roman','Times',serif;font-size:15px;line-height:1.5}
  .pdfdoc{padding:40px 48px}
  .pdfblk{padding:6px 48px}
  .pdfdoc *,.pdfblk *{box-sizing:border-box}
  .pdf-hdr{display:flex;gap:12px}
  .pdf-hdr>div{flex:1;text-align:center}
  .pdf-hdr .co{font-weight:700;font-size:13px;text-transform:uppercase;line-height:1.35}
  .pdf-hdr .addr{font-style:italic;font-size:12px}
  .pdf-hdr .qh{font-weight:700;font-size:13px}
  .pdf-hdr .qh2{font-weight:700;font-size:14px}
  .pdf-hdr .rule{width:120px;height:1px;background:#111;margin:3px auto 0}
  .pdf-date{text-align:right;font-style:italic;font-size:14px;margin-top:8px}
  .pdf-no{text-align:center;font-size:14px;margin-top:2px}
  .pdf-h1{text-align:center;font-weight:700;font-size:21px;margin:14px 0 2px;letter-spacing:.5px}
  .pdf-sub{text-align:center;font-style:italic;margin-bottom:10px}
  .pdf-p{margin:3px 0;text-align:justify}
  .pdf-p .lbl{font-weight:400}
  .pdf-strong{font-weight:700}
  table.pdf-tbl{width:100%;border-collapse:collapse;margin:6px 0}
  table.pdf-tbl th,table.pdf-tbl td{border:1px solid #555;padding:5px 7px;font-size:13.5px;vertical-align:middle}
  table.pdf-tbl th{background:#ede9fe;text-align:center;font-weight:700}
  td.c{text-align:center}td.r{text-align:right}
  tr.tot td{background:#f5f3ff;font-weight:700}
  .pdf-note{font-style:italic;font-size:13.5px;margin:4px 0}
  .pdf-sign{display:flex;gap:8px;margin-top:18px}
  .pdf-sign>div{flex:1;text-align:center}
  .pdf-sign .role{font-weight:700;font-size:14px}
  .pdf-sign .ky{font-style:italic;font-size:13px}
  .pdf-sign .gap{height:64px}
  .pdf-sign .nm{font-weight:700}
  .pdf-bm{text-align:right;font-style:italic;font-size:12px;margin-top:14px}
  .pdf-apx-title{text-align:center;font-weight:700;font-size:18px;margin:6px 0 10px}
  .pdf-cap{font-weight:700;font-size:14px;margin:8px 0 4px}
  .pdf-img{display:block;margin:0 auto 4px;max-width:100%;max-height:900px;object-fit:contain}
  .pdf-imgcap{text-align:center;font-style:italic;font-size:13px;margin-bottom:6px}`;

  function ensureStageCss() {
    if (document.getElementById('pdfstage-css')) return;
    const st = document.createElement('style'); st.id = 'pdfstage-css'; st.textContent = STAGE_CSS;
    document.head.appendChild(st);
  }
  function host() {
    let h = document.getElementById('pdfstage-host');
    if (!h) { h = document.createElement('div'); h.id = 'pdfstage-host'; document.body.appendChild(h); }
    return h;
  }

  function preloadImages(node) {
    const imgs = Array.from(node.querySelectorAll('img'));
    return Promise.all(imgs.map((im) => (im.complete && im.naturalWidth)
      ? Promise.resolve()
      : new Promise((res) => { im.onload = im.onerror = () => res(); })));
  }

  async function renderHTML(html, cls) {
    ensureStageCss();
    const node = document.createElement('div');
    node.className = cls || 'pdfdoc';
    node.innerHTML = html;
    host().appendChild(node);
    await preloadImages(node);
    await new Promise((r) => setTimeout(r, 30));
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 794 });
    node.remove();
    return canvas;
  }

  /* ---- thêm 1 canvas dài, tự cắt sang nhiều trang A4 ---- */
  function addPaged(pdf, canvas) {
    const pageW = 210, pageH = 297;
    const imgW = pageW, imgH = canvas.height * imgW / canvas.width;
    const data = canvas.toDataURL('image/jpeg', 0.78);
    let heightLeft = imgH, position = 0;
    pdf.addImage(data, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= pageH;
    while (heightLeft > 0) { position -= pageH; pdf.addPage(); pdf.addImage(data, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST'); heightLeft -= pageH; }
  }

  /* ---- đặt các "khối" (ảnh + chú thích) tuần tự, tự sang trang ---- */
  async function flowBlocks(pdf, htmls) {
    const top = 10, bottom = 287, pageW = 210, gap = 2;
    let cursorY = top, firstOnPage = true;
    for (const h of htmls) {
      const c = await renderHTML(h, 'pdfblk');
      const w = pageW, hh = c.height * w / c.width;
      if (!firstOnPage && cursorY + hh > bottom) { pdf.addPage(); cursorY = top; firstOnPage = true; }
      pdf.addImage(c.toDataURL('image/jpeg', 0.78), 'JPEG', 0, cursorY, w, hh, undefined, 'FAST');
      cursorY += hh + gap; firstOnPage = false;
    }
  }

  /* ---- HTML helpers ---- */
  function headerHTML(s) {
    return '<div class="pdf-hdr">' +
      '<div><div class="co">' + esc(s.company) + '</div><div class="addr">' + esc(s.companyAddr || '') + '</div></div>' +
      '<div><div class="qh">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div><div class="qh2">Độc lập – Tự do – Hạnh phúc</div><div class="rule"></div></div>' +
      '</div>';
  }
  function signHTML(cols) {
    return '<div class="pdf-sign">' + cols.map((c) =>
      '<div><div class="role">' + esc(c.title) + '</div><div class="ky">(Ký, họ tên)</div><div class="gap"></div><div class="nm">' + esc(c.name || '') + '</div></div>'
    ).join('') + '</div>';
  }
  function tableHTML(expenses, m) {
    let rows = expenses.map((e, i) =>
      '<tr><td class="c">' + (i + 1) + '</td><td class="c">' + esc(U.fmtDayMonth(e.date)) + '</td><td>' + esc(e.content || '') +
      '</td><td class="c">' + vatLabel(e) + '</td><td class="r">' + money(e.amount) + '</td></tr>').join('');
    const tot = (label, val, strong) =>
      '<tr class="' + (strong ? 'tot' : '') + '"><td colspan="4"' + (strong ? '' : ' style="font-weight:400"') + '>' + esc(label) + '</td><td class="r">' + money(val) + '</td></tr>';
    return '<table class="pdf-tbl"><thead><tr><th>TT</th><th>Ngày</th><th>Nội dung chi phí</th><th>Loại HĐ</th><th>Số tiền</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="c">Chưa có khoản chi</td></tr>') +
      tot('TỔNG TIỀN CHI', m.spentTotal, true) +
      tot('Số tiền đã tạm ứng', m.advanceTotal) +
      tot('Số dư tạm ứng kỳ trước', m.prevBalance) +
      tot('Số tiền tạm ứng còn dư', m.remaining, true) +
      '</tbody></table>';
  }

  /* ---- Trang đề nghị (hoàn ứng / thanh toán) ---- */
  function requestHTML(g, kind) {
    const { settings: s, event: ev, m } = g;
    const today = U.dmy(U.todayISO());
    const owed = m.remaining < 0, payAmt = Math.abs(m.remaining);
    const isTT = kind === 'thanhtoan';
    const title = isTT ? 'GIẤY ĐỀ NGHỊ THANH TOÁN' : 'GIẤY ĐỀ NGHỊ HOÀN ỨNG';
    const soVal = isTT ? (ev.soDNTT || '……/2026/ĐNTT-LTL') : (ev.soBKHU || '……/2026/BKHU-LTL');
    const nd = ev.ndThanhToan || ('Hoàn ứng chi phí ' + (ev.name || '') + ' (đã tạm ứng ' + grp(m.advanceTotal) + ' đ; thực chi ' + grp(m.spentTotal) + ' đ; số dư kỳ trước ' + grp(m.prevBalance) + ' đ).');

    let body = headerHTML(s) +
      '<div class="pdf-date">Hà Nội, ngày ' + today.d + ' tháng ' + today.m + ' năm ' + today.y + '</div>' +
      '<div class="pdf-no">Số: ' + esc(soVal) + '</div>' +
      '<div class="pdf-h1">' + title + '</div>' +
      (ev.name ? '<div class="pdf-sub">Về việc: ' + esc(ev.name) + '</div>' : '<div style="height:6px"></div>') +
      '<div class="pdf-p">Kính gửi: Ban Điều hành Công ty</div>' +
      '<div class="pdf-p">Họ và tên người đề nghị: <span class="pdf-strong">' + esc(ev.requester || s.requester || '') + '</span></div>' +
      '<div class="pdf-p">Bộ phận công tác: ' + esc(ev.dept || s.dept || '') + '&nbsp;&nbsp;&nbsp;&nbsp;Chức vụ: ' + esc(ev.position || s.position || '') + '</div>';

    if (isTT) {
      body += '<div class="pdf-p">Nội dung thanh toán: ' + esc(nd) + '</div>' +
        '<div class="pdf-p">' + (owed ? 'Số tiền đề nghị thanh toán thêm: ' : 'Số tiền tạm ứng còn dư: ') + '<span class="pdf-strong">' + grp(payAmt) + ' VNĐ</span></div>';
    } else {
      body += '<div class="pdf-p">Số tiền đã tạm ứng: <span class="pdf-strong">' + grp(m.advanceTotal) + ' đ</span>&nbsp;&nbsp;·&nbsp;&nbsp;Tổng thực chi: <span class="pdf-strong">' + grp(m.spentTotal) + ' đ</span></div>' +
        '<div class="pdf-p">Số dư tạm ứng kỳ trước: ' + grp(m.prevBalance) + ' đ</div>' +
        '<div class="pdf-p">' + (owed ? 'Số tiền đề nghị thanh toán thêm: ' : 'Số tiền tạm ứng còn dư: ') + '<span class="pdf-strong">' + grp(payAmt) + ' VNĐ</span></div>';
    }
    body += '<div class="pdf-p" style="font-style:italic">Bằng chữ: ' + esc(U.docSo(payAmt)) + '.</div>' +
      '<div class="pdf-p">Hình thức xử lý số chênh lệch: ' + esc(ev.diffHandling || 'Không nộp lại và sẽ trừ vào đợt tạm ứng tiếp theo') + '</div>' +

      '<div class="pdf-h1" style="font-size:17px;margin-top:14px">BẢNG THỐNG KÊ CHI PHÍ</div>' +
      tableHTML(g.expenses, m) +
      '<div class="pdf-note">Tỷ lệ giá trị có hoá đơn VAT: ' + m.pctVatAmount + '% (' + U.groupThousand(m.vatAmount) + ' đ / ' + U.groupThousand(m.spentTotal) + ' đ); hoá đơn bán lẻ (bill): ' + m.pctBillAmount + '% (' + U.groupThousand(m.billAmount) + ' đ).</div>' +
      '<div class="pdf-note">Số tiền ' + (owed ? 'đề nghị thanh toán thêm' : 'tạm ứng còn dư') + ' bằng chữ: ' + esc(U.docSo(payAmt)) + '.</div>' +
      '<div class="pdf-note">Chứng từ, minh chứng (ảnh chụp giao dịch) được đính kèm tại phần Phụ lục bên dưới.</div>' +
      signHTML([
        { title: s.directorHU || 'TỔNG GIÁM ĐỐC', name: s.director },
        { title: s.accountantHU || 'KẾ TOÁN TRƯỞNG', name: s.accountant },
        { title: 'NGƯỜI ĐỀ NGHỊ', name: ev.requester || s.requester },
      ]) +
      '<div class="pdf-bm">' + (isTT ? 'BM01-CTKT' : 'BM06-CTKT') + '</div>';
    return body;
  }

  /* ---- Phụ lục ảnh: trả về mảng HTML khối ---- */
  function appendixBlocks(g, urls) {
    const blocks = [];
    const byExp = {}; (g.images || []).forEach((im) => { if (im.expenseId) (byExp[im.expenseId] = byExp[im.expenseId] || []).push(im); });
    const withImg = (g.expenses || []).filter((e) => (byExp[e.id] || []).length);
    if (!withImg.length) return blocks;
    blocks.push('<div class="pdf-apx-title">PHỤ LỤC: ẢNH CHỨNG TỪ MINH CHỨNG</div>');
    let idx = 0;
    for (const e of withImg) {
      idx++;
      const imgs = byExp[e.id];
      const cap = '<div class="pdf-cap">' + idx + '. ' + esc(e.content || '(không nội dung)') + ' — ' + esc(U.fmtDayMonth(e.date)) + ' — ' + money(e.amount) + ' · ' +
        (App.vatTypeOf(e) === 'vat' ? 'Hoá đơn VAT' : App.vatTypeOf(e) === 'bill' ? 'Hoá đơn bill' : 'Không HĐ') + '</div>';
      imgs.forEach((im, j) => {
        if (im.kind !== 'image') return;
        const u = urls.get(im.id);
        const note = im.note || (im.amount ? money(im.amount) : '');
        blocks.push((j === 0 ? cap : '') + '<img class="pdf-img" src="' + u + '">' +
          (note ? '<div class="pdf-imgcap">' + esc(note) + '</div>' : ''));
      });
    }
    return blocks;
  }

  async function generate(g, kind, fnLabel) {
    await App.ensureLib('html2canvas');
    await App.ensureLib('jspdf');
    const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) throw new Error('Không tải được jsPDF');

    const urls = new Map();
    (g.images || []).forEach((im) => { if (im.kind === 'image' && im.blob) urls.set(im.id, URL.createObjectURL(im.blob)); });
    try {
      const pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
      const bodyCanvas = await renderHTML(requestHTML(g, kind), 'pdfdoc');
      addPaged(pdf, bodyCanvas);
      const blocks = appendixBlocks(g, urls);
      if (blocks.length) { pdf.addPage(); await flowBlocks(pdf, blocks); }
      const name = U.safeName(fnLabel + ' - ' + (g.event.name || 'su kien')) + '.pdf';
      pdf.save(name);
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
  }

  App.Pdfgen = {
    hoanUng: (g) => generate(g, 'hoanung', 'Ho so hoan ung'),
    thanhToan: (g) => generate(g, 'thanhtoan', 'Ho so de nghi thanh toan'),
  };
})();
