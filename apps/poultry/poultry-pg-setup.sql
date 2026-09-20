-- ============================================================
-- 家禽订单系统 - PostgreSQL 建表脚本
-- ============================================================
-- 执行位置：腾讯云开发控制台 → SQL 型数据库 → SQL 窗口/SQL 执行
-- 说明：
--   1. 本环境为 PostgreSQL 实例，与 saintysys / wage 等应用一致
--   2. 业务行统一存储为 { id: text 主键, data: jsonb 业务字段 }
--      前端兼容层（js/cloudbase.js）负责展开/合并，对业务代码透明
--   3. 脚本可重复执行（幂等）：表用 IF NOT EXISTS，策略先 DROP 再建
--   4. 默认以管理员身份执行，GRANT anon 仅开放只读
-- ============================================================

-- ---------- 1. 建表 ----------

-- 商品表
CREATE TABLE IF NOT EXISTS public.poultry_products (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 订单表
CREATE TABLE IF NOT EXISTS public.poultry_orders (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 财务记录表
CREATE TABLE IF NOT EXISTS public.poultry_finance_records (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- 2. 授权（表级 GRANT） ----------
-- 登录用户（authenticated）：完全读写
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poultry_products            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poultry_orders              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poultry_finance_records     TO authenticated;

-- 匿名（anon）：只读
GRANT SELECT ON public.poultry_products          TO anon;
GRANT SELECT ON public.poultry_orders            TO anon;
GRANT SELECT ON public.poultry_finance_records   TO anon;

-- ---------- 3. 行级安全（RLS） ----------

-- poultry_products
ALTER TABLE public.poultry_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poultry_products_auth_all ON public.poultry_products;
CREATE POLICY poultry_products_auth_all ON public.poultry_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS poultry_products_anon_read ON public.poultry_products;
CREATE POLICY poultry_products_anon_read ON public.poultry_products
  FOR SELECT TO anon USING (true);

-- poultry_orders
ALTER TABLE public.poultry_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poultry_orders_auth_all ON public.poultry_orders;
CREATE POLICY poultry_orders_auth_all ON public.poultry_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS poultry_orders_anon_read ON public.poultry_orders;
CREATE POLICY poultry_orders_anon_read ON public.poultry_orders
  FOR SELECT TO anon USING (true);

-- poultry_finance_records
ALTER TABLE public.poultry_finance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poultry_finance_records_auth_all ON public.poultry_finance_records;
CREATE POLICY poultry_finance_records_auth_all ON public.poultry_finance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS poultry_finance_records_anon_read ON public.poultry_finance_records;
CREATE POLICY poultry_finance_records_anon_read ON public.poultry_finance_records
  FOR SELECT TO anon USING (true);

-- ---------- 4. 验证 ----------
-- 执行完后可以运行下面的查询验证表是否创建成功：
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'poultry_%';

-- ============================================================
-- 执行完成后，回到 init.html 页面点击"开始初始化"即可导入示例数据
-- ============================================================
