/* ===== 通用 CloudBase 数据同步层 cloudbase-sync.js =====
 *
 * 功能（与原 supabase-sync.js 完全对齐，仅底层切换到腾讯云开发 CloudBase）：
 *   1. 动态加载共享 CloudBase 兼容层（apps/cloudbase/cloudbase.js）
 *   2. 用共享账号静默登录（authenticated 角色，可读写；失败回退匿名只读）
 *   3. 拦截 localStorage 读写，实时同步到 CloudBase app_data_store 表
 *   4. 定时从云端拉取最新数据，更新本地缓存
 *   5. 首次加载时自动迁移 localStorage 中的已有数据到云端
 *
 * 使用方式（与旧版一致，把脚本名换成 cloudbase-sync.js）：
 *   <script>window.SUPABASE_APP_ID='orderschedule';</script>
 *   <script src="../cloudbase-sync.js"></script>
 * （新代码也可用 window.CLOUDBASE_APP_ID，二者等价）
 *
 * 数据表：app_data_store（与 saintysys/wage 共用同一个 CloudBase 环境）
 *   PG 存储形态：{ id: store_key, data: { store_key, payload, updated_at } }
 *   store_key: 应用前缀 + 原始key（如 orderschedule__orders）
 *
 * 注意：此脚本必须在应用主逻辑之前加载。
 */
