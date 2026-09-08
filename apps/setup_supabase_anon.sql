-- ============================================================
-- Supabase 匿名访问策略更新脚本
-- 在 Supabase → SQL Editor 中执行（只需执行一次）
--
-- 功能：允许 app_data_store 表的匿名读写
-- 用于支持无登录界面的应用直接同步数据到 Supabase
--
-- 注意：
-- 1. 请先在 Supabase Dashboard → Authentication → Providers 
--    中启用 "Anonymous" 提供商（推荐方式）
-- 2. 如果不想启用匿名登录，执行此脚本将 RLS 改为允许所有访问
-- ============================================================

-- 方案一（推荐）：更新 RLS 策略为允许 anon 角色（匿名登录用户）
-- 匿名登录的用户在 Supabase 中拥有 'authenticated' 角色
-- 如果已启用匿名登录，此脚本不需要执行
-- 当前策略已满足：auth.role() = 'authenticated'

-- 方案二（回退）：允许所有匿名访问（不推荐，但无需配置 Dashboard）
-- 取消下面两行注释来执行

-- drop policy if exists "shared_data_store" on public.app_data_store;
-- create policy "shared_data_store" on public.app_data_store
--   for all
--   using (true)
--   with check (true);

-- ============================================================
-- 验证方法：
-- 1. 打开任意已接入 supabase-sync.js 的应用
-- 2. 浏览器控制台应显示 "[SupabaseSync] Ready" 或 "[SupabaseSync] Anonymous auth OK"
-- 3. 在 Supabase → Table Editor → app_data_store 中应看到带前缀的数据行
--    如 orderschedule__orders, purchase__xxx, wicketorders__orderRecords 等
-- ============================================================
