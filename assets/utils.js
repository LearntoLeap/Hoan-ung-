/* =========================================================================
   utils.js — Định dạng tiền, đọc số thành chữ (tiếng Việt), ngày tháng, helpers
   ========================================================================= */
(function (global) {
  'use strict';

  const U = {};

  /* ---- ID ---- */
  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  };

  /* ---- Tiền VND ---- */
  U.toNumber = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    // bỏ mọi ký tự không phải số, dấu trừ
    const s = String(v).replace(/[^\d-]/g, '');
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  };

  // 2800000 -> "2.800.000"
  U.groupThousand = function (n) {
    n = Math.round(U.toNumber(n));
    const neg = n < 0;
    let s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + s;
  };

  // 2800000 -> "2.800.000 đ"
  U.fmtVND = function (n, suffix) {
    return U.groupThousand(n) + (suffix === false ? '' : ' đ');
  };
  // "2.800.000 VNĐ"
  U.fmtVNDlong = function (n) {
    return U.groupThousand(n) + ' VNĐ';
  };

  /* ---- Đọc số thành chữ tiếng Việt ---- */
  const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const SCALES = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ', ' tỷ tỷ'];

  function readGroup(n, showLeadingHundred) {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const parts = [];
    if (h > 0) parts.push(ONES[h] + ' trăm');
    else if (showLeadingHundred && (t > 0 || u > 0)) parts.push('không trăm');

    if (t > 1) {
      parts.push(ONES[t] + ' mươi');
      if (u === 1) parts.push('mốt');
      else if (u === 5) parts.push('lăm');
      else if (u > 0) parts.push(ONES[u]);
    } else if (t === 1) {
      parts.push('mười');
      if (u === 5) parts.push('lăm');
      else if (u > 0) parts.push(ONES[u]);
    } else { // t === 0
      if (u > 0) {
        if (h > 0 || showLeadingHundred) parts.push('lẻ');
        parts.push(ONES[u]);
      }
    }
    return parts.join(' ');
  }

  // 2800000 -> "Hai triệu tám trăm nghìn đồng"
  U.docSo = function (amount, currency) {
    let n = Math.round(U.toNumber(amount));
    const cur = currency === false ? '' : ' đồng';
    if (n === 0) return 'Không' + cur;
    const neg = n < 0;
    n = Math.abs(n);
    const groups = [];
    while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
    const mostSig = groups.length - 1;
    const words = [];
    for (let i = mostSig; i >= 0; i--) {
      if (groups[i] === 0) continue;
      const gw = readGroup(groups[i], i !== mostSig);
      if (gw) words.push(gw + SCALES[i]);
    }
    let s = words.join(' ').replace(/\s+/g, ' ').trim();
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return (neg ? 'Âm ' : '') + s + cur;
  };

  // có dấu chấm cuối câu, dùng cho biểu mẫu
  U.docSoCau = function (amount) {
    return U.docSo(amount) + '.';
  };

  /* ---- Ngày tháng ---- */
  U.todayISO = function () {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  U.nowISO = function () { return new Date().toISOString(); };

  // "2026-06-09" -> {d:'09', m:'06', y:'2026'}
  U.dmy = function (iso) {
    if (!iso) return { d: '...', m: '...', y: '......' };
    const p = String(iso).slice(0, 10).split('-');
    if (p.length < 3) return { d: '...', m: '...', y: '......' };
    return { d: p[2], m: p[1], y: p[0] };
  };

  // "2026-06-09" -> "09/06/2026"
  U.fmtDate = function (iso) {
    const x = U.dmy(iso);
    return x.d + '/' + x.m + '/' + x.y;
  };

  // "2026-06-09" -> "09/06"
  U.fmtDayMonth = function (iso) {
    const x = U.dmy(iso);
    return x.d + '/' + x.m;
  };

  // ISO datetime -> "09/06/2026 14:35"
  U.fmtDateTime = function (isoTs) {
    if (!isoTs) return '';
    const d = new Date(isoTs);
    if (isNaN(d)) return '';
    const pad = (x) => String(x).padStart(2, '0');
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  // "2026-06" key cho gom nhóm theo tháng
  U.monthKey = function (iso) {
    return String(iso || '').slice(0, 7);
  };
  U.monthLabel = function (key) {
    const p = String(key).split('-');
    if (p.length < 2) return key;
    return 'Th' + parseInt(p[1], 10) + '/' + p[0];
  };

  // bỏ dấu tiếng Việt + thường hoá → tìm kiếm không phân biệt dấu/hoa thường
  U.normText = function (s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');
  };

  /* ---- HTML ---- */
  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---- File / Blob ---- */
  U.blobToArrayBuffer = function (blob) {
    return blob.arrayBuffer ? blob.arrayBuffer() : new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsArrayBuffer(blob);
    });
  };

  U.saveBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  };

  // làm sạch tên file
  U.safeName = function (s) {
    return String(s || 'file').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  };

  global.U = U;
})(window);
