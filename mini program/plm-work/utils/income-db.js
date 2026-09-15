// 收支管理数据层（由 apps/incomeexpense/index.html 移植）
// 与网页版一致：数据按公司隔离（company1 普利美 / company2 无锡龙力）
// 存储键与网页版 localStorage 同名：
//   transactions_<co>        收支流水数组
//   lastUpdated_<co>         最近更新时间
//   todos                    待办事项（全局共享）
//   currentCompany           当前公司
//   currentCompany_statement 对账页当前公司
const supa = require('./cloudbase');

const COMPANIES = [
  { id: 'company1', name: '普利美（常州）环境工程科技有限公司', short: '普利美' },
  { id: 'company2', name: '无锡龙力印铁设备制造有限公司', short: '无锡龙力' }
];

const KEYS = [
  'transactions_company1', 'transactions_company2',
  'lastUpdated_company1', 'lastUpdated_company2',
  'todos', 'currentCompany', 'currentCompany_statement'
];

// 分类表（与网页版 window.categories 完全一致）
const CATEGORIES = {
  income: [
    { id: 'salary', name: '前期账面余额' },
    { id: 'bonus', name: '无锡龙力' },
    { id: 'investment', name: '货款' },
    { id: 'side-income', name: '个人垫资' },
    { id: 'gift', name: '还款' },
    { id: 'adjustment', name: '调账' },
    { id: 'other-income', name: '其他收入' }
  ],
  expense: [
    { id: 'previous-balance', name: '前期账面余额' },
    { id: 'raw-materials', name: '原材料' },
    { id: 'auxiliary-materials', name: '辅助材料' },
    { id: 'plating', name: '电镀费' },
    { id: 'packaging', name: '包装箱费用' },
    { id: 'consumables', name: '易耗品材料' },
    { id: 'outsourcing', name: '外协加工费' },
    { id: 'shipping', name: '运杂费' },
    { id: 'repair-mold', name: '维修或模具费' },
    { id: 'utilities', name: '水电费' },
    { id: 'salary', name: '工资' },
    { id: 'tax', name: '税' },
    { id: 'bank-repayment', name: '银行还贷' },
    { id: 'bank-fee', name: '银行手续费' },
    { id: 'interest', name: '利息' },
    { id: 'employee-reimbursement', name: '员工报销' },
    { id: 'employee-meal', name: '员工餐费用' },
    { id: 'employee-welfare', name: '员工福利' },
    { id: 'communication', name: '通信费' },
    { id: 'adjustment', name: '调账' },
    { id: 'other-expense', name: '其它支出' },
    { id: 'trade-transaction', name: '贸易往来' },
    { id: 'loan', name: '借款' },
    { id: 'fixed-assets', name: '固定资产设备' },
    { id: 'trade-product', name: '贸易产品' },
    { id: 'administrative-entertainment', name: '其它行政招待费用' }
  ]
};

const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_NAMES = { high: '高', medium: '中', low: '低' };

const data = {};
KEYS.forEach(k => { data[k] = k === 'todos' ? [] : (k.indexOf('transactions_') === 0 ? [] : ''); });
data.currentCompany = 'company1';
data.currentCompany_statement = 'company1';

