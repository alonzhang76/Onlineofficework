/* ===== 登录守卫 auth-guard.js（CloudBase 版） =====
 * 1. 同步检查 CloudBase 兼容层会话缓存 tcb_auth_session，无会话/匿名会话 → login.html
 * 2. 动态 import cloudbase.js 后用 auth.getUser() 做权威校验
 * 3. 提供 window.currentSupabaseUser（页面内显示当前用户用，保持旧命名）
 * 4. window.logoutSupabase() 退出并跳转登录页
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

  function clearAllAuthState() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    window.currentSupabaseUser = null;
  }

  function isLoginPage() {
    return window.location.href.indexOf("login") >= 0;
  }

  // 同步检查：先依据本地会话缓存决定是否立即跳转，避免页面闪烁
  var session = readSession();
  if (!session || !session.user || session.user.is_anonymous) {
    if (!isLoginPage()) {
      window.location.replace("login.html");
      return;
    }
  } else {
    window.currentSupabaseUser = session.user;
  }

  // 异步权威校验：加载兼容层 → getUser
  (async function () {
    try {
      var sb = window.supabase;
      if (!sb) {
        try {
          var mod = await import("./cloudbase.js");
          sb = (mod && mod.supabase) || window.supabase;
        } catch (e) {}
      }
      var tries = 0;
      while (!sb && tries < 50) {
        await new Promise(function (r) { setTimeout(r, 100); });
        sb = window.supabase;
        tries++;
      }
      if (!sb || !sb.auth) return;

      var result = await sb.auth.getUser();
      if (!result.data || !result.data.user || result.data.user.is_anonymous) {
        clearAllAuthState();
        if (!isLoginPage()) {
          window.location.replace("login.html");
        }
      } else {
        window.currentSupabaseUser = result.data.user;
        // 更新用户信息展示
        var el = document.getElementById("userInfo");
        if (el) el.textContent = "当前用户：" + (result.data.user.email || "");
      }
    } catch (e) {
      // 网络异常时保留本地会话，不强制跳转
    }
  })();

  // 退出登录
  window.logoutSupabase = async function () {
    try {
      var sb = window.supabase;
      if (sb && sb.auth) await sb.auth.signOut();
    } catch (e) {}
    clearAllAuthState();
    window.location.replace("login.html");
  };
})();
