/**
 * purchase-db.js — 采购一体化数据层（小程序端）
 *
 * 与桌面端 apps/purchase-integrated 同源同构：
 *   - 本地裸键 = 桌面端 localStorage 键名（pis_*），云端键名 = purchase-integrated__ + 裸键，
 *     因此手机端与电脑端读写的是同一份云端数据，角色/公司/供应商/合同/收发货/开票/付款全量互通；
 *   - 集合：pis_orders(采购合同) / pis_shipments(发货) / pis_receipts(收货) /
 *           pis_returns(退货) / pis_invoices(发票) / pis_payments(付款，历史保留) /
 *           pis_suppliers(供应商，全局不分主体)；
 *   - 配置：pis_companies(公司抬头) / pis_units(单位) / pis_terms(合同条款) /
 *           pis_roles(角色权限) / pis_users(用户) / pis_curCompany(当前主体) /
 *           pis_tool_records(包装计算记录) / pis_poPageSize / pis_plyPaste；
 *   - 权限三态：'rw' 读写 / 'r' 只读 / 'none' 不显示；供应商角色额外隔离（只见自己的数据）。
 *
 * 与桌面端的差异（移动端适配）：
 *   1. 付款不写入本地：桌面端付款唯一真相源是报销系统（HTTP /api/payments/external）。
 *      小程序无法访问电脑的 127.0.0.1，故改从云端 reim_invoices（报销模块同一份云端数据）
 *      派生付款视图 —— 口径与桌面端 ReimPay 完全一致
 *      （paid_amount 累计已付 / payment_date 付款日期 / payment_method 付款方式 / project 合同号）。
 *   2. 单号不再依赖云端序号表：改为扫描当日已有单号取 max+1（多端天然一致，无需同步计数器）。
 *   3. 发票 PDF 文本识别不可用（小程序无 DOM/pdf.js），改为手工录入 + 会计科目自动归类。
 */

const supa = require('./cloudbase');
const reim = require('./reim-db');
const pb = require('./pbkdf2');
const fmt = require('./format');

/* ==================== 命名空间键 ==================== */

const KEYS = [
  'pis_companies', 'pis_units', 'pis_terms', 'pis_roles', 'pis_users',
  'pis_suppliers', 'pis_curCompany',
  'pis_orders', 'pis_shipments', 'pis_receipts', 'pis_returns', 'pis_invoices', 'pis_payments',
  'pis_tool_records', 'pis_poPageSize', 'pis_plyPaste'
];

/** 数组型键（其余为对象/标量） */
const ARRAY_KEYS = [
  'pis_companies', 'pis_units', 'pis_terms', 'pis_roles', 'pis_users',
  'pis_suppliers', 'pis_orders', 'pis_shipments', 'pis_receipts', 'pis_returns',
  'pis_invoices', 'pis_payments', 'pis_tool_records'
];

const COLLECTIONS = {
  orders: '采购合同', shipments: '发货记录', receipts: '收货记录', returns: '退货记录',
  invoices: '发票', payments: '付款记录', suppliers: '供应商'
};

/** 全局集合（不受公司主体过滤） */
const GLOBAL_COLS = ['suppliers'];

/** 全部公司（仅查看用，不可作为数据归属） */
const ALL_COMPANIES = '__all__';

/* ==================== 默认数据（与桌面端 common.js 完全一致） ==================== */

const DEFAULT_COMPANIES = [
  { code: '普利美', name: '普利美（常州）环境工程科技有限公司' },
  { code: '龙力', name: '无锡龙力印铁设备制造有限公司' }
];
const DEFAULT_UNITS = ['只', '卷', '箱', '吨', '公斤', '套', '个', '张', '米'];
const DEFAULT_CATEGORIES = ['包装箱费用', '包装材料', '原材料', '辅助材料', '易耗品材料', '贸易往来', '贸易产品', '固定资产'];
const DEFAULT_TERMS = [
  '交货方式：供方送货至需方指定地点，运费由供方承担。',
  '验收标准：货到后需方按合同约定数量及外观验收，如有异议应于收货后三日内书面提出。',
  '结算方式：供方凭增值税发票及需方签收单结算，票到账期30天。',
  '质量要求：产品应符合国家标准、行业标准及双方确认的样品要求，因质量问题产生的损失由供方承担。',
  '本合同一式两份，双方各执一份，经双方签字盖章后生效，传真件具有同等法律效力。'
];

/** 模块清单：key 与桌面端权限键完全一致（pis_roles.permissions 按此键存） */
const PAGES = [
  { key: 'dashboard', name: '工作台', group: '概览', ico: '⌂', url: '/pages/purchase/hub/hub' },
  { key: 'purchase', name: '采购管理', group: '业务流程', ico: '▤', url: '/pages/purchase/contract/contract' },
  { key: 'ship', name: '发货管理', group: '业务流程', ico: '⇨', url: '/pages/purchase/ship/ship' },
  { key: 'receive', name: '收货管理', group: '业务流程', ico: '⇩', url: '/pages/purchase/receive/receive' },
  { key: 'invoice', name: '开票管理', group: '业务流程', ico: '⎘', url: '/pages/purchase/invoice/invoice' },
  { key: 'payment', name: '付款管理', group: '业务流程', ico: '¥', url: '/pages/purchase/payment/payment' },
  { key: 'recon', name: '对账管理', group: '业务流程', ico: '⇌', url: '/pages/purchase/recon/recon' },
  { key: 'suppliers', name: '供应商管理', group: '基础数据', ico: '◈', url: '/pages/purchase/supplier/supplier' },
  { key: 'reports', name: '数据统计', group: '分析与工具', ico: '▟', url: '/pages/purchase/report/report' },
  { key: 'tools', name: '工具箱', group: '分析与工具', ico: '⚙', url: '/pages/purchase/tools/tools' },
  { key: 'admin', name: '系统管理', group: '系统', ico: '☰', adminOnly: true, url: '/pages/purchase/admin/admin' }
];

const PAGE_BY_KEY = {};
PAGES.forEach(p => { PAGE_BY_KEY[p.key] = p; });

const DEFAULT_PAGES_PERM = PAGES.map(p => p.key);
const DEFAULT_ROLES = [
  { id: 'role_admin', key: 'admin', name: '管理员', locked: true, permissions: mapPerm(k => 'rw') },
  { id: 'role_purchaser', key: 'purchaser', name: '采购员', locked: false, permissions: mapPerm(k => ['dashboard', 'purchase', 'ship', 'receive', 'suppliers', 'reports', 'tools'].indexOf(k) >= 0 ? 'rw' : 'none') },
  { id: 'role_warehouse', key: 'warehouse', name: '仓管员', locked: false, permissions: mapPerm(k => ['dashboard', 'ship', 'receive', 'reports', 'tools'].indexOf(k) >= 0 ? 'rw' : 'none') },
  { id: 'role_finance', key: 'finance', name: '财务人员', locked: false, permissions: mapPerm(k => ['dashboard', 'invoice', 'payment', 'recon', 'reports', 'tools'].indexOf(k) >= 0 ? 'rw' : 'none') },
  { id: 'role_supplier', key: 'supplier', name: '供应商', locked: true, supplierRole: true, permissions: mapPerm(k => k === 'ship' ? 'rw' : ['dashboard', 'purchase', 'receive', 'invoice', 'payment', 'recon'].indexOf(k) >= 0 ? 'r' : 'none') }
];
function mapPerm(fn) {
  const o = {};
  DEFAULT_PAGES_PERM.forEach(k => { o[k] = fn(k); });
  return o;
}

/** 发票类型 / 会计科目（与桌面端 classifier.js 同口径，按序命中） */
const INVOICE_TYPES = ['增值税专用发票', '增值税普通发票', '其他发票'];
const SUBJECT_RULES = [
  ['660101', '差旅费-交通费', ['客运', '旅客运输', '铁路', '动车', '高铁', '航空', '民航', '出租车', '网约车', '滴滴', '运输服务', '过路费', '通行费', '停车费', '火车', '机票', '船票']],
  ['660102', '差旅费-住宿费', ['住宿', '宾馆', '酒店', '旅馆', '民宿']],
  ['660103', '差旅费-餐费', ['餐费', '伙食', '团餐']],
  ['660201', '业务招待费', ['餐饮服务', '宴请', '烟酒', '茶楼']],
  ['660202', '办公费', ['办公用品', '办公', '文具', '纸张', '印刷', '耗材', '硒鼓', '墨盒', '图书', '杂志', '家具']],
  ['660203', '通讯费', ['电信', '移动', '联通', '话费', '通信', '通讯', '宽带']],
  ['660204', '水电费', ['水费', '电费', '燃气', '供暖', '物业']],
  ['660205', '租赁费', ['租赁', '房租', '租金', '租车']],
  ['660206', '咨询/服务费', ['咨询服务', '技术咨询', '会计服务', '审计', '法律服务', '律师', '设计服务', '技术服务', '软件开发']],
  ['660207', '广告宣传费', ['广告', '宣传', '推广', '设计制作', '会展', '展览']],
  ['660208', '培训费', ['培训', '教育服务', '会务', '会议费', '会议服务']],
  ['660209', '运输装卸费', ['货物运输', '装卸', '搬运', '物流', '快递', '邮费', '运费']],
  ['660210', '维修费', ['维修', '修理', '保养', '维护']],
  ['1403', '原材料', ['钢材', '水泥', '原料', '材料', '五金', '配件', '零部件', '螺栓', '圆钢', '钢管', '钢板', '钢坯', '不锈钢', '铝材', '铜材', '金属', '卷板', '带钢']],
  ['1601', '固定资产', ['设备', '机器', '计算机设备', '电脑', '服务器', '空调', '机床', '模具']],
  ['660299', '其他费用', []]
];

