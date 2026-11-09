/* =========================================================================
   screen-events.js — Sự kiện (chọn/thêm/sửa) + Cài đặt + công cụ dữ liệu
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, ui = App.ui;
  const money = (n) => U.groupThousand(n) + ' đ';

  /* ----------------------- Danh sách sự kiện ----------------------- */
  function eventsSheet() {
    const items = App.events.map((ev) =>
      '<div class="ev-item ' + (ev.id === App.currentEventId ? 'active' : '') + '" data-act="selectEvent:' + ev.id + '">' +
      '<div class="av">🎪</div><div class="ev-b"><div class="ev-t">' + esc(ev.name) + '</div>' +
      '<div class="ev-m">' + esc(U.fmtDate(ev.date)) + (ev.location ? ' · ' + esc(ev.location) : '') + '</div></div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="editEvent:' + ev.id + '">✏️</button></div>'
    ).join('') || '<p class="muted center" style="padding:18px">Chưa có sự kiện nào.</p>';
    return '<div class="sheet-h"><div class="st">Sự kiện</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      items + '<button class="btn btn-primary mt12" data-act="addEvent">＋ Thêm sự kiện</button>';
  }

  function eventForm(ev) {
    ev = ev || {};
    const isNew = !ev.id;
    return '<div class="sheet-h"><div class="st">' + (isNew ? 'Thêm sự kiện' : 'Sửa sự kiện') + '</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      ui.text('ev-name', 'Tên sự kiện', ev.name, { ph: 'VD: Sự kiện Trường Chu Văn An' }) +
      '<div class="row2">' + ui.date('ev-date', 'Ngày sự kiện', ev.date || U.todayISO()) + ui.text('ev-loc', 'Địa điểm', ev.location, { ph: 'Trường / địa điểm' }) + '</div>' +
      ui.text('ev-req', 'Người đề nghị', ev.requester || App.settings.requester) +
      '<div class="row2">' + ui.text('ev-dept', 'Bộ phận', ev.dept || App.settings.dept) + ui.text('ev-pos', 'Chức vụ', ev.position || App.settings.position) + '</div>' +
      ui.money('ev-prev', 'Số dư tạm ứng kỳ trước', ev.prevBalance || 0) +
      ui.textarea('ev-note', 'Ghi chú', ev.note, { rows: 2 }) +
      '<div class="btn-row mt12">' +
      (isNew ? '' : '<button class="btn btn-danger" data-act="delEvent:' + ev.id + '">Xoá</button>') +
      '<button class="btn btn-primary" data-act="saveEventForm:' + (ev.id || '') + '">Lưu</button></div>';
  }

  /* ----------------------- Cài đặt ----------------------- */
  function settingsSheet() {
    const s = App.settings;
    return '<div class="sheet-h"><div class="st">Cài đặt</div>' +
      '<button class="icon-btn" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      '<div class="section-label" style="margin-top:4px">Đơn vị</div>' +
      ui.textarea('st-company', 'Tên công ty', s.company, { rows: 2 }) +
      ui.textarea('st-addr', 'Địa chỉ', s.companyAddr, { rows: 2 }) +
      '<div class="section-label">Người ký duyệt</div>' +
      '<div class="row2">' + ui.text('st-dir', 'Giám đốc', s.director) + ui.text('st-acc', 'Kế toán', s.accountant) + '</div>' +
      '<div class="row2">' + ui.text('st-dirTU', 'Chức danh GĐ (tạm ứng)', s.directorTU) + ui.text('st-dirHU', 'Chức danh GĐ (hoàn ứng)', s.directorHU) + '</div>' +
      '<div class="row2">' + ui.text('st-accTU', 'Chức danh KT (tạm ứng)', s.accountantTU) + ui.text('st-accHU', 'Chức danh KT (hoàn ứng)', s.accountantHU) + '</div>' +
      '<div class="section-label">Mặc định người đề nghị</div>' +
      ui.text('st-req', 'Họ tên', s.requester) +
      '<div class="row2">' + ui.text('st-dept', 'Bộ phận', s.dept) + ui.text('st-pos', 'Chức vụ', s.position) + '</div>' +
      '<button class="btn btn-primary mt8" data-act="saveSettings">Lưu cài đặt</button>' +
      '<div class="section-label">Tài khoản & Đồng bộ</div>' +
      '<div class="menu-item" data-act="openAccount"><div class="mic">☁️</div><div><div class="mt">Tài khoản & Đồng bộ</div><div class="ms">Đăng nhập để dùng chung dữ liệu trên mọi thiết bị</div></div></div>' +
      '<div class="section-label">Dữ liệu</div>' +
      '<div class="menu-item" data-act="exportData"><div class="mic">📤</div><div><div class="mt">Sao lưu dữ liệu (JSON)</div><div class="ms">Tải file sao lưu sự kiện & khoản chi</div></div></div>' +
      '<div class="menu-item" data-act="helpSheet"><div class="mic">❓</div><div><div class="mt">Hướng dẫn sử dụng</div><div class="ms">Quy trình tạm ứng → hoàn ứng</div></div></div>' +
      '<div class="menu-item" data-act="clearData"><div class="mic" style="background:var(--danger-bg);color:var(--danger)">🗑️</div><div><div class="mt" style="color:var(--danger)">Xoá toàn bộ dữ liệu</div><div class="ms">Không thể hoàn tác</div></div></div>' +
      '<p class="muted center" style="font-size:11.5px;margin-top:14px">Learn to Leap · Tạm ứng & Hoàn ứng · v1.0<br>Dữ liệu lưu ngay trên thiết bị của bạn.</p>';
  }

  function helpSheet() {
    const stp = (n, ic, t, d) =>
      '<div class="step"><div class="n">' + n + '</div><div class="s-b">' +
      '<div class="s-t">' + ic + ' ' + t + '</div><div class="s-d">' + d + '</div></div></div>';
    const card = (ic, t, body) =>
      '<div class="g-card"><div class="gc-h">' + ic + ' ' + t + '</div>' + body + '</div>';

    return '<div class="sheet-h"><div class="st">Hướng dẫn sử dụng</div>' +
      '<button class="icon-btn x" style="background:var(--v100);color:var(--v700)" data-act="closeTop">✕</button></div>' +
      '<div class="guide">' +

      '<div class="g-hero"><div class="deco"></div>' +
      '<div class="gh-t">Tạm ứng → Hoàn ứng trong 4 bước</div>' +
      '<div class="gh-s">Quản lý chi tiêu sự kiện và tự tạo chứng từ Word · Excel · PDF. Chạy offline, lưu ngay trên máy.</div></div>' +

      '<div class="section-label" style="margin-top:2px">Quy trình 4 bước</div>' +
      stp(1, '🎪', 'Tạo sự kiện', 'Bấm <b>📅</b> hoặc <b>＋</b> trên cùng → nhập tên, ngày, địa điểm, người đề nghị. Mỗi sự kiện là một hồ sơ riêng.') +
      stp(2, '📝', 'Tạm ứng', 'Vào tab <b>Tạm ứng</b> → thêm các khoản dự chi → bấm <b>Tạo Word</b> để xuất “Giấy đề nghị tạm ứng” đã có chữ ký.') +
      stp(3, '🧾', 'Chi tiêu', 'Mỗi lần chi: bấm nút tròn <b>Chụp bill nhanh</b> hoặc <b>＋ Thêm khoản chi</b> → nhập số tiền, nội dung, đính kèm ảnh bill, chọn loại hoá đơn.') +
      stp(4, '💰', 'Hoàn ứng &amp; Thanh toán', 'App tự tính số dư (tạm ứng − thực chi). Tab <b>Hoàn ứng</b> tạo bảng thống kê kèm ảnh; tab <b>Thanh toán</b> tạo giấy đề nghị thanh toán &amp; xuất Excel.') +

      '<div class="section-label">Từng màn hình làm gì</div>' +
      card('📊', 'Tổng quan', '<ul>' +
        '<li>Tổng đã tạm ứng, % đã chi, chênh lệch dư/thiếu.</li>' +
        '<li>Biểu đồ: cơ cấu hoá đơn, chi theo tháng, tạm ứng vs thực chi.</li>' +
        '<li>Chạm vào một sự kiện để mở nhanh khoản chi của nó.</li></ul>') +
      card('📝', 'Tạm ứng', '<ul>' +
        '<li>Thêm nhiều dòng khoản mục (nội dung + số tiền).</li>' +
        '<li>Số tiền tự đọc thành chữ để khỏi nhầm.</li>' +
        '<li>Xuất <b>Giấy đề nghị tạm ứng</b> (Word) theo mẫu công ty.</li></ul>') +
      card('🧾', 'Chi tiêu', '<ul>' +
        '<li><b>Nút tròn 📷</b>: mở camera chụp bill và tạo khoản chi ngay.</li>' +
        '<li>Mỗi khoản: số tiền, nội dung, danh mục, ngày, loại hoá đơn.</li>' +
        '<li>Đính kèm nhiều ảnh/video; ghi chú &amp; số tiền cho từng ảnh.</li></ul>') +
      card('💰', 'Hoàn ứng', '<ul>' +
        '<li>Tự tổng hợp thực chi và số dư phải thu/chi thêm.</li>' +
        '<li>Tạo <b>Bảng thống kê chi tiết</b> kèm ảnh minh chứng.</li></ul>') +
      card('🧮', 'Thanh toán', '<ul>' +
        '<li>Tạo <b>Giấy đề nghị thanh toán</b> cho phần vượt tạm ứng.</li>' +
        '<li>Xuất <b>Excel</b> để gửi kế toán.</li></ul>') +

      '<div class="section-label">Phân loại hoá đơn</div>' +
      card('🏷️', 'Chọn đúng để báo cáo chuẩn', 'Mỗi khoản chi chọn 1 loại — quyết định chỉ số <b>% VAT</b> ở Tổng quan:' +
        '<div class="vchip-row" style="margin:9px 0 2px">' +
        '<span class="vchip vat">Hoá đơn VAT</span>' +
        '<span class="vchip bill">Hoá đơn bán lẻ</span>' +
        '<span class="vchip none">Không hoá đơn</span></div>' +
        '<ul><li><b>VAT</b>: hoá đơn đỏ — được tính là “có hoá đơn”.</li>' +
        '<li><b>Bán lẻ</b>: bill thường, phiếu thu.</li>' +
        '<li><b>Không</b>: chưa/không có chứng từ.</li></ul>') +

      '<div class="section-label">Nên cài trước khi xuất chứng từ</div>' +
      '<div class="note-banner" style="display:block;font-size:12.5px">Vào <b>Cài đặt</b> điền <b>tên công ty, địa chỉ, người ký (Giám đốc / Kế toán), người đề nghị</b>. Các thông tin này tự điền vào mọi file Word &amp; Excel.</div>' +

      '<div class="section-label">Offline &amp; Sao lưu</div>' +
      '<div class="note-banner" style="display:block;font-size:12.5px">Không cần mạng, không cần đăng nhập — mọi thứ lưu <b>ngay trên thiết bị</b>. Tạo Word/Excel/PDF đều chạy offline.<br>Dữ liệu chỉ nằm trên máy này. Thỉnh thoảng vào <b>→ Sao lưu dữ liệu (JSON)</b> để giữ bản dự phòng.</div>' +

      '<div class="section-label">Đồng bộ nhiều thiết bị (tuỳ chọn)</div>' +
      '<div class="note-banner" style="display:block;font-size:12.5px">Bấm <b>☁️</b> trên cùng → nhập <b>Project URL + anon key</b> (Supabase) → <b>đăng ký / đăng nhập</b> bằng email. Máy thứ 2 đăng nhập cùng email là dữ liệu tự về.<br>Biểu tượng góc trên: chưa nối · đã đăng nhập · đang đồng bộ · offline.</div>' +

      '<div class="note-banner" style="display:block;font-size:12.5px;background:var(--v50);border-color:var(--v200)"><b>Cài như app:</b> mở menu trình duyệt → “Thêm vào màn hình chính”.<br><b>Mẹo:</b> chụp bill ngay khi chi để không quên minh chứng.</div>' +

      '</div>';
  }

  /* ----------------------- Actions ----------------------- */
  function saveEventForm(id) {
    const name = App.val('ev-name') || ('Sự kiện ' + U.fmtDate(App.val('ev-date') || U.todayISO()));
    const existing = App.events.find((e) => e.id === id);
    const ev = Object.assign({}, existing || {}, {
      id: id || U.uid(),
      name, date: App.val('ev-date') || U.todayISO(), location: App.val('ev-loc'),
      requester: App.val('ev-req'), dept: App.val('ev-dept'), position: App.val('ev-pos'),
      prevBalance: App.valMoney('ev-prev'), note: App.val('ev-note'),
      createdAt: existing ? existing.createdAt : U.nowISO(),
    });
    DB.put('events', ev).then(() => {
      App.currentEventId = ev.id; localStorage.setItem('ltl_event', ev.id);
      document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
      App.toast('Đã lưu sự kiện', 'ok');
      App.reload();
    });
  }

  Object.assign(App.actions, {
    openEvents() { App.openSheet(eventsSheet()); },
    openSettings() { App.openSheet(settingsSheet()); },
    helpSheet() { App.openSheet(helpSheet()); },
    addEvent() { App.openSheet(eventForm(null)); },
    editEvent(id) { const ev = App.events.find((e) => e.id === id); App.openSheet(eventForm(ev)); },
    selectEvent(id) {
      App.currentEventId = id; localStorage.setItem('ltl_event', id);
      document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
      App.go(App.tab === 'dashboard' ? 'expenses' : App.tab);
    },
    saveEventForm(id) { saveEventForm(id); },
    delEvent(id) {
      App.confirmSheet('Xoá sự kiện?', 'Toàn bộ tạm ứng, khoản chi và minh chứng của sự kiện sẽ bị xoá.', async () => {
        await DB.delEventCascade(id);
        if (App.currentEventId === id) { App.currentEventId = null; localStorage.removeItem('ltl_event'); }
        document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
        App.toast('Đã xoá sự kiện', 'ok'); App.reload();
      }, true);
    },
    async saveSettings() {
      const s = App.settings;
      Object.assign(s, {
        company: App.val('st-company'), companyAddr: App.val('st-addr'),
        director: App.val('st-dir'), directorTU: App.val('st-dirTU'), directorHU: App.val('st-dirHU'),
        accountant: App.val('st-acc'), accountantTU: App.val('st-accTU'), accountantHU: App.val('st-accHU'),
        requester: App.val('st-req'), dept: App.val('st-dept'), position: App.val('st-pos'),
      });
      await DB.put('settings', s);
      App.closeSheet(); App.toast('Đã lưu cài đặt', 'ok');
    },
    async exportData() {
      const data = await DB.exportJSON();
      U.saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        'LtL-sao-luu-' + U.todayISO() + '.json');
      App.toast('Đã tải file sao lưu', 'ok');
    },
    clearData() {
      App.confirmSheet('Xoá toàn bộ dữ liệu?', 'Tất cả sự kiện, khoản chi, ảnh minh chứng sẽ bị xoá vĩnh viễn.', async () => {
        await Promise.all(['events', 'advances', 'expenses', 'images'].map((s) => DB.clear(s)));
        App.currentEventId = null; localStorage.removeItem('ltl_event');
        document.querySelectorAll('#modal-root .overlay').forEach((o) => App.closeSheet(o));
        App.toast('Đã xoá toàn bộ dữ liệu', 'ok'); App.go('dashboard');
      }, true);
    },
  });
})();
