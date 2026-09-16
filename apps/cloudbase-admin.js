/* ===== CloudBase 云端数据管理工具 cloudbase-admin.js =====
 *
 * 提供两个手动干预入口（登录后主页面按钮调用）：
 *   CloudAdmin.syncNow()         → 强制从云端拉取全量数据 + flush 待推队列；
 *                                  若本地数据有更新，提示后自动刷新整页显示最新数据
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

  // ===== 防重复操作 =====
  var _busy = false;

  // ===== 进度弹窗（上传/下载可见进度，用户无需打开控制台） =====
  var _progEl = null;
  function ensureProgressEl() {
    if (_progEl && _progEl.parentNode) return _progEl;
    var overlay = document.createElement('div');
    overlay.id = 'cloudAdminProgress';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.45);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;padding:22px 26px;border-radius:12px;width:320px;max-width:88vw;box-shadow:0 20px 60px rgba(0,0,0,0.35);text-align:center;';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    _progEl = overlay;
    return overlay;
  }
  function showProgress(title) {
    var overlay = ensureProgressEl();
    var card = overlay.firstChild;
    card.innerHTML = ''
      + '<div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:14px;">' + title + '</div>'
      + '<div style="height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-bottom:10px;">'
      +   '<div id="cloudAdminBarFill" style="height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:999px;transition:width .18s ease;"></div>'
      + '</div>'
      + '<div id="cloudAdminCount" style="font-size:13px;color:#4b5563;font-variant-numeric:tabular-nums;">准备中…</div>'
      + '<div id="cloudAdminNote" style="font-size:12px;color:#9ca3af;margin-top:6px;min-height:16px;word-break:break-all;"></div>';
    return overlay;
  }
  function updateProgress(current, total, note) {
    if (!_progEl) return;
    var fill = document.getElementById('cloudAdminBarFill');
    var count = document.getElementById('cloudAdminCount');
    var noteEl = document.getElementById('cloudAdminNote');
    if (fill) fill.style.width = (total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0) + '%';
    if (count) count.textContent = total > 0 ? (current + ' / ' + total) : '处理中…';
    if (noteEl) noteEl.textContent = note || '';
  }
  function finishProgress(ok, msg) {
    if (!_progEl) return;
    var fill = document.getElementById('cloudAdminBarFill');
    var count = document.getElementById('cloudAdminCount');
    var noteEl = document.getElementById('cloudAdminNote');
    if (fill) {
      fill.style.width = '100%';
      fill.style.background = ok ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f87171)';
    }
    if (count) count.textContent = ok ? '✅ 完成' : '⚠️ 未全部完成';
    if (noteEl) noteEl.textContent = msg || '';
    var el = _progEl;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (_progEl === el) _progEl = null;
    }, 2500);
  }

  /**
   * 下载成功且本地数据确有更新：完成提示后自动刷新整页，
   * 让那些没有监听 cloud-data-updated 事件、或缓存了旧数据的页面
   * 在重新加载时直接渲染最新数据（与"清空云端后自动刷新"的交互一致）。
   * 仅在手动"下载云端数据"且数据发生变化时调用；"已是最新数据"不刷新，
   * 下载是手动触发的，刷新不会形成循环。
   */
  function finishProgressAndReload(msg) {
    finishProgress(true, msg);
    toast(msg);
    setTimeout(function () {
      try { window.location.reload(); }
      catch (e) { window.location.href = window.location.href; }
    }, 1300);
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
    if (_busy) { toast('上一个同步操作还在进行中，请稍候', 'error'); return; }
    _busy = true;
    showProgress('⬇️ 下载云端数据');
    updateProgress(0, 0, '正在连接云端，请稍候…');

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.pullAll === 'function') {
      try {
        var r = await window.CloudbaseSync.pullAll();
        if (r && r.ok) {
          if (r.changed) {
            // 有新数据落本地：自动刷新一次，确保页面渲染最新数据
            finishProgressAndReload('✅ 下载完成，页面即将自动刷新…');
          } else {
            var freshMsg = '✅ 已是最新数据';
            finishProgress(true, freshMsg);
            toast(freshMsg);
          }
        } else {
          var errMsg = '下载失败：' + (r && r.msg ? r.msg : '未知错误');
          finishProgress(false, errMsg);
          toast(errMsg, 'error');
        }
      } catch (e) {
        var exMsg = '下载异常：' + (e && e.message ? e.message : e);
        finishProgress(false, exMsg);
        toast(exMsg, 'error');
      }
      _busy = false;
      return;
    }

    // 路径 2：CloudbaseStore（wage / saintysys）
    if (window.CloudbaseStore) {
      var pullFn = window.CloudbaseStore.forceRefreshFromCloud || window.CloudbaseStore.refreshFromCloud;
      if (typeof pullFn === 'function') {
        try {
          var changed = await pullFn.call(window.CloudbaseStore);
          var n = Array.isArray(changed) ? changed.length : (changed ? 1 : 0);
          if (n > 0) {
            finishProgressAndReload('✅ 下载完成，已更新 ' + n + ' 个数据集，页面即将刷新…');
          } else {
            var freshMsg2 = '✅ 已是最新数据';
            finishProgress(true, freshMsg2);
            toast(freshMsg2);
          }
          try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
        } catch (e) {
          var exMsg2 = '下载异常：' + (e && e.message ? e.message : e);
          finishProgress(false, exMsg2);
          toast(exMsg2, 'error');
        }
        _busy = false;
        return;
      }
      // 兜底：重新 init
      try {
        if ('_initialized' in window.CloudbaseStore) window.CloudbaseStore._initialized = false;
        if ('_initPromise' in window.CloudbaseStore) window.CloudbaseStore._initPromise = null;
        await window.CloudbaseStore.init();
        finishProgressAndReload('✅ 已从云端重新加载数据，页面即将刷新…');
        try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
      } catch (e) {
        var exMsg3 = '下载异常：' + (e && e.message ? e.message : e);
        finishProgress(false, exMsg3);
        toast(exMsg3, 'error');
      }
      _busy = false;
      return;
    }

    // 路径 3：兜底直接查表
    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      var n3 = result && result.data ? result.data.length : 0;
      if (result && result.error) {
        var errMsg3 = '下载失败：' + result.error.message;
        finishProgress(false, errMsg3);
        toast(errMsg3, 'error');
      } else {
        finishProgressAndReload('✅ 云端共 ' + n3 + ' 条数据，页面即将刷新…');
        try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-pull' } })); } catch (e) {}
      }
    } catch (e) {
      var exMsg4 = '下载异常：' + (e && e.message ? e.message : e);
      finishProgress(false, exMsg4);
      toast(exMsg4, 'error');
    }
    _busy = false;
  }

  // ===== 上传：把本机所有数据推送到云端（覆盖云端） =====
  async function pushToCloud() {
    var sb = getClient();
    if (!sb) { toast('同步层未就绪，请稍后重试', 'error'); return; }
    if (_busy) { toast('上一个同步操作还在进行中，请稍候', 'error'); return; }

    // 二次确认
    if (!window.confirm('确定要把本机数据上传到云端吗？\n\n云端对应数据将被本机数据覆盖。\n建议先"下载云端数据"备份。')) return;

    _busy = true;
    showProgress('⏫ 上传本机数据到云端');
    updateProgress(0, 0, '正在收集本地数据…');

    // 进度回调：cloudbase-sync.js / cloudbase-store.js 的 pushAll 均支持
    var lastCur = 0, lastTotal = 0;
    function onProg(p) {
      if (!p) return;
      if (p.phase === 'start') {
        updateProgress(0, p.total, '开始上传…');
      } else if (p.phase === 'reauth') {
        updateProgress(lastCur, lastTotal, '登录态已失效，正在重新登录…');
      } else if (p.phase === 'cleanup') {
        updateProgress(p.current, p.total, '清理云端残留…');
      } else if (p.phase === 'progress') {
        lastCur = p.current; lastTotal = p.total;
        updateProgress(p.current, p.total, (p.ok === false ? '⚠ ' : '') + (p.key || ''));
      }
    }

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.pushAll === 'function') {
      try {
        var r = await window.CloudbaseSync.pushAll(true, onProg); // alsoDelete=true 清理云端残留
        if (r && r.ok) {
          var okMsg = '✅ 上传完成，共 ' + r.uploaded + ' 个数据集';
          finishProgress(true, okMsg);
          toast(okMsg);
          try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-push' } })); } catch (e) {}
        } else {
          var errMsg = '上传失败：' + (r && r.msg ? r.msg : ('失败 ' + (r && r.failed ? r.failed : '?') + ' 个'));
          finishProgress(false, errMsg);
          toast(errMsg, 'error');
        }
      } catch (e) {
        var exMsg = '上传异常：' + (e && e.message ? e.message : e);
        finishProgress(false, exMsg);
        toast(exMsg, 'error');
      }
      _busy = false;
      return;
    }

    // 路径 2：CloudbaseStore（wage / saintysys）
    if (window.CloudbaseStore) {
      var pushFn = window.CloudbaseStore.forceSync || window.CloudbaseStore.pushAll;
      if (typeof pushFn === 'function') {
        try {
          var pr = await pushFn.call(window.CloudbaseStore, true, onProg);
          // 兼容两种返回契约：cloudbase-sync.js 用 {success, synced, message}，
          // cloudbase-store.js pushAll 用 {ok, uploaded, failed, msg}
          if (pr && (pr.success || pr.ok)) {
            var okMsg2 = '✅ 上传完成，共 ' + (pr.synced || pr.uploaded || '?') + ' 个数据集';
            finishProgress(true, okMsg2);
            toast(okMsg2);
            try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { source: 'manual-push' } })); } catch (e) {}
          } else {
            var errMsg2 = '上传失败：' + (pr && (pr.message || pr.msg) ? (pr.message || pr.msg) : '未知错误');
            finishProgress(false, errMsg2);
            toast(errMsg2, 'error');
          }
        } catch (e) {
          var exMsg2 = '上传异常：' + (e && e.message ? e.message : e);
          finishProgress(false, exMsg2);
          toast(exMsg2, 'error');
        }
        _busy = false;
        return;
      }
    }

    finishProgress(false, '当前应用未实现上传接口');
    toast('当前应用未实现上传接口', 'error');
    _busy = false;
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
      // 0. 立刻停掉本页同步层的在途自动上传，避免删除间隙把数据又 upsert 回去。
      //    purchase 数据键多、编辑频繁，在途上传是"清空后数据复活"的主要原因之一。
      try {
        if (window.CloudbaseSync && typeof window.CloudbaseSync.prepareForCloudClear === 'function') {
          window.CloudbaseSync.prepareForCloudClear();
        }
      } catch (e) {}
      // 跨本次 reload 抑制自动回灌：reload 后的新页面首轮 autoUpload 看到该标记会跳过。
      try { sessionStorage.setItem('__cb_cloud_cleared_at__', String(Date.now())); } catch (e) {}

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

      // 2. 优先用 rdb REST 整表删除（最可靠）；失败再回退兼容层逐行删除。
      var total = 0, verifiedEmpty = false, cloudErr = '';
      try {
        var dr = await deleteAllViaRest();
        total = dr.total || 0;
        verifiedEmpty = !!dr.empty;
        cloudErr = dr.error || '';
        console.log('[CloudAdmin] REST 删除完成，删除前约', total, '行，校验云端为空 =', verifiedEmpty, cloudErr || '');
      } catch (e) {
        cloudErr = e && e.message ? e.message : String(e);
        console.warn('[CloudAdmin] REST 删除异常，回退 SDK 逐行删除:', cloudErr);
      }

      // 3. REST 不可用时的回退：兼容层逐行删除
      if (!verifiedEmpty) {
        try {
          var fb = await deleteAllViaCompat(cloudErr);
          total = total || fb.total || 0;
          verifiedEmpty = !!fb.empty;
          cloudErr = fb.error || '';
        } catch (e) {
          cloudErr = (cloudErr ? cloudErr + '；' : '') + (e && e.message ? e.message : String(e));
        }
      }

      // 4. 删除后必须校验云端确为空，否则绝不清本地（避免本机唯一数据副本被误删）
      if (!verifiedEmpty) {
        var msg = '⚠️ 云端数据未能清空：' + (cloudErr || '删除后仍能查到数据（可能是账号无 DELETE 权限或网络失败）。本地数据已保留，请重试。');
        try { sessionStorage.removeItem('__cb_cloud_cleared_at__'); } catch (e) {}
        finishProgress(false, msg);
        toast(msg, 'error');
        return;
      }

      var removed = clearLocalBusinessData();
      toast('✅ 云端已清空（本地清理 ' + removed + ' 项），页面即将刷新...');
      setTimeout(function () { location.reload(); }, 1500);
    }

    // 直接走 CloudBase rdb REST：先 count 行数 → 整表 DELETE → 重新查询校验为空。
    // 绕过 SDK delete().eq() 在部分网关下"返回成功但未真正删除"的问题。
    async function deleteAllViaRest() {
      var env = window.CLOUDBASE_ENV;
      var token = null;
      if (typeof window.CloudbaseGetAccessToken === 'function') {
        token = await window.CloudbaseGetAccessToken();
      }
      if (!env || !token) throw new Error('无法获取访问令牌（登录态未就绪）');
      var base = 'https://' + env + '.api.tcloudbasegateway.com/v1/rdb/rest/' + TABLE;
      var authHeaders = function () {
        return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
      };

      // 4.1 删除前计数
      var total = 0;
      try {
        var cr = await fetch(base + '?select=id', { method: 'GET', headers: authHeaders() });
        if (!cr.ok) throw new Error('查询被拒 HTTP ' + cr.status + ' ' + (await cr.text()).slice(0, 200));
        var cj = await cr.json();
        total = Array.isArray(cj) ? cj.length : (cj && Array.isArray(cj.data) ? cj.data.length : 0);
      } catch (e) {
        throw new Error('删除前查询失败：' + (e && e.message ? e.message : e));
      }

      // 4.2 整表删除：id 为非空 text 主键，id != '' 命中全部业务行
      if (total > 0) {
        var dr = await fetch(base + '?id=neq.', {
          method: 'DELETE',
          headers: Object.assign({ 'Prefer': 'return=minimal' }, authHeaders())
        });
        if (!dr.ok) {
          throw new Error('整表 DELETE 被拒 HTTP ' + dr.status + ' ' + (await dr.text()).slice(0, 200));
        }
      }

      // 4.3 删除后校验
      var empty = await verifyTableEmpty(base, authHeaders);
      if (!empty) {
        // 兜底：逐个 id 删除一次
        var rr = await fetch(base + '?select=id', { method: 'GET', headers: authHeaders() });
        var rj = await rr.json();
        var remain = Array.isArray(rj) ? rj : (rj && Array.isArray(rj.data) ? rj.data : []);
        for (var i = 0; i < remain.length; i++) {
          var rid = remain[i] && (remain[i].id || remain[i]._id);
          if (!rid) continue;
          var one = await fetch(base + '?id=eq.' + encodeURIComponent(String(rid)), {
            method: 'DELETE',
            headers: Object.assign({ 'Prefer': 'return=minimal' }, authHeaders())
          });
          if (!one.ok) console.warn('[CloudAdmin] 逐个删除失败', rid, one.status);
        }
        empty = await verifyTableEmpty(base, authHeaders);
      }
      return { total: total, empty: empty, error: empty ? '' : '删除后仍有残留行' };
    }

    async function verifyTableEmpty(base, authHeaders) {
      try {
        // 最多复查 3 次（网关可能有短暂延迟）
        for (var t = 0; t < 3; t++) {
          var r = await fetch(base + '?select=id', { method: 'GET', headers: authHeaders() });
          if (!r.ok) { await new Promise(function (res) { setTimeout(res, 600); }); continue; }
          var j = await r.json();
          var rows = Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
          if (rows.length === 0) return true;
          await new Promise(function (res) { setTimeout(res, 600); });
        }
        return false;
      } catch (e) {
        console.warn('[CloudAdmin] 删除后校验异常:', e && e.message ? e.message : e);
        return false;
      }
    }

    // 回退方案：兼容层逐行 select id → delete，删除后再查一次确认
    async function deleteAllViaCompat(prevErr) {
      var r = await sb.from(TABLE).select('id');
      if (r && r.error) throw new Error((prevErr ? prevErr + '；' : '') + '查询失败：' + (r.error.message || r.error));
      var rows = (r && r.data) || [];
      var failCount = 0;
      for (var i = 0; i < rows.length; i++) {
        var rowId = rows[i] && (rows[i].id || rows[i]._id);
        if (!rowId) continue;
        try {
          var dRes = await sb.from(TABLE).delete().eq('id', String(rowId));
          if (dRes && dRes.error) failCount++;
        } catch (e) { failCount++; }
      }
      var v = await sb.from(TABLE).select('id');
      var remain = (v && v.data) || [];
      return {
        total: rows.length,
        empty: remain.length === 0,
        error: remain.length === 0 ? '' : ((prevErr ? prevErr + '；' : '') + '逐行删除后仍剩 ' + remain.length + ' 行（失败 ' + failCount + '）')
      };
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