/* ==================== 小工具 ==================== */

function uid(prefix) { return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[¥￥,，\s]/g, '')); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(num(v) * 100) / 100; }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
/** 多值分隔（合同号支持一单多票：，,、;；\s） */
function splitMulti(s) { return String(s || '').split(/[，,、;；\s]+/).map(x => x.trim()).filter(Boolean); }

/* ==================== 数据缓存与持久化 ==================== */

const data = {};
KEYS.forEach(k => { data[k] = ARRAY_KEYS.indexOf(k) >= 0 ? [] : (k === 'pis_curCompany' ? '' : ''); });
data.pis_poPageSize = 15;
data.pis_plyPaste = null;

let cloudSynced = false;

function save(key) {
  try { supa.safeSet(key, data[key]); } catch (e) { /* 静默 */ }
  supa.push(key, data[key]).catch(() => {});
}
/**
 * 只落本地、不入云端推送队列。
 * 用于本地兜底种子数据：云端同步成功后会被 takeCloud 判定为接受云端值，
 * 因此不会把本机兜底配置推上云端覆盖电脑端已有设置。
 */
function saveLocal(key) {
  try { supa.safeSet(key, data[key]); } catch (e) { /* 静默 */ }
}

/** 种子：仅在本地缺失时写入（只落本地，不推云端） */
function seed() {
  if (!Array.isArray(data.pis_companies) || !data.pis_companies.length) {
    data.pis_companies = DEFAULT_COMPANIES.map(c => Object.assign({}, c));
    saveLocal('pis_companies');
  }
  if (!Array.isArray(data.pis_units) || !data.pis_units.length) {
    data.pis_units = DEFAULT_UNITS.slice();
    saveLocal('pis_units');
  }
  if (!Array.isArray(data.pis_terms) || !data.pis_terms.length) {
    data.pis_terms = DEFAULT_TERMS.slice();
    saveLocal('pis_terms');
  }
  if (!Array.isArray(data.pis_roles) || !data.pis_roles.length) {
    data.pis_roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    saveLocal('pis_roles');
  }
  if (!Array.isArray(data.pis_users)) data.pis_users = [];
  if (!data.pis_curCompany) { data.pis_curCompany = DEFAULT_COMPANIES[0].code; saveLocal('pis_curCompany'); }
}

function loadAll() {
  KEYS.forEach(k => {
    try {
      const v = supa.safeGet(k);
      if (v !== '' && v !== undefined && v !== null) data[k] = v;
    } catch (e) { /* 忽略 */ }
  });
  ARRAY_KEYS.forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
  seed();
  // 报销侧数据（付款唯一来源）：确保已从本地存储装载
  try { reim.loadAll(); } catch (e) { /* 忽略 */ }
}

function syncFromCloud(cb) {
  if (!supa.isConfigured()) { if (typeof cb === 'function') cb(false, 0); return; }
  supa.setSuppressPush(true);
  supa.pullAll('purchaseint').then(rows => {
    let applied = 0;
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (!r || KEYS.indexOf(r.key) < 0) return;
        if (r.value === null || r.value === undefined || r.value === '') return;
        const isArr = ARRAY_KEYS.indexOf(r.key) >= 0;
        if (isArr && !Array.isArray(r.value)) return;
        if (!supa.takeCloud(r.key, r.updatedAt, data[r.key])) return;
        data[r.key] = r.value;
        supa.safeSet(r.key, r.value);
        applied++;
      });
    }
    supa.setSuppressPush(false);
    seed();
    cloudSynced = true;
    if (typeof cb === 'function') cb(true, applied);
  }).catch(() => {
    supa.setSuppressPush(false);
    cloudSynced = true;
    if (typeof cb === 'function') cb(false, 0);
  });
}

function isCloudSynced() { return cloudSynced; }

/* ==================== 公司主体 ==================== */

function companies() { return Array.isArray(data.pis_companies) ? data.pis_companies : []; }
function companyName(code) {
  if (code === ALL_COMPANIES) return '全部公司';
  const c = companies().find(x => x.code === code);
  return c ? c.name : (code || '');
}
function curCompany() {
  const v = data.pis_curCompany;
  if (v === ALL_COMPANIES) return ALL_COMPANIES;
  if (companies().some(c => c.code === v)) return v;
  return companies().length ? companies()[0].code : DEFAULT_COMPANIES[0].code;
}
function setCurCompany(code) {
  data.pis_curCompany = code;
  save('pis_curCompany');
}
/** 写入用公司代码：全部公司视图回落到第一家（哨兵绝不可写入数据） */
function writeCompany() {
  const c = curCompany();
  if (c !== ALL_COMPANIES) return c;
  return companies().length ? companies()[0].code : DEFAULT_COMPANIES[0].code;
}
/**
 * 新增 / 编辑公司抬头（简称 code 唯一；编辑时简称只读，与桌面端一致）
 * 更名（改 name）不改 code，因此不影响已落库的 company 字段。
 */
function saveCompany(form) {
  const list = data.pis_companies;
  const code = String(form.code || '').trim();
  const name = String(form.name || '').trim();
  if (!code) return { ok: false, msg: '请填写简称' };
  if (!name) return { ok: false, msg: '请填写公司名称' };
  const dup = list.find(c => c.code === code);
  if (dup) {
    if (dup.name === name) return { ok: true, company: dup };
    dup.name = name;
    save('pis_companies');
    return { ok: true, company: dup };
  }
  const rec = { code: code, name: name };
  list.push(rec);
  save('pis_companies');
  return { ok: true, company: rec };
}

/** 删除公司抬头：业务数据不删除，仅不再显示（与桌面端一致） */
function deleteCompany(code) {
  if (companies().length <= 1) return { ok: false, msg: '至少保留一家公司抬头' };
  data.pis_companies = companies().filter(c => c.code !== code);
  save('pis_companies');
  // 若当前主体被删，回落到第一家
  if (data.pis_curCompany === code) setCurCompany(data.pis_companies[0].code);
  return { ok: true };
}

/* ==================== 会话与权限 ==================== */

const SESSION_KEY = '_purchase_session'; // 本机会话，不走云端同步

const Session = {
  user: null,
  role() {
    const u = this.user;
    if (!u) return {};
    return roles().find(r => r.key === u.role) || {};
  },
  isSupplier() { const r = this.role(); return !!(r && r.supplierRole); },
  isAdmin() { return !!(this.user && this.user.role === 'admin'); },
  /** 权限三态归一化（兼容旧布尔：true→rw / false→none） */
  permOf(page) {
    if (!this.user) return 'none';
    if (this.isAdmin()) return 'rw';
    const v = (this.role().permissions || {})[page];
    if (v === 'rw' || v === true) return 'rw';
    if (v === 'r') return 'r';
    return 'none';
  },
  can(page) { return this.permOf(page) !== 'none'; },
  /** 可写：只读角色一律不可写；供应商仅「发货」「开票」可写 */
  canWrite(page) {
    if (this.permOf(page) !== 'rw') return false;
    if (this.isSupplier()) return page === 'ship' || page === 'invoice';
    return true;
  },
  mySupplier() { return this.isSupplier() ? (this.user.supplierName || '') : ''; },
  displayName() { return (this.user && (this.user.name || this.user.username)) || ''; }
};

function loadSession() {
  try { Session.user = wx.getStorageSync(SESSION_KEY) || null; } catch (e) { Session.user = null; }
  if (!Session.user || !Session.user.id) { Session.user = null; return; }
  const list = users();
  // 用户表尚未从云端拉到时不做校验：否则冷启动会把有效会话误判为失效
  if (!list.length) return;
  const cur = list.find(u => String(u.id) === String(Session.user.id));
  // 用户被删除/停用 → 会话失效；否则以云端最新资料为准（角色可能被管理员调整）
  if (!cur || cur.active === false) { Session.user = null; saveSession(); return; }
  Session.user = cur;
  saveSession();
}
function saveSession() {
  try {
    if (Session.user) wx.setStorageSync(SESSION_KEY, Session.user);
    else wx.removeStorageSync(SESSION_KEY);
  } catch (e) { /* 静默 */ }
}

/* ---- 密码哈希（与桌面端 common.js hashPwd 完全兼容） ---- */

/** sha256('pis::' + pwd) → 's1:<hex>' */
function hashPwd(pwd) {
  const bytes = pb.strToBytes('pis::' + pwd);
  return 's1:' + pb.toHex(pb.sha256(bytes));
}
/** 桌面端非安全上下文回退算法（djb2 变体），用于校验历史账号 */
function hashPwdFallback(pwd) {
  const salted = 'pis::' + pwd;
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < salted.length; i++) {
    const c = salted.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 ^ c) >>> 0;
  }
  return 'f1:' + h1.toString(16) + '-' + h2.toString(16);
}
/** 校验密码：兼容 seed: 明文种子 / s1: SHA-256 / f1: djb2 三种形态 */
function verifyPwd(pwd, stored) {
  const s = String(stored || '');
  if (!s) return false;
  if (s.indexOf('seed:') === 0) return s.slice(5) === pwd;
  if (s.indexOf('s1:') === 0) return s === hashPwd(pwd) || s === hashPwdFallback(pwd);
  if (s.indexOf('f1:') === 0) return s === hashPwdFallback(pwd) || s === hashPwd(pwd);
  return s === pwd;
}

/* ==================== 用户 / 角色 ==================== */

function users() { return Array.isArray(data.pis_users) ? data.pis_users : []; }
function roles() { return Array.isArray(data.pis_roles) && data.pis_roles.length ? data.pis_roles : DEFAULT_ROLES; }

