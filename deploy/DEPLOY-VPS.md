# Đưa app lên VPS

App là **web tĩnh** (HTML/CSS/JS), không cần Node, PHP hay database trên VPS.
Đăng nhập và đồng bộ dùng Supabase, nên VPS chỉ cần phục vụ file.

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
- Bấm **Dùng thử không cần tài khoản** → **Nạp dữ liệu mẫu** → xuất thử Word / Excel.
- Trên điện thoại: thử **Chụp bill** (cần HTTPS mới bật camera được).
- Đăng nhập tài khoản thật → chấm tròn trên thanh trên chuyển xanh (đã đồng bộ).

## Lưu ý

- Dữ liệu trên máy gắn theo tên miền: người dùng chuyển từ link Vercel sang tên miền
  mới cần **đăng nhập lại**; dữ liệu đã đồng bộ sẽ tự tải về.
- Các thư mục `supabase/`, `deploy/`, `robocon2026/`, file `.ps1`, `.sql`, `.md`
  đã bị chặn truy cập trong cấu hình nginx.
