// 发票报销数据层（移植自电脑端 apps/reimbursement-system）
// 与电脑端网页版（static/index.html + store.js）共用同一 CloudBase 后端，
// 云端键名为裸键（reim_invoices / reim_companies / reim_review_log，
// 电脑端 store.js 直接以裸键读写 app_data_store，无前缀）。
//
// 发票状态流：草稿 → 待审核 → 已通过 → 已入账
//                     └→ 已驳回 →(修改后重新提交)→ 待审核
// 公司抬头：发票购买方/销售方与公司名匹配 → 自动判定 进项 / 销项。
const supa = require('./cloudbase');

const KEYS = ['reim_invoices', 'reim_companies', 'reim_review_log', 'reim_users'];

// 状态与流程
const STATUSES = ['草稿', '待审核', '已通过', '已驳回', '已入账'];
const SETTLES = ['正常付款', '仅做账'];
const PAYEES = ['销售方', '报销人'];
const STATUS_COLORS = {
  '草稿': 'badge-gray',
  '待审核': 'badge-orange',
  '已通过': 'badge-blue',
  '已驳回': 'badge-red',
  '已入账': 'badge-green'
};

/* ==================== 角色与权限（与电脑端 index.html CAN 一致） ==================== */

const ROLE_NAMES = { admin: '管理员', approver: '审核人', claimant: '报销人' };

/**
 * 角色能力矩阵（移植电脑端 CAN 对象）：
 *   edit     编辑发票    claimant / admin
 *   del      删除发票    claimant / admin
 *   review   审核(通过/驳回)  approver / admin
 *   post     入账        admin
 *   submitWf 提交/撤回工作流  claimant / admin
 *   import   导入/录入发票   claimant / admin
 *   viewAll  能否看全部人的发票（否则只看自己）
 */
function can(user, action) {
  const role = (user && user.role) || '';
  const isAdmin = role === 'admin';
  const isApprover = role === 'approver';
  const isClaimant = role === 'claimant';
  switch (action) {
    case 'edit':
    case 'del':
    case 'import':
      return isClaimant || isAdmin;
    case 'submitWf':
      return isClaimant || isAdmin;
    case 'review':
      return isApprover || isAdmin;
    case 'post':
      return isAdmin;
    case 'viewAll':
      return isApprover || isAdmin;
    default:
      return false;
  }
}

/** 是否可对「某一条发票」执行操作：报销人只能动自己的 */
function canOnInvoice(user, action, invoice) {
  if (!can(user, action)) return false;
  if (!user || user.role !== 'claimant') return true;
  // 报销人仅限本人经手的发票（电脑端按 user_id 判定，小程序端按报销人姓名判定）
  if (!invoice) return false;
  return normName(invoice.claimant) === normName(user.display_name || user.name);
}

function roleName(role) { return ROLE_NAMES[role] || role || '未知'; }

/* 会计科目归类规则（与电脑端 index.html SUBJECT_RULES / classifier.py 一致） */
const SUBJECT_RULES = [
  ['660101', '差旅费-交通费', ['客运', '旅客运输', '铁路', '动车', '高铁', '航空', '民航', '出租车', '网约车', '滴滴', '运输服务', '过路费', '过桥费', '通行费', '停车费', '火车', '机票', '船票', '客运服务']],
  ['660102', '差旅费-住宿费', ['住宿', '宾馆', '酒店', '旅馆', '民宿']],
  ['660103', '差旅费-餐费', ['餐费', '伙食', '团餐']],
  ['660201', '业务招待费', ['餐饮服务', '宴请', '烟酒', '茶楼']],
  ['660202', '办公费', ['办公用品', '办公', '文具', '纸张', '印刷', '耗材', '硒鼓', '墨盒', '文件', '图书', '报纸', '杂志', '家具']],
  ['660203', '通讯费', ['电信', '移动', '联通', '话费', '通信', '通讯', '宽带', '网络费']],
  ['660204', '水电费', ['水费', '电费', '燃气', '供暖', '物业']],
  ['660205', '租赁费', ['租赁', '房租', '租金', '租车']],
  ['660206', '咨询/服务费', ['咨询服务', '技术咨询', '会计服务', '审计', '法律服务', '律师', '设计服务', '技术服务', '信息服务', '软件开发']],
  ['660207', '广告宣传费', ['广告', '宣传', '推广', '设计制作', '会展', '展览']],
  ['660208', '培训费', ['培训', '教育服务', '会务', '会议费', '会议服务']],
  ['660209', '运输装卸费', ['货物运输', '装卸', '搬运', '物流', '快递', '邮费', '运费']],
  ['660210', '维修费', ['维修', '修理', '保养', '维护']],
  ['1403', '原材料', ['钢材', '水泥', '原料', '材料', '五金', '配件', '零部件', '螺栓', '圆钢', '钢管', '钢板', '钢坯', '黑色金属', '有色金属', '不锈钢', '铝材', '铜材', '金属']],
  ['1601', '固定资产', ['设备', '机器', '计算机设备', '电脑', '服务器', '空调', '机床']],
  ['660299', '其他费用', []]
];

