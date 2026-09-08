-- ============================================================
-- 计件工资管理系统 Supabase 初始化脚本（共享数据模式）
-- 在 Supabase → SQL Editor 中执行（只需执行一次）
-- ============================================================

-- ===== 一、数据表 =====

create table if not exists public.app_data_store (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,  -- 仅记录最后修改者
  store_key text not null,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 添加 unique(store_key) 约束
alter table public.app_data_store
  drop constraint if exists app_data_store_store_key_key;
alter table public.app_data_store
  add constraint app_data_store_store_key_key unique (store_key);

alter table public.app_data_store alter column user_id drop not null;

-- ===== 二、RLS 行级安全 =====

alter table public.app_data_store enable row level security;

-- 所有已认证用户共享读写
drop policy if exists "shared_data_store" on public.app_data_store;
create policy "shared_data_store"
  on public.app_data_store
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ===== 三、索引 =====

create index if not exists idx_app_data_store_key
  on public.app_data_store (store_key);

-- ============================================================
-- ✅ 完成！
-- 验证方法：
-- 1. Table Editor 应看到 app_data_store 表
-- 2. Authentication → Users 中添加用户（邮箱+密码）
-- 3. 访问 login.html，用邮箱密码登录
-- 4. 登录后跳转到主系统，数据自动同步到 Supabase
-- 5. 换一台电脑登录，应能看到相同的数据
-- ============================================================
