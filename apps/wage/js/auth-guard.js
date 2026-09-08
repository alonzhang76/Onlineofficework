/* ===== 登录守卫 auth-guard.js =====
 * 1. 检查 Supabase 会话，未登录则跳转 login.html
 * 2. 已登录则允许页面继续加载
 * 3. 提供 window.currentSupabaseUser
 * 4. 覆盖 logout 调用 supabase.auth.signOut()
 */

(function() {
  "use strict";

  function readSupabaseSession() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") >= 0) {
          var raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.user) return parsed;
          } catch(e) {}
        }
      }
    } catch(e) {}
    return null;
  }

  function clearAllAuthState() {
    try {
      var keys = Object.keys(localStorage);
      keys.forEach(function(k) {
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") >= 0) {
          localStorage.removeItem(k);
        }
      });
    } catch(e) {}
    window.currentSupabaseUser = null;
  }

  // 同步检查：从 localStorage 读取 Supabase 会话
  var session = readSupabaseSession();
  if (!session) {
    // 未登录，跳转登录页
    var href = window.location.href;
    if (href.indexOf('login') < 0) {
      window.location.replace('login.html');
      return;
    }
  } else {
    window.currentSupabaseUser = session.user;
  }

  // 异步校验会话有效性
  (async function() {
    try {
      var sb = window.supabase;
      if (!sb) {
        // 等待 supabase.js 加载
        var tries = 0;
        while (!window.supabase && tries < 50) { await new Promise(function(r) { setTimeout(r, 100); }); tries++; }
        sb = window.supabase;
      }
      if (!sb || !sb.auth) return;

      var result = await sb.auth.getUser();
      if (!result.data || !result.data.user) {
        clearAllAuthState();
        if (window.location.href.indexOf('login') < 0) {
          window.location.replace('login.html');
        }
      } else {
        window.currentSupabaseUser = result.data.user;
      }
    } catch(e) {
      // 忽略，留在当前页
    }
  })();

  // 覆盖 logout
  window.logoutSupabase = async function() {
    try {
      var sb = window.supabase;
      if (sb && sb.auth) await sb.auth.signOut();
    } catch(e) {}
    clearAllAuthState();
    window.location.replace('login.html');
  };

})();
