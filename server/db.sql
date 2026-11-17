-- =========================================================================
-- LtL · Tạm ứng & Hoàn ứng — cơ sở dữ liệu trên VPS (PostgreSQL 16)
-- Máy chủ tự chạy file này mỗi lần khởi động (an toàn khi chạy lại).
-- =========================================================================
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pass_hash text not null,
  full_name text not null default '',
  dept text not null default '',
  position text not null default '',
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  page text, device text,
  pass_changed_at timestamptz not null default now()
);

-- dữ liệu đồng bộ của từng người (phiếu, khoản chi, sự kiện, ảnh, cài đặt)
create table if not exists records (
  owner uuid not null references users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null,
  primary key (owner, id)
);
-- mật khẩu tạm (tạo bằng cli.js / kế toán cấp lại) → bắt buộc đổi ở lần đăng nhập đầu
alter table users add column if not exists must_change boolean not null default false;

create index if not exists records_owner_kind on records (owner, kind);
create index if not exists records_kind on records (kind);

-- quyết định duyệt của kế toán / quản trị
create table if not exists reviews (
  owner uuid not null references users(id) on delete cascade,
  doc_id text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  primary key (owner, doc_id)
);

-- trao đổi, giải trình, lịch sử sửa của từng phiếu (chỉ thêm)
create table if not exists msgs (
  id text primary key,
  owner uuid not null references users(id) on delete cascade,
  doc_id text not null,
  at timestamptz not null default now(),
  author uuid not null references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);
create index if not exists msgs_doc on msgs (owner, doc_id, at);
create index if not exists msgs_kind on msgs ((data ->> 'kind'));

-- thông báo
create table if not exists notifs (
  id text primary key,
  at timestamptz not null default now(),
  to_user uuid references users(id) on delete cascade,
  to_acc boolean not null default false,
  author uuid not null references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);
create index if not exists notifs_at on notifs (at desc);

-- tin nhắn riêng 1-1
create table if not exists dm (
  id text primary key,
  at timestamptz not null default now(),
  from_user uuid not null references users(id) on delete cascade,
  to_user uuid not null references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);
create index if not exists dm_pair on dm (from_user, to_user, at);
create index if not exists dm_to on dm (to_user, at);
