/* ===== 通用 CloudBase 数据同步层 cloudbase-sync.js =====
 *
 * 功能（与原 supabase-sync.js 完全对齐，仅底层切换到腾讯云开发 CloudBase）：
 *   1. 动态加载共享 CloudBase 兼容层（apps/cloudbase/cloudbase.js）
 *   2. 用共享账号静默登录（authenticated 角色，可读写；失败回退匿名只读）
 *   3. 拦截 localStorage 读写，实时同步到 CloudBase app_data_store 表
 *   4. 定时从云端拉取最新数据，更新本地缓存
 *   5. 首次加载时自动迁移 localStorage 中的已有数据到云端
 *
 * 使用方式（与旧版一致，把脚本名换成 cloudbase-sync.js）：
 *   <script>window.SUPABASE_APP_ID='orderschedule';</script>
 *   <script src="../cloudbase-sync.js"></script>
 * （新代码也可用 window.CLOUDBASE_APP_ID，二者等价）
 *
 * 数据表：app_data_store（与 saintysys/wage 共用同一个 CloudBase 环境）
 *   PG 存储形态：{ id: store_key, data: { store_key, payload, updated_at } }
 *   store_key: 应用前缀 + 原始key（如 orderschedule__orders）
 *
 * 注意：此脚本必须在应用主逻辑之前加载。
 */
