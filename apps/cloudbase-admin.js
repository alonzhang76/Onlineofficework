/* ===== CloudBase 云端数据管理工具 cloudbase-admin.js =====
 *
 * 提供两个手动干预入口（登录后主页面按钮调用）：
 *   CloudAdmin.syncNow()         → 强制从云端拉取全量数据 + flush 待推队列
 *   CloudAdmin.clearCloudData()  → 弹密码输入框 → 删除 app_data_store 全表 →
 *                                   清本地业务数据 + LWW 时间戳（保留 auth 会话）→ 重载
 *
 * 兼容两种同步层：
 *   - window.CloudbaseSync  （cloudbase-sync.js，orderschedule / wicketorders）
 *   - window.CloudbaseStore （cloudbase-store.js，wage / saintysys）
 *
 * 注意：clearCloudData 清空的是结构化数据表 app_data_store，
 *       云存储文件桶（cfb.js 管理的图片 / PDF 等）完全不受影响。
 */
(function () {
  'use strict';

  // 管理密码（与 orderschedule 现有 CORRECT_PASSWORD 一致，可被全局变量覆盖）
  var ADMIN_PASSWORD = window.CLOUD_ADMIN_PASSWORD || '2601';
  var TABLE = 'app_data_store';

  // ===== Toast 兼容层 =====
  function toast(msg, type) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (window.App && typeof window.App.toast === 'function') { window.App.toast(msg, type || 'info'); return; }
      if (window.UI && typeof window.UI.toast === 'function') { window.UI.toast(msg, type || 'info'); return; }
    } catch (e) {}
    console.log('[CloudAdmin]', type ? '[' + type + ']' : '', msg);
  }

  // ===== 获取 supabase 兼容客户端 =====
  function getClient() {
    return window.supabase || null;
  }

  // ===== 密码输入弹窗 =====
  function showPasswordModal(title, confirmLabel, onConfirm) {
    // 移除已有弹窗
    var existing = document.getElementById('cloudAdminModal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'cloudAdminModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;padding:24px 28px;border-radius:10px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    box.innerHTML = ''
      + '<div style="font-size:16px;font-weight:600;margin-bottom:10px;color:#1f2937;">' + title + '</div>'
      + '<div style="font-size:13px;color:#6b7280;margin-bottom:14px;line-height:1.5;">此操作将清空所有应用（orderschedule / wicketorders / wage / saintysys / 小程序）共享的结构化数据，不影响云存储文件。清空后需重新录入数据。</div>'
      + '<input type="password" id="cloudAdminPwd" placeholder="请输入管理密码" autocomplete="off" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;margin-bottom:16px;box-sizing:border-box;outline:none;">'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button id="cloudAdminCancel" style="padding:7px 16px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:14px;color:#374151;">取消</button>'
        + '<button id="cloudAdminConfirm" style="padding:7px 16px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;">' + confirmLabel + '</button>'
      + '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var pwdInput = document.getElementById('cloudAdminPwd');
    if (pwdInput) pwdInput.focus();

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function confirm() {
      var pwd = pwdInput ? pwdInput.value : '';
      if (!pwd) { toast('请输入密码', 'error'); return; }
      if (pwd !== ADMIN_PASSWORD) {
        toast('密码错误', 'error');
        if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
        return;
      }
      close();
      onConfirm();
    }

    document.getElementById('cloudAdminCancel').onclick = close;
    document.getElementById('cloudAdminConfirm').onclick = confirm;
    if (pwdInput) {
      pwdInput.onkeydown = function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); confirm(); }
        if (e.key === 'Escape' || e.keyCode === 27) { close(); }
      };
    }
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
  }

  // ===== 强制同步 =====
  function syncNow() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，请稍后重试', 'error'); return; }

    toast('🔄 正在同步云端数据...');

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.refresh === 'function') {
      window.CloudbaseSync.refresh().then(function () {
        if (typeof window.CloudbaseSync.flush === 'function') {
          window.CloudbaseSync.flush();
        }
        toast('✅ 同步完成，已拉取最新云端数据');
        try {
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-sync' } }));
        } catch (e) {}
      }).catch(function (e) {
        toast('同步失败：' + (e && e.message ? e.message : e), 'error');
      });
      return;
    }

    // 路径 2：CloudbaseStore（wage / saintysys）
    if (window.CloudbaseStore && typeof window.CloudbaseStore.init === 'function') {
      // 重置初始化标记，强制重新拉取
      try {
        if ('_initialized' in window.CloudbaseStore) window.CloudbaseStore._initialized = false;
        if ('_initPromise' in window.CloudbaseStore) window.CloudbaseStore._initPromise = null;
      } catch (e) {}
      window.CloudbaseStore.init().then(function (ok) {
        if (ok) {
          toast('✅ 同步完成，已加载云端数据');
        } else {
          toast('同步未完成，请检查网络', 'error');
        }
        try {
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-sync' } }));
        } catch (e) {}
      }).catch(function (e) {
        toast('同步失败：' + (e && e.message ? e.message : e), 'error');
      });
      return;
    }

    // 路径 3：兜底直接查表
    try {
      sb.from(TABLE).select('store_key, payload, updated_at').then(function (result) {
        var n = result && result.data ? result.data.length : 0;
        if (result && result.error) {
          toast('同步失败：' + result.error.message, 'error');
        } else {
          toast('✅ 同步完成，云端共 ' + n + ' 条数据，请刷新页面查看');
          try {
            window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-sync' } }));
          } catch (e) {}
        }
      }).catch(function (e) {
        toast('同步异常：' + (e && e.message ? e.message : e), 'error');
      });
    } catch (e) {
      toast('同步异常：' + (e && e.message ? e.message : e), 'error');
    }
  }

  // ===== 清空本地业务数据（保留 auth 会话） =====
  function clearLocalBusinessData() {
    // 需要保留的 auth / 会话键前缀或全名
    var PRESERVE = [
      'sb-',          // supabase auth token
      'tcb_',         // cloudbase auth token
      'supabase',     // supabase 配置
      'isLoggedIn', 'username', 'userPhone', 'userRole', 'currentUserId', 'refDPR',
      '__purchaseContract',
      '_lastLocalSave_',
      'reconciliation_'
    ];

    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      var preserve = false;
      for (var j = 0; j < PRESERVE.length; j++) {
        if (k.indexOf(PRESERVE[j]) >= 0) { preserve = true; break; }
      }
      if (!preserve) toRemove.push(k);
    }
    // 确保 LWW 时间戳被清空（即使上面没覆盖到）
    if (toRemove.indexOf('__cb_meta__') < 0) toRemove.push('__cb_meta__');
    if (toRemove.indexOf('__wage_meta__') < 0) toRemove.push('__wage_meta__');

    var removed = 0;
    toRemove.forEach(function (k) {
      try { localStorage.removeItem(k); removed++; } catch (e) {}
    });
    console.log('[CloudAdmin] 本地已清理', removed, '个 key');
    return removed;
  }

  // ===== 彻底清空云端数据 =====
  function clearCloudData() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，无法清空', 'error'); return; }

    showPasswordModal('🗑️ 彻底清空云端数据', '确认清空', function () {
      toast('⏳ 正在清空云端数据...');

      // 删除 app_data_store 全表所有行
      // 用 neq 绕过部分 SDK "delete 需 filter" 的限制
      sb.from(TABLE).delete().neq('store_key', '___never_match___').then(function (result) {
        if (result && result.error) {
          toast('清空失败：' + (result.error.message || result.error), 'error');
          return;
        }

        var removed = clearLocalBusinessData();

        toast('✅ 云端数据已清空（本地清理 ' + removed + ' 项），页面即将刷新...');
        // 稍等让 toast 显示，再重载
        setTimeout(function () { location.reload(); }, 1200);
      }).catch(function (e) {
        toast('清空异常：' + (e && e.message ? e.message : e), 'error');
      });
    });
  }

  // ===== 暴露 API =====
  window.CloudAdmin = {
    syncNow: syncNow,
    clearCloudData: clearCloudData
  };

  console.log('[CloudAdmin] 云端数据管理工具已就绪 (密码已配置)');
})();
