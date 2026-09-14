/**
 * CloudBase 云端同步适配器（微信小程序版）
 *
 * 与网页版（Onlineofficework/apps）共用同一个腾讯云开发 CloudBase 后端
 * （PostgreSQL 模式，环境 onlineofficework-d4e93l98bdf879e，ap-shanghai）：
 *   - 数据表：app_data_store（PG 行形态 { id text 主键, data jsonb }，
 *     data 内含 { store_key, payload, updated_at }，id = store_key）
 *   - 数据键名与网页版完全一致（wage_records、orderRecords…），
 *     小程序启动拉取、保存即推送，实现手机/网页多端实时同步。
 *
 * 走 CloudBase HTTP API（无需 SDK）：
 *   - 鉴权：POST {base}/auth/v1/token
 *       grant_type=password      { username, password }       → 首次登录
 *       grant_type=refresh_token { refresh_token }            → 续期（旧 refresh_token 用后即失效，
 *                                                               必须保存返回的新 refresh_token）
 *   - 数据：PostgREST 兼容 REST（与网页版兼容层同源）
 *       GET  {base}/v1/rdb/rest/app_data_store?select=id,data&id=in.(k1,k2)
 *       POST {base}/v1/rdb/rest/app_data_store?on_conflict=id
 *            header Prefer: resolution=merge-duplicates,return=minimal
 *
 * 鉴权说明：
 *   数据同步沿用网页版「数据同步专用账号」静默登录（authenticated 角色），
 *   与网页版 CLOUDBASE_SYNC 共享账号一致；token 缓存在本地，过期自动刷新，
 *   401/403 自动重登重试。门户登录（utils/cloudbase.js 的 login()）使用独立的
 *   「用户会话」，二者互不影响。
 *
 * 注意：需在微信公众平台把
 *       https://onlineofficework-d4e93l98bdf879e.api.tcloudbasegateway.com
 *       加入 request 合法域名（开发期可在开发者工具勾选"不校验合法域名"）。
 */
const CONFIG = {
  env: 'onlineofficework-d4e93l98bdf879e',
  region: 'ap-shanghai',
  base: 'https://onlineofficework-d4e93l98bdf879e.api.tcloudbasegateway.com',
  table: 'app_data_store',
  // 数据同步专用账号（与网页版共享账号一致，authenticated 角色，用户无感知）
  syncAccount: {
    email: 'sync@lori.app',
    password: 'LoriSync2026!'
  },
  // 各应用同步的键白名单（按命名空间分组，避免互相拉取无关数据）
  namespaces: {
    // 计件工资（与网页版 apps/wage 共用）
    wage: [
      'wage_records', 'wage_employees', 'wage_processes', 'wage_orders',
      'wage_adjustments', 'wage_dropdown_options',
      'wage_calendar_events', 'wage_calendar_event_types'
    ],
    // 外贸出口管理系统（与网页版 apps/wicketorders 共用）
    trade: [
      'orderRecords', 'customerRecords', 'exportRecords', 'invoiceRecords',
      'receiptRecords', 'indexPaymentRecords', 'memoRecords', 'businessRecords',
      'orderLabelsData'
    ],
    schedule: ['production_orders_data', 'calendarNotes', 'memos'],
    purchase: ['purchaseOrders_companyA', 'purchaseOrders_companyB', 'companyA-invoices', 'companyB-invoices', 'companyA-payments', 'companyB-payments', 'contracts_companyA', 'contracts_companyB', 'receipts_companyA', 'receipts_companyB', 'returns_companyA', 'returns_companyB', 'suppliers', 'companyNames', 'units'],
    incomeexpense: ['transactions_company1', 'transactions_company2', 'lastUpdated_company1', 'lastUpdated_company2', 'todos', 'currentCompany', 'currentCompany_statement']
  },
  // 云端 store_key 前缀：
  //   工资网页版（apps/wage/js/cloudbase-store.js）直接用裸键存储，无前缀；
  //   其余网页版经通用 cloudbase-sync.js 同步，云端键名为 APP_ID + '__' + 原始键名
  //   （如 wicketorders__orderRecords、orderschedule__production_orders_data、
  //    purchase__companyA-invoices）。
  //   小程序本地一律用裸键，仅在读写云端时按命名空间加/去前缀。
  cloudPrefix: {
    wage: '',
    trade: 'wicketorders__',
    schedule: 'orderschedule__',
    purchase: 'purchase__',
    // 收支表网页版经通用 cloudbase-sync.js 同步，APP_ID='incomeexpense'，
    // 云端键名为 incomeexpense__ + 裸键。
    incomeexpense: 'incomeexpense__'
  }
};

