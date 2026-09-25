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
// data 为云端返回行数组，按 store_key 去重（取最新）后统计条数
function _ingestCloudCounts(data) {
  var newest = {};
  try {
    (data || []).forEach(function (row) {
      if (!row || !row.store_key) return;
      var prev = newest[row.store_key];
      if (!prev || new Date(row.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
        newest[row.store_key] = row;
      }
    });
  } catch (e) { return; }
  var counts = {};
  Object.keys(newest).forEach(function (k) { counts[k] = _countValue(newest[k].payload); });
  _cloudCounts = counts;
}

// 防抖：同一 key 400ms 内多次写入只上传最后一次
var _debounceTimers = {};
var UPLOAD_DEBOUNCE = 400;

// 连续失败自动恢复：≥3 次失败（refresh/上传）后调用共享层强制重登（60s 冷却），
// 应对 token 中途过期导致所有请求 FetchError、指示灯常红的情况
var _failCount = 0;
var _lastReauthAt = 0;
function noteSuccess() { _failCount = 0; }
function noteFailure(context) {
  _failCount++;
  if (_failCount < 3) return;
  if (Date.now() - _lastReauthAt < 60000) return;
  _lastReauthAt = Date.now();
  _failCount = 0;
  console.warn('[CloudbaseStore] 连续请求失败，尝试强制重新登录 (' + context + ')...');
  notifyStatus('error');
  if (typeof window.CloudbaseForceReauth === 'function') {
    Promise.resolve(window.CloudbaseForceReauth()).then(function () {
      // 重登后稍等 token 就绪，立即刷新一次恢复缓存与指示灯
      setTimeout(function () { refreshFromCloud(); }, 1500);
    });
  }
}

var WAGE_KEYS = [
  'wage_records', 'wage_employees', 'wage_processes', 'wage_orders',
  'wage_adjustments', 'wage_dropdown_options', 'wage_calendar_events', 'wage_calendar_event_types'
];
// 当前应用云端键前缀：用于按应用过滤云端行/清理残留（wage 应用使用裸 wage_* 键）
var APP_KEY_PREFIX = 'wage_';

// ===== 本地清空标记（防止自动刷新用云端旧数据"复活"刚清空的本地数据）=====
// 业务页面清空数据（如"清空全部工资记录"）时写 localStorage 'xxx_cleared'='1'；
// 云端刷新看到该标记且云端行比标记旧时跳过，由"上传/保存"覆盖云端并清除标记。
var CLEARED_FLAG_SUFFIX = '_cleared';
function setClearFlag(key) {
  try { localStorage.setItem(key + CLEARED_FLAG_SUFFIX, String(Date.now())); } catch (e) {}
}
function removeClearFlag(key) {
  try { localStorage.removeItem(key + CLEARED_FLAG_SUFFIX); } catch (e) {}
}
function getClearFlag(key) {
  try {
    var v = localStorage.getItem(key + CLEARED_FLAG_SUFFIX);
    if (!v) return 0;
    var n = parseInt(v, 10);
    return isNaN(n) ? 1 : n; // 老格式 '1' → 只要求存在即跳过
  } catch (e) { return 0; }
}

// 只统计 wage 自身键（云端表是多应用共享的，其他应用的行不能算进来）
function _pickWageRows(data) {
  var rows = [];
  try {
    (data || []).forEach(function (row) {
      if (row && row.store_key && WAGE_KEYS.indexOf(row.store_key) >= 0) rows.push(row);
    });
  } catch (e) {}
  return rows;
}

// 从云端按 id（= store_key）精准拉取本应用 8 个键，避免全表扫描把其他应用数据拉进缓存。
// 兼容层 _fetchRows 对单个 id 等值过滤走服务端；多个键逐个查询（8 次小查询，比拉 1 万行全表快得多）。
async function _fetchWageCloudRows(sb) {
  var all = [];
  for (var i = 0; i < WAGE_KEYS.length; i++) {
    var key = WAGE_KEYS[i];
    try {
      var res = await sb.from('app_data_store').select('store_key, payload, updated_at').eq('id', key);
      if (res && res.error) { return { rows: null, error: res.error }; }
      if (res && Array.isArray(res.data)) all = all.concat(res.data);
    } catch (e) {
      return { rows: null, error: e };
    }
  }
  return { rows: all, error: null };
}

var CloudbaseStore = {
  async init() {
    if (_initialized) return true;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      var ready = await waitForClient(15000);
      if (!ready) {
        console.error('[CloudbaseStore] CloudBase 兼容层未就绪，回退到 localStorage 只读缓存');
        notifyStatus('offline');
        return false;
      }

      try {
        var sb = getClient();
        // 只按 id 精准拉取本应用 8 个键，不做全表扫描（云端是多应用共享表，
        // 全表扫描会把其他应用上万行数据拉下来拖慢启动，还会污染本地缓存）
        var qr = await _fetchWageCloudRows(sb);
        var data = qr.rows, error = qr.error;

        if (error) {
          console.error('[CloudbaseStore] 云端加载失败:', error.message || error);
          notifyStatus('offline');
          return false;
        }

        if (data && Array.isArray(data)) {
          var _now = Date.now();
          data.forEach(function (row) {
            if (row.store_key && _cache[row.store_key] === undefined) {
              // 本地刚清空该键且云端行更旧 → 跳过（防止刚清空的数据被云端旧数据复活）
              var cf = getClearFlag(row.store_key);
              if (cf) {
                var ct = new Date(row.updated_at || 0).getTime();
                if (!ct || isNaN(ct) || ct <= cf) return;
                removeClearFlag(row.store_key); // 云端比清空标记新（他端已上传新数据），标记失效
              }
              // 本地有未上传的编辑且云端行不更新 → 保留本地（防止刚保存的数据被旧值覆盖）
              if (_recentWrites[row.store_key] && _now - _recentWrites[row.store_key] < 30000) {
                var lt0 = new Date(_cacheTimestamps[row.store_key] || 0).getTime();
                var ct0 = new Date(row.updated_at || 0).getTime();
                if (!isNaN(lt0) && !isNaN(ct0) && ct0 <= lt0) return;
              }
              var pv = normalizePayload(row.payload);
              _cache[row.store_key] = pv;
              _cacheTimestamps[row.store_key] = row.updated_at || '';
              // 持久化到 localStorage，保证刷新后还能看到
              try { localStorage.setItem(row.store_key, JSON.stringify(pv)); } catch (e) {}
            }
          });
          _ingestCloudCounts(data);
        }

        // 迁移 localStorage 数据
        await migrateFromLocalStorage();

        _initialized = true;
        notifyStatus('idle');
        console.log('[CloudbaseStore] 初始化完成，已加载', Object.keys(_cache).length, '个数据集');

        // 启动定时云端刷新（10 秒一次），感知其他端写入
        setInterval(refreshFromCloud, 10000);
        window.addEventListener('online', function () { refreshFromCloud(); });
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) refreshFromCloud();
        });
        window.addEventListener('offline', function () { notifyStatus('offline'); });
        return true;
      } catch (e) {
        console.error('[CloudbaseStore] 初始化异常:', e);
        notifyStatus('offline');
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
    _cacheTimestamps[key] = new Date().toISOString();
    _recentWrites[key] = Date.now();
    // 新数据写入后，旧的"已清空"标记失效
    if (_countValue(value) > 0) removeClearFlag(key);
    // 同步写 localStorage 作为缓存
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    // ⚠️ 手动同步模式：不再自动上传云端。
    // 请点击"上传云端"按钮手动调用 CloudbaseStore.pushAll()。
  },

  async remove(key) {
    delete _cache[key];
    delete _cacheTimestamps[key];
    _recentWrites[key] = Date.now();
    setClearFlag(key);
    try { localStorage.removeItem(key); } catch (e) {}
    // ⚠️ 手动同步模式：不再自动删除云端。
    // 上传时若云端有本地已删的 key，需用 CloudbaseStore.pushAll(true) 清理。
  },

  isReady() { return _initialized; },

  migrateFromLocalStorage: function () { return migrateFromLocalStorage(); },

  refreshFromCloud: function () { return refreshFromCloud(); },

  // 手动"下载云端数据"专用：无视编辑守卫强制拉取（供 CloudAdmin.pullFromCloud 调用）
  forceRefreshFromCloud: function () { return forceRefreshFromCloud(); },

  // 本地清空标记：业务页面"清空全部xx"后调用，阻止自动刷新把云端旧数据拉回
  setClearFlag: function (key) { setClearFlag(key); },
  removeClearFlag: function (key) { removeClearFlag(key); },

  // 本地/云端记录条数（供页面徽标显示）
  getRecordCounts: function () {
    var perKey = [];
    var localTotal = 0, cloudTotal = 0;
    WAGE_KEYS.forEach(function (key) {
      var lc = 0, cc = _cloudCounts ? (_cloudCounts[key] || 0) : null;
      try {
        var raw = localStorage.getItem(key);
        if (raw) lc = _countValue(JSON.parse(raw));
      } catch (e) {}
      // localStorage 没写成功/被清理时，回退到内存缓存计数
      if (lc === 0 && _cache[key] !== undefined) lc = _countValue(_cache[key]);
      localTotal += lc;
      if (cc !== null) cloudTotal += cc;
      perKey.push({ key: key, local: lc, cloud: cc });
    });
    return {
      appId: 'wage',
      cloudLoaded: !!_cloudCounts,
      localTotal: localTotal,
      cloudTotal: _cloudCounts ? cloudTotal : null,
      perKey: perKey
    };
  },

  // 手动上传：把本地所有数据推送到云端（覆盖云端）
  // alsoDelete=true 时，同时删除云端有但本地没有的 key（清理残留）
  pushAll: async function (alsoDelete) { return pushAll(alsoDelete); }
};

