/* =========================================================================
   LtL · Tạm ứng & Hoàn ứng — máy chủ riêng trên VPS (thay Supabase)
   • Node 22 + PostgreSQL, chỉ 1 thư viện: pg
   • Đăng nhập email + mật khẩu (scrypt), phiên = token ký HMAC (30 ngày)
   • Vai trò CỐ ĐỊNH theo email: ADMIN_EMAIL (Quản trị), KETOAN_EMAIL (Kế toán); còn lại = Nhân sự
   • Phục vụ luôn giao diện app (thư mục WEB_DIR) + API tại /api/*
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = +process.env.PORT || 3000;
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..'));
const SECRET = process.env.APP_SECRET || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'learntoleap.2023@gmail.com').toLowerCase();
const KETOAN_EMAIL = (process.env.KETOAN_EMAIL || 'phanthao27070202@gmail.com').toLowerCase();
const TOKEN_DAYS = +process.env.TOKEN_DAYS || 30;
if (SECRET.length < 32) { console.error('APP_SECRET phải dài ít nhất 32 ký tự'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = (sql, params) => pool.query(sql, params);

/* ---------------- tiện ích ---------------- */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleOf = (email) => { const e = String(email || '').toLowerCase(); return e === ADMIN_EMAIL ? 'admin' : e === KETOAN_EMAIL ? 'ketoan' : 'staff'; };
const isAcc = (u) => u && (u.role === 'admin' || u.role === 'ketoan');
class HttpErr extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg) => new HttpErr(400, msg);

function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
function checkPass(pw, stored) {
  const p = String(stored || '').split('$');
  if (p[0] !== 'scrypt' || p.length !== 3) return false;
  const h = crypto.scryptSync(pw, Buffer.from(p[1], 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const s = Buffer.from(p[2], 'base64');
  return s.length === h.length && crypto.timingSafeEqual(s, h);
}
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function signToken(user) {
  const body = b64u(JSON.stringify({ uid: user.id, pc: new Date(user.pass_changed_at).getTime(), exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return body + '.' + b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
}
function readToken(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const good = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); return d.exp > Date.now() ? d : null; } catch (e) { return null; }
}
const pub = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, dept: u.dept, position: u.position, role: roleOf(u.email), blocked: u.blocked });

// chống dò mật khẩu: tối đa 10 lần sai / 10 phút / IP + email
const fails = new Map();
function tooMany(key) { const f = fails.get(key); return f && f.n >= 10 && Date.now() - f.t < 600e3; }
function addFail(key) { const f = fails.get(key) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 600e3) { f.n = 0; f.t = Date.now(); } f.n++; fails.set(key, f); }

async function readBody(req, limit) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { rej(new HttpErr(413, 'Dữ liệu quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return res({}); try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { rej(bad('JSON không hợp lệ')); } });
    req.on('error', rej);
  });
}
function send(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(s);
}
async function authUser(req) {
  const h = req.headers.authorization || '';
  const t = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!t || !UUID_RE.test(t.uid)) throw new HttpErr(401, 'Phiên đăng nhập hết hạn — đăng nhập lại');
  const { rows } = await q('select * from users where id = $1', [t.uid]);
  const u = rows[0];
  if (!u || new Date(u.pass_changed_at).getTime() !== t.pc) throw new HttpErr(401, 'Phiên đăng nhập hết hạn — đăng nhập lại');
  u.role = roleOf(u.email);
  return u;
}
const needAcc = (u) => { if (!isAcc(u)) throw new HttpErr(403, 'Chỉ kế toán / quản trị'); };
const needWrite = (u) => { if (u.blocked) throw new HttpErr(403, 'Tài khoản đã bị khoá — liên hệ kế toán / quản trị'); };
const docLocked = async (owner, id) => (await q("select 1 from reviews where owner=$1 and doc_id=$2 and data->>'status' in ('da-duyet','da-chi')", [owner, id])).rowCount > 0;
const uuidOk = (v) => typeof v === 'string' && UUID_RE.test(v);
const idOk = (v) => typeof v === 'string' && ID_RE.test(v);
const isoOrNow = (v) => { const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); };

/* ---------------- API ---------------- */
const routes = {};
const on = (method, p, fn) => { routes[method + ' ' + p] = fn; };

