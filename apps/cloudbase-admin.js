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

  // ===== 下载：从云端拉取最新数据到本地（只下载，不上传） =====
  async function pullFromCloud() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，请稍后重试', 'error'); return; }

    toast('🔄 正在下载云端数据...');

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.pullAll === 'function') {
      try {
        var r = await window.CloudbaseSync.pullAll();
        if (r && r.ok) {
          toast(r.changed ? '✅ 下载完成，已更新本地数据' : '✅ 已是最新数据');
        } else {
          toast('下载失败：' + (r && r.msg ? r.msg : '未知错误'), 'error');
        }
      } catch (e) {
        toast('下载异常：' + (e && e.message ? e.message : e), 'error');
      }
      return;
    }

    // 路径 2：CloudbaseStore（wage / saintysys）
    if (window.CloudbaseStore) {
      var pullFn = window.CloudbaseStore.forceRefreshFromCloud || window.CloudbaseStore.refreshFromCloud;
      if (typeof pullFn === 'function') {
        try {
          var changed = await pullFn.call(window.CloudbaseStore);
          var n = Array.isArray(changed) ? changed.length : (changed ? 1 : 0);
          toast(n > 0 ? '✅ 下载完成，已更新 ' + n + ' 个数据集' : '✅ 已是最新数据');
          try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
          return;
        } catch (e) {
          toast('下载异常：' + (e && e.message ? e.message : e), 'error');
          return;
        }
      }
      // 兜底：重新 init
      try {
        if ('_initialized' in window.CloudbaseStore) window.CloudbaseStore._initialized = false;
        if ('_initPromise' in window.CloudbaseStore) window.CloudbaseStore._initPromise = null;
        await window.CloudbaseStore.init();
        toast('✅ 已从云端重新加载数据');
        try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
      } catch (e) {
        toast('下载异常：' + (e && e.message ? e.message : e), 'error');
      }
      return;
    }

    // 路径 3：兜底直接查表
    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      var n = result && result.data ? result.data.length : 0;
      if (result && result.error) {
        toast('下载失败：' + result.error.message, 'error');
      } else {
        toast('✅ 云端共 ' + n + ' 条数据，请刷新页面查看');
        try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
      }
    } catch (e) {
      toast('下载异常：' + (e && e.message ? e.message : e), 'error');
    }
  }

  // ===== 上传：把本机所有数据推送到云端（覆盖云端） =====
  async function pushToCloud() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，请稍后重试', 'error'); return; }

    // 二次确认
    if (!window.confirm('确定要把本机数据上传到云端吗？\n\n云端对应数据将被本机数据覆盖。\n建议先"下载云端数据"备份。')) return;

    toast('⏫ 正在上传本机数据到云端...');

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.pushAll === 'function') {
      try {
        var r = await window.CloudbaseSync.pushAll(true); // alsoDelete=true 清理云端残留
        if (r && r.ok) {
          toast('✅ 上传完成，共 ' + r.uploaded + ' 个数据集');
          try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-push' } })); } catch (e) {}
        } else {
          toast('上传失败：' + (r && r.msg ? r.msg : ('失败 ' + (r && r.failed ? r.failed : '?') + ' 个')), 'error');
        }
      } catch (e) {
        toast('上传异常：' + (e && e.message ? e.message : e), 'error');
      }
      return;
    }

    // 路径 2：CloudbaseStore（wage / saintysys）
    if (window.CloudbaseStore) {
      var pushFn = window.CloudbaseStore.forceSync || window.CloudbaseStore.pushAll;
      if (typeof pushFn === 'function') {
        try {
          var pr = await pushFn.call(window.CloudbaseStore, true);
          if (pr && pr.success) {
            toast('✅ 上传完成，共 ' + (pr.synced || pr.uploaded || '?') + ' 个数据集');
            try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-push' } })); } catch (e) {}
          } else {
            toast('上传失败：' + (pr && pr.message ? pr.message : '未知错误'), 'error');
          }
        } catch (e) {
          toast('上传异常：' + (e && e.message ? e.message : e), 'error');
        }
        return;
      }
    }

    toast('当前应用未实现上传接口', 'error');
  }

  // 兼容旧调用名（syncNow = 只下载）
  function syncNow() { return pullFromCloud(); }

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
  async function clearCloudData() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，无法清空', 'error'); return; }

    showPasswordModal('🗑️ 彻底清空云端数据', '确认清空', function () {
      toast('⏳ 正在清空云端数据...');
      doClear();
    });

    async function doClear() {
      // 1. 等认证就绪（避免无 token 导致请求挂起）
      if (typeof window.CloudbaseWhenReady === 'function') {
        try {
          console.log('[CloudAdmin] 等待认证就绪...');
          await Promise.race([
            window.CloudbaseWhenReady(),
            new Promise(function (_, rej) { setTimeout(function () { rej(new Error('认证等待超时(15s)')); }, 15000); })
          ]);
          console.log('[CloudAdmin] 认证就绪');
        } catch (e) {
          console.warn('[CloudAdmin] 认证未就绪，继续尝试:', e.message || e);
        }
      }

      // 2. 查所有行 id（兼容层会把 data jsonb 展开，row.id 即主键）
      console.log('[CloudAdmin] 查询 app_data_store 全表 id...');
      var rows;
      try {
        var r = await sb.from(TABLE).select('id');
        console.log('[CloudAdmin] select 返回:', r);
        if (r && r.error) {
          toast('查询失败：' + (r.error.message || r.error), 'error');
          return;
        }
        rows = (r && r.data) || [];
      } catch (e) {
        console.error('[CloudAdmin] select 异常:', e);
        toast('查询异常：' + (e && e.message ? e.message : e), 'error');
        return;
      }

      console.log('[CloudAdmin] 共 ' + rows.length + ' 行待删除');
      if (rows.length === 0) {
        var removed0 = clearLocalBusinessData();
        toast('✅ 云端已无数据（本地清理 ' + removed0 + ' 项），页面即将刷新...');
        setTimeout(function () { location.reload(); }, 1500);
        return;
      }

      // 3. 逐个按 id 删除（兼容层 DELETE 走 _fetchRows → 原生 db.delete().eq('id')）
      var okCount = 0, failCount = 0;
      for (var i = 0; i < rows.length; i++) {
        var rowId = rows[i] && (rows[i].id || rows[i]._id);
        if (!rowId) { console.warn('[CloudAdmin] 跳过无 id 行:', rows[i]); continue; }
        try {
          var dRes = await sb.from(TABLE).delete().eq('id', String(rowId));
          if (dRes && dRes.error) {
            console.warn('[CloudAdmin] 删除失败', rowId, ':', dRes.error.message || dRes.error);
            failCount++;
          } else {
            okCount++;
          }
        } catch (e) {
          console.warn('[CloudAdmin] 删除异常', rowId, ':', e && e.message ? e.message : e);
          failCount++;
        }
        // 每 10 行报告一次进度
        if ((i + 1) % 10 === 0 || i === rows.length - 1) {
          console.log('[CloudAdmin] 进度: ' + (i + 1) + '/' + rows.length + ' (成功 ' + okCount + ', 失败 ' + failCount + ')');
        }
      }

      console.log('[CloudAdmin] 完成: 成功 ' + okCount + ', 失败 ' + failCount);
      var removed = clearLocalBusinessData();
      if (failCount === 0) {
        toast('✅ 云端已清空 ' + okCount + ' 行（本地清理 ' + removed + ' 项），页面即将刷新...');
      } else {
        toast('⚠️ 清空部分完成：成功 ' + okCount + ', 失败 ' + failCount + '（本地清理 ' + removed + ' 项），页面即将刷新...', 'error');
      }
      setTimeout(function () { location.reload(); }, 1500);
    }
  }

  // ===== 暴露 API =====
  window.CloudAdmin = {
    pullFromCloud: pullFromCloud,
    pushToCloud: pushToCloud,
    syncNow: syncNow,           // 兼容旧调用名（= pullFromCloud）
    clearCloudData: clearCloudData
  };

  console.log('[CloudAdmin] 云端数据管理工具已就绪 (密码已配置)');
})();
