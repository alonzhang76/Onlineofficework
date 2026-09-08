-- ============================================================
-- 应用门户 Supabase 初始化脚本（V2 - 带权限管理）
-- 在 Supabase → SQL Editor 中执行（只需执行一次）
-- ============================================================

-- ===== 一、应用权限类型 =====
do $$ begin
  create type public.app_permission as enum ('none', 'read', 'write');
exception when duplicate_object then null;
end $$;

-- ===== 二、用户-应用权限表 =====
create table if not exists public.user_app_permissions (
  user_id uuid references auth.users(id) on delete cascade,
  app_id text not null,
  permission app_permission default 'none',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, app_id)
);

-- ===== 三、索引 =====
create index if not exists idx_user_app_permissions_user_id
  on public.user_app_permissions (user_id);

-- ===== 四、RLS 行级安全策略 =====
alter table public.user_app_permissions enable row level security;

-- 策略1：用户只能读取自己的权限
drop policy if exists "user_read_own_permissions" on public.user_app_permissions;
create policy "user_read_own_permissions"
  on public.user_app_permissions
  for select
  using (auth.uid() = user_id);

-- ===== 五、管理员 RPC 函数（核心！） =====
-- 通过邮箱设置用户权限（管理员专用）

-- 5.1 判断是否为管理员的函数
create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select exists (
    select 1 from auth.users
    where id = uid
    and email = 'alonzhang76@outlook.com'
  );
$$ language sql security definer stable;

-- 5.2 设置单个应用权限的函数
create or replace function public.set_app_permission(
  user_email text,
  target_app_id text,
  target_permission app_permission
)
returns boolean as $$
declare
  target_user_id uuid;
begin
  -- 校验：调用者必须是管理员
  if not public.is_admin(auth.uid()) then
    raise exception 'Permission denied: admin only';
  end if;

  -- 根据邮箱查找用户
  select id into target_user_id
  from auth.users
  where email = user_email;

  if target_user_id is null then
    raise exception 'User not found: %', user_email;
  end if;

  -- 插入或更新权限
  insert into public.user_app_permissions (user_id, app_id, permission, updated_at)
  values (target_user_id, target_app_id, target_permission, now())
  on conflict (user_id, app_id)
  do update set
    permission = target_permission,
    updated_at = now();

  return true;
end;
$$ language plpgsql security definer;

-- 5.3 批量设置权限的函数（一次设置多个应用）
create or replace function public.set_app_permissions_batch(
  user_email text,
  perms jsonb  -- 格式：{"app1": "write", "app2": "read"}
)
returns boolean as $$
declare
  target_user_id uuid;
  app_id text;
  perm text;
begin
  -- 校验：调用者必须是管理员
  if not public.is_admin(auth.uid()) then
    raise exception 'Permission denied: admin only';
  end if;

  -- 根据邮箱查找用户
  select id into target_user_id
  from auth.users
  where email = user_email;

  if target_user_id is null then
    raise exception 'User not found: %', user_email;
  end if;

  -- 遍历 JSON 键值对
  for app_id, perm in select * from jsonb_each_text(perms) loop
    insert into public.user_app_permissions (user_id, app_id, permission, updated_at)
    values (target_user_id, app_id, perm::app_permission, now())
    on conflict (user_id, app_id)
    do update set
      permission = perm::app_permission,
      updated_at = now();
  end loop;

  return true;
end;
$$ language plpgsql security definer;

-- 5.4 读取指定用户的所有权限（管理员用）
create or replace function public.get_user_permissions(user_email text)
returns table (
  app_id text,
  permission app_permission
) as $$
declare
  target_user_id uuid;
begin
  -- 校验：调用者必须是管理员
  if not public.is_admin(auth.uid()) then
    raise exception 'Permission denied: admin only';
  end if;

  select id into target_user_id
  from auth.users
  where email = user_email;

  if target_user_id is null then
    raise exception 'User not found: %', user_email;
  end if;

  return query
    select p.app_id, p.permission
    from public.user_app_permissions p
    where p.user_id = target_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- ✅ 完成！
--
-- 使用方式：
-- 1. 在 Authentication → Users 中添加用户（邮箱+密码）
-- 2. 管理员（alonzhang76@outlook.com）登录后点击"权限管理"按钮
-- 3. 输入用户邮箱，为每个应用设置权限：
--    - write: 读写（完全访问）
--    - read: 只读（可进入应用，卡片显示"只读"标签）
--    - none: 不显示（用户看不到这个应用）
--
-- 前端调用方式示例：
--   const { data, error } = await supabase.rpc('set_app_permissions_batch', {
--     user_email: 'user@example.com',
--     perms: { 'wicketproduct': 'write', 'app2': 'read' }
--   });
--
-- 修改管理员邮箱：
--   直接修改 public.is_admin 函数中的邮箱地址即可
-- ============================================================
