/* ===== Supabase 客户端配置 =====
 * 部署前请替换为你的 Supabase 项目配置
 *   - SUPABASE_URL             Supabase 项目 URL
 *   - SUPABASE_PUBLISHABLE_KEY  Supabase anon key (Project Settings → API)
 *
 * 安全说明：
 *   - 只放 anon key，不要放 service_role key
 *   - 权限由 RLS（行级安全）策略保证
 */

export const SUPABASE_URL = "https://ugoyacuagslqhqguxyqe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnb3lhY3VhZ3NscWhxZ3V4eXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI5NTUsImV4cCI6MjEwMjUwODk1NX0._GdWOGWblSpOYm3y8f_d3aVQszfn2YbRjHN0FqZiLtI";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

window.supabase = supabase;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