const data = {};
KEYS.forEach(k => { data[k] = []; });
data._loaded = false;
/** 是否已完成过一次云端同步（供页面判断"云端还没拉到"的中间态） */
let cloudSynced = false;

function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function nowStr() {
  const d = new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function today() {
  return nowStr().slice(0, 10);
}

/* ==================== 本地加载 / 云端同步 ==================== */

/**
 * 与其它数据层一致的 signed 写入（本地 + 入队推送）。
 * @param {boolean} [pushCloud=true] false 表示只落本地存储、不入云端推送队列
 *        （用于「默认公司抬头」这类本地种子数据：它们是兜底值，
 *         不应把本地兜底值推上云端，否则会把电脑端已有的公司抬头覆盖掉）
 */
function save(key, pushCloud) {
  try { supa.safeSet(key, data[key]); } catch (e) { /* 静默 */ }
  if (pushCloud === false) return;
  supa.push(key, data[key]).catch(() => {});
}

function loadAll() {
  KEYS.forEach(k => {
    try {
      const v = supa.safeGet(k);
      if (v !== '' && v !== undefined && v !== null) data[k] = v;
    } catch (e) { /* 忽略 */ }
  });
  KEYS.forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
  data._loaded = true;
  seedCompanies();
  // 注意：此处刻意不发任何网络请求（冷启动必须静默，见 test-reim-startup.js）。
  // reim_users 的兜底拉取由登录页按需调用 ensureCloudAccountList()。
}

/** 是否已经因「本地无账号」而触发过一次兜底拉取（避免反复请求） */
let _accountProbe = null;

/**
 * 本地无账号时的兜底拉取：只针对 reim_users 单键，不覆盖任何其它数据。
 * 电脑端管理员在电脑端新增账号后，小程序冷启动即可拿到最新名单。
 */
function ensureCloudAccountList() {
  if (_accountProbe) return _accountProbe;
  if (!supa.isConfigured()) return Promise.resolve(false);
  _accountProbe = supa.pull('reim_users').then(function (row) {
    if (row && Array.isArray(row.value) && row.value.length) {
      data.reim_users = row.value;
      try { supa.safeSet('reim_users', row.value); } catch (e) { /* 忽略 */ }
      cloudSynced = true;
      return true;
    }
    return false;
  }).catch(function () { return false; });
  return _accountProbe;
}

/** 本地兜底：两家默认公司抬头（仅在本机无任何公司数据时写入本地存储） */
const DEFAULT_COMPANIES = [
  { id: 1, name: '无锡龙力印铁设备制造有限公司', short_name: '龙力', tax_no: '', bank: '', account: '', address: '', phone: '', active: true },
  { id: 2, name: '普利美（常州）环境工程科技有限公司', short_name: '普利美', tax_no: '', bank: '', account: '', address: '', phone: '', active: true }
];

/**
 * 云端无公司抬头时的本地兜底种子。
 * 关键：只落本地、不推云端 —— 云端同步成功后会被 takeCloud 判定为
 * 接受云端数据，不会污染电脑端。同时未标记"已种子"，云端拉到真实
 * 公司抬头后会自动覆盖本地兜底值。
 */
function seedCompanies() {
  if (data.reim_companies.length) return;
  data.reim_companies = DEFAULT_COMPANIES.map(c => Object.assign({}, c));
  save('reim_companies', false);
}

/**
 * 从云端拉取全部数据并覆盖本地（云端优先），完成后回调 (ok, applied)。
 * 注意：reim 命名空间使用裸键（与电脑端 store.js 一致，无前缀）。
 */
function syncFromCloud(cb) {
  if (typeof cb !== 'function') cb = function () {};
  if (!supa.isConfigured()) { cb(false, 0); return; }
  supa.setSuppressPush(true);
  supa.pullAll('reimbursement').then(rows => {
    let applied = 0;
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (!r.key || KEYS.indexOf(r.key) < 0) return;
        if (r.value === null || r.value === undefined || r.value === '') return;
        // 本机存在未确认的新写入时保留本地，防止旧云端数据回灌
        if (!supa.takeCloud(r.key, r.updatedAt, data[r.key])) return;
        if (!Array.isArray(r.value)) return;
        data[r.key] = r.value;
        supa.safeSet(r.key, r.value);
        applied++;
      });
      KEYS.forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
    }
    supa.setSuppressPush(false);
    seedCompanies();
    cloudSynced = true;
    cb(true, applied);
  }).catch(err => {
    supa.setSuppressPush(false);
    cloudSynced = true; // 失败也算"尝试过"，避免页面一直停在加载态
    console.warn('[reim-db] pull failed', err);
    cb(false, 0);
  });
}

