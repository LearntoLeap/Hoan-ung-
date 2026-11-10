/* =========================================================================
   dm.js — TIN NHẮN RIÊNG 1-1 (kiểu Messenger)
   • Nhân sự nhắn với Ban giám đốc / Kế toán / Quản trị để góp ý, hỏi đáp chứng từ.
   • Chỉ người gửi và người nhận thấy cuộc trò chuyện (bảng ltl_dm, RLS 2 phía).
   • #/tin-nhan           danh sách hội thoại
   • #/tin-nhan/<userId>  hội thoại với một người
   ========================================================================= */
(function () {
  'use strict';
  const App = window.App, esc = U.esc, I = App.icon;
  const F = () => App.Flow;
  const RD = () => 'ltl_dmread_' + F().myId();
  const readMap = () => { try { return JSON.parse(localStorage.getItem(RD()) || '{}') || {}; } catch (e) { return {}; } };
  const setRead = (uid, at) => { const m = readMap(); m[uid] = at || U.nowISO(); try { localStorage.setItem(RD(), JSON.stringify(m)); } catch (e) {} };
  const st = { contacts: null, msgs: [], at: 0, att: null, timer: null, ref: null, refDoc: null };

  // số tin chưa đọc theo người gửi — tính từ thông báo loại 'dm' (không cần tải thêm)
  function unreadBy() {
    const rm = readMap(), out = {};
    (F().notifs || []).forEach((n) => { const d = n.data || {}; if (d.kind === 'dm' && d.dmFrom && n.at > (rm[d.dmFrom] || '')) out[d.dmFrom] = (out[d.dmFrom] || 0) + 1; });
    return out;
  }
  App.dmUnread = () => Object.values(unreadBy()).reduce((a, b) => a + b, 0);
  function updateBadge() {
    const c = document.getElementById('dm-cnt'); if (!c) return;
    const n = App.dmUnread(); c.textContent = n || ''; c.hidden = !n;
  }
  App.dmUpdateBadge = updateBadge;

  async function load(force) {
    if (!force && st.contacts && Date.now() - st.at < 8000) return;
    const B = F().B();
    const [cs, ms] = await Promise.all([B.contacts(), B.dms()]);
    st.contacts = (cs || []).filter((c) => c.id !== F().myId());
    st.msgs = (ms || []).sort((a, b) => a.at.localeCompare(b.at));
    st.at = Date.now();
  }
  const ROLE_T = (r) => (r === 'admin' ? 'Quản trị / BGĐ' : r === 'ketoan' ? 'Kế toán' : 'Nhân sự');
  const ini = (n) => String(n || '?').trim().split(/\s+/).slice(-2).map((w) => w.charAt(0)).join('').toUpperCase();

  App.screens['tin-nhan'] = async function (root, route) {
    const peer = route.parts[1] || '';
    root.innerHTML = App.pageHead('Tin nhắn', 'Nhắn riêng với ban giám đốc, kế toán, quản trị — chỉ hai người trong cuộc thấy') + '<div class="card"><div class="card-b"><div class="skel"></div><div class="skel mt12" style="width:60%"></div></div></div>';
    try { await load(true); } catch (e) {
      root.innerHTML = App.pageHead('Tin nhắn', '') + '<div class="alert danger">' + I('alert') + '<div>Chưa tải được tin nhắn: ' + esc(e.message || e) + (App.cloud.demo ? '' : '<br>Hãy chạy lại <code>supabase/setup.sql</code> bản mới.') + '</div></div>';
      return;
    }
    if (App.route.name !== 'tin-nhan') return;
    paint(root, peer);
    clearInterval(st.timer);
    st.timer = setInterval(async () => {
      if (App.route.name !== 'tin-nhan') { clearInterval(st.timer); return; }
      if (document.visibilityState === 'hidden') return;
      const n = st.msgs.length; try { await load(true); } catch (e) { return; }
      if (st.msgs.length !== n) paint(document.getElementById('screen'), App.route.parts[1] || '', true);
    }, 8000);
  };

  function paint(root, peer, keep) {
    const me = F().myId(), un = unreadBy();
    const last = {}; st.msgs.forEach((m) => { const o = m.from_user === me ? m.to_user : m.from_user; last[o] = m; });
    const cs = st.contacts.slice().sort((a, b) => String((last[b.id] || {}).at || '').localeCompare(String((last[a.id] || {}).at || '')) || String(a.full_name).localeCompare(String(b.full_name)));
    const p = cs.find((c) => c.id === peer);
    if (p) setRead(p.id, U.nowISO());
    const draft = keep ? App.val('dm-text') : '';
    const list = cs.length ? cs.map((c) => {
      const l = last[c.id], n = c.id === peer ? 0 : (un[c.id] || 0);
      return '<a class="dm-c' + (c.id === peer ? ' on' : '') + '" href="#/tin-nhan/' + esc(c.id) + '"><span class="av sm r-' + esc(c.role || 'staff') + '">' + esc(ini(c.full_name || c.email)) + '</span>' +
        '<span class="dm-cb"><b>' + esc(c.full_name || c.email) + '</b><small>' + esc(ROLE_T(c.role)) + (c.dept ? ' · ' + esc(c.dept) : '') + '</small>' +
        (l ? '<i>' + (l.from_user === me ? 'Bạn: ' : '') + esc(((l.data || {}).text || '[ảnh]').slice(0, 50)) + '</i>' : '') + '</span>' +
        (n ? '<span class="cnt hot">' + n + '</span>' : l ? '<span class="tm">' + esc(F().ago(l.at)) + '</span>' : '') + '</a>';
    }).join('') : '<p class="muted" style="padding:14px;font-size:13px">Chưa có người nhận. ' + (F().isAcc() ? '' : 'Ban giám đốc / kế toán sẽ hiện ở đây khi có tài khoản.') + '</p>';
    const thread = !p ? '<div class="dm-empty">' + I('chat', 36) + '<b>Chọn một người để nhắn tin</b><span>Góp ý, hỏi đáp về chứng từ, tạm ứng, hoàn ứng…</span></div>' : (() => {
      const ms = st.msgs.filter((m) => (m.from_user === me && m.to_user === p.id) || (m.from_user === p.id && m.to_user === me));
      return '<div class="dm-h"><a class="btn ghost icon sm dm-back" href="#/tin-nhan" aria-label="Quay lại">' + I('left') + '</a><span class="av sm r-' + esc(p.role || 'staff') + '">' + esc(ini(p.full_name)) + '</span><div><b>' + esc(p.full_name || p.email) + '</b><small>' + esc(ROLE_T(p.role)) + (p.email ? ' · ' + esc(p.email) : '') + '</small></div></div>' +
        '<div class="dm-list" id="dm-list">' + (ms.length ? ms.map((m) => { const d = m.data || {}, mine = m.from_user === me;
          return '<div class="msg ' + (mine ? 'me' : 'them') + '">' + refCard(d.ref) + '<div class="mtx">' + esc(d.text || '').replace(/\n/g, '<br>') + '</div>' + (d.img ? '<img class="mimg" src="' + esc(d.img) + '" alt="" data-act="dmImg:' + esc(m.id) + '">' : '') + '<div class="mh" style="margin:4px 0 0"><span class="tm">' + esc(U.fmtDateTime(m.at)) + '</span></div></div>'; }).join('')
          : '<p class="muted center" style="font-size:13px;margin:30px 0">Chưa có tin nhắn. Gửi lời chào 👋</p>') + '</div>' +
        '<div class="dm-in"><div id="dm-refbox"></div><div id="dm-att"></div><div class="thr-in"><textarea class="textarea" id="dm-text" rows="1" placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)">' + esc(draft) + '</textarea>' +
        '<div class="thr-btns"><button class="btn out icon" data-act="dmPickDoc" title="Gắn phiếu DNTU / DNHU / DNTT" aria-label="Gắn phiếu">' + I('file') + '</button><button class="btn out icon" data-act="dmPhoto" title="Gửi ảnh" aria-label="Gửi ảnh">' + I('camera') + '</button><button class="btn icon" data-act="dmSend" title="Gửi" aria-label="Gửi">' + I('send') + '</button></div></div></div>';
    })();
    root.innerHTML = App.pageHead('Tin nhắn', 'Nhắn riêng — chỉ hai người trong cuộc thấy') +
      '<div class="dm' + (p ? ' has-peer' : '') + '"><aside class="dm-side card"><div class="dm-sh">' + I('search', 16) + '<input class="input" id="dm-q" placeholder="Tìm người…"></div><div class="dm-cs" id="dm-cs">' + list + '</div></aside>' +
      '<section class="dm-main card">' + thread + '</section></div>';
    const l = document.getElementById('dm-list'); if (l) l.scrollTop = l.scrollHeight;
    const t = document.getElementById('dm-text');
    if (t) { t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.actions.dmSend(); } }; if (!keep || draft) t.focus(); }
    const q = document.getElementById('dm-q');
    q.oninput = () => { const k = U.normText(q.value); document.querySelectorAll('#dm-cs .dm-c').forEach((a) => { a.style.display = !k || U.normText(a.textContent).indexOf(k) >= 0 ? '' : 'none'; }); };
    paintAtt(); paintRef();
    updateBadge(); F().updateBell();
  }
  // thẻ phiếu trong tin nhắn — trạng thái lấy mới nhất nếu có dữ liệu, không thì dùng lúc gửi
  function refCard(r) {
    if (!r) return '';
    const Fl = F(), T = App.Docs.TYPES[r.type] || { prefix: 'Phiếu' };
    let doc = null;
    if (r.owner === Fl.myId()) doc = App.data.docs.find((x) => x.id === r.id);
    else if (Fl.all) doc = Fl.all.docs.find((x) => x._owner === r.owner && x.id === r.id);
    const sv = doc ? Fl.status(doc, r.owner) : r.st, si = Fl.ST[sv] || Fl.ST['cho-duyet'];
    const href = Fl.isAcc() ? '#/duyet/' + r.owner + '/' + r.id : r.owner === Fl.myId() ? '#/phieu/' + r.id : '';
    return '<' + (href ? 'a href="' + esc(href) + '"' : 'div') + ' class="dm-ref"><span class="tchip t-' + esc(r.type) + '">' + esc(T.prefix) + '</span><span class="dm-rb"><b class="mono">' + esc(r.so) + '</b>' +
      '<small>' + esc(r.nd || '') + '</small><i>' + U.groupThousand(r.total) + ' đ · <span class="badge ' + si.cls + '">' + esc(si.s) + '</span></i></span>' + (href ? I('right', 16) : '') + '</' + (href ? 'a' : 'div') + '>';
  }
  function paintRef() {
    const b = document.getElementById('dm-refbox'); if (!b) return;
    if (!st.ref) { b.innerHTML = ''; return; }
    const acc = F().isAcc(), peer = (st.contacts || []).find((c) => c.id === App.route.parts[1]) || {};
    const tpl = Object.keys(F().TEMPLATES).filter((k) => F().TEMPLATES[k].acc === acc && (k !== 'remindHU' || st.ref.type === 'TU'));
    b.innerHTML = '<div class="dm-refsel">' + refCard(st.ref) + '<button class="btn ghost xs" data-act="dmRefX" aria-label="Bỏ phiếu">' + I('x', 14) + '</button></div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin:6px 0">' + tpl.map((k) => '<button class="btn sec xs" data-tpl="' + k + '">' + esc(F().TEMPLATES[k].t) + '</button>').join('') + '</div>';
    b.querySelectorAll('[data-tpl]').forEach((x) => { x.onclick = () => { const t = document.getElementById('dm-text'); if (t) { t.value = F().template(x.getAttribute('data-tpl'), st.refDoc, peer.full_name); t.focus(); } }; });
  }
  // phiếu có thể gắn: nhân sự → phiếu của mình; kế toán / quản trị → phiếu của người đang nhắn
  async function docsForPeer(peer) {
    const Fl = F();
    if (!Fl.isAcc()) return App.data.docs.map((d) => Object.assign({}, d, { _owner: Fl.myId(), _ownerName: d.nguoiDeNghi }));
    const all = await Fl.loadAll();
    const l = all.docs.filter((d) => d._owner === peer);
    return l.length ? l : App.data.docs.map((d) => Object.assign({}, d, { _owner: Fl.myId(), _ownerName: d.nguoiDeNghi }));
  }
  function paintAtt() { const a = document.getElementById('dm-att'); if (a) a.innerHTML = st.att ? '<div class="row" style="gap:8px;margin-bottom:6px"><img src="' + esc(st.att) + '" alt="" style="height:52px;border-radius:8px"><button class="btn ghost xs" data-act="dmAttX">' + I('x', 14) + 'Bỏ ảnh</button></div>' : ''; }

  Object.assign(App.actions, {
    async dmPhoto() { const fs = await App.pickFiles('image/*', false); if (!fs.length) return; try { st.att = await F().smallDataURL(fs[0]); paintAtt(); } catch (e) { App.toast('Không đọc được ảnh', 'err'); } },
    dmAttX() { st.att = null; paintAtt(); },
    dmRefX() { st.ref = null; st.refDoc = null; paintRef(); },
    async dmPickDoc() {
      const peer = App.route.parts[1]; if (!peer) return;
      let docs; try { docs = await docsForPeer(peer); } catch (e) { App.toast('Không tải được danh sách phiếu', 'err'); return; }
      const Fl = F(), T = App.Docs.TYPES;
      docs = docs.filter((d) => !d.deletedAt).sort((a, b) => String(b.ngayLap || '').localeCompare(String(a.ngayLap || '')));
      let flt = '';
      const list = () => docs.filter((d) => (!flt || d.type === flt)).map((d) => {
        const sv = Fl.status(d, d._owner), si = Fl.ST[sv];
        return '<button class="dp-doc" data-doc="' + esc(d._owner + '|' + d.id) + '"><span class="tchip t-' + d.type + '">' + T[d.type].prefix + '</span><span class="dm-rb"><b class="mono">' + esc(d.soPhieu) + '</b><small>' + esc((d.noiDung || '').slice(0, 70)) + '</small></span>' +
          '<span class="num"><b>' + U.groupThousand(App.Docs.total(d)) + '</b><br><span class="badge ' + si.cls + '">' + esc(si.s) + '</span></span></button>';
      }).join('') || '<p class="muted" style="font-size:13px">Chưa có phiếu.</p>';
      const ov = App.openSheet(App.sheetHead('Gắn phiếu vào tin nhắn', 'Chọn phiếu tạm ứng, hoàn ứng hoặc thanh toán để nhắc / hỏi') +
        '<div class="seg" id="dp-t" style="margin-bottom:10px">' + [['', 'Tất cả'], ['TU', 'Tạm ứng'], ['HU', 'Hoàn ứng'], ['TT', 'DNTT']].map((x) => '<button data-t="' + x[0] + '" class="' + (x[0] === '' ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div class="dp-docs" id="dp-l">' + list() + '</div>', { wide: false });
      ov.querySelector('#dp-t').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; flt = b.getAttribute('data-t'); ov.querySelectorAll('#dp-t button').forEach((x) => x.classList.toggle('on', x === b)); ov.querySelector('#dp-l').innerHTML = list(); };
      ov.querySelector('#dp-l').onclick = (e) => {
        const b = e.target.closest('[data-doc]'); if (!b) return;
        const [o, id] = b.getAttribute('data-doc').split('|'); const d = docs.find((x) => x._owner === o && x.id === id); if (!d) return;
        st.refDoc = d; st.ref = Fl.docRef(d, o); App.closeSheet(ov); paintRef();
        const t = document.getElementById('dm-text'); if (t) t.focus();
      };
    },
    dmImg(id) { const m = st.msgs.find((x) => x.id === id); if (m && m.data.img) App.lightbox([{ url: m.data.img, kind: 'image', cap: m.data.text || '' }], 0); },
    async dmSend() {
      const peer = App.route.parts[1]; if (!peer) return;
      const t = document.getElementById('dm-text'), text = t ? t.value.trim() : '';
      if (!text && !st.att && !st.ref) return;
      const m = { id: U.uid(), at: U.nowISO(), from_user: F().myId(), to_user: peer, data: { text, img: st.att || null, ref: st.ref || null, name: F().myName(), role: F().role() } };
      try { await F().B().dmSend(m); }
      catch (e) { App.toast('Chưa gửi được: ' + (e.message || e), 'err'); return; }
      st.msgs.push(m); st.att = null; st.ref = null; st.refDoc = null; if (t) t.value = '';
      F().notify(peer, { title: F().myName() + ' nhắn tin cho bạn' + (m.data.ref ? ' về ' + m.data.ref.so : ''), body: text ? text.slice(0, 140) : (m.data.ref ? 'Phiếu ' + m.data.ref.so : '[ảnh]'), link: '#/tin-nhan/' + F().myId(), kind: 'dm', dmFrom: F().myId() });
      paint(document.getElementById('screen'), peer, false);
    },
  });
})();
