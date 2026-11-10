/* =========================================================================
   pdf.js — Xuất PDF thật (html2canvas + jsPDF) và gửi file qua Zalo /
   ứng dụng khác bằng chia sẻ của hệ điều hành (Web Share), máy không hỗ trợ
   thì tải file về để đính kèm.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;

  async function libs() {
    const [h2c, jsp] = await Promise.all([App.ensureLib('html2canvas'), App.ensureLib('jspdf')]);
    return { h2c, JsPDF: jsp.jsPDF };
  }
  // dựng HTML ngoài màn hình rồi chụp thành canvas
  async function snap(el, h2c) {
    return h2c(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: el.scrollWidth });
  }
  function host(width, html) {
    const w = document.createElement('div');
    w.className = 'pdf-host';
    w.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + width + 'px;background:#fff;color:#111;z-index:-1';
    w.innerHTML = html;
    document.body.appendChild(w);
    return w;
  }
  async function imagesReady(root) {
    await Promise.all(Array.from(root.querySelectorAll('img')).map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    try { await document.fonts.ready; } catch (e) {}
  }

  // Một tờ phiếu → PDF A4 dọc đúng mẫu
  async function doc(d) {
    try {
      const { h2c, JsPDF } = await libs();
      const w = host(794, App.Docs.paperHTML(d));
      const paper = w.querySelector('.paper'); paper.style.boxShadow = 'none'; paper.style.margin = '0';
      await imagesReady(w);
      const cv = await snap(paper, h2c);
      w.remove();
      const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      let iw = 210, ih = cv.height * 210 / cv.width;
      if (ih > 297) { iw = iw * 297 / ih; ih = 297; }
      pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - iw) / 2, 0, iw, ih);
      pdf.setProperties({ title: d.soPhieu, creator: 'LtL Tạm ứng & Hoàn ứng' });
      return pdf.output('blob');
    } catch (e) { console.error(e); App.toast('Lỗi tạo PDF: ' + (e.message || e), 'err'); return null; }
  }

  // Báo cáo nhiều khối (.pdf-blk) → PDF nhiều trang, tự ngắt trang giữa các khối
  async function report(html, opts) {
    opts = opts || {};
    try {
      const { h2c, JsPDF } = await libs();
      const land = !!opts.landscape, PW = land ? 297 : 210, PH = land ? 210 : 297, M = 8;
      const w = host(land ? 1123 : 794, '<div class="rp-doc">' + html + '</div>');
      await imagesReady(w);
      const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait', compress: true });
      const cw = PW - 2 * M; let y = M, first = true;
      const blocks = Array.from(w.querySelectorAll('.pdf-blk'));
      for (const b of blocks) {
        const cv = await snap(b, h2c);
        const k = cw / cv.width;                       // mm / px
        const hmm = cv.height * k;
        if (hmm <= PH - 2 * M) {
          if (y + hmm > PH - M && !first) { pdf.addPage(); y = M; }
          pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', M, y, cw, hmm); y += hmm + 3; first = false;
        } else {
          // khối cao hơn 1 trang: cắt theo trang
          const sliceH = Math.floor((PH - 2 * M) / k);
          for (let sy = 0; sy < cv.height; sy += sliceH) {
            if (!first) { pdf.addPage(); y = M; }
            const h = Math.min(sliceH, cv.height - sy);
            const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = h;
            c2.getContext('2d').drawImage(cv, 0, sy, cv.width, h, 0, 0, cv.width, h);
            pdf.addImage(c2.toDataURL('image/jpeg', 0.9), 'JPEG', M, M, cw, h * k); y = M + h * k + 3; first = false;
          }
        }
      }
      w.remove();
      const n = pdf.getNumberOfPages();
      for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFontSize(7); pdf.setTextColor(140); pdf.text('Learn to Leap - ' + (opts.footer || 'Bao cao') + ' - Trang ' + i + '/' + n, PW - M, PH - 3, { align: 'right' }); }
      pdf.setProperties({ title: opts.title || 'Báo cáo', creator: 'LtL Tạm ứng & Hoàn ứng' });
      return pdf.output('blob');
    } catch (e) { console.error(e); App.toast('Lỗi tạo PDF: ' + (e.message || e), 'err'); return null; }
  }

  /* ---- Gửi file qua Zalo / ứng dụng khác ----
     items: [{ label, ic, make: async () => ({ blob, name }) }] — file được chuẩn bị trước để
     nút "Gửi" gọi chia sẻ ngay trong thao tác bấm (yêu cầu của trình duyệt). */
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([new Blob(['x'])], 'a.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; }
  }
  function shareSheet(title, items, text) {
    const can = canShareFiles();
    const ov = App.openSheet(App.sheetHead('Gửi qua Zalo / ứng dụng khác', title) +
      '<p class="muted" style="font-size:13px;margin:0 0 10px">' + (can ? 'Bấm <b>Gửi</b> → chọn <b>Zalo</b> (hoặc Messenger, Mail…) trong bảng chia sẻ của máy.' : 'Máy này chưa hỗ trợ chia sẻ file trực tiếp: bấm <b>Tải về</b>, rồi kéo thả / đính kèm file vào Zalo.') + '</p>' +
      items.map((it, i) => '<div class="share-it" data-i="' + i + '"><span class="nt-ic primary">' + I(it.ic || 'file', 18) + '</span><span class="nt-b"><b>' + esc(it.label) + '</b><small class="st">Đang chuẩn bị…</small></span>' +
        '<span class="row" style="gap:6px">' + (can ? '<button class="btn sm" data-sh="send" disabled>' + I('share', 14) + 'Gửi</button>' : '') + '<button class="btn out sm" data-sh="dl" disabled>' + I('download', 14) + 'Tải về</button></span></div>').join('') +
      '<div class="sheet-f"><button class="btn out" data-act="closeTop">Đóng</button></div>', { center: true });
    const files = [];
    items.forEach(async (it, i) => {
      const row = ov.querySelector('.share-it[data-i="' + i + '"]');
      try {
        const r = await it.make();
        if (!r || !r.blob) throw new Error('Không tạo được file');
        files[i] = new File([r.blob], r.name, { type: r.blob.type || 'application/octet-stream' });
        row.querySelector('.st').textContent = r.name + ' · ' + Math.max(1, Math.round(r.blob.size / 1024)) + ' KB';
        row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      } catch (e) { row.querySelector('.st').textContent = 'Lỗi: ' + (e.message || e); }
    });
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sh]'); if (!b) return;
      const i = +b.closest('.share-it').getAttribute('data-i'), f = files[i]; if (!f) return;
      if (b.getAttribute('data-sh') === 'dl') { U.saveBlob(f, f.name); App.toast('Đã tải ' + f.name, 'ok'); return; }
      try { await navigator.share({ files: [f], title: f.name, text: text || '' }); }
      catch (er) { if (er && er.name !== 'AbortError') { U.saveBlob(f, f.name); App.toast('Không mở được chia sẻ — đã tải file về', 'err'); } }
    });
    return ov;
  }

  App.PDF = { doc, report, shareSheet, canShareFiles };
})();
