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
  const st = { contacts: null, msgs: [], at: 0, att: null, timer: null };

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
          return '<div class="msg ' + (mine ? 'me' : 'them') + '"><div class="mtx">' + esc(d.text || '').replace(/\n/g, '<br>') + '</div>' + (d.img ? '<img class="mimg" src="' + esc(d.img) + '" alt="" data-act="dmImg:' + esc(m.id) + '">' : '') + '<div class="mh" style="margin:4px 0 0"><span class="tm">' + esc(U.fmtDateTime(m.at)) + '</span></div></div>'; }).join('')
          : '<p class="muted center" style="font-size:13px;margin:30px 0">Chưa có tin nhắn. Gửi lời chào 👋</p>') + '</div>' +
        '<div class="dm-in"><div id="dm-att"></div><div class="thr-in"><textarea class="textarea" id="dm-text" rows="1" placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)">' + esc(draft) + '</textarea>' +
        '<div class="thr-btns"><button class="btn out icon" data-act="dmPhoto" title="Gửi ảnh" aria-label="Gửi ảnh">' + I('camera') + '</button><button class="btn icon" data-act="dmSend" title="Gửi" aria-label="Gửi">' + I('send') + '</button></div></div></div>';
    })();
    root.innerHTML = App.pageHead('Tin nhắn', 'Nhắn riêng — chỉ hai người trong cuộc thấy') +
      '<div class="dm' + (p ? ' has-peer' : '') + '"><aside class="dm-side card"><div class="dm-sh">' + I('search', 16) + '<input class="input" id="dm-q" placeholder="Tìm người…"></div><div class="dm-cs" id="dm-cs">' + list + '</div></aside>' +
      '<section class="dm-main card">' + thread + '</section></div>';
    const l = document.getElementById('dm-list'); if (l) l.scrollTop = l.scrollHeight;
    const t = document.getElementById('dm-text');
    if (t) { t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.actions.dmSend(); } }; if (!keep || draft) t.focus(); }
    const q = document.getElementById('dm-q');
    q.oninput = () => { const k = U.normText(q.value); document.querySelectorAll('#dm-cs .dm-c').forEach((a) => { a.style.display = !k || U.normText(a.textContent).indexOf(k) >= 0 ? '' : 'none'; }); };
    paintAtt();
    updateBadge(); F().updateBell();
  }
  function paintAtt() { const a = document.getElementById('dm-att'); if (a) a.innerHTML = st.att ? '<div class="row" style="gap:8px;margin-bottom:6px"><img src="' + esc(st.att) + '" alt="" style="height:52px;border-radius:8px"><button class="btn ghost xs" data-act="dmAttX">' + I('x', 14) + 'Bỏ ảnh</button></div>' : ''; }

  Object.assign(App.actions, {
    async dmPhoto() { const fs = await App.pickFiles('image/*', false); if (!fs.length) return; try { st.att = await F().smallDataURL(fs[0]); paintAtt(); } catch (e) { App.toast('Không đọc được ảnh', 'err'); } },
    dmAttX() { st.att = null; paintAtt(); },
    dmImg(id) { const m = st.msgs.find((x) => x.id === id); if (m && m.data.img) App.lightbox([{ url: m.data.img, kind: 'image', cap: m.data.text || '' }], 0); },
    async dmSend() {
      const peer = App.route.parts[1]; if (!peer) return;
      const t = document.getElementById('dm-text'), text = t ? t.value.trim() : '';
      if (!text && !st.att) return;
      const m = { id: U.uid(), at: U.nowISO(), from_user: F().myId(), to_user: peer, data: { text, img: st.att || null, name: F().myName(), role: F().role() } };
      try { await F().B().dmSend(m); }
      catch (e) { App.toast('Chưa gửi được: ' + (e.message || e), 'err'); return; }
      st.msgs.push(m); st.att = null; if (t) t.value = '';
      F().notify(peer, { title: F().myName() + ' nhắn tin cho bạn', body: text ? text.slice(0, 140) : '[ảnh]', link: '#/tin-nhan/' + F().myId(), kind: 'dm', dmFrom: F().myId() });
      paint(document.getElementById('screen'), peer, false);
    },
  });
})();