/** 是否已尝试过云端同步（页面首次进入时判断是否还在等云端数据） */
function isCloudSynced() { return cloudSynced; }

/* ==================== 用户（身份选择用，账号由电脑端管理员维护） ==================== */

/** 全部用户原始列表 */
function listAllUsers() { return data.reim_users || []; }

/**
 * 可选择身份的用户列表：启用中 + 有姓名。
 * 电脑端 active 用 1/true 两种写法，且历史数据可能用 email 代 username。
 */
function listUsers() {
  return (data.reim_users || []).filter(u => {
    if (!u) return false;
    if (u.active === 0 || u.active === false) return false;
    return true;
  }).map(u => ({
    id: u.id,
    username: u.username || u.email || '',
    display_name: u.display_name || u.username || u.email || '未命名用户',
    role: u.role || 'claimant',
    roleName: roleName(u.role),
    department: u.department || ''
  })).sort((a, b) => {
    // 管理员 → 审核人 → 报销人，同角色按姓名
    const order = { admin: 0, approver: 1, claimant: 2 };
    const oa = order[a.role] === undefined ? 9 : order[a.role];
    const ob = order[b.role] === undefined ? 9 : order[b.role];
    if (oa !== ob) return oa - ob;
    return String(a.display_name).localeCompare(String(b.display_name), 'zh');
  });
}

/** 按 id / 姓名 / 用户名 查找用户 */
function findUser(key) {
  const k = String(key == null ? '' : key);
  if (!k) return null;
  return (data.reim_users || []).find(u =>
    String(u && u.id) === k ||
    (u && u.username) === k ||
    (u && u.email) === k ||
    (u && u.display_name) === k
  ) || null;
}

/* ==================== 公司抬头匹配 ==================== */

function normName(s) { return String(s || '').replace(/\s+/g, ''); }

function listCompanies() { return data.reim_companies.filter(c => c && c.active !== false); }