(function () {
  'use strict';

  // ===== 版本守卫：防止旧版 cloudbase-sync.js 在新版之后重新初始化 =====
  var SYNC_VERSION = '20260918b';
  if (window.__CLOUDBASE_SYNC_VERSION__) {
    console.warn('[CloudbaseSync] 检测到已加载版本 ' + window.__CLOUDBASE_SYNC_VERSION__ +
      '，当前版本 ' + SYNC_VERSION + ' 跳过初始化');
    return;
  }
  window.__CLOUDBASE_SYNC_VERSION__ = SYNC_VERSION;

  console.log('[CloudbaseSync] === cloudbase-sync.js v' + SYNC_VERSION + ' 加载 ===');

  // ===== 配置 =====
  var APP_ID = window.CLOUDBASE_APP_ID || window.SUPABASE_APP_ID || 'default';
  var TABLE = 'app_data_store';
  var REFRESH_INTERVAL = 15000; // 15 秒刷新一次
  var UPLOAD_DEBOUNCE = 400; // 同一 key 400ms 内多次写入只上传最后一次
  var SKIP_WRITE_WINDOW = 10000; // 10 秒内自己写入的 key 跳过云端覆盖

  // ===== 全局写入暂停（最可靠的保护机制）=====
  // 任何本地写入（setItem）后自动暂停云端→本地覆盖 30 秒
  // 导入 JSON 后暂停 10 分钟
  // pushAll 成功后自动恢复
  var _cloudWritePausedUntil = 0;

  function isCloudWritePaused() {
    return Date.now() < _cloudWritePausedUntil;
  }
  function pauseCloudWrites(ms) {
    var until = Date.now() + ms;
    if (until > _cloudWritePausedUntil) _cloudWritePausedUntil = until;
  }
  function resumeCloudWrites() {
    _cloudWritePausedUntil = 0;
  }
  // 本地写入后自动短时暂停
  var AUTO_PAUSE_MS = 30000; // 30 秒

  // 专用数据同步账号（authenticated 角色）。
  // CloudBase PG 模式中匿名(anon)角色默认只有 SELECT，写操作会被 RLS 拒绝，
  // 因此所有无登录表单的应用统一用此账号静默登录。
  // ⚠️ 需在 CloudBase 控制台「身份认证 → 用户管理」中创建该邮箱账号并设置密码，
  //    并在「登录方式」中开启「邮箱登录」与「匿名登录」（匿名用于只读兜底）。
  //    可通过 window.CLOUDBASE_SYNC_ACCOUNT 在页面内覆盖。
  var SYNC_ACCOUNT = window.CLOUDBASE_SYNC_ACCOUNT || {
    email: 'sync@lori.app',
    password: 'LoriSync2026!'
  };

  // ===== 状态 =====
  var sb = null;
  var clientReady = false;
  var cache = {};       // 内存缓存：原始key → 值
  var cacheTs = {};     // 每个 key 的云端 updated_at
  var initialized = false;
  var initPromise = null;
  var recentWrites = {}; // 记录本地写入时间，防止云端旧数据覆盖
  var authedUser = null;   // 当前认证用户（共享账号或匿名）
  var authFailReason = ''; // 认证失败原因（用于手机端可见提示）

  // ===== 手机端可见的云端同步状态徽标 =====
  var badgeEl = null;
  function ensureBadge() {
    if (badgeEl) return badgeEl;
    try {
      if (!document || !document.body) return null;
    } catch (e) { return null; }
    var el = document.createElement('div');
    el.id = '__cb_sync_badge';
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
        el.textContent = '❌ 云端数据被拒绝（账号/权限问题） 点击刷新';
      }
    } catch (e) {}
  }
  var badgeBound = false;
  var _lastLegacyBadge = ''; // 去重：状态文本没变就不重渲染（绿色"已连接"需在 4s 后自动隐藏）
  // 旧版黄条状态依据实时数据面结果判定（不只看 authedUser）：
  // REST 拉取成功即证明令牌有效；初始加载未完成时显示"正在连接"而非"无登录会话"
  function refreshLegacyBadge() {
    var state, msg;
    if (!initialLoadDone) {
      state = 'warn'; msg = '正在连接云端…';
    } else if (authedUser && cloudLoadDenied) {
      state = 'error'; msg = '';
    } else if (!cloudLoadDenied) {
      state = 'ok'; msg = '';
    } else {
      state = 'warn'; msg = authFailReason || '登录未完成，点击刷新重试';
    }
    var sig = state + '|' + msg;
    if (sig === _lastLegacyBadge) return;
    _lastLegacyBadge = sig;
    showSyncStatus(state, msg);
  }
  function bindBadgeWhenReady() {
    if (badgeBound) return;
    badgeBound = true;
    if (document && document.body) {
      refreshLegacyBadge();
    } else if (document && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', refreshLegacyBadge);
      window.addEventListener('load', refreshLegacyBadge);
    }
  }

  // 跳过同步的内部 key（后三个为兼容层写入的设备本地状态：语言 / 用户信息 / 登录凭据）
  var SKIP_KEYS = ['_lastLocalSave_', 'isLoggedIn', 'username', 'userPhone', 'sb-', 'tcb_', 'supabase', 'reconciliation_', '__purchaseContract', 'lang_', 'user_info_', 'credentials_'];

  // ===== 应用专属 localStorage 键名重映射（与旧版保持一致）=====
  // 每个应用只同步自己名下的 localStorage 键，避免上传时把别的应用数据串传。
  // APP_KEYS：精确匹配的键名；APP_KEY_PREFIXES：前缀匹配（处理公司级动态键）。
  // 页面可通过 window.CLOUDBASE_APP_KEYS / window.CLOUDBASE_APP_KEY_PREFIXES 覆盖。
  var _DEFAULT_APP_KEYS = {
    orderschedule: ['production_orders_data', 'calendarNotes', 'memos'],
    wicketorders: ['orderRecords', 'exportRecords', 'receiptRecords', 'invoiceRecords',
      'indexPaymentRecords', 'customerRecords', 'memoRecords', 'businessRecords',
      'highlightedFollowupNos', 'deliveryNoticeRecords', 'orderLabelsData',
      'deliveryNoticePhotos', 'cdg_companies', 'cdg_records', 'cdg_details',
      'cdg_shipments', 'cdg_shipment_page_size', 'cdg_products', 'cdg_records_page_size',
      'shipmentDetailData', 'shipmentDetailConsignee'],
    wage: ['wage_records', 'wage_employees', 'wage_processes', 'wage_orders',
      'wage_adjustments', 'wage_calendarEvents', 'wage_calendarEventTypes',
      'wage_dropdownOptions'],
    purchase: ['currentCompany', 'companyNames', 'todos',
      'reconciliation_transactions', 'reconciliation_params',
      'invoice_management_invoices', 'invoiceData', 'invoiceExportData',
      'woodenBoxCalculatorResults'],
    incomeexpense: ['currentCompany', 'todos',
      'reconciliation_transactions', 'reconciliation_params'],
    stainlessbusiness: ['certificateData', 'calculationParams', 'gradeComparisons',
      'plateCalculatorSavedResults', 'plateCalcData', 'plateCalcResult',
      'quotationRemarksUpdated', 'hs_label_load', 'hs_label_prefill_batch',
      'hs_label_prefill'],
    saintysys: ['sht_sample_data_v2', 'sampleReviewRecords', 'consumptions',
      'clothing_cost_styles_v3', 'clothing_cost_categories_v3',
      'nas_folder_perms', 'styleImages', 'orders', 'draft',
      'permissions', 'dataVersion', 'nas_config']
  };
  var _DEFAULT_APP_KEY_PREFIXES = {
    purchase: ['transactions_', 'lastUpdated_', 'contracts_', 'receipts_', 'returns_', 'purchaseOrders_'],
    incomeexpense: ['transactions_', 'lastUpdated_'],
    wicketorders: ['quotation_products_', 'invoice_products_', 'contract_products_'],
    saintysys: ['currentCompany']
  };
  var APP_KEYS = window.CLOUDBASE_APP_KEYS || _DEFAULT_APP_KEYS[APP_ID] || [];
  var APP_KEY_PREFIXES = window.CLOUDBASE_APP_KEY_PREFIXES || _DEFAULT_APP_KEY_PREFIXES[APP_ID] || [];

  // 判断一个未带其他应用前缀的 localStorage 键是否属于当前应用
  function isAppKey(key) {
    // 已有当前应用前缀的键直接通过
    if (key.indexOf(APP_ID + '__') === 0) return true;
    // 精确匹配
    if (APP_KEYS.indexOf(key) >= 0) return true;
    // 前缀匹配（动态键如 transactions_company1）
    for (var i = 0; i < APP_KEY_PREFIXES.length; i++) {
      if (key.indexOf(APP_KEY_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  var LOCAL_KEY_REMAP = (function () {
    if (APP_ID === 'stainlessbusiness') {
      // 不锈钢业务的通讯录/收藏联系人和服装系统同名，改用 sb_ 前缀存储
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
    if (storeKey && storeKey.indexOf(prefix) === 0) return storeKey.substring(prefix.length);
    return null;
  }

  // ===== 保存原始 localStorage 方法（补丁打在 Storage.prototype 上）=====
  // 不透明源文档（sandboxed iframe / srcdoc 等）访问 window.localStorage 会抛
  // SecurityError，需 try-catch 兜底，缓存降级为纯内存模式。
  var _lsInstance = null;
  try { _lsInstance = window.localStorage; } catch (e) { _lsInstance = null; }
  var _StorageProto = _lsInstance ? Object.getPrototypeOf(_lsInstance) : Storage.prototype;
  var _origGetItem = _StorageProto.getItem;
  var _origSetItem = _StorageProto.setItem;
  var _origRemoveItem = _StorageProto.removeItem;

  var RESERVED_KEYS = ['getItem', 'setItem', 'removeItem', 'key', 'clear', 'length'];
  function isReservedKey(key) {
    return RESERVED_KEYS.indexOf(key) >= 0;
  }

  function nativeGet(k) {
    try { return _origGetItem.call(_lsInstance, k); }
    catch (e) { return null; }
  }
  function nativeSet(k, v) {
    try { return _origSetItem.call(_lsInstance, k, v); }
    catch (e) {}
  }

  // ===== 动态加载共享 CloudBase 兼容层 =====
  // 兼容层相对路径固定为 apps/cloudbase/cloudbase.js，
  // 依据本脚本自身 URL 推导，避免不同目录深度引用时路径出错。
  function resolveModuleUrl() {
    try {
      var src = (document.currentScript && document.currentScript.src) || '';
      if (src) {
        // 本文件位于 apps/cloudbase-sync.js，兼容层位于 apps/cloudbase/cloudbase.js
        // 沿用本文件 ?v= 版本号，避免兼容层更新后浏览器仍用旧缓存
        var v = (src.match(/[?&]v=([^&]+)/) || [])[1];
        return new URL('cloudbase/cloudbase.js' + (v ? '?v=' + v : ''), src).href;
      }
    } catch (e) {}
    return 'cloudbase/cloudbase.js';
  }

  async function loadClient() {
    // 必须在 import 前设置共享账号，兼容层初始化（bootstrapAuth）时读取
    window.CLOUDBASE_SYNC = SYNC_ACCOUNT;
    try {
      var mod = await import(/* @vite-ignore */ resolveModuleUrl());
      sb = (mod && mod.supabase) || window.supabase || null;
      clientReady = !!sb;
      return sb;
    } catch (e) {
      console.error('[CloudbaseSync] 兼容层加载失败:', e && e.message ? e.message : e);
      authFailReason = 'CloudBase 模块加载失败';
      return null;
    }
  }

  // 等待认证态稳定（共享账号登录或匿名登录完成）
  async function waitAuth() {
    if (!sb) return null;
    // 兼容层 auth.getUser 在未登录时返回错误；登录完成后返回用户
    var tries = 0;
    while (tries < 30) {
      try {
        var result = await sb.auth.getUser();
        if (result && result.data && result.data.user) {
          authedUser = result.data.user;
          authFailReason = '';
          return authedUser;
        }
      } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 500); });
      tries++;
    }
    authFailReason = authFailReason || '共享账号登录未就绪（仅匿名只读）';
    return null;
  }

  var cloudLoadDenied = false;
  var initialLoadDone = false; // 首次云端加载是否已落定（成功或失败），供旧版黄条区分"连接中"与"未连接"
  var reauthTried = false; // 每轮会话失效只强制重登一次，避免频繁登录触发风控

  // 判断是否为网络类失败（请求被超时中止 / 网关无响应），
  // 与认证/权限类错误（401/403/permission）区分开，后者才需要强制重登
  function isNetAbort(e) {
    if (!e) return false;
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
    var msg = String(e.message || '');
    return /aborted|timeout/i.test(msg);
  }

  // ===== 只拉当前应用行的 REST 直连（绕过兼容层全表扫描）=====
  // 物理表 app_data_store 只有 id(text) 和 data(jsonb) 两列，
  // store_key/payload/updated_at 都是 data 内字段。
  // 用 PostgREST jsonb 路径过滤 data->>store_key=like.<APP>__* 只拉当前应用行。
  async function fetchAppRows() {
    // 导入保护期 / 全局暂停期：不发网络请求，直接返回 null
    if (isImportProtected() || isCloudWritePaused()) {
      console.log('[CloudbaseSync] fetchAppRows 跳过：导入保护期或写入暂停期内');
      return null;
    }
    var env = window.CLOUDBASE_ENV;
    var token = null;
    // 短重试取 token（最多 5 次 × 500ms = 2.5s），等 SDK 登录完成
    if (typeof window.CloudbaseGetAccessToken === 'function') {
      for (var t = 0; t < 5 && !token; t++) {
        try { token = await window.CloudbaseGetAccessToken(); } catch (e) {}
        if (!token) await new Promise(function (r) { setTimeout(r, 500); });
      }
    }
    if (!env || !token) return null; // 信号：REST 不可用，调用方回退兼容层

    var base = 'https://' + env + '.api.tcloudbasegateway.com/v1/rdb/rest/' + TABLE;
    var prefix = APP_ID + '__';
    var allRows = [];
    var offset = 0;
    var PAGE = 100;
    while (true) {
      // select=id,data（物理列），jsonb 过滤 data->>store_key
      var url = base + '?select=id,data' +
        '&data-%3E%3Estore_key=like.' + encodeURIComponent(prefix + '*') +
        '&offset=' + offset + '&limit=' + PAGE;
      // 每页请求 30 秒超时（慢网络下 10s 太紧，大 jsonb 分页必被 abort）；
      // 超时中止自动重试 1 次再判失败
      var res;
      for (var attempt = 0; attempt < 2; attempt++) {
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 30000);
        try {
          res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token },
            signal: ctrl.signal
          });
          break;
        } catch (e) {
          if (attempt === 0 && isNetAbort(e)) continue; // 网络中止 → 重试一次
          throw e;
        } finally {
          clearTimeout(timer);
        }
      }
      if (!res.ok) {
        var txt = '';
        try { txt = await res.text(); } catch (e) {}
        throw new Error('REST ' + res.status + ': ' + txt.slice(0, 200));
      }
      var rows = await res.json();
      if (!Array.isArray(rows)) break;
      // 展平 data jsonb → 扁平行（与兼容层 _expand 一致）
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var d = (r && typeof r.data === 'object' && r.data !== null) ? r.data : {};
        allRows.push(Object.assign({}, d, { id: r.id, _id: r.id }));
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
      if (offset > 5000) break;
    }
    return allRows;
  }

  // ===== 导入保护期 =====
  // 用户导入/恢复 JSON 后、尚未手动"上传云端"之前，页面会 location.reload()
  // 导致 recentWrites / pendingWrites 等内存状态全部丢失。
  // 重新加载后 loadAllFromCloud → processCloudRows 会直接用云端旧数据覆盖本地新导入的数据。
  // 用 sessionStorage 持久化一个保护期时间戳（跨 reload 存活），在此期间
  // processCloudRows 和 refreshFromCloud 都跳过对"本地已有数据"的云端覆盖。
  // pushAll（手动上传云端）成功后自动清除保护期。
  var IMPORT_PROTECT_KEY = '__cb_import_protect_until__';
  function isImportProtected() {
    try {
      var ts = sessionStorage.getItem(IMPORT_PROTECT_KEY);
      // Fallback: check cookie (sessionStorage might not persist in some contexts)
      if (!ts) {
        var match = document.cookie.match(/__cb_import_protect_until__=(\d+)/);
        if (match) ts = match[1];
      }
      if (!ts) return false;
      return Date.now() < parseInt(ts, 10);
    } catch (e) { return false; }
  }
  function clearImportProtection() {
    try { sessionStorage.removeItem(IMPORT_PROTECT_KEY); } catch (e) {}
    try { document.cookie = '__cb_import_protect_until__=;path=/;max-age=0'; } catch (e) {}
  }

  // ===== 拉取全量数据到缓存 =====
  // 处理云端行数据：去重 → LWW → 写入缓存。供 loadAllFromCloud 和 refreshFromCloud 共用。
  function processCloudRows(rows) {
    // 全局写入暂停：任何本地写入后 30 秒内 / 导入后 10 分钟内，
    // 完全拒绝云端→本地覆盖（包括 cache 和 localStorage）
    if (isCloudWritePaused()) {
      // 暂停期间：只更新本地 cache 的时间戳，不覆盖数据
      // 用本地 localStorage 值填充 cache（确保 getItem 读到本地数据）
      try {
        for (var pk in _lsInstance) {
          var origK = unprefixKey(pk);
          if (origK && cache[origK] === undefined) {
            var pv = _origGetItem.call(_lsInstance, pk);
            if (pv !== null && pv !== '') {
              try { cache[origK] = JSON.parse(pv); } catch (e) { cache[origK] = pv; }
            }
          }
        }
      } catch (e) {}
      return 0;
    }
    // 同一 store_key 可能存在多条重复行（历史 upsert 缺陷遗留），
    // 只认 updated_at 最新的那条，避免旧/空数据抢先入缓存
    var newest = {};
    for (var i = 0; i < rows.length; i++) {
      var rw = rows[i];
      if (!rw.store_key) continue;
      var prev = newest[rw.store_key];
      if (!prev || new Date(rw.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
        newest[rw.store_key] = rw;
      }
    }
    var n = 0;
    var importProtected = isImportProtected();
    if (importProtected) {
      console.log('[CloudbaseSync] 导入保护期内：云端数据仅入缓存，不覆盖本地 localStorage');
    }
    Object.keys(newest).forEach(function (sk) {
      var row = newest[sk];
      var origKey = unprefixKey(sk);
      if (!origKey) return;
      // 导入保护期内：本地已有数据时完全跳过（不覆盖 cache 也不覆盖 localStorage）
      if (importProtected) {
        var localRaw0 = nativeGet(toLocalKey(origKey));
        if (localRaw0 !== null && localRaw0 !== undefined && localRaw0 !== '') {
          try { cache[origKey] = JSON.parse(localRaw0); } catch (e) { cache[origKey] = localRaw0; }
          return;
        }
      }
      // 本地刚写入保护：与 refreshFromCloud 相同的完整保护链
      var nowMs = Date.now();
      if (recentWrites[origKey] && nowMs - recentWrites[origKey] < SKIP_WRITE_WINDOW) {
        // 本地刚写入 → 用本地值填充 cache，不覆盖
        var lr = nativeGet(toLocalKey(origKey));
        if (lr !== null && lr !== undefined && lr !== '') {
          try { cache[origKey] = JSON.parse(lr); } catch (e) { cache[origKey] = lr; }
        }
        return;
      }
      if (pendingWrites[origKey]) {
        // 上传失败的挂起写入 → 本地一定比云端新
        var pr = nativeGet(toLocalKey(origKey));
        if (pr !== null && pr !== undefined && pr !== '') {
          try { cache[origKey] = JSON.parse(pr); } catch (e) { cache[origKey] = pr; }
        }
        return;
      }
      if (_debounceTimers[origKey]) {
        // 防抖窗口内 → 本地即最新
        var dr = nativeGet(toLocalKey(origKey));
        if (dr !== null && dr !== undefined && dr !== '') {
          try { cache[origKey] = JSON.parse(dr); } catch (e) { cache[origKey] = dr; }
        }
        return;
      }
      // 上传队列中的 key → 跳过
      for (var qi2 = 0; qi2 < _uploadQueue.length; qi2++) {
        if (_uploadQueue[qi2].key === origKey) {
          var qr = nativeGet(toLocalKey(origKey));
          if (qr !== null && qr !== undefined && qr !== '') {
            try { cache[origKey] = JSON.parse(qr); } catch (e) { cache[origKey] = qr; }
          }
          return;
        }
      }
      // 正在上传中的 key → 跳过
      if (_isUploading && _currentUploadKey === origKey) {
        var ur = nativeGet(toLocalKey(origKey));
        if (ur !== null && ur !== undefined && ur !== '') {
          try { cache[origKey] = JSON.parse(ur); } catch (e) { cache[origKey] = ur; }
        }
        return;
      }
      // LWW：只有云端 updated_at 严格新于本地已知同步时间才覆盖。
      // cacheTs 未设置（首次加载）时直接采用云端，避免本地旧数据（如 60 条）
      // 抢先入缓存后把云端新数据（740 条）挡在外面。
      var localTs = cacheTs[origKey];
      if (localTs) {
        try {
          if (new Date(row.updated_at).getTime() <= new Date(localTs).getTime()) return;
        } catch (e) {}
      }
      var val = row.payload;
      // 云端值为空而本机非空时，用本机值兜底（防止云端空行清空本机数据）
      if (isEmptyValue(val)) {
        var nv = nativeGet(toLocalKey(origKey));
        if (nv !== null && nv !== undefined && nv !== '') {
          try { val = JSON.parse(nv); } catch (e) { val = nv; }
        }
      }
      cache[origKey] = val;
      cacheTs[origKey] = row.updated_at;
      try {
        var raw = typeof val === 'string' ? val : JSON.stringify(val);
        nativeSet(toLocalKey(origKey), raw);
      } catch (e) {}
      n++;
    });
    cloudLoadDenied = false;
    console.log('[CloudbaseSync] 加载', rows.length, '行（去重后', Object.keys(newest).length, '个键），新增入缓存', n, '个（缓存共', Object.keys(cache).length, '个）');
    return true;
  }

  async function loadAllFromCloud() {
    if (!sb) return false;
    // 导入保护期 / 全局暂停期：完全不拉取云端数据，避免网络返回后覆盖本地
    if (isImportProtected() || isCloudWritePaused()) {
      console.log('[CloudbaseSync] loadAllFromCloud 跳过：导入保护期或写入暂停期内，不拉取云端');
      // 用本地 localStorage 值填充 cache（确保 getItem 读到本地数据）
      try {
        for (var pk in _lsInstance) {
          var origK = unprefixKey(pk);
          if (origK && cache[origK] === undefined) {
            var pv = _origGetItem.call(_lsInstance, pk);
            if (pv !== null && pv !== '') {
              try { cache[origK] = JSON.parse(pv); } catch (e) { cache[origK] = pv; }
            }
          }
        }
      } catch (e) {}
      return false;
    }
    try {
      // 优先用 REST 直连（只拉当前应用行），失败回退兼容层全表
      var rows = null;
      try {
        rows = await fetchAppRows();
      } catch (e) {
        console.warn('[CloudbaseSync] REST 按应用过滤拉取失败，回退兼容层:', e && e.message ? e.message : e);
      }
      if (rows) {
        return processCloudRows(rows);
      }
      // 回退：兼容层全表 select（加 30s 超时防止卡死）
      var result = await withTimeout(
        sb.from(TABLE).select('store_key, payload, updated_at'),
        30000
      );
      if (result.error) {
        console.error('[CloudbaseSync] 云端加载失败:', result.error.message || result.error);
        cloudLoadDenied = true;
        return false;
      }
      return processCloudRows(result.data || []);
    } catch (e) {
      console.warn('[CloudbaseSync] 云端加载异常:', e && e.message ? e.message : e);
      cloudLoadDenied = true;
      return false;
    }
  }

  async function retryAuthAndReload() {
    if (!cloudLoadDenied) return false;
    console.log('[CloudbaseSync] 重试：重新拉取云端数据...');
    refreshFailCount = 0; // 重置失败计数
    // 首次重试前强制重登一次（会话失效场景下单纯重拉不会成功）
    if (!reauthTried && window.CloudbaseForceReauth) {
      reauthTried = true;
      try { await window.CloudbaseForceReauth(); } catch (e) {}
    }
    var beforeCount = Object.keys(cache).length;
    var ok = await loadAllFromCloud();
    if (!ok) return false;
    reauthTried = false;
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
    showSyncStatus('ok');
    try { await migrateLocalStorage(); } catch (e) {}
    // 断线恢复后同样补传云端缺失的本地键
    try { await autoUploadLocalOnlyKeys(); } catch (e) {}
    if (changedKeys.length > 0) {
      window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys, initial: true } }));
    }
    return true;
  }

  // ===== 自动补传：云端缺失但本地存在的键 =====
  // 背景：同步层只在 localStorage 写入（编辑）时自动上传，历史数据的迁移是手动的；
  // 若云端行不存在（如 CloudBase 环境重建、清空云端后未重推），
  // 本机完整的历史数据永远不会回到云端，手机端小程序也就拉不到最新数据。
  // 这里在初始化（及断线恢复）后扫描一次：本地有值且云端无此键 → 走既有上传队列补传。
  // 安全性：云端已有该键（含空值）绝不覆盖，交给正常 LWW 流程；
  //         空库设备（新浏览器）没有本地键，不会误传任何东西。
  async function autoUploadLocalOnlyKeys() {
    if (!sb || !initialized || cloudLoadDenied) return;
    // 刚执行过"清空云端"：本次会话首轮自动补传必须跳过，否则会把刚被清掉的本地数据
    // 又回灌到空云端，表现为"清空没作用"。标记只消费一次（随后正常同步恢复）。
    try {
      var clearedAt = sessionStorage.getItem('__cb_cloud_cleared_at__');
      if (clearedAt) {
        sessionStorage.removeItem('__cb_cloud_cleared_at__');
        console.log('[CloudbaseSync] 检测到刚清空云端，跳过本轮自动补传');
        return;
      }
    } catch (e) {}
    var queued = 0;
    try {
      var total = localStorage.length;
      for (var i = 0; i < total; i++) {
        var nativeKey = localStorage.key(i);
        if (!nativeKey || isReservedKey(nativeKey)) continue;
        var key;
        if (REMAP_REVERSE[nativeKey] !== undefined) {
          key = REMAP_REVERSE[nativeKey];
        } else if (REMAP_ORIGINALS[nativeKey]) {
          continue;
        } else {
          key = nativeKey;
        }
        if (shouldSkip(key)) continue;
        // 只补传属于当前应用的键（与 pushAll 规则一致）
        if (!isAppKey(key)) continue;
        // 云端已有该键（哪怕值为空）→ 不动
        if (cache[key] !== undefined) continue;
        var raw = nativeGet(nativeKey);
        if (raw === null || raw === undefined || raw === '') continue;
        var value;
        try { value = JSON.parse(raw); } catch (e) { value = raw; }
        if (isEmptyValue(value)) continue;
        syncToCloud(key, value);
        queued++;
      }
    } catch (e) {
      console.warn('[CloudbaseSync] 自动补传扫描异常:', e && e.message ? e.message : e);
      return;
    }
    if (queued > 0) {
      console.log('[CloudbaseSync] 自动补传云端缺失的本地键:', queued, '个');
    }
  }

  // ===== 初始化 =====
  async function init() {
    if (initialized) return true;
    if (initPromise) return initPromise;

    initPromise = (async function () {
      console.log('[CloudbaseSync] 初始化，应用前缀:', APP_ID);

      await loadClient();

      // 先做本地键名迁移（纯本地操作，不阻塞）
      try { await migrateLocalStorage(); } catch (e) {}

      // 从 sessionStorage 恢复导入保护期（跨 reload 存活）
      if (isImportProtected()) {
        pauseCloudWrites(600000); // 恢复 10 分钟暂停
        console.log('[CloudbaseSync] ✅ 检测到导入保护期，已恢复暂停，_cloudWritePausedUntil =', new Date(_cloudWritePausedUntil).toLocaleTimeString());
      } else {
        console.log('[CloudbaseSync] 无导入保护期，isImportProtected() =', false);
      }

      // 立即标记 initialized，让页面 getItem 可以用本地数据渲染，
      // 不必等云端加载完成。云端数据后台到达后再触发更新事件。
      initialized = true;
      console.log('[CloudbaseSync] 本地就绪（initialized=true），后台加载云端数据...');

      // 注册定时器和事件监听
      setInterval(refreshFromCloud, REFRESH_INTERVAL);
      setInterval(flushPending, 10000);
      setInterval(refreshLegacyBadge, 3000); // 旧版黄条自愈：认证完成/断线恢复后自动变色，不靠一次性渲染
      window.addEventListener('online', function () { flushPending(); refreshFromCloud(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { flushPending(); refreshFromCloud(); } });
      window.addEventListener('beforeunload', flushPending);
      window.addEventListener('offline', function () { notifyStatus('offline'); });
      bindBadgeWhenReady();

      // 后台异步：等认证 → 拉取云端数据 → 更新缓存 → 触发页面刷新
      (async function () {
        // 直接尝试拉取云端数据——fetchAppRows 内部通过 CloudbaseGetAccessToken
        // 自取 Bearer token，不需要等 waitAuth / CloudbaseWhenReady。
        // 跳过 waitAuth（30 次轮询 × 网络延迟）可从 10 分钟降到秒级。
        if (sb) {
          await loadAllFromCloud();
        } else {
          cloudLoadDenied = true;
        }
        initialLoadDone = true;
        refreshLegacyBadge();

        if (cloudLoadDenied) {
          notifyStatus('offline');
          // 指数退避重试：30s → 60s → 120s → 120s（上限）
          var retryDelay = 30000;
          var retryMaxDelay = 120000;
          function scheduleRetry() {
            setTimeout(function () {
              retryAuthAndReload().then(function (ok) {
                if (ok && !cloudLoadDenied) return;
                retryDelay = Math.min(retryDelay * 2, retryMaxDelay);
                scheduleRetry();
              }).catch(function () {
                retryDelay = Math.min(retryDelay * 2, retryMaxDelay);
                scheduleRetry();
              });
            }, retryDelay);
          }
          scheduleRetry();
        } else {
          notifyStatus('idle');
          console.log('[CloudbaseSync] 云端数据加载完成。应用:', APP_ID);
        }

        // 后台异步获取用户信息（不阻塞数据加载）
        if (sb) {
          try {
            var result = await Promise.race([
              sb.auth.getUser(),
              new Promise(function (_, rej) { setTimeout(function () { rej(new Error('getUser 超时')); }, 5000); })
            ]);
            if (result && result.data && result.data.user) {
              authedUser = result.data.user;
              authFailReason = '';
              console.log('[CloudbaseSync] 用户:', authedUser.email || authedUser.id || 'authed');
            }
            refreshLegacyBadge();
          } catch (e) {}
        }

        // 云端缺失但本地存在的键自动补传
        try { await autoUploadLocalOnlyKeys(); } catch (e) {}

        try {
          var allKeys = Object.keys(cache);
          if (allKeys.length > 0) {
            window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: allKeys, initial: true } }));
          }
        } catch (e) {}
      })().catch(function (e) {
        console.warn('[CloudbaseSync] 后台云端加载异常:', e && e.message ? e.message : e);
        cloudLoadDenied = true;
        initialLoadDone = true;
        notifyStatus('offline');
        refreshLegacyBadge();
      });

      return true;
    })();

    return initPromise;
  }

  // ===== 迁移（仅本地键名重映射，不自动上传云端） =====
  // 手动同步模式下，上传统一由 CloudbaseSync.pushAll() 负责。
  async function migrateLocalStorage() {
    try {
      // 本地键名重映射搬迁（如 stainlessbusiness 的 contacts → sb_contacts）
      var remapKeys = Object.keys(LOCAL_KEY_REMAP);
      for (var rk = 0; rk < remapKeys.length; rk++) {
        var orig = remapKeys[rk];
        var localK = LOCAL_KEY_REMAP[orig];
        var oldRaw = nativeGet(orig);
        var newRaw = nativeGet(localK);
        if (oldRaw !== null && oldRaw !== '' && (newRaw === null || newRaw === '')) {
          nativeSet(localK, oldRaw);
          console.log('[CloudbaseSync] 本地键迁移:', orig, '→', localK);
        }
      }
      console.log('[CloudbaseSync] 手动同步模式：已完成本地键名重映射，未自动上传（请用"上传云端"按钮手动推送）');
    } catch (e) {
      console.warn('[CloudbaseSync] 迁移异常:', e && e.message ? e.message : e);
    }
  }

  // ===== 同步到云端 =====
  var pendingWrites = {};
  // 防抖 + 串行上传：避免连续编辑时并发请求堆积导致上传变慢
  var _debounceTimers = {};   // key → timerId
  var _uploadQueue = [];      // 待上传队列 [{key, value}]
  var _isUploading = false;   // 是否正在上传（串行控制）
  var _currentUploadKey = null; // 当前正在上传的 key（防止 refreshFromCloud 覆盖正在上传的 key）
  var _uploadTimeoutMs = 30000; // 单次上传超时（避免 Promise 永不 settle 导致队列卡死；慢网络下 15s 会误杀大 payload）

  /** 防抖入口：同一 key 在 UPLOAD_DEBOUNCE ms 内多次写入只保留最后一次 */
  function syncToCloud(key, value) {
    recentWrites[key] = Date.now();

    if (!sb || !initialized) {
      pendingWrites[key] = { value: value, ts: Date.now() };
      notifyStatus('pending');
      return;
    }

    // 清除该 key 之前的定时器（防抖）
    if (_debounceTimers[key]) {
      clearTimeout(_debounceTimers[key]);
    }

    notifyStatus('pending');
    _debounceTimers[key] = setTimeout(function () {
      delete _debounceTimers[key];
      // 加入上传队列（同 key 去重：只保留最新值）
      for (var i = 0; i < _uploadQueue.length; i++) {
        if (_uploadQueue[i].key === key) {
          _uploadQueue[i].value = value;
          return; // 已更新旧项，无需再 push
        }
      }
      _uploadQueue.push({ key: key, value: value });
      // 刷新 recentWrites，确保在上传完成前不会被 refreshFromCloud 覆盖
      recentWrites[key] = Date.now();
      processUploadQueue();
    }, UPLOAD_DEBOUNCE);
  }

  /** 给 Promise 加超时（CloudBase HTTP 请求可能永不 settle） */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('operation timeout (' + ms + 'ms)'));
      }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); },
                   function (e) { clearTimeout(timer); reject(e); });
    });
  }

  var refreshFailCount = 0;
  var REFRESH_FAIL_THRESHOLD = 3;
  var refreshNetFailCount = 0;      // 网络类失败（超时/中止）单独计数
  var REFRESH_NET_FAIL_THRESHOLD = 3;
  var _netPauseUntil = 0;           // 网络慢冷却期：此时间戳前跳过定时刷新（2 分钟后自动恢复）

  /** 串行处理上传队列：同一时间只发一个请求，避免并发抢带宽 */
  var _consecutiveFails = 0;   // 连续失败计数（用于触发自动重登）
  var _reauthing = false;      // 是否正在强制重登
  var _lastReauthAt = 0;       // 上次强制重登时间（60s 冷却）
  function processUploadQueue() {
    if (_isUploading) return;
    if (_reauthing) return; // 重登期间暂停出队，重登完成后自动恢复
    if (_uploadQueue.length === 0) {
      // 队列清空，若无挂起失败写入则置 idle
      if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');
      else notifyStatus('error'); // 有待重试项，保持 error
      return;
    }

    _isUploading = true;
    var item = _uploadQueue.shift();
    var key = item.key;
    var value = item.value;
    _currentUploadKey = key;

    // 检查是否有更新的值已入队（跳过旧值）
    var hasNewer = _uploadQueue.some(function (it) { return it.key === key; });

    withTimeout(doUpload(key, value), _uploadTimeoutMs).then(function () {
      _isUploading = false;
      _currentUploadKey = null;
      _consecutiveFails = 0;
      delete pendingWrites[key]; // 成功则清除挂起
      // 上传成功后更新 cacheTs 为当前时间，代表本地与云端已同步，
      // 后续 refreshFromCloud 不会用同一时刻的云端数据重复覆盖。
      cacheTs[key] = new Date().toISOString();
      // 上传成功后仍刷新 recentWrites，确保下一轮 refreshFromCloud 不会覆盖
      recentWrites[key] = Date.now();
      if (hasNewer) {
        // 同 key 有更新值在队列里，跳过当前这次（用最新值）
        processUploadQueue();
        return;
      }
      processUploadQueue();
    }, function (err) {
      _isUploading = false;
      _currentUploadKey = null;
      // 上传失败的加入待重试队列
      pendingWrites[key] = { value: value, ts: Date.now() };
      _consecutiveFails++;
      console.warn('[CloudbaseSync] 上传失败(' + _consecutiveFails + '):', key, err && err.message ? err.message : err);
      notifyStatus('error');

      // 连续失败 ≥3 次 → 登录态可能已失效（token 过期 /auth/v1/token 400），
      // 自动调用强制重登（60 秒冷却，避免无限循环），重登完成后继续消化队列。
      // 网络超时类失败不触发重登（JWT 仍有效），交给待重试队列自然恢复
      if (_consecutiveFails >= 3 && !isNetAbort(err) && (Date.now() - _lastReauthAt) > 60000 &&
          typeof window !== 'undefined' && typeof window.CloudbaseForceReauth === 'function') {
        _reauthing = true;
        _lastReauthAt = Date.now();
        _consecutiveFails = 0;
        console.log('[CloudbaseSync] 连续上传失败，尝试强制重登恢复登录态...');
        Promise.resolve(window.CloudbaseForceReauth()).catch(function () {}).then(function () {
          _reauthing = false;
          processUploadQueue();
        });
        return;
      }
      processUploadQueue();
    });
  }

  /** 实际执行单次 upsert */
  function doUpload(key, value) {
    return new Promise(function (resolve, reject) {
      var p = sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_key' });
      // TcbQueryBuilder 是 thenable，用 .then() 执行
      p.then(function (upResult) {
        if (upResult && upResult.error) {
          console.error('[CloudbaseSync] 云端写入失败:', key, upResult.error.message);
          reject(upResult.error);
        } else {
          resolve(upResult);
        }
      }, reject);
    });
  }

  function notifyStatus(state) {
    try {
      if (window.CloudSyncStatus && typeof window.CloudSyncStatus.setState === 'function') {
        window.CloudSyncStatus.setState(state);
      }
    } catch (e) {}
  }

  function flushPending() {
    var keys = Object.keys(pendingWrites);
    if (keys.length === 0) return;
    notifyStatus('pending');
    var queued = 0;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = pendingWrites[key];
      var value = entry && entry.value !== undefined ? entry.value : entry;
      delete pendingWrites[key];

      if (entry && entry.ts && cacheTs[key]) {
        try {
          if (new Date(entry.ts) < new Date(cacheTs[key])) continue;
        } catch (e) {}
      }

      if (isEmptyValue(value)) {
        var raw = nativeGet(toLocalKey(key));
        var cur;
        try { cur = (raw === null || raw === undefined) ? undefined : JSON.parse(raw); } catch (e) { cur = raw; }
        if (!isEmptyValue(cur)) continue;
      }
      // 直接加入上传队列（不走防抖，立即重试）
      _uploadQueue.push({ key: key, value: value });
      queued++;
    }
    if (queued > 0) {
      processUploadQueue();
    } else {
      // 没有需要重试的，直接 idle
      if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');
    }
  }

  // ===== 从云端刷新（只下载，不写云端） =====
  async function refreshFromCloud() {
    if (!sb || !initialized || cloudLoadDenied) return false;
    // 全局写入暂停：本地写入/导入后不拉取云端数据
    if (isCloudWritePaused()) return false;
    // 网络慢冷却期：暂停定时刷新，冷却结束后由下一个定时周期自动恢复（无需人工干预）
    if (_netPauseUntil && Date.now() < _netPauseUntil) return false;

    try {
      // 优先 REST 直连（只拉当前应用行），失败回退兼容层全表
      var rows = null;
      var restErr = null;
      try {
        rows = await fetchAppRows();
      } catch (e) {
        restErr = e;
        console.warn('[CloudbaseSync] 刷新 REST 拉取失败:', e && e.message ? e.message : e);
      }
      if (!rows && !(restErr && isNetAbort(restErr))) {
        // 回退兼容层全表。REST 因网络中止失败时跳过：
        // 全表扫描比按应用过滤更重，同一网络下必然同样超时，白等 30 秒
        try {
          var fbResult = await withTimeout(sb.from(TABLE).select('store_key, payload, updated_at'), 30000);
          if (fbResult && fbResult.data && !fbResult.error) {
            rows = fbResult.data;
          }
        } catch (e2) {}
      }
      if (!rows) {
        // 网络类失败（超时/中止）：不算会话失效，连续多次后只冷却 2 分钟再自动恢复，
        // 绝不置 cloudLoadDenied（那会把"网速慢"当成"登录失效"判死，底部栏误报"云端未连接"）
        if (restErr && isNetAbort(restErr)) {
          refreshNetFailCount++;
          if (refreshNetFailCount >= REFRESH_NET_FAIL_THRESHOLD) {
            _netPauseUntil = Date.now() + 120000;
            refreshNetFailCount = 0;
            console.warn('[CloudbaseSync] 网络连续超时，暂停定时刷新 2 分钟后自动恢复');
            notifyStatus('error');
          }
          return false;
        }
        // 认证/权限类失败：连续失败计数，超过阈值后暂停刷新（避免 token 失效时无限 30s 超时循环）
        refreshFailCount++;
        if (refreshFailCount >= REFRESH_FAIL_THRESHOLD) {
          cloudLoadDenied = true;
          console.warn('[CloudbaseSync] 连续 ' + refreshFailCount + ' 次刷新失败，暂停定时刷新（等重试机制恢复）');
          notifyStatus('offline');
        }
        return false;
      }
      // 成功时重置失败计数
      refreshFailCount = 0;
      refreshNetFailCount = 0;
      if (Object.keys(pendingWrites).length === 0) notifyStatus('idle');

      var now = Date.now();
      var changedKeys = [];

      // 去重：同一 store_key 只保留 updated_at 最新的一行（历史重复行防御），
      // 否则扫描顺序不稳定时旧/空重复行可能在同一轮刷新里来回覆盖
      var newestRows = {};
      for (var ri = 0; ri < rows.length; ri++) {
        var rowRaw = rows[ri];
        if (!rowRaw.store_key) continue;
        var prevRaw = newestRows[rowRaw.store_key];
        if (!prevRaw || new Date(rowRaw.updated_at).getTime() > new Date(prevRaw.updated_at).getTime()) {
          newestRows[rowRaw.store_key] = rowRaw;
        }
      }

      Object.keys(newestRows).forEach(function (sk) {
        var row = newestRows[sk];
        var origKey = unprefixKey(row.store_key);
        if (!origKey) return;
        // 导入保护期内：本地已有数据时跳过云端覆盖（保护刚导入的数据）
        if (isImportProtected()) {
          var localRaw = nativeGet(toLocalKey(origKey));
          if (localRaw !== null && localRaw !== undefined && localRaw !== '') return;
        }
        if (recentWrites[origKey] && now - recentWrites[origKey] < SKIP_WRITE_WINDOW) return;
        // 关键保护：该 key 有上传失败的挂起写入 → 本地一定比云端新（否则上传不会失败遗留），
        // 绝不能让云端旧数据覆盖。典型场景：导入 JSON 后 token 失效上传失败，
        // 15 秒后刷新若不跳过该 key，刚导入的数据会被云端旧数据覆盖导致"数据全部消失"
        if (pendingWrites[origKey]) return;
        // 防抖窗口内的 key 也跳过：上传还没发出，本地即最新
        if (_debounceTimers[origKey]) return;
        // 上传队列中的 key 也跳过：已入队但尚未完成上传，本地一定比云端旧数据新
        // 这是编辑记录被覆盖的主要原因：防抖定时器已删除、上传尚未完成、
        // recentWrites 10s 窗口已过期 → 云端旧数据趁虚而入
        for (var qi = 0; qi < _uploadQueue.length; qi++) {
          if (_uploadQueue[qi].key === origKey) return;
        }
        // 正在上传中的 key 也跳过（已从队列 shift 出但尚未完成上传）
        if (_isUploading && _currentUploadKey === origKey) return;

        var newVal = row.payload;
        var oldVal = cache[origKey];
        var cloudTs = row.updated_at;
        var localTs = cacheTs[origKey];

        // ========== 时序比较：只有云端更新时间 >= 本地才覆盖 ==========
        // 这是多端同步的关键：避免旧数据覆盖新数据
        if (localTs && cloudTs) {
          var localTime = new Date(localTs).getTime();
          var cloudTime = new Date(cloudTs).getTime();
          if (cloudTime <= localTime) {
            // 云端不比本地新，跳过（包含同一时刻写入）
            return;
          }
        }

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
          var raw = typeof newVal === 'string' ? newVal : JSON.stringify(newVal);
          nativeSet(toLocalKey(origKey), raw);
          changedKeys.push(origKey);
        }
      });

      if (changedKeys.length > 0) {
        console.log('[CloudbaseSync] 云端更新:', changedKeys.join(', '));
        window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: changedKeys } }));
      }
      return true;
    } catch (e) {
      console.warn('[CloudbaseSync] 刷新异常:', e && e.message ? e.message : e);
      if (Object.keys(pendingWrites).length === 0) notifyStatus('offline');
      return false;
    }
  }

  // ===== 拦截 localStorage（Storage.prototype 补丁；sessionStorage 透传）=====
  // 注意：部分浏览上下文（如 sandboxed iframe、srcdoc、不透明源文档）访问 Storage
  // 会抛出 SecurityError "Access is denied for this document"，必须 try-catch 兜底，
  // 否则保存/读取操作直接抛异常导致功能不可用。
  _StorageProto.getItem = function (key) {
    if (this === _lsInstance) {
      if (cache[key] !== undefined) {
        var val = cache[key];
        return typeof val === 'string' ? val : JSON.stringify(val);
      }
      try { return _origGetItem.call(this, toLocalKey(key)); }
      catch (e) { return null; }
    }
    try { return _origGetItem.call(this, key); }
    catch (e) { return null; }
  };

  _StorageProto.setItem = function (key, value) {
    if (this === _lsInstance) {
      try { _origSetItem.call(this, toLocalKey(key), value); } catch (e) {}

      try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }
      // 注意：不在此设置 cacheTs[key] = now。
      // 若把本地写入时间当作"数据更新时间"，会导致 refreshFromCloud 的 LWW 比较
      // 中 localTime 永远 >= cloudTime，云端新数据永远无法覆盖本地旧数据
      // （典型：A 机上传 740 条，B 机本地有 60 条旧数据，下载后仍显示 60 条）。
      // 本地写入的防覆盖保护由 recentWrites（10s 窗口）+ pendingWrites 承担。
      // cacheTs 只在「从云端加载」或「上传成功」后更新，代表真实云端同步时间。
      recentWrites[key] = Date.now();
      // 全局自动暂停：任何本地写入后暂停云端→本地覆盖 30 秒
      pauseCloudWrites(AUTO_PAUSE_MS);

      // 自动同步到云端（防抖 + 串行上传，避免并发堆积）。
      // LWW 时序比较 + upsert(store_key) 保证不会用旧数据覆盖云端新数据，
      // 也不会产生重复行。
      // 内部键（auth 会话 / 语言 / 凭据等设备本地状态）不上云，避免污染云端表。
      if (!shouldSkip(key)) {
        syncToCloud(key, cache[key]);
      }
      return;
    }
    try { return _origSetItem.call(this, key, value); } catch (e) {}
  };

  _StorageProto.removeItem = function (key) {
    if (this === _lsInstance) {
      try { _origRemoveItem.call(this, toLocalKey(key)); } catch (e) {}
      delete cache[key];
      delete cacheTs[key];
      recentWrites[key] = Date.now();

      // 自动删除云端对应行（异步，不阻塞）
      if (sb && initialized) {
        sb.from(TABLE).delete().eq('store_key', prefixKey(key)).then(function () {}, function () {});
      }
      return;
    }
    try { return _origRemoveItem.call(this, key); } catch (e) {}
  };

  // ===== 手动上传：把本地所有数据推送到云端（覆盖云端） =====
  // onProgress 可选：onProgress({phase:'start'|'progress'|'reauth'|'cleanup', current, total, key, ok})
  async function pushAll(alsoDelete, onProgress) {
    if (!sb) return { ok: false, msg: '同步层未就绪' };
    function emit(p) { if (typeof onProgress === 'function') { try { onProgress(p); } catch (e) {} } }

    // 空库保护：本地一个非 skip key 都没有时禁止上传
    var keysToUpload = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var nativeKey = localStorage.key(i);
        if (!nativeKey || isReservedKey(nativeKey)) continue;
        var key;
        if (REMAP_REVERSE[nativeKey] !== undefined) {
          key = REMAP_REVERSE[nativeKey];
        } else if (REMAP_ORIGINALS[nativeKey]) {
          continue;
        } else {
          key = nativeKey;
        }
        // 只上传属于当前应用的键（按已知键名/前缀匹配），避免串应用上传
        if (!isAppKey(key)) continue;
        if (shouldSkip(key)) continue;
        var raw = nativeGet(nativeKey);
        if (raw === null || raw === undefined || raw === '') continue;
        keysToUpload.push({ key: key, raw: raw });
      }
    } catch (e) {
      // localStorage 不可用（不透明源文档），跳过本地遍历
    }

    if (keysToUpload.length === 0) {
      return { ok: false, msg: '本地无数据可上传（空库保护，避免清空云端）' };
    }
    emit({ phase: 'start', total: keysToUpload.length });

    // 等认证就绪后再开始上传（避免无 token 时所有 upsert 挂起或必败）
    if (window.CloudbaseWhenReady) {
      try { await Promise.race([
        window.CloudbaseWhenReady(),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('认证等待超时(15s)')); }, 15000); })
      ]); } catch (e) { console.warn('[CloudbaseSync] 上传前认证未就绪:', e && e.message ? e.message : e); }
    }

    notifyStatus('pending');
    var okCount = 0, failCount = 0;
    var pushReauthed = false; // 本次 pushAll 最多强制重登一次（60s 冷却，与队列路径共享 _lastReauthAt）
    for (var j = 0; j < keysToUpload.length; j++) {
      var item = keysToUpload[j];
      var value;
      try { value = JSON.parse(item.raw); } catch (e) { value = item.raw; }
      var uploaded = false;
      // 最多尝试 2 次：第 1 次失败且疑似登录态失效（token 过期 FetchError）→
      // 强制重登后重试一次。队列路径(processUploadQueue)有自动重登，
      // 手动上传路径原来没有，导致 token 过期时点一次按钮就是几百个必败请求。
      for (var attempt = 0; attempt < 2 && !uploaded; attempt++) {
        try {
          var res = await withTimeout(doUpload(item.key, value), _uploadTimeoutMs);
          uploaded = true;
          okCount++;
          cache[item.key] = value;
          cacheTs[item.key] = new Date().toISOString();
        } catch (e) {
          // 超时/网络中止类失败重登无济于事（JWT 仍有效），直接重试或入待重试队列
          if (attempt === 0 && !pushReauthed && !isNetAbort(e) &&
              (Date.now() - _lastReauthAt) > 60000 &&
              typeof window.CloudbaseForceReauth === 'function') {
            pushReauthed = true;
            _lastReauthAt = Date.now();
            console.warn('[CloudbaseSync] 上传失败(' + item.key + ')，强制重登后重试...');
            emit({ phase: 'reauth', key: item.key });
            try { await window.CloudbaseForceReauth(); } catch (e2) {}
            continue;
          }
          console.warn('[CloudbaseSync] 上传失败', item.key, ':', e && e.message ? e.message : e);
        }
      }
      if (!uploaded) {
        failCount++;
        // 进入待重试队列，让 flushPending/processUploadQueue（含自动重登）稍后自动恢复
        pendingWrites[item.key] = { value: value, ts: Date.now() };
      }
      emit({ phase: 'progress', current: j + 1, total: keysToUpload.length, key: item.key, ok: uploaded });
    }

    // 可选：删除云端有、本地没有的 key（清理残留）
    // ⚠️ 安全规则：仅当本机该键"存在且为空"（用户在本机已清空）才删云端；
    // 本机根本没有该键（新设备/新浏览器/尚未拉取）时绝不删除，
    // 否则空库设备点一次"上传云端"就会清空云端全部业务数据
    if (alsoDelete) {
      try {
        emit({ phase: 'cleanup', current: 0, total: 0 });
        var APP_PREFIX = APP_ID + '__';
        // 只拉当前应用的 store_key（REST 直连），不再全表扫描；加超时防卡住
        var cloudKeys = null;
        try {
          cloudKeys = await withTimeout(fetchAppRows(), 30000);
        } catch (e) {
          console.warn('[CloudbaseSync] cleanup REST 拉取失败:', e && e.message ? e.message : e);
        }
        if (!cloudKeys) {
          var listRes = await sb.from(TABLE).select('store_key');
          if (listRes && !listRes.error && Array.isArray(listRes.data)) {
            cloudKeys = listRes.data.filter(function (r) {
              return r.store_key && r.store_key.indexOf(APP_PREFIX) === 0;
            });
          } else {
            cloudKeys = [];
          }
        }
        var localSet = new Set(keysToUpload.map(function (x) { return prefixKey(x.key); }));
        if (Array.isArray(cloudKeys)) {
          var stale = [];
          for (var k = 0; k < cloudKeys.length; k++) {
            var sk = cloudKeys[k].store_key;
            if (!sk || sk.indexOf(APP_PREFIX) !== 0 || localSet.has(sk)) continue;
            var origK = unprefixKey(sk);
            var rawLocal = origK ? nativeGet(toLocalKey(origK)) : null;
            if (rawLocal !== null && rawLocal !== undefined && isEmptyValue(rawLocal)) stale.push(sk);
          }
          for (var d = 0; d < stale.length; d++) {
            try { await withTimeout(sb.from(TABLE).delete().eq('store_key', stale[d]), _uploadTimeoutMs); } catch (e) {}
            emit({ phase: 'cleanup', current: d + 1, total: stale.length });
          }
        }
      } catch (e) {}
    }

    if (failCount === 0) {
      notifyStatus('idle');
      // 手动上传成功 → 清除导入保护期，恢复正常云端同步
      clearImportProtection();
      resumeCloudWrites(); // 上传成功后恢复云端同步
      return { ok: true, uploaded: okCount, failed: 0 };
    }
    notifyStatus('error');
    return { ok: false, uploaded: okCount, failed: failCount };
  }

  // ===== 手动下载：强制从云端拉取全量数据并更新本地 =====
  async function pullAll() {
    if (!sb) return { ok: false, msg: '同步层未就绪' };
    var before = JSON.stringify(cache);
    var ok = await refreshFromCloud();
    var after = JSON.stringify(cache);
    var changed = before !== after;
    return { ok: true, changed: changed };
  }

  // "清空云端"前调用：立即清空在途/待发上传队列，避免删除间隙把数据重新 upsert 回去
  function prepareForCloudClear() {
    try {
      Object.keys(pendingWrites).forEach(function (k) { delete pendingWrites[k]; });
      Object.keys(_debounceTimers).forEach(function (k) {
        clearTimeout(_debounceTimers[k]);
        delete _debounceTimers[k];
      });
      _uploadQueue.length = 0;
      _consecutiveFails = 0;
      console.log('[CloudbaseSync] 已暂停在途上传，配合清空云端');
    } catch (e) {}
  }

  // 暴露状态供调试 / 手动同步按钮调用
  window.CloudbaseSync = {
    appId: APP_ID,
    isReady: function () { return initialized; },
    cache: cache,
    reload: retryAuthAndReload,
    pullAll: pullAll,
    pushAll: pushAll,
    prepareForCloudClear: prepareForCloudClear,
    // 导入保护期：导入/恢复 JSON 后调用，防止 reload 后云端旧数据覆盖本地
    setImportProtection: function (ms) {
      try {
        var until = Date.now() + (ms || 600000); // 默认 10 分钟
        sessionStorage.setItem('__cb_import_protect_until__', String(until));
        // Cookie backup (sessionStorage might not persist in some contexts)
        document.cookie = '__cb_import_protect_until__=' + until + ';path=/;max-age=' + Math.floor((ms || 600000) / 1000);
        pauseCloudWrites(ms || 600000); // 同时设置全局暂停
        console.log('[CloudbaseSync] 导入保护期已设置，持续至', new Date(until).toLocaleTimeString());
      } catch (e) {}
    },
    clearImportProtection: clearImportProtection,
    isImportProtected: isImportProtected,
    // 全局写入暂停
    pauseCloudWrites: pauseCloudWrites,
    resumeCloudWrites: resumeCloudWrites,
    isCloudWritePaused: isCloudWritePaused
  };

  // ===== 启动 =====
  init();
})();