/** 裸键 → 所属命名空间（不属于任何命名空间返回 null） */
function nsOfKey(key) {
  const ns = CONFIG.namespaces || {};
  const names = Object.keys(ns);
  for (let i = 0; i < names.length; i++) {
    if (ns[names[i]].indexOf(key) > -1) return names[i];
  }
  return null;
}

/** 裸键 → 云端 store_key（按所属命名空间加前缀） */
function toCloudKey(key) {
  const ns = nsOfKey(key);
  const prefix = (ns && CONFIG.cloudPrefix && CONFIG.cloudPrefix[ns]) || '';
  return prefix + key;
}

/** 兼容旧调用：默认工资命名空间 */
CONFIG.syncKeys = CONFIG.namespaces.wage;

/* ============ 会话管理 ============
 * 两类会话独立缓存：
 *   - sync：数据同步专用共享账号（本文件内部使用）
 *   - user：门户登录用户（login() 写入，供权限/云存储上层使用）
 * 缓存结构：{ access_token, refresh_token, expires_at, email?, sub? }
 */
const SESSION_KEYS = { sync: '_cb_auth_sync', user: '_cb_auth_user' };
const sessionPromises = { sync: null, user: null };
const REQUEST_TIMEOUT = 20000;
let domainWarnShown = false;

function isConfigured() {
  return Boolean(CONFIG.env && CONFIG.base);
}

/**
 * 统一记录云端请求失败原因。
 * 真机上最常见的是网关域名未加入微信公众平台「request 合法域名」。
 */
function inspectErr(where, err) {
  try {
    const msg = String((err && (err.errMsg || err.message)) || '');
    const status = err && err.statusCode;
    console.warn('[cloudbase] ' + where + ' 失败:', msg || status || err, status !== undefined ? status : '', err && err.data || '');
    // 仅匹配域名白名单相关错误（排除 timeout、网络断开等非域名问题）
    const isDomainErr = /url not in domain|不在合法域名|request:fail url not|domain list/i.test(msg);
    if (isDomainErr && !domainWarnShown) {
      domainWarnShown = true;
      wx.showModal({
        title: '手机端云同步不可用',
        content: '错误详情：' + msg + '\n\n请在微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名中添加：\n' + CONFIG.base + '\n\n注意：\n1. 必须精确匹配（不要带路径，如 /auth/v1/token）\n2. 添加后须删除小程序重新进入（清缓存）才生效\n3. 确认是在当前小程序的 AppID 下配置的',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  } catch (e) {}
}

function readSession(kind) {
  try { return wx.getStorageSync(SESSION_KEYS[kind]) || null; } catch (e) { return null; }
}

function saveSession(kind, s) {
  try { wx.setStorageSync(SESSION_KEYS[kind], s); } catch (e) {}
}

function clearSession(kind) {
  try { wx.removeStorageSync(SESSION_KEYS[kind]); } catch (e) {}
  sessionPromises[kind] = null;
}

/** 基础 JSON 请求（wx.request → Promise），失败 reject(res|err) */
function httpReq(method, url, data, header) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: method,
      timeout: REQUEST_TIMEOUT,
      data: data === undefined ? null : data,
      header: Object.assign({ 'Content-Type': 'application/json' }, header || {}),
      success(res) { resolve(res); },
      fail(err) { reject(err); }
    });
  });
}

