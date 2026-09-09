/* ===== 通用 Supabase 数据同步层 supabase-sync.js =====
 *
 * 功能：
 *   1. 自动加载 Supabase 客户端（CDN UMD，无需 npm）
 *   2. 自动匿名登录（用户无感知，无需登录表单）
 *   3. 拦截 localStorage 读写，实时同步到 Supabase app_data_store 表
 *   4. 定时从云端拉取最新数据，更新本地缓存
 *   5. 首次加载时自动迁移 localStorage 中的已有数据到云端
 *
 * 使用方式：
 *   <script>window.SUPABASE_APP_ID='orderschedule';</script>
 *   <script src="supabase-sync.js"></script>
 *
 * 数据表：app_data_store（与 clothing/wage 共用）
 *   - store_key: 应用前缀 + 原始key（如 orderschedule__orders）
 *   - payload: jsonb 数据内容
 *   - updated_at: 最后更新时间
 *
 * 注意：此脚本必须在应用主逻辑之前加载
 */
(function () {
  'use strict';

  // ===== 配置 =====
  var SUPABASE_URL = 'https://ugoyacuagslqhqguxyqe.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnb3lhY3VhZ3NscWhxZ3V4eXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI5NTUsImV4cCI6MjEwMjUwODk1NX0._GdWOGWblSpOYm3y8f_d3aVQszfn2YbRjHN0FqZiLtI';
  var APP_ID = window.SUPABASE_APP_ID || 'default';
  var TABLE = 'app_data_store';
  var REFRESH_INTERVAL = 30000; // 30 秒刷新一次
  var SKIP_WRITE_WINDOW = 10000; // 10 秒内自己写入的 key 跳过云端覆盖

  // ===== 状态 =====
  var sb = null;
  var cache = {};       // 内存缓存：原始key → 值
  var cacheTs = {};     // 每个 key 的云端 updated_at
  var initialized = false;
  var initPromise = null;
  var recentWrites = {}; // 记录本地写入时间，防止云端旧数据覆盖

  // 跳过同步的内部 key
  var SKIP_KEYS = ['_lastLocalSave_', 'isLoggedIn', 'username', 'userPhone', 'sb-', 'supabase'];

  // ===== 应用专属 localStorage 键名重映射 =====
  // 某些应用与其他应用共用同源 localStorage，键名冲突会导致本地数据互相覆盖。
  // 这里仅重映射 localStorage（原生存储）的键名，内存缓存与云端 store_key 仍使用原始键名，
  // 因此云端数据不受影响。
  var LOCAL_KEY_REMAP = (function () {
    if (APP_ID === 'stainlessbusiness') {
      // 不锈钢业务的通讯录/收藏联系人和服装系统(clothing)同名，改用 sb_ 前缀存储
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
  // 被重映射的原始键名集合（这些原始名若出现在原生 localStorage 中，属于其他应用，应跳过）
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

  // 判断值是否为"空"（空数组 / 空对象 / 空字符串 / null / undefined）
  // 用于迁移时的冲突仲裁，防止云端或本地的过期空值覆盖真实数据
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
    if (storeKey.indexOf(prefix) === 0) return storeKey.substring(prefix.length);
    return null;
  }

  // ===== 保存原始 localStorage 方法 =====
  var _origGetItem = localStorage.getItem.bind(localStorage);
  var _origSetItem = localStorage.setItem.bind(localStorage);
  var _origRemoveItem = localStorage.removeItem.bind(localStorage);

  // ===== 加载 Supabase 客户端（UMD CDN） =====
  function loadSupabase() {
    return new Promise(function (resolve) {
      if (window.supabase && window.supabase.auth) {
        resolve(window.supabase);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async = true;
      script.onload = function () {
        setTimeout(function () {
          try {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
              sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
              });
              window.supabase = sb;
            } else if (typeof window.createClient === 'function') {
              sb = window.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
              });
              window.supabase = sb;
            }
          } catch (e) {
            console.error('[SupabaseSync] createClient error:', e);
          }
          resolve(sb);
        }, 500);
      };
      script.onerror = function () {
        // 尝试备用 CDN
        var script2 = document.createElement('script');
        script2.src = 'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script2.async = true;
        script2.onload = script.onload;
        script2.onerror = function () {
          console.error('[SupabaseSync] All CDN loads failed');
          resolve(null);
        };
        document.head.appendChild(script2);
      };
      document.head.appendChild(script);
    });
  }

  // ===== 匿名登录 =====
  async function ensureAuth() {
    if (!sb || !sb.auth) return null;
    try {
      var result = await sb.auth.getUser();
      if (result.data && result.data.user) return result.data.user;
      // 尝试匿名登录
      var anonResult = await sb.auth.signInAnonymously();
      if (anonResult.data && anonResult.data.user) {
        console.log('[SupabaseSync] Anonymous auth OK');
        return anonResult.data.user;
      }
      if (anonResult.error) {
        console.warn('[SupabaseSync] Anonymous auth failed:', anonResult.error.message);
        // 如果匿名登录不可用，尝试用固定邮箱登录（匿名登录的回退方案）
        try {
          var signInResult = await sb.auth.signInWithPassword({
            email: 'guest@stainless.app',
            password: 'guest2026'
          });
          if (signInResult.data && signInResult.data.user) {
            console.log('[SupabaseSync] Guest auth OK');
            return signInResult.data.user;
          }
        } catch (e2) {
          console.warn('[SupabaseSync] Guest auth also failed:', e2.message);
        }
      }
      return null;
    } catch (e) {
      console.warn('[SupabaseSync] Auth error:', e);
      return null;
    }
  }

  // ===== 初始化 =====
  async function init() {
    if (initialized) return true;
    if (initPromise) return initPromise;

    initPromise = (async function () {
      console.log('[SupabaseSync] Initializing for app:', APP_ID);

      sb = await loadSupabase();
      if (!sb) {
        console.error('[SupabaseSync] Supabase client load failed, using localStorage only');
        return false;
      }

      var user = await ensureAuth();

      // 从云端加载所有数据
      try {
        var result = await sb.from(TABLE).select('store_key, payload, updated_at');
        if (result.data && !result.error) {
          result.data.forEach(function (row) {
            var origKey = unprefixKey(row.store_key);
            if (origKey && cache[origKey] === undefined) {
              cache[origKey] = row.payload;
              cacheTs[origKey] = row.updated_at;
            }
          });
          console.log('[SupabaseSync] Loaded', Object.keys(cache).length, 'keys from cloud');
          // 云端键建立属性访问器（保证 localStorage.key 属性式读写可走缓存）
          ensureAccessorsForKeys(Object.keys(cache));
        }
      } catch (e) {
        console.warn('[SupabaseSync] Cloud load error:', e);
        // REST API 回退
        await loadViaREST();
      }

      // 迁移 localStorage 中已有数据到云端
      await migrateLocalStorage();

      // 启动定时刷新
      setInterval(refreshFromCloud, REFRESH_INTERVAL);

      // 页面关闭前刷新待处理写入
      window.addEventListener('beforeunload', flushPending);

      initialized = true;
      console.log('[SupabaseSync] Ready. App:', APP_ID, 'User:', user ? (user.id || 'anon') : 'none');

      // 初始加载完成后派发 cloud-data-updated 事件
      // 应用页面在 DOMContentLoaded 时可能已渲染（此时云端数据尚未到达），
      // 需通知应用使用已加载到缓存的云端数据重新渲染。
      try {
        var allKeys = Object.keys(cache);
        if (allKeys.length > 0) {
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: allKeys } }));
        }
      } catch (e) {}

      return true;
    })();

    return initPromise;
  }

  // ===== REST API 回退 =====
  async function loadViaREST() {
    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=store_key,payload,updated_at&apikey=' + encodeURIComponent(SUPABASE_KEY), { cache: 'no-store' });
      if (!resp.ok) return;
      var data = await resp.json();
      if (!Array.isArray(data)) return;
      data.forEach(function (row) {
        var origKey = unprefixKey(row.store_key);
        if (origKey && cache[origKey] === undefined) {
          cache[origKey] = row.payload;
          cacheTs[origKey] = row.updated_at;
          defineKeyAccessor(origKey);
        }
      });
      console.log('[SupabaseSync] REST loaded', Object.keys(cache).length, 'keys');
    } catch (e) {
      console.warn('[SupabaseSync] REST load failed:', e);
    }
  }

  // ===== 迁移 localStorage → Supabase =====
  async function migrateLocalStorage() {
    try {
      // 一次性本地键名迁移：将旧的同名键（可能与其他应用冲突）搬到重映射后的本地键
      var remapKeys = Object.keys(LOCAL_KEY_REMAP);
      for (var rk = 0; rk < remapKeys.length; rk++) {
        var orig = remapKeys[rk];
        var localK = LOCAL_KEY_REMAP[orig];
        var oldRaw = _origGetItem(orig);
        var newRaw = _origGetItem(localK);
        // 只有当旧键有值且新键无值时才搬迁，避免覆盖已有新数据
        if (oldRaw !== null && oldRaw !== '' && (newRaw === null || newRaw === '')) {
          _origSetItem(localK, oldRaw);
          console.log('[SupabaseSync] Local key migrated:', orig, '→', localK);
        }
        // 旧键保留给其他应用，不删除（可能属于 clothing 等）
      }

      // 查询云端已有的 key 及内容
      var existing = {};
      try {
        var result = await sb.from(TABLE).select('store_key, payload');
        if (result.data && !result.error) {
          result.data.forEach(function (row) { existing[row.store_key] = row.payload; });
        }
      } catch (e) {}

      var migrated = 0, rescued = 0;
      var nativeKeys = Object.keys(localStorage);
      for (var i = 0; i < nativeKeys.length; i++) {
        var nativeKey = nativeKeys[i];

        // 将原生 localStorage 键名还原为应用使用的原始键名
        var key;
        if (REMAP_REVERSE[nativeKey] !== undefined) {
          key = REMAP_REVERSE[nativeKey]; // 重映射键：sb_contacts → contacts
        } else if (REMAP_ORIGINALS[nativeKey]) {
          // 该原始键名已被本应用重映射，出现在原生 localStorage 中说明属于其他应用，跳过
          continue;
        } else {
          key = nativeKey;
        }

        if (shouldSkip(key)) continue;

        var prefixedKey = prefixKey(key);
        var raw = _origGetItem(nativeKey);
        var localVal;
        try { localVal = (raw === null || raw === undefined) ? undefined : JSON.parse(raw); } catch (e) { localVal = raw; }

        if (existing[prefixedKey] !== undefined) {
          var cloudVal = existing[prefixedKey];
          var cloudEmpty = isEmptyValue(cloudVal);
          var localEmpty = isEmptyValue(localVal);

          if (cloudEmpty && !localEmpty) {
            // 云端为空而本地有真实数据 → 以上传本地为准（数据抢救，
            // 避免云端被误写的空值在加载时清空本地真实数据）
            try {
              var rescueResult = await sb.from(TABLE).upsert({
                store_key: prefixedKey,
                payload: localVal,
                updated_at: new Date().toISOString()
              }, { onConflict: 'store_key' });
              if (!rescueResult.error) {
                cache[key] = localVal;
                defineKeyAccessor(key);
                rescued++;
              }
            } catch (e) {}
            continue;
          }

          if (!cloudEmpty) {
            // 云端为准：将云端数据恢复到本地与缓存
            // （修复云端加载完成前应用初始化写入的过期空值残留）
            var rawC = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
            if (_origGetItem(nativeKey) !== rawC) {
              _origSetItem(nativeKey, rawC);
            }
            cache[key] = cloudVal;
            cacheTs[key] = new Date().toISOString();
            defineKeyAccessor(key);
            // 丢弃云端加载前排队的过期写入，防止其稍后覆盖云端真实数据
            // （如页面初始化代码误写的示例数据/空数组）
            delete pendingWrites[key];
          }
          // 两者皆空 → 无需处理
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
            defineKeyAccessor(key);
            migrated++;
          }
        } catch (e) {}
      }
      if (migrated > 0) console.log('[SupabaseSync] Migrated', migrated, 'keys to cloud');
      if (rescued > 0) console.log('[SupabaseSync] Rescued', rescued, 'keys from local (cloud was empty)');
    } catch (e) {
      console.warn('[SupabaseSync] Migration error:', e);
    }
  }

  // ===== 同步到云端 =====
  var pendingWrites = {};

  async function syncToCloud(key, value) {
    recentWrites[key] = Date.now();

    if (!sb || !initialized) {
      // 加入待处理队列（记录写入时间戳，供 flushPending 判断是否为过期写入）
      pendingWrites[key] = { value: value, ts: Date.now() };
      return;
    }

    try {
      await sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
    } catch (e) {
      console.warn('[SupabaseSync] Sync error for', key, e);
      pendingWrites[key] = { value: value, ts: Date.now() };
    }
  }

  // ===== 刷新待处理写入 =====
  async function flushPending() {
    var keys = Object.keys(pendingWrites);
    if (keys.length === 0) return;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = pendingWrites[key];
      var value = entry && entry.value !== undefined ? entry.value : entry;
      delete pendingWrites[key];

      // 防护1：早于云端数据时间戳的排队写入视为过期，跳过上传
      // （云端加载完成前应用初始化误写的值不得覆盖云端真实数据）
      if (entry && entry.ts && cacheTs[key]) {
        try {
          if (new Date(entry.ts) < new Date(cacheTs[key])) continue;
        } catch (e) {}
      }

      // 防护2：队列值为空而本地当前值非空时跳过
      // （避免云端加载完成前应用初始化误写的空数组覆盖云端真实数据）
      if (isEmptyValue(value)) {
        var raw = _origGetItem(toLocalKey(key));
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

        // 跳过自己最近写入的 key
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
          // 为该键建立属性访问器
          defineKeyAccessor(origKey);
          // 同步到原生 localStorage（使用重映射后的本地键名）
          var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
          _origSetItem(toLocalKey(origKey), raw);
          changedKeys.push(origKey);
        }
      });

      if (changedKeys.length > 0) {
        console.log('[SupabaseSync] Cloud update:', changedKeys.join(', '));
        window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys } }));
      }
    } catch (e) {
      console.warn('[SupabaseSync] Refresh error:', e);
    }
  }

  // ===== 拦截 localStorage =====
  localStorage.getItem = function (key) {
    // 优先从缓存读取（缓存使用原始 key）
    if (cache[key] !== undefined) {
      var val = cache[key];
      return typeof val === 'string' ? val : JSON.stringify(val);
    }
    // 回退到原生 localStorage（可能被重映射为不同的本地键名）
    return _origGetItem(toLocalKey(key));
  };

  localStorage.setItem = function (key, value) {
    // 写入原生 localStorage（使用重映射后的本地键名，避免与其他应用冲突）
    _origSetItem(toLocalKey(key), value);

    // 更新内存缓存（使用原始 key）
    try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }

    // 为该键建立属性访问器（保证 localStorage.key = value 形式的写入也被拦截）
    defineKeyAccessor(key);

    // 异步同步到云端（使用原始 key → store_key 为 APP_ID__key）
    if (!shouldSkip(key)) {
      syncToCloud(key, cache[key]);
    }
  };

  localStorage.removeItem = function (key) {
    _origRemoveItem(toLocalKey(key));
    delete cache[key];
    delete cacheTs[key];
    recentWrites[key] = Date.now();

    if (sb && initialized && !shouldSkip(key)) {
      sb.from(TABLE).delete().eq('store_key', prefixKey(key)).then(function () {});
    }
  };

  // ===== 属性式访问桥接（Safari 安全方案，不替换 window.localStorage）=====
  // 部分应用（如外贸出口管理系统）使用 localStorage.key = value / localStorage.key
  // 这类属性式读写。此前版本用 Proxy 整体替换 window.localStorage 来拦截，
  // 但该做法在 Safari/WebKit 上会导致第三方脚本（React 打包代码、supabase-js 等）
  // 行为异常甚至整页失效，且会引发不可预知的兼容性问题。
  //
  // 现改为：在原生 Storage 实例上为每个已知数据键定义 get/set 访问器（ES5 语法，
  // 全浏览器兼容，与 clothing 的 localstorage-patch.js 同一安全模式）。
  // 属性式读写经访问器路由到上面已补丁的 getItem/setItem（含云端缓存与同步）。
  var nativeStorage = window.localStorage;
  var accessorDefined = {};

  function defineKeyAccessor(key) {
    if (!key || accessorDefined[key] || shouldSkip(key)) return;
    try {
      var descriptor = Object.getOwnPropertyDescriptor(nativeStorage, key);
      // 若该属性已存在且不可配置，则跳过（回退到方法式访问）
      if (descriptor && descriptor.configurable === false) return;
      Object.defineProperty(nativeStorage, key, {
        configurable: true,
        enumerable: true,
        get: function () { return nativeStorage.getItem(key); },
        set: function (value) { nativeStorage.setItem(key, value); }
      });
      accessorDefined[key] = true;
    } catch (e) {
      // 个别环境不允许重定义，忽略即可（方法式读写不受影响）
    }
  }

  // 为一批键建立属性访问器（键来源：原生存储、云端缓存）
  function ensureAccessorsForKeys(keys) {
    for (var i = 0; i < keys.length; i++) {
      defineKeyAccessor(keys[i]);
    }
  }

  // 启动时：为原生 localStorage 中已存在的数据键建立访问器
  // （对 stainlessbusiness，sb_contacts 等重映射键需还原为原始逻辑键名）
  (function defineAccessorsForExistingNativeKeys() {
    try {
      var nativeKeys = Object.keys(nativeStorage);
      for (var i = 0; i < nativeKeys.length; i++) {
        var nativeKey = nativeKeys[i];
        var logicalKey;
        if (REMAP_REVERSE[nativeKey] !== undefined) {
          logicalKey = REMAP_REVERSE[nativeKey]; // sb_contacts → contacts
        } else if (REMAP_ORIGINALS[nativeKey]) {
          continue; // 该键名已被本应用重映射，物理数据属于其他应用（如 clothing）
        } else {
          logicalKey = nativeKey;
        }
        defineKeyAccessor(logicalKey);
      }
    } catch (e) {}
  })();

  // ===== 启动 =====
  init();
})();