/** 实际执行单次 upsert（供 pushAll 调用） */
async function _doUpload(key, value) {
  var sb = getClient();
  if (!sb || !sb.from) return false;

  try {
    var user = null;
    try { var ud = await sb.auth.getUser(); user = ud.data ? ud.data.user : null; } catch (e) {}

    var { error } = await sb.from('app_data_store')
      .upsert({
        store_key: key,
        payload: value,
        updated_at: new Date().toISOString(),
        user_id: user ? user.id : null
      }, { onConflict: 'store_key' });

    if (error) {
      console.warn('[CloudbaseStore] 云端写入失败:', key, error.message || error);
      noteFailure('上传 ' + key);
      return false;
    }
    noteSuccess();
    return true;
  } catch (e) {
    console.warn('[CloudbaseStore] 写入云端失败:', key, e);
    noteFailure('上传异常 ' + key);
    return false;
  }
}

// 手动上传所有本地数据到云端
// onProgress 可选：onProgress({phase:'start'|'progress'|'cleanup'|'reauth', current, total, key, ok})
async function pushAll(alsoDelete, onProgress) {
  var sb = getClient();
  if (!sb || !sb.from) return { ok: false, msg: '同步层未就绪' };
  function emit(p) { if (typeof onProgress === 'function') { try { onProgress(p); } catch (e) {} } }

  // 收集所有本地非空业务 key（优先用 WAGE_KEYS，兜底遍历 localStorage）
  var keysToUpload = [];
  var seenKeys = {};
  for (var i = 0; i < WAGE_KEYS.length; i++) {
    var key = WAGE_KEYS[i];
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) {}
    if (raw === null || raw === undefined || raw === '') {
      // localStorage 没有但内存缓存有数据 → 也上传（防 localStorage 写入失败丢数据）
      if (_cache[key] !== undefined && _countValue(_cache[key]) > 0) {
        keysToUpload.push({ key: key, value: _cache[key] });
        seenKeys[key] = true;
      }
      continue;
    }
    var value;
    try { value = JSON.parse(raw); } catch (e) { value = raw; }
    keysToUpload.push({ key: key, value: value });
    seenKeys[key] = true;
  }
  // 本地刚清空的键（带 _cleared 标记）→ 上传空数组覆盖云端旧数据
  for (var ci = 0; ci < WAGE_KEYS.length; ci++) {
    var ck = WAGE_KEYS[ci];
    if (seenKeys[ck]) continue;
    if (getClearFlag(ck)) {
      keysToUpload.push({ key: ck, value: [] });
      seenKeys[ck] = true;
    }
  }
  // 兜底：WAGE_KEYS 没列出但 localStorage 里有数据的 key 也上传
  if (keysToUpload.length === 0) {
    for (var j = 0; j < localStorage.length; j++) {
      var k = localStorage.key(j);
      if (!k || WAGE_KEYS.indexOf(k) >= 0) continue;
      if (k.indexOf('wage_') === 0 || k === 'dataVersion') {
        var r2 = localStorage.getItem(k);
        if (r2 && r2 !== '') {
          var v2;
          try { v2 = JSON.parse(r2); } catch (e) { v2 = r2; }
          keysToUpload.push({ key: k, value: v2 });
        }
      }
    }
  }

  if (keysToUpload.length === 0) {
    return { ok: false, msg: '本地无数据可上传（空库保护，避免清空云端）' };
  }
  emit({ phase: 'start', total: keysToUpload.length });

  notifyStatus('pending');
  var okCount = 0, failCount = 0;
  for (var m = 0; m < keysToUpload.length; m++) {
    var it = keysToUpload[m];
    var ok = await _doUpload(it.key, it.value);
    if (ok) {
      okCount++;
      _cache[it.key] = it.value;
      _cacheTimestamps[it.key] = new Date().toISOString();
      // 云端已被本机覆盖，"已清空"标记使命完成
      removeClearFlag(it.key);
      // 兜底补写 localStorage（防御某些浏览器/车机 localStorage 写入失败）
      try { localStorage.setItem(it.key, JSON.stringify(it.value)); } catch (e) {}
    } else {
      failCount++;
    }
    emit({ phase: 'progress', current: m + 1, total: keysToUpload.length, key: it.key, ok: ok });
  }

  // 可选清理：删除云端有但本地没有的 wage_ 键（只查本应用 8 个键，不做全表扫描）
  if (alsoDelete) {
    try {
      var qr2 = await _fetchWageCloudRows(sb);
      var localSet = new Set(keysToUpload.map(function (x) { return x.key; }));
      if (qr2 && !qr2.error && Array.isArray(qr2.rows)) {
        for (var n = 0; n < qr2.rows.length; n++) {
          var sk = qr2.rows[n].store_key;
          if (sk && sk.indexOf(APP_KEY_PREFIX) === 0 && !localSet.has(sk)) {
            try { await sb.from('app_data_store').delete().eq('store_key', sk); } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }

  if (failCount === 0) {
    notifyStatus('idle');
    return { ok: true, uploaded: okCount, failed: 0 };
  }
  notifyStatus('error');
  return { ok: false, uploaded: okCount, failed: failCount };
}

// 从云端刷新数据（感知其他端的写入）
async function refreshFromCloud() {
  if (!_initialized) return [];
  var sb = getClient();
  if (!sb || !sb.from) return [];

  // Excel 保存模式：编辑期间（30s 内有本地写入）不自动加载云端数据
  var EDIT_GUARD_MS = 30000;
  var now = Date.now();
  var hasRecentEdit = false;
  try {
    var rwKeys = Object.keys(_recentWrites);
    for (var ri = 0; ri < rwKeys.length; ri++) {
      if (now - _recentWrites[rwKeys[ri]] < EDIT_GUARD_MS) { hasRecentEdit = true; break; }
    }
  } catch (e) {}
  if (hasRecentEdit) return [];

  try {
    // 只拉取本应用 8 个键（云端是多应用共享表，全表扫描会把其他应用数据拉进本地缓存）
    var qr = await _fetchWageCloudRows(sb);
    var data = qr.rows, error = qr.error;
    if (error) { console.warn('[CloudbaseStore] refresh 查询错误:', error); noteFailure('refresh'); return []; }
    noteSuccess();
    if (!data) return [];
    _ingestCloudCounts(data); // 刷新云端条数快照（getRecordCounts 只取 WAGE_KEYS）

    var now = Date.now();
    var SKIP_WINDOW = 10000;
    var changedKeys = [];

    data.forEach(function (row) {
      var key = row.store_key;
      if (!key) return;
      // 跳过最近本地写入的 key（10 秒宽限）
      if (_recentWrites[key] && now - _recentWrites[key] < SKIP_WINDOW) return;
      // 防抖窗口内的 key 跳过：上传还没发出，本地即最新
      if (_debounceTimers[key]) return;
      // 本地刚清空该键：云端行比清空标记旧 → 跳过（防止刚清空的数据被云端旧数据复活）
      var cf = getClearFlag(key);
      if (cf) {
        var cts = new Date(row.updated_at || 0).getTime();
        if (!cts || isNaN(cts) || cts <= cf) return;
        removeClearFlag(key); // 云端比清空标记新（他端已上传新数据），标记失效
      }
      // LWW 保护：云端不比本地新则跳过。典型场景：导入数据后 token 失效上传失败，
      // 若无此保护，10 秒后刷新会用云端旧数据覆盖刚导入的本地数据（数据消失）
      var localTs = _cacheTimestamps[key];
      var cloudTs = row.updated_at || '';
      if (localTs && cloudTs) {
        var lt = new Date(localTs).getTime();
        var ct = new Date(cloudTs).getTime();
        if (!isNaN(lt) && !isNaN(ct) && ct <= lt) return;
      }

      var newVal = normalizePayload(row.payload);
      var oldVal = _cache[key];
      var isChanged = false;
      if (oldVal === undefined) {
        isChanged = true;
      } else {
        try {
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) isChanged = true;
        } catch (e) { isChanged = true; }
      }

      if (isChanged) {
        _cache[key] = newVal;
        _cacheTimestamps[key] = row.updated_at || '';
        // 同步写 localStorage，让页面其它逻辑能读到
        try { localStorage.setItem(key, JSON.stringify(newVal)); } catch (e) {}
        changedKeys.push(key);
      }
    });

    if (changedKeys.length > 0) {
      console.log('[CloudbaseStore] 云端数据变更:', changedKeys.join(', '));
      window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys } }));
    }
    return changedKeys;
  } catch (e) {
    console.warn('[CloudbaseStore] refresh 异常:', e);
    return [];
  }
}