(function () {
  'use strict';

  // ===== 配置 =====
  var APP_ID = window.CLOUDBASE_APP_ID || window.SUPABASE_APP_ID || 'default';
  var TABLE = 'app_data_store';
  var REFRESH_INTERVAL = 8000; // 8 秒刷新一次（更快感知另一端的更新）
  var SKIP_WRITE_WINDOW = 10000; // 10 秒内自己写入的 key 跳过云端覆盖

  // 专用数据同步账号（authenticated 角色）。
  // CloudBase PG 模式中匿名(anon)角色默认只有 SELECT，写操作会被 RLS 拒绝，
  // 因此所有无登录表单的应用统一用此账号静默登录。
  // ⚠️ 需在 CloudBase 控制台「身份认证 → 用户管理」中创建该邮箱账号并设置密码，
  //    并在「登录方式」中开启「邮箱登录」与「匿名登录」（匿名用于只读兜底）。
  //    可通过 window.CLOUDBASE_SYNC_ACCOUNT 在页面内覆盖。
  var SYNC_ACCOUNT = window.CLOUDBASE_SYNC_ACCOUNT || {
    email: 'sync@lori.app',
    password: 'LoriSync2026!'
  };

  // ===== 状态 =====
  var sb = null;
  var clientReady = false;
  var cache = {};       // 内存缓存：原始key → 值
  var cacheTs = {};     // 每个 key 的云端 updated_at
  var initialized = false;
  var initPromise = null;
  var recentWrites = {}; // 记录本地写入时间，防止云端旧数据覆盖
  var authedUser = null;   // 当前认证用户（共享账号或匿名）
  var authFailReason = ''; // 认证失败原因（用于手机端可见提示）

  // ===== 手机端可见的云端同步状态徽标 =====
  var badgeEl = null;
  function ensureBadge() {
    if (badgeEl) return badgeEl;
    try {
      if (!document || !document.body) return null;
    } catch (e) { return null; }
    var el = document.createElement('div');
    el.id = '__cb_sync_badge';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;padding:6px 10px;border-radius:14px;font-size:12px;line-height:1.4;font-family:-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);max-width:80vw;word-break:break-all;cursor:pointer;-webkit-tap-highlight-color:transparent;';
    el.addEventListener('click', function () {
      if (el.getAttribute('data-state') === 'error') {
        location.reload();
      } else {
        el.style.display = 'none';
      }
    });
    document.body.appendChild(el);
    badgeEl = el;
    return el;
  }
  function showSyncStatus(state, msg) {
    try {
      var el = ensureBadge();
      if (!el) return;
      el.setAttribute('data-state', state);
      el.style.display = 'block';
      if (state === 'ok') {
        el.style.background = 'rgba(16,185,129,0.92)';
        el.style.color = '#fff';
        el.textContent = '☁️ 云端已连接';
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
      } else if (state === 'warn') {
        el.style.background = 'rgba(245,158,11,0.95)';
        el.style.color = '#fff';
        el.textContent = '⚠️ 云端未连接（仅本机数据）' + (msg ? '：' + msg : '') + ' 点击刷新重试';
      } else {
        el.style.background = 'rgba(239,68,68,0.95)';
        el.style.color = '#fff';
        el.textContent = '❌ 云端数据被拒绝（账号/权限问题） 点击刷新';
      }
    } catch (e) {}
  }
  var badgeBound = false;
  function bindBadgeWhenReady() {
    if (badgeBound) return;
    badgeBound = true;
    function showByState() {
      if (authedUser && !cloudLoadDenied) {
        showSyncStatus('ok');
      } else if (authedUser && cloudLoadDenied) {
        showSyncStatus('error');
      } else {
        showSyncStatus('warn', authFailReason || '无登录会话');
      }
    }
    if (document && document.body) {
      showByState();
    } else if (document && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', showByState);
      window.addEventListener('load', showByState);
    }
  }

  // 跳过同步的内部 key
  var SKIP_KEYS = ['_lastLocalSave_', 'isLoggedIn', 'username', 'userPhone', 'sb-', 'tcb_', 'supabase', 'reconciliation_', '__purchaseContract'];

  // ===== 应用专属 localStorage 键名重映射（与旧版保持一致）=====
  var LOCAL_KEY_REMAP = (function () {
    if (APP_ID === 'stainlessbusiness') {
      // 不锈钢业务的通讯录/收藏联系人和服装系统同名，改用 sb_ 前缀存储
      return { contacts: 'sb_contacts', favoriteContacts: 'sb_favoriteContacts' };
    }
    return {};
  })();
  var REMAP_REVERSE = (function () {
    var r = {};
    for (var k in LOCAL_KEY_REMAP) {
      if (Object.prototype.hasOwnProperty.call(LOCAL_KEY_REMAP, k)) {
        r[LOCAL_KEY_REMAP[k]] = k;
      }
    }
    return r;
  })();
  var REMAP_ORIGINALS = (function () {
    var s = {};
    for (var k in LOCAL_KEY_REMAP) {
      if (Object.prototype.hasOwnProperty.call(LOCAL_KEY_REMAP, k)) s[k] = true;
    }
    return s;
  })();
  function toLocalKey(key) { return LOCAL_KEY_REMAP[key] || key; }

  function shouldSkip(key) {
    for (var i = 0; i < SKIP_KEYS.length; i++) {
      if (key.indexOf(SKIP_KEYS[i]) >= 0) return true;
    }
    return false;
  }

  function isEmptyValue(val) {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') {
      if (val === '') return true;
      try { val = JSON.parse(val); } catch (e) { return false; }
    }
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') {
      for (var k in val) {
        if (Object.prototype.hasOwnProperty.call(val, k)) return false;
      }
      return true;
    }
    return false;
  }

  function prefixKey(key) { return APP_ID + '__' + key; }
  function unprefixKey(storeKey) {
    var prefix = APP_ID + '__';
    if (storeKey && storeKey.indexOf(prefix) === 0) return storeKey.substring(prefix.length);
    return null;
  }

  // ===== 保存原始 localStorage 方法（补丁打在 Storage.prototype 上）=====
  var _lsInstance = window.localStorage;
  var _StorageProto = Object.getPrototypeOf(_lsInstance);
  var _origGetItem = _StorageProto.getItem;
  var _origSetItem = _StorageProto.setItem;
  var _origRemoveItem = _StorageProto.removeItem;

  var RESERVED_KEYS = ['getItem', 'setItem', 'removeItem', 'key', 'clear', 'length'];
  function isReservedKey(key) {
    return RESERVED_KEYS.indexOf(key) >= 0;
  }

  function nativeGet(k) { return _origGetItem.call(_lsInstance, k); }
  function nativeSet(k, v) { return _origSetItem.call(_lsInstance, k, v); }

  // ===== 动态加载共享 CloudBase 兼容层 =====
  // 兼容层相对路径固定为 apps/cloudbase/cloudbase.js，
  // 依据本脚本自身 URL 推导，避免不同目录深度引用时路径出错。
  function resolveModuleUrl() {
    try {
      var src = (document.currentScript && document.currentScript.src) || '';
      if (src) {
        // 本文件位于 apps/cloudbase-sync.js，兼容层位于 apps/cloudbase/cloudbase.js
        // 沿用本文件 ?v= 版本号，避免兼容层更新后浏览器仍用旧缓存
        var v = (src.match(/[?&]v=([^&]+)/) || [])[1];
        return new URL('cloudbase/cloudbase.js' + (v ? '?v=' + v : ''), src).href;
      }
    } catch (e) {}
    return 'cloudbase/cloudbase.js';
  }

  async function loadClient() {
    // 必须在 import 前设置共享账号，兼容层初始化（bootstrapAuth）时读取
    window.CLOUDBASE_SYNC = SYNC_ACCOUNT;
    try {
      var mod = await import(/* @vite-ignore */ resolveModuleUrl());
      sb = (mod && mod.supabase) || window.supabase || null;
      clientReady = !!sb;
      return sb;
    } catch (e) {
      console.error('[CloudbaseSync] 兼容层加载失败:', e && e.message ? e.message : e);
      authFailReason = 'CloudBase 模块加载失败';
      return null;
    }
  }

  // 等待认证态稳定（共享账号登录或匿名登录完成）
  async function waitAuth() {
    if (!sb) return null;
    // 兼容层 auth.getUser 在未登录时返回错误；登录完成后返回用户
    var tries = 0;
    while (tries < 30) {
      try {
        var result = await sb.auth.getUser();
        if (result && result.data && result.data.user) {
          authedUser = result.data.user;
          authFailReason = '';
          return authedUser;
        }
      } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 500); });
      tries++;
    }
    authFailReason = authFailReason || '共享账号登录未就绪（仅匿名只读）';
    return null;
  }

  var cloudLoadDenied = false;
  var reauthTried = false; // 每轮会话失效只强制重登一次，避免频繁登录触发风控

  // ===== 拉取全量数据到缓存 =====
  async function loadAllFromCloud() {
    if (!sb) return false;
    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      if (result.error) {
        console.error('[CloudbaseSync] 云端加载失败:', result.error.message || result.error);
        cloudLoadDenied = true;
        return false;
      }
      var rows = result.data || [];
      var n = 0;
      rows.forEach(function (row) {
        var origKey = unprefixKey(row.store_key);
        if (origKey && cache[origKey] === undefined) {
          cache[origKey] = row.payload;
          cacheTs[origKey] = row.updated_at;
          n++;
        }
      });
      cloudLoadDenied = false;
      console.log('[CloudbaseSync] 加载', rows.length, '行，新增入缓存', n, '个（缓存共', Object.keys(cache).length, '个）');
      return true;
    } catch (e) {
      console.warn('[CloudbaseSync] 云端加载异常:', e && e.message ? e.message : e);
      cloudLoadDenied = true;
      return false;
    }
  }

  async function retryAuthAndReload() {
    if (!cloudLoadDenied) return;
    console.log('[CloudbaseSync] 重试：重新拉取云端数据...');
    // 首次重试前强制重登一次（会话失效场景下单纯重拉不会成功）
    if (!reauthTried && window.CloudbaseForceReauth) {
      reauthTried = true;
      try { await window.CloudbaseForceReauth(); } catch (e) {}
    }
    var beforeCount = Object.keys(cache).length;
    var ok = await loadAllFromCloud();
    if (!ok) return;
    reauthTried = false;
    var changedKeys = [];
    Object.keys(cache).forEach(function (origKey) {
      try {
        var newVal = cache[origKey];
        var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
        var localK = toLocalKey(origKey);
        if (nativeGet(localK) !== raw) {
          nativeSet(localK, raw);
          changedKeys.push(origKey);
        }
      } catch (e) {}
    });
    if (Object.keys(cache).length > beforeCount) changedKeys = Object.keys(cache);
    showSyncStatus('ok');
    try { await migrateLocalStorage(); } catch (e) {}
    if (changedKeys.length > 0) {
      window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys, initial: true } }));
    }
  }

  // ===== 初始化 =====
  async function init() {
    if (initialized) return true;
    if (initPromise) return initPromise;

    initPromise = (async function () {
      console.log('[CloudbaseSync] 初始化，应用前缀:', APP_ID);

      await loadClient();
      // 等兼容层登录引导结束（无 token 时拉取/写入只会 FetchError）
      if (window.CloudbaseWhenReady) {
        try { await window.CloudbaseWhenReady(); } catch (e) {}
      }
      var user = null;
      if (sb) {
        user = await waitAuth();
        await loadAllFromCloud();
      } else {
        cloudLoadDenied = true;
      }

      if (cloudLoadDenied) {
        notifyStatus('offline');
        setInterval(retryAuthAndReload, 30000);
      } else {
        notifyStatus('idle');
      }
      bindBadgeWhenReady();

      await migrateLocalStorage();

      setInterval(refreshFromCloud, REFRESH_INTERVAL);
      setInterval(flushPending, 10000);

      window.addEventListener('online', function () {
        flushPending();
        refreshFromCloud();
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          flushPending();
          refreshFromCloud();
        }
      });
      window.addEventListener('beforeunload', flushPending);
      window.addEventListener('offline', function () { notifyStatus('offline'); });

      initialized = true;
      console.log('[CloudbaseSync] 就绪。应用:', APP_ID, '用户:', user ? (user.email || user.id || 'authed') : 'none');

      try {
        var allKeys = Object.keys(cache);
        if (allKeys.length > 0) {
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: allKeys, initial: true } }));
        }
      } catch (e) {}

      return true;
    })();

    return initPromise;
  }

  // ===== 迁移 localStorage → CloudBase =====
  async function migrateLocalStorage() {
    try {
      // 本地键名重映射搬迁
      var remapKeys = Object.keys(LOCAL_KEY_REMAP);
      for (var rk = 0; rk < remapKeys.length; rk++) {
        var orig = remapKeys[rk];
        var localK = LOCAL_KEY_REMAP[orig];
        var oldRaw = nativeGet(orig);
        var newRaw = nativeGet(localK);
        if (oldRaw !== null && oldRaw !== '' && (newRaw === null || newRaw === '')) {
          nativeSet(localK, oldRaw);
          console.log('[CloudbaseSync] 本地键迁移:', orig, '→', localK);
        }
      }

      var existing = {};
      try {
        var result = await sb.from(TABLE).select('store_key, payload');
        if (!result.error && result.data) {
          result.data.forEach(function (row) { existing[row.store_key] = row.payload; });
        }
      } catch (e) {}

      var migrated = 0, rescued = 0;
      var nativeKeys = Object.keys(localStorage);
      for (var i = 0; i < nativeKeys.length; i++) {
        var nativeKey = nativeKeys[i];
        if (isReservedKey(nativeKey)) continue;

        var key;
        if (REMAP_REVERSE[nativeKey] !== undefined) {
          key = REMAP_REVERSE[nativeKey];
        } else if (REMAP_ORIGINALS[nativeKey]) {
          continue;
        } else {
          key = nativeKey;
        }

        if (shouldSkip(key)) continue;

        var prefixedKey = prefixKey(key);
        var raw = nativeGet(nativeKey);
        var localVal;
        try { localVal = (raw === null || raw === undefined) ? undefined : JSON.parse(raw); } catch (e) { localVal = raw; }

        if (existing[prefixedKey] !== undefined) {
          var cloudVal = existing[prefixedKey];
          var cloudEmpty = isEmptyValue(cloudVal);
          var localEmpty = isEmptyValue(localVal);

          if (cloudEmpty && !localEmpty) {
            try {
              var rescueResult = await sb.from(TABLE).upsert({
                store_key: prefixedKey,
                payload: localVal,
                updated_at: new Date().toISOString()
              }, { onConflict: 'store_key' });
              if (!rescueResult.error) {
                cache[key] = localVal;
                rescued++;
              } else {
                console.error('[CloudbaseSync] 抢救上传失败:', key, rescueResult.error.message);
              }
            } catch (e) {}
            continue;
          }

          if (!cloudEmpty) {
            var rawC = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
            if (nativeGet(nativeKey) !== rawC) {
              nativeSet(nativeKey, rawC);
            }
            cache[key] = cloudVal;
            cacheTs[key] = new Date().toISOString();
            delete pendingWrites[key];
          }
          continue;
        }

        if (raw === null || raw === undefined || raw === '') continue;

        try {
          var upsertResult = await sb.from(TABLE).upsert({
            store_key: prefixedKey,
            payload: localVal,
            updated_at: new Date().toISOString()
          }, { onConflict: 'store_key' });
          if (!upsertResult.error) {
            cache[key] = localVal;
            migrated++;
          } else {
            console.error('[CloudbaseSync] 迁移上传失败:', key, upsertResult.error.message);
          }
        } catch (e) {}
      }
      if (migrated > 0) console.log('[CloudbaseSync] 迁移', migrated, '个 key 到云端');
      if (rescued > 0) console.log('[CloudbaseSync] 抢救', rescued, '个本地 key（云端为空）');
    } catch (e) {
      console.warn('[CloudbaseSync] 迁移异常:', e && e.message ? e.message : e);
    }
  }

  // ===== 同步到云端 =====
  var pendingWrites = {};

  async function syncToCloud(key, value) {
    recentWrites[key] = Date.now();

    if (!sb || !initialized) {
      pendingWrites[key] = { value: value, ts: Date.now() };
      notifyStatus('pending');
      return;
    }

    notifyStatus('pending');
    try {
      var upResult = await sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
      if (upResult && upResult.error) {
        console.error('[CloudbaseSync] 云端写入失败:', key, upResult.error.message);
        pendingWrites[key] = { value: value, ts: Date.now() };
        notifyStatus('error');
      } else {
        // 单条上传成功；若没有其它挂起写入，置为 idle
        if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');
      }
    } catch (e) {
      console.warn('[CloudbaseSync] 同步异常:', key, e && e.message ? e.message : e);
      pendingWrites[key] = { value: value, ts: Date.now() };
      notifyStatus('error');
    }
  }

  function notifyStatus(state) {
    try {
      if (window.CloudSyncStatus && typeof window.CloudSyncStatus.setState === 'function') {
        window.CloudSyncStatus.setState(state);
      }
    } catch (e) {}
  }

  async function flushPending() {
    var keys = Object.keys(pendingWrites);
    if (keys.length === 0) return;
    notifyStatus('pending');
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = pendingWrites[key];
      var value = entry && entry.value !== undefined ? entry.value : entry;
      delete pendingWrites[key];

      if (entry && entry.ts && cacheTs[key]) {
        try {
          if (new Date(entry.ts) < new Date(cacheTs[key])) continue;
        } catch (e) {}
      }

      if (isEmptyValue(value)) {
        var raw = nativeGet(toLocalKey(key));
        var cur;
        try { cur = (raw === null || raw === undefined) ? undefined : JSON.parse(raw); } catch (e) { cur = raw; }
        if (!isEmptyValue(cur)) continue;
      }
      await syncToCloud(key, value);
    }
    // 整批重试完成后，若仍无挂起写入则置为 idle
    if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');
    else notifyStatus('error');
  }

  // ===== 从云端刷新 =====
  async function refreshFromCloud() {
    if (!sb || !initialized) return;

    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      if (!result.data || result.error) {
        // 网络或权限错误：若没有挂起写入，标记 offline
        if (Object.keys(pendingWrites).length === 0) notifyStatus('offline');
        return;
      }
      // 刷新成功：若没有挂起写入则标记 idle
      if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');

      var now = Date.now();
      var changedKeys = [];

      result.data.forEach(function (row) {
        var origKey = unprefixKey(row.store_key);
        if (!origKey) return;
        if (recentWrites[origKey] && now - recentWrites[origKey] < SKIP_WRITE_WINDOW) return;

        var newVal = row.payload;
        var oldVal = cache[origKey];

        var isChanged = false;
        if (oldVal === undefined) {
          isChanged = true;
        } else {
          try {
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) isChanged = true;
          } catch (e) { isChanged = true; }
        }

        if (isChanged) {
          cache[origKey] = newVal;
          cacheTs[origKey] = row.updated_at;
          var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
          nativeSet(toLocalKey(origKey), raw);
          changedKeys.push(origKey);
        }
      });

      if (changedKeys.length > 0) {
        console.log('[CloudbaseSync] 云端更新:', changedKeys.join(', '));
        window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys } }));
      }
    } catch (e) {
      console.warn('[CloudbaseSync] 刷新异常:', e && e.message ? e.message : e);
      if (Object.keys(pendingWrites).length === 0) notifyStatus('offline');
    }
  }

  // ===== 拦截 localStorage（Storage.prototype 补丁；sessionStorage 透传）=====
  _StorageProto.getItem = function (key) {
    if (this === _lsInstance) {
      if (cache[key] !== undefined) {
        var val = cache[key];
        return typeof val === 'string' ? val : JSON.stringify(val);
      }
      return _origGetItem.call(this, toLocalKey(key));
    }
    return _origGetItem.call(this, key);
  };

  _StorageProto.setItem = function (key, value) {
    if (this === _lsInstance) {
      _origSetItem.call(this, toLocalKey(key), value);

      try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }

      if (!shouldSkip(key)) {
        syncToCloud(key, cache[key]);
      }
      return;
    }
    return _origSetItem.call(this, key, value);
  };

  _StorageProto.removeItem = function (key) {
    if (this === _lsInstance) {
      _origRemoveItem.call(this, toLocalKey(key));
      delete cache[key];
      delete cacheTs[key];
      recentWrites[key] = Date.now();

      if (sb && initialized && !shouldSkip(key)) {
        sb.from(TABLE).delete().eq('store_key', prefixKey(key)).then(function () {});
      }
      return;
    }
    return _origRemoveItem.call(this, key);
  };

  // 暴露状态供调试
  window.CloudbaseSync = {
    appId: APP_ID,
    isReady: function () { return initialized; },
    cache: cache,
    reload: retryAuthAndReload
  };

  // ===== 启动 =====
  init();
})();