on('POST', '/api/auth/login', async (req, body) => {
  const email = String(body.email || '').trim().toLowerCase(), pw = String(body.password || '');
  const key = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') + '|' + email;
  if (tooMany(key)) throw new HttpErr(429, 'Sai quá nhiều lần — thử lại sau 10 phút');
  const { rows } = await q('select * from users where email = $1', [email]);
  if (!rows[0] || !checkPass(pw, rows[0].pass_hash)) { addFail(key); throw new HttpErr(401, 'Sai email hoặc mật khẩu'); }
  fails.delete(key);
  return { token: signToken(rows[0]), user: pub(rows[0]) };
});
on('POST', '/api/auth/signup', async (req, body) => {
  const email = String(body.email || '').trim().toLowerCase(), pw = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 200) throw bad('Email chưa hợp lệ');
  if (pw.length < 8) throw bad('Mật khẩu tối thiểu 8 ký tự');
  if (roleOf(email) !== 'staff') throw bad('Email này là tài khoản cố định — liên hệ quản trị');
  if (process.env.ALLOWED_DOMAINS) {
    const ok = process.env.ALLOWED_DOMAINS.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).some((d) => email.endsWith('@' + d));
    if (!ok) throw bad('Chỉ cho phép email công ty (' + process.env.ALLOWED_DOMAINS + ')');
  }
  const ex = await q('select 1 from users where email=$1', [email]);
  if (ex.rowCount) throw bad('Email này đã có tài khoản — hãy đăng nhập');
  const { rows } = await q('insert into users (email, pass_hash, full_name, dept) values ($1,$2,$3,$4) returning *',
    [email, hashPass(pw), String(body.name || '').slice(0, 120), String(body.dept || '').slice(0, 120)]);
  return { token: signToken(rows[0]), user: pub(rows[0]) };
});
on('GET', '/api/auth/me', async (req, body, u) => ({ user: pub(u) }));
on('POST', '/api/auth/password', async (req, body, u) => {
  const old = String(body.old || ''), nw = String(body.password || '');
  if (!checkPass(old, u.pass_hash)) throw bad('Mật khẩu hiện tại không đúng');
  if (nw.length < 8) throw bad('Mật khẩu mới tối thiểu 8 ký tự');
  const { rows } = await q('update users set pass_hash=$2, pass_changed_at=now() where id=$1 returning *', [u.id, hashPass(nw)]);
  return { token: signToken(rows[0]) };
});
on('PUT', '/api/profile', async (req, body, u) => {
  await q('update users set full_name=$2, dept=$3, position=$4 where id=$1', [u.id, String(body.full_name || u.full_name).slice(0, 120), String(body.dept || '').slice(0, 120), String(body.position || '').slice(0, 120)]);
  return { ok: true };
});
on('POST', '/api/ping', async (req, body, u) => {
  await q('update users set last_seen=now(), page=$2, device=$3 where id=$1', [u.id, String(body.page || '').slice(0, 40), String(body.device || '').slice(0, 80)]);
  return { ok: true };
});

// ---- đồng bộ dữ liệu của chính mình
on('GET', '/api/sync/meta', async (req, body, u) => {
  const { rows } = await q("select id, kind, updated_at, (data->>'_deleted') as del from records where owner=$1", [u.id]);
  return { rows };
});
on('POST', '/api/sync/pull', async (req, body, u) => {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(idOk).slice(0, 200);
  if (!ids.length) return { rows: [] };
  const { rows } = await q('select id, kind, updated_at, data from records where owner=$1 and id = any($2)', [u.id, ids]);
  return { rows };
});
on('POST', '/api/sync/push', async (req, body, u) => {
  needWrite(u);
  const list = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
  const rejected = [];
  for (const r of list) {
    if (!r || !idOk(r.id) || typeof r.kind !== 'string' || !/^[a-z]{1,20}$/.test(r.kind) || typeof r.data !== 'object') { if (r && r.id) rejected.push(String(r.id)); continue; }
    if (r.kind === 'doc' && await docLocked(u.id, r.id)) { rejected.push(r.id); continue; }   // phiếu đã duyệt: khoá
    await q(`insert into records (owner, id, kind, updated_at, data) values ($1,$2,$3,$4,$5)
             on conflict (owner, id) do update set kind=excluded.kind, updated_at=excluded.updated_at, data=excluded.data`,
      [u.id, r.id, r.kind, isoOrNow(r.updated_at), r.data]);
  }
  return { ok: list.length - rejected.length, rejected };
});

// ---- kế toán / quản trị: đọc dữ liệu mọi người
on('GET', '/api/all/records', async (req, body, u, url) => {
  needAcc(u);
  const kinds = String(url.searchParams.get('kinds') || 'doc,event,expense,settings').split(',').filter((k) => /^[a-z]{1,20}$/.test(k) && k !== 'image');
  const { rows } = await q("select owner, id, kind, updated_at, data from records where kind = any($1) and coalesce(data->>'_deleted','') <> 'true'", [kinds]);
  return { rows };
});
on('GET', '/api/all/images', async (req, body, u, url) => {
  const owner = url.searchParams.get('owner') || '', doc = url.searchParams.get('doc') || '';
  const exps = String(url.searchParams.get('exp') || '').split(',').filter(idOk).slice(0, 200);
  if (!uuidOk(owner) || !idOk(doc)) throw bad('Tham số không hợp lệ');
  if (owner !== u.id) needAcc(u);
  const { rows } = await q("select id, data from records where owner=$1 and kind='image' and coalesce(data->>'_deleted','') <> 'true' and (data->>'docId' = $2 or data->>'expenseId' = any($3))", [owner, doc, exps]);
  return { rows };
});