/** token 端点（OAuth2 grant）请求体构造 */
function grantBody(kind, forceRelogin) {
  if (kind === 'user') {
    const cached = forceRelogin ? null : readSession('user');
    return { cached: cached };
  }
  const cached = forceRelogin ? null : readSession('sync');
  return { cached: cached };
}

/** 刷新 access_token（refresh_token 用后即失效，必须保存新值） */
async function refreshSession(kind, cached) {
  const res = await httpReq('POST', CONFIG.base + '/auth/v1/token', {
    grant_type: 'refresh_token',
    refresh_token: cached.refresh_token,
    client_id: CONFIG.env
  });
  if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.access_token) {
    const s = normalizeToken(res.data, cached);
    saveSession(kind, s);
    return s;
  }
  throw res;
}

/** 密码登录（先走标准 grant 端点，失败再试 /auth/v1/signin 兼容端点） */
async function passwordLogin(kind, username, password) {
  let res = null;
  try {
    res = await httpReq('POST', CONFIG.base + '/auth/v1/token', {
      grant_type: 'password',
      username: username,
      password: password,
      client_id: CONFIG.env
    });
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.access_token) {
      return normalizeToken(res.data, null, username);
    }
  } catch (e) { res = e; }
  // 兼容端点：POST /auth/v1/signin { username, password }
  const res2 = await httpReq('POST', CONFIG.base + '/auth/v1/signin', {
    username: username,
    password: password
  });
  if (res2.statusCode >= 200 && res2.statusCode < 300 && res2.data && (res2.data.access_token || (res2.data.data && res2.data.data.access_token))) {
    const d = res2.data.access_token ? res2.data : res2.data.data;
    return normalizeToken(d, null, username);
  }
  inspectErr('登录(' + kind + ')', res2.data || res2);
  throw (res2.data || res2);
}

/** 统一 token 响应 → 会话对象（提前 5 分钟视为过期） */
function normalizeToken(d, old, username) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token || (old && old.refresh_token) || '',
    expires_at: Date.now() + (d.expires_in || 7200) * 1000 - 5 * 60 * 1000,
    email: (d.email || (old && old.email) || (username && /@/.test(username) ? username : '') || ''),
    sub: d.sub || (old && old.sub) || ''
  };
}

/** 确保指定会话拿到有效 access_token；失败返回 null（静默跳过云端，不影响本地使用） */
function ensureToken(kind, forceRelogin) {
  if (!isConfigured()) return Promise.resolve(null);
  if (!forceRelogin && sessionPromises[kind]) return sessionPromises[kind];

  sessionPromises[kind] = (async () => {
    const { cached } = grantBody(kind, forceRelogin);

    // 1) 缓存 token 仍在有效期内
    if (cached && cached.access_token && cached.expires_at > Date.now()) {
      return cached;
    }

    // 2) 用 refresh_token 续期
    if (cached && cached.refresh_token) {
      try {
        return await refreshSession(kind, cached);
      } catch (e) {
        // refresh_token 已过期/失效：清除旧缓存，避免下次启动又试一遍旧 token 产生 400 噪音
        clearSession(kind);
      }
    }

    // 3) 账号密码登录
    const account = kind === 'user' ? null : CONFIG.syncAccount;
    if (!account) return null; // 用户会话不允许静默登录
    try {
      const s = await passwordLogin(kind, account.email, account.password);
      saveSession(kind, s);
      return s;
    } catch (e) {
      console.warn('[cloudbase] 登录失败，云同步不可用（本地数据不受影响）', e && e.data);
      return null;
    } finally {
      // 释放锁：已完成的登录结果缓存在 storage，下次调用直接读缓存
      setTimeout(() => { sessionPromises[kind] = null; }, 0);
    }
  })();

  return sessionPromises[kind];
}

