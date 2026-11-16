# Đưa app lên VPS (bản chính thức)

App là **web tĩnh** (HTML/CSS/JS), không cần Node, PHP hay database trên VPS.
Tài khoản, dữ liệu, duyệt chứng từ, tin nhắn đều nằm trên **Supabase** — VPS chỉ phục vụ file.
Bản chính thức **không còn chế độ Dùng thử**.

## Cài nhanh bằng 1 lệnh

Trỏ tên miền (bản ghi A) về IP VPS, rồi SSH vào VPS và chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/LearntoLeap/Hoan-ung-/main/deploy/install-vps.sh | sudo bash -s -- hoanung.learntoleap.vn admin@learntoleap.vn
```

Script tự cài nginx + HTTPS, lấy code, cấu hình. Chạy lại lệnh này để **cập nhật bản mới**.
Sau đó làm tiếp mục 4 (Supabase) và mục 6 (tài khoản chính). Các mục 1–3 dưới đây là cách làm tay.

## 1. Chuẩn bị trên VPS (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git
```

Trỏ tên miền (VD `hoanung.learntoleap.vn`) về IP của VPS (bản ghi A) trước khi cấp chứng chỉ.

## 2. Lấy code

```bash
sudo git clone https://github.com/LearntoLeap/Hoan-ung-.git /var/www/ltl-hoan-ung
```

Cập nhật bản mới về sau:

```bash
cd /var/www/ltl-hoan-ung && sudo git pull
```

## 3. Cấu hình nginx

```bash
sudo cp /var/www/ltl-hoan-ung/deploy/nginx-ltl-hoan-ung.conf /etc/nginx/sites-available/ltl-hoan-ung
sudo sed -i 's/hoanung.example.com/TEN-MIEN-CUA-BAN/g' /etc/nginx/sites-available/ltl-hoan-ung
sudo ln -s /etc/nginx/sites-available/ltl-hoan-ung /etc/nginx/sites-enabled/
```

Cấp HTTPS (bắt buộc — camera, chạy offline và đăng nhập đều cần HTTPS):

```bash
sudo certbot --nginx -d TEN-MIEN-CUA-BAN
sudo nginx -t && sudo systemctl reload nginx
```

> Nếu chạy `certbot` trước khi có file chứng chỉ, tạm comment 2 dòng `ssl_certificate*`
> và khối `listen 443`, chạy certbot, rồi bỏ comment.

## 4. Supabase (bắt buộc để đăng nhập trên tên miền mới)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://TEN-MIEN-CUA-BAN`
- **Redirect URLs**: thêm `https://TEN-MIEN-CUA-BAN/**`

Thiếu bước này thì link **xác nhận email** và **quên mật khẩu** sẽ dẫn về sai địa chỉ.

Supabase → **Authentication → Sign In / Providers → Email**: bật **Confirm email**
(người đăng ký phải bấm link xác nhận trong email). Tài khoản admin chỉ có quyền khi
email đã được xác nhận.

Quyền admin: chạy `supabase/setup.sql` trong **SQL Editor** (một lần, chạy lại vẫn an toàn).

## 5. Kiểm tra sau khi đưa lên

- Mở `https://TEN-MIEN-CUA-BAN` → thấy trang đăng nhập.
- Tạo một phiếu thử bằng tài khoản nhân sự → gửi duyệt → đăng nhập admin duyệt → xuất Word / Excel / PDF.
- Trên điện thoại: thử **Chụp bill** (cần HTTPS mới bật camera được).
- Đăng nhập tài khoản thật → chấm tròn trên thanh trên chuyển xanh (đã đồng bộ).

## Lưu ý

- Dữ liệu trên máy gắn theo tên miền: người dùng chuyển từ link Vercel sang tên miền
  mới cần **đăng nhập lại**; dữ liệu đã đồng bộ sẽ tự tải về.
- Các thư mục `supabase/`, `deploy/`, `robocon2026/`, file `.ps1`, `.sql`, `.md`
  đã bị chặn truy cập trong cấu hình nginx.

## 6. Tài khoản chính (Admin + Kế toán)

1. **Chạy `supabase/setup.sql`** (bản mới) trong Supabase → SQL Editor. File đã ghi sẵn admin cố định
   `learntoleap.2023@gmail.com`.
2. **Admin**: mở app → **Tạo tài khoản** bằng đúng email `learntoleap.2023@gmail.com` (tự đặt mật khẩu)
   → bấm link xác nhận trong email → đăng nhập. Menu sẽ có **Duyệt chứng từ**, **Thành viên & quyền**.
3. **Kế toán**: kế toán tự **Tạo tài khoản** bằng email công việc → admin vào **Thành viên & quyền** →
   chọn người đó → **Vai trò: Kế toán**. (Hoặc thêm cố định trong setup.sql: bỏ `--` ở dòng cuối, thay email, chạy lại.)
4. **Nhân sự**: tự tạo tài khoản, mặc định là Nhân sự (chỉ thấy dữ liệu của mình).

Quên mật khẩu: kế toán / admin vào **Thành viên & quyền** → **Cấp lại mật khẩu** (cần setup.sql bản mới).
