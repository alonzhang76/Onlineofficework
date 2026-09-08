/* ===== Supabase 数据存储层 =====
 * 替代 localStorage，所有数据存到 Supabase
 * 使用方式：SupabaseStore.init() 初始化，SupabaseStore.get/set/remove 读写
 * 数据表：app_data_store（store_key + payload jsonb）
 */

window._SUPABASE_STORE_LOADED = true;

const SUPABASE_URL_LOCAL = "https://ugoyacuagslqhqguxyqe.supabase.co";
const SUPABASE_KEY_LOCAL = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnb3lhY3VhZ3NscWhxZ3V4eXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI5NTUsImV4cCI6MjEwMjUwODk1NX0._GdWOGWblSpOYm3y8f_d3aVQszfn2YbRjHN0FqZiLtI";

function getSupabase() {
  return window.supabase || null;
}

function waitForSupabase(timeout) {
  timeout = timeout || 10000;
  var start = Date.now();
  return new Promise(function(resolve) {
    function check() {
      if (window.supabase && window.supabase.auth) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); }
      else { setTimeout(check, 100); }
    }
    check();
  });
}

var _umdLoading = false;
var _umdLoadPromise = null;

function loadSupabaseUMD() {
  if (window.supabase && window.supabase.auth) return Promise.resolve(window.supabase);
  if (_umdLoadPromise) return _umdLoadPromise;

  _umdLoadPromise = new Promise(function(resolve, reject) {
    if (_umdLoading) { setTimeout(function() { resolve(window.supabase); }, 5000); return; }
    _umdLoading = true;

    var cdnList = [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js',
      'https://unpkg.com/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js',
    ];
    var cdnIndex = 0;

    function tryLoadCDN() {
      if (cdnIndex >= cdnList.length) { _umdLoading = false; reject(new Error('CDN 加载失败')); return; }
      var script = document.createElement('script');
      script.src = cdnList[cdnIndex];
      script.async = true;
      script.onload = function() {
        setTimeout(function() {
          if (window.supabase && typeof window.supabase.createClient === 'function' && !window.supabase.auth) {
            window.supabase = window.supabase.createClient(SUPABASE_URL_LOCAL, SUPABASE_KEY_LOCAL, {
              auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
          }
          if (window.supabase && window.supabase.auth) { _umdLoading = false; resolve(window.supabase); return; }
          cdnIndex++; tryLoadCDN();
        }, 800);
      };
      script.onerror = function() { cdnIndex++; tryLoadCDN(); };
      document.head.appendChild(script);
    }
    tryLoadCDN();
  });
  return _umdLoadPromise;
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

var SupabaseStore = {
  async init() {
    if (_initialized) return true;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      var sbReady = await waitForSupabase(3000);
      if (!sbReady) {
        console.warn('[SupabaseStore] ES Module 超时，尝试 UMD 回退...');
        try { await loadSupabaseUMD(); sbReady = !!window.supabase; } catch(e) { console.error('[SupabaseStore] UMD 回退失败:', e); }
      }
      if (!sbReady) { console.error('[SupabaseStore] Supabase 未加载，回退到 localStorage'); return false; }

      try {
        var sb = getSupabase();
        var { data, error } = await sb.from('app_data_store').select('store_key, payload');

        if (error) {
          // REST API 回退
          try {
            var resp = await fetch(SUPABASE_URL_LOCAL + '/rest/v1/app_data_store?select=store_key,payload', {
              headers: { 'apikey': SUPABASE_KEY_LOCAL, 'Authorization': 'Bearer ' + SUPABASE_KEY_LOCAL }
            });
            if (resp.ok) { data = await resp.json(); }
          } catch(e2) { console.error('[SupabaseStore] REST 回退也失败:', e2); return false; }
        }

        if (data && Array.isArray(data)) {
          data.forEach(function(row) {
            if (row.store_key && _cache[row.store_key] === undefined) {
              _cache[row.store_key] = normalizePayload(row.payload);
            }
          });
        }

        // 迁移 localStorage 数据
        await migrateFromLocalStorage();

        _initialized = true;
        console.log('[SupabaseStore] 初始化完成，已加载', Object.keys(_cache).length, '个数据集');
        return true;
      } catch(e) {
        console.error('[SupabaseStore] 初始化异常:', e);
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
    } catch(e) {}
    return defaultVal;
  },

  async set(key, value) {
    _cache[key] = value;
    // 同步写 localStorage 作为缓存
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}

    var sb = getSupabase();
    if (!sb || !sb.from) return;

    try {
      var user = null;
      try { var ud = await sb.auth.getUser(); user = ud.data ? ud.data.user : null; } catch(e) {}

      var { error } = await sb.from('app_data_store')
        .upsert({
          store_key: key,
          payload: value,
          updated_at: new Date().toISOString(),
          user_id: user ? user.id : null
        }, { onConflict: 'store_key' });

      if (error) {
        // 尝试 insert 再 update
        var { error: insErr } = await sb.from('app_data_store').insert({
          store_key: key, payload: value, updated_at: new Date().toISOString(), user_id: user ? user.id : null
        });
        if (insErr) {
          await sb.from('app_data_store').update({
            payload: value, updated_at: new Date().toISOString()
          }).eq('store_key', key);
        }
      }
    } catch(e) {
      console.warn('[SupabaseStore] 写入云端失败:', key, e);
    }
  },

  async remove(key) {
    delete _cache[key];
    try { localStorage.removeItem(key); } catch(e) {}
    var sb = getSupabase();
    if (!sb) return;
    try { await sb.from('app_data_store').delete().eq('store_key', key); } catch(e) {}
  },

  isReady() { return _initialized; },

  async migrateFromLocalStorage() { return migrateFromLocalStorage(); }
};

async function migrateFromLocalStorage() {
  var sb = getSupabase();
  if (!sb) return;

  var existingKeys = new Set();
  try {
    var { data } = await sb.from('app_data_store').select('store_key');
    if (data) data.forEach(function(r) { existingKeys.add(r.store_key); });
  } catch(e) {}

  var user = null;
  try { var ud = await sb.auth.getUser(); user = ud.data ? ud.data.user : null; } catch(e) {}

  var migrated = 0;
  for (var i = 0; i < WAGE_KEYS.length; i++) {
    var key = WAGE_KEYS[i];
    if (existingKeys.has(key)) continue;

    var raw = null;
    try { raw = localStorage.getItem(key); } catch(e) {}
    if (!raw) continue;

    var payload;
    try { payload = JSON.parse(raw); } catch(e) { payload = raw; }

    try {
      var { error } = await sb.from('app_data_store').insert({
        store_key: key, payload: payload, updated_at: new Date().toISOString(),
        user_id: user ? user.id : null
      });
      if (!error) { migrated++; _cache[key] = payload; }
      else if (error.code === '23505') { /* duplicate, skip */ }
    } catch(e) {}
  }
  if (migrated > 0) console.log('[SupabaseStore] 迁移了', migrated, '个数据集');
}

window.SupabaseStore = SupabaseStore;
