/* =========================================================================
   Tạo / đặt lại mật khẩu tài khoản — chạy trên VPS:
     docker compose exec api node cli.js account learntoleap.2023@gmail.com "Quản trị Learn to Leap"
     docker compose exec api node cli.js account ketoan@learntoleap.vn "Kế toán Learn to Leap"
   Mật khẩu được hỏi khi chạy (gõ ẩn), chỉ lưu dạng mã băm trong cơ sở dữ liệu.
   Chạy lại = đặt mật khẩu mới.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const readline = require('readline');
const { Pool } = require('pg');

function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
function ask(question) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };   // không hiện mật khẩu
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}
(async () => {
  const [cmd, emailArg, name] = process.argv.slice(2);
  const email = String(emailArg || '').trim().toLowerCase();
  if (cmd !== 'account' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log('Cách dùng: node cli.js account <email> "<Họ tên>"'); process.exit(1);
  }
  const p1 = await ask('Mật khẩu cho ' + email + ' (≥ 8 ký tự): ');
  if (p1.length < 8) { console.log('Mật khẩu quá ngắn.'); process.exit(1); }
  const p2 = await ask('Nhập lại mật khẩu: ');
  if (p1 !== p2) { console.log('Hai lần nhập không khớp.'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(`insert into users (email, pass_hash, full_name) values ($1,$2,$3)
      on conflict (email) do update set pass_hash = excluded.pass_hash, pass_changed_at = now(),
        full_name = coalesce(nullif(excluded.full_name, ''), users.full_name), blocked = false
      returning id, email, full_name`, [email, hashPass(p1), name || '']);
  console.log('Đã lưu tài khoản:', rows[0].email, '·', rows[0].full_name || '');
  await pool.end();
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