function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(num(v) * 100) / 100; }
function co(company) { return company || 'company1'; }
/** 公司全称（抬头）：company1 → 普利美（常州）…，company2 → 无锡龙力… */
function companyName(company) {
  const c = COMPANIES.find(x => x.id === co(company)) || COMPANIES[0];
  return c.name;
}
function today() {
  const d = new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * 把两家公司全部流水的 unit 归一为公司抬头。
 * 「单位」不再手工填写，一律由所属公司账本决定（company1=普利美，company2=无锡龙力）。
 * 只在有变化时写回，避免每次启动都推云端。
 */
function normalizeUnits() {
  let changed = false;
  ['company1', 'company2'].forEach(c => {
    const name = companyName(c);
    const list = data['transactions_' + c];
    if (!Array.isArray(list)) return;
    list.forEach(t => { if (t && t.unit !== name) { t.unit = name; changed = true; } });
  });
  if (changed) { save('transactions_company1'); save('transactions_company2'); }
  return changed;
}

function loadAll() {
  KEYS.forEach(k => {
    try {
      const v = supa.safeGet(k);
      if (v !== '' && v !== undefined && v !== null) data[k] = v;
    } catch (e) { /* 忽略 */ }
  });
  KEYS.forEach(k => {
    if (k.indexOf('transactions_') === 0) { if (!Array.isArray(data[k])) data[k] = []; }
  });
  if (!Array.isArray(data.todos)) data.todos = [];
  if (!data.currentCompany) data.currentCompany = 'company1';
  if (!data.currentCompany_statement) data.currentCompany_statement = 'company1';
  normalizeUnits();
}

function save(key) {
  try { supa.safeSet(key, data[key]); } catch (e) { /* 静默 */ }
  supa.push(key, data[key]).catch(() => {});
}

/** 从云端拉取全部数据并覆盖本地（云端优先），完成后回调 */
function syncFromCloud(cb) {
  if (typeof cb !== 'function') cb = function () {};
  if (!supa.isConfigured()) { cb(false); return; }
  supa.setSuppressPush(true);
  supa.pullAll('incomeexpense').then(rows => {
    let applied = 0;
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        // 只接受本数据层已知键，且忽略空值
        if (!r.key || KEYS.indexOf(r.key) < 0) return;
        if (r.value === null || r.value === undefined || r.value === '') return;
        // 本机存在未确认的新写入（或本地时间戳更新）时保留本地，防止旧云端数据回灌覆盖
        if (!supa.takeCloud(r.key, r.updatedAt, data[r.key])) return;
        // transactions_* / todos 为数组，其余（lastUpdated_*、currentCompany*）为字符串
        if (r.key.indexOf('transactions_') === 0 || r.key === 'todos') {
          if (Array.isArray(r.value)) data[r.key] = r.value;
        } else {
          data[r.key] = r.value;
        }
        supa.safeSet(r.key, r.value);
        applied++;
      });
      // 类型兜底
      KEYS.forEach(k => {
        if (k.indexOf('transactions_') === 0 && !Array.isArray(data[k])) data[k] = [];
      });
      if (!Array.isArray(data.todos)) data.todos = [];
      if (!data.currentCompany) data.currentCompany = 'company1';
      normalizeUnits();
    }
    supa.setSuppressPush(false);
    cb(true, applied);
  }).catch(err => { supa.setSuppressPush(false); console.warn('[cloudbase] pull failed', err); cb(false, 0); });
}

// ==================== 流水 ====================

function listTx(company) { return data['transactions_' + co(company)] || []; }

function findCategory(type, id) {
  const list = CATEGORIES[type] || [];
  return list.find(c => c.id === id) || { id, name: id };
}

function saveTx(company, form) {
  const c = co(company);
  const type = form.type === 'expense' ? 'expense' : 'income';
  const tx = {
    id: form.id || uid('tx_'),
    type,
    amount: r2(form.amount),
    categoryId: form.categoryId || '',
    categoryName: form.categoryName || findCategory(type, form.categoryId).name,
    date: form.date || today(),
    description: form.description || '',
    // 单位 = 所属公司抬头，不再手工填写
    unit: companyName(c),
    paymentMethod: form.paymentMethod || '',
    payeeUnit: form.payeeUnit || '',
    payerUnit: form.payerUnit || '',
    createdAt: form.createdAt || new Date().toISOString()
  };
  const list = data['transactions_' + c];
  const idx = list.findIndex(t => t.id === tx.id);
  if (idx >= 0) list[idx] = tx; else list.push(tx);
  data['lastUpdated_' + c] = today();
  save('transactions_' + c);
  save('lastUpdated_' + c);
  return tx;
}

