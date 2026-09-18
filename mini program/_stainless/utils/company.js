/**
 * 公司抬头模块（与桌面端 apps/stainlessbusiness 完全一致）
 *
 * - 三家公司：无锡华烁特钢 / 无锡泰益特钢 / 无锡泰坦福特钢
 * - 公司列表存全局键 companyList，当前抬头上 currentCompanyId（均参与云同步）
 * - 分公司作用域业务键：<companyId>__<key>（见 db.js）
 * - 印章：seals[].imageData(dataURL) 优先，其次 fileName（包内 /images/），
 *   均无时与桌面端一致兜底 hschop.png
 * - 合同条款：分公司键 salesContractTerms / purchaseContractTerms，
 *   回退全局 contractTerms，再回退内置 13 条
 */
const cb = require('./cloudbase');

const COMPANY_LIST_KEY = 'companyList';
const CURRENT_ID_KEY = 'currentCompanyId';

/* 桌面端 HG 内置默认公司 */
const DEFAULT_COMPANIES = [
  {
    id: 'default-1',
    nameCn: '无锡华烁特钢有限公司',
    nameEn: 'Wuxi Brilliance Special Steel Co., Ltd',
    address: '无锡市梁溪区广益街道柏庄北路128号毛岸睦邻中心三楼320',
    addressEn: '', phone: '', email: '',
    bankName: '', bankAccount: '', bankCode: '305302032056',
    taxNo: '', legalPerson: '',
    seals: [{ id: 'seal-1-1', name: '合同专用章', imageData: '' }]
  },
  {
    id: 'default-2',
    nameCn: '无锡泰益特钢有限公司',
    nameEn: 'Wuxi Taiyi Special Steel Co., Ltd',
    address: '', addressEn: '', phone: '', email: '',
    bankName: '', bankAccount: '', bankCode: '',
    taxNo: '', legalPerson: '',
    seals: [{ id: 'seal-2-1', name: '合同专用章', imageData: '' }]
  },
  {
    id: 'default-3',
    nameCn: '无锡泰坦福特钢有限公司',
    nameEn: 'Wuxi Titanfu Special Steel Co., Ltd',
    address: '', addressEn: '', phone: '', email: '',
    bankName: '', bankAccount: '', bankCode: '',
    taxNo: '', legalPerson: '',
    seals: [{ id: 'seal-3-1', name: '合同专用章', imageData: '' }]
  }
];

/* 销售合同默认条款（桌面端 _le） */
const DEFAULT_SALES_TERMS = [
  '质量标准：按国家标准执行。',
  '付款方式：电汇。',
  '交货地点：买方指定地点。',
  '运输方式及费用负担：供方代办运输或自提。自提运输方式各种费用，如运费、杂费、保险费、吊装费(含厂内)、保安押运费等，由需方承担。供方代办运输方式，在需方指定的地点交货的，运、杂费及其他费用按双方签订的供需协议承担。',
  '需方须按期提货，逾期一个月提货，供方对逾期库存收取每天2元/吨的仓储费，逾期二个月提货，供方对逾期库存收取每天5元/吨的仓储费，逾期三个月提货，供方有权解除合同，同时供方有权将已生产的货物自行处置，由此产生的损失包括但不限于差价由需方承担，需方已支付的货款或预付款归供方所有，同时保留法律诉讼的权利。',
  '需方验收货物时，如确系供方产品的内在质量和数量、规格问题，应在到货15日内提出书面异议。质量发生异议，应以不合规产品实物为限，数量发生异议，应以原包装复称为准。',
  '合理损耗及计算方法：1.按国家规定合理衡差≤0.3%; 2.计量方法:检斤; 3.合同交货尾差:1T以下±30%;1T至10T±15%;10T至30T±10%;30T以上±5%。',
  '结算方式及期限：见供需协议或按约定条件。结算数量及金额以供方提供的发货单为准。',
  '违约责任：执行《中华人民共和国民法典》。',
  '供方因不可抗力因素造成交货延迟，不视为供方违约。',
  '解决合同纠纷方式：执行本合同如发生争议，由双方协商解决。如协商不成，向供方所在地法院(按级别管辖和地域管辖规定的管辖法院)提请诉讼。',
  '其他约定事项：1.本合同如需调整，双方应协商同意后方可变更，并相互换文或另订合同，单方无权变更或解除合同。2.需方不能按期支付货款时，供方有权终止或部分终止合同的履行。3.需方如擅自转让合同，应承担相应的法律责任。',
  '补充条款：副页、附件为本合同的组成部分，与本合同具有同等法律效力。'
];

/* 采购合同默认条款（桌面端 Cle，第 1 条不同） */
const DEFAULT_PURCHASE_TERMS = DEFAULT_SALES_TERMS.slice();
DEFAULT_PURCHASE_TERMS[0] = '质量标准：卖方提供的产品应符合国家相关标准及买方要求，确保产品质量合格。';

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/** 读取公司列表（无则初始化内置三家并持久化） */
function getCompanies() {
  let list = null;
  try { list = cb.safeGet(COMPANY_LIST_KEY); } catch (e) {}
  if (Array.isArray(list) && list.length) return list;
  const def = clone(DEFAULT_COMPANIES);
  try { cb.safeSet(COMPANY_LIST_KEY, def); } catch (e) {}
  return def;
}

/** 保存公司列表（本地 + 云端） */
function saveCompanies(list) {
  if (!Array.isArray(list) || !list.length) return;
  try { cb.safeSet(COMPANY_LIST_KEY, list); } catch (e) {}
  cb.push(COMPANY_LIST_KEY, list).catch(() => {});
}

