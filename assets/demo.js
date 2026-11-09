/* =========================================================================
   demo.js — Chế độ "Dùng thử": nạp dữ liệu mẫu để thử mọi chức năng mà
   không cần tài khoản. Dữ liệu chỉ nằm trên máy, xoá khi thoát dùng thử.
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, I = App.icon;

  App.demoBanner = function () {
    if (!App.cloud || !App.cloud.isDemo || !App.cloud.isDemo()) return '';
    return '<div class="alert info" style="margin-bottom:20px;align-items:center;flex-wrap:wrap">' + I('sparkle') +
      '<div style="flex:1;min-width:220px"><b>Bạn đang dùng thử.</b> Dữ liệu chỉ lưu trên máy này, không đồng bộ, và bị xoá khi thoát dùng thử. ' +
      'Khi đã ưng, hãy tạo tài khoản thật để lưu và dùng trên nhiều thiết bị.</div>' +
      '<div class="row"><button class="btn sm" data-act="seedDemo">' + App.icon('database') + 'Nạp dữ liệu mẫu</button>' +
      '<button class="btn sm out" data-act="logout">' + App.icon('logout') + 'Thoát dùng thử</button></div></div>';
  };

  async function mkImage(color, text) {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
    const x = c.getContext('2d');
    x.fillStyle = '#fbfbfd'; x.fillRect(0, 0, 900, 1200);
    const g = x.createLinearGradient(0, 0, 900, 0); g.addColorStop(0, color); g.addColorStop(1, '#ff0080');
    x.fillStyle = g; x.fillRect(0, 0, 900, 160);
    x.fillStyle = '#fff'; x.font = 'bold 56px Arial'; x.fillText('HOÁ ĐƠN', 50, 105);
    x.fillStyle = '#344767'; x.font = '34px Arial';
    String(text).split('\n').forEach((t, i) => x.fillText(t, 50, 260 + i * 60));
    x.strokeStyle = '#dde1ea'; x.lineWidth = 3;
    for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(50, 520 + i * 70); x.lineTo(850, 520 + i * 70); x.stroke(); }
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
  }

  App.actions.seedDemo = async function () {
    if (!App.cloud.isDemo()) return;
    if (App.data.docs.length || App.data.expenses.length) {
      const ok = await new Promise((res) => App.confirmSheet('Nạp thêm dữ liệu mẫu?', 'Dữ liệu mẫu sẽ được thêm vào cạnh dữ liệu bạn đã nhập thử.', () => res(true), false, 'Nạp thêm'));
      if (!ok) return;
    }
    App.toast('Đang nạp dữ liệu mẫu…');
    const s = App.settings;
    Object.assign(s, { hoTen: s.hoTen || 'Nguyễn Văn A', tenNgan: s.tenNgan || 'A', boPhan: s.boPhan || 'Chuyên môn', chucVu: s.chucVu || 'Chuyên viên',
      tenTK: s.tenTK || 'Nguyễn Văn A', soTK: s.soTK || '0123456789', nganHang: s.nganHang || 'MB Bank' });
    await DB.put('settings', s);
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const iso = (mm, d) => { const dt = new Date(y, m + mm, d); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); };
    const id = () => U.uid();
    const ev1 = { id: id(), name: 'Ngày hội STEM THCS Cầu Giấy', date: iso(-1, 18), location: 'THCS Cầu Giấy', createdAt: U.nowISO() };
    const ev2 = { id: id(), name: 'Chi phí vận chuyển thiết bị', date: iso(-2, 26), createdAt: U.nowISO() };
    const ev3 = { id: id(), name: 'Robotics Day Bắc Ninh', date: iso(-3, 5), location: 'Bắc Ninh', createdAt: U.nowISO() };
    for (const e of [ev1, ev2, ev3]) await DB.put('events', e);
    const ex = [
      [ev1, 'Taxi đi trường', iso(-1, 18), 350000, 'bill', 'Di chuyển', 'A, B'],
      [ev1, 'Cơm trưa đội ngũ (8 suất)', iso(-1, 18), 900000, 'vat', 'Ăn uống', 'Đội ngũ 8 người'],
      [ev1, 'In banner, standee', iso(-1, 16), 1200000, 'vat', 'In ấn', 'A'],
      [ev2, 'Vận chuyển 10 hộp robot về kho', iso(-2, 26), 230000, 'vat', 'Vận chuyển', 'A'],
      [ev2, 'Mua túi zip đóng hàng', iso(0, 3), 30000, 'none', 'Vật tư / Thiết bị', 'A'],
      [ev2, 'Ship màn hình tương tác', iso(-1, 10), 205000, 'bill', 'Vận chuyển', 'A'],
      [ev3, 'Thuê xe 16 chỗ', iso(-3, 5), 2400000, 'vat', 'Di chuyển', 'A, B, C'],
      [ev3, 'Nước uống, bánh cho học sinh', iso(-3, 5), 650000, 'bill', 'Ăn uống', 'A'],
    ];
    const colors = ['#7928ca', '#2152ff', '#17ad37', '#f53939'];
    let k = 0;
    for (const [ev, content, date, amount, vatType, category, participants] of ex) {
      const e = { id: id(), eventId: ev.id, content, date, amount, vatType, category, participants, ghiChu: vatType === 'vat' ? 'HĐ số 00' + (120 + k) : '', createdAt: U.nowISO() };
      await DB.put('expenses', e);
      if (k % 2 === 0) {
        const b = await mkImage(colors[k % 4], content + '\n' + U.groupThousand(amount) + ' đ\nNgày ' + U.fmtDate(date));
        await DB.put('images', { id: id(), expenseId: e.id, eventId: ev.id, blob: b, mime: 'image/jpeg', kind: 'image', note: 'Ảnh hoá đơn', amount: 0, createdAt: U.nowISO() });
      }
      k++;
    }
    await App.loadData();
    const D = App.Docs;
    const mk = (type, ev, ngay, nd, md, st, items) => {
      const d = D.blank(type, { eventId: ev.id });
      Object.assign(d, { ngayLap: ngay, noiDung: nd, mucDich: md, status: st, items: items.map((x) => D.blankItem(x)) });
      d.soPhieu = D.nextNumber(type, ngay); return d;
    };
    const tu1 = mk('TU', ev3, iso(-3, 1), 'Tạm ứng chi phí Robotics Day Bắc Ninh', 'Thuê xe, ăn uống cho đoàn', 'da-chi',
      [{ noiDung: 'Thuê xe đưa đón đoàn', ngayChi: iso(-3, 5), nguoiThamGia: 'A, B, C', soLuong: 1, donGia: 2500000 }, { noiDung: 'Ăn uống học sinh', ngayChi: iso(-3, 5), nguoiThamGia: 'A', soLuong: '', donGia: 700000 }]);
    await DB.put('docs', tu1); await App.loadData();
    const tu2 = mk('TU', ev1, iso(-1, 10), 'Tạm ứng chi phí Ngày hội STEM THCS Cầu Giấy', 'Phục vụ Ngày hội STEM', 'da-duyet',
      [{ noiDung: 'Ăn uống, đi lại đội ngũ', ngayChi: iso(-1, 18), nguoiThamGia: 'A, B', soLuong: '', donGia: 2000000 }, { noiDung: 'In ấn banner, standee', ngayChi: iso(-1, 16), nguoiThamGia: 'A', soLuong: 1, donGia: 1000000 }]);
    await DB.put('docs', tu2); await App.loadData();
    const hu = mk('HU', ev3, iso(-3, 8), 'Hoàn ứng chi phí Robotics Day Bắc Ninh', 'Quyết toán tạm ứng theo phiếu ' + tu1.soPhieu, 'da-gui',
      App.expensesOf(ev3.id).map((e) => D.itemFromExpense(e, s)));
    Object.assign(hu, { tuDocId: tu1.id, tuSoPhieu: tu1.soPhieu, daTamUng: D.total(tu1) });
    await DB.put('docs', hu); await App.loadData();
    const tt = mk('TT', ev2, iso(0, 5), 'Thanh toán chi phí vận chuyển thiết bị', 'Thanh toán các khoản đã ứng trước', 'nhap',
      App.expensesOf(ev2.id).map((e) => D.itemFromExpense(e, s)));
    await DB.put('docs', tt);
    App.toast('Đã nạp 3 sự kiện, 8 khoản chi, 4 phiếu mẫu', 'ok');
    await App.go();
  };
})();
