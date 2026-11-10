-- =========================================================================
-- LtL · Tạm ứng & Hoàn ứng — thiết lập Supabase (chạy MỘT LẦN trong SQL Editor)
-- Chạy lại nhiều lần vẫn an toàn.
--   • Mỗi tài khoản chỉ đọc/ghi dữ liệu của chính mình (RLS theo owner).
--   • Tài khoản có email trong bảng ltl_admins ĐỌC được dữ liệu mọi tài khoản
--     (không sửa / xoá được dữ liệu người khác).
--   • Bảng ltl_profiles: danh sách tài khoản cho trang "Tài khoản" của quản trị.
-- =========================================================================

-- 1) Bảng dữ liệu đồng bộ (đã có từ bản trước — giữ nguyên nếu tồn tại)
create table if not exists public.ltl_records (
  owner uuid not null default auth.uid(),
  id text not null,
  kind text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null,
  primary key (owner, id)
);
alter table public.ltl_records enable row level security;
drop policy if exists "own rows" on public.ltl_records;
create policy "own rows" on public.ltl_records
  for all using (owner = auth.uid()) with check (owner = auth.uid());
create index if not exists ltl_records_owner_kind on public.ltl_records (owner, kind);

-- Chặn mã định danh lạ (chống chèn mã HTML qua id) và bản ghi quá lớn (> 10 MB)
alter table public.ltl_records drop constraint if exists ltl_records_id_ok;
alter table public.ltl_records add constraint ltl_records_id_ok
  check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
alter table public.ltl_records drop constraint if exists ltl_records_size_ok;
alter table public.ltl_records add constraint ltl_records_size_ok
  check (pg_column_size(data) < 10485760) not valid;

-- 2) Danh sách quản trị (không có policy → API không đọc trực tiếp được)
create table if not exists public.ltl_admins (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.ltl_admins enable row level security;

create or replace function public.ltl_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  -- chỉ là admin khi email nằm trong danh sách VÀ đã được xác nhận
  -- (tránh người khác đăng ký trước bằng email admin mà không cần xác nhận)
  select exists (
    select 1
    from auth.users u
    join public.ltl_admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.ltl_is_admin() from public;
grant execute on function public.ltl_is_admin() to authenticated;

-- 3) Quản trị được ĐỌC mọi bản ghi
drop policy if exists "admin read all" on public.ltl_records;
create policy "admin read all" on public.ltl_records
  for select using (public.ltl_is_admin());

-- 4) Hồ sơ tài khoản
create table if not exists public.ltl_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  dept text,
  position text,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table public.ltl_profiles enable row level security;
drop policy if exists "profile self" on public.ltl_profiles;
create policy "profile self" on public.ltl_profiles
  for all using (id = auth.uid())
  with check (id = auth.uid() and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "profile admin read" on public.ltl_profiles;
create policy "profile admin read" on public.ltl_profiles
  for select using (public.ltl_is_admin());

-- tự tạo hồ sơ khi có tài khoản mới
create or replace function public.ltl_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.ltl_profiles (id, email, full_name, dept, created_at)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          coalesce(new.raw_user_meta_data ->> 'dept', ''), coalesce(new.created_at, now()))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists ltl_on_auth_user_created on auth.users;
create trigger ltl_on_auth_user_created
  after insert on auth.users
  for each row execute function public.ltl_handle_new_user();

-- hồ sơ cho các tài khoản đã có từ trước
insert into public.ltl_profiles (id, email, full_name, created_at)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), u.created_at
from auth.users u
on conflict (id) do nothing;

-- 5) TÀI KHOẢN QUẢN TRỊ (thêm dòng tương tự nếu cần nhiều admin)
insert into public.ltl_admins (email) values ('learntoleap.2023@gmail.com')
on conflict (email) do nothing;