/* ===== CloudSyncStatus 指示灯模块（在激活的 Tab 按钮内嵌彩色圆点）=====
 * 状态: idle(绿,已同步) / pending(黄,上传中) / error(红,上传失败) / offline(灰,未连接)
 * 由各同步层调用 window.CloudSyncStatus.setState(state) 切换状态
 * 自动注入 .__cs_dot 到当前激活的 tab/nav 元素中（支持多种 selector）
 */
(function () {
  if (window.CloudSyncStatus && window.CloudSyncStatus._initd) return;

  var STATES = {
    idle:    { color: '#10b981', text: '已同步',  title: '云端同步完成' },
    pending: { color: '#f59e0b', text: '上传中',  title: '正在上传到云端…' },
    error:   { color: '#ef4444', text: '上传失败', title: '上传失败，正在重试…' },
    offline: { color: '#9ca3af', text: '未连接',  title: '云端未连接' }
  };
  var currentState = 'idle';
  var fallbackEl = null;

  function injectCSS() {
    if (document.getElementById('__cs_style')) return;
    var css = document.createElement('style');
    css.id = '__cs_style';
    css.textContent = [
      '.__cs_dot {',
      '  display:inline-block; width:8px; height:8px; border-radius:50%;',
      '  margin-left:6px; vertical-align:middle; background:#10b981;',
      '  box-shadow:0 0 4px rgba(16,185,129,0.6);',
      '  transition:background .3s, box-shadow .3s; pointer-events:none;',
      '}',
      '.__cs_dot.__cs_pending { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,.7); animation:__cs_pulse 1.2s infinite; }',
      '.__cs_dot.__cs_error   { background:#ef4444; box-shadow:0 0 6px rgba(239,68,68,.7);  animation:__cs_pulse .8s infinite; }',
      '.__cs_dot.__cs_offline { background:#9ca3af; box-shadow:none; }',
      '@keyframes __cs_pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }',
      '.__cs_fallback_badge {',
      '  position:fixed; right:8px; bottom:8px; z-index:99998;',
      '  display:inline-flex; align-items:center; gap:4px;',
      '  padding:4px 8px; border-radius:12px;',
      '  font:11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '  color:#fff; background:rgba(16,185,129,.92);',
      '  box-shadow:0 2px 8px rgba(0,0,0,.25);',
      '  -webkit-tap-highlight-color:transparent;',
      '}',
      '.__cs_fallback_badge.__cs_pending { background:rgba(245,158,11,.95); }',
      '.__cs_fallback_badge.__cs_error   { background:rgba(239,68,68,.95); cursor:pointer; pointer-events:auto; }',
      '.__cs_fallback_badge.__cs_offline { background:rgba(156,163,175,.95); }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(css);
  }

  // 合并为一次 querySelectorAll（逗号分隔的选择器）
  var TAB_SELECTOR = '.nav-tab.active, .nav-item.active, .sidebar-menu-item.active, .nav-link.active, .company-btn.bg-primary, .ant-tabs-tab-active, [role="tab"][aria-selected="true"]';

  function findActiveTabs() {
    try {
      var list = document.querySelectorAll(TAB_SELECTOR);
      var arr = [];
      for (var i = 0; i < list.length; i++) arr.push(list[i]);
      return arr;
    } catch (e) { return []; }
  }

  // rAF 节流：合并短时间内多次调用，避免频繁 DOM 查询
  var _rafId = null;
  function scheduleRefresh() {
    if (_rafId !== null) return;
    _rafId = (window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })(function () {
      _rafId = null;
      try { refreshDots(); } catch (e) {}
    });
  }

  function refreshDots() {
    var tabs = findActiveTabs();
    var tabSet = new Set(tabs);
    var stateClass = '__cs_' + currentState;
    var title = STATES[currentState].title;

    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var dot = tab.querySelector('.__cs_dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = '__cs_dot ' + stateClass;
        tab.appendChild(dot);
      } else {
        dot.className = '__cs_dot ' + stateClass;
      }
      dot.title = title;
    }

    // 清理非激活 tab 上的残留圆点
    var allDots = document.querySelectorAll('.__cs_dot');
    for (var k = 0; k < allDots.length; k++) {
      var parent = allDots[k].parentElement;
      if (parent && !tabSet.has(parent)) {
        parent.removeChild(allDots[k]);
      }
    }

    // 找不到任何激活 tab 时，回退为右下角徽标
    if (tabs.length === 0) {
      ensureFallback();
    } else if (fallbackEl) {
      fallbackEl.style.display = 'none';
    }
  }

  function ensureFallback() {
    if (fallbackEl) {
      fallbackEl.style.display = 'inline-flex';
      fallbackEl.className = '__cs_fallback_badge __cs_' + currentState;
      fallbackEl.innerHTML = '<span class="__cs_dot __cs_' + currentState + '"></span>' + STATES[currentState].text;
      fallbackEl.title = STATES[currentState].title;
      return;
    }
    if (!document || !document.body) return;
    fallbackEl = document.createElement('div');
    fallbackEl.className = '__cs_fallback_badge __cs_' + currentState;
    fallbackEl.innerHTML = '<span class="__cs_dot __cs_' + currentState + '"></span>' + STATES[currentState].text;
    fallbackEl.title = STATES[currentState].title;
    fallbackEl.addEventListener('click', function () {
      if (currentState === 'error' || currentState === 'offline') {
        try { location.reload(); } catch (e) {}
      }
    });
    document.body.appendChild(fallbackEl);
  }

  function setState(state) {
    if (!STATES[state]) state = 'idle';
    currentState = state;
    scheduleRefresh();
    try { window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: { state: state } })); } catch (e) {}
  }

  function startAutoRefresh() {
    // 每 3 秒刷新一次（足够跟上 tab 切换，避免频繁 DOM 查询）
    // 注意：不使用 MutationObserver 监听整个 body，大表格页面会导致严重卡顿
    setInterval(scheduleRefresh, 3000);
  }

  function boot() {
    try { injectCSS(); refreshDots(); startAutoRefresh(); } catch (e) {}
  }

  if (document && document.body) {
    boot();
  } else if (document) {
    document.addEventListener('DOMContentLoaded', boot);
    window.addEventListener('load', boot);
  }

  window.CloudSyncStatus = {
    _initd: true,
    setState: setState,
    getState: function () { return currentState; },
    refresh: refreshDots
  };
})();
