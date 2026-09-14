/**
 * CloudBase 云存储文件中心（微信小程序版 · PG 桶模式）
 *
 * 对齐网页版「云存储（CloudBase 文件中心，与 saintysys 同款）」的能力子集，
 * 与网页版使用同一个逻辑桶、同一套云端文件。
 * ★ 与网页版 cfb.js 完全一致：wage / trade(wicketorders) / schedule(orderschedule)
 *   三个应用共用同一个云端根目录 orderschedule/（网页版 CB_ROOT 默认值，
 *   「一处上传、三处可见」），不存在独立的 wage/ 、wicketorders/ 目录。
 *
 * 环境为 CloudBase PG 桶模式（逻辑桶 app-photos = 物理前缀 app-photos/），
 * 经典网关 get-objects-upload-info 在该环境不可用，因此：
 *   - 列目录：云函数 tcb-file-list（直接列物理桶）
 *       POST {base}/v1/functions/tcb-file-list  { prefix: 'app-photos/...', limit }
 *       → { data: [{name, type:'file'|'folder', path, size?, lastModified?,
 *                    etag?, cloudObjectId?}], isTruncated, nextMarker, bucket }
 *   - 上传：PG 桶对象 API（与网页版 SDK 同源，原始字节直传）
 *       PUT  {base}/v1/storages/object/app-photos/<URL编码对象路径>
 *       header: Authorization: Bearer <sync token>，body: ArrayBuffer
 *       → { Id, Key }
 *   - 下载链接：POST {base}/v1/storages/get-objects-download-info  [{cloudObjectId}]
 *       → [{downloadUrl}]（字段名做多种兼容）
 *   - 删除：POST {base}/v1/storages/delete-objects  [{cloudObjectId}]
 *
 * cloudObjectId 两种合法形态（下载/删除均实测可用）：
 *   cloud://<env>.app-photos/app-photos/<物理路径>           （逻辑桶形态，本地兜底用）
 *   cloud://<env>.<物理桶名>/app-photos/<物理路径>          （列目录云函数返回）
 *   cloud://<env>/<path> 短形态在 PG 模式无效，禁止使用。
 */
const cb = require('./cloudbase');

const CONFIG = cb.CONFIG;
// PG 模式环境唯一逻辑桶（物理桶内前缀 app-photos/）
const BUCKET = 'app-photos';
// 单文件最大 10MB（wx.request 请求体限制，与网页版 MAX_FILE_SIZE 一致）
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 各应用云存储根目录。
// wage / trade / schedule 与网页版三应用共享同一根 orderschedule/（cfb.js CB_ROOT）；
// purchase / income 网页版暂无云存储页，保留独立根备用。
const APP_ROOTS = {
  wage: 'orderschedule',
  trade: 'orderschedule',
  schedule: 'orderschedule',
  purchase: 'purchase',
  income: 'incomeexpense'
};

function rootOf(app) {
  return APP_ROOTS[app] || String(app || 'files');
}

/* ---------- 路径工具 ---------- */

/** 应用相对路径 → 桶内物理路径：app-photos/<root?>/<rel> */
function joinPhysical(root, rel) {
  const r = String(root || '').replace(/^\/+|\/+$/g, '');
  const x = String(rel == null ? '' : rel).replace(/^\/+/, '');
  return BUCKET + '/' + (r ? r + '/' : '') + x;
}

/** 列目录前缀：物理路径且保证以 / 结尾 */
function listPrefix(root, rel) {
  const p = joinPhysical(root, rel);
  return p.endsWith('/') ? p : p + '/';
}

/** 对象路径 URL 编码（按段编码，保留 /，兼容中文/空格） */
function encodeObjectPath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

/** 文件条目 → 桶内物理路径（优先 fullPath，相对路径则补桶名/根前缀） */
function filePhysical(root, file) {
  let p = String((file && (file.fullPath || file.path)) || '').replace(/^\/+/, '');
  if (p.indexOf(BUCKET + '/') !== 0) p = joinPhysical(root, p);
  return p;
}

/* ---------- fileID 缓存：物理路径 → cloudObjectId(fileID) ---------- */
const FILEID_KEY = '_cb_file_ids_v1';
function loadMap() {
  try { return wx.getStorageSync(FILEID_KEY) || {}; } catch (e) { return {}; }
}
function saveMap(m) { try { wx.setStorageSync(FILEID_KEY, m); } catch (e) {} }
function rememberFileId(path, id) {
  if (!path || !id) return;
  const m = loadMap();
  if (m[path] === id) return;
  m[path] = id;
  saveMap(m);
}
function idFor(path) {
  return loadMap()[path] || '';
}

/** 物理路径 → cloudObjectId（优先缓存，兜底逻辑桶形态） */
function cloudObjectIdFor(path) {
  const p = String(path || '').replace(/^\/+/, '');
  return idFor(p) || 'cloud://' + CONFIG.env + '.' + BUCKET + '/' + p;
}

/* ============ 列目录 ============ */