/** 名称优先、其次用户名（登录页展示） */
function userLabel(u) { return (u && (u.name || u.username)) || ''; }

function login(username, pwd) {
  const un = String(username || '').trim().toLowerCase();
  if (!un) return { ok: false, msg: '请输入用户名' };
  const u = users().find(x => String(x.username || '').toLowerCase() === un);
  if (!u) return { ok: false, msg: '用户名不存在' };
  if (u.active === false) return { ok: false, msg: '该账号已被停用' };
  if (!verifyPwd(String(pwd || ''), u.pwd)) return { ok: false, msg: '密码不正确' };
  Session.user = u;
  saveSession();
  return { ok: true, user: u };
}
function logout() { Session.user = null; saveSession(); }

function saveUser(form) {
  const list = data.pis_users;
  const un = String(form.username || '').trim();
  if (!un) return { ok: false, msg: '用户名不能为空' };
  const dup = list.find(x => String(x.username || '').toLowerCase() === un.toLowerCase() && String(x.id) !== String(form.id || ''));
  if (dup) return { ok: false, msg: '用户名「' + un + '」已存在' };
  const rec = {
    id: form.id || uid('pu_'),
    username: un,
    pwd: form.pwd ? String(form.pwd) : hashPwd('123456'),
    name: form.name || un,
    role: form.role || 'purchaser',
    supplierName: form.supplierName || '',
    active: form.active === false ? false : true,
    createdAt: form.createdAt || new Date().toISOString()
  };
  if (form.pwdPlain) rec.pwd = hashPwd(form.pwdPlain);
  const idx = list.findIndex(x => String(x.id) === String(rec.id));
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  save('pis_users');
  return { ok: true, user: rec };
}
function deleteUser(id) {
  const u = users().find(x => String(x.id) === String(id));
  if (u && u.username === 'admin') return { ok: false, msg: '内置管理员不可删除' };
  data.pis_users = users().filter(x => String(x.id) !== String(id));
  save('pis_users');
  return { ok: true };
}
function setUserActive(id, active) {
  const u = users().find(x => String(x.id) === String(id));
  if (!u) return { ok: false, msg: '用户不存在' };
  if (u.username === 'admin' && active === false) return { ok: false, msg: '内置管理员不可停用' };
  u.active = active !== false;
  save('pis_users');
  return { ok: true, user: u };
}
function resetUserPwd(id, newPwd) {
  const u = users().find(x => String(x.id) === String(id));
  if (!u) return { ok: false, msg: '用户不存在' };
  u.pwd = hashPwd(newPwd || '123456');
  save('pis_users');
  return { ok: true };
}

function saveRole(form) {
  const list = data.pis_roles.length ? data.pis_roles : (data.pis_roles = JSON.parse(JSON.stringify(DEFAULT_ROLES)));
  const key = String(form.key || '').trim();
  if (!key) return { ok: false, msg: '角色标识不能为空' };
  const dup = list.find(r => r.key === key && String(r.id) !== String(form.id || ''));
  if (dup) return { ok: false, msg: '角色标识已存在' };
  const rec = {
    id: form.id || uid('pr_'),
    key: key,
    name: form.name || key,
    locked: !!form.locked,
    supplierRole: !!form.supplierRole,
    permissions: form.permissions || mapPerm(() => 'none')
  };
  const idx = list.findIndex(r => String(r.id) === String(rec.id));
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  save('pis_roles');
  return { ok: true, role: rec };
}
/** 权限矩阵单格修改 */
function setRolePerm(roleId, pageKey, value) {
  const r = roles().find(x => String(x.id) === String(roleId));
  if (!r) return { ok: false, msg: '角色不存在' };
  if (r.key === 'admin') return { ok: false, msg: '管理员权限固定为读写' }; // 与电脑端一致
  r.permissions = r.permissions || {};
  r.permissions[pageKey] = value;
  save('pis_roles');
  return { ok: true };
}
function deleteRole(id) {
  const r = roles().find(x => String(x.id) === String(id));
  if (!r) return { ok: false, msg: '角色不存在' };
  if (r.locked) return { ok: false, msg: '内置角色不可删除' };
  if (users().some(u => u.role === r.key)) return { ok: false, msg: '该角色下仍有用户，无法删除' };
  data.pis_roles = roles().filter(x => String(x.id) !== String(id));
  save('pis_roles');
  return { ok: true };
}

/* ==================== 通用数据访问（公司过滤 + 供应商隔离） ==================== */

function all(coll) { const a = data['pis_' + coll]; return Array.isArray(a) ? a : []; }

function list(coll) {
  let arr = all(coll).slice();
  if (GLOBAL_COLS.indexOf(coll) < 0 && !Session.isSupplier()) {
    const co = curCompany();
    if (co !== ALL_COMPANIES) arr = arr.filter(r => !r.company || r.company === co);
  }
  if (Session.isSupplier()) {
    const me = Session.mySupplier();
    if (GLOBAL_COLS.indexOf(coll) < 0) arr = arr.filter(r => r.supplier === me);
    else arr = arr.filter(r => r.supplierName === me);
  }
  return arr;
}

function add(coll, rec) { const arr = data['pis_' + coll]; arr.unshift(rec); save('pis_' + coll); }
function update(coll, id, patch) {
  const arr = data['pis_' + coll];
  const i = arr.findIndex(r => String(r.id) === String(id));
  if (i > -1) { Object.assign(arr[i], patch, { updatedAt: new Date().toISOString() }); save('pis_' + coll); }
}
function remove(coll, id) {
  data['pis_' + coll] = all(coll).filter(r => String(r.id) !== String(id));
  save('pis_' + coll);
}
/** 仅清空当前公司主体（全局集合清全部） */
function clearColl(coll) {
  if (GLOBAL_COLS.indexOf(coll) >= 0) data['pis_' + coll] = [];
  else {
    if (curCompany() === ALL_COMPANIES) return { ok: false, msg: '「全部公司」视图下不可清空，请先切换到具体公司主体' };
    const co = curCompany();
    data['pis_' + coll] = all(coll).filter(r => r.company !== co);
  }
  save('pis_' + coll);
  return { ok: true };
}

/* ==================== 单号生成（扫描当日已有单号取 max+1） ==================== */

/**
 * 生成当日单号：prefix + YYYYMMDD + '-' + 三位序号。
 * 与桌面端 nextNo/peekNo 语义一致（不消耗序号，保存记录时天然"落号"），
 * 但改为从已有单号推导 —— 手机与电脑同时开单也不会撞号，无需同步序号表。
 * @param {string} prefix 如 'HT-' / 'SHP-' / 'RCV-' / 'RET-' / 'SUP-' / 'DZ-'
 * @param {string[]} existingNos 已存在的同前缀单号（通常传当日相关集合的单号）
 */
