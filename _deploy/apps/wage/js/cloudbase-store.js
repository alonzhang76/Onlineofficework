/* ===== CloudBase 数据存储层（wage） =====
 * 替代原 supabase-store.js，底层由共享 CloudBase 兼容层（js/cloudbase.js）
 * 提供与 supabase-js 兼容的 window.supabase 接口。
 *
 * 用法保持不变：
 *   await SupabaseStore.init()
 *   SupabaseStore.get/set/remove
 * 数据表：app_data_store（store_key + payload jsonb；wage 使用裸 wage_* 键）
 */

window._CLOUDBASE_STORE_LOADED = true;

function getClient() {
  return window.supabase || null;
}

function waitForClient(timeout) {
  timeout = timeout || 15000;
  var start = Date.now();
  return new Promise(function (resolve) {
    function check() {
      if (window.supabase && window.supabase.auth) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); }
      else { setTimeout(check, 100); }
    }
    check();
  });
}

function normalizePayload(payload) {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'object' && !Array.isArray(payload) && payload.data !== undefined) {
    return normalizePayload(payload.data);
  }
  return payload;
}

// 本地写入时间戳（持久化），用于 LWW 冲突裁决
var _localMeta = {};
try { _localMeta = JSON.parse(localStorage.getItem('__wage_meta__') || '{}') || {}; } catch (e) { _localMeta = {}; }
function _saveMeta() { try { localStorage.setItem('__wage_meta__', JSON.stringify(_localMeta)); } catch (e) {} }
var CLOCK_GRACE_MS = 30000;

// 待上传队列（失败自动重试）
var _pending = {};
var _flushing = false;
var _backoffUntil = 0;

var _cache = {};
var _cacheTs = {}; // key → 云端 updated_at
var _initialized = false;
var _initPromise = null;

var WAGE_KEYS = [
  'wage_records', 'wage_employees', 'wage_processes', 'wage_orders',
  'wage_adjustments', 'wage_dropdown_options', 'wage_calendar_events', 'wage_calendar_event_types'
];

var CloudbaseStore = {
  async init() {
    if (_initialized) return true;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      var ready = await waitForClient(15000);
      if (!ready) {
        console.error('[CloudbaseStore] CloudBase 兼容层未就绪，回退到 localStorage 只读缓存');
        return false;
      }

      try {
        var sb = getClient();
        var { data, error } = await sb.from('app_data_store').select('store_key, payload, updated_at');

        if (error) {
          console.error('[CloudbaseStore] 云端加载失败:', error.message || error);
          return false;
        }

        if (data && Array.isArray(data)) {
          data.forEach(function (row) {
            if (!row.store_key) return;
            var cloudMs = Date.parse(row.updated_at || '');
            var localMs = _localMeta[row.store_key] || 0;
            // LWW：云端更新（含宽限）或本机从未写过 → 接受云端
            if (!localMs || isNaN(cloudMs) || cloudMs + CLOCK_GRACE_MS >= localMs) {
              _cache[row.store_key] = normalizePayload(row.payload);
              _cacheTs[row.store_key] = row.updated_at;
              if (!isNaN(cloudMs)) _localMeta[row.store_key] = cloudMs;
            }
            // 否则本机更新，稍后由 flushPending 补推
          });
          _saveMeta();
        }

        // 迁移 localStorage 中存在但云端没有的 key
        await migrateFromLocalStorage();

        // 补发本机更新但云端没有的 key
        flushPending();

        _initialized = true;
        console.log('[CloudbaseStore] 初始化完成，已加载', Object.keys(_cache).length, '个数据集');
        return true;
      } catch (e) {
        console.error('[CloudbaseStore] 初始化异常:', e);
        return false;
      }
    })();

    return _initPromise;
  },

  get(key, defaultVal) {
    if (_cache[key] !== undefined) return _cache[key];
    // 回退到 localStorage
    try {
      var raw = localStorage.getItem(key);
      if (raw) { var parsed = JSON.parse(raw); _cache[key] = parsed; return parsed; }
    } catch (e) {}
    return defaultVal;
  },

  async set(key, value) {
    _cache[key] = value;
    _localMeta[key] = Date.now();
    _saveMeta();
    // 同步写 localStorage 作为缓存
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}

    var sb = getClient();
    if (!sb || !sb.from) {
      _pending[key] = { value: value, tries: 0 };
      scheduleFlush(200);
      return;
    }

    try {
      var { error } = await sb.from('app_data_store')
        .upsert({
          store_key: key,
          payload: value,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_key' });

      if (error) {
        console.warn('[CloudbaseStore] 云端写入失败，将重试:', key, error.message || error);
        _pending[key] = { value: value, tries: 0 };
        scheduleFlush(1000);
      }
    } catch (e) {
      console.warn('[CloudbaseStore] 写入云端异常，将重试:', key, e);
      _pending[key] = { value: value, tries: 0 };
      scheduleFlush(1000);
    }
  },

  async remove(key) {
    delete _cache[key];
    try { localStorage.removeItem(key); } catch (e) {}
    var sb = getClient();
    if (!sb) return;
    try { await sb.from('app_data_store').delete().eq('store_key', key); } catch (e) {}
  },

  isReady() { return _initialized; },

  async migrateFromLocalStorage() { return migrateFromLocalStorage(); }
};

