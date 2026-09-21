/* ===== CloudBase 数据存储层（poultry） =====
 * 替代原 supabase-store.js，底层由共享 CloudBase 兼容层（js/cloudbase.js）
 * 提供与 supabase-js 兼容的 window.supabase 接口。
 *
 * 用法保持不变：
 *   await SupabaseStore.init()
 *   SupabaseStore.get/set/remove
 * 数据表：app_data_store（store_key + payload jsonb）
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

// 上传状态通知：转发到 window.CloudSyncStatus 指示灯
function notifyStatus(state) {
  try {
    if (window.CloudSyncStatus && typeof window.CloudSyncStatus.setState === 'function') {
      window.CloudSyncStatus.setState(state);
    }
  } catch (e) {}
}

var _cache = {};
var _cacheTimestamps = {};
var _recentWrites = {};
var _initialized = false;
var _initPromise = null;

// 云端条数快照（独立于可能混入本地值的 _cache），null 表示尚未加载
var _cloudCounts = null;
function _countValue(val) {
  if (val === null || val === undefined) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === 'object') { try { return Object.keys(val).length; } catch (e) { return 0; } }
  return 0;
}

var SupabaseStore = {
  // 初始化：拉取云端所有 poultry_ 开头的键到本地缓存
  init: async function () {
    if (_initialized) return _initPromise;
    _initPromise = (async function () {
      var ready = await waitForClient(20000);
      if (!ready) {
        console.warn('[poultry-store] CloudBase 未就绪，使用本地存储');
        _initialized = true;
        return false;
      }
      try {
        var sb = getClient();
        // 拉取 poultry_ 前缀的所有键（家禽订单系统的数据）
        var { data, error } = await sb.from('app_data_store')
          .select('store_key,payload,updated_at')
          .like('store_key', 'poultry_%');

        if (error) throw error;

        var cloudCount = 0;
        if (data && data.length) {
          data.forEach(function (row) {
            var key = row.store_key;
            var val = normalizePayload(row.payload);
            _cache[key] = val;
            if (row.updated_at) {
              _cacheTimestamps[key] = new Date(row.updated_at).getTime();
            }
            cloudCount++;
          });
        }
        _cloudCounts = { total: cloudCount };
        _initialized = true;
        notifyStatus('synced');
        return true;
      } catch (e) {
        console.warn('[poultry-store] 初始化失败:', e.message);
        _initialized = true;
        notifyStatus('offline');
        return false;
      }
    })();
    return _initPromise;
  },

  get: function (key) {
    if (!key) return null;
    // 优先内存缓存
    if (_cache.hasOwnProperty(key) && _cache[key] !== undefined) {
      return _cache[key];
    }
    // 回退 localStorage
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  set: async function (key, value) {
    _cache[key] = value;
    // 本地备份
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    // 写入云端
    _recentWrites[key] = Date.now();
    notifyStatus('syncing');
    try {
      var sb = getClient();
      if (!sb) return false;
      // 先 upsert
      var { error } = await sb.from('app_data_store').upsert(
        { store_key: key, payload: value },
        { onConflict: 'store_key' }
      );
      if (error) throw error;
      notifyStatus('synced');
      return true;
    } catch (e) {
      console.warn('[poultry-store] 写入失败:', e.message);
      notifyStatus('error');
      return false;
    }
  },

  remove: async function (key) {
    delete _cache[key];
    try { localStorage.removeItem(key); } catch (e) {}
    try {
      var sb = getClient();
      if (!sb) return false;
      var { error } = await sb.from('app_data_store').delete().eq('store_key', key);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[poultry-store] 删除失败:', e.message);
      return false;
    }
  },

  // 直接获取 supabase 客户端，用于复杂查询
  getClient: getClient,

  isReady: function () { return _initialized; },

  // 获取所有 poultry_ 键
  getAllKeys: function () {
    return Object.keys(_cache).filter(function (k) { return k.indexOf('poultry_') === 0; });
  }
};

window.SupabaseStore = SupabaseStore;
window.CloudbaseStore = SupabaseStore;