/** 物理路径最后一段（目录名/文件名） */
function baseName(p) {
  const s = String(p || '').replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * 把不同版本云函数的返回规范化为统一的 items（{type:'folder'|'file', ...}）。
 * 兼容：
 *   { data: [...] }                                      —— 当前部署版
 *   { folders: [...], files: [...] } / 直接数组          —— 旧版/SDK 直调
 *   { Contents: [...], CommonPrefixes: [...] }           —— COS 原始形态
 */
function normalizeItems(res) {
  const items = [];
  if (Array.isArray(res)) {
    res.forEach(it => items.push(it));
  } else if (res && Array.isArray(res.data)) {
    res.data.forEach(it => items.push(it));
  } else if (res && (Array.isArray(res.folders) || Array.isArray(res.files))) {
    (res.folders || []).forEach(f => items.push(Object.assign({ type: 'folder' }, f)));
    (res.files || []).forEach(f => items.push(Object.assign({ type: 'file' }, f)));
  } else if (res && (Array.isArray(res.Contents) || Array.isArray(res.CommonPrefixes))) {
    (res.CommonPrefixes || []).forEach(p => {
      const path = (p && (p.Prefix || p.prefix)) || (typeof p === 'string' ? p : '');
      if (path) items.push({ type: 'folder', name: baseName(path), path: path });
    });
    (res.Contents || []).forEach(o => {
      const path = (o && (o.Key || o.key)) || '';
      if (path) items.push({
        type: 'file', name: baseName(path), path: path,
        size: o.Size || o.size || 0,
        lastModified: o.LastModified || o.lastModified || '',
        etag: o.ETag || o.etag || '',
        cloudObjectId: o.cloudObjectId || ''
      });
    });
  }
  return items;
}

/**
 * 列出指定目录一层 → { folders: [{name, path(应用相对), fullPath(物理)}],
 *                       files:   [{name, path, fullPath, size, lastModified, cloudObjectId, bucket}] }
 * @param {string} prefix 目录前缀（应用内相对根，如 '' 或 '图片文件/'）
 * @param {string} app 应用 key（决定根目录前缀）
 *
 * 翻页策略：仅当云函数返回非空且不重复的 nextMarker 时才继续翻页。
 * 当前部署的 tcb-file-list 会恒定返回 isTruncated:true 且 nextMarker:''，
 * 并忽略传入的 marker —— 这种情况下绝不翻页（避免死循环）。
 */
function list(prefix, app) {
  const root = rootOf(app);
  const fullPrefix = listPrefix(root, prefix);
  // 应用根相对的当前目录（保证以 / 结尾，根目录为 ''）
  const baseRel = prefix ? (String(prefix).endsWith('/') ? prefix : prefix + '/') : '';
  const folderMap = {};
  const fileMap = {};
  let bucket = '';

  function absorb(res) {
    bucket = bucket || (res && res.bucket) || '';
    normalizeItems(res).forEach(it => {
      const rawPath = String(it.path || '');
      // 跳过当前目录自身条目（旧 COS 形态可能把查询前缀本身也返回）
      if (!rawPath || rawPath === fullPrefix) return;
      const relPath = rawPath.indexOf(fullPrefix) === 0
        ? rawPath.slice(fullPrefix.length)
        : rawPath;
      // 只要一层：相对路径里仍含 '/' 的深层条目跳过（前缀误匹配兜底）
      if (relPath.indexOf('/') !== relPath.length - 1 && relPath.indexOf('/') >= 0) return;
      const name = it.name || baseName(rawPath);
      if (!name) return;
      // path 一律使用「应用根相对的完整路径」（当前层 + 本层相对名），
      // 页面把它直接作为下钻目录使用，深层目录才不会拼错。
      const fullRel = baseRel + (relPath || name + '/');
      if (it.type === 'folder' || rawPath.replace(fullPrefix, '').endsWith('/')) {
        if (!folderMap[fullRel]) folderMap[fullRel] = { name: name, path: fullRel, fullPath: rawPath };
      } else {
        rememberFileId(rawPath, it.cloudObjectId || '');
        if (!fileMap[fullRel]) {
          fileMap[fullRel] = {
            name: name,
            path: fullRel,
            fullPath: rawPath,
            size: it.size || 0,
            lastModified: it.lastModified || '',
            cloudObjectId: it.cloudObjectId || '',
            bucket: bucket
          };
        }
      }
    });
    return res && res.nextMarker;
  }

  const MAX_PAGES = 20;
  function onePage(marker, seen) {
    const ev = { prefix: fullPrefix, limit: 1000 };
    if (marker) ev.marker = marker;
    return cb.callFunction('tcb-file-list', ev).then(res => {
      const next = absorb(res);
      // 没有可用 marker、重复 marker（服务端忽略翻页）、或达到页数上限即停止
      if (next && next !== marker && !seen[next] && seen.__n < MAX_PAGES) {
        seen[next] = 1;
        seen.__n++;
        return onePage(next, seen);
      }
    });
  }

  return onePage('', { __n: 0 }).then(() => ({
    folders: Object.keys(folderMap).map(k => folderMap[k]),
    files: Object.keys(fileMap).map(k => fileMap[k]),
    bucket: bucket,
    root: root,
    prefix: fullPrefix
  }));
}

/* ============ 上传 ============ */

/** 读取小程序本地文件为 ArrayBuffer */
function readLocalFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      success(r) { resolve(r.data); },
      fail(e) { reject(new Error('读取本地文件失败: ' + (e.errMsg || e.message))); }
    });
  });
}