// ---- duyệt
on('GET', '/api/reviews', async (req, body, u) => {
  const { rows } = isAcc(u) ? await q('select owner, doc_id, updated_at, data from reviews') : await q('select owner, doc_id, updated_at, data from reviews where owner=$1', [u.id]);
  return { rows };
});
on('PUT', '/api/reviews', async (req, body, u) => {
  needAcc(u);
  if (!uuidOk(body.owner) || !idOk(body.doc_id) || typeof body.data !== 'object') throw bad('Tham số không hợp lệ');
  await q(`insert into reviews (owner, doc_id, updated_at, data) values ($1,$2,now(),$3)
           on conflict (owner, doc_id) do update set updated_at=now(), data=excluded.data`, [body.owner, body.doc_id, body.data]);
  return { ok: true };
});

// ---- trao đổi & lịch sử của phiếu
on('GET', '/api/msgs', async (req, body, u, url) => {
  const kind = url.searchParams.get('kind');
  if (kind) {
    const { rows } = isAcc(u) ? await q("select id, owner, doc_id, at, author, data from msgs where data->>'kind'=$1 order by at", [kind])
      : await q("select id, owner, doc_id, at, author, data from msgs where data->>'kind'=$1 and owner=$2 order by at", [kind, u.id]);
    return { rows };
  }
  const owner = url.searchParams.get('owner'), doc = url.searchParams.get('doc');
  if (!uuidOk(owner) || !idOk(doc)) throw bad('Tham số không hợp lệ');
  if (owner !== u.id) needAcc(u);
  const { rows } = await q('select id, owner, doc_id, at, author, data from msgs where owner=$1 and doc_id=$2 order by at', [owner, doc]);
  return { rows };
});
on('POST', '/api/msgs', async (req, body, u) => {
  if (!idOk(body.id) || !uuidOk(body.owner) || !idOk(body.doc_id) || typeof body.data !== 'object') throw bad('Tham số không hợp lệ');
  if (body.owner !== u.id) needAcc(u);
  await q('insert into msgs (id, owner, doc_id, at, author, data) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing',
    [body.id, body.owner, body.doc_id, isoOrNow(body.at), u.id, body.data]);
  return { ok: true };
});

// ---- thông báo
on('GET', '/api/notifs', async (req, body, u, url) => {
  const since = isoOrNow(url.searchParams.get('since') || new Date(Date.now() - 45 * 864e5).toISOString());
  const { rows } = await q(`select id, at, to_user, to_acc, author, data from notifs
    where at >= $1 and (to_user = $2 or author = $2 or (to_acc and $3)) order by at desc limit 200`, [since, u.id, isAcc(u)]);
  return { rows };
});
on('POST', '/api/notifs', async (req, body, u) => {
  if (!idOk(body.id) || typeof body.data !== 'object') throw bad('Tham số không hợp lệ');
  const toAcc = !!body.to_acc, to = body.to_user || null;
  if (!toAcc && !uuidOk(to)) throw bad('Thiếu người nhận');
  if (!toAcc && to !== u.id && !isAcc(u)) {
    // nhân sự chỉ được báo cho kế toán / quản trị (khi nhắn tin riêng)
    const r = await q('select email from users where id=$1', [to]);
    if (body.data.kind !== 'dm' || !r.rows[0] || roleOf(r.rows[0].email) === 'staff') throw new HttpErr(403, 'Không được gửi thông báo cho người này');
  }
  await q('insert into notifs (id, at, to_user, to_acc, author, data) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing',
    [body.id, isoOrNow(body.at), toAcc ? null : to, toAcc, u.id, body.data]);
  return { ok: true };
});

