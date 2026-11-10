/* =========================================================================
   forms.js — Phiếu đề nghị theo mẫu 01-TT/LTL (Tạm ứng · Hoàn ứng · Thanh toán)
   - Mô hình dữ liệu, đánh số phiếu DNTx-YYYYMM-NN, tính thành tiền / chênh lệch
   - Danh sách phiếu theo loại, màn soạn phiếu + xem trước tờ in A4
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';

  const TYPES = {
    TU: { prefix: 'DNTU', label: 'Tạm ứng', title: 'TẠM ỨNG', route: 'tam-ung', ic: 'file' },
    HU: { prefix: 'DNHU', label: 'Hoàn ứng', title: 'HOÀN ỨNG', route: 'hoan-ung', ic: 'wallet' },
    TT: { prefix: 'DNTT', label: 'Thanh toán', title: 'THANH TOÁN', route: 'thanh-toan', ic: 'calc' },
  };
  const STATUS = [
    { v: 'nhap', t: 'Nháp', cls: 'out' },
    { v: 'da-gui', t: 'Đã gửi duyệt', cls: 'primary' },
    { v: 'da-duyet', t: 'Đã duyệt', cls: 'accent' },
    { v: 'da-chi', t: 'Đã chi / quyết toán', cls: 'ok' },
    { v: 'tu-choi', t: 'Bị trả lại', cls: 'danger' },
  ];
  const statusOf = (v) => STATUS.find((s) => s.v === v) || STATUS[0];

  /* ============================== Mô hình ============================== */
  const Docs = {
    TYPES, STATUS,
    blankItem(o) {
      return Object.assign({ id: U.uid(), noiDung: '', ngayChi: '', nguoiThamGia: '', soLuong: '', donGia: 0, ghiChu: '', expenseId: null, hd: '' }, o || {});
    },
    // Thành tiền = SL × Đơn giá; để trống SL ⇒ khoản trọn gói = Đơn giá (giống công thức mẫu)
    lineTotal(it) {
      const dg = U.toNumber(it.donGia);
      if (!dg) return 0;
      const sl = String(it.soLuong == null ? '' : it.soLuong).trim();
      if (sl === '') return dg;
      const q = parseFloat(sl.replace(',', '.'));
      return isFinite(q) ? Math.round(q * dg) : dg;
    },
    total(d) { return (d.items || []).reduce((s, it) => s + Docs.lineTotal(it), 0); },
    filledItems(d) {
      // dòng chỉ có ngày / người tham gia điền sẵn mà chưa nhập gì thì coi là dòng trống
      return (d.items || []).filter((it) => (it.noiDung || '').trim() || U.toNumber(it.donGia) || (it.ghiChu || '').trim());
    },
    monthKey(iso) { const p = String(iso || U.todayISO()).slice(0, 7).split('-'); return p[0] + p[1]; },
    // số phiếu theo mẫu: TIỀN TỐ - NĂM THÁNG - STT (STT trong tháng của người lập, VD DNTU-202609-03)
    numberOf(type, ngayLap, stt) { return TYPES[type].prefix + '-' + Docs.monthKey(ngayLap) + '-' + String(Math.max(1, parseInt(stt, 10) || 1)).padStart(2, '0'); },
    sttOf(so) { const m = /-(\d{6})-(\d+)$/.exec(String(so || '')); return m ? parseInt(m[2], 10) : ''; },
    nextNumber(type, ngayLap, docs) {
      const pre = TYPES[type].prefix + '-' + Docs.monthKey(ngayLap) + '-';
      let max = 0;
      (docs || App.data.docs).forEach((d) => {
        if (d.type !== type || !d.soPhieu || d.soPhieu.indexOf(pre) !== 0) return;
        const n = parseInt(d.soPhieu.slice(pre.length), 10); if (n > max) max = n;
      });
      return pre + String(max + 1).padStart(2, '0');
    },
    blank(type, o) {
      o = o || {};
      const s = App.settings || App.DEFAULT_SETTINGS;
      const ev = o.eventId ? App.eventById(o.eventId) : null;
      const today = U.todayISO();
      return {
        id: U.uid(), type, eventId: o.eventId || null, status: 'nhap',
        soPhieu: Docs.nextNumber(type, today), ngayLap: today,
        nguoiDeNghi: s.hoTen || '', boPhan: s.boPhan || '',
        noiDung: ev ? (TYPES[type].label + ' chi phí ' + ev.name) : '',
        mucDich: ev ? ('Phục vụ ' + ev.name) : '',
        items: [Docs.blankItem({ ngayChi: today, nguoiThamGia: s.tenNgan || lastName(s.hoTen) })],
        tenTK: s.tenTK || s.hoTen || '', soTK: s.soTK || '', nganHang: s.nganHang || '',
        deNghiKhac: '',
        tuDocId: null, tuSoPhieu: '', daTamUng: 0,
        createdAt: U.nowISO(),
      };
    },
    // Kết luận quyết toán — đúng câu chữ công thức A39 của mẫu
    settle(d) {
      const tot = Docs.total(d);
      const has = d.daTamUng !== '' && d.daTamUng != null && (U.toNumber(d.daTamUng) > 0 || d.tuSoPhieu);
      const adv = U.toNumber(d.daTamUng);
      let concl;
      if (!has) concl = '(Nhập số tiền đã tạm ứng để phiếu tự kết luận chênh lệch)';
      else if (adv > tot) concl = '→ Tạm ứng thừa: người đề nghị NỘP LẠI quỹ ' + U.groupThousand(adv - tot) + ' đ';
      else if (tot > adv) concl = '→ Chi vượt tạm ứng: ĐỀ NGHỊ CHI BÙ cho người đề nghị ' + U.groupThousand(tot - adv) + ' đ';
      else concl = '→ Thực chi bằng số đã tạm ứng – không phát sinh chênh lệch';
      return { total: tot, adv, diff: Math.abs(adv - tot), has, concl, line: 'Số tiền thực chi (theo bảng kê trên): ' + U.groupThousand(tot) + ' đ   |   Chênh lệch: ' + U.groupThousand(Math.abs(adv - tot)) + ' đ' };
    },
    statusOf,
    labels(d) {
      const hu = d.type === 'HU';
      return {
        title: 'GIẤY ĐỀ NGHỊ ' + TYPES[d.type].title,
        amount: hu ? 'Số tiền thực chi đề nghị hoàn ứng: (bằng số VNĐ)' : 'Số tiền đề nghị chi: (bằng số VNĐ)',
        caption: hu ? 'Bảng kê chi phí thực tế đã chi:' : 'Đề nghị chi theo bảng kê dưới đây:',
        captionNote: hu ? '(Chứng từ kèm theo: hóa đơn / chứng từ chi tiêu thực tế)' : '(Chứng từ kèm theo: hóa đơn / hợp đồng / chứng từ trả tiền)',
        receive: hu ? 'THÔNG TIN NHẬN TIỀN CHI BÙ (nếu có) / NỘP LẠI QUỸ (nếu tạm ứng thừa)' : 'THÔNG TIN NHẬN TIỀN ( BẮT BUỘC CHUYỂN KHOẢN)',
      };
    },
    dateLine(iso) {
      if (!iso) return 'Hà Nội, ngày ..... tháng ..... năm .....';
      const x = U.dmy(iso);
      return 'Hà Nội, ngày ' + x.d + ' tháng ' + x.m + ' năm ' + x.y;
    },
    fileName(d, ext) {
      return U.safeName(d.soPhieu + ' - ' + (d.nguoiDeNghi || '') + (d.noiDung ? ' - ' + d.noiDung.slice(0, 40) : '')) + '.' + ext;
    },
    // Dòng bảng kê lấy từ khoản chi
    itemFromExpense(e, s) {
      const vt = App.vatTypeOf(e);
      const note = [vt === 'vat' ? 'Có hoá đơn VAT đính kèm hồ sơ' : vt === 'bill' ? 'Có hoá đơn bán lẻ / bill' : '', e.ghiChu || ''].filter(Boolean).join('; ');
      return Docs.blankItem({
        noiDung: e.content || '', ngayChi: e.date || '', nguoiThamGia: e.participants || (s && (s.tenNgan || lastName(s.hoTen))) || '',
        soLuong: e.qty != null && e.qty !== '' ? e.qty : 1, donGia: e.qty ? U.toNumber(e.unitPrice || e.amount) : U.toNumber(e.amount),
        ghiChu: note, expenseId: e.id, hd: vt === 'vat' ? 'vat' : vt === 'bill' ? 'bill' : '',
      });
    },
  };
  App.Docs = Docs;
  function lastName(full) { const p = String(full || '').trim().split(/\s+/); return p.length ? p[p.length - 1] : ''; }
  App.lastName = lastName;

  /* ============================== Tờ phiếu (HTML xem trước / in) ============================== */
  Docs.paperHTML = function (d, s) {
    s = s || App.settings;
    const L = Docs.labels(d);
    const tot = Docs.total(d);
    const items = Docs.filledItems(d);
    const rows = (items.length ? items : [Docs.blankItem()]).map((it, i) => {
      const tt = Docs.lineTotal(it);
      const filled = items.length > 0;
      return '<tr><td class="c">' + (filled ? i + 1 : '') + '</td><td>' + esc(it.noiDung) + '</td><td class="c">' + (it.ngayChi ? esc(U.fmtDate(it.ngayChi)) : '') +
        '</td><td>' + esc(it.nguoiThamGia) + '</td><td class="c">' + esc(it.soLuong) + '</td><td class="r">' + (U.toNumber(it.donGia) ? U.groupThousand(it.donGia) : '') +
        '</td><td class="r">' + (tt ? U.groupThousand(tt) : '') + '</td><td>' + esc(it.ghiChu) + '</td></tr>';
    }).join('');
    const st = Docs.settle(d);
    const hu = d.type === 'HU';
    return '<div class="paper">' +
      '<div class="p-head"><img src="assets/templates/logo-ltl.png" alt="Learn to Leap"><div class="p-co">' +
      '<b>' + esc(s.company) + '</b><br>' + esc(s.companyAddr) + '<br>Mã số thuế: ' + esc(s.mst) + '&nbsp;&nbsp; | &nbsp;&nbsp;ĐT: ' + esc(s.phone) +
      '&nbsp;&nbsp; | &nbsp;&nbsp;Email: ' + esc(s.email) + '<br>TK: ' + esc(s.bankLine) + '</div></div>' +
      '<div class="p-title">' + esc(L.title) + '</div>' +
      '<div class="p-mau">Mẫu số: ' + esc(s.mauSo) + '<br>Lần ban hành: ' + esc(s.lanBanHanh) + '<br>Ngày áp dụng: ' + esc(s.ngayApDung) + '</div>' +
      '<div class="p-kg">Kính gửi: ' + esc(s.kinhGui) + '</div>' +
      '<div class="p-info">' +
      '<div class="lb">Loại phiếu:</div><div class="vl bo">' + esc(TYPES[d.type].label) + '</div><div class="lb" style="grid-column:4">Số phiếu:</div><div class="vl pu">' + esc(d.soPhieu) + '</div>' +
      '<div class="lb">Người đề nghị:</div><div class="vl">' + esc(d.nguoiDeNghi) + '</div><div class="lb" style="grid-column:4">Ngày lập:</div><div class="vl">' + (d.ngayLap ? esc(U.fmtDate(d.ngayLap)) : '') + '</div>' +
      '<div class="lb">Bộ phận:</div><div class="vl">' + esc(d.boPhan) + '</div>' +
      '</div>' +
      '<div class="p-amt"><span>' + esc(L.amount) + '</span><span class="a">' + (tot ? U.groupThousand(tot) : '') + '</span></div>' +
      '<div class="p-line"><span class="lb">Bằng chữ:</span><span class="vl i">' + (tot ? esc(App.docSo(tot)) : '') + '</span></div>' +
      '<div class="p-line"><span class="lb">Nội dung:</span><span class="vl">' + esc(d.noiDung) + '</span></div>' +
      '<div class="p-line"><span class="lb">Mục đích:</span><span class="vl">' + esc(d.mucDich) + '</span></div>' +
      '<div class="p-cap">' + esc(L.caption) + '&nbsp;&nbsp; ' + esc(L.captionNote) + '</div>' +
      '<table class="p-items"><colgroup><col style="width:6%"><col style="width:19%"><col style="width:11%"><col style="width:16%"><col style="width:8%"><col style="width:11%"><col style="width:13%"><col style="width:16%"></colgroup>' +
      '<thead><tr><th>STT</th><th>Nội dung</th><th>Ngày chi</th><th>Người tham gia</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền (VNĐ)</th><th>Ghi chú</th></tr></thead>' +
      '<tbody>' + rows + '<tr class="sum"><td colspan="6">CỘNG</td><td class="tot">' + U.groupThousand(tot) + '</td><td></td></tr></tbody></table>' +
      '<div class="p-rcv">' + esc(L.receive) + '</div>' +
      '<div class="p-acc"><div class="lb">Tên tài khoản:</div><div class="vl b full">' + esc(d.tenTK) + '</div>' +
      '<div class="lb">Số tài khoản:</div><div class="vl">' + esc(d.soTK) + '</div><div class="lb">Tại ngân hàng:</div><div class="vl">' + esc(d.nganHang) + '</div>' +
      '<div class="lb">Đề nghị khác:</div><div class="vl full" style="border:0">' + esc(d.deNghiKhac) + '</div></div>' +
      (hu ? '<div class="p-qt"><div class="lb">Phiếu tạm ứng số:</div><div class="vl">' + esc(d.tuSoPhieu) + '</div><div class="lb">Số tiền đã tạm ứng:</div><div class="vl amt">' +
        (st.has ? U.groupThousand(st.adv) : '') + '</div></div>' +
        '<div class="p-diff">' + esc(st.line) + '</div><div class="p-concl">' + esc(st.concl) + '</div>' : '') +
      '<div class="p-date">' + esc(Docs.dateLine(d.ngayLap)) + '</div>' +
      '<div class="p-sign">' +
      '<div><b>NGƯỜI ĐỀ NGHỊ</b><i>(Ký, ghi rõ họ tên)</i><div class="nm">' + esc(d.nguoiDeNghi) + '</div></div>' +
      '<div><b>TRƯỞNG BỘ PHẬN</b><i>(Ký, họ tên)</i><div class="nm">' + esc(d.truongBoPhan || '') + '</div></div>' +
      '<div><b>KẾ TOÁN TRƯỞNG</b><i>(Ký, họ tên)</i><div class="nm">' + esc(s.keToanTruong) + '</div></div>' +
      '<div><b>' + esc(s.chucDanhPheDuyet) + '</b><i>( Phê duyệt, ký, họ tên)</i><div class="nm">' + esc(s.giamDoc) + '</div></div>' +
      '</div></div>';
  };

  function fitPaper() {
    document.querySelectorAll('.paper-wrap').forEach((w) => {
      const sc = w.querySelector('.paper-scale'); const p = w.querySelector('.paper'); if (!sc || !p) return;
      const avail = w.clientWidth - 32;
      const k = Math.min(1, avail / 794);
      sc.style.transform = 'scale(' + k + ')';
      sc.style.width = '794px';
      sc.style.height = (p.offsetHeight * k) + 'px';
    });
  }
  Docs.fitPaper = fitPaper;
  window.addEventListener('resize', () => fitPaper());
  Docs.previewBox = (d, s) => '<div class="paper-wrap"><div class="paper-scale">' + Docs.paperHTML(d, s) + '</div></div>';

  Docs.print = function (d, s) {
    const box = document.createElement('div');
    box.className = 'print-area';
    box.innerHTML = Docs.paperHTML(d, s);
    document.body.appendChild(box);
    const img = box.querySelector('img');
    const go = () => { window.print(); setTimeout(() => box.remove(), 500); };
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
  };

  /* ============================== Danh sách phiếu theo loại ============================== */
  function listScreen(type) {
    return function (root, route) {
      const T = TYPES[type];
      const all = App.data.docs.filter((d) => d.type === type);
      const f = App.listFilter && App.listFilter.type === type ? App.listFilter : (App.listFilter = { type, q: '', ev: route.q.ev || '', st: '', m: '' });
      const months = Array.from(new Set(all.map((d) => String(d.ngayLap || '').slice(0, 7)).filter(Boolean))).sort().reverse();
      const match = (d) => {
        if (f.ev && (d.eventId || '') !== (f.ev === '-' ? '' : f.ev)) return false;
        if (f.st && App.Flow.status(d) !== f.st) return false;
        if (f.m && String(d.ngayLap || '').slice(0, 7) !== f.m) return false;
        if (f.q) {
          const hay = U.normText([d.soPhieu, d.noiDung, d.mucDich, d.nguoiDeNghi, (App.eventById(d.eventId) || {}).name, U.groupThousand(Docs.total(d))].join(' '));
          if (hay.indexOf(U.normText(f.q)) < 0) return false;
        }
        return true;
      };
      const rows = all.filter(match);
      const sum = rows.reduce((s, d) => s + Docs.total(d), 0);
      const thisMonth = U.todayISO().slice(0, 7);
      const monthSum = all.filter((d) => String(d.ngayLap || '').slice(0, 7) === thisMonth).reduce((s, d) => s + Docs.total(d), 0);
      const pending = all.filter((d) => ['nhap', 'da-gui', 'tu-choi'].includes(d.status || 'nhap')).length;

      let extraKpi = '';
      if (type === 'HU') {
        const back = all.reduce((s, d) => { const x = Docs.settle(d); return s + (x.has && x.adv > x.total ? x.adv - x.total : 0); }, 0);
        const owe = all.reduce((s, d) => { const x = Docs.settle(d); return s + (x.has && x.total > x.adv ? x.total - x.adv : 0); }, 0);
        extraKpi = kpi('alert', 'Chi bù / Nộp lại', money(owe), 'Nộp lại quỹ: ' + money(back));
      } else if (type === 'TU') {
        const an = App.Flow.analyze({ docs: App.data.docs });
        const open = an.tus.filter((x) => x.k === 'open');
        extraKpi = kpi('alert', 'Đã chi, chưa hoàn ứng', open.length + ' <small>phiếu</small>', money(open.reduce((s, x) => s + x.adv, 0)));
      } else {
        const bu = all.filter((d) => d.huDocId).length;
        extraKpi = kpi('check', 'Đã duyệt chi', all.filter((d) => App.Flow.status(d) === 'da-chi').length + ' <small>phiếu</small>', bu + ' phiếu bù hoàn ứng · ' + (all.length - bu) + ' độc lập');
      }

      const evOpts = [{ v: '', t: 'Tất cả sự kiện' }, { v: '-', t: '(Không gắn sự kiện)' }].concat(App.data.events.map((e) => ({ v: e.id, t: e.name })));
      const settledBy = {};
      App.data.docs.forEach((x) => { if (x.type === 'HU' && x.tuDocId) settledBy[x.tuDocId] = x; });

      root.innerHTML = App.pageHead('Giấy đề nghị ' + T.label.toLowerCase(),
        'Mẫu ' + esc(App.settings.mauSo) + ' · số phiếu tự nhảy ' + T.prefix + '-YYYYMM-STT',
        (rows.length ? '<button class="btn out" data-act="exportListExcel:' + type + '">' + I('excel') + 'Xuất Excel (' + rows.length + ' phiếu)</button>' : '') +
        '<a class="btn accent" href="#/phieu/moi/' + type + (f.ev && f.ev !== '-' ? '?event=' + esc(encodeURIComponent(f.ev)) : '') + '">' + I('plus') + 'Tạo phiếu ' + T.label.toLowerCase() + '</a>') +
        '<div class="kpis k4">' +
        kpi('file', 'Số phiếu', all.length, rows.length !== all.length ? rows.length + ' phiếu đang lọc' : 'tất cả') +
        kpi('wallet', 'Tổng tiền', money(all.reduce((s, d) => s + Docs.total(d), 0)), 'Đang lọc: ' + money(sum)) +
        kpi('calendar', 'Tháng này', money(monthSum), U.monthLabel(thisMonth)) +
        extraKpi + '</div>' +
        '<div class="card mt16"><div class="card-b" style="padding-bottom:12px"><div class="fgrid c3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">' +
        '<div class="search field mb0"><label class="sr" for="lf-q">Tìm</label>' + I('search') + '<input class="input" id="lf-q" type="search" placeholder="Tìm số phiếu, nội dung, số tiền…" value="' + esc(f.q) + '"></div>' +
        selectBare('lf-ev', f.ev, evOpts) + selectBare('lf-st', f.st, [{ v: '', t: 'Mọi trạng thái' }].concat(App.Flow.ST_ORDER.map((v) => ({ v, t: App.Flow.ST[v].t })))) +
        selectBare('lf-m', f.m, [{ v: '', t: 'Mọi tháng' }].concat(months.map((m) => ({ v: m, t: U.monthLabel(m) })))) +
        '</div></div>' +
        '<div id="lf-body">' + tableHTML() + '</div></div>';

      function tableHTML() {
        if (!all.length) return App.emptyState(T.ic, 'Chưa có phiếu ' + T.label.toLowerCase(), 'Bấm “Tạo phiếu” để lập phiếu theo đúng mẫu công ty. Số phiếu và số tiền bằng chữ được điền tự động.',
          '<a class="btn" href="#/phieu/moi/' + type + '">' + I('plus') + 'Tạo phiếu đầu tiên</a>');
        if (!rows.length) return App.emptyState('search', 'Không có phiếu phù hợp bộ lọc', 'Thử bỏ bớt điều kiện lọc.');
        return '<div class="tbl-wrap"><table class="tbl cards"><thead><tr>' + App.chkAll() + '<th>Số phiếu</th><th>Ngày lập</th><th>Nội dung</th>' +
          (type === 'HU' ? '<th class="num">Đã tạm ứng</th>' : '') + '<th class="num">Số tiền</th>' + (type === 'HU' ? '<th>Kết luận</th>' : '') +
          '<th>Trạng thái</th><th class="acts"></th></tr></thead><tbody>' +
          rows.map((d) => {
            const ev = App.eventById(d.eventId); const t = Docs.total(d);
            const rv = App.Flow.reviewOf(d) || {};
            let hu = '';
            if (type === 'HU') {
              const x = Docs.settle(d);
              hu = '<td class="num" data-l="Đã tạm ứng">' + (x.has ? money(x.adv) : '—') + '</td>';
            }
            let concl = '';
            if (type === 'HU') {
              const x = Docs.settle(d);
              concl = '<td data-l="Kết luận">' + (!x.has ? '<span class="muted">—</span>' : x.adv > x.total ? '<span class="badge warn">Nộp lại ' + U.groupThousand(x.adv - x.total) + '</span>'
                : x.total > x.adv ? '<span class="badge danger">Chi bù ' + U.groupThousand(x.total - x.adv) + '</span>' : '<span class="badge ok">Khớp</span>') + '</td>';
            }
            const tuNote = type === 'TU' && settledBy[d.id] ? '<span class="sub">Đã hoàn ứng: ' + esc(settledBy[d.id].soPhieu) + '</span>' : '';
            return '<tr class="click" data-href="#/phieu/' + d.id + '">' + App.chk(d.id) + '<td data-l="Số phiếu"><span class="badge mono primary">' + esc(d.soPhieu || '—') + '</span></td>' +
              '<td data-l="Ngày lập" class="nowrap">' + esc(d.ngayLap ? U.fmtDate(d.ngayLap) : '—') + '</td>' +
              '<td data-l="Nội dung" style="min-width:220px">' + esc(d.noiDung || '(chưa có nội dung)') + '<span class="sub">' + (ev ? esc(ev.name) + ' · ' : '') + Docs.filledItems(d).length + ' dòng bảng kê</span>' + tuNote + '</td>' +
              hu + '<td class="num b" data-l="Số tiền">' + money(t) + '</td>' + concl +
              '<td data-l="Trạng thái">' + App.Flow.badge(d, null, true) + (rv.soSo && App.Flow.locked(d) ? '<span class="sub mono">Sổ ' + esc(rv.soSo) + '</span>' : '') +
              (App.Flow.status(d) === 'can-bo-sung' && rv.note ? '<span class="sub" style="color:hsl(var(--canh-bao-dam))">' + esc(rv.note.slice(0, 60)) + '</span>' : '') + '</td>' +
              '<td class="acts"><button class="btn out xs" data-act="docWord:' + d.id + '" title="Xuất Word">' + I('word') + 'Word</button>' +
              '<button class="btn out xs" data-act="docExcel:' + d.id + '" title="Xuất Excel">' + I('excel') + 'Excel</button></td></tr>';
          }).join('') +
          '</tbody><tfoot><tr><td colspan="' + (type === 'HU' ? 5 : 4) + '">Cộng ' + rows.length + ' phiếu</td><td class="num">' + money(sum) + '</td><td colspan="' + (type === 'HU' ? 3 : 2) + '"></td></tr></tfoot></table></div>';
      }

      const repaint = () => { const b = document.getElementById('lf-body'); if (b) b.innerHTML = tableHTML(); App.Sel.paint(); };
      const q = document.getElementById('lf-q');
      q.oninput = () => { f.q = q.value; repaint(); };
      ['lf-ev', 'lf-st', 'lf-m'].forEach((id) => {
        document.getElementById(id).onchange = (e) => { f[{ 'lf-ev': 'ev', 'lf-st': 'st', 'lf-m': 'm' }[id]] = e.target.value; App.render(); };
      });
      App._listRows = () => all.filter(match);
      App.Sel.init('docs-' + type, (ids) => '<button class="btn out sm" data-act="selDocsExcel">' + I('excel') + 'Xuất Excel</button>' +
        '<button class="btn out sm" data-act="selDocsSubmit">' + I('send') + 'Gửi duyệt</button>' +
        '<button class="btn danger sm" data-act="selDocsTrash">' + I('trash') + 'Xoá</button>');
    };
  }
  function selectBare(id, val, opts) {
    return '<div class="field mb0"><label class="sr" for="' + id + '">Lọc</label><select class="select" id="' + id + '">' +
      opts.map((o) => '<option value="' + esc(o.v) + '"' + (String(o.v) === String(val) ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div>';
  }
  App.selectBare = selectBare;
  function kpi(ic, label, value, sub, cls) {
    return '<div class="kpi lift' + (cls ? ' ' + cls : '') + '"><div class="kb"><div class="l">' + esc(label) + '</div><div class="v">' + value + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div><span class="ki">' + I(ic) + '</span></div>';
  }
  App.kpi = kpi;

  App.screens['tam-ung'] = listScreen('TU');
  App.screens['hoan-ung'] = listScreen('HU');
  App.screens['thanh-toan'] = listScreen('TT');

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-act],a,button,input,select,textarea,label')) return;
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.hash = tr.getAttribute('data-href');
  });

  /* ============================== Màn soạn phiếu ============================== */
  let draft = null, dirty = false, original = '';
  Docs.isDirty = () => !!(draft && dirty);
  Docs.reset = () => { draft = null; dirty = false; original = ''; };
  const F = () => App.Flow;
  const roNow = () => !!(draft && !draft._new && !F().canEdit(draft));

  App.screens.phieu = function (root, route) {
    const p = route.parts;
    if (p[1] === 'moi') {
      const type = TYPES[p[2]] ? p[2] : 'TT';
      if (!draft || draft._new !== location.hash) {
        draft = Docs.blank(type, { eventId: route.q.event || null });
        draft._new = location.hash;
        if (route.q.from) prefillFromTU(draft, route.q.from);
        if (route.q.copy) prefillCopy(draft, route.q.copy);
        if (route.q.bu) prefillTopUp(draft, route.q.bu);
        if (route.q.exp) {
          const ids = route.q.exp.split(',');
          const exps = App.data.expenses.filter((e) => ids.includes(e.id));
          if (exps.length) draft.items = exps.map((e) => Docs.itemFromExpense(e, App.settings));
        } else if (route.q.event && type !== 'TU' && !route.q.bu) importExpenses(draft, route.q.event, true);
        original = '';
      }
    } else {
      const d = App.data.docs.find((x) => x.id === p[1]);
      if (!d) { root.innerHTML = '<div class="card">' + App.emptyState('alert', 'Không tìm thấy phiếu', 'Phiếu có thể đã bị xoá.', '<a class="btn" href="#/">Về Tổng quan</a>') + '</div>'; return; }
      if (!draft || draft.id !== d.id || draft._new || (!dirty && JSON.stringify(d) !== original)) { draft = JSON.parse(JSON.stringify(d)); original = JSON.stringify(d); }
      if (!draft.items || !draft.items.length) draft.items = [Docs.blankItem()];
    }
    dirty = !!draft._new || JSON.stringify(stripDraft(draft)) !== original;
    renderEditor(root);
  };
  function stripDraft(d) { const c = Object.assign({}, d); delete c._new; return c; }

  function prefillFromTU(d, tuId) {
    const tu = App.data.docs.find((x) => x.id === tuId); if (!tu) return;
    d.tuDocId = tu.id; d.tuSoPhieu = tu.soPhieu; d.daTamUng = Docs.total(tu);
    d.eventId = tu.eventId || d.eventId;
    d.noiDung = tu.noiDung ? (/^Tạm ứng/i.test(tu.noiDung) ? tu.noiDung.replace(/^Tạm ứng/i, 'Hoàn ứng') : 'Hoàn ứng: ' + tu.noiDung) : d.noiDung;
    d.mucDich = 'Quyết toán tạm ứng theo phiếu ' + tu.soPhieu;
    d.nguoiDeNghi = tu.nguoiDeNghi || d.nguoiDeNghi; d.boPhan = tu.boPhan || d.boPhan;
    d.tenTK = tu.tenTK || d.tenTK; d.soTK = tu.soTK || d.soTK; d.nganHang = tu.nganHang || d.nganHang;
    if (d.eventId) importExpenses(d, d.eventId, true);
  }
  // DNTT bù phần chi vượt tạm ứng của một phiếu hoàn ứng
  function prefillTopUp(d, huId) {
    const hu = App.data.docs.find((x) => x.id === huId); if (!hu) return;
    const st = Docs.settle(hu), diff = st.total - st.adv;
    d.huDocId = hu.id; d.eventId = hu.eventId || null;
    d.noiDung = 'Thanh toán chi bù vượt tạm ứng theo phiếu ' + hu.soPhieu;
    d.mucDich = 'Chi vượt tạm ứng ' + (hu.tuSoPhieu || '') + ' (thực chi ' + U.groupThousand(st.total) + ' / đã ứng ' + U.groupThousand(st.adv) + ')';
    d.tenTK = hu.tenTK || d.tenTK; d.soTK = hu.soTK || d.soTK; d.nganHang = hu.nganHang || d.nganHang;
    d.items = [Docs.blankItem({ noiDung: 'Chi bù vượt tạm ứng (theo ' + hu.soPhieu + ')', ngayChi: U.todayISO(), nguoiThamGia: (App.settings.tenNgan || lastName(App.settings.hoTen)), donGia: diff > 0 ? diff : 0, ghiChu: 'Hoá đơn / chứng từ đã nộp kèm phiếu ' + hu.soPhieu })];
  }
  function prefillCopy(d, srcId) {
    const src = App.data.docs.find((x) => x.id === srcId); if (!src) return;
    ['eventId', 'nguoiDeNghi', 'boPhan', 'noiDung', 'mucDich', 'tenTK', 'soTK', 'nganHang', 'deNghiKhac'].forEach((k) => { d[k] = src[k]; });
    d.items = (src.items || []).map((it) => Docs.blankItem(Object.assign({}, it, { id: U.uid() })));
  }
  function importExpenses(d, eventId, replaceIfEmpty) {
    const exps = App.expensesOf(eventId);
    if (!exps.length) return 0;
    const items = exps.map((e) => Docs.itemFromExpense(e, App.settings));
    if (replaceIfEmpty && !Docs.filledItems(d).length) d.items = items;
    else d.items = Docs.filledItems(d).concat(items.filter((it) => !d.items.some((x) => x.expenseId && x.expenseId === it.expenseId)));
    return items.length;
  }

  function evCount(it) {
    if (!draft || draft._new) return 0;
    const ev = F().evidence(draft, App.data.images);
    return (ev.by[it.id] || []).length;
  }
  function itemRowsHTML() {
    const ro = roNow(), needEv = draft.type !== 'TU';
    const rv = F().reviewOf(draft) || {}, chk = rv.items || {};
    const hdSel = (it) => '<select class="select" data-f="hd" aria-label="Tình trạng hoá đơn">' + F().HD.map((o) => '<option value="' + o.v + '"' + ((it.hd || '') === o.v ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select>';
    return draft.items.map((it, i) => {
      const n = evCount(it), c = chk[it.id] || {};
      return '<tr data-i="' + i + '"><td class="ix">' + (i + 1) + (c.ok ? '<span class="okd" title="Kế toán đã đối chiếu">' + I('check', 12) + '</span>' : '') + '</td>' +
        '<td class="wide" data-l="Nội dung" style="min-width:200px"><textarea class="textarea" rows="1" data-f="noiDung" placeholder="Nội dung khoản chi">' + esc(it.noiDung) + '</textarea></td>' +
        '<td data-l="Ngày chi" style="width:140px"><input class="input" type="date" data-f="ngayChi" value="' + esc(it.ngayChi || '') + '"></td>' +
        '<td data-l="Người tham gia" style="min-width:120px"><input class="input" data-f="nguoiThamGia" value="' + esc(it.nguoiThamGia) + '" placeholder="VD: Giáp, Dũng"></td>' +
        '<td data-l="Số lượng" style="width:70px"><input class="input" data-f="soLuong" inputmode="decimal" value="' + esc(it.soLuong) + '" placeholder="SL" style="text-align:center"></td>' +
        '<td data-l="Đơn giá" style="width:130px"><input class="input money" data-f="donGia" inputmode="numeric" data-money value="' + (U.toNumber(it.donGia) ? U.groupThousand(it.donGia) : '') + '" placeholder="0"></td>' +
        '<td class="tt" data-l="Thành tiền" data-tt="' + i + '">' + (Docs.lineTotal(it) ? U.groupThousand(Docs.lineTotal(it)) : '') + '</td>' +
        '<td data-l="Hoá đơn" style="min-width:150px">' + hdSel(it) + (c.hd ? '<span class="sub ok-t">' + I('check', 11) + ' KT đã nhận HĐ</span>' : '') + '</td>' +
        '<td class="wide" data-l="Ghi chú" style="min-width:140px"><input class="input" data-f="ghiChu" value="' + esc(it.ghiChu) + '" placeholder="Số HĐ, ghi chú…"></td>' +
        '<td data-l="Chứng từ" style="width:74px"><a href="#" class="btn ' + (n ? 'sec' : needEv ? 'out warn-b' : 'out') + ' xs ev-btn" data-act="itemEv:' + i + '" title="Ảnh minh chứng / chứng từ của dòng này">' + I('camera', 14) + (n || (ro ? '0' : '+')) + '</a></td>' +
        '<td class="del" style="width:36px;padding-top:8px">' + (ro ? '' : '<button class="btn ghost icon xs" data-act="itemDel:' + i + '" title="Xoá dòng" aria-label="Xoá dòng">' + I('trash') + '</button>') + '</td></tr>';
    }).join('');
  }

  function statusBanner(d) {
    if (d._new) return '';
    const Fl = F(), s = Fl.status(d), r = Fl.reviewOf(d) || {}, info = Fl.ST[s];
    const who = r.byName ? ' · ' + esc(r.byName) + ' lúc ' + esc(U.fmtDateTime(r.at)) : '';
    let body = '', cls = 'info', ic = info.ic;
    if (s === 'nhap') body = '<b>Phiếu nháp — chưa gửi kế toán.</b> Kiểm tra bảng kê' + (d.type !== 'TU' ? ', chụp chứng từ từng dòng và chọn tình trạng hoá đơn' : '') + ' rồi bấm <b>Gửi duyệt</b>.';
    else if (s === 'cho-duyet') { body = '<b>Đã gửi — đang chờ kế toán duyệt</b> (lần ' + (d.round || 1) + ', ' + esc(U.fmtDateTime(d.submittedAt)) + '). Muốn sửa: bấm <b>Rút lại</b>.'; cls = 'info'; }
    else if (s === 'can-bo-sung') { body = '<b>Kế toán yêu cầu xem xét lại / bổ sung</b>' + who + (r.note ? '<div class="mt8 note-q">“' + esc(r.note) + '”</div>' : '') + '<div class="mt8">Sửa phiếu, bổ sung chứng từ / giải trình trong mục Trao đổi, rồi bấm <b>Gửi lại</b>.</div>'; cls = 'warn'; }
    else if (s === 'da-duyet') { body = '<b>Kế toán đã duyệt</b>' + who + (r.soSo ? ' · Số vào sổ <b class="mono">' + esc(r.soSo) + '</b>' : '') + '. Phiếu đã <b>khoá</b> — không sửa, không xoá, không bổ sung.' + (r.note ? '<div class="mt8 note-q">“' + esc(r.note) + '”</div>' : ''); cls = 'ok'; }
    else if (s === 'da-chi') { const pd = r.paid || {}; body = '<b>Đã duyệt chi</b>' + who + (r.soSo ? ' · Số vào sổ <b class="mono">' + esc(r.soSo) + '</b>' : '') + (pd.at ? '<br>Ngày chi ' + esc(U.fmtDate(pd.at)) + ' · ' + money(pd.amount) + (pd.ref ? ' · Mã GD <span class="mono">' + esc(pd.ref) + '</span>' : '') : '') + '<br>Phiếu đã <b>khoá</b> — không sửa, không xoá, không bổ sung.'; cls = 'ok'; }
    else if (s === 'tu-choi') { body = '<b>Kế toán từ chối phiếu</b>' + who + (r.note ? '<div class="mt8 note-q">“' + esc(r.note) + '”</div>' : '') + '<div class="mt8">Có thể nhân bản để lập phiếu mới, hoặc chuyển phiếu này vào thùng rác.</div>'; cls = 'danger'; }
    return '<div class="alert ' + cls + ' st-banner">' + I(ic) + '<div style="flex:1">' + body + '</div>' + Fl.badge(d) + '</div>';
  }

  function settleExtra(d) {
    if (d.type !== 'HU' || d._new) return '';
    const Fl = F(), st = Docs.settle(d); if (!st.has || st.adv === st.total) return '';
    const s = Fl.status(d), ok = s === 'da-duyet' || s === 'da-chi';
    const an = Fl.analyze({ docs: App.data.docs }); const x = an.hus.find((h) => h.hu.id === d.id) || {};
    if (st.adv > st.total) {
      const diff = st.adv - st.total;
      return '<div class="alert ' + (x.k === 'refunded' ? 'ok' : 'warn') + ' mt12">' + I('wallet') + '<div style="flex:1"><b>Tạm ứng thừa ' + money(diff) + ' — nộp lại tài khoản công ty</b><br><span style="font-size:13px">TK nhận: ' + esc(App.settings.bankLine || '') + '<br>Nội dung CK gợi ý: <span class="mono">' + esc((d.nguoiDeNghi || '') + ' nop lai tam ung ' + (d.tuSoPhieu || '')) + '</span></span>' +
        (x.k === 'refunded' ? '<div class="mt8"><span class="badge ok">' + I('check', 12) + 'Kế toán đã xác nhận nhận tiền ' + esc(U.fmtDate(x.refund.at)) + '</span></div>'
          : x.k === 'refund-wait' ? '<div class="mt8"><span class="badge accent">Đã báo nộp lại — chờ kế toán xác nhận</span></div>'
            : ok ? '<div class="mt8"><button class="btn sm" data-act="huRefund">' + I('send') + 'Báo đã nộp lại</button></div>' : '<div class="mt8 muted" style="font-size:12.5px">Sau khi kế toán duyệt phiếu, chuyển khoản rồi bấm “Báo đã nộp lại”.</div>') + '</div></div>';
    }
    const diff = st.total - st.adv, tt = x.tt;
    return '<div class="alert ' + (tt ? 'info' : 'warn') + ' mt12">' + I('calc') + '<div style="flex:1"><b>Chi vượt tạm ứng ' + money(diff) + ' — lập Giấy đề nghị thanh toán (DNTT) bù</b><br><span style="font-size:13px">Kế toán theo dõi khoản bù qua phiếu DNTT gắn với phiếu hoàn ứng này.</span>' +
      (tt ? '<div class="mt8">Đã lập: <a href="#/phieu/' + esc(tt.id) + '"><b>' + esc(tt.soPhieu) + '</b></a> ' + Fl.badge(tt, null, true) + '</div>'
        : '<div class="mt8"><a class="btn sm" href="#/phieu/moi/TT?bu=' + esc(d.id) + '">' + I('plus') + 'Lập DNTT bù ' + money(diff) + '</a></div>') + '</div></div>';
  }

  function renderEditor(root) {
    const d = draft, T = TYPES[d.type], s = App.settings, Fl = F();
    const isNew = !!d._new, ro = roNow(), st = isNew ? 'nhap' : Fl.status(d);
    const evOpts = [{ v: '', t: '(Không gắn sự kiện)' }].concat(App.data.events.map((e) => ({ v: e.id, t: e.name + (e.date ? ' · ' + U.fmtDate(e.date) : '') })));
    const tus = App.data.docs.filter((x) => x.type === 'TU');
    const boPhanOpts = Array.from(new Set((s.boPhanList || []).concat(d.boPhan ? [d.boPhan] : [])));
    const settledBy = App.data.docs.find((x) => x.type === 'HU' && x.tuDocId === d.id);
    const huParent = d.huDocId ? App.data.docs.find((x) => x.id === d.huDocId) : null;
    const canSubmit = !ro && (st === 'nhap' || st === 'can-bo-sung');

    root.innerHTML =
      '<div class="crumbs"><a href="#/' + T.route + '">' + I('left', 14) + 'Phiếu ' + T.label.toLowerCase() + '</a><span>/</span><span>' + esc(d.soPhieu || 'Phiếu mới') + '</span></div>' +
      App.pageHead((isNew ? 'Lập phiếu ' : 'Phiếu ') + T.label.toLowerCase() + ' <span class="badge mono primary" style="vertical-align:middle;font-size:13px">' + esc(d.soPhieu) + '</span>',
        (ro ? '<span class="badge out">' + I('lock', 12) + 'Chỉ xem</span>' : '<span id="dirty-flag">' + (dirty ? '<span class="badge warn">Chưa lưu</span>' : '<span class="badge ok">Đã lưu</span>') + '</span>') +
        ' &nbsp;' + (ro ? 'Phiếu đang ở trạng thái ' + esc(Fl.ST[st].t.toLowerCase()) + '.' : 'Điền các ô bên trái — tờ phiếu bên phải cập nhật ngay theo đúng mẫu ' + esc(s.mauSo) + '.'),
        (ro ? '' : '<button class="btn' + (canSubmit ? ' out' : '') + '" data-act="docSave">' + I('check') + 'Lưu</button>') +
        (canSubmit ? '<button class="btn accent" data-act="docSubmit">' + I('send') + (st === 'can-bo-sung' ? 'Gửi lại' : 'Gửi duyệt') + '</button>' : '') +
        (st === 'cho-duyet' && !isNew ? '<button class="btn out" data-act="docWithdraw">' + I('restore') + 'Rút lại để sửa</button>' : '') +
        '<button class="btn out" data-act="docWord:_draft">' + I('word') + 'Word</button>' +
        '<button class="btn out" data-act="docExcel:_draft">' + I('excel') + 'Excel</button>' +
        '<button class="btn out" data-act="docPdf:_draft">' + I('pdf') + 'PDF</button>' +
        '<button class="btn out" data-act="docShare:_draft" title="Gửi qua Zalo / ứng dụng khác">' + I('share') + 'Gửi Zalo</button>' +
        (isNew ? '' : '<button class="btn ghost icon" data-act="docMore" title="Thao tác khác" aria-label="Thao tác khác">' + I('more') + '</button>')) +
      statusBanner(d) +

      '<div class="ed-tabs"><div class="seg"><button class="on" data-act="edView:form">' + I('edit', 15) + ' Soạn phiếu</button><button data-act="edView:pv">' + I('eye', 15) + ' Xem trước tờ in</button></div></div>' +
      '<div class="grid g-side2" data-view="form" id="ed-grid">' +
      '<div class="stack"><fieldset class="fs-ro" id="doc-fs"' + (ro ? ' disabled' : '') + '><div class="stack" id="doc-form">' +

      // ---- Thông tin phiếu
      '<div class="card"><div class="card-h"><div class="t">' + I('file') + 'Thông tin phiếu</div></div><div class="card-b"><div class="fgrid c2">' +
      ui.field('Số phiếu', '<div class="row" style="flex-wrap:nowrap;gap:6px"><input class="input mono" id="d-soPhieu" value="' + esc(d.soPhieu) + '" style="flex:1">' +
        '<input class="input mono" id="d-stt" inputmode="numeric" value="' + esc(Docs.sttOf(d.soPhieu)) + '" title="Số thứ tự phiếu trong tháng" aria-label="STT trong tháng" style="width:62px;text-align:center">' +
        '<button class="btn out icon" data-act="docRenumber" title="Đánh lại số tự động" aria-label="Đánh lại số">' + I('refresh') + '</button></div>',
        { hint: T.prefix + '-YYYYMM-STT · ô nhỏ = số thứ tự phiếu trong tháng (tự tăng, sửa được)' }) +
      ui.date('d-ngayLap', 'Ngày lập', d.ngayLap, { hint: 'Mặc định hôm nay. Đổi tháng → số phiếu tự nhảy theo tháng mới' }) +
      ui.text('d-nguoiDeNghi', 'Người đề nghị', d.nguoiDeNghi, { req: true }) +
      ui.text('d-boPhan', 'Bộ phận', d.boPhan, { list: 'dl-bophan', ph: 'Chọn hoặc gõ bộ phận' }) + ui.datalist('dl-bophan', boPhanOpts) +
      '<div class="sall">' + ui.select('d-eventId', 'Sự kiện / đợt chi', d.eventId || '', evOpts) + '</div>' +
      '<div class="sall">' + ui.textarea('d-noiDung', 'Nội dung', d.noiDung, { rows: 2, req: true, ph: 'VD: Thanh toán phí vận chuyển' }) + '</div>' +
      '<div class="sall">' + ui.textarea('d-mucDich', 'Mục đích', d.mucDich, { rows: 2, ph: 'VD: Book xe chở sa bàn cho TH Bắc Hồng' }) + '</div>' +
      '</div>' + (huParent ? '<div class="alert info mt8">' + I('link') + '<div>DNTT bù chi vượt tạm ứng của phiếu hoàn ứng <a href="#/phieu/' + esc(huParent.id) + '"><b>' + esc(huParent.soPhieu) + '</b></a>.</div></div>' : '') + '</div></div>' +

      // ---- Quyết toán (hoàn ứng)
      (d.type === 'HU' ? '<div class="card"><div class="card-h"><div class="t">' + I('wallet') + 'Quyết toán tạm ứng</div></div><div class="card-b"><div class="fgrid c2">' +
        ui.select('d-tuDocId', 'Chọn phiếu tạm ứng đã lập', d.tuDocId || '', [{ v: '', t: '(Nhập tay bên dưới)' }].concat(tus.map((x) => ({ v: x.id, t: x.soPhieu + ' · ' + U.groupThousand(Docs.total(x)) + ' đ · ' + (x.noiDung || '').slice(0, 40) }))), { change: 'pickTU' }) +
        '<div></div>' +
        ui.text('d-tuSoPhieu', 'Phiếu tạm ứng số', d.tuSoPhieu, { ph: 'DNTU-202611-01' }) +
        ui.money('d-daTamUng', 'Số tiền đã tạm ứng', d.daTamUng) +
        '</div><div class="alert info" id="settle-box"></div></div></div>' : '') +

      // ---- Bảng kê
      '<div class="card"><div class="card-h"><div class="t">' + I('list') + (d.type === 'HU' ? 'Bảng kê chi phí thực tế đã chi' : 'Bảng kê đề nghị chi') + '</div>' +
      (ro ? '' : '<div class="row"><button class="btn out sm" data-act="itemsFromExpenses">' + I('receipt') + 'Lấy từ khoản chi</button></div>') + '</div>' +
      '<div class="card-b" style="padding-left:12px;padding-right:12px"><div class="tbl-wrap"><table class="tbl items"><thead><tr><th>#</th><th>Nội dung</th><th>Ngày chi</th><th>Người tham gia</th><th>SL</th><th>Đơn giá</th><th class="num">Thành tiền</th><th>Hoá đơn</th><th>Ghi chú</th><th>Chứng từ</th><th></th></tr></thead>' +
      '<tbody id="items-body">' + itemRowsHTML() + '</tbody></table></div>' +
      (ro ? '' : '<div class="row mt12" style="padding:0 8px"><button class="btn sec sm" data-act="itemAdd">' + I('plus') + 'Thêm dòng</button>' +
        '<span class="muted" style="font-size:12.5px">Khoản trọn gói: để trống SL, nhập số tiền vào Đơn giá.' + (d.type !== 'TU' ? ' Mỗi dòng cần ảnh chứng từ ' + I('camera', 12) + ' và tình trạng hoá đơn để kế toán đối chiếu.' : '') + '</span></div>') +
      '<div class="kv big mt12" style="padding:12px 8px 0;border-top:1px solid hsl(var(--vien))"><div class="k">CỘNG</div><div class="v" id="d-total"></div></div>' +
      '<div class="muted" id="d-words" style="padding:2px 8px 0;font-style:italic;font-size:13px"></div>' +
      '</div></div>' +

      // ---- Nhận tiền
      '<div class="card"><div class="card-h"><div class="t">' + I('building') + 'Thông tin nhận tiền</div>' +
      (ro ? '' : '<button class="btn ghost sm" data-act="fillBank">' + I('user') + 'Lấy từ hồ sơ</button>') + '</div><div class="card-b"><div class="fgrid c2">' +
      '<div class="sall">' + ui.text('d-tenTK', 'Tên tài khoản', d.tenTK) + '</div>' +
      ui.text('d-soTK', 'Số tài khoản', d.soTK, { ph: 'VD: 03042004888999' }) +
      ui.text('d-nganHang', 'Tại ngân hàng', d.nganHang, { ph: 'VD: MB Bank' }) +
      '<div class="sall">' + ui.text('d-truongBoPhan', 'Trưởng bộ phận (in dưới ô ký, để trống nếu ký tay)', d.truongBoPhan || '') + '</div>' +
      '<div class="sall">' + ui.textarea('d-deNghiKhac', 'Đề nghị khác', d.deNghiKhac, { rows: 2, ph: 'Không' }) + '</div>' +
      '</div></div></div>' +
      '</div></fieldset>' +

      settleExtra(d) +

      // ---- Tệp đính kèm chung
      '<div class="card"><div class="card-h"><div class="t">' + I('link') + 'Tệp đính kèm chung (hợp đồng, bảng kê…)</div></div><div class="card-b">' +
      (isNew ? '<p class="muted" style="margin:0;font-size:13px">Lưu phiếu trước, sau đó tải lên tệp.</p>' : App.renderAttachments(d.id, ro)) + '</div></div>' +

      (d.type === 'TU' && !isNew ? '<div class="alert ' + (settledBy ? 'ok' : 'info') + '">' + I(settledBy ? 'check' : 'info') + '<div>' +
        (settledBy ? 'Phiếu này đã được quyết toán bằng phiếu hoàn ứng <a href="#/phieu/' + settledBy.id + '"><b>' + esc(settledBy.soPhieu) + '</b></a> ' + Fl.badge(settledBy, null, true) + '.'
          : st === 'da-chi' ? '<b>Tạm ứng đã được chi.</b> Sau khi chi tiêu xong, lập <b>phiếu hoàn ứng</b> kèm hoá đơn, bảng kê — số phiếu tạm ứng và số tiền đã ứng được điền sẵn.' +
            '<div class="mt8"><a class="btn sm" href="#/phieu/moi/HU?from=' + d.id + '">' + I('wallet') + 'Lập phiếu hoàn ứng</a></div>'
            : 'Khi kế toán duyệt chi tạm ứng, lập <b>phiếu hoàn ứng</b> từ phiếu này để quyết toán.') + '</div></div>' : '') +

      (isNew ? '' : Fl.threadCard(Fl.myId(), d)) +
      '</div>' +

      // ---- Xem trước
      '<div class="pv-col"><div class="sticky-pv" style="position:sticky;top:80px"><div class="row" style="margin-bottom:8px"><b>Xem trước tờ phiếu</b><span class="spacer"></span><span class="muted" style="font-size:12.5px">A4 dọc · Times New Roman</span></div>' +
      '<div id="doc-preview">' + Docs.previewBox(d) + '</div></div></div>' +
      '</div>';

    updateTotals();
    setTimeout(fitPaper, 0);
    const img = root.querySelector('#doc-preview img'); if (img) img.onload = fitPaper;
    const form = root.querySelector('#doc-form');
    if (!ro) { form.addEventListener('input', onFormInput); form.addEventListener('change', onFormInput); }
    if (!isNew) Fl.loadThread(Fl.myId(), d);
  }

  let pvTimer = null;
  function onFormInput(e) {
    const t = e.target;
    if (t && t.id === 'd-stt' && e.type === 'change') {
      const n = parseInt(t.value, 10);
      if (n > 0) { document.getElementById('d-soPhieu').value = Docs.numberOf(draft.type, App.val('d-ngayLap') || U.todayISO(), n); }
    }
    if (t && t.id === 'd-ngayLap' && e.type === 'change') {
      // đổi sang tháng khác → số phiếu nhảy theo tháng mới (nếu số đang theo mẫu tự động)
      const so = App.val('d-soPhieu'), iso = App.val('d-ngayLap') || U.todayISO();
      const m = new RegExp('^' + TYPES[draft.type].prefix + '-(\\d{6})-\\d+$').exec(so);
      if (m && m[1] !== Docs.monthKey(iso)) {
        const nx = Docs.nextNumber(draft.type, iso, App.data.docs.filter((x) => x.id !== draft.id));
        document.getElementById('d-soPhieu').value = nx; const sEl = document.getElementById('d-stt'); if (sEl) sEl.value = Docs.sttOf(nx);
        App.toast('Số phiếu đổi theo tháng lập: ' + nx);
      }
    }
    if (t && t.id === 'd-soPhieu') { const sEl = document.getElementById('d-stt'); if (sEl) sEl.value = Docs.sttOf(t.value); }
    collect();
    const tr = t.closest && t.closest('tr[data-i]');
    if (tr) {
      const i = +tr.getAttribute('data-i');
      const c = document.querySelector('[data-tt="' + i + '"]');
      if (c) { const v = Docs.lineTotal(draft.items[i]); c.textContent = v ? U.groupThousand(v) : ''; }
    }
    if (t.tagName === 'TEXTAREA') autoGrow(t);
    updateTotals();
    markDirty();
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const pv = document.getElementById('doc-preview');
      if (pv) { pv.innerHTML = Docs.previewBox(draft); fitPaper(); }
    }, 120);
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight + 2) + 'px'; }
  function markDirty() {
    dirty = !!draft._new || JSON.stringify(stripDraft(draft)) !== original;
    const f = document.getElementById('dirty-flag');
    if (f) f.innerHTML = dirty ? '<span class="badge warn">Chưa lưu</span>' : '<span class="badge ok">Đã lưu</span>';
  }
  function updateTotals() {
    const t = Docs.total(draft);
    const a = document.getElementById('d-total'); if (a) a.textContent = money(t);
    const w = document.getElementById('d-words'); if (w) w.textContent = t ? 'Bằng chữ: ' + App.docSo(t) : '';
    const sb = document.getElementById('settle-box');
    if (sb) {
      const x = Docs.settle(draft);
      sb.innerHTML = I(x.has ? (x.adv === x.total ? 'check' : 'alert') : 'info') + '<div>' + esc(x.line) + '<br><b>' + esc(x.concl) + '</b></div>';
      sb.className = 'alert ' + (!x.has ? 'info' : x.adv === x.total ? 'ok' : 'warn');
    }
  }

  function collect() {
    if (!draft || !document.getElementById('d-soPhieu') || roNow()) return draft;
    const v = App.val;
    draft.soPhieu = v('d-soPhieu'); draft.ngayLap = v('d-ngayLap');
    draft.nguoiDeNghi = v('d-nguoiDeNghi'); draft.boPhan = v('d-boPhan');
    draft.eventId = v('d-eventId') || null;
    draft.noiDung = v('d-noiDung'); draft.mucDich = v('d-mucDich');
    draft.tenTK = v('d-tenTK'); draft.soTK = v('d-soTK'); draft.nganHang = v('d-nganHang');
    draft.deNghiKhac = v('d-deNghiKhac'); draft.truongBoPhan = v('d-truongBoPhan');
    if (draft.type === 'HU') {
      draft.tuDocId = v('d-tuDocId') || null; draft.tuSoPhieu = v('d-tuSoPhieu');
      draft.daTamUng = document.getElementById('d-daTamUng').value.trim() === '' ? '' : App.valMoney('d-daTamUng');
    }
    document.querySelectorAll('#items-body tr[data-i]').forEach((tr) => {
      const it = draft.items[+tr.getAttribute('data-i')]; if (!it) return;
      tr.querySelectorAll('[data-f]').forEach((inp) => {
        const k = inp.getAttribute('data-f');
        it[k] = k === 'donGia' ? U.toNumber(inp.value) : inp.value.trim();
      });
    });
    return draft;
  }

  function rerenderItems() {
    const b = document.getElementById('items-body'); if (b) b.innerHTML = itemRowsHTML();
    updateTotals(); markDirty();
    const pv = document.getElementById('doc-preview'); if (pv) { pv.innerHTML = Docs.previewBox(draft); fitPaper(); }
  }

  function validate(d) {
    if (!d.nguoiDeNghi) return 'Nhập người đề nghị';
    if (!d.noiDung) return 'Nhập nội dung phiếu';
    if (!Docs.filledItems(d).length) return 'Bảng kê chưa có dòng nào';
    if (!d.soPhieu) return 'Thiếu số phiếu';
    const dup = App.data.docs.find((x) => x.id !== d.id && x.soPhieu === d.soPhieu);
    if (dup) return 'Số phiếu ' + d.soPhieu + ' đã dùng cho phiếu khác — bấm nút đánh lại số';
    return '';
  }

  async function saveDraft(silent) {
    if (roNow()) { if (!silent) App.toast('Phiếu đã khoá hoặc đang chờ duyệt — không sửa được', 'err'); return draft; }
    collect();
    const err = validate(draft);
    if (err) { App.toast(err, 'err'); return null; }
    const rec = stripDraft(draft);
    rec.items = Docs.filledItems(rec);
    rec.total = Docs.total(rec);
    const wasNew = !!draft._new;
    const before = original ? JSON.parse(original) : null;
    const changed = JSON.stringify(rec) !== original;
    await DB.put('docs', rec);
    // lịch sử chỉnh sửa (người lập, kế toán, quản trị đều xem được)
    if (wasNew) F().log(F().myId(), rec, 'Tạo phiếu', [TYPES[rec.type].label + ' · ' + money(rec.total)]);
    else if (changed) { const lines = F().diff(before, rec); if (lines.length) F().log(F().myId(), rec, 'Sửa phiếu', lines); }
    draft = JSON.parse(JSON.stringify(rec));
    original = JSON.stringify(rec);
    if (!draft.items.length) draft.items = [Docs.blankItem()];
    if (!silent) App.toast('Đã lưu phiếu ' + rec.soPhieu, 'ok');
    if (wasNew) {
      history.replaceState(null, '', '#/phieu/' + rec.id);
      App.route = { name: 'phieu', parts: ['phieu', rec.id], q: {} };
    }
    await App.loadData();
    if (wasNew || !silent) App.render(); else markDirty();
    return rec;
  }
  Docs.saveDraft = saveDraft;

  function docById(id) {
    if (id === '_draft') return collect();
    return App.data.docs.find((x) => x.id === id) || (App.adminDocs && App.adminDocs.find((x) => x.id === id));
  }
  Docs.byId = docById;
  // lấy phiếu để xuất file: phiếu đang soạn thì lưu trước (nếu còn sửa được)
  async function docForExport(id) {
    let d = docById(id); if (!d) return null;
    if (id === '_draft') { if (roNow()) return draft; const saved = await saveDraft(true); if (!saved) return null; d = saved; }
    return d;
  }
  Docs.forExport = docForExport;

  window.addEventListener('beforeunload', (e) => {
    if (App.route && App.route.name === 'phieu' && dirty && draft && !roNow()) { e.preventDefault(); e.returnValue = ''; }
  });

  App.inputCb.pickTU = function (sel) {
    const tu = App.data.docs.find((x) => x.id === sel.value);
    if (!tu) return;
    document.getElementById('d-tuSoPhieu').value = tu.soPhieu;
    document.getElementById('d-daTamUng').value = U.groupThousand(Docs.total(tu));
    collect(); updateTotals();
  };

  Object.assign(App.actions, {
    itemAdd() {
      if (roNow()) return;
      collect();
      const last = draft.items[draft.items.length - 1] || {};
      draft.items.push(Docs.blankItem({ ngayChi: last.ngayChi || draft.ngayLap || '', nguoiThamGia: last.nguoiThamGia || '' }));
      rerenderItems();
      const rows = document.querySelectorAll('#items-body tr'); const t = rows[rows.length - 1] && rows[rows.length - 1].querySelector('textarea'); if (t) t.focus();
    },
    itemDel(i) {
      if (roNow()) return;
      collect(); draft.items.splice(+i, 1);
      if (!draft.items.length) draft.items = [Docs.blankItem()];
      rerenderItems();
    },
    // ảnh minh chứng của từng dòng bảng kê (chụp trực tiếp hoặc chọn ảnh)
    async itemEv(i) {
      const ro = roNow();
      collect();
      let it = draft.items[+i]; if (!it) return;
      if (!ro && (draft._new || dirty)) {
        if (!(it.noiDung || '').trim() && !U.toNumber(it.donGia)) { App.toast('Nhập nội dung / số tiền của dòng trước khi đính kèm', 'err'); return; }
        const saved = await saveDraft(true); if (!saved) return;
        it = draft.items.find((x) => x.id === it.id) || it;
      }
      const idx = Docs.filledItems(draft).findIndex((x) => x.id === it.id);
      const imgs = () => (F().evidence(draft, App.data.images).by[it.id] || []);
      const doc = draft;
      F().openEvidence({
        title: 'Chứng từ dòng ' + (idx + 1), sub: (it.noiDung || '') + ' · ' + money(Docs.lineTotal(it)) + ' · ' + F().HD_T[F().hdOf(it)],
        imgs, editable: !ro,
        async onAdd(files) {
          const list = await App.prepFiles(files);
          for (const f of list) { const rec = App.makeImage(f, null, doc.eventId || null, { docId: doc.id, itemId: it.id, name: f.name || 'Chứng từ dòng ' + (idx + 1) }); delete rec.isNewBlob; await DB.put('images', rec); }
          await App.loadData();
          F().log(F().myId(), doc, 'Thêm chứng từ', ['Dòng ' + (idx + 1) + ' (' + (it.noiDung || '').slice(0, 30) + '): +' + list.length + ' ảnh/tệp']);
          rerenderItems(); App.toast('Đã thêm ' + list.length + ' chứng từ', 'ok');
        },
        async onDel(id) {
          await DB.del('images', id); await App.loadData();
          F().log(F().myId(), doc, 'Xoá chứng từ', ['Dòng ' + (idx + 1) + ' (' + (it.noiDung || '').slice(0, 30) + '): −1 ảnh']);
          rerenderItems();
        },
      });
    },
    docRenumber() {
      if (roNow()) return;
      collect();
      const others = App.data.docs.filter((x) => x.id !== draft.id);
      draft.soPhieu = Docs.nextNumber(draft.type, draft.ngayLap || U.todayISO(), others);
      document.getElementById('d-soPhieu').value = draft.soPhieu;
      const sEl = document.getElementById('d-stt'); if (sEl) sEl.value = Docs.sttOf(draft.soPhieu);
      markDirty(); rerenderItems();
    },
    fillBank() {
      const s = App.settings;
      if (!s.soTK && !s.tenTK) { App.toast('Hồ sơ cá nhân chưa có thông tin tài khoản — vào Thêm → Hồ sơ cá nhân', 'err'); return; }
      document.getElementById('d-tenTK').value = s.tenTK || s.hoTen || '';
      document.getElementById('d-soTK').value = s.soTK || '';
      document.getElementById('d-nganHang').value = s.nganHang || '';
      onFormInput({ target: document.getElementById('d-tenTK') });
    },
    itemsFromExpenses() {
      if (roNow()) return;
      collect();
      const evId = draft.eventId;
      const evs = App.data.events;
      if (!evs.length) { App.toast('Chưa có sự kiện / khoản chi nào', 'err'); return; }
      const pick = evId || evs[0].id;
      const body = () => {
        const id = document.getElementById('fx-ev') ? document.getElementById('fx-ev').value : pick;
        const exps = App.expensesOf(id);
        const used = new Set(draft.items.map((x) => x.expenseId).filter(Boolean));
        if (!exps.length) return '<p class="muted">Sự kiện này chưa có khoản chi.</p>';
        return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="fx-all" checked aria-label="Chọn tất cả"></th><th>Ngày</th><th>Nội dung</th><th class="num">Số tiền</th></tr></thead><tbody>' +
          exps.map((e) => '<tr><td><input type="checkbox" class="fx-c" value="' + e.id + '"' + (used.has(e.id) ? '' : ' checked') + '></td><td class="nowrap">' + esc(U.fmtDayMonth(e.date)) +
            '</td><td>' + esc(e.content) + (used.has(e.id) ? ' <span class="badge out">đã có</span>' : '') + '</td><td class="num">' + money(e.amount) + '</td></tr>').join('') + '</tbody></table></div>';
      };
      const ov = App.openSheet(App.sheetHead('Lấy dòng bảng kê từ khoản chi', 'Mỗi khoản chi thành 1 dòng: nội dung, ngày chi, số tiền, hoá đơn và ảnh minh chứng') +
        App.ui.select('fx-ev', 'Sự kiện / đợt chi', pick, evs.map((e) => ({ v: e.id, t: e.name }))) +
        '<div id="fx-body">' + body() + '</div>' +
        '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="fx-ok">' + I('plus') + 'Thêm vào bảng kê</button></div>', { wide: true });
      const bind = () => { const a = ov.querySelector('#fx-all'); if (a) a.onchange = () => ov.querySelectorAll('.fx-c').forEach((c) => { c.checked = a.checked; }); };
      bind();
      ov.querySelector('#fx-ev').onchange = () => { ov.querySelector('#fx-body').innerHTML = body(); bind(); };
      ov.querySelector('#fx-ok').onclick = () => {
        const ids = Array.from(ov.querySelectorAll('.fx-c:checked')).map((c) => c.value);
        const exps = App.data.expenses.filter((e) => ids.includes(e.id));
        if (!exps.length) { App.toast('Chưa chọn khoản chi nào', 'err'); return; }
        const keep = Docs.filledItems(draft);
        draft.items = keep.concat(exps.map((e) => Docs.itemFromExpense(e, App.settings)));
        if (!draft.eventId) { draft.eventId = ov.querySelector('#fx-ev').value; const sel = document.getElementById('d-eventId'); if (sel) sel.value = draft.eventId; }
        App.closeSheet(ov); rerenderItems();
        App.toast('Đã thêm ' + exps.length + ' dòng (kèm ảnh hoá đơn của khoản chi)', 'ok');
      };
    },
    async docSave() { await saveDraft(false); },
    async docSubmit() {
      const rec = await saveDraft(true); if (!rec) return;
      const d = App.data.docs.find((x) => x.id === rec.id) || rec;
      const ok = await F().submit(JSON.parse(JSON.stringify(d)));
      if (ok) { await App.loadData(); draft = null; App.render(); }
    },
    docWithdraw() {
      const d = App.data.docs.find((x) => x.id === draft.id); if (!d) return;
      App.confirmSheet('Rút lại phiếu?', 'Phiếu chuyển về Nháp để bạn sửa. Kế toán sẽ nhận thông báo. Sửa xong bấm Gửi duyệt lại.', async () => {
        await F().withdraw(JSON.parse(JSON.stringify(d))); await App.loadData(); draft = null; App.render();
      }, false, 'Rút lại');
    },
    huRefund() {
      const d = App.data.docs.find((x) => x.id === draft.id); if (!d) return;
      const st = Docs.settle(d), diff = st.adv - st.total;
      let img = null;
      const ov = App.openSheet(App.sheetHead('Báo đã nộp lại tiền tạm ứng thừa', d.soPhieu + ' · ' + money(diff)) +
        '<div class="alert info">' + I('building') + '<div>Chuyển khoản về: <b>' + esc(App.settings.bankLine || '') + '</b></div></div>' +
        '<div class="fgrid c2 mt12">' + ui.money('rf-amt', 'Số tiền đã nộp', diff) + ui.date('rf-date', 'Ngày chuyển', U.todayISO()) +
        '<div class="sall">' + ui.text('rf-ref', 'Mã giao dịch (trên sao kê / biên lai)', '', { ph: 'VD: FT26306430305389' }) + '</div>' +
        '<div class="sall">' + ui.text('rf-note', 'Ghi chú', '', { ph: 'Không bắt buộc' }) + '</div></div>' +
        '<div class="row mt8"><button class="btn out sm" id="rf-pic">' + I('camera') + 'Ảnh biên lai chuyển khoản</button><span id="rf-pv"></span></div>' +
        '<div class="sheet-f"><button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" id="rf-ok">' + I('send') + 'Gửi kế toán xác nhận</button></div>', { center: true });
      ov.querySelector('#rf-pic').onclick = async () => {
        const fs = await App.pickFiles('image/*', false); if (!fs.length) return;
        img = await F().smallDataURL(fs[0]); ov.querySelector('#rf-pv').innerHTML = '<img src="' + esc(img) + '" alt="" style="height:44px;border-radius:6px">';
      };
      ov.querySelector('#rf-ok').onclick = async () => {
        const amount = App.valMoney('rf-amt'); if (!amount) { App.toast('Nhập số tiền đã nộp', 'err'); return; }
        await F().reportRefund(d, { amount, date: App.val('rf-date'), ref: App.val('rf-ref'), note: App.val('rf-note'), img });
        App.closeSheet(ov); App.render();
      };
    },
    edView(v, btn) {
      const g = document.getElementById('ed-grid'); if (!g) return;
      g.setAttribute('data-view', v);
      btn.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      if (v === 'pv') { const pv = document.getElementById('doc-preview'); if (pv) { pv.innerHTML = Docs.previewBox(collect()); } setTimeout(fitPaper, 20); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    docPrint() { collect(); Docs.print(draft); },
    docMore() {
      const d = draft, Fl = F(), can = Fl.canDelete(d);
      const st = d.type === 'HU' ? Docs.settle(d) : null;
      const ov = App.openSheet(App.sheetHead('Thao tác', d.soPhieu + ' · ' + Fl.ST[Fl.status(d)].t) +
        '<div class="menu-item" data-act="docDuplicate"><div class="mic">' + I('copy') + '</div><div><div class="mt">Nhân bản phiếu</div><div class="ms">Tạo phiếu mới cùng nội dung, số phiếu mới</div></div></div>' +
        (d.type === 'TU' ? '<a class="menu-item" href="#/phieu/moi/HU?from=' + d.id + '" style="color:inherit;text-decoration:none"><div class="mic">' + I('wallet') + '</div><div><div class="mt">Lập phiếu hoàn ứng từ phiếu này</div><div class="ms">Điền sẵn số phiếu tạm ứng và số tiền đã ứng</div></div></a>' : '') +
        (st && st.has && st.total > st.adv ? '<a class="menu-item" href="#/phieu/moi/TT?bu=' + d.id + '" style="color:inherit;text-decoration:none"><div class="mic">' + I('calc') + '</div><div><div class="mt">Lập DNTT bù chi vượt</div><div class="ms">' + money(st.total - st.adv) + ' — gắn với phiếu hoàn ứng này</div></div></a>' : '') +
        '<div class="menu-item" data-act="docPrint"><div class="mic">' + I('printer') + '</div><div><div class="mt">In phiếu</div><div class="ms">In trực tiếp khổ A4</div></div></div>' +
        (can ? '<div class="menu-item" data-act="docDelete"><div class="mic" style="background:hsl(var(--nguy-hiem)/.1);color:hsl(var(--nguy-hiem-dam))">' + I('trash') + '</div><div><div class="mt">Chuyển vào thùng rác</div><div class="ms">' + (Fl.status(d) === 'cho-duyet' ? 'Phiếu đang chờ duyệt sẽ bị huỷ · ' : '') + 'Khôi phục được trong ' + App.TRASH_DAYS + ' ngày</div></div></div>'
          : '<div class="menu-item" style="opacity:.7;cursor:default"><div class="mic">' + I('lock') + '</div><div><div class="mt">Không xoá được</div><div class="ms">Phiếu đã được kế toán duyệt — đã khoá</div></div></div>'), { center: true });
      ov.addEventListener('click', (e) => { if (e.target.closest('a.menu-item')) App.closeSheet(ov); });
    },
    docDuplicate() { App.closeAllSheets(); location.hash = '#/phieu/moi/' + draft.type + '?copy=' + draft.id; },
    async docDelete() {
      App.closeAllSheets();
      if (!F().canDelete(draft)) { App.toast('Phiếu đã được duyệt — không xoá được', 'err'); return; }
      const id = draft.id, type = draft.type, d = draft, st = F().status(d);
      draft = null; dirty = false;
      App.nav(TYPES[type].route);
      await App.Trash.soft([{ store: 'docs', id }]);
      F().log(F().myId(), d, 'Chuyển phiếu vào thùng rác', []);
      if (st === 'cho-duyet') F().notify('acc', { title: F().myName() + ' huỷ ' + F().docLabel(d), body: 'Phiếu đang chờ duyệt đã bị người lập xoá', link: '#/duyet', kind: 'msg' });
    },
    async selDocsTrash() {
      const ids = App.Sel.list(); if (!ids.length) return;
      const docs = App.data.docs.filter((d) => ids.includes(d.id));
      const ok = docs.filter((d) => F().canDelete(d));
      if (ok.length < docs.length) App.toast((docs.length - ok.length) + ' phiếu đã duyệt nên không xoá được', 'err');
      if (ok.length) await App.Trash.soft(ok.map((d) => ({ store: 'docs', id: d.id })));
    },
    async selDocsExcel() {
      const ids = new Set(App.Sel.list());
      const docs = App.data.docs.filter((d) => ids.has(d.id)).reverse();
      if (!docs.length) return;
      App.toast('Đang tạo Excel ' + docs.length + ' phiếu…');
      await App.Export.excel(docs, 'Phieu-da-chon-' + U.todayISO() + '.xlsx');
    },
    async selDocsSubmit() {
      const ids = App.Sel.list();
      const docs = App.data.docs.filter((d) => ids.includes(d.id) && ['nhap', 'can-bo-sung'].includes(F().status(d)));
      if (!docs.length) { App.toast('Chọn phiếu nháp / cần bổ sung để gửi duyệt', 'err'); return; }
      let n = 0;
      for (const d of docs) { const errs = F().checkSubmit(d); if (errs.length) { App.toast(d.soPhieu + ': ' + errs[0], 'err'); continue; } if (await F().submit(JSON.parse(JSON.stringify(d)))) n++; }
      if (n) App.toast('Đã gửi ' + n + ' phiếu cho kế toán', 'ok');
      App.reload();
    },
    async docWord(id) {
      const d = await docForExport(id); if (!d) return;
      App.toast('Đang tạo file Word…');
      await App.Export.word(d);
    },
    async docExcel(id) {
      const d = await docForExport(id); if (!d) return;
      App.toast('Đang tạo file Excel…');
      await App.Export.excel([d], Docs.fileName(d, 'xlsx'));
    },
    async docPdf(id) {
      const d = await docForExport(id); if (!d) return;
      App.toast('Đang tạo PDF…');
      const blob = await App.PDF.doc(d);
      if (blob) U.saveBlob(blob, Docs.fileName(d, 'pdf'));
    },
    async docShare(id) {
      const d = await docForExport(id); if (!d) return;
      App.PDF.shareSheet(d.soPhieu, [
        { label: 'PDF tờ phiếu', ic: 'pdf', make: async () => ({ blob: await App.PDF.doc(d), name: Docs.fileName(d, 'pdf') }) },
        { label: 'Word tờ phiếu', ic: 'word', make: async () => ({ blob: await App.Export.word(d, { blobOnly: true }), name: Docs.fileName(d, 'docx') }) },
      ], 'Phiếu ' + d.soPhieu + ' – ' + (d.nguoiDeNghi || '') + ' – ' + money(Docs.total(d)));
    },
    async exportListExcel(type) {
      const rows = App._listRows ? App._listRows() : App.data.docs.filter((d) => d.type === type);
      if (!rows.length) return;
      App.toast('Đang tạo Excel ' + rows.length + ' phiếu…');
      await App.Export.excel(rows.slice().reverse(), 'Phieu-' + TYPES[type].prefix + '-' + U.todayISO() + '.xlsx');
    },
  });
})();