/** 收/付款单位候选：两家公司流水里出现过的全部往来单位，按时间倒序去重 */
function listCounterparties(company) {
  const seen = {}, out = [];
  const pool = company ? [listTx(company)] : [listTx('company1'), listTx('company2')];
  pool.forEach(list => {
    (list || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .forEach(t => {
        [t.payeeUnit, t.payerUnit].forEach(v => {
          v = (v || '').trim();
          if (v && !seen[v]) { seen[v] = 1; out.push(v); }
        });
      });
  });
  return out;
}

function deleteTx(company, id) {
  const c = co(company);
  data['transactions_' + c] = listTx(c).filter(t => t.id !== id);
  save('transactions_' + c);
}

// 筛选 + 汇总
function queryTx(company, f) {
  f = f || {};
  let list = listTx(company).slice();
  if (f.type && f.type !== 'all') list = list.filter(t => t.type === f.type);
  if (f.categoryId) list = list.filter(t => t.categoryId === f.categoryId);
  if (f.dateFrom) list = list.filter(t => (t.date || '') >= f.dateFrom);
  if (f.dateTo) list = list.filter(t => (t.date || '') <= f.dateTo);
  if (f.kw) {
    const kws = f.kw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    list = list.filter(t => {
      const text = [t.description, t.categoryName, t.unit, t.paymentMethod, t.payeeUnit, t.payerUnit]
        .join(' ').toLowerCase();
      return kws.some(k => text.indexOf(k) >= 0 || String(t.amount).indexOf(k) >= 0);
    });
  }
  // 按日期倒序（同日按创建时间倒序）
  list.sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return list;
}

function summarize(list) {
  let income = 0, expense = 0;
  list.forEach(t => { if (t.type === 'income') income += num(t.amount); else expense += num(t.amount); });
  return { income: r2(income), expense: r2(expense), balance: r2(income - expense) };
}

function getStats(company, year) {
  let list = listTx(company);
  if (year) list = list.filter(t => (t.date || '').substring(0, 4) === String(year));
  const totals = summarize(list);

  // 按分类
  const catMap = {};
  list.forEach(t => {
    const key = t.type + '|' + (t.categoryName || t.categoryId || '未分类');
    if (!catMap[key]) catMap[key] = { type: t.type, name: t.categoryName || t.categoryId || '未分类', amount: 0, count: 0 };
    catMap[key].amount += num(t.amount);
    catMap[key].count++;
  });
  const byCategory = Object.values(catMap).map(x => ({ type: x.type, name: x.name, amount: r2(x.amount), count: x.count }))
    .sort((a, b) => b.amount - a.amount);

  // 按月
  const monthMap = {};
  list.forEach(t => {
    const m = (t.date || '').substring(0, 7) || '未知';
    if (!monthMap[m]) monthMap[m] = { month: m, income: 0, expense: 0, count: 0 };
    if (t.type === 'income') monthMap[m].income += num(t.amount); else monthMap[m].expense += num(t.amount);
    monthMap[m].count++;
  });
  const byMonth = Object.values(monthMap).map(x => ({
    month: x.month, count: x.count, income: r2(x.income), expense: r2(x.expense), balance: r2(x.income - x.expense)
  })).sort((a, b) => b.month.localeCompare(a.month));

  // 年份清单
  const years = [];
  listTx(company).forEach(t => {
    const y = (t.date || '').substring(0, 4);
    if (y && years.indexOf(y) < 0) years.push(y);
  });
  years.sort().reverse();

  return {
    income: totals.income, expense: totals.expense, balance: totals.balance,
    count: list.length, byCategory, byMonth, years
  };
}

// ==================== 待办 ====================

function listTodos() { return data.todos || []; }

function addTodo(form) {
  const t = {
    // id 用 uid 生成，避免同毫秒连续新建冲突
    id: uid('todo_'),
    text: (form.text || '').trim(),
    priority: form.priority || 'medium',
    completed: false,
    createdAt: new Date().toISOString()
  };
  data.todos.push(t);
  save('todos');
  return t;
}

function saveTodoEdit(form) {
  const idx = data.todos.findIndex(t => t.id === form.id);
  if (idx < 0) return;
  data.todos[idx] = Object.assign({}, data.todos[idx], {
    text: (form.text || '').trim(),
    priority: form.priority || 'medium'
  });
  save('todos');
}

function toggleTodo(id) {
  const t = data.todos.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  save('todos');
}

function deleteTodo(id) {
  data.todos = data.todos.filter(t => t.id !== id);
  save('todos');
}

// ==================== 备份 ====================

function exportBackup() {
  return {
    app: 'incomeexpense-miniprogram',
    exportedAt: new Date().toISOString(),
    currentCompany: data.currentCompany,
    currentCompany_statement: data.currentCompany_statement,
    transactions: {
      company1: data.transactions_company1,
      company2: data.transactions_company2
    },
    lastUpdated: {
      company1: data.lastUpdated_company1,
      company2: data.lastUpdated_company2
    },
    todos: data.todos
  };
}

function importBackup(obj) {
  if (!obj || typeof obj !== 'object' || !obj.transactions) return false;
  ['company1', 'company2'].forEach(c => {
    if (Array.isArray(obj.transactions[c])) data['transactions_' + c] = obj.transactions[c];
    if (obj.lastUpdated && obj.lastUpdated[c]) data['lastUpdated_' + c] = obj.lastUpdated[c];
  });
  if (Array.isArray(obj.todos)) data.todos = obj.todos;
  if (obj.currentCompany) data.currentCompany = obj.currentCompany;
  normalizeUnits();
  KEYS.forEach(save);
  return true;
}

module.exports = {
  COMPANIES, KEYS, CATEGORIES, PRIORITIES, PRIORITY_NAMES, data, uid, num, r2, co, today,
  companyName, normalizeUnits, listCounterparties,
  loadAll, save, syncFromCloud,
  listTx, saveTx, deleteTx, findCategory, queryTx, summarize, getStats,
  listTodos, addTodo, saveTodoEdit, toggleTodo, deleteTodo,
  exportBackup, importBackup
};
