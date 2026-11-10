-- =========================================================================
-- LtL · Tạm ứng & Hoàn ứng — thiết lập Supabase (chạy trong SQL Editor)
-- Chạy lại nhiều lần vẫn an toàn (bản v26: phân quyền + quy trình duyệt).
--   • Vai trò: admin / ketoan (quyền như nhau: xem tất cả, duyệt, quản lý thành viên)
--              staff (mặc định khi tự tạo tài khoản: chỉ dữ liệu của mình)
--   • Kế toán ghi trạng thái duyệt vào ltl_reviews — nhân sự không tự đổi được.
--     Phiếu "Đã duyệt" / "Đã duyệt chi" bị KHOÁ: máy chủ từ chối sửa / xoá.
--   • ltl_msgs: trao đổi, yêu cầu giải trình, lịch sử sửa (không sửa / xoá được)
--   • ltl_notifs: thông báo trong app + thiết bị (realtime)
--   • Cấp lại mật khẩu, khoá tài khoản, đổi vai trò: chỉ kế toán / quản trị
-- =========================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) Bảng dữ liệu đồng bộ của từng người
create table if not exists public.ltl_records (
  owner uuid not null default auth.uid(),
  id text not null,
  kind text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null,
  primary key (owner, id)
);
alter table public.ltl_records enable row level security;
create index if not exists ltl_records_owner_kind on public.ltl_records (owner, kind);
alter table public.ltl_records drop constraint if exists ltl_records_id_ok;
alter table public.ltl_records add constraint ltl_records_id_ok
  check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
alter table public.ltl_records drop constraint if exists ltl_records_size_ok;
alter table public.ltl_records add constraint ltl_records_size_ok
  check (pg_column_size(data) < 10485760) not valid;

-- 2) Vai trò (không có policy ghi → chỉ đổi qua hàm ltl_set_role)
create table if not exists public.ltl_admins (          -- bảng cũ, giữ để tương thích
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.ltl_admins enable row level security;
create table if not exists public.ltl_roles (
  email text primary key,
  role text not null check (role in ('admin', 'ketoan')),
  updated_at timestamptz not null default now()
);
alter table public.ltl_roles enable row level security;
create table if not exists public.ltl_blocked (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.ltl_blocked enable row level security;

-- vai trò của người đang đăng nhập (email phải được xác nhận)
create or replace function public.ltl_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select r.role from auth.users u
    join public.ltl_roles r on lower(r.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
    limit 1), 'staff');
$$;
-- "quản lý" = admin hoặc kế toán (quyền như nhau)
create or replace function public.ltl_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.ltl_role() in ('admin', 'ketoan'); $$;
create or replace function public.ltl_blocked_me()
returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.ltl_blocked b where b.user_id = auth.uid()); $$;
revoke all on function public.ltl_role() from public;
revoke all on function public.ltl_is_admin() from public;
revoke all on function public.ltl_blocked_me() from public;
grant execute on function public.ltl_role() to authenticated;
grant execute on function public.ltl_is_admin() to authenticated;
grant execute on function public.ltl_blocked_me() to authenticated;

-- 3) Duyệt chứng từ (chỉ kế toán / quản trị ghi)
create table if not exists public.ltl_reviews (
  owner uuid not null,
  doc_id text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  primary key (owner, doc_id)
);
alter table public.ltl_reviews enable row level security;
drop policy if exists "rev read" on public.ltl_reviews;
create policy "rev read" on public.ltl_reviews for select using (owner = auth.uid() or public.ltl_is_admin());
drop policy if exists "rev insert" on public.ltl_reviews;
create policy "rev insert" on public.ltl_reviews for insert with check (public.ltl_is_admin());
drop policy if exists "rev update" on public.ltl_reviews;
create policy "rev update" on public.ltl_reviews for update using (public.ltl_is_admin()) with check (public.ltl_is_admin());

-- phiếu đã duyệt / đã duyệt chi → khoá
create or replace function public.ltl_doc_locked(p_owner uuid, p_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.ltl_reviews r
    where r.owner = p_owner and r.doc_id = p_id and r.data ->> 'status' in ('da-duyet', 'da-chi'));
$$;
revoke all on function public.ltl_doc_locked(uuid, text) from public;
grant execute on function public.ltl_doc_locked(uuid, text) to authenticated;

-- 4) Quyền trên dữ liệu: mỗi người ghi dữ liệu của mình; phiếu đã khoá không sửa / xoá;
--    tài khoản bị khoá không ghi được; kế toán / quản trị đọc tất cả.
drop policy if exists "own rows" on public.ltl_records;
drop policy if exists "own select" on public.ltl_records;
drop policy if exists "own insert" on public.ltl_records;
drop policy if exists "own update" on public.ltl_records;
drop policy if exists "own delete" on public.ltl_records;
create policy "own select" on public.ltl_records for select using (owner = auth.uid());
create policy "own insert" on public.ltl_records for insert
  with check (owner = auth.uid() and not public.ltl_blocked_me());
create policy "own update" on public.ltl_records for update
  using (owner = auth.uid() and not public.ltl_blocked_me() and not public.ltl_doc_locked(owner, id))
  with check (owner = auth.uid());
create policy "own delete" on public.ltl_records for delete
  using (owner = auth.uid() and not public.ltl_doc_locked(owner, id));
drop policy if exists "admin read all" on public.ltl_records;
create policy "admin read all" on public.ltl_records for select using (public.ltl_is_admin());