function matchCompany(buyer, seller) {
  const b = normName(buyer), s = normName(seller);
  if (!b && !s) return { company_id: null, direction: null, company_short: null };
  const list = listCompanies();
  for (let i = 0; i < list.length; i++) {
    const n = normName(list[i].name);
    if (n && b && (n.indexOf(b) >= 0 || b.indexOf(n) >= 0)) {
      return { company_id: list[i].id, direction: '进项', company_short: list[i].short_name || list[i].name };
    }
  }
  for (let j = 0; j < list.length; j++) {
    const n2 = normName(list[j].name);
    if (n2 && s && (n2.indexOf(s) >= 0 || s.indexOf(n2) >= 0)) {
      return { company_id: list[j].id, direction: '销项', company_short: list[j].short_name || list[j].name };
    }
  }
  return { company_id: null, direction: null, company_short: null };
}

/* ==================== 科目归类 ==================== */

function classifySubject(itemName, sellerName) {
  const text = (itemName || '') + ' ' + (sellerName || '');
  for (let i = 0; i < SUBJECT_RULES.length; i++) {
    const rule = SUBJECT_RULES[i];
    for (let j = 0; j < rule[2].length; j++) {
      const kw = rule[2][j];
      if (kw && text.indexOf(kw) >= 0) return { code: rule[0], name: rule[1] };
    }
  }
  return { code: '660299', name: '其他费用' };
}

function allSubjects() {
  return SUBJECT_RULES.map(r => ({ code: r[0], name: r[1] }));
}

/* ==================== 发票 CRUD ==================== */

function listAll() { return data.reim_invoices; }

function findById(id) {
  // id 兼容数字与字符串（电脑端用 Date.now() 数字，小程序用字符串）
  return data.reim_invoices.find(r => String(r.id) === String(id)) || null;
}

/** 发票号查重（excludeId 用于编辑自身时排除） */
function existsInvoiceNo(invoiceNo, excludeId) {
  if (!invoiceNo) return false;
  return data.reim_invoices.some(r => r.invoice_no === invoiceNo && String(r.id) !== String(excludeId || ''));
}

/**
 * 新增/更新发票。form 字段与电脑端一致；自动匹配公司方向与科目归类。
 * 返回 {ok, msg, invoice}
 */
function saveInvoice(form) {
  const isEdit = !!form.id;
  if (!form.invoice_no || !String(form.invoice_no).trim()) {
    return { ok: false, msg: '发票号码不能为空' };
  }
  if (existsInvoiceNo(form.invoice_no, form.id)) {
    return { ok: false, msg: '发票号 ' + form.invoice_no + ' 已存在', duplicate: true };
  }
  const m = matchCompany(form.buyer_name, form.seller_name);
  const subj = (form.subject_code && form.subject_name)
    ? { code: form.subject_code, name: form.subject_name }
    : classifySubject(form.item_name, form.seller_name);
  const now = nowStr();
  const old = isEdit ? findById(form.id) : null;
  const inv = {
    id: old ? old.id : Date.now(),
    invoice_no: String(form.invoice_no).trim(),
    invoice_code: form.invoice_code || null,
    invoice_type: form.invoice_type || null,
    invoice_date: form.invoice_date || null,
    buyer_name: form.buyer_name || null,
    seller_name: form.seller_name || null,
    item_name: form.item_name || null,
    amount: num(form.amount),
    tax_rate: form.tax_rate || null,
    tax_amount: num(form.tax_amount),
    total_amount: num(form.total_amount),
    subject_code: subj.code,
    subject_name: subj.name,
    claimant: form.claimant || (old && old.claimant) || '',
    department: form.department || (old && old.department) || '',
    project: form.project || null,
    remark: form.remark || null,
    check_code: form.check_code || null,
    status: form.status || (old && old.status) || '草稿',
    company_id: m.company_id,
    direction: m.direction,
    company_short: m.company_short,
    settle: form.settle || (old && old.settle) || '正常付款',
    payee: form.payee || (old && old.payee) || '销售方',
    paid_amount: num(form.paid_amount !== undefined ? form.paid_amount : (old ? old.paid_amount : 0)) || 0,
    // 付款流水字段由电脑端报销系统写入（付款登记）；小程序无付款入口，
    // 编辑发票时必须原样保留，否则会把电脑端登记过的付款日期/方式/备注清空。
    payment_date: old ? (old.payment_date || null) : null,
    payment_method: old ? (old.payment_method || null) : null,
    payment_note: old ? (old.payment_note || null) : null,
    cloud_path: form.cloud_path || (old && old.cloud_path) || null,
    file_path: (old && old.file_path) || null,
    created_at: old ? old.created_at : now,
    updated_at: now,
    source: form.source || (old && old.source) || '手工录入'
  };
  if (old) {
    const idx = data.reim_invoices.indexOf(old);
    data.reim_invoices[idx] = inv;
  } else {
    data.reim_invoices.push(inv);
  }
  save('reim_invoices');
  return { ok: true, invoice: inv };
}