/**
 * 上传本地文件到云端（PG 桶对象 API 直传）。
 * @param {string} app 应用 key
 * @param {string} zoneFolder 分区目录名（如 '图片文件'；空串表示根）
 * @param {string} filePath 小程序本地文件路径
 * @param {string} fileName 展示文件名
 * @returns {Promise<{objectId, cloudObjectId, key}>}
 */
function upload(app, zoneFolder, filePath, fileName) {
  const root = rootOf(app);
  const safeName = String(fileName || ('file-' + Date.now())).replace(/[\\/:*?"<>|]/g, '_');
  const relName = (zoneFolder ? zoneFolder + '/' : '') +
    Date.now() + '-' + Math.floor(Math.random() * 1000) + '-' + safeName;
  // 桶内物理对象路径：app-photos/<root?>/<分区>/<文件名>
  const objectId = joinPhysical(root, relName);

  return readLocalFile(filePath).then(buf => {
    if (buf && buf.byteLength > MAX_FILE_SIZE) {
      throw new Error('文件超过 10MB，请在电脑端网页版上传');
    }
    // PG 桶对象 API：PUT /v1/storages/object/<逻辑桶>/<对象路径>（原始字节直传，Bearer 鉴权）
    const url = '/v1/storages/object/' + BUCKET + '/' +
      encodeObjectPath(objectId.slice(BUCKET.length + 1));
    return cb.req('PUT', url, '', buf, { 'Content-Type': guessMime(safeName) }, false, 'sync');
  }).then(() => {
    // 逻辑桶形态 cloudObjectId（下载/删除实测可用）
    const cid = 'cloud://' + CONFIG.env + '.' + BUCKET + '/' + objectId;
    rememberFileId(objectId, cid);
    return { objectId: objectId, cloudObjectId: cid, key: objectId, downloadUrl: '' };
  });
}

/* ============ 下载链接 ============ */

/**
 * 获取文件的临时下载链接。
 * @param {string} app 应用 key（用于相对路径补全根前缀）
 * @param {object} file 列表项（含 fullPath / cloudObjectId / bucket）
 * @returns {Promise<string>} downloadUrl
 */
function downloadUrl(app, file) {
  const root = rootOf(app);
  const path = filePhysical(root, file);
  const candidates = [];
  const push = c => { if (c && candidates.indexOf(c) < 0) candidates.push(c); };
  // 1) 列目录返回的 fileID / 本地缓存（通常是物理桶形态，直接可用）
  push(file.cloudObjectId || idFor(path));
  // 2) 物理桶形态兜底（bucket 来自列目录返回）
  if (file.bucket) push('cloud://' + CONFIG.env + '.' + file.bucket + '/' + path);
  // 3) 逻辑桶形态兜底
  push('cloud://' + CONFIG.env + '.' + BUCKET + '/' + path);

  // 依次尝试各候选 cloudObjectId，拿到第一个有效链接即返回
  return candidates.reduce(
    (p, c) => p.catch(() => tryDownloadInfo(c)),
    Promise.reject(new Error('start'))
  ).then(url => {
    if (url && path) rememberFileId(path, candidates[0]);
    return url;
  });
}

function tryDownloadInfo(cloudObjectId) {
  return cb.req('POST', '/v1/storages/get-objects-download-info', '',
    [{ cloudObjectId: cloudObjectId }], null, false, 'sync').then(arr => {
      const item = (arr && arr[0]) || {};
      // 优先使用已百分号编码的链接（路径含中文/空格时真机更稳），原始链接兜底
      const url = item.downloadUrlEncoded || item.download_url_encoded ||
        item.downloadUrl || item.download_url || item.url || item.tempFileURL || '';
      if (!url) throw new Error('无下载链接');
      return url;
    });
}

/* ============ 删除 ============ */

/** 删除云端文件（支持批量，单次 ≤50） */
function remove(app, files) {
  const root = rootOf(app);
  const list = (Array.isArray(files) ? files : [files]).map(f => {
    const path = filePhysical(root, f);
    return { cloudObjectId: f.cloudObjectId || cloudObjectIdFor(path) };
  });
  return cb.req('POST', '/v1/storages/delete-objects', '', list, null, false, 'sync')
    .then(() => true);
}

/* ============ MIME 猜测 ============ */
const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain'
};
function guessMime(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return (m && MIME_MAP[m[1].toLowerCase()]) || 'application/octet-stream';
}

module.exports = {
  APP_ROOTS, MAX_FILE_SIZE,
  rootOf, list, upload, downloadUrl, remove, guessMime
};
