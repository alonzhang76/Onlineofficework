/* ===== 用户信息展示（登录守卫） =====
 * poultry 与 wage / orderschedule / wicketorders 一致：页面预设 window.CLOUDBASE_SYNC，
 * 由共享兼容层（js/cloudbase.js → apps/cloudbase/cloudbase.js）用共享账号静默登录，
 * 不再弹出登录窗口、不再跳转 login.html。
 * 本文件仅负责把当前用户挂到 window.currentSupabaseUser 并更新 #userInfo 展示。
 */

(function () {
  "use strict";

  var SESSION_KEY = "tcb_auth_session";

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && parsed.user) return parsed;
    } catch (e) {}
    return null;
  }

  // 同步先用本地缓存展示（异步校验后会刷新）
  var session = readSession();
  if (session && session.user) {
    window.currentSupabaseUser = session.user;
  }

  // 异步权威刷新：等兼容层登录就绪 → getUser → 更新展示（不跳转、不清会话）
  (async function () {
    try {
      if (typeof window.CloudbaseWhenReady === "function") {
        await window.CloudbaseWhenReady();
      }
      var sb = window.supabase;
      if (!sb || !sb.auth) return;

      var result = await sb.auth.getUser();
      var u = result && result.data && result.data.user ? result.data.user : null;
      if (u) window.currentSupabaseUser = u;
      var el = document.getElementById("userInfo");
      if (el) {
        el.textContent = u ? ("当前用户：" + (u.email || "已登录")) : "";
      }
    } catch (e) {
      // 网络异常时保留本地会话展示，不做任何跳转
    }
  })();
})();
