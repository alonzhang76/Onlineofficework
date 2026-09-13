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
  var REFRESH_INTERVAL = 30000; // 30 秒刷新一次
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
        return new URL('cloudbase/cloudbase.js', src).href;
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
    var beforeCount = Object.keys(cache).length;
    var ok = await loadAllFromCloud();
    if (!ok) return;
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
      var user = null;
      if (sb) {
        user = await waitAuth();
        await loadAllFromCloud();
      } else {
        cloudLoadDenied = true;
      }

      if (cloudLoadDenied) {
        setInterval(retryAuthAndReload, 30000);
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
      return;
    }

    try {
      var upResult = await sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
      if (upResult && upResult.error) {
        console.error('[CloudbaseSync] 云端写入失败:', key, upResult.error.message);
        pendingWrites[key] = { value: value, ts: Date.now() };
      }
    } catch (e) {
      console.warn('[CloudbaseSync] 同步异常:', key, e && e.message ? e.message : e);
      pendingWrites[key] = { value: value, ts: Date.now() };
    }
  }

  async function flushPending() {
    var keys = Object.keys(pendingWrites);
    if (keys.length === 0) return;
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
  }

  // ===== 从云端刷新 =====
  async function refreshFromCloud() {
    if (!sb || !initialized) return;

    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      if (!result.data || result.error) return;

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
