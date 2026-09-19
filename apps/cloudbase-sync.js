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
  var SYNC_VERSION = '20260918n';
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

  // ===== 版本号机制（Excel 保存模式：本地编辑不自动上传，只更新本地版本号）=====
  // localVersions[key] = 本地最后修改时间戳(ms)
  // 云端行的 updated_at = 云端最后修改时间戳
  // LWW：打开应用时比较两者，取较新者；手动下载时提示用户选择
  var localVersions = {};
  var LOCAL_VERSIONS_KEY = '__cb_local_versions__';
  function loadLocalVersions() {
    try {
      var raw = _origGetItem.call(_lsInstance, LOCAL_VERSIONS_KEY);
      localVersions = raw ? JSON.parse(raw) : {};
    } catch (e) { localVersions = {}; }
  }
  function saveLocalVersions() {
    try {
      _origSetItem.call(_lsInstance, LOCAL_VERSIONS_KEY, JSON.stringify(localVersions));
    } catch (e) {}
  }

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
      'shipmentDetailData', 'shipmentDetailConsignee',
      // 报价系统（与 plm-work 小程序 trade 模块共用）
      'quotationRecords', 'libraryProducts', 'quotationSystemUnits',
      'quotationSystemPaymentRatios', 'quotationSystemPaymentMethods', 'quotationSystemTerms'],
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
  // 注册表条目：字符串 = 前缀匹配；正则字面量 = 完全匹配。
  // 注意：purchase 用 companyA/companyB，收支表（incomeexpense）用 company1/company2，
  // 两边都有 transactions_<公司> 键，单纯前缀匹配会把另一应用公司的历史串味行算进来，
  // 因此用正则按真实公司 id 收窄。
  var _DEFAULT_APP_KEY_PREFIXES = {
    purchase: [
      /^transactions_(companyA|companyB)$/,
      /^lastUpdated_(companyA|companyB)$/,
      /^(contracts|receipts|returns|purchaseOrders)_(companyA|companyB)$/
    ],
    incomeexpense: [
      /^transactions_(company1|company2)$/,
      /^lastUpdated_(company1|company2)$/
    ],
    wicketorders: ['quotation_products_', 'invoice_products_', 'contract_products_']
  };
  var APP_KEYS = window.CLOUDBASE_APP_KEYS || _DEFAULT_APP_KEYS[APP_ID] || [];
  var APP_KEY_PREFIXES = window.CLOUDBASE_APP_KEY_PREFIXES || _DEFAULT_APP_KEY_PREFIXES[APP_ID] || [];

  // 判断一个未带其他应用前缀的 localStorage 键是否属于当前应用
  function isAppKey(key) {
    // 已有当前应用前缀的键直接通过（双前缀垃圾由 cloudKeyToOurs 另行拦截）
    if (key.indexOf(APP_ID + '__') === 0) return true;
    // 精确匹配
    if (APP_KEYS.indexOf(key) >= 0) return true;
    // 动态键：字符串前缀匹配 或 正则完全匹配
    for (var i = 0; i < APP_KEY_PREFIXES.length; i++) {
      var p = APP_KEY_PREFIXES[i];
      if (p instanceof RegExp) { if (p.test(key)) return true; }
      else if (key.indexOf(p) === 0) return true;
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
  // 关键：document.currentScript 只在脚本同步执行期间有效；兼容层改为懒加载后，
  // loadClient 可能在用户点击按钮时才执行，那时 currentScript 已为 null。
  // 因此在 IIFE 同步阶段就把自身 URL 捕获下来。
  var _selfSrc = '';
  try {
    _selfSrc = (document.currentScript && document.currentScript.src) || '';
    if (!_selfSrc) {
      // 兜底：按文件名在 <script> 标签里找（currentScript 失效场景）
      var _ss = document.querySelectorAll('script[src]');
      for (var _si = 0; _si < _ss.length; _si++) {
        var _u = _ss[_si].src || '';
        if (/cloudbase-sync\.js(\?|$)/.test(_u)) { _selfSrc = _u; break; }
      }
    }
  } catch (e) {}

  function resolveModuleUrl() {
    try {
      var src = _selfSrc;
      if (src) {
        // 本文件位于 apps/cloudbase-sync.js，兼容层位于 apps/cloudbase/cloudbase.js
        // 沿用本文件 ?v= 版本号，避免兼容层更新后浏览器仍用旧缓存
        var v = (src.match(/[?&]v=([^&]+)/) || [])[1];
        return new URL('cloudbase/cloudbase.js' + (v ? '?v=' + v : ''), src).href;
      }
    } catch (e) {}
    return 'cloudbase/cloudbase.js';
  }

  // 懒加载单例：兼容层（含重量级 CloudBase SDK + 登录引导）只在首次需要时加载一次。
  // 打开页面/切换标签时不阻塞本地渲染，等浏览器空闲时再后台预取。
  var _clientPromise = null;
  function loadClient() {
    if (_clientPromise) return _clientPromise;
    _clientPromise = (async function () {
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
        _clientPromise = null; // 允许重试
        return null;
      }
    })();
    return _clientPromise;
  }

  // 供手动按钮（上传/下载/清空）await：确保兼容层已加载完成
  async function ensureClient() {
    if (sb) return sb;
    return loadClient();
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
    console.warn('[CloudbaseSync] 🔍 fetchAppRows 被调用' +
      ' paused=' + isCloudWritePaused() + ' importProtected=' + isImportProtected());
    // 导入保护期 / 全局暂停期：不发网络请求，直接返回 null
    if (isImportProtected() || isCloudWritePaused()) {
      console.log('[CloudbaseSync] fetchAppRows 跳过：导入保护期或写入暂停期内');
      return null;
    }
    var env = window.CLOUDBASE_ENV;
    // 取有效 token：登录未完成则等待；refresh token 失效导致凭证被清空时主动重登。
    // 整段加 20s 上限，避免重登网络异常时无限等待。
    var token = null;
    try {
      token = await withTimeout(ensureFreshToken(), 20000);
    } catch (e) { token = null; }
    if (!env || !token) return null; // 信号：REST 不可用，调用方回退兼容层

    var base = 'https://' + env + '.api.tcloudbasegateway.com/v1/rdb/rest/' + TABLE;
    var prefix = APP_ID + '__';
    var allRows = [];
    var offset = 0;
    var PAGE = 100;
    while (true) {
      // select=id,data（物理列），jsonb 过滤 data->>store_key
      // SQL LIKE 通配符是 %（encodeURIComponent → %25），不能用 *（实测本网关虽兼容，但非标准）
      var url = base + '?select=id,data' +
        '&data-%3E%3Estore_key=like.' + encodeURIComponent(prefix + '%') +
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
            signal: ctrl.signal,
            cache: 'no-store' // 不用浏览器缓存：上传/清理后必须读到最新物理行
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
      // Fallback: check localStorage (bypasses interceptor, survives refresh)
      if (!ts) {
        try { ts = _origGetItem.call(_lsInstance, toLocalKey('__cb_import_protect_until__')); } catch (e2) {}
      }
      if (!ts) return false;
      return Date.now() < parseInt(ts, 10);
    } catch (e) { return false; }
  }
  function clearImportProtection() {
    try { sessionStorage.removeItem(IMPORT_PROTECT_KEY); } catch (e) {}
    try { document.cookie = '__cb_import_protect_until__=;path=/;max-age=0'; } catch (e) {}
    try { _origSetItem.call(_lsInstance, toLocalKey('__cb_import_protect_until__'), ''); } catch (e) {}
  }

  // ===== 本地 / 云端记录条数统计（供页面徽标显示，便于用户对比）=====
  // cloudCounts 为 null 表示云端尚未加载；加载后为 { 原始key: 条数 }
  var cloudCounts = null;

  // 计算一个数据集的"记录条数"：数组取长度，记录映射取键数，其它按 0
  function countValue(val) {
    if (val === null || val === undefined) return 0;
    if (Array.isArray(val)) return val.length;
    if (typeof val === 'object') {
      try { return Object.keys(val).length; } catch (e) { return 0; }
    }
    return 0;
  }

  // 云端 store_key → 本机键名；只认真正属于当前应用的键。
  // 历史污染：旧版无差别上传曾把其它应用数据（wage_records/orderRecords/cdg_* 等）、
  // 内部会话键（credentials_/lang_/tcb_auth_session）、双前缀垃圾键
  // （incomeexpense__incomeexpense__todos）都写到当前应用前缀下。
  // 这些行绝不能参与计数、下载覆盖或对比，否则右下角条数虚高、旧数据还会"复活"。
  function cloudKeyToOurs(sk) {
    if (!sk || sk.indexOf(APP_ID + '__') !== 0) return null;
    var origKey = sk.substring((APP_ID + '__').length);
    if (!origKey || origKey.indexOf(APP_ID + '__') === 0) return null; // 双前缀垃圾
    if (!isAppKey(origKey)) return null;    // 非本应用注册键（其它应用串味数据）
    if (shouldSkip(origKey)) return null;   // 内部/凭据/语言等
    return origKey;
  }

  // 用云端原始行刷新云端条数快照（同一 store_key 取最新行，独立于 LWW 合并结果）
  function ingestCloudCounts(rows) {
    var newest = {};
    try {
      for (var i = 0; i < rows.length; i++) {
        var rw = rows[i];
        if (!rw || !rw.store_key) continue;
        if (!cloudKeyToOurs(rw.store_key)) continue; // 只统计本应用真实业务键
        var prev = newest[rw.store_key];
        if (!prev || new Date(rw.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
          newest[rw.store_key] = rw;
        }
      }
    } catch (e) { return; }
    var counts = {};
    Object.keys(newest).forEach(function (sk) {
      var origKey = cloudKeyToOurs(sk);
      if (origKey) counts[origKey] = countValue(newest[sk].payload);
    });
    cloudCounts = counts;
  }

  // 返回 { cloudLoaded, localTotal, cloudTotal, perKey:[{key,label,local,cloud}] }
  function getRecordCounts() {
    var local = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var nk = localStorage.key(i);
        if (!nk || isReservedKey(nk)) continue;
        var ok;
        if (REMAP_REVERSE[nk] !== undefined) ok = REMAP_REVERSE[nk];
        else if (REMAP_ORIGINALS[nk]) continue;
        else ok = nk;
        if (!isAppKey(ok) || shouldSkip(ok)) continue;
        var raw = nativeGet(toLocalKey(ok));
        if (raw === null || raw === undefined || raw === '') { local[ok] = 0; continue; }
        try { local[ok] = countValue(JSON.parse(raw)); }
        catch (e) { local[ok] = 0; }
      }
    } catch (e) {}

    var union = {};
    Object.keys(local).forEach(function (k) { union[k] = true; });
    if (cloudCounts) Object.keys(cloudCounts).forEach(function (k) { union[k] = true; });

    var perKey = [];
    var localTotal = 0, cloudTotal = 0;
    Object.keys(union).sort().forEach(function (k) {
      var lc = local[k] || 0;
      var cc = cloudCounts ? (cloudCounts[k] || 0) : null;
      localTotal += lc;
      if (cc !== null) cloudTotal += cc;
      perKey.push({ key: k, local: lc, cloud: cc });
    });

    return {
      appId: APP_ID,
      cloudLoaded: !!cloudCounts,
      localTotal: localTotal,
      cloudTotal: cloudCounts ? cloudTotal : null,
      perKey: perKey
    };
  }

  // ===== 拉取全量数据到缓存 =====
  // 处理云端行数据：去重 → LWW → 写入缓存。供 loadAllFromCloud 和 refreshFromCloud 共用。
  function processCloudRows(rows) {
    // === 诊断日志：processCloudRows 被调用 ===
    console.warn('[CloudbaseSync] 🔍 processCloudRows 被调用, rows=' + (rows ? rows.length : 0) +
      ' paused=' + isCloudWritePaused() + ' importProtected=' + isImportProtected() +
      ' version=' + (window.__CLOUDBASE_SYNC_VERSION__ || 'unknown'));
    // 不再使用全局暂停跳过所有云端数据——这会阻止正确的云端数据进入缓存。
    // 改为依赖下方的 per-key 保护（importProtected、recentWrites、pendingWrites 等），
    // 只跳过被编辑/导入的 key，其他 key 正常从云端更新。
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
    ingestCloudCounts(rows); // 刷新云端条数快照（独立于下方 LWW 合并）
    var n = 0;
    var importProtected = isImportProtected();
    if (importProtected) {
      console.log('[CloudbaseSync] 导入保护期内：云端数据仅入缓存，不覆盖本地 localStorage');
    }
    Object.keys(newest).forEach(function (sk) {
      var row = newest[sk];
      var origKey = cloudKeyToOurs(sk);
      if (!origKey) return; // 非本应用键（跨应用串味/凭据/双前缀垃圾）一律不落地
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
      // ===== LWW 版本比较：本地版本号 vs 云端 updated_at，取较新者 =====
      var cloudTime = 0, localTime = localVersions[origKey] || 0;
      try { cloudTime = new Date(row.updated_at).getTime(); } catch (e) {}
      // 本地比云端新 → 保留本地，不用云端覆盖
      if (localTime > cloudTime) {
        var lv = nativeGet(toLocalKey(origKey));
        if (lv !== null && lv !== undefined && lv !== '') {
          try { cache[origKey] = JSON.parse(lv); } catch (e2) { cache[origKey] = lv; }
        }
        return;
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
    // ⚠️ 页面设置了 __NO_AUTO_CLOUD_LOAD__ 时，完全不自动拉取云端数据
    // 防止导入/编辑的本地数据被云端旧数据覆盖
    if (window.__NO_AUTO_CLOUD_LOAD__) {
      console.log('[CloudbaseSync] 🚫 loadAllFromCloud 被禁用（__NO_AUTO_CLOUD_LOAD__=true），用本地数据填充缓存');
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
    console.warn('[CloudbaseSync] 🔍 loadAllFromCloud 被调用' +
      ' paused=' + isCloudWritePaused() + ' importProtected=' + isImportProtected());
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
  // Excel 保存模式下，首屏渲染只依赖 localStorage（Storage 补丁在脚本加载时已同步安装），
  // 因此初始化分两段：
  //   ① 本地段（同步、即时）：版本号 + 键名迁移 + initialized=true，页面立刻可用
  //   ② 云端段（浏览器空闲后才执行）：懒加载重量级 SDK + 登录，再做一次后台版本对比
  function init() {
    if (initialized) return Promise.resolve(true);
    if (initPromise) return initPromise;

    console.log('[CloudbaseSync] 初始化（本地即时就绪），应用前缀:', APP_ID);

    // ---- ① 本地段：纯 localStorage，无任何网络 ----
    loadLocalVersions();
    try { migrateLocalStorage(); } catch (e) {}

    // 从 sessionStorage/cookie/localStorage 恢复导入保护期（跨 reload 存活）
    if (isImportProtected()) {
      pauseCloudWrites(600000); // 恢复 10 分钟暂停
      console.log('[CloudbaseSync] ✅ 检测到导入保护期，已恢复暂停');
    }

    initialized = true; // 页面 getItem 立即可用本地数据

    // 注册定时器和事件监听（refreshFromCloud 在 sb 未就绪时直接 return，安全空转）
    setInterval(refreshFromCloud, REFRESH_INTERVAL);
    setInterval(flushPending, 10000);
    setInterval(refreshLegacyBadge, 3000);
    window.addEventListener('online', function () { if (!sb) scheduleCloudBoot(); flushPending(); if (!window.__NO_AUTO_CLOUD_LOAD__) refreshFromCloud(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        // 后台标签切回前台：若云端栈尚未引导，立即补引导（无需等空闲）
        if (!sb) scheduleCloudBoot(0);
        flushPending();
        if (!window.__NO_AUTO_CLOUD_LOAD__) refreshFromCloud();
      }
    });
    window.addEventListener('beforeunload', flushPending);
    window.addEventListener('offline', function () { notifyStatus('offline'); });
    bindBadgeWhenReady();

    // ---- ② 云端段：等首帧渲染完、浏览器空闲后再加载，不抢占打开/切标签的响应 ----
    initPromise = scheduleCloudBoot().then(function () { return true; });
    return initPromise;
  }

  // 云端引导：空闲时加载 SDK → 登录就绪后做一次后台 LWW 版本对比
  var _cloudBootStarted = false;
  function scheduleCloudBoot(delayMs) {
    if (_cloudBootStarted) return Promise.resolve();
    _cloudBootStarted = true;
    return new Promise(function (resolve) {
      var started = false;
      function begin() {
        if (started) return;
        started = true;
        cloudBoot().then(resolve, resolve);
      }
      var idle = (typeof window.requestIdleCallback === 'function')
        ? function (cb) { return window.requestIdleCallback(cb, { timeout: 3000 }); }
        : null;
      // 首帧后再延迟，确保点击/切标签的交互优先
      setTimeout(function () {
        if (idle) idle(begin); else begin();
      }, typeof delayMs === 'number' ? delayMs : 1200);
    });
  }

  async function cloudBoot() {
    // 标签页隐藏时（后台标签）延后引导，切回前台再加载，进一步省电省流量
    if (typeof document !== 'undefined' && document.hidden) {
      _cloudBootStarted = false;
      return; // visibilitychange → refreshFromCloud 路径会在切回时触发
    }
    var client = await loadClient();
    if (!client) {
      // SDK 加载失败：稍后允许重试
      _cloudBootStarted = false;
      return;
    }
    bindBadgeWhenReady();

    // 关键：等兼容层完成登录引导（共享账号/匿名），再拉数据。
    // 懒加载后本函数在首帧约 1.2s 才执行，而 bootstrapAuth 的登录是网络调用，
    // 若不等待，CloudbaseGetAccessToken 此刻返回 null → REST 放弃 → 兼容层回退也未登录，
    // 结果云端行永远拉不到，右下角云端条数一直是"…"。
    try {
      if (typeof window.CloudbaseWhenReady === 'function') {
        await Promise.race([
          window.CloudbaseWhenReady(),
          new Promise(function (resolve) { setTimeout(resolve, 20000); })
        ]);
      }
    } catch (e) {}

    // 后台做一次版本对比拉取（仅在无本地编辑时才采用云端更新值，符合 Excel 模式）
    try {
      await loadAllFromCloud();
    } catch (e) {
      console.warn('[CloudbaseSync] 后台云端加载异常:', e && e.message ? e.message : e);
    }
    initialLoadDone = true;

    if (cloudLoadDenied) {
      notifyStatus('offline');
      scheduleCloudRetry();
    } else {
      notifyStatus('idle');
      console.log('[CloudbaseSync] 云端版本对比完成。应用:', APP_ID);
    }

    // 后台获取用户信息（仅用于展示）。
    // 关键：不要调用 client.auth.getUser() —— 它内部会走 getLoginState → 刷新 refresh token，
    // 当 refresh token 已被吊销（/auth/v1/token 400）时，SDK 会顺手清空整个会话凭证，
    // 导致一次纯展示调用把刚才能正常读写的登录态毁掉。
    // 改为直接从现有 access token 的 JWT 载荷里读邮箱/名字，完全不触发网络刷新。
    try {
      var infoToken = (typeof window.CloudbaseGetAccessToken === 'function')
        ? await window.CloudbaseGetAccessToken() : null;
      if (infoToken) {
        var payload = null;
        try {
          payload = JSON.parse(decodeURIComponent(escape(
            atob(infoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
        } catch (eJ) { payload = null; }
        if (payload && (payload.email || payload.name || payload.sub)) {
          authedUser = {
            id: payload.sub,
            email: payload.email || '',
            name: payload.name || ''
          };
          authFailReason = '';
          console.log('[CloudbaseSync] 用户:', authedUser.email || authedUser.name || authedUser.id);
        }
      }
    } catch (e) {}
    refreshLegacyBadge();

    try {
      var allKeys = Object.keys(cache);
      if (allKeys.length > 0) {
        window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { keys: allKeys, initial: true } }));
      }
    } catch (e) {}
  }

  function scheduleCloudRetry() {
    var retryDelay = 30000;
    var retryMaxDelay = 120000;
    function tick() {
      setTimeout(function () {
        retryAuthAndReload().then(function (ok) {
          if (ok && !cloudLoadDenied) { refreshLegacyBadge(); return; }
          retryDelay = Math.min(retryDelay * 2, retryMaxDelay);
          tick();
        }).catch(function () {
          retryDelay = Math.min(retryDelay * 2, retryMaxDelay);
          tick();
        });
      }, retryDelay);
    }
    tick();
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

  // ===== 主动确保有可用 access token =====
  // 会话中途 access token 过期、SDK 用 refresh token 刷新若返回 400（refresh token 被吊销），
  // SDK 会直接清空凭证且不会自动重登，此后 getAccessToken 永远为空 → 上传/下载全败。
  // 这里：先取 → 短重试等登录 → 仍为空则用共享账号强制重登（forceReauth 会 signOut + 密码重登）再取。
  // 全局合并并发调用 + 30s 冷却，避免多个调用点/定时刷新同时重登。
  var _ensureTokenInflight = null;
  var _lastEnsureReauthAt = 0;
  async function ensureFreshToken(opts) {
    opts = opts || {};
    var get = (typeof window !== 'undefined') ? window.CloudbaseGetAccessToken : null;
    if (typeof get !== 'function') return null;

    function tryGet() {
      return Promise.resolve().then(function () { return get(); }).catch(function () { return null; });
    }

    // 1) 直接取
    var t0 = await tryGet();
    if (t0) return t0;
    // 2) 短重试（兼容层首次登录可能仍在进行）
    for (var i = 0; i < 3; i++) {
      await new Promise(function (r) { setTimeout(r, 500); });
      var t1 = await tryGet();
      if (t1) return t1;
    }
    // 3) 仍无 token → 强制重登（30s 冷却）
    if (typeof window.CloudbaseForceReauth !== 'function') return null;
    if (!opts.force && (Date.now() - _lastEnsureReauthAt) < 30000) return null;
    _lastEnsureReauthAt = Date.now();

    if (!_ensureTokenInflight) {
      _ensureTokenInflight = Promise.resolve()
        .then(function () {
          console.warn('[CloudbaseSync] 无有效访问令牌（可能 refresh token 已失效），强制重登...');
          return window.CloudbaseForceReauth();
        })
        .catch(function () {})
        .then(function () {
          _ensureTokenInflight = null;
        });
    }
    await _ensureTokenInflight;
    return await tryGet();
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

  /** 实际执行单次 upsert。timestampMs 可选，用本地版本号作为 updated_at */
  function doUpload(key, value, timestampMs) {
    return new Promise(function (resolve, reject) {
      var ts = timestampMs ? new Date(timestampMs).toISOString() : new Date().toISOString();
      var p = sb.from(TABLE).upsert({
        store_key: prefixKey(key),
        payload: value,
        updated_at: ts
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
    // ⚠️ 页面设置了 __NO_AUTO_CLOUD_LOAD__ 时，定时刷新也跳过
    if (window.__NO_AUTO_CLOUD_LOAD__) return false;
    // 导入保护期内不拉取云端数据（防止旧数据覆盖刚导入的新数据）
    if (isImportProtected()) return false;
    // 网络慢冷却期：暂停定时刷新，冷却结束后由下一个定时周期自动恢复（无需人工干预）
    if (_netPauseUntil && Date.now() < _netPauseUntil) return false;

    // Excel 保存模式：编辑期间（30s 内有本地写入）不自动加载云端数据，
    // 避免本地编辑被云端旧数据覆盖。用户可手动点"下载"获取最新。
    var EDIT_GUARD_MS = 30000;
    var nowMs = Date.now();
    var hasRecentEdit = false;
    try {
      var rwKeys = Object.keys(recentWrites);
      for (var ri = 0; ri < rwKeys.length; ri++) {
        if (nowMs - recentWrites[rwKeys[ri]] < EDIT_GUARD_MS) { hasRecentEdit = true; break; }
      }
    } catch (e) {}
    if (hasRecentEdit) return false;

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
      ingestCloudCounts(rows); // 刷新云端条数快照

      Object.keys(newestRows).forEach(function (sk) {
        var row = newestRows[sk];
        var origKey = cloudKeyToOurs(row.store_key);
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

        // ===== LWW：本地版本号 vs 云端 updated_at，取较新者 =====
        var cloudTime = 0, localVer = localVersions[origKey] || 0;
        try { cloudTime = new Date(cloudTs).getTime(); } catch (e) {}
        if (localVer > cloudTime) {
          // 本地比云端新 → 保留本地
          return;
        }

        // 空值兜底：云端 payload 为空数组/空对象，但本地（缓存或 localStorage）有数据时，
        // 保留本地，绝不用云端空值清空。典型场景：某台设备 storage.init 初始空数组被误上传
        // （旧版本缺陷）后，15 秒定时刷新会把所有设备的完整数据清空。
        // 与 processCloudRows 首次加载的空值兜底保持一致。
        if (isEmptyValue(newVal)) {
          var _localExisting = oldVal;
          if (_localExisting === undefined || isEmptyValue(_localExisting)) {
            try {
              var _lrRaw = nativeGet(toLocalKey(origKey));
              if (_lrRaw !== null && _lrRaw !== undefined && _lrRaw !== '') {
                _localExisting = JSON.parse(_lrRaw);
              }
            } catch (e2) {}
          }
          if (_localExisting !== undefined && !isEmptyValue(_localExisting)) {
            console.warn('[CloudbaseSync] ⚠️ 云端值为空，保留本地数据 key=' + origKey +
              ' cloudTs=' + cloudTs + ' 本地条数=' +
              (Array.isArray(_localExisting) ? _localExisting.length : '非空'));
            cache[origKey] = _localExisting;
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
          // === 诊断日志：追踪云端覆盖 ===
          try {
            var _valPreview = JSON.stringify(newVal);
            if (_valPreview && _valPreview.length > 80) _valPreview = _valPreview.substring(0, 80) + '...';
            console.warn('[CloudbaseSync] ⚠️ 云端覆盖本地 key=' + origKey +
              ' cloudTs=' + cloudTs + ' localTs=' + localTs +
              ' paused=' + isCloudWritePaused() + ' importProtected=' + isImportProtected() +
              ' val=' + _valPreview);
            console.trace('[CloudbaseSync] 覆盖调用栈');
          } catch (e) {}
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

      var _prevCacheVal = cache[key];
      var _prevHadData = _prevCacheVal !== undefined && !isEmptyValue(_prevCacheVal);
      try { cache[key] = JSON.parse(value); } catch (e) { cache[key] = value; }
      var _newIsEmpty = isEmptyValue(cache[key]);
      recentWrites[key] = Date.now();

      // ===== Excel 保存模式：本地编辑只更新本地版本号，不自动上传 =====
      // 用户编辑记录时数据只存 localStorage，直到点击"上传云端"才推送。
      // 这样避免了编辑过程中本地/云端互相覆盖的问题。
      // 空值保护：首次写入空值（如新设备初始化）不更新版本号，避免空库覆盖云端。
      if (!shouldSkip(key) && !(_newIsEmpty && !_prevHadData)) {
        localVersions[key] = Date.now();
        saveLocalVersions();
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
      // Excel 保存模式：不自动删除云端，等用户手动"上传云端"时清理
      delete localVersions[key];
      saveLocalVersions();
      return;
    }
    try { return _origRemoveItem.call(this, key); } catch (e) {}
  };

  // ===== 手动上传：把本地所有数据推送到云端（覆盖云端） =====
  // onProgress 可选：onProgress({phase:'start'|'progress'|'reauth'|'cleanup', current, total, key, ok})
  async function pushAll(alsoDelete, onProgress) {
    // 懒加载：首次点击"上传"时若云端栈尚未引导，先加载
    if (!sb) { await ensureClient(); }
    if (!sb) return { ok: false, msg: '同步层未就绪（云端模块加载失败）' };
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

    // 上传前主动确保有有效令牌：会话过期/refresh token 被吊销时先重登，
    // 避免第一条记录白等一个 15s 超时、且整个批量必败。
    try {
      var preToken = await withTimeout(ensureFreshToken(), 25000);
      if (!preToken) console.warn('[CloudbaseSync] 上传前未能取得有效令牌，将继续尝试（兼容层可能自行恢复）');
    } catch (e) {
      console.warn('[CloudbaseSync] 上传前令牌准备异常:', e && e.message ? e.message : e);
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
          // 用本地版本号作为云端 updated_at，保证 LWW 一致性
          var localVer = localVersions[item.key] || Date.now();
          var res = await withTimeout(doUpload(item.key, value, localVer), _uploadTimeoutMs);
          uploaded = true;
          okCount++;
          cache[item.key] = value;
          cacheTs[item.key] = new Date(localVer).toISOString();
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

          // 清理同一 store_key 的历史重复行：
          // 旧版同步层每次写入都生成随机 UUID 物理行（id≠store_key），同键多行长期堆积。
          // 下载/初始加载按 updated_at 取最新行，一旦某个残留行时间戳更新（旧代码自动上传、
          // 其它设备晚写入等），其中的旧数据就会"复活"，覆盖刚上传/导入的新数据。
          // 规范行物理 id == store_key（doUpload upsert 保证）；其余物理行全部删除。
          var dupIds = [];
          for (var q = 0; q < cloudKeys.length; q++) {
            var rowK = cloudKeys[q];
            var sk2 = rowK.store_key;
            if (!sk2 || sk2.indexOf(APP_PREFIX) !== 0) continue;
            if (rowK.id !== undefined && rowK.id !== null && String(rowK.id) !== String(sk2)) {
              dupIds.push(String(rowK.id));
            }
          }
          // 去重后逐个按物理主键删除（id 等值走服务端，精确不误删）
          var uniqDupIds = Array.prototype.filter.call(dupIds, function (v, i, a) { return a.indexOf(v) === i; });
          for (var dd = 0; dd < uniqDupIds.length; dd++) {
            try { await withTimeout(sb.from(TABLE).delete().eq('id', uniqDupIds[dd]), _uploadTimeoutMs); } catch (e) {}
            emit({ phase: 'cleanup', current: dd + 1, total: uniqDupIds.length });
          }
          if (uniqDupIds.length > 0) {
            console.log('[CloudbaseSync] 已清理历史重复行', uniqDupIds.length, '个（应用:', APP_ID + '）');
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

  // ===== 手动下载：对比本地与云端版本，返回对比结果供 UI 提示用户选择 =====
  // 返回 { ok, comparison: { cloudNewer, localNewer, same, cloudNewerCount, localNewerCount, sameCount } }
  // 注意：pullAll 只做对比+返回，不自动覆盖本地。覆盖由 UI 根据用户选择决定。
  async function pullAll() {
    // 懒加载：首次点击"下载"时若云端栈尚未引导，先加载（按钮已显示进度条）
    if (!sb) { await ensureClient(); }
    if (!sb) return { ok: false, msg: '同步层未就绪（云端模块加载失败）' };
    var savedNoLoad = window.__NO_AUTO_CLOUD_LOAD__;
    var savedPause = _cloudWritePausedUntil;
    window.__NO_AUTO_CLOUD_LOAD__ = false;
    _cloudWritePausedUntil = 0;
    try {
      var rows = await fetchAppRows();
      if (!rows) {
        // REST 失败回退兼容层
        try {
          var fb = await withTimeout(sb.from(TABLE).select('store_key, payload, updated_at'), 30000);
          rows = (fb && fb.data) ? fb.data : [];
        } catch (e) { rows = []; }
      }

      // 去重：同一 store_key 只保留最新行
      var newest = {};
      for (var i = 0; i < rows.length; i++) {
        var rw = rows[i];
        if (!rw.store_key) continue;
        var prev = newest[rw.store_key];
        if (!prev || new Date(rw.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
          newest[rw.store_key] = rw;
        }
      }
      ingestCloudCounts(rows); // 手动下载时也刷新云端条数快照

      // 版本对比
      var cloudNewer = [], localNewer = [], same = [];
      Object.keys(newest).forEach(function (sk) {
        var row = newest[sk];
        var origKey = cloudKeyToOurs(sk);
        if (!origKey) return;
        var cloudTime = 0;
        try { cloudTime = new Date(row.updated_at).getTime(); } catch (e) {}
        var localTime = localVersions[origKey] || 0;
        if (localTime > cloudTime) localNewer.push({ key: origKey, localTime: localTime, cloudTime: cloudTime });
        else if (cloudTime > localTime) cloudNewer.push({ key: origKey, localTime: localTime, cloudTime: cloudTime, row: row });
        else same.push({ key: origKey, time: cloudTime });
      });

      // 本地有但云端没有的 key → 本地更新
      try {
        for (var j = 0; j < localStorage.length; j++) {
          var nk = localStorage.key(j);
          if (!nk || isReservedKey(nk)) continue;
          var ok2;
          if (REMAP_REVERSE[nk] !== undefined) ok2 = REMAP_REVERSE[nk];
          else if (REMAP_ORIGINALS[nk]) continue;
          else ok2 = nk;
          if (!isAppKey(ok2) || shouldSkip(ok2)) continue;
          var cloudHas = false;
          Object.keys(newest).forEach(function (sk) {
            if (cloudKeyToOurs(sk) === ok2) cloudHas = true;
          });
          if (!cloudHas) {
            var lt = localVersions[ok2] || 0;
            if (lt > 0) localNewer.push({ key: ok2, localTime: lt, cloudTime: 0 });
          }
        }
      } catch (e) {}

      return {
        ok: true,
        changed: cloudNewer.length > 0,
        comparison: {
          cloudNewer: cloudNewer,
          localNewer: localNewer,
          same: same,
          cloudNewerCount: cloudNewer.length,
          localNewerCount: localNewer.length,
          sameCount: same.length
        }
      };
    } finally {
      window.__NO_AUTO_CLOUD_LOAD__ = savedNoLoad;
      _cloudWritePausedUntil = savedPause;
    }
  }

  // ===== 应用云端数据到本地（用户确认下载后调用）=====
  // rows: pullAll 返回的 comparison.cloudNewer 中的 row 数组
  function applyCloudRows(cloudNewerItems) {
    var changed = 0;
    (cloudNewerItems || []).forEach(function (item) {
      if (!item || !item.row) return;
      var origKey = item.key;
      var val = item.row.payload;
      if (isEmptyValue(val)) {
        var nv = nativeGet(toLocalKey(origKey));
        if (nv !== null && nv !== undefined && nv !== '') {
          try { val = JSON.parse(nv); } catch (e) { val = nv; }
        }
      }
      cache[origKey] = val;
      cacheTs[origKey] = item.row.updated_at;
      // 同步本地版本号为云端时间，避免下次刷新又被判定为本地新
      var ct = 0;
      try { ct = new Date(item.row.updated_at).getTime(); } catch (e) {}
      localVersions[origKey] = ct;
      try {
        var raw = typeof val === 'string' ? val : JSON.stringify(val);
        nativeSet(toLocalKey(origKey), raw);
      } catch (e) {}
      changed++;
    });
    saveLocalVersions();
    if (changed > 0) {
      try {
        window.dispatchEvent(new CustomEvent('cloud-data-updated', {
          detail: { keys: (cloudNewerItems || []).map(function (i) { return i.key; }) }
        }));
      } catch (e) {}
    }
    return changed;
  }

  // ===== 获取版本对比信息（供 UI 显示）=====
  function getVersionInfo() {
    var info = { appId: APP_ID, localKeys: 0, localNewest: 0 };
    try {
      var keys = Object.keys(localVersions);
      info.localKeys = keys.length;
      keys.forEach(function (k) {
        if (localVersions[k] > info.localNewest) info.localNewest = localVersions[k];
      });
    } catch (e) {}
    return info;
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
    ensureClient: ensureClient,
    prepareForCloudClear: prepareForCloudClear,
    // 导入保护期：导入/恢复 JSON 后调用，防止 reload 后云端旧数据覆盖本地
    setImportProtection: function (ms) {
      try {
        var until = Date.now() + (ms || 600000); // 默认 10 分钟
        sessionStorage.setItem('__cb_import_protect_until__', String(until));
        // Cookie backup (sessionStorage might not persist in some contexts)
        document.cookie = '__cb_import_protect_until__=' + until + ';path=/;max-age=' + Math.floor((ms || 600000) / 1000);
        // localStorage backup (bypasses sync interceptor, survives refresh on file:// protocol)
        try { _origSetItem.call(_lsInstance, toLocalKey('__cb_import_protect_until__'), String(until)); } catch (e2) {}
        pauseCloudWrites(ms || 600000); // 同时设置全局暂停
        console.log('[CloudbaseSync] 导入保护期已设置（sessionStorage+cookie+localStorage），持续至', new Date(until).toLocaleTimeString());
      } catch (e) {}
    },
    clearImportProtection: clearImportProtection,
    isImportProtected: isImportProtected,
    // 全局写入暂停
    pauseCloudWrites: pauseCloudWrites,
    resumeCloudWrites: resumeCloudWrites,
    isCloudWritePaused: isCloudWritePaused,
    // Excel 保存模式：版本对比与应用
    applyCloudRows: applyCloudRows,
    getVersionInfo: getVersionInfo,
    getLocalVersions: function () { return localVersions; },
    // 本地/云端记录条数（供页面徽标显示）
    getRecordCounts: getRecordCounts
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
