/**
 * 不锈钢贸易数据层（分公司作用域版）
 *
 * 与桌面端 apps/stainlessbusiness 存储模型完全一致：
 *   - 全局键（裸键）：contacts、memos、companyList …（见 GLOBAL_KEYS）
 *   - 分公司作用域键：云端/本地实际键为 <companyId>__<key>
 *       default-1__salesOrders / default-2__purchaseOrders …
 *
 * 业务代码一律使用逻辑键：db.get('salesOrders') 自动映射到
 * <当前抬头>__salesOrders；切换抬头后数据即时更换。
 *
 * 云同步：
 *   - 拉取：一次性 LIKE 扫描 stainlessbusiness__ 前缀下全部行
 *     （桌面端网页同步白名单不含作用域键，小程序端自行同步），
 *     动态公司前缀同样支持
 *   - 推送 / LWW 裁决复用 cloudbase.js 队列
 */
const cb = require('./cloudbase');
const company = require('./company');

/* 桌面端内置三家公司（动态新增的公司也会在拉取后自动注册） */
const DEFAULT_COMPANY_IDS = ['default-1', 'default-2', 'default-3'];

/* 全局裸键（桌面端 Sle 集合，与公司无关） */
const GLOBAL_KEYS = [
  'memos', 'contacts', 'favoriteContacts',
  'industryTypes', 'industryApplications', 'gradeComparisons', 'vocabularies',
  'hscodes', 'hscodeData', 'calculationParams', 'plateCalcData',
  'certificateData', 'paymentTerms', 'customColumns',
  'products', 'productCategories',
  'companyList', 'currentCompanyId',
  'isLoggedIn', 'username', 'userPhone', 'dataCleared', 'contractTerms'
];

/* 分公司作用域键（桌面端 V9 数组） */
const SCOPED_KEYS = [
  'inquiries', 'quotations',
  'purchaseOrders', 'returnRecords',
  'salesOrders', 'salesReturnRecords',
  'inventoryRecords', 'warehouses', 'warehouseHistory',
  'warehouseSales', 'warehouseSalePayments', 'warehouseSaleInvoices',
  'transactions', 'transactionCategories', 'initialBalanceData',
  'invoices',
  'purchaseContractTerms', 'salesContractTerms',
  'calendarEvents', 'companyName1', 'companyName2'
];

/* 非数组型键的默认值 */
const SCALAR_DEFAULTS = {
  currentCompanyId: '',
  isLoggedIn: false
};

const data = {};
let _loaded = false;

function currentId() { return company.getCurrentId(); }

/** 全部参与同步的裸键（全局 + 各公司作用域） */
function allSyncKeys(ids) {
  const cids = ids || DEFAULT_COMPANY_IDS;
  const keys = GLOBAL_KEYS.slice();
  cids.forEach(cid => SCOPED_KEYS.forEach(k => keys.push(cid + '__' + k)));
  return keys;
}

/** 键分类：global / scoped / unknown */
function classify(raw) {
  if (GLOBAL_KEYS.indexOf(raw) >= 0) return { kind: 'global', bare: raw, base: raw };
  const m = /^(.+)__(.+)$/.exec(raw);
  if (m && SCOPED_KEYS.indexOf(m[2]) >= 0) {
    return { kind: 'scoped', bare: raw, cid: m[1], base: m[2] };
  }
  if (SCOPED_KEYS.indexOf(raw) >= 0) {
    const cid = currentId();
    return { kind: 'scoped', bare: cid + '__' + raw, cid: cid, base: raw };
  }
  return { kind: 'unknown', bare: raw, base: raw };
}

function defaultValue(key) {
  if (Object.prototype.hasOwnProperty.call(SCALAR_DEFAULTS, key)) {
    return JSON.parse(JSON.stringify(SCALAR_DEFAULTS[key]));
  }
  return [];
}

/** 启动加载：storage → 内存（全局键 + 三家公司作用域键） */
function loadAll() {
  company.getCompanies(); // 确保内置公司已初始化
  const keys = cb.CONFIG.namespaces.app && cb.CONFIG.namespaces.app.length
    ? cb.CONFIG.namespaces.app
    : allSyncKeys();
  keys.forEach(k => {
    let v = null;
    try { v = cb.safeGet(k); } catch (e) {}
    if (v === '' || v === null || v === undefined) {
      v = GLOBAL_KEYS.indexOf(k) >= 0 && Object.prototype.hasOwnProperty.call(SCALAR_DEFAULTS, k)
        ? defaultValue(k) : [];
    }
    data[k] = v;
  });
  _loaded = true;
}

function ensureLoaded() { if (!_loaded) loadAll(); }

function persistBare(bare) {
  try { cb.safeSet(bare, data[bare]); } catch (e) {}
}

/** 逻辑键 → 当前公司的实际裸键 */
function resolveKey(key, cid) {
  if (GLOBAL_KEYS.indexOf(key) >= 0) return key;
  if (SCOPED_KEYS.indexOf(key) >= 0) return (cid || currentId()) + '__' + key;
  return key; // 已经是完整裸键
}

