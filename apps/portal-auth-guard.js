/* ===== 门户登录门禁（供无独立登录窗口的子应用使用） =====
 *
 * 在子应用 <head> 最顶部引入：
 *   <script src="../portal-auth-guard.js"></script>
 *
 * 机制：
 *   门户登录成功后会在 localStorage 写入 portal_auth_session
 *   （{email, username, ts}）。本脚本同步读取该标记：
 *     - 存在且未过期（默认 12 小时）→ 放行，应用正常加载
 *     - 缺失或过期 → 立即跳回门户登录页，并带上 redirect 参数，
 *       登录成功后自动返回当前应用。
 *
 * 可选覆盖（在引入本脚本前设置）：
 *   window.PORTAL_AUTH_TTL     会话有效期（毫秒），默认 12h
 *   window.PORTAL_AUTH_DISABLE 设为 true 可临时关闭门禁（仅本地调试用）
 *   window.PORTAL_LOGIN_URL    门户登录页地址，默认 '/index.html'
 */
(function () {
  try {
    if (window.PORTAL_AUTH_DISABLE === true) return;

    var KEY = 'portal_auth_session';
    var TTL = window.PORTAL_AUTH_TTL || (12 * 60 * 60 * 1000); // 12 小时
    var LOGIN_URL = window.PORTAL_LOGIN_URL || '/index.html';

    var raw = localStorage.getItem(KEY);
    var ok = false;
    if (raw) {
      try {
        var s = JSON.parse(raw);
        if (s && typeof s.ts === 'number' && (Date.now() - s.ts) < TTL) {
          ok = true;
        }
      } catch (e) { /* 解析失败视为未登录 */ }
    }

    if (!ok) {
      // 传相对路径（pathname + search + hash），与门户防开放重定向校验兼容
      var redir = encodeURIComponent(location.pathname + location.search + location.hash);
      location.replace(LOGIN_URL + '?redirect=' + redir);
    }
  } catch (e) {
    // 任何异常不阻塞应用，避免误伤
  }
})();
