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

var _cache = {};
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
            if (row.store_key && _cache[row.store_key] === undefined) {
              _cache[row.store_key] = normalizePayload(row.payload);
            }
          });
        }

        // 迁移 localStorage 数据
        await migrateFromLocalStorage();

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
    // 同步写 localStorage 作为缓存
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}

    var sb = getClient();
    if (!sb || !sb.from) return;

    try {
      var user = null;
      try { var ud = await sb.auth.getUser(); user = ud.data ? ud.data.user : null; } catch (e) {}
      if (user && user.is_anonymous) {
        console.warn('[CloudbaseStore] 当前为匿名会话（只读），写入将被拒绝：', key);
      }

      // 兼容层 upsert：onConflict=store_key 时以该字段作为 PG 行 id
      var { error } = await sb.from('app_data_store')
        .upsert({
          store_key: key,
          payload: value,
          updated_at: new Date().toISOString(),
          user_id: user ? user.id : null
        }, { onConflict: 'store_key' });

      if (error) {
        console.warn('[CloudbaseStore] 云端写入失败:', key, error.message || error);
      }
    } catch (e) {
      console.warn('[CloudbaseStore] 写入云端失败:', key, e);
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

  var existingKeys = new Set();
  try {
    var { data } = await sb.from('app_data_store').select('store_key');
    if (data) data.forEach(function (r) { existingKeys.add(r.store_key); });
  } catch (e) {}

  var user = null;
  try { var ud = await sb.auth.getUser(); user = ud.data ? ud.data.user : null; } catch (e) {}

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
          updated_at: new Date().toISOString(),
          user_id: user ? user.id : null
        }, { onConflict: 'store_key' });
      if (!error) { migrated++; _cache[key] = payload; }
    } catch (e) {}
  }
  if (migrated > 0) console.log('[CloudbaseStore] 迁移了', migrated, '个数据集');
}

window.CloudbaseStore = CloudbaseStore;
// 兼容页面内既有的 window.SupabaseStore 调用
window.SupabaseStore = CloudbaseStore;
