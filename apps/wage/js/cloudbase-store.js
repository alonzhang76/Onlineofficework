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
        notifyStatus('offline');
        return false;
      }

      try {
        var sb = getClient();
        var { data, error } = await sb.from('app_data_store').select('store_key, payload, updated_at');

        if (error) {
          console.error('[CloudbaseStore] 云端加载失败:', error.message || error);
          notifyStatus('offline');
          return false;
        }

        if (data && Array.isArray(data)) {
          data.forEach(function (row) {
            if (row.store_key && _cache[row.store_key] === undefined) {
              _cache[row.store_key] = normalizePayload(row.payload);
              _cacheTimestamps[row.store_key] = row.updated_at || '';
            }
          });
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
    notifyStatus('pending');
    // 同步写 localStorage 作为缓存
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}

    var sb = getClient();
    if (!sb || !sb.from) { notifyStatus('error'); return; }

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
        notifyStatus('error');
      } else {
        notifyStatus('idle');
      }
    } catch (e) {
      console.warn('[CloudbaseStore] 写入云端失败:', key, e);
      notifyStatus('error');
    }
  },

  async remove(key) {
    delete _cache[key];
    delete _cacheTimestamps[key];
    _recentWrites[key] = Date.now();
    notifyStatus('pending');
    try { localStorage.removeItem(key); } catch (e) {}
    var sb = getClient();
    if (!sb) { notifyStatus('error'); return; }
    try {
      var { error } = await sb.from('app_data_store').delete().eq('store_key', key);
      if (error) notifyStatus('error');
      else notifyStatus('idle');
    } catch (e) { notifyStatus('error'); }
  },

  isReady() { return _initialized; },

  async migrateFromLocalStorage() { return migrateFromLocalStorage(); },

  refreshFromCloud: function () { return refreshFromCloud(); }
};

// 从云端刷新数据（感知其他端的写入）
async function refreshFromCloud() {
  if (!_initialized) return [];
  var sb = getClient();
  if (!sb || !sb.from) return [];

  try {
    var { data, error } = await sb.from('app_data_store').select('store_key, payload, updated_at');
    if (error) { console.warn('[CloudbaseStore] refresh 查询错误:', error); return []; }
    if (!data) return [];

    var now = Date.now();
    var SKIP_WINDOW = 10000;
    var changedKeys = [];

    data.forEach(function (row) {
      var key = row.store_key;
      if (!key) return;
      // 跳过最近本地写入的 key（10 秒宽限）
      if (_recentWrites[key] && now - _recentWrites[key] < SKIP_WINDOW) return;

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

  var TAB_SELECTORS = [
    '.nav-item.active',
    '.nav-tab.active',
    '.sidebar-menu-item.active',
    '.nav-link.active',
    '.company-btn.bg-primary',
    '.ant-tabs-tab-active',
    '[role="tab"][aria-selected="true"]'
  ];

  function findActiveTabs() {
    var found = [];
    for (var i = 0; i < TAB_SELECTORS.length; i++) {
      try {
        var els = document.querySelectorAll(TAB_SELECTORS[i]);
        for (var j = 0; j < els.length; j++) found.push(els[j]);
      } catch (e) {}
    }
    return found;
  }

  function refreshDots() {
    var tabs = findActiveTabs();
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
      if (parent && tabs.indexOf(parent) === -1) {
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
    try { refreshDots(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: { state: state } })); } catch (e) {}
  }

  function startAutoRefresh() {
    setInterval(refreshDots, 2000);
    if (window.MutationObserver) {
      try {
        var observer = new MutationObserver(function () { try { refreshDots(); } catch (e) {} });
        observer.observe(document.body || document.documentElement, {
          childList: true, subtree: true, attributes: true, attributeFilter: ['class']
        });
      } catch (e) {}
    }
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