-- 5) Trao đổi + lịch sử sửa (chỉ thêm, không sửa / xoá)
create table if not exists public.ltl_msgs (
  id text primary key,
  owner uuid not null,
  doc_id text not null,
  at timestamptz not null default now(),
  author uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb
);
create index if not exists ltl_msgs_doc on public.ltl_msgs (owner, doc_id, at);
create index if not exists ltl_msgs_kind on public.ltl_msgs ((data ->> 'kind'));
alter table public.ltl_msgs enable row level security;
drop policy if exists "msg read" on public.ltl_msgs;
create policy "msg read" on public.ltl_msgs for select using (owner = auth.uid() or public.ltl_is_admin());
drop policy if exists "msg add" on public.ltl_msgs;
create policy "msg add" on public.ltl_msgs for insert
  with check (author = auth.uid() and (owner = auth.uid() or public.ltl_is_admin()) and pg_column_size(data) < 2000000);

-- 6) Thông báo
create table if not exists public.ltl_notifs (
  id text primary key,
  at timestamptz not null default now(),
  to_user uuid,
  to_acc boolean not null default false,
  author uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb
);
create index if not exists ltl_notifs_at on public.ltl_notifs (at desc);
alter table public.ltl_notifs enable row level security;
drop policy if exists "notif read" on public.ltl_notifs;
create policy "notif read" on public.ltl_notifs for select
  using (to_user = auth.uid() or (to_acc and public.ltl_is_admin()) or author = auth.uid());
drop policy if exists "notif add" on public.ltl_notifs;
create policy "notif add" on public.ltl_notifs for insert
  with check (author = auth.uid() and (to_acc or to_user = auth.uid() or public.ltl_is_admin()));

-- 7) Hồ sơ tài khoản (+ trang đang mở, thiết bị → "ai đang dùng app")
create table if not exists public.ltl_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  dept text,
  position text,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table public.ltl_profiles add column if not exists page text;
alter table public.ltl_profiles add column if not exists device text;
alter table public.ltl_profiles enable row level security;
drop policy if exists "profile self" on public.ltl_profiles;
create policy "profile self" on public.ltl_profiles
  for all using (id = auth.uid())
  with check (id = auth.uid() and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "profile admin read" on public.ltl_profiles;
create policy "profile admin read" on public.ltl_profiles for select using (public.ltl_is_admin());
drop policy if exists "roles acc read" on public.ltl_roles;
create policy "roles acc read" on public.ltl_roles for select using (public.ltl_is_admin());
drop policy if exists "blocked acc read" on public.ltl_blocked;
create policy "blocked acc read" on public.ltl_blocked for select using (public.ltl_is_admin() or user_id = auth.uid());

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
insert into public.ltl_profiles (id, email, full_name, created_at)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), u.created_at
from auth.users u
on conflict (id) do nothing;

-- 8) Hàm quản lý thành viên (chỉ kế toán / quản trị)
create or replace function public.ltl_set_role(p_email text, p_role text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.ltl_is_admin() then raise exception 'Không có quyền'; end if;
  if p_role not in ('admin', 'ketoan', 'staff') then raise exception 'Vai trò không hợp lệ'; end if;
  if lower(coalesce(p_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'Không tự đổi vai trò của chính mình'; end if;
  if p_role = 'staff' then
    delete from public.ltl_roles where lower(email) = lower(p_email);
    delete from public.ltl_admins where lower(email) = lower(p_email);
  else
    insert into public.ltl_roles (email, role) values (lower(p_email), p_role)
    on conflict (email) do update set role = excluded.role, updated_at = now();
  end if;
end;
$$;
create or replace function public.ltl_set_blocked(p_user uuid, p_blocked boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.ltl_is_admin() then raise exception 'Không có quyền'; end if;
  if p_user = auth.uid() then raise exception 'Không tự khoá chính mình'; end if;
  if p_blocked then insert into public.ltl_blocked (user_id) values (p_user) on conflict do nothing;
  else delete from public.ltl_blocked where user_id = p_user; end if;
end;
$$;
-- cấp lại mật khẩu cho thành viên quên mật khẩu
create or replace function public.ltl_admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.ltl_is_admin() then raise exception 'Không có quyền'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Mật khẩu tối thiểu 8 ký tự'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản'; end if;
end;
$$;
revoke all on function public.ltl_set_role(text, text) from public;
revoke all on function public.ltl_set_blocked(uuid, boolean) from public;
revoke all on function public.ltl_admin_set_password(uuid, text) from public;
grant execute on function public.ltl_set_role(text, text) to authenticated;
grant execute on function public.ltl_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.ltl_admin_set_password(uuid, text) to authenticated;

-- 9) Thông báo tức thời (realtime) cho thông báo + trạng thái duyệt
do $$
begin
  begin alter publication supabase_realtime add table public.ltl_notifs; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ltl_reviews; exception when others then null; end;
end $$;

-- 10) TÀI KHOẢN CỐ ĐỊNH
--   Quản trị:
insert into public.ltl_admins (email) values ('learntoleap.2023@gmail.com') on conflict (email) do nothing;
insert into public.ltl_roles (email, role) select lower(email), 'admin' from public.ltl_admins
on conflict (email) do nothing;
--   Kế toán: bỏ dấu "--" ở dòng dưới và thay email kế toán (hoặc đổi vai trò trong app: Thành viên & quyền)
-- insert into public.ltl_roles (email, role) values ('ketoan@learntoleap.vn', 'ketoan') on conflict (email) do update set role = 'ketoan';
