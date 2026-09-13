-- ============================================================
-- CloudBase PostgreSQL 环境建表脚本（线上办公门户·全应用）
-- ============================================================
-- 执行位置：腾讯云开发控制台 → 数据库（SQL 型）→ SQL 窗口/SQL 执行
-- 适用应用：门户首页、saintysys(AA服装外贸)、wage(计件工资)、
--           wicketorders(炉架订单)、purchase(采购)、orderschedule(订单统计)、
--           incomeexpense(收支表)、stainlessbusiness(不锈钢贸易)
-- 说明：
--   1. 本环境为 PostgreSQL 实例（pgdb-*），无文档型数据库。
--   2. 业务行统一存储为 { id: text 主键, data: jsonb 业务字段 }，
--      前端兼容层（apps/cloudbase/cloudbase.js）负责展开/合并，对业务代码透明。
--   3. 脚本可重复执行（幂等）：表用 IF NOT EXISTS，策略先 DROP 再建。
--   4. 登录用户 authenticated 可读写；匿名 anon 仅 SELECT（未登录/匿名只读）。
-- ============================================================

-- ---------- 1. 建表 ----------
-- 全应用共享键值表
--   saintysys  : id = 裸 store_key（styles / orders ...）
--   wage       : id = wage_* 键
--   其余应用   : id = '<appId>__<key>'（如 wicketorders__orders）
CREATE TABLE IF NOT EXISTS public.app_data_store (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- saintysys 角色/模块权限
CREATE TABLE IF NOT EXISTS public.user_roles (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.module_permissions (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- saintysys 表单提交
CREATE TABLE IF NOT EXISTS public.app_submissions (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.submission_files (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 门户应用权限：每个用户一行
--   id   = 'perm::<小写邮箱>'
--   data = { user_email, perms: { appId: 'read'|'write' }, updated_at }
CREATE TABLE IF NOT EXISTS public.user_app_permissions (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- 2. 授权（表级 GRANT） ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_data_store       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_permissions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_submissions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_files     TO authenticated;
-- 门户权限表：所有登录用户可读（登录后拉取自己的应用列表），管理员可写
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_app_permissions TO authenticated;

GRANT SELECT ON public.app_data_store       TO anon;
GRANT SELECT ON public.user_roles           TO anon;
GRANT SELECT ON public.module_permissions   TO anon;
GRANT SELECT ON public.app_submissions      TO anon;
GRANT SELECT ON public.submission_files     TO anon;
-- 门户权限表不向匿名开放

-- ---------- 3. 行级安全（RLS） ----------
ALTER TABLE public.app_data_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_data_store_auth_all ON public.app_data_store;
CREATE POLICY app_data_store_auth_all ON public.app_data_store
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS app_data_store_anon_read ON public.app_data_store;
CREATE POLICY app_data_store_anon_read ON public.app_data_store
  FOR SELECT TO anon USING (true);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_auth_all ON public.user_roles;
CREATE POLICY user_roles_auth_all ON public.user_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS user_roles_anon_read ON public.user_roles;
CREATE POLICY user_roles_anon_read ON public.user_roles
  FOR SELECT TO anon USING (true);

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_permissions_auth_all ON public.module_permissions;
CREATE POLICY module_permissions_auth_all ON public.module_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS module_permissions_anon_read ON public.module_permissions;
CREATE POLICY module_permissions_anon_read ON public.module_permissions
  FOR SELECT TO anon USING (true);

ALTER TABLE public.app_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_submissions_auth_all ON public.app_submissions;
CREATE POLICY app_submissions_auth_all ON public.app_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS app_submissions_anon_read ON public.app_submissions;
CREATE POLICY app_submissions_anon_read ON public.app_submissions
  FOR SELECT TO anon USING (true);

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submission_files_auth_all ON public.submission_files;
CREATE POLICY submission_files_auth_all ON public.submission_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS submission_files_anon_read ON public.submission_files;
CREATE POLICY submission_files_anon_read ON public.submission_files
  FOR SELECT TO anon USING (true);

-- 门户权限表：全员登录可读、登录用户可写（门户管理员实际写，普通用户只读自己文档）
ALTER TABLE public.user_app_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_app_permissions_auth_all ON public.user_app_permissions;
CREATE POLICY user_app_permissions_auth_all ON public.user_app_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 4. 写权限 401 专项兜底（整段一起执行，幂等） ----------
-- 症状：rdb/rest 写操作返回 401 permission denied（SELECT 正常、写失败）。
-- ⚠️ 若 DO 块报 "permission denied to create role"，注释掉该 DO 块后继续执行其余语句。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT                         ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- 再次确保 RLS 策略存在
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_data_store','user_roles','module_permissions',
    'app_submissions','submission_files','user_app_permissions'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_auth_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t||'_auth_all', t);
      IF t <> 'user_app_permissions' THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_anon_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (true)', t||'_anon_read', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------- 5. PG 云存储：业务 Bucket + RLS 策略（幂等） ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('app-photos', 'app-photos', true, 20 * 1024 * 1024, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='buckets' AND policyname='buckets_read_all') THEN
    CREATE POLICY buckets_read_all ON storage.buckets
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_photos_anon_select') THEN
    CREATE POLICY app_photos_anon_select ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'app-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_photos_auth_all') THEN
    CREATE POLICY app_photos_auth_all ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'app-photos')
      WITH CHECK (bucket_id = 'app-photos');
  END IF;
END $$;

-- ---------- 6. 验证（可选） ----------
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
-- SELECT id, name, public FROM storage.buckets ORDER BY id;
-- SELECT * FROM public.user_app_permissions LIMIT 5;