function deleteInvoice(id) {
  const inv = findById(id);
  if (!inv) return null;
  data.reim_invoices = data.reim_invoices.filter(r => String(r.id) !== String(id));
  save('reim_invoices');
  return inv;
}

/**
 * 状态流转（工作流），与电脑端 wf()/doReview() 一致：
 *   submit   草稿/已驳回 → 待审核
 *   withdraw 待审核 → 草稿
 *   approve  待审核 → 已通过（comment 可空）
 *   reject   待审核 → 已驳回（comment 必填）
 *   post     已通过 → 已入账
 */
function workflow(id, action, operator, comment) {
  const r = findById(id);
  if (!r) return { ok: false, msg: '记录不存在' };
  const NAMES = { submit: '提交审核', withdraw: '撤回', approve: '通过', reject: '驳回', post: '入账' };
  if (action === 'submit' && (r.status === '草稿' || r.status === '已驳回')) r.status = '待审核';
  else if (action === 'withdraw' && r.status === '待审核') r.status = '草稿';
  else if (action === 'approve' && r.status === '待审核') r.status = '已通过';
  else if (action === 'reject' && r.status === '待审核') {
    if (!comment) return { ok: false, msg: '驳回时必须填写审核意见' };
    r.status = '已驳回';
  } else if (action === 'post' && r.status === '已通过') r.status = '已入账';
  else return { ok: false, msg: '当前状态不允许此操作' };

  r.updated_at = nowStr();
  data.reim_review_log.push({
    id: uid('rv'),
    invoice_id: r.id,
    invoice_no: r.invoice_no,
    reviewer_id: null,
    reviewer_name: operator || '小程序用户',
    action: NAMES[action] || action,
    comment: comment || null,
    created_at: nowStr()
  });
  save('reim_invoices');
  save('reim_review_log');
  return { ok: true, invoice: r };
}

function listReviewLogs(invoiceId) {
  const logs = data.reim_review_log.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (invoiceId === undefined) return logs;
  return logs.filter(l => String(l.invoice_id) === String(invoiceId));
}

/* ==================== 查询与统计 ==================== */

/**
 * 多条件查询：{kw, status, direction, subjectCode, companyShort, dateFrom, dateTo, claimant}
 * 返回按开票日期倒序。
 */
function queryInvoices(f) {
  f = f || {};
  let list = data.reim_invoices.slice();
  if (f.status && f.status !== 'all') list = list.filter(r => r.status === f.status);
  if (f.direction) list = list.filter(r => r.direction === f.direction);
  if (f.subjectCode) list = list.filter(r => r.subject_code === f.subjectCode);
  if (f.companyShort) list = list.filter(r => r.company_short === f.companyShort);
  if (f.dateFrom) list = list.filter(r => (r.invoice_date || '') >= f.dateFrom);
  if (f.dateTo) list = list.filter(r => (r.invoice_date || '') <= f.dateTo);
  if (f.claimant) list = list.filter(r => (r.claimant || '') === f.claimant);
  if (f.kw) {
    const kw = String(f.kw).trim().toLowerCase();
    if (kw) {
      list = list.filter(r => {
        const text = [r.invoice_no, r.invoice_code, r.seller_name, r.buyer_name,
          r.item_name, r.claimant, r.subject_name, r.remark, r.invoice_date]
          .join(' ').toLowerCase();
        return text.indexOf(kw) >= 0;
      });
    }
  }
  list.sort((a, b) => {
    const d = (b.invoice_date || '').localeCompare(a.invoice_date || '');
    if (d !== 0) return d;
    return String(b.id).localeCompare(String(a.id));
  });
  return list;
}

