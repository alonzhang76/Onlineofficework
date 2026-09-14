// 订单排程数据层（由 apps/orderschedule/index.html 移植）
// 存储键与网页版 localStorage 完全一致，便于数据语义互通：
//   production_orders_data  订单数组（约40字段，含4笔付款、两段产出）
//   calendarNotes           日历记事 { "YYYY-MM-DD": [{content, completed}] }
//   memos                   备忘数组 {id,title,content,priority,deadline,status,createdAt}
const supa = require('./cloudbase');

const KEYS = ['production_orders_data', 'calendarNotes', 'memos'];

// 网页版汇率表（orderschedule 专用，与外贸模块数值不同）
const RATES = { USD: 7.2, EUR: 7.8, CNY: 1.0, GBP: 9.1, JPY: 0.048 };
const CURRENCIES = ['CNY', 'USD', 'EUR', 'GBP', 'JPY'];
const PRIORITIES = ['low', 'medium', 'high'];

const data = {
  production_orders_data: [],
  calendarNotes: {},
  memos: []
};

function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(num(v) * 100) / 100; }

function loadAll() {
  KEYS.forEach(k => {
    try {
      const v = wx.getStorageSync(k);
      if (v) data[k] = v;
    } catch (e) { /* 忽略读取失败 */ }
  });
  if (!data.production_orders_data) data.production_orders_data = [];
  if (!data.calendarNotes || typeof data.calendarNotes !== 'object') data.calendarNotes = {};
  if (!Array.isArray(data.memos)) data.memos = [];
}

function save(key) {
  try { wx.setStorageSync(key, data[key]); } catch (e) { /* 存储失败静默 */ }
  supa.push(key, data[key]).catch(() => {});
}

function syncFromCloud(cb) {
  supa.setSuppressPush(true);
  supa.pullAll('schedule').then(rows => {
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (!r || KEYS.indexOf(r.key) === -1 || r.value === null || r.value === undefined) return;
        let valid = false;
        if (r.key === 'calendarNotes') valid = (typeof r.value === 'object' && !Array.isArray(r.value));
        else valid = Array.isArray(r.value); // production_orders_data / memos 均为数组
        if (!valid) return;
        // 本机存在未确认的新写入（或本地时间戳更新）时保留本地，防止旧云端数据回灌覆盖
        if (!supa.takeCloud(r.key, r.updatedAt, data[r.key])) return;
        data[r.key] = r.value;
        try { wx.setStorageSync(r.key, r.value); } catch (e) { /* 存储失败静默 */ }
      });
    }
    supa.setSuppressPush(false);
    if (typeof cb === 'function') cb(true);
  }).catch(() => {
    supa.setSuppressPush(false);
    if (typeof cb === 'function') cb(false);
  });
}

// ==================== 派生状态算法（与网页版一致） ====================

function toCNY(amount, currency) {
  const rate = RATES[currency] || RATES.USD;
  return r2(num(amount) * rate);
}

function deliveryStatus(shipDate) {
  return shipDate ? '已出货' : '生产中';
}

function paymentStatus(invoiceAmount, p1, p2, p3, p4) {
  const invoice = num(invoiceAmount);
  const paid = num(p1) + num(p2) + num(p3) + num(p4);
  if (invoice === 0) return '未开票';
  if (paid >= invoice) return '付清';
  if (paid > 0) return '欠款 ' + r2(invoice - paid).toFixed(2);
  return '未付';
}

function invoiceStatus(invoiceDate) {
  return invoiceDate ? '已开票' : '未开票';
}

function rmbPrice(invoiceAmount, quantity) {
  const inv = num(invoiceAmount);
  const qty = num(quantity);
  if (qty > 0 && inv > 0) return (inv / qty).toFixed(2);
  return '-';
}

