/* ===== CloudBase 数据同步层 cloudbase-sync.js（云优先 · 可靠版）=====
 *
 * 设计原则（类百度网盘）：
 *   1. 云端是唯一真相源（Source of Truth）
 *   2. 启动时先从云端拉取全量数据，写入 localStorage，再放行应用初始化
 *      （通过延迟 DOMContentLoaded 事件实现，应用无需改动）
 *   3. 写入：本地立即生效（响应快）→ 立即推送云端 → 失败自动重试（指数退避）
 *   4. 冲突：Last-Write-Wins，以 updated_at 时间戳为准（含 30s 时钟宽限）
 *   5. 定时拉取云端（15s），有更新则覆盖本地并通知应用重渲染
 *
 * 使用方式：
 *   <script>window.CLOUDBASE_APP_ID='wicketorders';</script>
 *   <script src="../cloudbase-sync.js?v=20260914b"></script>
 *
 * 数据表：app_data_store（PG 行形态 { id:text, data:jsonb }，
 *   data = { store_key, payload, updated_at }，id = store_key）
 */
(function () {
  'use strict';

  // ===== 配置 =====
  var APP_ID = window.CLOUDBASE_APP_ID || window.SUPABASE_APP_ID || 'default';
  var TABLE = 'app_data_store';
  var REFRESH_INTERVAL = 15000;       // 15 秒轮询云端
  var CLOCK_GRACE_MS = 30000;         // 时钟偏差宽限 30s
  var INIT_LOAD_TIMEOUT = 30000;      // 启动拉云超时 30s（超时后放行，允许离线使用）

  // 数据同步专用账号（authenticated 角色，可读写）
  var SYNC_ACCOUNT = window.CLOUDBASE_SYNC_ACCOUNT || {
    email: 'sync@lori.app',
    password: 'LoriSync2026!'
  };

  // ===== 内部状态 =====
  var sb = null;                       // supabase 兼容客户端
  var cache = {};                      // 原始key → 值（内存缓存，getItem 优先返回）
  var cacheTs = {};                    // 原始key → 云端 updated_at（ISO 字符串）
  var localMeta = {};                  // 原始key → 本机最后写入时间戳(ms)，持久化
  var pending = {};                    // 待上传队列 { cloudKey: {key, value, ts, tries} }
  var backoffUntil = 0;                // 退避截止时间
  var flushing = false;
  var ready = false;                   // 同步层是否就绪（初始拉云完成）
  var initStarted = false;

  // 持久化 localMeta
  var META_KEY = '__cb_meta__';
  try { localMeta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { localMeta = {}; }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(localMeta)); } catch (e) {} }

  // 跳过同步的内部 key
  var SKIP_KEYS = ['_lastLocalSave_', 'isLoggedIn', 'username', 'userPhone', 'sb-', 'tcb_', 'supabase', 'reconciliation_', '__purchaseContract', '__cb_meta__'];
  function shouldSkip(key) {
    for (var i = 0; i < SKIP_KEYS.length; i++) {
      if (key.indexOf(SKIP_KEYS[i]) >= 0) return true;
    }
    return false;
  }

  // 键名前缀
  function toCloudKey(key) { return APP_ID + '__' + key; }
  function fromCloudKey(ck) {
    var p = APP_ID + '__';
    return ck && ck.indexOf(p) === 0 ? ck.substring(p.length) : null;
  }

  // ===== 延迟 DOMContentLoaded，确保应用读到云端数据 =====
  var _origAddEventListener = document.addEventListener;
  var _domReadyFired = false;
  var _domListeners = [];
  document.addEventListener = function (type, listener, options) {
    if (type === 'DOMContentLoaded') {
      if (_domReadyFired) {
        setTimeout(function () { try { listener.call(document); } catch (e) {} }, 0);
      } else {
        _domListeners.push(listener);
      }
      return;
    }
    return _origAddEventListener.call(this, type, listener, options);
  };
  // 兼容 window.onload 也延迟
  var _origWinOnLoad = null;
  var _winOnLoadSet = false;
  try {
    Object.defineProperty(window, 'onload', {
      get: function () { return _origWinOnLoad; },
      set: function (fn) {
        _origWinOnLoad = fn;
        _winOnLoadSet = true;
      },
      configurable: true
    });
  } catch (e) {}

  function fireDomReady() {
    if (_domReadyFired) return;
    _domReadyFired = true;
    console.log('[CloudbaseSync] 云端初始数据已就绪，放行应用初始化');
    _domListeners.forEach(function (l) {
      try { l.call(document); } catch (e) {}
    });
    _domListeners = [];
    if (_winOnLoadSet && typeof _origWinOnLoad === 'function') {
      try { _origWinOnLoad.call(window); } catch (e) {}
    }
  }

  // ===== 加载云端兼容层 =====
  function resolveModuleUrl() {
    try {
      var scripts = document.querySelectorAll('script[src*="cloudbase-sync"]');
      if (scripts.length) {
        return new URL('cloudbase/cloudbase.js', scripts[scripts.length - 1].src).href;
      }
    } catch (e) {}
    return 'cloudbase/cloudbase.js';
  }

  async function loadClient() {
    window.CLOUDBASE_SYNC = SYNC_ACCOUNT;
    try {
      var mod = await import(/* @vite-ignore */ resolveModuleUrl());
      sb = (mod && mod.supabase) || window.supabase || null;
      return sb;
    } catch (e) {
      console.error('[CloudbaseSync] 兼容层加载失败:', e && e.message ? e.message : e);
      return null;
    }
  }

  // ===== 等待认证完成 =====
  async function waitAuth() {
    if (!sb) return null;
    var tries = 0;
    while (tries < 40) {
      try {
        var r = await sb.auth.getUser();
        if (r && r.data && r.data.user) return r.data.user;
      } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 500); });
      tries++;
    }
    console.warn('[CloudbaseSync] 认证超时，将以只读/离线模式运行');
    return null;
  }

  // ===== 从云端拉取全量数据 =====
  async function pullAll() {
    if (!sb) return false;
    try {
      var result = await sb.from(TABLE).select('store_key, payload, updated_at');
      if (result.error || !result.data) {
        console.error('[CloudbaseSync] 拉取云端失败:', result.error && result.error.message);
        return false;
      }
      var rows = result.data || [];
      var accepted = 0, rejected = 0;
      rows.forEach(function (row) {
        var key = fromCloudKey(row.store_key);
        if (!key) return;
        var cloudMs = Date.parse(row.updated_at || '');
        var localMs = localMeta[key] || 0;
        // LWW：云端更新（含宽限）或本机从未写过 → 接受云端
        if (!localMs || isNaN(cloudMs) || cloudMs + CLOCK_GRACE_MS >= localMs) {
          cache[key] = row.payload;
          cacheTs[key] = row.updated_at;
          var raw = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
          // 直接写原生 localStorage（绕过补丁，避免触发上传）
          if (nativeGet(key) !== raw) {
            nativeSet(key, raw);
          }
          if (!isNaN(cloudMs)) { localMeta[key] = cloudMs; }
          accepted++;
        } else {
          // 本机更新 → 保留本地，稍后补推
          rejected++;
        }
      });
      saveMeta();
      console.log('[CloudbaseSync] 拉取云端', rows.length, '行，接受', accepted, '，本地更新保留', rejected);
      return true;
    } catch (e) {
      console.warn('[CloudbaseSync] 拉取异常:', e && e.message ? e.message : e);
      return false;
    }
  }

  // ===== 上传单个 key 到云端 =====
  async function pushOne(key, value) {
    if (!sb) return false;
    var cloudKey = toCloudKey(key);
    try {
      var res = await sb.from(TABLE).upsert({
        store_key: cloudKey,
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
      if (res && res.error) {
        console.error('[CloudbaseSync] 上传失败', key, ':', res.error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[CloudbaseSync] 上传异常', key, ':', e && e.message ? e.message : e);
      return false;
    }
  }

  // ===== 待上传队列管理 =====
  function schedulePush(key, value) {
    var cloudKey = toCloudKey(key);
    pending[cloudKey] = { key: key, value: value, ts: Date.now(), tries: 0 };
    scheduleFlush(100);
  }

  function scheduleFlush(delay) {
    setTimeout(flushPending, Math.max(0, delay || 0));
  }

  function backoffMs(tries) {
    return Math.min(60000, 1000 * Math.pow(2, Math.max(1, Math.min(tries || 1, 6))));
  }

  async function flushPending() {
    if (flushing) return;
    if (Date.now() < backoffUntil) { scheduleFlush(backoffUntil - Date.now() + 100); return; }
    var keys = Object.keys(pending);
    if (keys.length === 0) return;
    flushing = true;
    try {
      for (var i = 0; i < keys.length; i++) {
        var ck = keys[i];
        var entry = pending[ck];
        if (!entry) continue;
        var ok = await pushOne(entry.key, entry.value);
        if (ok) {
          delete pending[ck];
          backoffUntil = 0;
        } else {
          entry.tries = (entry.tries || 0) + 1;
          backoffUntil = Date.now() + backoffMs(entry.tries);
          console.warn('[CloudbaseSync]', entry.key, '上传失败，', Math.round((backoffUntil - Date.now()) / 1000), '秒后重试');
          scheduleFlush(backoffUntil - Date.now() + 100);
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  // ===== 拦截 localStorage =====
  var _ls = window.localStorage;
  var _proto = Object.getPrototypeOf(_ls);
  var _origGet = _proto.getItem;
  var _origSet = _proto.setItem;
  var _origDel = _proto.removeItem;

  function nativeGet(k) { return _origGet.call(_ls, k); }
  function nativeSet(k, v) { _origSet.call(_ls, k, v); }

  _proto.getItem = function (key) {
    if (this === _ls) {
      if (cache[key] !== undefined) {
        var v = cache[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _origGet.call(this, key);
    }
    return _origGet.call(this, key);
  };

  _proto.setItem = function (key, value) {
    if (this === _ls) {
      _origSet.call(this, key, value);
      var parsed;
      try { parsed = JSON.parse(value); } catch (e) { parsed = value; }
      cache[key] = parsed;
      if (!shouldSkip(key)) {
        localMeta[key] = Date.now();
        saveMeta();
        // 立即推送云端（不阻塞 UI）
        pushOne(key, parsed).then(function (ok) {
          if (!ok) schedulePush(key, parsed);
        });
      }
      return;
    }
    return _origSet.call(this, key, value);
  };

  _proto.removeItem = function (key) {
    if (this === _ls) {
      _origDel.call(this, key);
      delete cache[key];
      delete cacheTs[key];
      delete localMeta[key];
      saveMeta();
      if (sb && !shouldSkip(key)) {
        sb.from(TABLE).delete().eq('id', toCloudKey(key)).catch(function () {});
      }
      return;
    }
    return _origDel.call(this, key);
  };

  // ===== 定时轮询云端 =====
  async function refreshLoop() {
    if (!sb || !ready) return;
    var before = JSON.stringify(cache);
    await pullAll();
    var after = JSON.stringify(cache);
    if (before !== after) {
      console.log('[CloudbaseSync] 云端数据有更新，通知应用');
      try {
        window.dispatchEvent(new CustomEvent('cloud-data-updated', {
          detail: { keys: Object.keys(cache) }
        }));
      } catch (e) {}
    }
  }

  // ===== 启动 =====
  async function init() {
    if (initStarted) return;
    initStarted = true;
    console.log('[CloudbaseSync] 启动，应用前缀:', APP_ID);

    await loadClient();
    if (!sb) {
      console.warn('[CloudbaseSync] 客户端未就绪，放行应用（离线模式）');
      ready = true;
      fireDomReady();
      return;
    }

    await waitAuth();

    // 初始拉取云端（限时）
    var pullOk = await Promise.race([
      pullAll(),
      new Promise(function (resolve) { setTimeout(function () { resolve(false); }, INIT_LOAD_TIMEOUT); })
    ]);

    if (!pullOk) {
      console.warn('[CloudbaseSync] 初始拉取超时/失败，使用本地数据放行应用');
    }

    ready = true;
    fireDomReady();

    // 启动轮询
    setInterval(refreshLoop, REFRESH_INTERVAL);

    // 网络恢复 / 回前台时立即拉取
    window.addEventListener('online', function () { refreshLoop(); flushPending(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refreshLoop(); flushPending(); }
    });
    window.addEventListener('beforeunload', flushPending);

    console.log('[CloudbaseSync] 就绪，应用:', APP_ID);
  }

  // 暴露调试接口
  window.CloudbaseSync = {
    isReady: function () { return ready; },
    cache: cache,
    pending: pending,
    refresh: refreshLoop,
    flush: flushPending
  };

  init();
})();