/** 付款状态（与电脑端 paymentInfo 一致） */
function paymentInfo(total, paid) {
  if (total === null || total === undefined) return { status: '-', balance: null };
  const p = paid || 0;
  const bal = Math.round((total - p) * 100) / 100;
  if (p <= 0.005) return { status: '未付款', balance: bal };
  if (bal > 0.005) return { status: '部分付款', balance: bal };
  return { status: '已付清', balance: 0 };
}

/** 汇总：{count, amount, tax, total, byStatus, bySubject, byMonth, pending} */
function summarize(list) {
  const res = { count: list.length, amount: 0, tax: 0, total: 0, byStatus: {}, bySubject: {}, byMonth: {}, pending: { count: 0, total: 0 } };
  list.forEach(r => {
    res.amount += r.amount || 0;
    res.tax += r.tax_amount || 0;
    res.total += r.total_amount || 0;
    // 按状态
    const st = r.status || '草稿';
    if (!res.byStatus[st]) res.byStatus[st] = { count: 0, total: 0 };
    res.byStatus[st].count++;
    res.byStatus[st].total += r.total_amount || 0;
    // 按科目
    const sj = r.subject_name || '未归类';
    if (!res.bySubject[sj]) res.bySubject[sj] = { count: 0, total: 0, tax: 0 };
    res.bySubject[sj].count++;
    res.bySubject[sj].total += r.total_amount || 0;
    res.bySubject[sj].tax += r.tax_amount || 0;
    // 按月份
    const ym = (r.invoice_date || '').slice(0, 7) || '未知';
    if (!res.byMonth[ym]) res.byMonth[ym] = { count: 0, total: 0 };
    res.byMonth[ym].count++;
    res.byMonth[ym].total += r.total_amount || 0;
    // 待审核
    if (st === '待审核') { res.pending.count++; res.pending.total += r.total_amount || 0; }
  });
  const r2 = v => Math.round(v * 100) / 100;
  res.amount = r2(res.amount);
  res.tax = r2(res.tax);
  res.total = r2(res.total);
  res.pending.total = r2(res.pending.total);
  return res;
}

function getStats() {
  return summarize(data.reim_invoices);
}

/* ==================== PDF 云端归档路径 ==================== */

/**
 * 发票 PDF 云端归档路径（与电脑端 index.html cloudPdfKey 完全一致）：
 *   PDF/{公司简称}/{进项发票|销项发票}/{发票号}.pdf
 * 匹配不到本公司或方向时兜底 PDF/未分类/待分类/{发票号}.pdf
 * 上传用 cbFiles.uploadExact('reimbursement', cloudPdfKey(...), localPath)。
 */
function cloudPdfKey(companyShort, direction, invoiceNo) {
  const safe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_');
  if (!companyShort || !direction) return 'PDF/未分类/待分类/' + safe(invoiceNo) + '.pdf';
  const folder = direction === '进项' ? '进项发票' : '销项发票';
  return 'PDF/' + safe(companyShort) + '/' + folder + '/' + safe(invoiceNo) + '.pdf';
}

module.exports = {
  KEYS, STATUSES, SETTLES, PAYEES, STATUS_COLORS, SUBJECT_RULES,
  ROLE_NAMES, can, canOnInvoice, roleName,
  loadAll, save, syncFromCloud, isCloudSynced, ensureCloudAccountList,
  listUsers, listAllUsers, findUser,
  listCompanies, matchCompany, classifySubject, allSubjects,
  listAll, findById, existsInvoiceNo, saveInvoice, deleteInvoice,
  workflow, listReviewLogs,
  queryInvoices, paymentInfo, summarize, getStats,
  cloudPdfKey,
  uid, nowStr, today
};
