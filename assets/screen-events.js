/* =========================================================================
   screen-events.js — Sự kiện / đợt chi · Hồ sơ cá nhân · Cấu hình mẫu phiếu ·
   Hướng dẫn sử dụng.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui, I = App.icon;
  const money = (n) => U.groupThousand(n) + ' đ';

  /* ----------------------- Sự kiện ----------------------- */
  App.screens['su-kien'] = function (root) {
    const evs = App.data.events;
    const rows = evs.map((ev) => {
      const m = App.statsOfEvent(ev.id);
      const bal = m.tu - m.spent;
      return '<tr class="click" data-href="#/chi-tieu/' + ev.id + '"><td data-l="Sự kiện"><b>' + esc(ev.name) + '</b><span class="sub">' + esc(ev.date ? U.fmtDate(ev.date) : '—') + (ev.location ? ' · ' + esc(ev.location) : '') + '</span></td>' +
        '<td class="num" data-l="Tạm ứng">' + money(m.tu) + '</td><td class="num" data-l="Thực chi">' + money(m.spent) + '<span class="sub">' + m.count + ' khoản</span></td>' +
        '<td class="num" data-l="Hoàn ứng / TT">' + money(m.hu + m.tt) + '</td>' +
        '<td class="num" data-l="Chênh lệch">' + (m.tu ? '<span class="' + (bal >= 0 ? 'pos' : 'neg') + '">' + (bal >= 0 ? '+' : '−') + U.groupThousand(Math.abs(bal)) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td data-l="Hoá đơn VAT"><span class="badge ' + (m.pctVat >= 70 ? 'ok' : m.pctVat >= 40 ? 'warn' : m.count ? 'danger' : 'out') + '">' + m.pctVat + '%</span></td>' +
        '<td class="acts"><a class="btn out xs" href="#/phieu/moi/TU?event=' + ev.id + '">' + I('file') + 'Tạm ứng</a>' +
        '<button class="btn ghost icon xs" data-act="editEvent:' + ev.id + '" title="Sửa" aria-label="Sửa sự kiện">' + I('edit') + '</button></td></tr>';
    }).join('');
    root.innerHTML = App.pageHead('Sự kiện / đợt chi', 'Nhóm khoản chi và phiếu theo từng sự kiện hoặc đợt công tác để quyết toán gọn.',
      '<button class="btn" data-act="addEvent">' + I('plus') + 'Thêm sự kiện</button>') +
      '<div class="card">' + (evs.length
        ? '<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Sự kiện</th><th class="num">Tạm ứng</th><th class="num">Thực chi</th><th class="num">Hoàn ứng / TT</th><th class="num">Chênh lệch</th><th>VAT</th><th class="acts"></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : App.emptyState('calendar', 'Chưa có sự kiện nào', 'Tạo sự kiện / đợt chi để bắt đầu ghi khoản chi.', '<button class="btn" data-act="addEvent">' + I('plus') + 'Thêm sự kiện</button>')) + '</div>';
  };

  function eventForm(ev) {
    ev = ev || {};
    const isNew = !ev.id;
    return App.sheetHead(isNew ? 'Thêm sự kiện / đợt chi' : 'Sửa sự kiện') +
      '<div class="fgrid c2"><div class="sall">' + ui.text('ev-name', 'Tên sự kiện / đợt chi', ev.name, { ph: 'VD: Ngày hội STEM THCS Cầu Giấy', req: true }) + '</div>' +
      ui.date('ev-date', 'Ngày', ev.date || U.todayISO()) + ui.text('ev-loc', 'Địa điểm', ev.location, { ph: 'Trường / địa điểm' }) +
      '<div class="sall">' + ui.textarea('ev-note', 'Ghi chú', ev.note, { rows: 2 }) + '</div></div>' +
      '<div class="sheet-f">' + (isNew ? '' : '<button class="btn danger-out" data-act="delEvent:' + ev.id + '">' + I('trash') + 'Xoá</button><span class="spacer"></span>') +
      '<button class="btn out" data-act="closeTop">Huỷ</button><button class="btn" data-act="saveEventForm:' + (ev.id || '') + '">' + I('check') + 'Lưu</button></div>';
  }

  /* ----------------------- Hồ sơ cá nhân ----------------------- */
  App.screens['ca-nhan'] = function (root) {
    const s = App.settings, u = App.cloud.user || {};
    root.innerHTML = App.pageHead('Hồ sơ cá nhân', 'Thông tin này được điền sẵn vào mọi phiếu đề nghị bạn lập.') +
      '<div class="grid g2">' +
      '<div class="card"><div class="card-h"><div class="t">' + I('user') + 'Người đề nghị</div></div><div class="card-b"><div class="fgrid c2">' +
      ui.text('pf-hoTen', 'Họ và tên', s.hoTen, { req: true }) + ui.text('pf-tenNgan', 'Tên ngắn (cột "Người tham gia")', s.tenNgan, { ph: App.lastName(s.hoTen) || 'VD: Giáp' }) +
      ui.text('pf-boPhan', 'Bộ phận', s.boPhan, { list: 'pf-dl' }) + ui.datalist('pf-dl', s.boPhanList) + ui.text('pf-chucVu', 'Chức vụ', s.chucVu) +
      '</div></div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('building') + 'Tài khoản nhận tiền</div></div><div class="card-b"><div class="fgrid c2">' +
      '<div class="sall">' + ui.text('pf-tenTK', 'Tên tài khoản', s.tenTK, { ph: s.hoTen }) + '</div>' +
      ui.text('pf-soTK', 'Số tài khoản', s.soTK) + ui.text('pf-nganHang', 'Ngân hàng', s.nganHang, { ph: 'VD: MB Bank' }) +
      '</div></div></div>' +
      '<div class="card span2"><div class="card-h"><div class="t">' + I('shield') + 'Đăng nhập & đồng bộ</div></div><div class="card-b">' +
      '<div class="kv"><div class="k">Email đăng nhập</div><div class="v">' + esc(u.email || '') + '</div></div>' +
      '<div class="kv"><div class="k">Quyền</div><div class="v">' + (App.isAdmin() ? '<span class="badge accent">Quản trị — xem được mọi tài khoản</span>' : '<span class="badge out">Người dùng</span>') + '</div></div>' +
      '<div class="kv"><div class="k">Đồng bộ gần nhất</div><div class="v">' + esc(App.cloud.lastSync ? U.fmtDateTime(App.cloud.lastSync) : '—') + '</div></div>' +
      '<div class="btn-row mt12" style="max-width:560px"><button class="btn out" data-act="syncNow">' + I('refresh') + 'Đồng bộ ngay</button><button class="btn out" data-act="changePassword">' + I('key') + 'Đổi mật khẩu</button><button class="btn danger-out" data-act="logout">' + I('logout') + 'Đăng xuất</button></div>' +
      '</div></div></div>' +
      '<div class="row mt16"><button class="btn" data-act="saveProfile">' + I('check') + 'Lưu hồ sơ</button></div>';
  };

  /* ----------------------- Cấu hình mẫu phiếu ----------------------- */
  App.screens['cai-dat'] = function (root) {
    const s = App.settings;
    root.innerHTML = App.pageHead('Cấu hình mẫu phiếu', 'Tương ứng tab "Cấu hình" trong file mẫu Excel — in ở đầu và cuối mọi phiếu.',
      '<button class="btn out" data-act="resetConfig">' + I('refresh') + 'Khôi phục mặc định</button><button class="btn" data-act="saveConfig">' + I('check') + 'Lưu cấu hình</button>') +
      '<div class="grid g2">' +
      '<div class="card"><div class="card-h"><div class="t">' + I('building') + 'Thông tin công ty (đầu phiếu)</div></div><div class="card-b">' +
      ui.text('cf-company', 'Tên công ty', s.company) + ui.text('cf-addr', 'Địa chỉ', s.companyAddr) +
      '<div class="fgrid c2">' + ui.text('cf-mst', 'Mã số thuế', s.mst) + ui.text('cf-phone', 'Điện thoại', s.phone) + '</div>' +
      ui.text('cf-email', 'Email', s.email) + ui.text('cf-bank', 'Tài khoản ngân hàng công ty', s.bankLine) +
      ui.text('cf-kg', 'Kính gửi', s.kinhGui) + '</div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('file') + 'Mẫu số & phê duyệt</div></div><div class="card-b">' +
      '<div class="fgrid c3">' + ui.text('cf-mau', 'Mẫu số', s.mauSo) + ui.text('cf-lan', 'Lần ban hành', s.lanBanHanh) + ui.text('cf-ngay', 'Ngày áp dụng', s.ngayApDung) + '</div>' +
      '<div class="fgrid c2">' + ui.text('cf-ktt', 'Tên Kế toán trưởng (dưới ô ký)', s.keToanTruong) + ui.text('cf-gd', 'Tên người phê duyệt (dưới ô ký)', s.giamDoc) + '</div>' +
      ui.text('cf-cd', 'Chức danh phê duyệt (ô ký cuối)', s.chucDanhPheDuyet) +
      '<div class="fgrid c2">' + ui.select('cf-nghin', 'Đọc hàng nghìn', s.docNghin, ['ngàn', 'nghìn']) + ui.text('cf-hauto', 'Hậu tố câu bằng chữ', s.hauTo) + '</div>' +
      '<div class="muted" id="cf-demo" style="font-size:13px;font-style:italic">Ví dụ: ' + esc(App.docSo(1556000)) + '</div>' +
      '</div></div>' +
      '<div class="card span2"><div class="card-h"><div class="t">' + I('users') + 'Danh sách bộ phận</div></div><div class="card-b">' +
      ui.textarea('cf-bophan', 'Mỗi dòng một bộ phận', (s.boPhanList || []).join('\n'), { rows: 5 }) + '</div></div>' +
      '</div>';
  };

  /* ----------------------- Hướng dẫn ----------------------- */
  App.screens['huong-dan'] = function (root) {
    const step = (n, t, d) => '<div class="row" style="align-items:flex-start;flex-wrap:nowrap;margin-bottom:14px"><span class="badge primary" style="min-width:28px;justify-content:center">' + n + '</span><div><b>' + t + '</b><div class="muted" style="font-size:13.5px">' + d + '</div></div></div>';
    root.innerHTML = App.pageHead('Hướng dẫn sử dụng', 'Quy trình tạm ứng → chi tiêu → hoàn ứng / thanh toán theo mẫu 01-TT/LTL.') +
      '<div class="grid g2"><div class="card"><div class="card-h"><div class="t">' + I('list') + 'Quy trình</div></div><div class="card-b">' +
      step(1, 'Hồ sơ cá nhân', 'Vào <b>Thêm → Hồ sơ cá nhân</b> điền họ tên, bộ phận, số tài khoản — tự điền vào mọi phiếu.') +
      step(2, 'Tạm ứng', 'Mục <b>Tạm ứng → Tạo phiếu</b>: nội dung, mục đích, bảng kê dự chi. Số phiếu DNTU-YYYYMM-STT tự nhảy, số tiền bằng chữ tự đọc. Xuất <b>Word / Excel / In PDF</b>.') +
      step(3, 'Chi tiêu', 'Mục <b>Chi tiêu</b>: mỗi lần chi ghi một khoản, chụp bill, chọn loại hoá đơn. Khoản chi gắn với sự kiện / đợt chi.') +
      step(4, 'Hoàn ứng', 'Từ phiếu tạm ứng bấm <b>Lập phiếu hoàn ứng</b> (hoặc từ trang Chi tiêu): bảng kê lấy từ khoản chi thực tế, phiếu tự kết luận <b>NỘP LẠI</b> quỹ hay <b>CHI BÙ</b>.') +
      step(5, 'Thanh toán', 'Chi trước không qua tạm ứng: lập <b>phiếu thanh toán</b>, có thể lấy bảng kê từ khoản chi.') +
      '</div></div>' +
      '<div class="card"><div class="card-h"><div class="t">' + I('info') + 'Lưu ý</div></div><div class="card-b stack" style="gap:10px">' +
      '<div class="alert info">' + I('info') + '<div><b>Bảng kê:</b> khoản trọn gói không có số lượng → để trống SL, nhập số tiền vào Đơn giá (giống mẫu Excel).</div></div>' +
      '<div class="alert info">' + I('info') + '<div><b>Ngày lập để trống</b> → phiếu in dòng "Hà Nội, ngày ..... tháng ..... năm ....." để ký tay.</div></div>' +
      '<div class="alert">' + I('shield') + '<div><b>Tài khoản:</b> mỗi người tự tạo tài khoản, chỉ thấy dữ liệu của mình. Tài khoản quản trị xem được mọi tài khoản (chỉ đọc) để kiểm soát.</div></div>' +
      '<div class="alert">' + I('cloud') + '<div><b>Offline:</b> sau lần đăng nhập đầu, app chạy cả khi mất mạng và tự đồng bộ khi có mạng lại (chấm tròn trên thanh trên cùng).</div></div>' +
      '<div class="alert">' + I('download') + '<div>Cần mẫu điền tay? <button class="btn out xs" data-act="downloadBlank">' + I('download') + 'Tải mẫu Excel trống</button></div></div>' +
      '</div></div></div>';
  };

  /* ----------------------- Actions ----------------------- */
  Object.assign(App.actions, {
    addEvent() { App.openSheet(eventForm(null)); },
    editEvent(id) { const ev = App.eventById(id); if (ev) App.openSheet(eventForm(ev)); },
    async saveEventForm(id) {
      const name = App.val('ev-name');
      if (!name) { App.toast('Nhập tên sự kiện', 'err'); return; }
      const existing = App.eventById(id);
      const ev = Object.assign({}, existing || {}, {
        id: id || U.uid(), name, date: App.val('ev-date') || U.todayISO(), location: App.val('ev-loc'), note: App.val('ev-note'),
        createdAt: existing ? existing.createdAt : U.nowISO(),
      });
      await DB.put('events', ev);
      localStorage.setItem('ltl_event', ev.id);
      App.closeAllSheets();
      App.toast('Đã lưu sự kiện', 'ok');
      if (!existing && App.route.name !== 'su-kien') App.nav('chi-tieu/' + ev.id); else App.reload();
    },
    delEvent(id) {
      const n = App.expensesOf(id).length;
      App.confirmSheet('Chuyển sự kiện vào thùng rác?', 'Sự kiện cùng ' + n + ' khoản chi sẽ vào thùng rác, khôi phục được trong ' + App.TRASH_DAYS + ' ngày. Các phiếu đã lập vẫn giữ nguyên.', async () => {
        if (localStorage.getItem('ltl_event') === id) localStorage.removeItem('ltl_event');
        App.closeAllSheets();
        if (App.route.name === 'chi-tieu') App.nav('chi-tieu');
        await App.Trash.soft([{ store: 'events', id }]);
      }, true, 'Chuyển vào thùng rác');
    },
    async saveProfile() {
      const s = App.settings;
      const hoTen = App.val('pf-hoTen');
      if (!hoTen) { App.toast('Nhập họ và tên', 'err'); return; }
      Object.assign(s, {
        hoTen, tenNgan: App.val('pf-tenNgan'), boPhan: App.val('pf-boPhan'), chucVu: App.val('pf-chucVu'),
        tenTK: App.val('pf-tenTK'), soTK: App.val('pf-soTK'), nganHang: App.val('pf-nganHang'),
      });
      await DB.put('settings', s);
      App.cloud.upsertProfile();
      App.toast('Đã lưu hồ sơ', 'ok'); App.render();
    },
    async saveConfig() {
      const s = App.settings;
      const list = App.val('cf-bophan').split('\n').map((x) => x.trim()).filter(Boolean);
      Object.assign(s, {
        company: App.val('cf-company'), companyAddr: App.val('cf-addr'), mst: App.val('cf-mst'), phone: App.val('cf-phone'),
        email: App.val('cf-email'), bankLine: App.val('cf-bank'), kinhGui: App.val('cf-kg'),
        mauSo: App.val('cf-mau'), lanBanHanh: App.val('cf-lan'), ngayApDung: App.val('cf-ngay'),
        keToanTruong: App.val('cf-ktt'), giamDoc: App.val('cf-gd'), chucDanhPheDuyet: App.val('cf-cd'),
        docNghin: App.val('cf-nghin') || 'ngàn', hauTo: App.val('cf-hauto'),
        boPhanList: list.length ? list : App.DEFAULT_SETTINGS.boPhanList.slice(),
      });
      await DB.put('settings', s);
      App.toast('Đã lưu cấu hình', 'ok'); App.render();
    },
    resetConfig() {
      App.confirmSheet('Khôi phục cấu hình mặc định?', 'Thông tin công ty, mẫu số, người ký sẽ trở về như file mẫu. Hồ sơ cá nhân không đổi.', async () => {
        const s = App.settings, D = App.DEFAULT_SETTINGS;
        ['company', 'companyAddr', 'mst', 'phone', 'email', 'bankLine', 'kinhGui', 'mauSo', 'lanBanHanh', 'ngayApDung', 'chucDanhPheDuyet', 'docNghin', 'hauTo', 'keToanTruong', 'giamDoc']
          .forEach((k) => { s[k] = D[k]; });
        s.boPhanList = D.boPhanList.slice();
        await DB.put('settings', s); App.toast('Đã khôi phục', 'ok'); App.render();
      });
    },
  });
})();