/* ===== CloudSyncStatus 指示灯模块（在激活的 Tab 按钮内嵌彩色圆点）=====
 * 状态: idle(绿,已同步) / pending(黄,上传中) / error(红,上传失败) / offline(灰,未连接)
 * 由各同步层调用 window.CloudSyncStatus.setState(state) 切换状态
 * 自动注入 .__cs_dot 到当前激活的 tab/nav 元素中（支持多种 selector）
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
      '.__cs_dot {',
      '  display:inline-block; width:8px; height:8px; border-radius:50%;',
      '  margin-left:6px; vertical-align:middle; background:#10b981;',
      '  box-shadow:0 0 4px rgba(16,185,129,0.6);',
      '  transition:background .3s, box-shadow .3s; pointer-events:none;',
      '}',
      '.__cs_dot.__cs_pending { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,.7); animation:__cs_pulse 1.2s infinite; }',
      '.__cs_dot.__cs_error   { background:#ef4444; box-shadow:0 0 6px rgba(239,68,68,.7);  animation:__cs_pulse .8s infinite; }',
      '.__cs_dot.__cs_offline { background:#9ca3af; box-shadow:none; }',
      '@keyframes __cs_pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }',
      '.__cs_fallback_badge {',
      '  position:fixed; right:8px; bottom:8px; z-index:99998;',
      '  display:inline-flex; align-items:center; gap:4px;',
      '  padding:4px 8px; border-radius:12px;',
      '  font:11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '  color:#fff; background:rgba(16,185,129,.92);',
      '  box-shadow:0 2px 8px rgba(0,0,0,.25);',
      '  -webkit-tap-highlight-color:transparent;',
      '}',
      '.__cs_fallback_badge.__cs_pending { background:rgba(245,158,11,.95); }',
      '.__cs_fallback_badge.__cs_error   { background:rgba(239,68,68,.95); cursor:pointer; pointer-events:auto; }',
      '.__cs_fallback_badge.__cs_offline { background:rgba(156,163,175,.95); }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(css);
  }

  // 合并为一次 querySelectorAll（逗号分隔的选择器）
  var TAB_SELECTOR = '.nav-tab.active, .nav-item.active, .sidebar-menu-item.active, .nav-link.active, .company-btn.bg-primary, .ant-tabs-tab-active, [role="tab"][aria-selected="true"]';

  function findActiveTabs() {
    try {
      var list = document.querySelectorAll(TAB_SELECTOR);
      var arr = [];
      for (var i = 0; i < list.length; i++) arr.push(list[i]);
      return arr;
    } catch (e) { return []; }
  }

  // rAF 节流：合并短时间内多次调用，避免频繁 DOM 查询
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

    // 清理非激活 tab 上的残留圆点
    var allDots = document.querySelectorAll('.__cs_dot');
    for (var k = 0; k < allDots.length; k++) {
      var parent = allDots[k].parentElement;
      if (parent && !tabSet.has(parent)) {
        parent.removeChild(allDots[k]);
      }
    }

    // 找不到任何激活 tab 时，回退为右下角徽标
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
    // 每 3 秒刷新一次（足够跟上 tab 切换，避免频繁 DOM 查询）
    // 注意：不使用 MutationObserver 监听整个 body，大表格页面会导致严重卡顿
    setInterval(scheduleRefresh, 3000);
  }

  function boot() {
    try { injectCSS(); refreshDots(); startAutoRefresh(); } catch (e) {}
  }

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
