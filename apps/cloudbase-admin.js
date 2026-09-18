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
    if (_busy) { toast('上一个同步操作还在进行中，请稍候', 'error'); return; }
    _busy = true;
    showProgress('⬇️ 下载云端数据');
    updateProgress(0, 0, '正在连接云端，请稍候…');

    // 路径 1：cloudbase-sync.js（orderschedule / wicketorders / purchase / incomeexpense 等）
    if (window.CloudbaseSync && typeof window.CloudbaseSync.pullAll === 'function') {
      try {
        var r = await window.CloudbaseSync.pullAll();
        if (r && r.ok && r.comparison) {
          var c = r.comparison;
          finishProgress(true, '✅ 版本对比完成');
          var msg = '云端数据对比结果：\n\n';
          msg += '云端更新：' + c.cloudNewerCount + ' 项\n';
          msg += '本地更新：' + c.localNewerCount + ' 项\n';
          msg += '版本相同：' + c.sameCount + ' 项\n';

          if (c.cloudNewerCount === 0) {
            toast('✅ 本地已是最新数据，无需下载');
            _busy = false;
            return;
          }
          msg += '\n是否用云端数据覆盖本地？\n（本地更新的数据不会被覆盖）';
          if (confirm(msg)) {
            var changed = window.CloudbaseSync.applyCloudRows(c.cloudNewer);
            toast('✅ 已从云端更新 ' + changed + ' 项数据，页面即将刷新…');
            setTimeout(function () { location.reload(); }, 800);
          } else {
            toast('已取消下载');
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
    if (_busy) { toast('上一个同步操作还在进行中，请稍候', 'error'); return; }

    // 二次确认（Excel 保存模式：上传会用本地数据覆盖云端）
    var vi = (window.CloudbaseSync && typeof window.CloudbaseSync.getVersionInfo === 'function')
      ? window.CloudbaseSync.getVersionInfo() : null;
    var verMsg = vi && vi.localNewest
      ? '\n本地最后修改：' + new Date(vi.localNewest).toLocaleString()
      : '';
    if (!window.confirm('确定要把本机数据上传到云端吗？\n\n云端对应数据将被本机数据覆盖。\n建议先"下载云端数据"备份。' + verMsg)) return;

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
    // 兼容层改为懒加载：此处不再拦截，doClear 内会 await ensureClient()

    showPasswordModal('🗑️ 彻底清空云端数据', '确认清空', function () {
      toast('⏳ 正在清空云端数据...');
      doClear();
    });

    async function doClear() {
      // 懒加载：确保云端兼容层已就绪（CloudbaseGetAccessToken 依赖它）
      try {
        if (window.CloudbaseSync && typeof window.CloudbaseSync.ensureClient === 'function') {
          await window.CloudbaseSync.ensureClient();
        }
      } catch (e) {}
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

  // ============================================================
  // 冻结页首工具条：保存 / 云端下载 / 备份到电脑 / 从电脑恢复
  // + 当前应用「本地 N · 云端 M」记录条数 + 清空云端（更多菜单）
  // 所有 7 个应用统一注入；页面内旧入口自动隐藏，避免重复。
  // ============================================================
  var BAR_H = 40;

  var KEY_LABELS = {
    orderRecords: '订单记录', paymentRecords: '收汇记录', exportRecords: '导出记录',
    receiptRecords: '收款记录', invoiceRecords: '发票记录', customerRecords: '客户',
    memoRecords: '备忘录', businessRecords: '业务记录', deliveryNoticeRecords: '发货通知',
    wage_records: '工资记录', wage_employees: '员工', wage_processes: '工序',
    wage_orders: '订单', wage_adjustments: '补贴',
    wage_dropdown_options: '下拉选项',
    wage_calendar_events: '日历事件', wage_calendar_event_types: '日历事件类型',
    transactions: '收支流水', currentCompany: '当前公司', currentCompany_statement: '对账单',
    reconciliation_transactions: '对账流水', reconciliation_params: '对账参数',
    todos: '待办事项', memo: '备忘录', calendarNotes: '日历备注', memos: '备忘录',
    production_orders_data: '生产订单',
    // saintysys（业务系统）
    styles: '款式', orders: '订单', fabrics: '面料', accessories: '辅料',
    samples: '样布', feedbacks: '客诉反馈', productions: '生产单', invoices: '发票',
    payments: '收款记录', collections: '集合', contacts: '联系人', customers: '客户',
    suppliers: '供应商', favoriteContacts: '常用联系人', washes: '水洗单', shippings: '出货单',
    maintFabrics: '面料维护', maintAccessories: '辅料维护',
    express_delivery_data_v2: '快递记录', pl_records_v1: '装箱记录',
    sht_sample_data_v2: '样衣单', sht_size_tables_v2: '尺寸表', sizeSheets: '尺寸单'
  };
  var COMPANY_LABELS = {
    company1: '公司1', company2: '公司2', companyA: '公司A', companyB: '公司B'
  };
  function keyLabel(k) {
    if (KEY_LABELS[k]) return KEY_LABELS[k];
    var m;
    if ((m = /^transactions_(.+)$/.exec(k))) return '收支流水（' + (COMPANY_LABELS[m[1]] || m[1]) + '）';
    if ((m = /^lastUpdated_(.+)$/.exec(k))) return '最后更新（' + (COMPANY_LABELS[m[1]] || m[1]) + '）';
    if ((m = /^(contracts|receipts|returns|purchaseOrders)_(.+)$/.exec(k))) return m[1] + '（' + (COMPANY_LABELS[m[2]] || m[2]) + '）';
    return String(k).replace(/^(orderschedule|wicketorders|wage|purchase|incomeexpense|stainlessbusiness|saintysys)_+/, '');
  }
  function getCounts() {
    try {
      if (window.CloudbaseSync && typeof window.CloudbaseSync.getRecordCounts === 'function') {
        return window.CloudbaseSync.getRecordCounts();
      }
      if (window.CloudbaseStore && typeof window.CloudbaseStore.getRecordCounts === 'function') {
        return window.CloudbaseStore.getRecordCounts();
      }
    } catch (e) {}
    return null;
  }

  var _bar = null, _cntPill = null, _cntPanel = null, _cntOpen = false, _moreMenu = null;

  function injectBarCSS() {
    if (document.getElementById('cbTopBarStyle')) return;
    var st = document.createElement('style');
    st.id = 'cbTopBarStyle';
    st.textContent =
      '#cbTopBar{position:fixed;top:0;left:0;right:0;height:' + BAR_H + 'px;z-index:99990;' +
      'display:flex;align-items:center;gap:8px;padding:0 12px;' +
      'background:#1f2937;box-shadow:0 1px 6px rgba(0,0,0,.3);' +
      'font-family:-apple-system,system-ui,"Microsoft YaHei",sans-serif;box-sizing:border-box;}' +
      '#cbTopBar *{box-sizing:border-box;}' +
      'html.cb-bar-on body{padding-top:' + BAR_H + 'px !important;}' +
      /* wicketorders：.full-width-container 自带的 padding-top:120px 会被 Tailwind CDN
         的 .py-6(24px) 同优先级覆盖，导致操作按钮行钻到 fixed 导航栏底下。
         顶栏下移 40 后仍需 120px 占位（80px 栏高 + 40px 间隙），此处强制恢复。 */
      'html.cb-bar-on:has(nav.top-nav) .full-width-container{padding-top:120px !important;}' +
      '#cbTopBar .cb-btn{height:28px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;' +
      'font-size:13px;color:#fff;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}' +
      '#cbTopBar .cb-btn:active{transform:translateY(1px);}' +
      '#cbBtnSave{background:#16a34a;} #cbBtnSave:hover{background:#15803d;}' +
      '#cbBtnPull{background:#2563eb;} #cbBtnPull:hover{background:#1d4ed8;}' +
      '.cb-btn-ghost{background:rgba(255,255,255,.12) !important;} .cb-btn-ghost:hover{background:rgba(255,255,255,.22) !important;}' +
      '#cbRight{margin-left:auto;display:flex;align-items:center;gap:8px;}' +
      '#cloudCountPill{display:flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:999px;' +
      'font-size:12px;color:#fff;background:rgba(156,163,175,.95);cursor:pointer;user-select:none;' +
      'font-variant-numeric:tabular-nums;white-space:nowrap;}' +
      '#cbMoreBtn{padding:0 10px !important;}' +
      '#cbMoreMenu{position:fixed;top:' + (BAR_H + 4) + 'px;right:12px;z-index:99991;display:none;' +
      'background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;}' +
      '#cbMoreMenu button{display:block;width:100%;padding:9px 18px;border:none;background:#fff;cursor:pointer;' +
      'font-size:13px;color:#dc2626;text-align:left;} #cbMoreMenu button:hover{background:#fef2f2;}' +
      '#cloudCountPanel{position:fixed;top:' + (BAR_H + 4) + 'px;right:56px;z-index:99991;display:none;' +
      'width:300px;max-width:86vw;max-height:60vh;overflow:auto;background:#fff;color:#1f2937;' +
      'border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-size:12px;' +
      'font-family:-apple-system,system-ui,"Microsoft YaHei",sans-serif;padding:8px 0;}' +
      '@media (max-width:640px){#cbTopBar{gap:5px;padding:0 6px;} #cbTopBar .cb-btn{padding:0 8px;font-size:12px;}}';
    document.head.appendChild(st);
  }

  function ensureTopBar() {
    if (_bar && _bar.parentNode) return;
    if (!document.body) return;
    injectBarCSS();
    document.documentElement.classList.add('cb-bar-on');

    var bar = document.createElement('div');
    bar.id = 'cbTopBar';
    bar.innerHTML =
      '<button id="cbBtnSave" class="cb-btn" title="把本机数据上传到云端（相当于 Excel 的保存）">💾 保存</button>' +
      '<button id="cbBtnPull" class="cb-btn" title="从云端下载数据（会先与本机对比）">⬇️ 云端下载</button>' +
      '<button id="cbBtnBackup" class="cb-btn cb-btn-ghost" title="把数据备份为 JSON 文件保存到本电脑">📥 备份到电脑</button>' +
      '<button id="cbBtnRestore" class="cb-btn cb-btn-ghost" title="从本电脑选择 JSON 备份文件恢复">📤 从电脑恢复</button>' +
      '<div id="cbRight">' +
        '<div id="cloudCountPill"><span id="cloudCountText">本地 … · 云端 …</span></div>' +
        '<button id="cbMoreBtn" class="cb-btn cb-btn-ghost" title="更多">更多 ▾</button>' +
      '</div>';
    document.body.appendChild(bar);
    _bar = bar;

    document.getElementById('cbBtnSave').addEventListener('click', function () {
      try { pushToCloud(); } catch (e) { toast('保存失败：' + (e && e.message ? e.message : e), 'error'); }
    });
    document.getElementById('cbBtnPull').addEventListener('click', function () {
      try { pullFromCloud(); } catch (e) { toast('下载失败：' + (e && e.message ? e.message : e), 'error'); }
    });
    document.getElementById('cbBtnBackup').addEventListener('click', doBackupToComputer);
    document.getElementById('cbBtnRestore').addEventListener('click', doRestoreFromComputer);

    _cntPill = document.getElementById('cloudCountPill');
    _cntPill.addEventListener('click', function (e) { e.stopPropagation(); toggleCountPanel(); });

    var panel = document.createElement('div');
    panel.id = 'cloudCountPanel';
    document.body.appendChild(panel);
    _cntPanel = panel;

    var more = document.createElement('div');
    more.id = 'cbMoreMenu';
    more.innerHTML = '<button id="cbBtnClear">🗑️ 清空云端数据</button>';
    document.body.appendChild(more);
    _moreMenu = more;
    document.getElementById('cbBtnClear').addEventListener('click', function () {
      more.style.display = 'none';
      try { clearCloudData(); } catch (e) {}
    });
    document.getElementById('cbMoreBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      more.style.display = more.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', function (e) {
      if (more.style.display === 'block' && !more.contains(e.target) &&
          !(e.target.closest && e.target.closest('#cbMoreBtn'))) {
        more.style.display = 'none';
      }
      if (_cntOpen && _cntPanel && !_cntPanel.contains(e.target) &&
          !(e.target.closest && e.target.closest('#cloudCountPill'))) {
        _cntOpen = false;
        _cntPanel.style.display = 'none';
      }
    });

    bumpFixedHeaders();
  }

  // 页面自身固定/吸顶导航条让出顶部 40px，避免被工具条遮挡。
  // 关键区分：
  //  - fixed 横栏（相对视口定位，如 wicketorders 顶部 nav）：top 由 0 改为 40px；
  //  - fixed 竖栏（如 wage 左侧侧边栏）：top 由 0 改为 40px，bottom 保持 0 自动缩短；
  //  - sticky 且在「页面级滚动」中吸顶：top 由 0 改为 40px；
  //  - sticky 但在「应用内部滚动容器」（如 purchase 的 main.overflow-y-auto）内吸顶：
  //    绝不能改 top —— sticky 元素视觉下移却不占据文档流，会把标签行下方的
  //    「新增/更多操作」按钮行盖住。容器本身已被 body padding-top 推到 40px 以下，
  //    sticky top:0 自然吸在工具条正下方。
  //  - bottom:0 的移动端底栏：不动（top/bottom 同时 !important 会把底栏拉飞）。
  var BUMP_SEL = 'header, nav, aside, [class*="header"], [class*="navbar"], [class*="topbar"], [class*="sidebar"], [class*="submenu"], [class*="tab-bar"], [class*="tabs-bar"]';

  function findInnerScrollParent(el) {
    var p = el.parentElement;
    while (p && p !== document.documentElement && p !== document.body) {
      var s = window.getComputedStyle(p);
      // 只要祖先链上存在 overflow 非 visible/clip 的滚动容器（含 hidden、
      // 即使当前内容不足一屏），sticky 就相对该容器而非视口吸顶，不能 bump。
      // 移动端样式会显式把 overflow 改回 visible，此时自然落到视口吸顶分支。
      if (/(auto|scroll|overlay|hidden)/.test(s.overflowY) && p.clientHeight > 0) return p;
      p = p.parentElement;
    }
    return null;
  }

  // 撤销曾施加的 top 修正（响应式切换后元素可能不再符合 bump 条件）
  function releaseBump(el) {
    if (el.getAttribute('data-cb-origtop') !== null) {
      el.style.removeProperty('top');
      el.removeAttribute('data-cb-origtop');
    }
  }

  function bumpOne(el) {
    if (el.id === 'cbTopBar' || (el.closest && (el.closest('#cbTopBar') || el.closest('table')))) return;
    var cs = window.getComputedStyle(el);
    var pos = cs.position;
    if (pos !== 'fixed' && pos !== 'sticky') { releaseBump(el); return; }

    var h = el.offsetHeight || 0, w = el.offsetWidth || 0;
    var vw = window.innerWidth, vh = window.innerHeight;
    var isWideBar = h >= 28 && h <= 120 && w >= vw * 0.55 && h <= vh * 0.5;
    var isTallRail = w <= 320 && h >= vh * 0.7;
    if (!isWideBar && !isTallRail) { releaseBump(el); return; }

    // 移动端底部导航（宽扁 + bottom:0）跳过；竖栏 top:0;bottom:0 贴满全高仍需下移
    if (isWideBar && cs.bottom !== 'auto' && Math.abs(parseFloat(cs.bottom) || 99) <= 1) { releaseBump(el); return; }

    var origTop = parseFloat(cs.top);
    if (!(origTop >= 0 && origTop <= 120)) { releaseBump(el); return; }   // 只处理顶部带内的栏

    // 内部滚动容器吸顶：不动（并撤销可能在其它断点下施加过的修正）
    if (pos === 'sticky' && findInnerScrollParent(el)) { releaseBump(el); return; }

    // 幂等：记录原始 top，重复执行（MutationObserver）时从原始值计算，不累加
    var stored = el.getAttribute('data-cb-origtop');
    var base = stored === null ? origTop : parseFloat(stored);
    if (stored === null) el.setAttribute('data-cb-origtop', String(origTop));
    el.style.setProperty('top', (base + BAR_H) + 'px', 'important');
  }

  function bumpFixedHeaders() {
    try {
      var nodes = document.querySelectorAll(BUMP_SEL);
      for (var i = 0; i < nodes.length; i++) bumpOne(nodes[i]);
    } catch (e) {}
    shrinkViewportShells();
  }

  // 内部滚动型应用（purchase / stainless React 等）：body 下直接挂着
  // 高 100vh 的应用壳（.flex.h-screen / #root 子元素），body padding-top 后
  // 壳顶部已下移 40px，但高度仍是 100vh → 底部溢出 40px、整页可多滚。
  // 仅当元素「自然高度恰为视口高」时把它修正为 100vh-40px（fixed/absolute 的
  // 全屏遮罩不动）；移动端媒体查询常把壳改为 height:auto（自然高≠视口高），
  // 此时必须跳过——若视口变化导致条件不再满足，还要撤销之前的修正。
  function shrinkViewportShells() {
    try {
      var fullH = window.innerHeight;
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.id === 'cbTopBar' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
        var cs = window.getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'absolute') continue;
        // 桌面内部滚动壳为 overflow:hidden；移动端媒体查询会改为 visible 恢复自然流，
        // 此时绝不锁高
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') {
          if (el.getAttribute('data-cb-shell') === '1') {
            el.style.removeProperty('height');
            el.style.removeProperty('min-height');
            el.removeAttribute('data-cb-shell');
          }
          continue;
        }
        var marked = el.getAttribute('data-cb-shell') === '1';
        if (marked) el.style.removeProperty('height');
        var natH = el.offsetHeight;
        if (natH >= fullH - 1 && natH <= fullH + 1) {
          el.setAttribute('data-cb-shell', '1');
          el.style.setProperty('height', 'calc(100vh - ' + BAR_H + 'px)', 'important');
          el.style.setProperty('height', 'calc(100dvh - ' + BAR_H + 'px)', 'important');
          var natMin = parseFloat(window.getComputedStyle(el).minHeight) || 0;
          if (natMin >= fullH - 1 && natMin <= fullH + 1) {
            el.style.setProperty('min-height', 'calc(100vh - ' + BAR_H + 'px)', 'important');
            el.style.setProperty('min-height', 'calc(100dvh - ' + BAR_H + 'px)', 'important');
          }
        } else if (marked) {
          el.removeAttribute('data-cb-shell');
          el.style.removeProperty('min-height');
        }
      }
    } catch (e) {}
  }

  // ===== 隐藏页面内旧的同步/备份入口（功能已收敛到页首工具条）=====
  var HIDE_SELECTORS = [
    '[onclick*="CloudAdmin.pullFromCloud"]', '[onclick*="CloudAdmin.pushToCloud"]', '[onclick*="CloudAdmin.clearCloudData"]',
    '[data-act="pull"]', '[data-act="push"]', '[data-act="clear"]',
    '#export-json', '#import-json',                                  // 收支表
    '#backup-dropdown-btn', '#export-data-btn', 'label[for="import-data-input"]', // 采购
    '[onclick*="backupData"]', '[onclick*="restoreData"]',           // 订单/外贸/工资
    '[onclick*="restoreFileInput"]',                                 // 工资恢复按钮
    '[onclick*="App.backupData"]',                                   // saintysys 首页
    '#panel-backup .backup-card',                                    // 工资设置页两张备份/恢复卡片
    '[onclick^="exportData()"]', '[onclick^="importData()"]'         // saintysys 设置页
  ];
  function hideLegacyControls() {
    try {
      for (var i = 0; i < HIDE_SELECTORS.length; i++) {
        var els = document.querySelectorAll(HIDE_SELECTORS[i]);
        for (var j = 0; j < els.length; j++) {
          var el2 = els[j];
          if (el2.closest && el2.closest('#cbTopBar')) continue;
          if (el2.getAttribute('data-cb-hidden') === '1') continue;
          el2.setAttribute('data-cb-hidden', '1');
          el2.style.setProperty('display', 'none', 'important');
        }
      }
      // 不锈钢应用的浮动按钮盒：三个按钮都被隐藏后，把整个盒子藏掉
      var floatBtns = document.querySelectorAll('[data-act]');
      floatBtns.forEach(function (b) {
        var box = b.parentElement;
        if (!box || box.getAttribute('data-cb-floatbox') === '1') return;
        var visibleBtn = false;
        Array.prototype.forEach.call(box.querySelectorAll('[data-act]'), function (x) {
          if (x.getAttribute('data-cb-hidden') !== '1') visibleBtn = true;
        });
        if (!visibleBtn) {
          box.setAttribute('data-cb-floatbox', '1');
          box.style.setProperty('display', 'none', 'important');
        }
      });
    } catch (e) {}
  }

  // ===== 备份到电脑 / 从电脑恢复：转发到各页面已有实现（格式兼容性最好）=====
  function clickIfExists(sel) {
    var el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }
  function clickByText(regex) {
    var nodes = document.querySelectorAll('button,a,li,span,div,[role="menuitem"]');
    var best = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest && el.closest('#cbTopBar')) continue;
      var t = (el.textContent || '').trim();
      if (!t || t.length > 12) continue;
      if (regex.test(t)) {
        // 优先选语义化的可点击元素
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'menuitem') { best = el; break; }
        if (!best) best = el;
      }
    }
    if (best) { best.click(); return true; }
    return false;
  }
  function doBackupToComputer() {
    try {
      if (clickIfExists('#export-json')) return;        // 收支表
      if (clickIfExists('#export-data-btn')) return;    // 采购
      if (window.App && typeof window.App.backupData === 'function') { window.App.backupData(); return; } // saintysys
      if (typeof window.backupData === 'function') { window.backupData(); return; } // 订单/外贸/工资
      if (typeof window.exportData === 'function') { window.exportData(); return; } // saintysys 设置页
      if (clickByText(/^(备份到电脑|备份数据|导出数据|导出所有数据)$/)) return; // 不锈钢 React 界面
      toast('未找到本页的备份功能');
    } catch (e) {
      toast('备份失败：' + (e && e.message ? e.message : e), 'error');
    }
  }
  function doRestoreFromComputer() {
    try {
      // 直接点隐藏的 file input：工具条点击本身是用户手势，文件选择框可正常弹出
      if (clickIfExists('#import-data-input')) return;  // 采购
      if (clickIfExists('#restoreFileInput')) return;   // 工资
      if (clickIfExists('#import-json')) return;        // 收支表
      if (typeof window.restoreData === 'function') { window.restoreData(); return; } // 订单/外贸
      if (typeof window.importData === 'function') { window.importData(); return; }   // saintysys 设置页
      if (clickByText(/^(从电脑恢复|恢复数据|导入数据)$/)) return; // 不锈钢 React 界面
      toast('本页没有可直接调用的恢复入口，请在应用内"数据管理/系统设置"中恢复');
    } catch (e) {
      toast('恢复失败：' + (e && e.message ? e.message : e), 'error');
    }
  }

  function toggleCountPanel() {
    _cntOpen = !_cntOpen;
    if (_cntPanel) _cntPanel.style.display = _cntOpen ? 'block' : 'none';
    renderCounts();
  }

  function renderCounts() {
    if (!_bar) return;
    var c = getCounts();
    if (!c) return;
    var text = document.getElementById('cloudCountText');
    if (text) {
      text.textContent = c.cloudLoaded
        ? ('本地 ' + c.localTotal + ' · 云端 ' + c.cloudTotal)
        : ('本地 ' + c.localTotal + ' · 云端 …');
    }
    var bg = 'rgba(156,163,175,.95)';
    if (c.cloudLoaded) bg = (c.localTotal === c.cloudTotal) ? 'rgba(16,185,129,.95)' : 'rgba(245,158,11,.96)';
    _cntPill.style.background = bg;

    if (_cntOpen && _cntPanel) {
      var html = '<div style="padding:2px 14px 8px;color:#6b7280;line-height:1.5;">'
        + '当前应用各数据集的记录条数。<br>不一致时点页首「保存」上传本机数据，或「云端下载」拉取云端数据。</div>'
        + '<table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;">'
        + '<tr style="color:#9ca3af;"><td style="padding:3px 14px;">数据集</td><td style="padding:3px 6px;text-align:right;">本地</td><td style="padding:3px 14px 3px 6px;text-align:right;">云端</td></tr>';
      (c.perKey || []).forEach(function (r) {
        var diff = c.cloudLoaded && r.local !== r.cloud;
        var color = diff ? '#d97706' : '#374151';
        html += '<tr>'
          + '<td style="padding:3px 14px;color:' + color + ';">' + keyLabel(r.key) + '</td>'
          + '<td style="padding:3px 6px;text-align:right;color:' + color + ';">' + r.local + '</td>'
          + '<td style="padding:3px 14px 3px 6px;text-align:right;color:' + color + ';">'
          + (r.cloud === null ? '…' : r.cloud) + '</td></tr>';
      });
      html += '<tr style="font-weight:600;border-top:1px solid #e5e7eb;">'
        + '<td style="padding:6px 14px;">合计</td>'
        + '<td style="padding:6px 6px;text-align:right;">' + c.localTotal + '</td>'
        + '<td style="padding:6px 14px 6px 6px;text-align:right;">' + (c.cloudLoaded ? c.cloudTotal : '…') + '</td></tr>';
      html += '</table>';
      _cntPanel.innerHTML = html;
    }
  }

  function startTopBar() {
    ensureTopBar();
    hideLegacyControls();
    renderCounts();
    // React/SPA（不锈钢）与延迟渲染的菜单需要反复收敛。
    // 统一防抖（500ms）：数据页重渲染/输入时 DOM 变动频繁，避免选择器扫描拖慢页面。
    var hideTimer = null, bumpTimer = null;
    var scheduleConverge = function () {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideLegacyControls, 500);
      clearTimeout(bumpTimer);
      bumpTimer = setTimeout(bumpFixedHeaders, 700);
    };
    var mo = null;
    try {
      mo = new MutationObserver(scheduleConverge);
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    setTimeout(function () { hideLegacyControls(); bumpFixedHeaders(); }, 400);
    setTimeout(function () { hideLegacyControls(); bumpFixedHeaders(); }, 1500);
    // 本地编辑会改变条数，定时刷新；云端数据到达时事件立即刷新
    setInterval(renderCounts, 2500);
    try {
      window.addEventListener('cloud-data-updated', function () { setTimeout(renderCounts, 50); });
      window.addEventListener('resize', bumpFixedHeaders);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) renderCounts(); });
    } catch (e) {}
  }
  if (document && document.body) startTopBar();
  else if (document) document.addEventListener('DOMContentLoaded', startTopBar);

  console.log('[CloudAdmin] 云端数据管理工具已就绪 (密码已配置)');
})();
