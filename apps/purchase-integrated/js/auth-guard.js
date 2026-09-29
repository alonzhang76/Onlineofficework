/* ==========================================================
   采购一体化系统 · 页面访问守卫（参考 saintysys / auth-guard 模式）
   职责：模块页加载前的同步预检 ——
     1) 无本地会话            → 跳转 login.html
     2) 会话用户已被删除/停用 → 清会话并跳转 login.html
   后续细粒度校验（模块权限、用户资料刷新）由 common.js 的 initPage() 完成。
   引入顺序：js/common.js → js/auth-guard.js
   ========================================================== */
(function () {
  'use strict';
  function toLogin() {
    try { sessionStorage.removeItem('pis_session'); } catch (e) { /* 忽略 */ }
    location.replace('login.html');
  }
  var raw = null;
  try { raw = sessionStorage.getItem('pis_session'); } catch (e) { /* 忽略 */ }
  if (!raw) { toLogin(); return; }
  var sess = null;
  try { sess = JSON.parse(raw); } catch (e) { sess = null; }
  if (!sess || !sess.id) { toLogin(); return; }
  // 会话用户在本地用户表中必须仍存在且未停用（防止删除/停用后残留会话）
  var users = [];
  try { users = JSON.parse(localStorage.getItem('pis_users') || '[]'); if (!Array.isArray(users)) users = []; } catch (e) { users = []; }
  var cur = users.find(function (x) { return x && x.id === sess.id; });
  if (!cur || cur.active === false) { toLogin(); return; }
  // 同步刷新会话为最新用户资料（角色/姓名可能已被管理员调整）
  try { sessionStorage.setItem('pis_session', JSON.stringify(cur)); } catch (e) { /* 忽略 */ }
})();
