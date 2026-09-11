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

  // 专用数据同步账号（authenticated 角色）。
  // 项目未开启匿名登录，匿名角色对 app_data_store 表被 RLS 拦截（读 0 行/写 42501），
  // 因此所有应用统一用此账号静默登录。账号在 Supabase Dashboard 确认邮箱后生效；
  // 若项目开启"自动确认注册"则首端会自动 signUp 建号。
  var SYNC_ACCOUNT_EMAIL = 'sync@lori.app';
  var SYNC_ACCOUNT_PASSWORD = 'LoriSync2026!';

  // ===== 状态 =====
  var sb = null;
  var cache = {};       // 内存缓存：原始key → 值
  var cacheTs = {};     // 每个 key 的云端 updated_at
  var initialized = false;
  var initPromise = null;
  var recentWrites = {}; // 记录本地写入时间，防止云端旧数据覆盖
  var authedUser = null;   // 当前认证用户（sync 账号或共享会话）
  var authFailReason = ''; // 认证失败原因（用于手机端可见提示）

  // ===== 手机端可见的云端同步状态徽标 =====
  // 手机/微信 webview 中看不到 console，认证失败（邮箱未确认、RLS 拦截、无共享会话）
  // 时用户只能看到"数据不显示"，无法定位原因。注入一个固定徽标提示连接状态。
  var badgeEl = null;
  function ensureBadge() {
    if (badgeEl) return badgeEl;
    try {
      if (!document || !document.body) return null;
    } catch (e) { return null; }
    var el = document.createElement('div');
    el.id = '__sb_sync_badge';
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
      // state: 'ok' 已连接 | 'warn' 未认证（仅本地） | 'error' 云端被拒
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
        el.textContent = '❌ 云端数据被拒绝（RLS/账号未确认） 点击刷新';
      }
    } catch (e) {}
  }
  // DOM 就绪后再挂徽标（脚本在 head 中同步执行时 body 尚不存在，showSyncStatus 会静默失败，
  // 因此注册一次性 DOMContentLoaded 回调按当时真实状态补挂）
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
      // 兜底：部分 webview 中 DOMContentLoaded 可能已错过
      window.addEventListener('load', function () {
        if (!badgeEl || badgeEl.style.display === 'none') { /* ok 徽标会自动隐藏，不强制重显 */ }
      });
    }
  }

  // 跳过同步的内部 key
  var SKIP_KEYS = ['_lastLocalSave_', 'isLoggedIn', 'username', 'userPhone', 'sb-', 'supabase', 'reconciliation_', '__purchaseContract'];

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
  // 关键：补丁打在 Storage.prototype 上而不是 localStorage 实例上。
  // 在 Storage 实例上赋值（localStorage.getItem = fn）属于未定义行为：
  //   - Chromium 会存为自有属性，且 getItem/setItem 等名字会混入 Object.keys(localStorage)；
  //   - WebKit(Safari) 的 Storage 命名属性 setter 可能把值序列化成字符串存储，
  //     导致 localStorage.getItem 变成字符串、调用即崩溃。
  // 打在原型上则所有浏览器行为一致、不污染键枚举、也不会影响方法名。
  var _lsInstance = window.localStorage;
  var _StorageProto = Object.getPrototypeOf(_lsInstance); // Storage.prototype
  var _origGetItem = _StorageProto.getItem;
  var _origSetItem = _StorageProto.setItem;
  var _origRemoveItem = _StorageProto.removeItem;

  // Storage 实例上的方法名（仅用于迁移枚举时的防御性过滤；原型补丁不会产生自有方法名）
  var RESERVED_KEYS = ['getItem', 'setItem', 'removeItem', 'key', 'clear', 'length'];
  function isReservedKey(key) {
    return RESERVED_KEYS.indexOf(key) >= 0;
  }

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

  // ===== 登录 =====
  async function ensureAuth() {
    if (!sb || !sb.auth) { authFailReason = '客户端未加载'; return null; }
    try {
      var result = await sb.auth.getUser();
      if (result.data && result.data.user) {
        authedUser = result.data.user;
        authFailReason = '';
        return authedUser;
      }

      // 尝试专用数据同步账号（authenticated 角色，绕开匿名 RLS 限制）
      try {
        var signInResult = await sb.auth.signInWithPassword({
          email: SYNC_ACCOUNT_EMAIL,
          password: SYNC_ACCOUNT_PASSWORD
        });
        if (signInResult.data && signInResult.data.user) {
          console.log('[SupabaseSync] Sync account auth OK');
          authedUser = signInResult.data.user;
          authFailReason = '';
          return authedUser;
        }
        var msg = signInResult.error ? signInResult.error.message : '';
        // 邮箱未确认：账号已注册但管理员未在 Supabase 执行 SQL 确认
        if (msg.indexOf('Email not confirmed') >= 0) {
          authFailReason = 'sync账号邮箱未确认（需执行SQL）';
          console.warn('[SupabaseSync] Sync account email NOT confirmed — 在 Supabase SQL Editor 执行: update auth.users set email_confirmed_at=now() where email=\'sync@lori.app\';');
          return null;
        }
        // 账号不存在（新项目首次运行）→ 尝试自动注册
        if (msg.indexOf('Invalid login credentials') >= 0) {
          var signUpResult = await sb.auth.signUp({
            email: SYNC_ACCOUNT_EMAIL,
            password: SYNC_ACCOUNT_PASSWORD
          });
          if (signUpResult.data && signUpResult.data.session && signUpResult.data.session.user) {
            console.log('[SupabaseSync] Sync account created & signed in');
            authedUser = signUpResult.data.session.user;
            authFailReason = '';
            return authedUser;
          }
          if (signUpResult.data && signUpResult.data.user) {
            // 注册成功但需邮箱确认：管理员在 Supabase 执行 SQL 确认后生效
            authFailReason = 'sync账号邮箱未确认（需执行SQL）';
            console.warn('[SupabaseSync] Sync account created but email not confirmed. Cloud sync disabled until confirmed.');
            return null;
          }
        }
        authFailReason = 'sync账号登录失败';
        console.warn('[SupabaseSync] Sync account auth failed:', msg, '— 云端同步不可用，请检查 Supabase 账号确认状态/RLS 策略');
      } catch (e2) {
        authFailReason = '认证请求异常';
        console.warn('[SupabaseSync] Auth error:', e2 && e2.message);
      }
      return null;
    } catch (e) {
      authFailReason = '认证检查异常';
      console.warn('[SupabaseSync] Auth error:', e);
      return null;
    }
  }

  // ===== 数据加载失败后的定时补救：纯 fetch REST 通道重拉并刷新本地/界面 =====
  // 场景：微信 webview 首次打开时 postgrest 请求被 abort、网络抖动、或 sync 账号刚确认，
  // 每 30 秒自动重拉；成功后写入原生 localStorage 并派发 cloud-data-updated 让界面重渲染。
  var cloudLoadDenied = false; // 云端数据是否未能加载成功（无论认证/网络/RLS 原因）
  async function retryAuthAndReload() {
    // 已成功加载（cloudLoadDenied=false）则无需重试
    if (!cloudLoadDenied) return;
    console.log('[SupabaseSync] Retry: reloading cloud data via REST channel...');
    var beforeCount = Object.keys(cache).length;
    var ok = await restLoadAll();
    if (!ok) return;
    // 把云端数据写入原生 localStorage（保证不经 patch 读取的路径也能拿到）
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
    cloudLoadDenied = false;
    showSyncStatus('ok');
    // 补跑一次迁移（此时认证已可用，本地数据可上云）
    try { await migrateLocalStorage(); } catch (e) {}
    var keys = Object.keys(cache);
    if (keys.length > 0) {
      console.log('[SupabaseSync] Retry succeeded, dispatching cloud-data-updated with', keys.length, 'keys');
      window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: keys, initial: true } }));
    }
  }

  // ===== 初始化 =====
  async function init() {
    if (initialized) return true;
    if (initPromise) return initPromise;

    initPromise = (async function () {
      console.log('[SupabaseSync] Initializing for app:', APP_ID);

      sb = await loadSupabase();
      var user = null;
      var cloudOk = false; // 数据是否真正从云端加载成功（请求成功即可，0 行也算成功）

      if (sb) {
        user = await ensureAuth();

        // 从云端加载所有数据（supabase-js postgrest client）
        try {
          var result = await sb.from(TABLE).select('store_key, payload, updated_at');
          if (result.data && !result.error) {
            cloudOk = true;
            var cloudRows = result.data.length;
            result.data.forEach(function (row) {
              var origKey = unprefixKey(row.store_key);
              if (origKey && cache[origKey] === undefined) {
                cache[origKey] = row.payload;
                cacheTs[origKey] = row.updated_at;
              }
            });
            console.log('[SupabaseSync] Loaded', cloudRows, 'rows from cloud via SDK (cache total:', Object.keys(cache).length + ')');
          } else if (result.error) {
            console.error('[SupabaseSync] SDK cloud load FAILED:', result.error.message);
            var errMsg = result.error.message || '';
            if (errMsg.indexOf('42501') >= 0 || errMsg.indexOf('permission') >= 0 || errMsg.indexOf('policy') >= 0 || errMsg.indexOf('row-level') >= 0) {
              cloudLoadDenied = true;
            }
          }
        } catch (e) {
          console.warn('[SupabaseSync] SDK cloud load threw:', e && e.message);
        }
      } else {
        console.error('[SupabaseSync] Supabase JS client (CDN) failed to load; will use pure-fetch REST channel');
      }

      // SDK/CDN 未成功加载数据 → 纯 fetch REST 直连兜底（不依赖 supabase-js postgrest）。
      // 微信 webview 等环境中 postgrest 请求会 ERR_ABORTED/Failed to fetch，但 auth 请求正常，
      // 用原生 fetch 带 access_token 直连 /rest/v1 可稳定读取。
      if (!cloudOk) {
        console.warn('[SupabaseSync] SDK 数据加载未成功，尝试纯 fetch REST 兜底通道...');
        var restOk = await restLoadAll();
        if (restOk) {
          cloudOk = true;
          if (!user) user = authedUser;
        }
      }

      // 状态判定与徽标
      if (cloudOk) {
        console.log('[SupabaseSync] Cloud data ready. User:', user ? 'authed' : 'none', 'cache keys:', Object.keys(cache).length);
      } else {
        // 数据没拿到：区分未认证（黄）与已认证但被拒/网络失败（红）
        if (!authedUser) {
          cloudLoadDenied = true;
          console.warn('[SupabaseSync] 云端不可用：未认证。原因:', authFailReason || '无会话');
        } else {
          cloudLoadDenied = true;
          console.warn('[SupabaseSync] 已认证但云端数据加载失败（网络/RLS）。');
        }
        // 每 30 秒重试（认证恢复 / 网络恢复后自动补拉数据）
        setInterval(retryAuthAndReload, 30000);
      }
      bindBadgeWhenReady();

      // 迁移 localStorage 中已有数据到云端
      await migrateLocalStorage();

      // 启动定时刷新
      setInterval(refreshFromCloud, REFRESH_INTERVAL);

      // 失败写入定时补发：网络抖动/请求失败的写入不必等页面关闭才重试，
      // 每 10 秒检查一次队列；初始化期间排队的写入也由此统一补发
      setInterval(flushPending, 10000);

      // 网络恢复：立即补发 + 立即拉取（手机/电脑端改动互相尽快可见）
      window.addEventListener('online', function () {
        flushPending();
        refreshFromCloud();
      });

      // 标签页重新可见：立即补发 + 立即拉取，无需等 30 秒轮询
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          flushPending();
          refreshFromCloud();
        }
      });

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
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: allKeys, initial: true } }));
        }
      } catch (e) {}

      return true;
    })();

    return initPromise;
  }

  // ===== 纯 fetch 的 REST 兜底通道 =====
  // 背景：部分环境（微信 webview / 某些 X5·WKWebView）下 supabase-js 的 postgrest 查询
  // 会 net::ERR_ABORTED / "Failed to fetch"，而同一时间 GoTrue 的 /auth/v1/token 请求却成功。
  // 因此提供完全不依赖 supabase-js postgrest client 的原生 fetch 通道：
  //   1) restLogin()  —— 优先复用 sb 会话 token，否则纯 fetch 用 sync 账号密码登录拿 access_token
  //   2) restLoadAll() —— 带 access_token 直连 /rest/v1 拉全表
  // 旧实现 loadViaREST 只带 apikey(anon) 不带用户 token，RLS 开启时永远读 0 行，等于无效回退。
  var restToken = null;
  async function restLogin() {
    if (restToken) return restToken;
    // 优先复用 supabase-js 已有会话的 token
    try {
      if (sb && sb.auth) {
        var s = await sb.auth.getSession();
        if (s && s.data && s.data.session && s.data.session.access_token) {
          restToken = s.data.session.access_token;
          if (!authedUser && s.data.session.user) authedUser = s.data.session.user;
          return restToken;
        }
      }
    } catch (e) {}
    // 纯 fetch 密码登录（不依赖 supabase-js）
    try {
      var resp = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SYNC_ACCOUNT_EMAIL, password: SYNC_ACCOUNT_PASSWORD })
      });
      if (resp.ok) {
        var j = await resp.json();
        if (j && j.access_token) {
          restToken = j.access_token;
          authedUser = j.user || { id: 'sync-rest' };
          authFailReason = '';
          console.log('[SupabaseSync] REST login OK (pure-fetch)');
          return restToken;
        }
      } else {
        var txt = '';
        try { txt = await resp.text(); } catch (e2) {}
        if (txt.indexOf('Email not confirmed') >= 0) authFailReason = 'sync账号邮箱未确认（需执行SQL）';
        else authFailReason = '登录失败(' + resp.status + ')';
        console.warn('[SupabaseSync] REST login failed', resp.status, txt.substring(0, 200));
      }
    } catch (e) {
      authFailReason = '网络请求失败';
      console.warn('[SupabaseSync] REST login error:', e && e.message);
    }
    return null;
  }

  async function restLoadAll() {
    var token = await restLogin();
    try {
      var headers = { 'apikey': SUPABASE_KEY, 'Accept': 'application/json' };
      // 关键：必须带用户 access_token，否则匿名角色在 RLS 下读 0 行
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var resp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=store_key,payload,updated_at', {
        headers: headers, cache: 'no-store'
      });
      if (!resp.ok) {
        console.warn('[SupabaseSync] REST load HTTP', resp.status);
        if (resp.status === 401 || resp.status === 403) cloudLoadDenied = true;
        return false;
      }
      var data = await resp.json();
      if (!Array.isArray(data)) return false;
      var n = 0;
      data.forEach(function (row) {
        var origKey = unprefixKey(row.store_key);
        if (origKey && cache[origKey] === undefined) {
          cache[origKey] = row.payload;
          cacheTs[origKey] = row.updated_at;
          n++;
        }
      });
      cloudLoadDenied = false;
      console.log('[SupabaseSync] REST loaded', data.length, 'rows,', n, 'new into cache (cache total:', Object.keys(cache).length + ')');
      return true;
    } catch (e) {
      console.warn('[SupabaseSync] REST load failed:', e && e.message);
      return false;
    }
  }

  // 兼容旧调用名
  function loadViaREST() { return restLoadAll(); }

  // ===== 迁移 localStorage → Supabase =====
  async function migrateLocalStorage() {
    try {
      // 一次性本地键名迁移：将旧的同名键（可能与其他应用冲突）搬到重映射后的本地键
      var remapKeys = Object.keys(LOCAL_KEY_REMAP);
      for (var rk = 0; rk < remapKeys.length; rk++) {
        var orig = remapKeys[rk];
        var localK = LOCAL_KEY_REMAP[orig];
        var oldRaw = nativeGet(orig);
        var newRaw = nativeGet(localK);
        // 只有当旧键有值且新键无值时才搬迁，避免覆盖已有新数据
        if (oldRaw !== null && oldRaw !== '' && (newRaw === null || newRaw === '')) {
          nativeSet(localK, oldRaw);
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

        // 保留键（方法补丁导致的 getItem/setItem 等名字）不是数据，直接跳过
        if (isReservedKey(nativeKey)) continue;

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
        var raw = nativeGet(nativeKey);
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
                rescued++;
              } else {
                console.error('[SupabaseSync] Rescue upload FAILED for', key, ':', rescueResult.error.message, '— 检查表 RLS 策略');
              }
            } catch (e) {}
            continue;
          }

          if (!cloudEmpty) {
            // 云端为准：将云端数据恢复到本地与缓存
            // （修复云端加载完成前应用初始化写入的过期空值残留）
            var rawC = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
            if (nativeGet(nativeKey) !== rawC) {
              nativeSet(nativeKey, rawC);
            }
            cache[key] = cloudVal;
            cacheTs[key] = new Date().toISOString();
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
            migrated++;
          } else {
            console.error('[SupabaseSync] Migrate upload FAILED for', key, ':', upsertResult.error.message, '— 检查表 RLS 策略');
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
      var upResult = await sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
      if (upResult && upResult.error) {
        console.error('[SupabaseSync] Cloud write FAILED for', key, ':', upResult.error.message, '— 检查表 RLS 策略');
        pendingWrites[key] = { value: value, ts: Date.now() };
      }
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
          // 同步到原生 localStorage（使用重映射后的本地键名）
          var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
          nativeSet(toLocalKey(origKey), raw);
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

  // ===== 原生 localStorage 读写小工具（显式绑定到 localStorage 实例） =====
  function nativeGet(k) { return _origGetItem.call(_lsInstance, k); }
  function nativeSet(k, v) { return _origSetItem.call(_lsInstance, k, v); }
  function nativeRemove(k) { return _origRemoveItem.call(_lsInstance, k); }

  // ===== 拦截 localStorage / sessionStorage（在 Storage.prototype 上打补丁）=====
  // 说明：只拦截 localStorage 实例（this === _lsInstance）；sessionStorage 原样透传。
  _StorageProto.getItem = function (key) {
    if (this === _lsInstance) {
      // 优先从缓存读取（缓存使用原始 key）
      if (cache[key] !== undefined) {
        var val = cache[key];
        return typeof val === 'string' ? val : JSON.stringify(val);
      }
      // 回退到原生 localStorage（可能被重映射为不同的本地键名）
      return _origGetItem.call(this, toLocalKey(key));
    }
    return _origGetItem.call(this, key);
  };

  _StorageProto.setItem = function (key, value) {
    if (this === _lsInstance) {
      // 写入原生 localStorage（使用重映射后的本地键名，避免与其他应用冲突）
      _origSetItem.call(this, toLocalKey(key), value);

      // 更新内存缓存（使用原始 key）
      try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }

      // 异步同步到云端（使用原始 key → store_key 为 APP_ID__key）
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

  // ===== 属性式访问说明（重要） =====
  // 本层在 Storage.prototype 上补丁 getItem/setItem/removeItem，
  // 只拦截"方法式"读写：localStorage.getItem('key') / setItem('key', v)。
  // 应用代码必须使用方法式读写；localStorage.key = value 这类属性式写入
  // 走 Storage 命名属性 setter，不经原型补丁，不会同步到云端。
  // 历史上访问器/实例方法补丁方案在 Chromium 与 WebKit 行为不一致
  // （递归、方法名混入键枚举、WebKit 赋值被序列化等），均已废弃。

  // ===== 启动 =====
  init();
})();
