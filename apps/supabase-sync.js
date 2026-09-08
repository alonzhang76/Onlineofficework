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

  function shouldSkip(key) {
    for (var i = 0; i < SKIP_KEYS.length; i++) {
      if (key.indexOf(SKIP_KEYS[i]) >= 0) return true;
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
      // 查询云端已有的 key
      var existingKeys = new Set();
      try {
        var result = await sb.from(TABLE).select('store_key');
        if (result.data) {
          result.data.forEach(function (row) { existingKeys.add(row.store_key); });
        }
      } catch (e) {}

      var migrated = 0;
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (shouldSkip(key)) continue;

        var prefixedKey = prefixKey(key);
        if (existingKeys.has(prefixedKey)) {
          // 云端已有，用云端数据更新本地
          if (cache[key] !== undefined) {
            var cloudVal = cache[key];
            var raw = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
            _origSetItem(key, raw);
          }
          continue;
        }

        var raw = _origGetItem(key);
        if (!raw) continue;

        var payload;
        try { payload = JSON.parse(raw); } catch (e) { payload = raw; }

        try {
          var upsertResult = await sb.from(TABLE).upsert({
            store_key: prefixedKey,
            payload: payload,
            updated_at: new Date().toISOString()
          }, { onConflict: 'store_key' });
          if (!upsertResult.error) {
            cache[key] = payload;
            migrated++;
          }
        } catch (e) {}
      }
      if (migrated > 0) console.log('[SupabaseSync] Migrated', migrated, 'keys to cloud');
    } catch (e) {
      console.warn('[SupabaseSync] Migration error:', e);
    }
  }

  // ===== 同步到云端 =====
  var pendingWrites = {};

  async function syncToCloud(key, value) {
    recentWrites[key] = Date.now();

    if (!sb || !initialized) {
      // 加入待处理队列
      pendingWrites[key] = value;
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
      pendingWrites[key] = value;
    }
  }

  // ===== 刷新待处理写入 =====
  async function flushPending() {
    var keys = Object.keys(pendingWrites);
    if (keys.length === 0) return;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = pendingWrites[key];
      delete pendingWrites[key];
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
          // 同步到原始 localStorage
          var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
          _origSetItem(origKey, raw);
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
    // 优先从缓存读取
    if (cache[key] !== undefined) {
      var val = cache[key];
      return typeof val === 'string' ? val : JSON.stringify(val);
    }
    // 回退到原始 localStorage
    return _origGetItem(key);
  };

  localStorage.setItem = function (key, value) {
    // 写入原始 localStorage（保持本地缓存/回退）
    _origSetItem(key, value);

    // 更新内存缓存
    try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }

    // 异步同步到云端（跳过内部 key）
    if (!shouldSkip(key)) {
      syncToCloud(key, cache[key]);
    }
  };

  localStorage.removeItem = function (key) {
    _origRemoveItem(key);
    delete cache[key];
    delete cacheTs[key];
    recentWrites[key] = Date.now();

    if (sb && initialized && !shouldSkip(key)) {
      sb.from(TABLE).delete().eq('store_key', prefixKey(key)).then(function () {});
    }
  };

  // ===== 启动 =====
  init();
})();
