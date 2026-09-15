/**
 * 应用数据层（通用版）
 *
 * - 本地：wx storage 存储各数据键（裸键）
 * - 云端：与网页版共用 CloudBase app_data_store 表，
 *         键名加应用前缀（见 cloudbase.js CONFIG.cloudPrefix）
 * - 每次 save() 自动推云端；syncFromCloud() 拉取合并（LWW + 未确认推送保护）
 */
const cb = require('./cloudbase');

// 各数据键的本地默认值（数组型数据；构建脚本按需覆盖对象型键）
const DEFAULTS = {"orders":[],"productions":[],"fabrics":[],"accessories":[],"washes":[],"samples":[],"shippings":[],"collections":[],"invoices":[],"payments":[],"contacts":[],"express_delivery_data_v2":[]};

const data = {};
let _loaded = false;

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

/** 启动加载：storage → 内存 */
function loadAll() {
  const keys = cb.CONFIG.namespaces.app;
  keys.forEach(k => {
    let v = null;
    try { v = cb.safeGet(k); } catch (e) {}
    if (v === '' || v === null || v === undefined) {
      v = DEFAULTS[k] !== undefined ? JSON.parse(JSON.stringify(DEFAULTS[k])) : [];
    }
    data[k] = v;
  });
  _loaded = true;
}

function ensureLoaded() { if (!_loaded) loadAll(); }

function persist(key) {
  try { cb.safeSet(key, data[key]); } catch (e) {}
}

/** 数据键默认值（新设备首次进入时初始化对象型键） */
function defaultValue(key) {
  return DEFAULTS[key] !== undefined ? JSON.parse(JSON.stringify(DEFAULTS[key])) : [];
}

/**
 * 保存某个数据键：写本地 + 异步推云端。
 * @param {string} key 数据键
 * @param {boolean} skipCloud 临时跳过云端（如导入恢复前的批量写入）
 */
function save(key, skipCloud) {
  ensureLoaded();
  persist(key);
  if (!skipCloud) {
    cb.push(key, data[key]).catch(err => console.warn('[db] push failed', key, err));
  }
}

/**
 * 从云端拉取合并（启动 / 下拉刷新 / 回前台调用）。
 * 云端较新的键覆盖本地；本地有未确认推送的键保留本地。
 * @param {function} cb回调 (changed:boolean)
 */
function syncFromCloud(done) {
  ensureLoaded();
  cb.setSuppressPush(true);
  cb.pullAll('app').then(rows => {
    let changed = false;
    let applied = 0;
    (rows || []).forEach(r => {
      if (!r || r.key === undefined) return;
      const k = r.key;
      if (data[k] === undefined) return; // 不属于本应用的键
      if (cb.takeCloud(k, r.updatedAt, data[k])) {
        if (JSON.stringify(data[k]) !== JSON.stringify(r.value)) {
          data[k] = r.value === null ? defaultValue(k) : r.value;
          persist(k);
          changed = true;
          applied++;
        }
      }
    });
    cb.setSuppressPush(false);
    if (typeof done === 'function') done(changed, applied);
  }).catch(err => {
    cb.setSuppressPush(false);
    console.warn('[db] pull failed', err);
    if (typeof done === 'function') done(false, 0);
  });
}

function get(key) {
  ensureLoaded();
  if (data[key] === undefined) data[key] = defaultValue(key);
  return data[key];
}

/** 覆盖整个数据键并保存（导入恢复用） */
function replace(key, value, skipCloud) {
  ensureLoaded();
  data[key] = value;
  save(key, skipCloud);
}

/** 生成记录 ID */
function genId(prefix) {
  return (prefix || 'ID') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = { data, loadAll, ensureLoaded, save, syncFromCloud, get, replace, defaultValue, genId };