// 计算并回填派生字段
function withDerived(o) {
  o.orderAmount = r2(num(o.quantity) * num(o.price) + num(o.moldFee));
  o.actualQty = num(o.output1) + num(o.output2);
  o.deliveryStatus = deliveryStatus(o.shipDate);
  o.status = o.deliveryStatus;
  o.paymentStatus = paymentStatus(o.invoiceAmount, o.payAmount1, o.payAmount2, o.payAmount3, o.payAmount4);
  o.invoiceStatus = invoiceStatus(o.invoiceDate);
  o.rmbPrice = rmbPrice(o.invoiceAmount, o.quantity);
  return o;
}

// ==================== 订单 CRUD ====================

function saveOrder(form) {
  const o = withDerived(Object.assign({}, form));
  if (o.id) {
    const idx = data.production_orders_data.findIndex(x => x.id === o.id);
    if (idx >= 0) {
      o.createdAt = data.production_orders_data[idx].createdAt || new Date().toISOString();
      data.production_orders_data[idx] = o;
    } else {
      o.createdAt = new Date().toISOString();
      data.production_orders_data.push(o);
    }
  } else {
    // id 用 uid 生成，避免同毫秒连续新建冲突
    o.id = uid('po_');
    o.createdAt = new Date().toISOString();
    data.production_orders_data.push(o);
  }
  save('production_orders_data');
  return o;
}

function deleteOrder(id) {
  data.production_orders_data = data.production_orders_data.filter(o => o.id !== id);
  save('production_orders_data');
}

// ==================== 看板 / 汇总 ====================

function getDashboard() {
  const orders = data.production_orders_data;
  const delivered = orders.filter(o => o.status === '已交货' || o.status === '结束' || o.status === '已出货').length;
  const pending = orders.filter(o => o.status === '生产中').length;
  const totalAmount = orders.reduce((s, o) => s + toCNY(o.orderAmount, o.currency), 0);
  return {
    total: orders.length,
    delivered,
    pending,
    totalAmount: r2(totalAmount),
    recent: orders.slice(-10).reverse()
  };
}

// 汇总统计：总KPI + 按客户 + 按月 + 按状态
function getSummary(year) {
  const orders = data.production_orders_data;
  const filtered = year ? orders.filter(o => (o.date || '').substring(0, 4) === String(year)) : orders;

  const totalOrders = filtered.length;
  const totalAmount = r2(filtered.reduce((s, o) => s + toCNY(o.orderAmount, o.currency), 0));
  const totalReceived = r2(filtered.reduce((s, o) => s + toCNY(num(o.payAmount1) + num(o.payAmount2) + num(o.payAmount3) + num(o.payAmount4), o.currency), 0));
  const totalInvoiced = r2(filtered.reduce((s, o) => s + toCNY(o.invoiceAmount, o.currency), 0));

  const custMap = {};
  filtered.forEach(o => {
    const c = o.customer || '未命名';
    if (!custMap[c]) custMap[c] = { name: c, count: 0, amount: 0, received: 0, invoiced: 0 };
    custMap[c].count++;
    custMap[c].amount += toCNY(o.orderAmount, o.currency);
    custMap[c].received += toCNY(num(o.payAmount1) + num(o.payAmount2) + num(o.payAmount3) + num(o.payAmount4), o.currency);
    custMap[c].invoiced += toCNY(o.invoiceAmount, o.currency);
  });
  const byCustomer = Object.values(custMap).map(d => ({
    name: d.name,
    count: d.count,
    amount: r2(d.amount),
    received: r2(d.received),
    invoiced: r2(d.invoiced),
    debt: r2(d.invoiced - d.received),
    ratio: totalOrders > 0 ? Math.round((d.count / totalOrders) * 1000) / 10 : 0
  })).sort((a, b) => b.amount - a.amount);

  const monthMap = {};
  filtered.forEach(o => {
    const m = (o.date || '').substring(0, 7) || '未知';
    if (!monthMap[m]) monthMap[m] = { month: m, count: 0, amount: 0, received: 0 };
    monthMap[m].count++;
    monthMap[m].amount += toCNY(o.orderAmount, o.currency);
    monthMap[m].received += toCNY(num(o.payAmount1) + num(o.payAmount2) + num(o.payAmount3) + num(o.payAmount4), o.currency);
  });
  const byMonth = Object.values(monthMap).map(d => ({
    month: d.month, count: d.count, amount: r2(d.amount), received: r2(d.received)
  })).sort((a, b) => b.month.localeCompare(a.month));

  const statusMap = {};
  filtered.forEach(o => {
    const s = o.status || '生产中';
    if (!statusMap[s]) statusMap[s] = { status: s, count: 0, amount: 0 };
    statusMap[s].count++;
    statusMap[s].amount += toCNY(o.orderAmount, o.currency);
  });
  const byStatus = Object.values(statusMap).map(d => ({
    status: d.status, count: d.count, amount: r2(d.amount)
  }));

  const years = [];
  orders.forEach(o => {
    const y = (o.date || '').substring(0, 4);
    if (y && years.indexOf(y) < 0) years.push(y);
  });
  years.sort().reverse();

  return { totalOrders, totalAmount, totalReceived, totalInvoiced, byCustomer, byMonth, byStatus, years };
}

