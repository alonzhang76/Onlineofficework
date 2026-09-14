/**
 * 计件工资数据层 —— 与 Web 版 wage app 完全同构的数据模型与业务逻辑
 * 存储：wx storage（键名与 Web 版 localStorage 一致）
 * 同步：每次保存异步推送 CloudBase（见 utils/cloudbase.js）
 */
const fmt = require('./format');
const supa = require('./cloudbase');

const KEYS = {
  records: 'wage_records',
  employees: 'wage_employees',
  processes: 'wage_processes',
  orders: 'wage_orders',
  adjustments: 'wage_adjustments',
  calendarEvents: 'wage_calendar_events',
  calendarEventTypes: 'wage_calendar_event_types',
  dropdownOptions: 'wage_dropdown_options'
};

const data = {
  records: [],
  employees: [],
  processes: [],
  orders: [],
  adjustments: [],
  calendarEvents: [],
  calendarEventTypes: ['交货', '订货', '出差', '其它'],
  dropdownOptions: {
    performance: [150, 300, 500],
    housing: [200],
    socialInsurance: [519.96, 735, 840],
    housingFund: [500]
  }
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sanitizeOrders() {
  const FIELDS = ['orderDate', 'materialDate', 'packDate', 'shipDate', 'delivery'];
  data.orders.forEach(o => {
    FIELDS.forEach(f => {
      if (o[f] === undefined || o[f] === null || o[f] === '') return;
      const fixed = fmt.sanitizeDateValue(o[f]);
      if (fixed !== o[f]) o[f] = fixed;
    });
  });
}

function loadAll() {
  Object.keys(KEYS).forEach(k => {
    const v = wx.getStorageSync(KEYS[k]);
    if (k === 'dropdownOptions') { if (v && typeof v === 'object') Object.assign(data.dropdownOptions, v); }
    else if (k === 'calendarEventTypes') { if (Array.isArray(v) && v.length) data.calendarEventTypes = v; }
    else if (Array.isArray(v)) data[k] = v;
  });
  sanitizeOrders();
}

function save(key) {
  try { wx.setStorageSync(KEYS[key], data[key]); } catch (e) { console.warn('storage full', e); }
  // 异步推送云端（未配置 CloudBase 时静默跳过）
  supa.push(KEYS[key], data[key]).catch(err => console.warn('[cloudbase] push failed', KEYS[key], err));
}

/** 从云端拉取全部数据并覆盖本地（云端优先），完成后回调 */
function syncFromCloud(cb) {
  if (typeof cb !== 'function') cb = function () {};
  if (!supa.isConfigured()) { cb(false); return; }
  supa.setSuppressPush(true);
  supa.pullAll('wage').then(rows => {
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        const k = Object.keys(KEYS).find(x => KEYS[x] === r.key);
        if (!k || !r.value) return;
        // 本机存在未确认的新写入（或本地时间戳更新）时保留本地，防止旧云端数据回灌覆盖
        if (!supa.takeCloud(r.key, r.updatedAt, data[k])) return;
        if (k === 'dropdownOptions') { if (typeof r.value === 'object') Object.assign(data.dropdownOptions, r.value); }
        else if (k === 'calendarEventTypes') { if (Array.isArray(r.value) && r.value.length) data.calendarEventTypes = r.value; }
        else if (Array.isArray(r.value)) data[k] = r.value;
        try { wx.setStorageSync(r.key, r.value); } catch (e) {}
      });
      sanitizeOrders();
    }
    supa.setSuppressPush(false);
    cb(true);
  }).catch(err => { supa.setSuppressPush(false); console.warn('[cloudbase] pull failed', err); cb(false); });
}

/* ============ 通用 CRUD ============ */
function addRecord(rec) { rec.id = uid(); rec.createdAt = new Date().toISOString(); data.records.push(rec); save('records'); }
function updateRecord(id, d) { const r = data.records.find(r => r.id === id); if (r) Object.assign(r, d); save('records'); }
function deleteRecord(id) { data.records = data.records.filter(r => r.id !== id); save('records'); }