function nextNo(prefix, existingNos) {
  const d = new Date();
  const head = prefix + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-';
  let max = 0;
  (existingNos || []).forEach(no => {
    const s = String(no == null ? '' : no);
    if (s.indexOf(head) !== 0) return;
    const n = parseInt(s.slice(head.length), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return head + String(max + 1).padStart(3, '0');
}
/** 预览单号（与 nextNo 完全等价：本实现不预留序号） */
function peekNo(prefix, existingNos) { return nextNo(prefix, existingNos); }

function orderNos() { return all('orders').map(o => o.contractNumber); }
function shipNos() { return all('shipments').map(o => o.shipNumber); }
function receiptNos() { return all('receipts').map(o => o.receiptNumber); }
function returnNos() { return all('returns').map(o => o.returnNumber); }
function invoiceNos() { return all('invoices').map(o => o.invoiceNumber); }
function supplierNos() { return all('suppliers').map(o => o.supplierNumber); }
function nextOrderNo() { return nextNo('HT-', orderNos()); }
function nextShipNo() { return nextNo('SHP-', shipNos()); }
function nextReceiptNo() { return nextNo('RCV-', receiptNos()); }
function nextReturnNo() { return nextNo('RET-', returnNos()); }
function nextSupplierNo() { return nextNo('SUP-', supplierNos()); }
function nextReconNo() { return nextNo('DZ-', []); }

/* ==================== 供应商 ==================== */

function suppliers() { return all('suppliers'); }
function supplierNames() { return suppliers().map(s => s.supplierName).filter(Boolean); }

function findSupplierByName(name) {
  if (!name) return null;
  const n = String(name).trim();
  return suppliers().find(s => String(s.supplierName || '').trim() === n) || null;
}

function saveSupplier(form) {
  const list = data.pis_suppliers;
  const name = String(form.supplierName || '').trim();
  if (!name) return { ok: false, msg: '供应商名称不能为空' };
  const dup = list.find(s => String(s.supplierName || '').trim() === name && String(s.id) !== String(form.id || ''));
  if (dup) return { ok: false, msg: '供应商「' + name + '」已存在' };
  const rec = {
    id: form.id || uid('sup_'),
    supplierNumber: form.supplierNumber || nextSupplierNo(),
    supplierName: name,
    contactPerson: form.contactPerson || '',
    phoneNumber: form.phoneNumber || '',
    email: form.email || '',
    companyAddress: form.companyAddress || '',
    bankName: form.bankName || '',
    bankCode: form.bankCode || '',
    bankAccount: form.bankAccount || '',
    remarks: form.remarks || '',
    createdAt: form.createdAt || new Date().toISOString()
  };
  const idx = list.findIndex(s => String(s.id) === String(rec.id));
  const oldName = idx >= 0 ? list[idx].supplierName : '';
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  save('pis_suppliers');
  // 改名级联：业务数据里的 supplier 一并更新（与桌面端一致）
  if (oldName && oldName !== name) renameSupplierEverywhere(oldName, name);
  return { ok: true, supplier: rec };
}

function renameSupplierEverywhere(oldName, newName) {
  ['orders', 'shipments', 'receipts', 'returns', 'invoices', 'payments'].forEach(coll => {
    const arr = all(coll);
    let dirty = false;
    arr.forEach(r => { if (r.supplier === oldName) { r.supplier = newName; dirty = true; } });
    if (dirty) save('pis_' + coll);
  });
}

function deleteSupplier(id) {
  data.pis_suppliers = suppliers().filter(s => String(s.id) !== String(id));
  save('pis_suppliers');
  return { ok: true };
}

/** 保存合同时自动登记供应商（不存在则用 SUP- 编号建档） */
function ensureSupplier(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const hit = findSupplierByName(n);
  if (hit) return hit;
  const res = saveSupplier({ supplierName: n });
  return res.ok ? res.supplier : null;
}

/* ==================== 供应商模糊匹配（与桌面端 matchReimSupplier 同口径） ==================== */

function normOrgName(n) { return n ? String(n).replace(/[\s　()（）·、,，]/g, '').trim() : ''; }
function normSupplierKey(n) {
  return normOrgName(n).replace(/(有限责任公司|股份有限公司|有限公司|公司|厂|经营部|商行|店)$/, '');
}
/** 完全相等(1) > 双向包含(0.8) > 最长公共子串占比(≤0.7)；阈值 0.45 */
function matchSupplier(nameUri) {
  return matchReimSupplier(nameUri);
}
function matchReimSupplier(sellerName, pool) {
  const target = normSupplierKey(sellerName);
  if (!target) return null;
  const sups = pool || suppliers();
  let best = null, bestScore = 0;
  sups.forEach(s => {
    const n = normSupplierKey(s && s.supplierName);
    if (!n) return;
    let score = 0;
    if (n === target) score = 1;
    else if (n.indexOf(target) >= 0 || target.indexOf(n) >= 0) score = 0.8;
    else {
      let max = 0;
      for (let i = 0; i < target.length; i++) {
        for (let j = i + 4; j <= target.length; j++) {
          const sub = target.slice(i, j);
          if (n.indexOf(sub) >= 0 && sub.length > max) max = sub.length;
        }
      }
      if (max >= 4) score = Math.min(0.7, max / Math.max(target.length, n.length));
    }
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return bestScore >= 0.45 ? best : null;
}

/* ==================== 采购合同 ==================== */

function orders() { return all('orders'); }
function orderByNo(cno) { return orders().find(o => o.contractNumber === cno) || null; }
function orderProducts(o) { return (o && o.products) || []; }
/** 明细金额：取 amount，缺省时按 单价×数量 */
function productAmount(p) { return r2(p.amount !== undefined && p.amount !== '' ? p.amount : num(p.unitPrice) * num(p.quantity)); }
function orderOrderedQty(o) { return orderProducts(o).reduce((s, p) => s + num(p.quantity), 0); }

function saveOrder(form) {
  const products = (form.products || []).map(p => ({
    name: p.name || '',
    spec: p.spec || '',
    unit: p.unit || '只',
    unitPrice: num(p.unitPrice),
    quantity: num(p.quantity),
    amount: r2(num(p.unitPrice) * num(p.quantity)),
    remark: p.remark || ''
  }));
  const rec = {
    id: form.id || uid('po_'),
    company: form.company || writeCompany(),
    contractNumber: String(form.contractNumber || '').trim(),
    supplier: String(form.supplier || '').trim(),
    po: form.po || '',
    orderDate: form.orderDate || '',
    deliveryDate: form.deliveryDate || '',
    category: form.category || '',
    products: products,
    totalAmount: r2(products.reduce((s, p) => s + p.amount, 0)),
    remark: form.remark || '',
    createdAt: form.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!rec.contractNumber) rec.contractNumber = nextOrderNo();
  // 合同号在同一公司主体下唯一
  const dup = orders().find(o => o.contractNumber === rec.contractNumber && String(o.id) !== String(rec.id) && o.company === rec.company);
  if (dup) return { ok: false, msg: '合同号「' + rec.contractNumber + '」已存在' };

  const arr = data.pis_orders;
  const idx = arr.findIndex(o => String(o.id) === String(rec.id));
  if (idx >= 0) arr[idx] = rec; else arr.unshift(rec);
  save('pis_orders');
  // 自动登记供应商档案
  if (rec.supplier) ensureSupplier(rec.supplier);
  return { ok: true, order: rec };
}

function deleteOrder(id) {
  remove('orders', id);
  return { ok: true };
}

/** 复制合同：新合同号 + 全部内容与明细（桌面端「复制」按钮） */
function copyOrder(id) {
  const src = orders().find(o => String(o.id) === String(id));
  if (!src) return { ok: false, msg: '合同不存在' };
  const form = Object.assign({}, src, { id: '', contractNumber: nextOrderNo(), createdAt: '' });
  return saveOrder(form);
}

/** 把合同行数/金额按实收调整（收货页「按实收调整合同」） */
function adjustOrderToReceived(orderId) {
  const o = orders().find(x => String(x.id) === String(orderId));
  if (!o) return { ok: false, msg: '合同不存在' };
  let changed = false;
  orderProducts(o).forEach(p => {
    const recv = receivedQty(o.contractNumber, p.name) - returnedQty(o.contractNumber, p.name);
    if (recv >= 0 && Math.abs(recv - num(p.quantity)) > 0.0001) {
      p.quantity = recv;
      p.amount = r2(num(p.unitPrice) * recv);
      changed = true;
    }
  });
  if (!changed) return { ok: false, msg: '合同数量与实收一致，无需调整' };
  o.totalAmount = r2(orderProducts(o).reduce((s, p) => s + num(p.amount), 0));
  o.updatedAt = new Date().toISOString();
  save('pis_orders');
  return { ok: true, order: o };
}

/* ==================== 收 / 发 / 退数量与状态 ==================== */

function sumQty(coll, cno, pname, field, dateField, dateEnd) {
  return all(coll).filter(r => r.contractNumber === cno && (!pname || r.product === pname))
    .filter(r => !dateEnd || !r[dateField] || r[dateField] <= dateEnd)
    .reduce((s, r) => s + num(r[field]), 0);
}
const receivedQty = (cno, pn) => sumQty('receipts', cno, pn, 'quantity', 'receiptDate');
const returnedQty = (cno, pn) => sumQty('returns', cno, pn, 'quantity', 'returnDate');
const shippedQty = (cno, pn) => sumQty('shipments', cno, pn, 'quantity', 'shipDate');

const SHIP_PENDING = '待确认', SHIP_PARTIAL = '部分确认', SHIP_CONFIRMED = '已确认';
const RECV_PENDING = '待确认', RECV_CONFIRMED = '已确认';

function orderReceivedTotal(o) { return orderProducts(o).reduce((s, p) => s + receivedQty(o.contractNumber, p.name), 0); }
function orderReturnTotal(o) { return orderProducts(o).reduce((s, p) => s + returnedQty(o.contractNumber, p.name), 0); }
function orderShippedTotal(o) { return orderProducts(o).reduce((s, p) => s + shippedQty(o.contractNumber, p.name), 0); }

/** 合同状态：已收齐 / 部分收货 / 未收货 / 执行中（无有效订购数量） */
function orderStatus(o) {
  const ordered = orderOrderedQty(o);
  const recv = Math.max(0, orderReceivedTotal(o) - orderReturnTotal(o));
  if (ordered <= 0) return { t: '执行中', c: 'badge-gray' };
  if (recv >= ordered) return { t: '已收齐', c: 'badge-green' };
  if (recv > 0) return { t: '部分收货', c: 'badge-orange' };
  return { t: '未收货', c: 'badge-gray' };
}

/** 发货单已确认收货合计（按 公司+合同+产品+发货单号 归集） */
function confirmedQtyOfShip(rec) {
  return all('receipts')
    .filter(x => x.company === rec.company && x.contractNumber === rec.contractNumber &&
      x.product === rec.product && x.shipNumber === rec.shipNumber)
    .reduce((s, x) => s + num(x.quantity), 0);
}
/** 派生发货状态（以收货记录为准，避免字段与数据不一致） */
function deriveShipStatus(rec) {
  const done = confirmedQtyOfShip(rec);
  if (done <= 0) return SHIP_PENDING;
  return done + 0.0001 >= num(rec.quantity) ? SHIP_CONFIRMED : SHIP_PARTIAL;
}
function shipStatusBadge(st) {
  return st === SHIP_CONFIRMED ? 'badge-green' : st === SHIP_PARTIAL ? 'badge-orange' : 'badge-gray';
}

/* ==================== 发票 ==================== */

function invoices() { return all('invoices'); }
function invoicedOfContract(cno) {
  return invoices().filter(v => splitMulti(v.contractNumber).indexOf(cno) >= 0)
    .reduce((s, v) => s + num(v.amount), 0);
}
function invoiceStatus(inv) {
  const paid = paidOfInvoice(inv.invoiceNumber);
  if (paid <= 0) return { t: '未付款', c: 'badge-gray' };
  if (paid >= num(inv.amount) - 0.005) return { t: '已付清', c: 'badge-green' };
  return { t: '部分付款', c: 'badge-orange' };
}
/** 会计科目自动归类（品名 + 销售方关键词，按序命中） */
function classifySubject(itemName, sellerName) {
  const text = (itemName || '') + ' ' + (sellerName || '');
  for (let i = 0; i < SUBJECT_RULES.length; i++) {
    const rule = SUBJECT_RULES[i];
    for (let j = 0; j < rule[2].length; j++) {
      if (text.indexOf(rule[2][j]) >= 0) return { code: rule[0], name: rule[1] };
    }
  }
  return { code: '660299', name: '其他费用' };
}
function allSubjects() { return SUBJECT_RULES.map(r => ({ code: r[0], name: r[1] })); }

function saveInvoice(form) {
  const no = String(form.invoiceNumber || '').trim();
  if (!no) return { ok: false, msg: '发票号码不能为空' };
  const dup = invoices().find(v => String(v.invoiceNumber) === no && String(v.id) !== String(form.id || ''));
  if (dup) return { ok: false, msg: '发票号「' + no + '」已存在' };
  const subj = (form.subjectCode || form.subjectName)
    ? { code: form.subjectCode || '', name: form.subjectName || '' }
    : classifySubject(form.itemName, form.supplier);
  const rec = {
    id: form.id || uid('inv_'),
    company: form.company || writeCompany(),
    invoiceNumber: no,
    invoiceDate: form.invoiceDate || '',
    invoiceType: form.invoiceType || INVOICE_TYPES[0],
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    amount: r2(form.amount),
    remark: form.remark || '',
    netAmount: r2(form.netAmount),
    taxAmount: r2(form.taxAmount),
    taxRate: form.taxRate || '',
    itemName: form.itemName || '',
    buyerName: form.buyerName || '',
    invoiceCode: form.invoiceCode || '',
    checkCode: form.checkCode || '',
    subjectCode: subj.code,
    subjectName: subj.name,
    source: form.source || '手工录入',
    sourceFile: form.sourceFile || '',
    reimStatus: form.reimStatus || '',
    reimId: form.reimId || '',
    reimComment: form.reimComment || '',
    syncedFromReim: !!form.syncedFromReim,
    createdAt: form.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const arr = data.pis_invoices;
  const idx = arr.findIndex(v => String(v.id) === String(rec.id));
  if (idx >= 0) arr[idx] = rec; else arr.unshift(rec);
  save('pis_invoices');
  return { ok: true, invoice: rec };
}
function deleteInvoice(id) { remove('invoices', id); return { ok: true }; }

/** 未开票 / 部分开票合同（发票录入时关联用） */
function openContracts() {
  return list('orders').filter(o => invoicedOfContract(o.contractNumber) < num(o.totalAmount) - 0.005);
}

/* ==================== 付款桥（报销侧 reim_invoices → 采购付款视图） ====================
 * 桌面端经 HTTP /api/payments/external 取报销系统付款数据；小程序改为直接读
 * 云端同步下来的 reim_invoices。字段口径与桌面端 ReimPay 完全一致：
 *   paid_amount（累计已付，封顶票面）/ payment_date / payment_method / payment_note /
 *   project（合同号，支持一单多票）/ seller_name / total_amount / invoice_no
 */

function reimInvoices() { try { return reim.listAll() || []; } catch (e) { return []; } }
/** 报销侧购方 → 本系统公司主体（优先 company_short，兜底购方全称模糊匹配） */
function companyOfReim(r) {
  if (!r) return '';
  const short = String(r.company_short || '').trim();
  if (short && companies().some(c => c.code === short)) return short;
  const buyer = normOrgName(r.buyer_name);
  if (buyer) {
    const hit = companies().find(c => {
      const cn = normOrgName(c.name);
      return cn && (cn === buyer || cn.indexOf(buyer) >= 0 || buyer.indexOf(cn) >= 0 || (c.code && buyer.indexOf(c.code) >= 0));
    });
    if (hit) return hit.code;
  }
  return '';
}
/** 报销侧发票号 → 本地发票（用于取供应商 / 合同号） */
function localInvoiceOf(no) {
  return invoices().find(v => String(v.invoiceNumber) === String(no)) || null;
}

const Pay = {
  /** 单张发票累计已付（不超过票面） */
  paidOfInvoice(no) {
    const r = reimInvoices().find(x => String(x.invoice_no) === String(no));
    return r ? Math.min(num(r.paid_amount), num(r.total_amount)) : 0;
  },
  dateOfInvoice(no) { const r = reimInvoices().find(x => String(x.invoice_no) === String(no)); return r ? (r.payment_date || '') : ''; },
  methodOfInvoice(no) { const r = reimInvoices().find(x => String(x.invoice_no) === String(no)); return r ? (r.payment_method || '') : ''; },
  noteOfInvoice(no) { const r = reimInvoices().find(x => String(x.invoice_no) === String(no)); return r ? (r.payment_note || '') : ''; },
  /** 报销侧审核状态（待审核 / 已通过 / 已入账 / 已驳回） */
  auditStatusOfInvoice(no) { const r = reimInvoices().find(x => String(x.invoice_no) === String(no)); return r ? (r.status || '') : ''; },
  /** 合同已付：报销侧 project 命中，或本地发票合同号命中 */
  paidOfContract(cno) {
    const noToContract = {};
    invoices().forEach(v => { noToContract[String(v.invoiceNumber)] = v.contractNumber || ''; });
    return reimInvoices().reduce((sum, r) => {
      const hit = splitMulti(r.project).indexOf(cno) >= 0 ||
        splitMulti(noToContract[String(r.invoice_no)] || '').indexOf(cno) >= 0;
      return sum + (hit ? Math.min(num(r.paid_amount), num(r.total_amount)) : 0);
    }, 0);
  },
  /**
   * 付款流水行（形状与桌面端 payRows 一致）：
   * { supplier, contractNumber, invoiceNumbers, paymentNumber, paymentDate, method, amount, remark, itemName }
   * 已自动套用当前公司主体 / 供应商隔离；传 cno 时再追加报销侧 project 命中的票。
   */
  payRows(cno) {
    const out = [], seen = {};
    const push = (r, v) => {
      const no = String(r.invoice_no);
      if (seen[no]) return;
      seen[no] = 1;
      const paid = Math.min(num(r.paid_amount), num(r.total_amount));
      if (paid <= 0) return;
      const co = v ? v.company : companyOfReim(r);
      // 公司隔离：本地发票以自身 company 为准；报销侧票以购方归属为准（无法归属时归第一家）
      if (!Session.isSupplier()) {
        const cur = curCompany();
        if (cur !== ALL_COMPANIES && co && co !== cur) return;
      }
      const supplier = (v && v.supplier) || (matchReimSupplier(r.seller_name) || {}).supplierName || r.seller_name || '';
      if (Session.isSupplier() && supplier !== Session.mySupplier()) return;
      out.push({
        supplier: supplier,
        contractNumber: (v && v.contractNumber) || r.project || '',
        invoiceNumbers: no,
        paymentNumber: no,
        paymentDate: r.payment_date || '',
        method: r.payment_method || '',
        amount: paid,
        remark: r.payment_note || '',
        itemName: r.item_name || (v && v.itemName) || '',
        company: co
      });
    };
    invoices().forEach(v => {
      const r = reimInvoices().find(x => String(x.invoice_no) === String(v.invoiceNumber));
      if (!r) return;
      if (!cno || splitMulti(v.contractNumber).indexOf(cno) >= 0 || splitMulti(r.project).indexOf(cno) >= 0) push(r, v);
    });
    if (cno) {
      reimInvoices().forEach(r => {
        if (!seen[String(r.invoice_no)] && splitMulti(r.project).indexOf(cno) >= 0) push(r, null);
      });
    }
    out.sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
    return out;
  },
  /** 审核状态回写本地发票台账（驳回原因等） */
  reconcile() {
    const arr = all('invoices');
    let dirty = false;
    const byNo = {};
    reimInvoices().forEach(r => { byNo[String(r.invoice_no)] = r; });
    arr.forEach(v => {
      const r = byNo[String(v.invoiceNumber)];
      if (!r) return;
      const st = r.status || '';
      if (st && st !== v.reimStatus) {
        v.reimStatus = st;
        v.reimComment = st === '已驳回' ? (r.last_comment || '') : '';
        if (r.id != null) v.reimId = r.id;
        dirty = true;
      }
    });
    if (dirty) save('pis_invoices');
    return dirty;
  },
  /**
   * 报销台账 → 采购发票台账自动同步：
   * 报销侧进项票中销售方与本系统供应商模糊匹配命中的，自动落入本地发票台账。
   * 已存在（任何来源）不重复建档，且只对 syncedFromReim 来源回写白名单字段。
   */
  syncInvoices() {
    const rows = reimInvoices().filter(r => r && r.direction !== '销项');
    if (!rows.length) return 0;
    const arr = data.pis_invoices;
    const byNo = {};
    arr.forEach(v => { byNo[String(v.invoiceNumber)] = v; });
    let added = 0, changed = false;
    rows.forEach(r => {
      const no = String(r.invoice_no == null ? '' : r.invoice_no);
      if (!no) return;
      const exist = byNo[no];
      if (exist) {
        if (!exist.syncedFromReim) return;
        const set = (k, v) => { if (String(exist[k] == null ? '' : exist[k]) !== String(v == null ? '' : v)) { exist[k] = v; changed = true; } };
        set('invoiceDate', r.invoice_date || '');
        set('invoiceType', /专用/.test(r.invoice_type || '') ? '增值税专用发票' : /普通/.test(r.invoice_type || '') ? '增值税普通发票' : (r.invoice_type || '其他发票'));
        set('amount', num(r.total_amount));
        set('netAmount', num(r.amount));
        set('taxAmount', num(r.tax_amount));
        set('taxRate', r.tax_rate || '');
        set('itemName', r.item_name || '');
        set('buyerName', r.buyer_name || '');
        set('reimStatus', r.status || '');
        return;
      }
      const sup = matchReimSupplier(r.seller_name);
      if (!sup) return; // 匹配不到供应商不入库，避免脏数据
      let contractNumber = '';
      splitMulti(r.project).some(cno => {
        if (orders().some(o => o.contractNumber === cno && o.supplier === sup.supplierName)) { contractNumber = cno; return true; }
        return false;
      });
      const rec = {
        id: uid('inv_'),
        company: companyOfReim(r) || writeCompany(),
        invoiceNumber: no,
        invoiceDate: r.invoice_date || '',
        invoiceType: /专用/.test(r.invoice_type || '') ? '增值税专用发票' : /普通/.test(r.invoice_type || '') ? '增值税普通发票' : (r.invoice_type || '其他发票'),
        contractNumber: contractNumber,
        supplier: sup.supplierName,
        amount: num(r.total_amount),
        remark: '',
        netAmount: num(r.amount),
        taxAmount: num(r.tax_amount),
        taxRate: r.tax_rate || '',
        itemName: r.item_name || '',
        buyerName: r.buyer_name || '',
        invoiceCode: r.invoice_code || '',
        checkCode: r.check_code || '',
        subjectCode: r.subject_code || '',
        subjectName: r.subject_name || '',
        source: '报销同步',
        sourceFile: '',
        reimStatus: r.status || '',
        reimId: r.id != null ? r.id : '',
        reimComment: '',
        syncedFromReim: true,
        createdAt: new Date().toISOString()
      };
      arr.unshift(rec);
      byNo[no] = rec;
      added++; changed = true;
    });
    if (changed) save('pis_invoices');
    return added;
  }
};

function paidOfContract(cno) { return Pay.paidOfContract(cno); }
function paidOfInvoice(no) { return Pay.paidOfInvoice(no); }

/* ==================== 发货 ==================== */

function saveShipment(form) {
  const rec = {
    id: form.id || uid('shp_'),
    company: form.company || writeCompany(),
    shipNumber: form.shipNumber || nextShipNo(),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    product: form.product || '',
    quantity: num(form.quantity),
    shipDate: form.shipDate || todayStr(),
    carrier: form.carrier || '',
    trackingNo: form.trackingNo || '',
    remark: form.remark || '',
    status: SHIP_PENDING, // 保存后一律回到待确认，由采购员复核
    receiveRemark: '',
    receivedAt: form.receivedAt || null,
    supplierReadAt: null,
    createdAt: form.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const arr = data.pis_shipments;
  const idx = arr.findIndex(x => String(x.id) === String(rec.id));
  if (idx >= 0) {
    // 编辑保留收货侧回写字段
    rec.status = arr[idx].status;
    rec.receivedAt = arr[idx].receivedAt;
    rec.receiveRemark = arr[idx].receiveRemark;
    rec.supplierReadAt = arr[idx].supplierReadAt;
    arr[idx] = rec;
  } else arr.unshift(rec);
  save('pis_shipments');
  return { ok: true, shipment: rec };
}
function deleteShipment(id) { remove('shipments', id); return { ok: true }; }
function markSupplierRead(id) {
  update('shipments', id, { supplierReadAt: new Date().toISOString() });
}
/** 待供应商查看的需方消息 */
function unreadShipMsgs() {
  const now = Date.now();
  return list('shipments').filter(r => !r.supplierReadAt).filter(r =>
    deriveShipStatus(r) !== SHIP_PENDING || r.receiveRemark ||
    (r.receivedAt && now - new Date(r.receivedAt).getTime() < 30 * 864e5));
}

/* ---- 确认到货（收货管理的核心动作，与桌面端 receive.html 一致） ----
   ① 生成收货记录（source='ship-confirm'，带 shipNumber）
   ② 回写发货单：status / receivedAt / receiveRemark，并清空 supplierReadAt
      （清空后供应商端会重新收到「需方消息」提示）
   ③ 若实收超过合同数量 → 返回 askAdjust 供页面询问「按实收调整合同数量」
*/
function confirmShipReceive(shipId, opt) {
  opt = opt || {};
  const r = all('shipments').find(x => String(x.id) === String(shipId));
  if (!r) return { ok: false, msg: '发货单不存在' };
  const qty = num(opt.quantity);
  if (!(qty > 0)) return { ok: false, msg: '请填写本次实收数量' };

  const rec = {
    id: uid('rcv_'),
    company: r.company,
    receiptNumber: nextReceiptNo(),
    contractNumber: r.contractNumber,
    supplier: r.supplier,
    product: r.product,
    quantity: qty,
    receiptDate: opt.receiptDate || todayStr(),
    person: opt.person || '',
    remark: opt.remark || '',
    shipNumber: r.shipNumber,
    status: RECV_CONFIRMED,
    source: 'ship-confirm',
    createdAt: new Date().toISOString()
  };
  add('receipts', rec);

  const done = confirmedQtyOfShip(r);
  const st = done + 0.0001 >= num(r.quantity) ? SHIP_CONFIRMED : SHIP_PARTIAL;
  update('shipments', r.id, {
    status: st,
    receivedAt: new Date().toISOString(),
    receiveRemark: opt.remark || '',
    supplierReadAt: ''
  });

  const o = orderByNo(r.contractNumber);
  let askAdjust = false, orderedQty = 0, receivedTotal = 0;
  if (o) {
    const p = orderProducts(o).find(x => x.name === r.product);
    orderedQty = p ? num(p.quantity) : 0;
    receivedTotal = receivedQty(r.contractNumber, r.product) - returnedQty(r.contractNumber, r.product);
    askAdjust = orderedQty > 0 && receivedTotal > orderedQty + 0.0001;
  }
  return {
    ok: true, receipt: rec, shipmentStatus: st,
    askAdjust: askAdjust, orderedQty: orderedQty, receivedTotal: r2(receivedTotal),
    orderId: o ? o.id : ''
  };
}

/** 按实收调整指定合同行数量（金额=单价×新数量，合同总额重算） */
function adjustOrderProduct(orderId, productName) {
  const o = orders().find(x => String(x.id) === String(orderId));
  if (!o) return { ok: false, msg: '合同不存在' };
  const p = orderProducts(o).find(x => x.name === productName);
  if (!p) return { ok: false, msg: '合同明细中未找到该产品' };
  const net = receivedQty(o.contractNumber, productName) - returnedQty(o.contractNumber, productName);
  p.quantity = r2(net);
  p.amount = r2(num(p.unitPrice) * p.quantity);
  o.totalAmount = r2(orderProducts(o).reduce((s, x) => s + num(x.amount), 0));
  o.updatedAt = new Date().toISOString();
  save('pis_orders');
  return { ok: true, order: o };
}

/* ==================== 收货 / 退货 ==================== */

function saveReceipt(form) {
  const rec = {
    id: form.id || uid('rcv_'),
    company: form.company || writeCompany(),
    receiptNumber: form.receiptNumber || nextReceiptNo(),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    product: form.product || '',
    quantity: num(form.quantity),
    receiptDate: form.receiptDate || todayStr(),
    person: form.person || '',
    remark: form.remark || '',
    shipNumber: form.shipNumber || '',
    status: form.status || RECV_CONFIRMED,
    source: form.source || '',
    createdAt: form.createdAt || new Date().toISOString()
  };
  const arr = data.pis_receipts;
  const idx = arr.findIndex(x => String(x.id) === String(rec.id));
  if (idx >= 0) arr[idx] = rec; else arr.unshift(rec);
  save('pis_receipts');
  return { ok: true, receipt: rec };
}
function deleteReceipt(id) {
  const rec = all('receipts').find(x => String(x.id) === String(id));
  remove('receipts', id);
  // 删除「确认到货」生成的收货记录后，发货单回到待确认列表（状态为派生值，自动生效）
  return { ok: true, receipt: rec };
}

function saveReturn(form) {
  const rec = {
    id: form.id || uid('ret_'),
    company: form.company || writeCompany(),
    returnNumber: form.returnNumber || nextReturnNo(),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    product: form.product || '',
    quantity: num(form.quantity),
    returnDate: form.returnDate || todayStr(),
    reason: form.reason || '',
    createdAt: form.createdAt || new Date().toISOString()
  };
  const arr = data.pis_returns;
  const idx = arr.findIndex(x => String(x.id) === String(rec.id));
  if (idx >= 0) arr[idx] = rec; else arr.unshift(rec);
  save('pis_returns');
  return { ok: true, return: rec };
}
function deleteReturn(id) { remove('returns', id); return { ok: true }; }

/** 待确认到货：发货数量 > 已确认收货合计 */
function pendingShips() {
  return list('shipments').filter(r => num(r.quantity) > 0 && confirmedQtyOfShip(r) < num(r.quantity) - 0.0001)
    .sort((a, b) => String(b.shipDate || '').localeCompare(String(a.shipDate || '')));
}

/** 数量差异：实收合计（含退货冲减）− 合同数量，|diff| < 0.0001 不列示 */
function quantityDiffs() {
  const out = [];
  list('orders').forEach(o => {
    orderProducts(o).forEach(p => {
      const recv = receivedQty(o.contractNumber, p.name);
      const ret = returnedQty(o.contractNumber, p.name);
      const net = recv - ret;
      const ordered = num(p.quantity);
      const diff = r2(net - ordered);
      if (Math.abs(diff) < 0.0001) return;
      out.push({
        id: o.id + '|' + p.name,
        contractNumber: o.contractNumber,
        supplier: o.supplier,
        product: p.name,
        ordered: ordered,
        received: r2(recv),
        returned: r2(ret),
        diff: diff,
        type: diff > 0 ? '实收超出' : '实收不足',
        company: o.company
      });
    });
  });
  return out;
}

/** 库存统计（按合同+产品） */
function inventoryRows() {
  const out = [];
  list('orders').forEach(o => {
    orderProducts(o).forEach(p => {
      const recv = receivedQty(o.contractNumber, p.name);
      const ret = returnedQty(o.contractNumber, p.name);
      const ordered = num(p.quantity);
      out.push({
        id: o.id + '|' + p.name,
        contractNumber: o.contractNumber,
        supplier: o.supplier,
        product: p.name,
        unit: p.unit || '',
        ordered: ordered,
        received: r2(recv),
        returned: r2(ret),
        balance: r2(recv - ret),
        progress: ordered > 0 ? Math.min(100, Math.round(Math.max(0, recv - ret) / ordered * 100)) : 0,
        company: o.company
      });
    });
  });
  return out;
}

/* ==================== 对账 ==================== */

/** 合同收货金额 = Σ max(0, 净收货数量) × 合同单价（退货冲减） */
function receivedAmountOfContract(o) {
  return r2(orderProducts(o).reduce((s, p) => {
    const net = Math.max(0, receivedQty(o.contractNumber, p.name) - returnedQty(o.contractNumber, p.name));
    // 注意：桌面端 recon.html 误用 p.price，此处统一为字段实名的 unitPrice
    return s + net * num(p.unitPrice);
  }, 0));
}

/** 单份合同对账三流：idle 未执行 / done 已执行完（三清）/ running 执行中 */
function contractRecon(o) {
  const shipped = orderShippedTotal(o);
  const recvAmt = receivedAmountOfContract(o);
  const inv = invoicedOfContract(o.contractNumber);
  const pay = paidOfContract(o.contractNumber);
  const ordered = orderOrderedQty(o);
  let state = 'running';
  if (shipped <= 0.005 && orderReceivedTotal(o) <= 0.005 && inv <= 0.005 && pay <= 0.005) state = 'idle';
  else if (orderReceivedTotal(o) >= ordered && ordered > 0 && inv >= recvAmt - 0.005 && pay >= inv - 0.005) state = 'done';
  return {
    id: o.id,
    company: o.company,
    contractNumber: o.contractNumber,
    supplier: o.supplier,
    totalAmount: r2(num(o.totalAmount)),
    state: state,
    stateText: state === 'idle' ? '未执行' : state === 'done' ? '已执行完' : '执行中',
    stateClass: state === 'done' ? 'badge-green' : state === 'running' ? 'badge-orange' : 'badge-gray',
    orderedQty: ordered,
    receivedQty: r2(orderReceivedTotal(o)),
    shippedQty: r2(shipped),
    recvAmount: recvAmt,
    invoiced: r2(inv),
    paid: r2(pay),
    waitInv: r2(Math.max(0, recvAmt - inv)),
    waitPay: r2(Math.max(0, inv - pay)),
    overPay: r2(Math.max(0, pay - inv)),
    diff: r2(recvAmt - inv)
  };
}
/** 排序：已执行完 → 执行中 → 未执行（未执行置底，与桌面端一致） */
function reconRows() {
  const rank = { done: 0, running: 1, idle: 2 };
  return list('orders').map(contractRecon).sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return String(b.contractNumber || '').localeCompare(String(a.contractNumber || ''));
  });
}

/** 对账单编号：按当日 + 供应商在名单中的序号，同一供应商当天多次打印取同一号 */
function reconDocNo(supplierName) {
  const d = new Date();
  const head = 'DZ-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-';
  const idx = supplierNames().sort().indexOf(supplierName);
  return head + String((idx >= 0 ? idx : 0) + 1).padStart(3, '0');
}

/** 供应商对账单流水（开票 / 付款 / 累计余额） */
function reconStatement(supplierName, dateFrom, dateTo) {
  const rows = [];
  list('invoices').filter(v => v.supplier === supplierName).forEach(v => {
    const d = v.invoiceDate || '';
    if (dateFrom && d && d < dateFrom) return;
    if (dateTo && d && d > dateTo) return;
    rows.push({
      date: d, type: '开票', docNo: v.invoiceNumber,
      contractNumber: v.contractNumber || '',
      invoice: num(v.amount), payment: 0
    });
  });
  const pays = Pay.payRows().filter(p => p.supplier === supplierName);
  pays.forEach(p => {
    const d = p.paymentDate || '';
    if (dateFrom && d && d < dateFrom) return;
    if (dateTo && d && d > dateTo) return;
    rows.push({
      date: d, type: '付款', docNo: p.paymentNumber,
      contractNumber: p.contractNumber || '',
      invoice: 0, payment: num(p.amount)
    });
  });
  rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) ||
    (a.type === b.type ? 0 : a.type === '开票' ? -1 : 1));
  let bal = 0;
  rows.forEach((r, i) => {
    bal = r2(bal + r.invoice - r.payment);
    r.seq = i + 1;
    r.balance = bal;
  });
  const totalInv = r2(rows.reduce((s, r) => s + r.invoice, 0));
  const totalPay = r2(rows.reduce((s, r) => s + r.payment, 0));
  return { rows: rows, totalInvoice: totalInv, totalPayment: totalPay, balance: r2(totalInv - totalPay) };
}

/* ==================== 统计（工作台 / 数据统计） ==================== */

function dashboardStats() {
  const os = list('orders');
  const invs = list('invoices');
  const pays = Pay.payRows();
  const totalAmount = r2(os.reduce((s, o) => s + num(o.totalAmount), 0));
  const invoiced = r2(invs.reduce((s, v) => s + num(v.amount), 0));
  const paid = r2(pays.reduce((s, p) => s + num(p.amount), 0));
  const isSup = Session.isSupplier();
  return {
    orderCount: os.length,
    totalAmount: totalAmount,
    invoiceCount: invs.length,
    invoiced: invoiced,
    payCount: pays.length,
    paid: paid,
    unInvoiced: r2(Math.max(0, totalAmount - invoiced)),
    balance: r2(invoiced - paid),
    card4Label: isSup ? '待对账余额' : '未开票金额',
    card4Value: isSup ? r2(invoiced - paid) : r2(Math.max(0, totalAmount - invoiced))
  };
}

/** 数据统计：合同/开票/付款汇总 + 供应商维度 + 月度趋势 */
function reportStats() {
  const os = list('orders'), invs = list('invoices'), pays = Pay.payRows();
  const totalAmount = r2(os.reduce((s, o) => s + num(o.totalAmount), 0));
  const invoiced = r2(invs.reduce((s, v) => s + num(v.amount), 0));
  const paid = r2(pays.reduce((s, p) => s + num(p.amount), 0));
  const recvTotal = r2(list('receipts').reduce((s, r) => s + num(r.quantity), 0));
  const retTotal = r2(list('returns').reduce((s, r) => s + num(r.quantity), 0));

  const supMap = {};
  const bucket = k => { if (!supMap[k]) supMap[k] = { name: k, cnt: 0, amount: 0, inv: 0, pay: 0 }; return supMap[k]; };
  os.forEach(o => { const m = bucket(o.supplier || '—'); m.cnt++; m.amount += num(o.totalAmount); });
  invs.forEach(v => { bucket(v.supplier || '—').inv += num(v.amount); });
  pays.forEach(p => { bucket(p.supplier || '—').pay += num(p.amount); });
  const bySupplier = Object.keys(supMap).map(k => {
    const m = supMap[k];
    return { name: m.name, cnt: m.cnt, amount: r2(m.amount), inv: r2(m.inv), pay: r2(m.pay), wait: r2(Math.max(0, m.inv - m.pay)) };
  }).sort((a, b) => b.amount - a.amount);
  const maxAmt = Math.max(1, ...bySupplier.map(x => x.amount));
  bySupplier.forEach(x => { x.pct = Math.round(x.amount / maxAmt * 100); });

  const monthMap = {};
  const mb = k => { if (!monthMap[k]) monthMap[k] = { m: k, amt: 0, inv: 0, pay: 0 }; return monthMap[k]; };
  os.forEach(o => { const k = String(o.orderDate || '').slice(0, 7); if (k) mb(k).amt += num(o.totalAmount); });
  invs.forEach(v => { const k = String(v.invoiceDate || '').slice(0, 7); if (k) mb(k).inv += num(v.amount); });
  pays.forEach(p => { const k = String(p.paymentDate || '').slice(0, 7); if (k) mb(k).pay += num(p.amount); });
  const months = Object.keys(monthMap).sort().reverse().slice(0, 12)
    .map(k => ({ month: k, amt: r2(monthMap[k].amt), inv: r2(monthMap[k].inv), pay: r2(monthMap[k].pay) }));

  return {
    orderCount: os.length, totalAmount: totalAmount,
    invoiced: invoiced, invoiceRate: totalAmount ? Math.round(invoiced / totalAmount * 100) : 0,
    paid: paid, waitPay: r2(Math.max(0, invoiced - paid)),
    recvTotal: recvTotal, retTotal: retTotal,
    bySupplier: bySupplier, months: months
  };
}

/** 最近动态（工作台） */
function recentActivities() {
  const out = [];
  const push = (coll, tag, dateField, noField, extra) => {
    list(coll).slice(0, 3).forEach(r => out.push({
      tag: tag,
      no: r[noField] || '',
      txt: tag + ' · ' + (r.supplier || '') + (extra ? ' · ' + (r[extra] || '') : ''),
      date: r[dateField] || r.createdAt || ''
    }));
  };
  push('orders', '采购', 'orderDate', 'contractNumber');
  push('shipments', '发货', 'shipDate', 'shipNumber', 'product');
  push('receipts', '收货', 'receiptDate', 'receiptNumber', 'product');
  push('returns', '退货', 'returnDate', 'returnNumber', 'product');
  push('invoices', '开票', 'invoiceDate', 'invoiceNumber', 'itemName');
  Pay.payRows().slice(0, 5).forEach(p => out.push({
    tag: '付款', no: p.paymentNumber, txt: '付款 · ' + (p.supplier || '') + (p.method ? ' · ' + p.method : ''),
    date: p.paymentDate || ''
  }));
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return out.slice(0, 10);
}

/* ==================== 工具箱（包装材料计算） ==================== */

function toolRecords() { return all('tool_records'); }
function saveToolRecord(rec) {
  const arr = data.pis_tool_records;
  arr.unshift(Object.assign({ id: uid('tl_'), at: new Date().toISOString() }, rec));
  while (arr.length > 200) arr.pop(); // 与桌面端一致：最多保留 200 条
  save('pis_tool_records');
  return { ok: true };
}
function deleteToolRecord(id) { remove('tool_records', id); return { ok: true }; }
function clearToolRecords() { data.pis_tool_records = []; save('pis_tool_records'); return { ok: true }; }

/** 跨页载荷：包装计算器「复制尺寸」→ 采购合同「规格型号」粘贴联动 */
function setPlyPaste(payload) { data.pis_plyPaste = payload; save('pis_plyPaste'); }
function getPlyPaste() { return data.pis_plyPaste; }

/* ==================== 金额转人民币大写（与桌面端 moneyCn 一致） ==================== */

function moneyCn(n) {
  n = Math.round(num(n) * 100) / 100;
  if (n === 0) return '零元整';
  const digits = '零壹贰叁肆伍陆柒捌玖', units = ['', '拾', '佰', '仟'], bigs = ['', '万', '亿', '兆'];
  const parts = n.toFixed(2).split('.');
  const intPart = parts[0], decPart = parts[1];
  let out = '';
  if (+intPart > 0) {
    const intDigits = intPart.split('').map(Number);
    const groups = [];
    for (let i = intDigits.length; i > 0; i -= 4) groups.unshift(intDigits.slice(Math.max(0, i - 4), i));
    groups.forEach((g, gi) => {
      let gs = '';
      const gz = g.reduce((s, v) => s + v, 0) === 0;
      if (gz) { if (out && out.slice(-1) !== '零' && gi < groups.length - 1) out += '零'; return; }
      g.forEach((v, i) => {
        const pos = g.length - 1 - i;
        if (v === 0) { if (gs.slice(-1) !== '零' && i < g.length - 1) gs += '零'; }
        else gs += digits[v] + units[pos];
      });
      gs = gs.replace(/零+$/, '');
      out += gs + bigs[groups.length - 1 - gi];
    });
    out = out.replace(/零+/g, '零').replace(/零+$/, '') + '元';
  }
  const jiao = +decPart[0], fen = +decPart[1];
  if (jiao === 0 && fen === 0) return out + '整';
  if (+intPart === 0) {
    let r = '';
    if (jiao > 0) r += digits[jiao] + '角';
    if (fen > 0) r += digits[fen] + '分';
    return r;
  }
  if (jiao > 0) out += digits[jiao] + '角';
  else if (fen > 0) out += '零';
  if (fen > 0) out += digits[fen] + '分'; else out += '整';
  return out;
}

/* ==================== 买方抬头（生成采购合同用，与桌面端硬编码一致） ==================== */

const BUYER_INFO = [
  { match: '无锡龙力', companyName: '无锡龙力印铁设备制造有限公司', address: '无锡市新吴区龙山路4号c幢603', contact: '吴小英', phone: '139 5159 9291', chop: 'llchop.png' },
  { match: '普利美', companyName: '普利美（常州）环境工程科技有限公司', address: '常州市武进区雪堰镇周南路8号6-1（中南高科常州雪堰智造产业园）', contact: 'AlonZhang', phone: '136 6511 9291', chop: 'plmchop.png' }
];
function buyerInfoOf(companyCode) {
  const full = companyName(companyCode) || companyCode || '';
  const hit = BUYER_INFO.find(b => full.indexOf(b.match) >= 0 || String(companyCode || '').indexOf(b.match) >= 0);
  return hit || BUYER_INFO[1];
}

/* ==================== 备份 / 恢复（与桌面端 DB.snapshot 格式互通） ==================== */

/**
 * 导出：{ app:'purchase-integrated', version:2, exportedAt, data:{ 裸键: JSON字符串 } }
 * 与桌面端「备份到电脑」的文件格式完全一致 —— 两端备份文件可互相恢复。
 */
function exportBackup() {
  const out = {};
  KEYS.forEach(k => {
    if (k === 'pis_plyPaste') return; // 临时载荷不进备份
    try { out[k] = JSON.stringify(data[k]); } catch (e) { /* 忽略 */ }
  });
  return { app: 'purchase-integrated', version: 2, exportedAt: new Date().toISOString(), data: out };
}

/**
 * 恢复：兼容三种形态
 *   1) 桌面端 / 本端新版整包（data 为 {裸键: JSON字符串}）
 *   2) 本端导出但值已是数组/对象（直接可用）
 *   3) 旧版 { orders:[...], invoices:[...] } 平铺
 * 返回 { ok, applied, msg }
 */
function importBackup(snap) {
  if (!snap || typeof snap !== 'object') return { ok: false, msg: '备份文件格式不正确' };
  let src = null;
  if (snap.data && typeof snap.data === 'object' && !Array.isArray(snap.data)) src = snap.data;
  else src = snap;
  let applied = 0;
  KEYS.forEach(k => {
    if (k === 'pis_plyPaste') return;
    let v = src[k];
    if (v === undefined) return;
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e) { return; }
    }
    if (ARRAY_KEYS.indexOf(k) >= 0 && !Array.isArray(v)) return;
    data[k] = v;
    save(k);
    applied++;
  });
  // 兼容旧版平铺键名
  if (!applied) {
    const mapOld = { orders: 'pis_orders', shipments: 'pis_shipments', receipts: 'pis_receipts', returns: 'pis_returns', invoices: 'pis_invoices', payments: 'pis_payments', suppliers: 'pis_suppliers', companies: 'pis_companies', units: 'pis_units', terms: 'pis_terms', roles: 'pis_roles', users: 'pis_users', tool_records: 'pis_tool_records' };
    Object.keys(mapOld).forEach(old => {
      if (Array.isArray(src[old])) { data[mapOld[old]] = src[old]; save(mapOld[old]); applied++; }
    });
  }
  if (!applied) return { ok: false, msg: '备份文件里没有可识别的采购数据' };
  seed();
  return { ok: true, applied: applied };
}

/** 清空本地业务数据（保留用户 / 角色 / 公司） */
function clearBiz() {
  ['orders', 'shipments', 'receipts', 'returns', 'invoices', 'payments', 'suppliers', 'tool_records'].forEach(c => {
    data['pis_' + c] = [];
    save('pis_' + c);
  });
  return { ok: true };
}

/* ==================== 初始化 ==================== */

loadAll();
loadSession();

module.exports = {
  // 元数据
  KEYS, ARRAY_KEYS, COLLECTIONS, GLOBAL_COLS, ALL_COMPANIES, PAGES, PAGE_BY_KEY,
  DEFAULT_COMPANIES, DEFAULT_UNITS, DEFAULT_CATEGORIES, DEFAULT_TERMS, DEFAULT_ROLES,
  INVOICE_TYPES, SUBJECT_RULES, BUYER_INFO,
  // 基础
  uid, num, r2, pad2, todayStr, splitMulti, moneyCn,
  data, loadAll, save, saveLocal, syncFromCloud, isCloudSynced, seed,
  // 公司
  companies, companyName, curCompany, setCurCompany, writeCompany, saveCompany, deleteCompany,
  // 会话 / 权限
  Session, loadSession, saveSession, login, logout, hashPwd, verifyPwd,
  users, roles, userLabel, saveUser, deleteUser, setUserActive, resetUserPwd,
  saveRole, setRolePerm, deleteRole,
  // 数据访问
  all, list, add, update, remove, clearColl,
  // 单号
  nextNo, peekNo, nextOrderNo, nextShipNo, nextReceiptNo, nextReturnNo, nextSupplierNo, nextReconNo,
  // 供应商
  suppliers, supplierNames, findSupplierByName, saveSupplier, deleteSupplier, ensureSupplier,
  matchSupplier, matchReimSupplier, normOrgName, normSupplierKey, renameSupplierEverywhere,
  // 采购合同
  orders, orderByNo, orderProducts, productAmount, orderOrderedQty, saveOrder, deleteOrder, copyOrder,
  adjustOrderToReceived, orderStatus,
  // 收发退
  receivedQty, returnedQty, shippedQty, orderReceivedTotal, orderReturnTotal, orderShippedTotal,
  SHIP_PENDING, SHIP_PARTIAL, SHIP_CONFIRMED, RECV_PENDING, RECV_CONFIRMED,
  confirmedQtyOfShip, deriveShipStatus, shipStatusBadge,
  saveShipment, deleteShipment, markSupplierRead, unreadShipMsgs, pendingShips,
  confirmShipReceive, adjustOrderProduct,
  saveReceipt, deleteReceipt, saveReturn, deleteReturn, quantityDiffs, inventoryRows,
  // 发票
  invoices, invoicedOfContract, invoiceStatus, classifySubject, allSubjects, saveInvoice, deleteInvoice, openContracts,
  // 付款桥
  Pay, paidOfContract, paidOfInvoice, reimInvoices, companyOfReim, localInvoiceOf,
  // 对账
  receivedAmountOfContract, contractRecon, reconRows, reconStatement, reconDocNo,
  // 统计
  dashboardStats, reportStats, recentActivities,
  // 工具箱
  toolRecords, saveToolRecord, deleteToolRecord, clearToolRecords, setPlyPaste, getPlyPaste,
  // 买方
  buyerInfoOf,
  // 备份
  exportBackup, importBackup, clearBiz
};