// ---- thành viên (kế toán / quản trị)
on('GET', '/api/profiles', async (req, body, u) => {
  needAcc(u);
  const { rows } = await q('select id, email, full_name, dept, position, blocked, created_at, last_seen, page, device from users order by created_at');
  return { rows: rows.map((r) => Object.assign(r, { role: roleOf(r.email) })) };
});
on('POST', '/api/admin/password', async (req, body, u) => {
  needAcc(u);
  if (!uuidOk(body.user) || String(body.password || '').length < 8) throw bad('Mật khẩu tối thiểu 8 ký tự');
  const { rowCount } = await q('update users set pass_hash=$2, pass_changed_at=now() where id=$1', [body.user, hashPass(String(body.password))]);
  if (!rowCount) throw bad('Không tìm thấy tài khoản');
  return { ok: true };
});
on('POST', '/api/admin/block', async (req, body, u) => {
  needAcc(u);
  if (!uuidOk(body.user) || body.user === u.id) throw bad('Không khoá được tài khoản này');
  const { rows } = await q('select email from users where id=$1', [body.user]);
  if (!rows[0] || roleOf(rows[0].email) !== 'staff') throw bad('Không khoá tài khoản cố định');
  await q('update users set blocked=$2 where id=$1', [body.user, !!body.blocked]);
  return { ok: true };
});
on('POST', '/api/admin/delete', async (req, body, u) => {
  needAcc(u);
  if (!uuidOk(body.user) || body.user === u.id) throw bad('Không xoá được tài khoản này');
  const { rows } = await q('select email from users where id=$1', [body.user]);
  if (!rows[0] || roleOf(rows[0].email) !== 'staff') throw bad('Không xoá tài khoản cố định');
  await q('delete from users where id=$1', [body.user]);   // dữ liệu liên quan xoá theo (on delete cascade)
  return { ok: true };
});

// ---- tin nhắn riêng 1-1
on('GET', '/api/contacts', async (req, body, u) => {
  const { rows } = await q('select id, email, full_name, dept from users where id <> $1 and not blocked order by full_name', [u.id]);
  return { rows: rows.map((r) => Object.assign(r, { role: roleOf(r.email) })).filter((r) => isAcc(u) || r.role !== 'staff') };
});
on('GET', '/api/dm', async (req, body, u) => {
  const { rows } = await q('select id, at, from_user, to_user, data from dm where from_user=$1 or to_user=$1 order by at desc limit 3000', [u.id]);
  return { rows };
});
on('POST', '/api/dm', async (req, body, u) => {
  if (!idOk(body.id) || !uuidOk(body.to_user) || typeof body.data !== 'object') throw bad('Tham số không hợp lệ');
  const { rows } = await q('select email from users where id=$1', [body.to_user]);
  if (!rows[0]) throw bad('Không tìm thấy người nhận');
  if (!isAcc(u) && roleOf(rows[0].email) === 'staff') throw new HttpErr(403, 'Nhân sự chỉ nhắn được cho kế toán / quản trị');
  await q('insert into dm (id, at, from_user, to_user, data) values ($1,$2,$3,$4,$5) on conflict (id) do nothing', [body.id, isoOrNow(body.at), u.id, body.to_user, body.data]);
  return { ok: true };
});
on('GET', '/api/health', async () => ({ ok: true }));

/* ---------------- tệp giao diện ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.woff2': 'font/woff2' };
const DENY = /(^|\/)(\.|server\/|supabase\/|deploy\/|node_modules\/)|\.(md|sql|ps1|sh|env|conf|yml|yaml|txt)$/i;
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const rel = path.normalize(p).replace(/^(\.\.[\/\\])+/, '').replace(/^[\/\\]+/, '');
  if (DENY.test(rel.replace(/\\/g, '/'))) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR + path.sep)) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const noCache = ext === '.html' || /sw\.js$/.test(file) || /\/assets\//.test(file.replace(/\\/g, '/'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- máy chủ ---------------- */
const OPEN = new Set(['POST /api/auth/login', 'POST /api/auth/signup', 'GET /api/health']);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  }
  const key = req.method + ' ' + url.pathname, fn = routes[key];
  if (!fn) return send(res, 404, { error: 'Không có API này' });
  try {
    const body = req.method === 'GET' ? {} : await readBody(req, /sync\/push/.test(url.pathname) ? 40 * 1024 * 1024 : 4 * 1024 * 1024);
    const u = OPEN.has(key) ? null : await authUser(req);
    send(res, 200, await fn(req, body, u, url));
  } catch (e) {
    if (!(e instanceof HttpErr)) console.error(key, e);
    send(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { error: e instanceof HttpErr ? e.message : 'Lỗi máy chủ' });
  }
});
// tạo / cập nhật bảng rồi mới nhận kết nối (đợi cơ sở dữ liệu sẵn sàng)
(async function start() {
  for (let i = 1; ; i++) {
    try { await q(fs.readFileSync(path.join(__dirname, 'db.sql'), 'utf8')); break; }
    catch (e) { if (i >= 30) { console.error('Không kết nối được cơ sở dữ liệu', e.message); process.exit(1); } await new Promise((r) => setTimeout(r, 2000)); }
  }
  server.listen(PORT, () => console.log('LtL payment server on :' + PORT + ' · web ' + WEB_DIR));
})();