function addEmployee(e) { e.id = uid(); data.employees.push(e); save('employees'); }
function updateEmployee(id, d) { const x = data.employees.find(e => e.id === id); if (x) Object.assign(x, d); save('employees'); }
function deleteEmployee(id) { data.employees = data.employees.filter(e => e.id !== id); save('employees'); }

function addProcess(p) { p.id = uid(); data.processes.push(p); save('processes'); }
function updateProcess(id, d) { const x = data.processes.find(p => p.id === id); if (x) Object.assign(x, d); save('processes'); }
function deleteProcess(id) { data.processes = data.processes.filter(p => p.id !== id); save('processes'); }

function addOrder(o) { o.id = uid(); data.orders.push(o); save('orders'); }
function updateOrder(id, d) { const x = data.orders.find(o => o.id === id); if (x) Object.assign(x, d); save('orders'); }
function deleteOrder(id) { data.orders = data.orders.filter(o => o.id !== id); save('orders'); }

/* ============ 调整项 ============ */
function getAdjustment(employee, year, month) {
  return data.adjustments.find(a => a.employee === employee && a.year == year && a.month == month);
}
function getOrCreateAdjustment(employee, year, month) {
  let a = getAdjustment(employee, year, month);
  if (!a) {
    a = { id: uid(), employee: employee, year: parseInt(year), month: parseInt(month), performance: 0, housing: 0, otherAllowance: 0, yearEndBonus: 0, socialInsurance: 0, housingFund: 0, loanDeduction: 0, tax: 0 };
    data.adjustments.push(a);
    save('adjustments');
  }
  return a;
}
function saveAdjustmentField(employee, year, month, field, val) {
  const a = getOrCreateAdjustment(employee, year, month);
  a[field] = parseFloat(val) || 0;
  save('adjustments');
}