// ==================== 日历记事 ====================

function getNotes(date) {
  return data.calendarNotes[date] || [];
}

function addNote(date, content) {
  if (!date || !content) return;
  if (!Array.isArray(data.calendarNotes[date])) data.calendarNotes[date] = [];
  data.calendarNotes[date].push({ content, completed: false });
  save('calendarNotes');
}

function toggleNote(date, index) {
  const list = data.calendarNotes[date];
  if (!list || !list[index]) return;
  list[index].completed = !list[index].completed;
  save('calendarNotes');
}

function deleteNote(date, index) {
  const list = data.calendarNotes[date];
  if (!list) return;
  list.splice(index, 1);
  if (list.length === 0) delete data.calendarNotes[date];
  save('calendarNotes');
}

// ==================== 备忘 ====================

function addMemo(form) {
  const m = {
    // id 用 uid 生成，避免同毫秒连续新建冲突
    id: uid('sm_'),
    title: form.title || '',
    content: form.content || '',
    priority: form.priority || 'low',
    deadline: form.deadline || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.memos.push(m);
  save('memos');
  return m;
}

function saveMemoEdit(form) {
  const idx = data.memos.findIndex(m => m.id === form.id);
  if (idx < 0) return;
  data.memos[idx] = Object.assign({}, data.memos[idx], {
    title: form.title || '',
    content: form.content || '',
    priority: form.priority || 'low',
    deadline: form.deadline || ''
  });
  save('memos');
}

function toggleMemoStatus(id) {
  const m = data.memos.find(x => x.id === id);
  if (!m) return;
  m.status = m.status === 'done' ? 'pending' : 'done';
  save('memos');
}

function deleteMemo(id) {
  data.memos = data.memos.filter(m => m.id !== id);
  save('memos');
}

// ==================== 备份 ====================

function exportBackup() {
  return {
    app: 'orderschedule-miniprogram',
    exportedAt: new Date().toISOString(),
    orders: data.production_orders_data,
    calendarNotes: data.calendarNotes,
    memos: data.memos
  };
}

function importBackup(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.orders)) return false;
  data.production_orders_data = obj.orders;
  data.calendarNotes = obj.calendarNotes && typeof obj.calendarNotes === 'object' ? obj.calendarNotes : {};
  data.memos = Array.isArray(obj.memos) ? obj.memos : [];
  KEYS.forEach(save);
  return true;
}

module.exports = {
  KEYS, RATES, CURRENCIES, PRIORITIES, data, uid, num, r2,
  loadAll, save, syncFromCloud,
  toCNY, deliveryStatus, paymentStatus, invoiceStatus, rmbPrice, withDerived,
  saveOrder, deleteOrder, getDashboard, getSummary,
  getNotes, addNote, toggleNote, deleteNote,
  addMemo, saveMemoEdit, toggleMemoStatus, deleteMemo,
  exportBackup, importBackup
};