/* ============ 带 Bearer 的 API 请求 ============ */

/**
 * 已鉴权请求（默认 sync 会话；kind='user' 用登录用户会话）。
 * 401/403 自动重登后重试一次。
 */
function req(method, path, qs, data, extraHeader, retry, kind) {
  kind = kind || 'sync';
  return new Promise((resolve, reject) => {
    if (!isConfigured()) { reject(new Error('cloudbase not configured')); return; }
    ensureToken(kind).then(s => {
      if (!s || !s.access_token) { reject(new Error('no auth token')); return; }
      httpReq(method, CONFIG.base + path + (qs || ''), data, Object.assign({
        'Authorization': 'Bearer ' + s.access_token
      }, extraHeader || {})).then(res => {
        if ((res.statusCode === 401 || res.statusCode === 403) && !retry) {
          clearSession(kind);
          req(method, path, qs, data, extraHeader, true, kind).then(resolve, reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else { inspectErr(method + ' ' + path, res); reject(res); }
      }, err => { inspectErr(method + ' ' + path, err); reject(err); });
    }, reject);
  });
}

/** 调用 CloudBase 云函数（HTTP API） */
function callFunction(name, data) {
  return req('POST', '/v1/functions/' + name, '', data || {}, null, false, 'sync')
    .then(d => {
      // HTTP API 返回 { result, requestId, timestamp }
      return (d && typeof d === 'object' && 'result' in d) ? d.result : d;
    });
}

/* ============ 数据读写（app_data_store，PG 形态 {id, data}） ============ */

/** 云端行 → 同步层行 */
function mapRow(r) {
  const d = r && r.data || {};
  const ck = d.store_key || r.id || '';
  return { key: ck, value: d.payload, updatedAt: d.updated_at };
}

/**
 * 拉取指定命名空间下的全部数据 → [{key, value, updatedAt}]
 * （云端键名在这里统一去前缀，映射为 db.js 约定的裸键）
 * @param {string} ns 命名空间，如 'wage' / 'trade'；缺省为 'wage'
 */
function pullAll(ns) {
  const keys = (CONFIG.namespaces && CONFIG.namespaces[ns]) || CONFIG.syncKeys;
  const prefix = (CONFIG.cloudPrefix && CONFIG.cloudPrefix[ns]) || '';
  const keyList = keys.map(k => encodeURIComponent(prefix + k)).join(',');
  return req('GET', '/v1/rdb/rest/' + CONFIG.table,
    '?select=id,data&id=in.(' + keyList + ')', null, null, false)
    .then(rows => {
      // 拉取成功：若无挂起写入则置 idle（间接证明连接 OK）
      if (Object.keys(pending).length === 0) setSyncState('idle');
      if (!Array.isArray(rows)) return rows;
      // 云端键名去前缀，统一还原为数据层使用的裸键
      return rows.map(r => {
        const m = mapRow(r);
        return {
          key: prefix && m.key.indexOf(prefix) === 0 ? m.key.slice(prefix.length) : m.key,
          value: m.value,
          updatedAt: m.updatedAt
        };
      });
    });
}

/** 按裸键拉取单条 → {key, value, updatedAt}（无数据返回 null） */
function pull(key) {
  return req('GET', '/v1/rdb/rest/' + CONFIG.table,
    '?select=id,data&id=eq.' + encodeURIComponent(toCloudKey(key)), null, null, false)
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const m = mapRow(rows[0]);
      return { key: key, value: m.value, updatedAt: m.updatedAt };
    });
}

/* ============ 可靠推送队列（本地写入绝不丢） ============
 * 每次写入先落本地持久化队列（_cb_pending_v1），云端确认成功后才移除；
 * 全局串行发送、同一 store_key 只保留最新值；失败指数退避自动重试；
 * 启动 / 回前台 / 网络恢复 / 切后台时主动补发；
 * 配合 takeCloud() 裁决，未确认推送的键绝不会被云端拉取覆盖。
 */