/* ============ 查询 / 汇总 ============ */
function queryRecords(filters) {
  return data.records.filter(r => {
    if (filters.startDate && r.date < filters.startDate) return false;
    if (filters.endDate && r.date > filters.endDate) return false;
    if (filters.employee && r.employee !== filters.employee) return false;
    if (filters.process && r.process !== filters.process) return false;
    if (filters.customer && String(r.customer || '').indexOf(filters.customer) === -1) return false;
    if (filters.orderNo && String(r.orderNo || '').indexOf(filters.orderNo) === -1) return false;
    return true;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function getMonthlySummary(year, month) {
  const monthStr = fmt.pad(month);
  const prefix = year + '-' + monthStr;
  return data.employees.map(emp => {
    const empRecords = data.records.filter(r => r.employee === emp.name && String(r.date).indexOf(prefix) === 0);
    const baseWage = empRecords.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    const attendDays = new Set(empRecords.map(r => r.date)).size;
    const adj = getOrCreateAdjustment(emp.name, year, month);
    const g = f => +adj[f] || 0;
    const total = baseWage + g('performance') + g('housing') + g('otherAllowance') + g('yearEndBonus') - g('socialInsurance') - g('housingFund') - g('loanDeduction') - g('tax');
    return {
      name: emp.name, baseWage: baseWage, attendDays: attendDays,
      performance: g('performance'), housing: g('housing'), otherAllowance: g('otherAllowance'),
      yearEndBonus: g('yearEndBonus'), socialInsurance: g('socialInsurance'),
      housingFund: g('housingFund'), loanDeduction: g('loanDeduction'), tax: g('tax'),
      total: total, recordCount: empRecords.length
    };
  }).filter(r => r.baseWage > 0);
}

function getAnnualSummary(year) {
  const monthData = {};
  for (let m = 1; m <= 12; m++) monthData[m] = getMonthlySummary(year, m);
  return data.employees.map(emp => {
    const monthly = [];
    let baseWageSum = 0, perfSum = 0, housingSum = 0, otherSum = 0, yearEndSum = 0, socialSum = 0, fundSum = 0, loanSum = 0, taxSum = 0;
    for (let m = 1; m <= 12; m++) {
      const row = monthData[m].find(r => r.name === emp.name);
      if (row) {
        monthly.push(row.total);
        baseWageSum += row.baseWage; perfSum += row.performance; housingSum += row.housing;
        otherSum += row.otherAllowance; yearEndSum += row.yearEndBonus; socialSum += row.socialInsurance;
        fundSum += row.housingFund; loanSum += row.loanDeduction; taxSum += row.tax;
      } else monthly.push(0);
    }
    const total = monthly.reduce((s, v) => s + v, 0);
    return { name: emp.name, monthly: monthly, baseWageSum, perfSum, housingSum, otherSum, yearEndSum, socialSum, fundSum, loanSum, taxSum, total: total };
  }).filter(r => r.total > 0 || r.baseWageSum > 0 || r.perfSum > 0 || r.housingSum > 0 || r.otherSum > 0 || r.yearEndSum > 0);
}

function getStats(filters, groupBy) {
  const groups = {};
  queryRecords(filters).forEach(r => {
    const key = r[groupBy] || '未分类';
    if (!groups[key]) groups[key] = { name: key, quantity: 0, totalAmount: 0, count: 0 };
    groups[key].quantity += +r.quantity || 0;
    groups[key].totalAmount += +r.totalAmount || 0;
    groups[key].count++;
  });
  return Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
}

function getStatsMatrix(filters) {
  const recs = queryRecords(filters);
  const empNames = Array.from(new Set(recs.map(r => r.employee))).sort();
  const procNames = Array.from(new Set(recs.map(r => r.process))).sort();
  const matrix = {};
  empNames.forEach(e => { matrix[e] = {}; procNames.forEach(p => { matrix[e][p] = 0; }); });
  recs.forEach(r => {
    if (matrix[r.employee] && matrix[r.employee][r.process] !== undefined) matrix[r.employee][r.process] += +r.totalAmount || 0;
  });
  return { empNames: empNames, procNames: procNames, matrix: matrix };
}

/* ============ 订单状态 ============ */
function getOrderStatus(o) {
  if (o.shipDate) return '已出货';
  if (o.packDate) return '生产结束';
  if (o.materialDate) return '生产中';
  return '待生产';
}

/* ============ 日历（订单自动同步） ============ */
function getOrderCalStatus(orderStatus, delivery) {
  if (orderStatus === '已出货') return 'completed';
  if (delivery && delivery < fmt.today()) return 'overdue';
  return 'pending';
}
function getOrderCalPriority(orderStatus, delivery) {
  const st = getOrderCalStatus(orderStatus, delivery);
  if (st === 'completed') return 'low';
  const diff = (new Date(delivery) - new Date()) / 86400000;
  if (diff < 3) return 'high';
  if (diff < 7) return 'medium';
  return 'low';
}
function syncOrdersToCalendar() {
  let events = data.calendarEvents.filter(e => !e.sourceType || e.sourceType !== 'order');
  data.orders.forEach(o => {
    if (!o.delivery) return;
    const orderStatus = getOrderStatus(o);
    events.push({
      id: 'order-' + o.id,
      title: '订单 ' + (o.orderNo || ''),
      description: [o.customer ? '客户: ' + o.customer : '', o.type ? '类型: ' + o.type : '', o.spec ? '规格: ' + o.spec : '', o.qty ? '订单数量: ' + o.qty : '', o.output ? '产出数量: ' + o.output : '', '状态: ' + orderStatus].filter(Boolean).join('\n'),
      date: o.delivery, time: '', type: '交货',
      priority: getOrderCalPriority(orderStatus, o.delivery),
      status: getOrderCalStatus(orderStatus, o.delivery),
      sourceId: o.id, sourceType: 'order',
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
  });
  data.calendarEvents = events;
  save('calendarEvents');
}

module.exports = {
  data: data, KEYS: KEYS, uid: uid, loadAll: loadAll, save: save, syncFromCloud: syncFromCloud,
  addRecord, updateRecord, deleteRecord,
  addEmployee, updateEmployee, deleteEmployee,
  addProcess, updateProcess, deleteProcess,
  addOrder, updateOrder, deleteOrder,
  getAdjustment, getOrCreateAdjustment, saveAdjustmentField,
  queryRecords, getMonthlySummary, getAnnualSummary, getStats, getStatsMatrix,
  getOrderStatus, syncOrdersToCalendar
};