/** 更新单个公司信息（抬头设置页使用） */
function updateCompany(id, patch) {
  const list = getCompanies();
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return;
  list[idx] = Object.assign({}, list[idx], patch);
  saveCompanies(list);
}

/** 当前公司 id */
function getCurrentId() {
  const list = getCompanies();
  let id = '';
  try { id = wx.getStorageSync(CURRENT_ID_KEY) || ''; } catch (e) {}
  if (!id || !list.find(c => c.id === id)) {
    id = list[0].id;
    setCurrentId(id);
  }
  return id;
}

function setCurrentId(id) {
  try {
    wx.setStorageSync(CURRENT_ID_KEY, id);
    cb.safeSet(CURRENT_ID_KEY, id);
  } catch (e) {}
  cb.push(CURRENT_ID_KEY, id).catch(() => {});
}

/** 当前公司对象 */
function getCurrent() {
  const list = getCompanies();
  const id = getCurrentId();
  return list.find(c => c.id === id) || list[0];
}

/** 切换抬头 */
function switchCompany(id) {
  const list = getCompanies();
  if (!list.find(c => c.id === id)) return false;
  setCurrentId(id);
  return true;
}

/* ============ 印章 ============ */

function sealOf(company) {
  const c = company || getCurrent();
  const seals = c.seals || [];
  return seals.find(s => s && (s.fileName || s.imageData)) || null;
}

/** 规范化印章文件名（桌面端 E2 逻辑：无扩展名补 .png） */
function normalizeSealFile(name) {
  let t = String(name || '').trim().replace(/^[\s/]+/, '').replace(/\s+$/, '');
  if (!t) return 'hschop.png';
  const base = t.indexOf('/') >= 0 ? t.slice(t.lastIndexOf('/') + 1) : t;
  if (!base.includes('.')) return base + '.png';
  return base;
}

/** dataURL 写临时文件（canvas drawImage 需要路径），按内容缓存 */
let dataUrlCache = {};
function dataUrlToPath(dataUrl) {
  let hash = 0;
  for (let i = 5; i < dataUrl.length; i += 97) hash = (hash * 31 + dataUrl.charCodeAt(i)) >>> 0;
  if (dataUrlCache[hash]) return Promise.resolve(dataUrlCache[hash]);
  return new Promise((resolve) => {
    try {
      const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl);
      const ext = m ? (m[1].toLowerCase().indexOf('jp') === 0 ? 'jpg' : 'png') : 'png';
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const filePath = (wx.env.USER_DATA_PATH || '') + '/seal_' + hash.toString(36) + '.' + ext;
      wx.getFileSystemManager().writeFile({
        filePath: filePath,
        data: base64,
        encoding: 'base64',
        success: () => { dataUrlCache[hash] = filePath; resolve(filePath); },
        fail: () => resolve('')
      });
    } catch (e) { resolve(''); }
  });
}

/**
 * 取得当前（或指定）公司印章的 canvas 可绘制路径。
 * 无自定义印章时与桌面端一致兜底包内 /images/hschop.png
 */
async function resolveSealPath(company) {
  const seal = sealOf(company);
  if (seal && seal.imageData) {
    const p = await dataUrlToPath(seal.imageData);
    if (p) return p;
  }
  if (seal && seal.fileName) return '/images/' + normalizeSealFile(seal.fileName);
  return '/images/hschop.png';
}

/** Logo 路径（合同页眉） */
function resolveLogoPath() { return '/images/logo.jpg'; }

/* ============ 合同条款 ============ */

function validTerms(v) {
  if (!Array.isArray(v) || !v.length) return null;
  const out = [];
  v.forEach(t => {
    if (t && typeof t === 'object' && typeof t.content === 'string' && t.content.trim()) {
      out.push({ id: t.id || (out.length + 1), content: t.content });
    }
  });
  return out.length ? out : null;
}

function readKey(key) {
  try {
    const v = cb.safeGet(key);
    if (v === '' || v === null || v === undefined) return null;
    return v;
  } catch (e) { return null; }
}

/**
 * 取合同条款（与桌面端 kle 回退顺序一致）：
 * 分公司键 → 全局 contractTerms → 内置默认
 * @param kind 'sales' | 'purchase'
 */
function getTerms(kind, companyId) {
  const cid = companyId || getCurrentId();
  const scopedKey = cid + '__' + (kind === 'sales' ? 'salesContractTerms' : 'purchaseContractTerms');
  return validTerms(readKey(scopedKey))
    || validTerms(readKey('contractTerms'))
    || (kind === 'sales' ? clone(DEFAULT_SALES_TERMS.map((c, i) => ({ id: i + 1, content: c })))
                         : clone(DEFAULT_PURCHASE_TERMS.map((c, i) => ({ id: i + 1, content: c }))));
}

/** 保存条款到当前分公司键 */
function saveTerms(kind, terms, companyId) {
  const cid = companyId || getCurrentId();
  const key = cid + '__' + (kind === 'sales' ? 'salesContractTerms' : 'purchaseContractTerms');
  const clean = validTerms(terms) || [];
  cb.safeSet(key, clean);
  if (cb.CONFIG.namespaces.app.indexOf(key) < 0) cb.CONFIG.namespaces.app.push(key);
  cb.push(key, clean).catch(() => {});
}

module.exports = {
  DEFAULT_COMPANIES,
  DEFAULT_SALES_TERMS, DEFAULT_PURCHASE_TERMS,
  getCompanies, saveCompanies, updateCompany,
  getCurrentId, setCurrentId, getCurrent, switchCompany,
  sealOf, normalizeSealFile, resolveSealPath, resolveLogoPath,
  getTerms, saveTerms
};
