/* ===== 发票与付款系统 - CloudBase 数据访问层 =====
 * 底层使用 app_data_store 表（id=store_key, data=JSON payload）
 * 集合：reim_invoices / reim_users / reim_companies / reim_review_log
 */
window.REIM_STORE_LOADED = true;

const STORE_KEYS = {
  invoices: 'reim_invoices',
  users: 'reim_users',
  companies: 'reim_companies',
  reviewLog: 'reim_review_log',
};

function waitForSupabase(timeout) {
  timeout = timeout || 20000;
  var start = Date.now();
  return new Promise(function (resolve, reject) {
    function check() {
      if (window.supabase && window.supabase.auth && window.supabase.from) {
        resolve(window.supabase); return;
      }
      if (Date.now() - start > timeout) { reject(new Error('CloudBase 初始化超时')); return; }
      setTimeout(check, 100);
    }
    check();
  });
}

/* ---------- 通用集合读写 ---------- */
async function storeGet(key) {
  var sb = await waitForSupabase();
  var r = await sb.from('app_data_store').select('*').eq('id', key);
  if (r.error) throw r.error;
  var row = (r.data && r.data[0]) || null;
  if (!row) return null;
  return (row.data !== undefined && row.data !== null) ? row.data : null;
}

async function storeSet(key, payload) {
  var sb = await waitForSupabase();
  var r = await sb.from('app_data_store').upsert(
    { id: key, data: payload },
    { onConflict: 'id' }
  );
  if (r.error) throw r.error;
  return true;
}

/* ---------- 发票集合 ---------- */
async function getInvoices() {
  var data = await storeGet(STORE_KEYS.invoices);
  var list = Array.isArray(data) ? data : [];
  list.forEach(function (r) {
    var pi = paymentInfo(r.total_amount, r.paid_amount);
    r.payment_status = pi.status;
    r.balance = pi.balance;
  });
  return list;
}

async function saveInvoices(list) {
  return storeSet(STORE_KEYS.invoices, list);
}

/* ---------- 用户集合 ---------- */
async function getUsers() {
  var data = await storeGet(STORE_KEYS.users);
  return Array.isArray(data) ? data : [];
}

async function saveUsers(list) {
  return storeSet(STORE_KEYS.users, list);
}

async function findUserByEmail(email) {
  var users = await getUsers();
  return users.find(function (u) { return u.email === email; }) || null;
}

/* ---------- 公司集合 ---------- */
async function getCompanies() {
  var data = await storeGet(STORE_KEYS.companies);
  return Array.isArray(data) ? data : [];
}

async function saveCompanies(list) {
  return storeSet(STORE_KEYS.companies, list);
}

/* ---------- 审核日志 ---------- */
async function getReviewLogs() {
  var data = await storeGet(STORE_KEYS.reviewLog);
  return Array.isArray(data) ? data : [];
}

async function saveReviewLogs(list) {
  return storeSet(STORE_KEYS.reviewLog, list);
}

/* ---------- 公司抬头匹配（进项/销项方向） ---------- */
function _normName(s) {
  return String(s || '').replace(/\s+/g, '');
}

function matchCompany(companies, buyer, seller) {
  var b = _normName(buyer), s = _normName(seller);
  if (!b && !s) return { company_id: null, direction: null, company_short: null };
  for (var i = 0; i < companies.length; i++) {
    var c = companies[i];
    if (!c.active) continue;
    var n = _normName(c.name);
    if (n && b && (n.indexOf(b) >= 0 || b.indexOf(n) >= 0)) {
      return { company_id: c.id, direction: '进项', company_short: c.short_name || c.name };
    }
  }
  for (var j = 0; j < companies.length; j++) {
    var c2 = companies[j];
    if (!c2.active) continue;
    var n2 = _normName(c2.name);
    if (n2 && s && (n2.indexOf(s) >= 0 || s.indexOf(n2) >= 0)) {
      return { company_id: c2.id, direction: '销项', company_short: c2.short_name || c2.name };
    }
  }
  return { company_id: null, direction: null, company_short: null };
}

/* 重算全部发票的方向（公司抬头变更后调用） */
async function recomputeAllDirections() {
  var companies = await getCompanies();
  var invoices = await getInvoices();
  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    var m = matchCompany(companies, inv.buyer_name, inv.seller_name);
    inv.company_id = m.company_id;
    inv.direction = m.direction;
    inv.company_short = m.company_short;
  }
  await saveInvoices(invoices);
  return invoices;
}

/* ---------- 付款状态计算 ---------- */
function paymentInfo(total, paid) {
  if (total == null) return { status: '-', balance: null };
  paid = paid || 0;
  var bal = Math.round((total - paid) * 100) / 100;
  if (paid <= 0.005) return { status: '未付款', balance: bal };
  if (bal > 0.005) return { status: '部分付款', balance: bal };
  return { status: '已付清', balance: 0 };
}

/* ---------- ID 生成 ---------- */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- 导出到全局 ---------- */
window.ReimStore = {
  STORE_KEYS: STORE_KEYS,
  waitForSupabase: waitForSupabase,
  storeGet: storeGet,
  storeSet: storeSet,
  getInvoices: getInvoices,
  saveInvoices: saveInvoices,
  getUsers: getUsers,
  saveUsers: saveUsers,
  findUserByEmail: findUserByEmail,
  getCompanies: getCompanies,
  saveCompanies: saveCompanies,
  getReviewLogs: getReviewLogs,
  saveReviewLogs: saveReviewLogs,
  matchCompany: matchCompany,
  recomputeAllDirections: recomputeAllDirections,
  paymentInfo: paymentInfo,
  genId: genId,
};