/**
 * 读取数据。
 * - 传逻辑键（salesOrders）→ 当前抬头作用域
 * - 传完整裸键（default-2__salesOrders）→ 直接取
 */
function get(key, cid) {
  ensureLoaded();
  const bare = resolveKey(key, cid);
  if (data[bare] === undefined) data[bare] = defaultValue(bare);
  return data[bare];
}

/** 保存实际裸键：本地 + 推云端 */
function saveBare(bare, skipCloud) {
  ensureLoaded();
  persistBare(bare);
  if (!skipCloud) cb.push(bare, data[bare]).catch(() => {});
}

/** 保存逻辑键（当前抬头作用域） */
function save(key, skipCloud, cid) {
  const bare = resolveKey(key, cid);
  saveBare(bare, skipCloud);
}

/** 列表编辑后提交（与 save 等价，语义化） */
function commit(key, cid) { save(key, false, cid); }

/** 覆盖整个数据键（备份恢复用，key 为完整裸键） */
function replace(bare, value, skipCloud) {
  ensureLoaded();
  data[bare] = value;
  if (cb.CONFIG.namespaces.app.indexOf(bare) < 0) cb.CONFIG.namespaces.app.push(bare);
  saveBare(bare, skipCloud);
}

/* ============ 云端同步（LIKE 前缀扫描 + LWW） ============ */

function fetchPrefixRows(prefix) {
  // PostgREST：data->>'store_key' LIKE 'stainlessbusiness__*'（网关把 * 映射为 %）
  const baseQs = '?select=id,data&data-%3E%3Estore_key=like.' +
    encodeURIComponent(prefix + '*') + '&limit=500';
  const rows = [];
  function page(offset) {
    return cb.req('GET', '/v1/rdb/rest/' + cb.CONFIG.table, baseQs + '&offset=' + offset)
      .then(list => {
        if (!Array.isArray(list)) return rows;
        list.forEach(r => {
          const d = (r && r.data) || {};
          const ck = d.store_key || r.id || '';
          if (!ck) return;
          rows.push({ cloudKey: ck, value: d.payload, updatedAt: d.updated_at });
        });
        if (list.length >= 500) return page(offset + 500);
        return rows;
      });
  }
  return page(0);
}

/**
 * 拉取合并。云端较新覆盖本地；本地有未确认推送保留本地。
 * @param done(changed:boolean, applied:number)
 */
function syncFromCloud(done) {
  ensureLoaded();
  const prefix = (cb.CONFIG.cloudPrefix && cb.CONFIG.cloudPrefix.app) || '';
  cb.setSuppressPush(true);
  fetchPrefixRows(prefix).then(rows => {
    let changed = false;
    let applied = 0;
    const known = {};
    (rows || []).forEach(r => {
      const bare = r.cloudKey.slice(prefix.length);
      if (known[bare]) return; // 同键只处理一次
      known[bare] = 1;
      const info = classify(bare);
      if (info.kind === 'unknown') return; // 非本应用数据模型
      // 动态公司：注册新作用域键
      if (cb.CONFIG.namespaces.app.indexOf(bare) < 0) cb.CONFIG.namespaces.app.push(bare);
      const localVal = data[bare] === undefined ? defaultValue(bare) : data[bare];
      if (cb.takeCloud(bare, r.updatedAt, localVal)) {
        const next = (r.value === null || r.value === undefined) ? defaultValue(bare) : r.value;
        if (JSON.stringify(localVal) !== JSON.stringify(next)) {
          data[bare] = next;
          persistBare(bare);
          changed = true;
          applied++;
        }
      }
    });
    cb.setSuppressPush(false);
    if (typeof done === 'function') done(changed, applied);
  }).catch(err => {
    cb.setSuppressPush(false);
    console.warn('[db] 前缀扫描失败，回退逐键拉取', err && err.errMsg || err);
    // 回退：按注册键逐键 pullAll
    cb.pullAll('app').then(rows0 => {
      let changed = false;
      let applied = 0;
      (rows0 || []).forEach(r => {
        if (!r || r.key === undefined) return;
        const bare = r.key;
        if (data[bare] === undefined) data[bare] = defaultValue(bare);
        if (cb.takeCloud(bare, r.updatedAt, data[bare])) {
          if (JSON.stringify(data[bare]) !== JSON.stringify(r.value)) {
            data[bare] = r.value === null ? defaultValue(bare) : r.value;
            persistBare(bare);
            changed = true;
            applied++;
          }
        }
      });
      if (typeof done === 'function') done(changed, applied);
    }).catch(() => { if (typeof done === 'function') done(false, 0); });
  });
}

/** 生成记录 ID */
function genId(prefix) {
  return (prefix || 'ID') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  GLOBAL_KEYS, SCOPED_KEYS, DEFAULT_COMPANY_IDS,
  data, allSyncKeys, classify, resolveKey,
  loadAll, ensureLoaded,
  get, save, saveBare, commit, replace, defaultValue,
  syncFromCloud, genId
};