const PENDING_KEY = '_cb_pending_v1';
const META_KEY = '_cb_local_meta_v1';
// 云端/本地时间戳比较的时钟偏差宽限（手机与电脑、与服务器可能有秒级误差）
const CLOCK_GRACE_MS = 30000;

/**
 * 同步抑制标志：数据层 syncFromCloud 期间调用 push 不应真正上传。
 * push 仍写入本地缓存/队列，但 flushQueue 会在 suppress 解除后统一补发。
 */
let suppressPush = false;

function loadJson(k) {
  try { const v = wx.getStorageSync(k); return (v && typeof v === 'object') ? v : null; } catch (e) { return null; }
}

/** 待发送队列：{ [cloudStoreKey]: {key, value, ts, tries} } */
let pending = loadJson(PENDING_KEY) || {};
/** 各裸键本机最后一次写入时间戳（ms）：{ [bareKey]: ms } */
let localMeta = loadJson(META_KEY) || {};
let flushing = false;
let currentFlush = null;
let flushTimer = null;
let backoffUntil = 0;

/* ============ 同步状态指示灯 ============
 * idle(已同步) / pending(上传中) / error(上传失败) / offline(未连接)
 * push 开始 → pending；flushQueue 全部成功 → idle；某条失败 → error；
 * 未配置或网络断开 → offline。
 * 数据层 syncFromCloud 成功拉取也会触发 idle（间接证明连接 OK）。
 */
let _syncState = 'idle';
const _syncCbs = [];
function setSyncState(state) {
  if (state === _syncState) return;
  _syncState = state;
  _syncCbs.forEach(function (cb) { try { cb(state); } catch (e) {} });
}
function getSyncState() { return _syncState; }
function onSyncStateChange(cb) {
  if (typeof cb === 'function') _syncCbs.push(cb);
  try { cb(_syncState); } catch (e) {}
}

function persistPending() { try { wx.setStorageSync(PENDING_KEY, pending); } catch (e) {} }
function persistMeta() { try { wx.setStorageSync(META_KEY, localMeta); } catch (e) {} }

function rawPush(cloudKey, value) {
  // upsert：on_conflict=id + Prefer merge-duplicates（PG 行形态 {id, data}）
  return req('POST', '/v1/rdb/rest/' + CONFIG.table, '?on_conflict=id', [{
    id: cloudKey,
    data: {
      store_key: cloudKey,
      payload: value,
      updated_at: new Date().toISOString()
    }
  }], {
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  }).then(v => {
    // return=minimal 时响应体为空（v 为 null/undefined）即写入成功
    return (v === null || v === undefined) ? true : v;
  });
}

/**
 * 写入（upsert）一条数据（key 为数据层裸键，云端按命名空间自动加前缀）。
 * 立即返回；实际发送由队列异步完成，失败自动重试，调用方无需 await。
 */
function push(key, value) {
  if (!isConfigured()) { setSyncState('offline'); return Promise.resolve(false); }
  const ts = Date.now();
  localMeta[key] = ts;
  persistMeta();
  // 同键后写覆盖先写（payload 为完整数组，旧快照没有发送价值）
  pending[toCloudKey(key)] = { key: key, value: value, ts: ts, tries: 0 };
  persistPending();
  setSyncState('pending');
  scheduleFlush(50);
  return flushQueue();
}

function scheduleFlush(delay) {
  if (flushTimer) return;
  const wait = Math.max(0, (delay || 0));
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, wait);
}

function backoffMs(tries) {
  // 2s, 4s, 8s, 16s, 32s, 60s, 60s ...
  return Math.min(60000, 1000 * Math.pow(2, Math.max(1, Math.min(tries || 1, 6))));
}