// 手动"下载云端数据"专用：无视 30s 编辑守卫 + 10s 写入宽限，强制拉取云端最新。
// 返回变更的 key 数组（cloudbase-admin.js 的 CloudAdmin.pullFromCloud 会调用它）。
async function forceRefreshFromCloud() {
  if (!_initialized) {
    var ok = await CloudbaseStore.init();
    if (!ok) return [];
  }
  var savedRW = _recentWrites;
  _recentWrites = {};
  try {
    return await refreshFromCloud();
  } finally {
    // 把手动下载期间新出现的写入合并回去（理论上没有，防御）
    for (var k2 in _recentWrites) { savedRW[k2] = _recentWrites[k2]; }
    _recentWrites = savedRW;
  }
}

// 手动同步模式：只把 localStorage 数据加载到缓存，不自动上传。
// 上传由 CloudbaseStore.pushAll() 手动触发。
async function migrateFromLocalStorage() {
  var loaded = 0;
  for (var i = 0; i < WAGE_KEYS.length; i++) {
    var key = WAGE_KEYS[i];
    if (_cache[key] !== undefined) continue; // 云端已有，不覆盖
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) {}
    if (!raw) continue;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { payload = raw; }
    _cache[key] = payload;
    loaded++;
  }
  if (loaded > 0) console.log('[CloudbaseStore] 从 localStorage 加载了', loaded, '个数据集（未自动上传，需手动"上传云端"）');
}

