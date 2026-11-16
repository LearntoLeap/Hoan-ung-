-- =========================================================================
-- TẠO 2 TÀI KHOẢN CỐ ĐỊNH (chạy SAU setup.sql, trong Supabase → SQL Editor)
-- 1) Thay 2 chỗ ĐẶT-MẬT-KHẨU-... bằng mật khẩu bạn tự chọn (≥ 8 ký tự, có chữ hoa, số, ký tự đặc biệt)
-- 2) Bấm Run. Email được xác nhận sẵn — đăng nhập ngay, không cần bấm link.
-- 3) KHÔNG lưu mật khẩu vào file này trong máy / GitHub. Chạy lại lệnh = đặt lại mật khẩu.
-- =========================================================================
select public.ltl_create_account('learntoleap.2023@gmail.com', 'ĐẶT-MẬT-KHẨU-ADMIN', 'Quản trị Learn to Leap');
select public.ltl_create_account('ketoan@learntoleap.vn', 'ĐẶT-MẬT-KHẨU-KẾ-TOÁN', 'Kế toán Learn to Leap');

-- Kiểm tra: phải thấy 2 dòng admin / ketoan
select r.role, r.email, u.email_confirmed_at is not null as da_xac_nhan
from public.ltl_roles r left join auth.users u on lower(u.email) = r.email order by r.role;