/** 串行发送队列中的全部待写项；失败项保留并安排退避重试 */
function flushQueue() {
  if (flushing) return currentFlush || Promise.resolve(false);
  if (Object.keys(pending).length === 0) return Promise.resolve(true);
  // 同步抑制期间：入队但不发送，等 suppress 解除后统一补发
  if (suppressPush) { scheduleFlush(200); return Promise.resolve(false); }
  if (Date.now() < backoffUntil) { scheduleFlush(backoffUntil - Date.now() + 50); return Promise.resolve(false); }

  flushing = true;
  currentFlush = (async () => {
    try {
      const cloudKeys = Object.keys(pending);
      for (let i = 0; i < cloudKeys.length; i++) {
        const ck = cloudKeys[i];
        const entry = pending[ck];
        if (!entry) continue;
        let result;
        try { result = await rawPush(ck, entry.value); } catch (e) { result = null; }
        if (result === null || result === undefined) {
          entry.tries = (entry.tries || 0) + 1;
          persistPending();
          backoffUntil = Date.now() + backoffMs(entry.tries);
          console.warn('[cloudbase] 推送 ' + entry.key + ' 未成功，已留在本地队列，' + Math.round((backoffUntil - Date.now()) / 1000) + ' 秒后自动重试');
          setSyncState('error');
          scheduleFlush(backoffUntil - Date.now() + 50);
          return false;
        }
        delete pending[ck];
        persistPending();
        backoffUntil = 0;
      }
      const allDone = Object.keys(pending).length === 0;
      if (allDone) setSyncState('idle');
      return allDone;
    } finally {
      flushing = false;
      currentFlush = null;
      // flush 期间若有新写入入队，再补一轮
      if (Object.keys(pending).length > 0 && Date.now() >= backoffUntil) scheduleFlush(100);
    }
  })();
  return currentFlush;
}

/**
 * 拉取到云端某键的数据后，由各数据层调用以决定是否接受云端覆盖本地。
 * 最后写入者胜（LWW）+ 时钟宽限：
 *   - 该键有尚未确认成功的本地写入 → 拒绝覆盖（保留本地）；
 *   - 本机从未编辑过该键（如新装/新设备）→ 接受云端；
 *   - 云端 updated_at 不早于本机最后写入（含 30s 宽限）→ 接受云端；
 *   - 否则本地明显更新 → 保留本地，并把本地值补推入队。
 * @returns {boolean} true=应用云端数据；false=保留本地数据
 */
function takeCloud(key, cloudUpdatedAt, localValue) {
  const ck = toCloudKey(key);
  if (pending[ck]) return false;
  const localMs = localMeta[key] || 0;
  if (!localMs) return true;
  const cloudMs = Date.parse(cloudUpdatedAt || '');
  if (isNaN(cloudMs) || cloudMs + CLOCK_GRACE_MS >= localMs) {
    if (!isNaN(cloudMs)) { localMeta[key] = cloudMs; persistMeta(); }
    return true;
  }
  // 本地更新但队列里没有（上次进程被杀等极端情况）：补推本地值
  if (localValue !== undefined) {
    pending[ck] = { key: key, value: localValue, ts: Date.now(), tries: 0 };
    persistPending();
    scheduleFlush(50);
  }
  return false;
}

// 网络恢复时立刻补发（监听器注册一次即可，重复注册无害）
try {
  if (typeof wx.onNetworkStatusChange === 'function') {
    wx.onNetworkStatusChange(function (res) {
      if (res && res.isConnected) {
        // 网络恢复：若有挂起写入则保持 pending/idle，否则置 idle
        if (Object.keys(pending).length > 0) setSyncState('pending');
        else setSyncState('idle');
        flushQueue();
      } else {
        setSyncState('offline');
      }
    });
  }
} catch (e) {}

/**
 * 设置同步抑制：数据层 syncFromCloud 期间设为 true，
 * 完成后设为 false 并立即补发期间入队的写入。
 */