window.CloudbaseStore = CloudbaseStore;
// 兼容页面内既有的 window.SupabaseStore 调用
window.SupabaseStore = CloudbaseStore;

/* ===== CloudSyncStatus 指示灯模块（在激活的 Tab 按钮内嵌彩色圆点）=====
 * 状态: idle(绿,已同步) / pending(黄,上传中) / error(红,上传失败) / offline(灰,未连接)
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
      '.__cs_dot { display:inline-block; width:8px; height:8px; border-radius:50%;',
      '  margin-left:6px; vertical-align:middle; background:#10b981;',
      '  box-shadow:0 0 4px rgba(16,185,129,.6); transition:background .3s,box-shadow .3s; pointer-events:none; }',
      '.__cs_dot.__cs_pending { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,.7); animation:__cs_pulse 1.2s infinite; }',
      '.__cs_dot.__cs_error   { background:#ef4444; box-shadow:0 0 6px rgba(239,68,68,.7);  animation:__cs_pulse .8s infinite; }',
      '.__cs_dot.__cs_offline { background:#9ca3af; box-shadow:none; }',
      '@keyframes __cs_pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }',
      '.__cs_fallback_badge { position:fixed; right:8px; bottom:8px; z-index:99998;',
      '  display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:12px;',
      '  font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      '  color:#fff; background:rgba(16,185,129,.92); box-shadow:0 2px 8px rgba(0,0,0,.25);',
      '  -webkit-tap-highlight-color:transparent; }',
      '.__cs_fallback_badge.__cs_pending { background:rgba(245,158,11,.95); }',
      '.__cs_fallback_badge.__cs_error   { background:rgba(239,68,68,.95); cursor:pointer; pointer-events:auto; }',
      '.__cs_fallback_badge.__cs_offline { background:rgba(156,163,175,.95); }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(css);
  }

  // 合并为一次 querySelectorAll
  var TAB_SELECTOR = '.nav-item.active, .nav-tab.active, .sidebar-menu-item.active, .nav-link.active, .company-btn.bg-primary, .ant-tabs-tab-active, [role="tab"][aria-selected="true"]';

  function findActiveTabs() {
    try {
      var list = document.querySelectorAll(TAB_SELECTOR);
      var arr = [];
      for (var i = 0; i < list.length; i++) arr.push(list[i]);
      return arr;
    } catch (e) { return []; }
  }

  // rAF 节流：合并短时间内多次调用
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

    var allDots = document.querySelectorAll('.__cs_dot');
    for (var k = 0; k < allDots.length; k++) {
      var parent = allDots[k].parentElement;
      if (parent && !tabSet.has(parent)) {
        parent.removeChild(allDots[k]);
      }
    }

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
    // 每 3 秒刷新一次（不使用 MutationObserver 监听整个 body，避免大表格页面卡顿）
    setInterval(scheduleRefresh, 3000);
  }

  function boot() { try { injectCSS(); refreshDots(); startAutoRefresh(); } catch (e) {} }

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
