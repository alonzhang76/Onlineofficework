/* ===== 登录逻辑 login.js =====
 * 使用 supabase.auth.signInWithPassword 完成登录
 * 登录成功后跳转到首页（index.html）
 */

import { supabase, SUPABASE_URL } from "./supabase.js";

var MSG = {
  empty: "请输入邮箱和密码",
  invalidEmail: "请输入正确的邮箱地址",
  submitting: "登录中…",
  success: "登录成功，正在跳转…",
  invalidCreds: "邮箱或密码错误",
  notConfirmed: "邮箱尚未验证，请先去邮箱确认",
  network: "网络错误，请检查网络连接",
  urlNotConfigured: "Supabase URL 未配置，请联系管理员",
  unknown: "登录失败，请稍后重试",
};

function setMessage(text, type) {
  var el = document.getElementById("login-message");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = type === "error" ? "#dc2626" : type === "success" ? "#059669" : type === "info" ? "#2563eb" : "#6b7280";
}

function setDebug(text) {
  var el = document.getElementById("debug-panel");
  if (!el) return;
  el.style.display = text ? "block" : "none";
  el.textContent = text || "";
}

function setButtonState(btn, disabled, label) {
  if (!btn) return;
  btn.disabled = !!disabled;
  if (label !== undefined) btn.textContent = label;
}

async function handleLogin(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();

  var emailEl = document.getElementById("email");
  var pwdEl = document.getElementById("password");
  var btn = document.getElementById("loginBtn");
  var email = (emailEl ? emailEl.value : "").trim();
  var password = pwdEl ? pwdEl.value : "";

  if (!email || !password) { setMessage(MSG.empty, "error"); return false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMessage(MSG.invalidEmail, "error"); return false; }
  if (!SUPABASE_URL || SUPABASE_URL.indexOf("请替换") >= 0) {
    setMessage(MSG.urlNotConfigured, "error");
    setDebug("SUPABASE_URL 仍是占位符，请在 js/supabase.js 中填入真实值");
    return false;
  }

  setButtonState(btn, true, MSG.submitting);
  setMessage("");
  setDebug("");

  try {
    var result = await supabase.auth.signInWithPassword({ email: email, password: password });

    if (result.error) {
      console.error("[login] error:", result.error);
      var em = (result.error.message || "").toLowerCase();
      if (em.indexOf("invalid login") >= 0 || em.indexOf("invalid_credentials") >= 0) {
        setMessage(MSG.invalidCreds, "error");
      } else if (em.indexOf("email not confirmed") >= 0 || em.indexOf("not confirmed") >= 0) {
        setMessage(MSG.notConfirmed, "error");
      } else if (em.indexOf("rate limit") >= 0 || em.indexOf("too many") >= 0) {
        setMessage("尝试次数过多，请稍后再试", "error");
      } else if (em.indexOf("fetch") >= 0 || em.indexOf("network") >= 0 || em.indexOf("abort") >= 0) {
        setMessage(MSG.network, "error");
        setDebug("网络请求失败：\n" + result.error.message);
      } else {
        setMessage(result.error.message || MSG.unknown, "error");
        setDebug("完整错误信息：\n" + (result.error.message || String(result.error)));
      }
      setButtonState(btn, false, "登 录");
      return false;
    }

    if (!result.data || !result.data.user) {
      setMessage(MSG.invalidCreds, "error");
      setButtonState(btn, false, "登 录");
      return false;
    }

    window.currentSupabaseUser = result.data.user;
    setMessage(MSG.success, "success");

    // 跳转目标：部署域名 → './'（目录默认文档 index.html）；其他环境 → 'index.html'
    var target = resolveHomeTarget();

    setTimeout(function() {
      try { window.location.replace(target); }
      catch(e) { window.location.href = target; }
    }, 400);
    return false;
  } catch(err) {
    console.error("[login] exception:", err);
    var msg = err && err.message
      ? (err.message.indexOf("Failed to fetch") >= 0 || err.message.toLowerCase().indexOf("network") >= 0 ? MSG.network : err.message)
      : MSG.network;
    setMessage(msg, "error");
    setDebug("异常详情：\n" + (err && err.stack ? err.stack : String(err)));
    setButtonState(btn, false, "登 录");
    return false;
  }
}

window.handleLogin = handleLogin;

// 跳转目标：统一跳到 index.html；部署域名保留 './' 兜底
function resolveHomeTarget() {
  if (location.origin.includes('lori.net.cn')) return './';
  return 'index.html';
}

// 已登录则跳转首页
(function redirectIfAuthedSync() {
  try {
    var keys = Object.keys(localStorage);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") >= 0) {
        var raw = localStorage.getItem(k);
        if (raw) {
          try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.user) {
              window.location.replace(resolveHomeTarget());
              return;
            }
          } catch(_) {}
        }
      }
    }
  } catch(_) {}
})();

(async function redirectIfAuthed() {
  try {
    var result = await supabase.auth.getUser();
    if (result.data && result.data.user) {
      window.location.replace(resolveHomeTarget());
    }
  } catch(e) {}
})();