async function migrateFromLocalStorage() {
  var sb = getClient();
  if (!sb) return;

  // 只迁移云端不存在的 key；云端已有的由 init 中的 LWW 裁决
  var existingKeys = new Set();
  try {
    var { data } = await sb.from('app_data_store').select('store_key');
    if (data) data.forEach(function (r) { existingKeys.add(r.store_key); });
  } catch (e) {}

  var migrated = 0;
  for (var i = 0; i < WAGE_KEYS.length; i++) {
    var key = WAGE_KEYS[i];
    if (existingKeys.has(key)) continue;

    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) {}
    if (!raw) continue;

    var payload;
    try { payload = JSON.parse(raw); } catch (e) { payload = raw; }

    try {
      var { error } = await sb.from('app_data_store')
        .upsert({
          store_key: key,
          payload: payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_key' });
      if (!error) { migrated++; _cache[key] = payload; }
    } catch (e) {}
  }
  if (migrated > 0) console.log('[CloudbaseStore] 迁移了', migrated, '个数据集');
}

// ===== 重试队列 =====
function scheduleFlush(delay) {
  setTimeout(flushPending, Math.max(0, delay || 0));
}

function backoffMs(tries) {
  return Math.min(60000, 1000 * Math.pow(2, Math.max(1, Math.min(tries || 1, 6))));
}

async function flushPending() {
  if (_flushing) return;
  if (Date.now() < _backoffUntil) { scheduleFlush(_backoffUntil - Date.now() + 100); return; }
  var keys = Object.keys(_pending);
  if (keys.length === 0) return;
  var sb = getClient();
  if (!sb) { scheduleFlush(2000); return; }
  _flushing = true;
  try {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = _pending[key];
      if (!entry) continue;
      try {
        var { error } = await sb.from('app_data_store')
          .upsert({
            store_key: key,
            payload: entry.value,
            updated_at: new Date().toISOString()
          }, { onConflict: 'store_key' });
        if (error) throw error;
        delete _pending[key];
        _backoffUntil = 0;
      } catch (e) {
        entry.tries = (entry.tries || 0) + 1;
        _backoffUntil = Date.now() + backoffMs(entry.tries);
        console.warn('[CloudbaseStore]', key, '上传失败，', Math.round((_backoffUntil - Date.now()) / 1000), '秒后重试');
        scheduleFlush(_backoffUntil - Date.now() + 100);
        break;
      }
    }
  } finally {
    _flushing = false;
  }
}

// 定时轮询云端更新（15s）
setInterval(async function () {
  if (!_initialized) return;
  var sb = getClient();
  if (!sb) return;
  try {
    var { data, error } = await sb.from('app_data_store').select('store_key, payload, updated_at');
    if (error || !data) return;
    var changed = false;
    data.forEach(function (row) {
      if (!row.store_key) return;
      var cloudMs = Date.parse(row.updated_at || '');
      var localMs = _localMeta[row.store_key] || 0;
      if (!localMs || isNaN(cloudMs) || cloudMs + CLOCK_GRACE_MS >= localMs) {
        var newVal = normalizePayload(row.payload);
        if (JSON.stringify(_cache[row.store_key]) !== JSON.stringify(newVal)) {
          _cache[row.store_key] = newVal;
          _cacheTs[row.store_key] = row.updated_at;
          if (!isNaN(cloudMs)) _localMeta[row.store_key] = cloudMs;
          changed = true;
        }
      }
    });
    _saveMeta();
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: Object.keys(_cache) } })); } catch (e) {}
    }
  } catch (e) {}
}, 15000);

window.CloudbaseStore = CloudbaseStore;
// 兼容页面内既有的 window.SupabaseStore 调用
window.SupabaseStore = CloudbaseStore;