function setSuppressPush(v) {
  suppressPush = v;
  if (!v) flushQueue();
}

/* ============ 门户登录（用户会话） ============
 * 与网页版门户一致：
 *   - 邮箱/用户名 + 密码登录（用户会话，独立于数据同步共享账号）
 *   - 登录后读取 user_app_permissions（id='perm::<小写邮箱>'，
 *     data.perms = { appId: 'read'|'write'|'none' }）决定首页应用可见性
 */
const ADMIN_EMAIL = 'alonzhang76@outlook.com';

/**
 * 门户登录：成功返回会话 {email, isAdmin, perms, sub}
 * perms 已映射为小程序应用 key（wage/trade/schedule/purchase/income）→ 'read'|'write'
 */
async function login(account, password) {
  if (!account) throw new Error('请输入账号');
  if (!password) throw new Error('请输入密码');
  const s = await passwordLogin('user', String(account).trim(), password);
  // username 不是邮箱时（如用户名登录），email 字段可能为空 —— 尝试从响应补齐
  const email = (s.email || (/@/.test(account) ? String(account).trim().toLowerCase() : '')).toLowerCase();
  s.email = email;
  saveSession('user', s);

  let isAdmin = false;
  let permsRaw = null;
  if (email) {
    isAdmin = email === ADMIN_EMAIL;
    permsRaw = await fetchPerms(email).catch(err => {
      console.warn('[cloudbase] 读取权限失败', err);
      return null;
    });
  }
  // 管理员拥有全部应用
  const perms = isAdmin ? null : mapPerms(permsRaw);
  const user = { email: email, isAdmin: isAdmin, perms: perms, sub: s.sub || '', loginAt: Date.now() };
  try { wx.setStorageSync('plm_user_v1', user); } catch (e) {}
  return user;
}

/** 读取指定邮箱的权限文档 → data.perms */
function fetchPerms(email) {
  return req('GET', '/v1/rdb/rest/user_app_permissions',
    '?select=id,data&id=eq.' + encodeURIComponent('perm::' + email), null, null, false, 'user')
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const d = rows[0] && rows[0].data || {};
      return d.perms || null;
    });
}

/** 网页版应用 id → 小程序应用 key 映射 */
const WEB_APP_ID_MAP = {
  wage: 'wage',
  wicketorders: 'trade',
  orderschedule: 'schedule',
  purchase: 'purchase',
  incomeexpense: 'income'
};

/** 云端 perms（网页版 app id）→ 小程序 key 视图；无权限文档返回 null */
function mapPerms(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  Object.keys(raw).forEach(appId => {
    const key = WEB_APP_ID_MAP[appId] || appId;
    out[key] = raw[appId];
  });
  return out;
}

/** 当前登录用户（启动时恢复） */
function getUser() {
  try { return wx.getStorageSync('plm_user_v1') || null; } catch (e) { return null; }
}

/** 退出登录（仅清用户会话，数据同步共享账号不受影响） */
function logoutUser() {
  clearSession('user');
  try { wx.removeStorageSync('plm_user_v1'); } catch (e) {}
}

/** 应用是否可见：perms[appKey] === 'read' | 'write'；管理员全可见 */
function appVisible(user, appKey) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const p = user.perms;
  if (!p) return false;
  return p[appKey] === 'read' || p[appKey] === 'write';
}

module.exports = {
  CONFIG,
  isConfigured,
  // 数据同步（与原 supabase.js 导出一致）
  pullAll, pull, push, flushQueue, takeCloud, setSuppressPush,
  // 同步状态指示灯
  getSyncState, onSyncStateChange,
  // 门户登录 / 用户会话
  login, getUser, logoutUser, fetchPerms, appVisible,
  // 云函数 / 通用鉴权请求（云存储文件中心等上层使用）
  callFunction, req, ensureToken, httpReq
};
