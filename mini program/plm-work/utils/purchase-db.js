// 采购管理数据层（由 apps/purchase/index.html 移植）
// 与网页版一致：数据按公司隔离（companyA 普利美 / companyB 无锡龙力）
// 存储键与网页版 localStorage 同名（注意发票/付款为"公司前缀"式）：
//   purchaseOrders_<co>  采购订单（多产品行）
//   <co>-invoices        发票登记（网页版键名：companyA-invoices）
//   <co>-payments        付款记录（凭发票/凭合同两种模式，网页版键名：companyA-payments）
//   contracts_<co>       合同台账（由采购订单派生，过滤木箱产品）
//   receipts_<co>        收货记录
//   returns_<co>         退货记录
//   suppliers            供应商（全局共享）
//   companyNames / units 公司配置 / 单位选项
const supa = require('./cloudbase');

const COMPANIES = [
  { id: 'companyA', name: '普利美（常州）环境工程科技有限公司', short: '普利美' },
  { id: 'companyB', name: '无锡龙力印铁设备制造有限公司', short: '无锡龙力' }
];

const KEYS = [
  'purchaseOrders_companyA', 'purchaseOrders_companyB',
  'companyA-invoices', 'companyB-invoices',
  'companyA-payments', 'companyB-payments',
  'contracts_companyA', 'contracts_companyB',
  'receipts_companyA', 'receipts_companyB',
  'returns_companyA', 'returns_companyB',
  'suppliers', 'companyNames', 'units'
];

const COST_CATEGORIES = ['材料', '加工', '外购件', '模具', '运费', '其他'];
const UNITS_DEFAULT = ['只', '卷', '箱', '吨', '公斤', '套'];

const data = {};
KEYS.forEach(k => { data[k] = k === 'companyNames' ? {} : (k === 'units' ? UNITS_DEFAULT.slice() : []); });
data.companyNames = { companyA: COMPANIES[0].name, companyB: COMPANIES[1].name };

function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(num(v) * 100) / 100; }
function co(company) { return company || 'companyA'; }

function loadAll() {
  KEYS.forEach(k => {
    try {
      const v = supa.safeGet(k);
      if (v !== '' && v !== undefined && v !== null) data[k] = v;
    } catch (e) { /* 忽略 */ }
  });
  // 基础防御
  KEYS.forEach(k => {
    if (k === 'companyNames') { if (!data[k] || typeof data[k] !== 'object') data[k] = { companyA: COMPANIES[0].name, companyB: COMPANIES[1].name }; }
    else if (k === 'units') { if (!Array.isArray(data[k]) || data[k].length === 0) data[k] = UNITS_DEFAULT.slice(); }
    else if (!Array.isArray(data[k])) data[k] = [];
  });
}

function save(key) {
  try { supa.safeSet(key, data[key]); } catch (e) { /* 静默 */ }
  supa.push(key, data[key]).catch(() => {});
}

function syncFromCloud(cb) {
  supa.setSuppressPush(true);
  supa.pullAll('purchase').then(rows => {
    let applied = 0;
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (!r || KEYS.indexOf(r.key) === -1 || r.value === null || r.value === undefined) return;
        let valid = false;
        if (r.key === 'companyNames') valid = (typeof r.value === 'object' && !Array.isArray(r.value));
        else valid = Array.isArray(r.value); // 其余键均为数组
        if (!valid) return;
        // 本机存在未确认的新写入（或本地时间戳更新）时保留本地，防止旧云端数据回灌覆盖
        if (!supa.takeCloud(r.key, r.updatedAt, data[r.key])) return;
        data[r.key] = r.value;
        supa.safeSet(r.key, r.value);
        applied++;
      });
    }
    supa.setSuppressPush(false);
    if (typeof cb === 'function') cb(true, applied);
  }).catch(() => { supa.setSuppressPush(false); if (typeof cb === 'function') cb(false, 0); });
}

// ==================== 采购订单 ====================

function listOrders(company) { return data['purchaseOrders_' + co(company)] || []; }

function saveOrder(company, form) {
  const c = co(company);
  const products = (form.products || []).map(p => ({
    productName: p.productName || '',
    specification: p.specification || '',
    unitPrice: num(p.unitPrice),
    quantity: num(p.quantity),
    unit: p.unit || '只',
    amount: r2(num(p.unitPrice) * num(p.quantity)),
    remark: p.remark || ''
  }));
  const o = {
    id: form.id || uid('pord_'),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    orderDate: form.orderDate || '',
    deliveryDate: form.deliveryDate || '',
    actualArrivalDate: form.actualArrivalDate || null,
    costCategory: form.costCategory || null,
    remarks: form.remarks || null,
    products,
    // 总金额：优先取表单值，否则按产品行自动汇总（与网页版前端自动计算一致）
    totalAmount: r2(num(form.totalAmount) || products.reduce((s, p) => s + p.amount, 0))
  };
  const list = data['purchaseOrders_' + c];
  const idx = list.findIndex(x => x.id === form.id);
  if (idx >= 0) list[idx] = o; else list.push(o);
  save('purchaseOrders_' + c);
  deriveContracts(c);
  return o;
}

function deleteOrder(company, id) {
  const c = co(company);
  data['purchaseOrders_' + c] = listOrders(c).filter(o => o.id !== id);
  save('purchaseOrders_' + c);
  deriveContracts(c);
}

// ==================== 合同台账（由采购订单派生，过滤木箱） ====================

function deriveContracts(c) {
  const orders = listOrders(c);
  const map = {};
  (data['contracts_' + c] || []).forEach(x => { map[x.contractNumber] = x; });
  const orderNos = {};
  orders.forEach(order => {
    orderNos[order.contractNumber] = true;
    const products = (order.products || []).filter(p => p.productName !== '木箱');
    if (products.length === 0) return;
    const existing = map[order.contractNumber];
    if (existing) {
      existing.supplier = order.supplier;
      existing.products = products;
      existing.contractDate = order.orderDate;
      existing.deliveryDate = order.deliveryDate;
      existing.totalAmount = order.totalAmount;
      existing.remark = order.remarks || '';
      existing.updatedAt = new Date().toISOString();
    } else {
      map[order.contractNumber] = {
        id: uid('ct_'),
        contractNumber: order.contractNumber,
        supplier: order.supplier,
        products,
        contractDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        totalAmount: order.totalAmount,
        status: 'in-progress',
        remark: order.remarks || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
  });
  data['contracts_' + c] = Object.values(map).filter(x => orderNos[x.contractNumber]);
  save('contracts_' + c);
}

function listContracts(company) { return data['contracts_' + co(company)] || []; }

// ==================== 发票 ====================

function listInvoices(company) { return data[co(company) + '-invoices'] || []; }

function invoiceStatusOf(invoice, company) {
  const payments = data[co(company || invoice.company) + '-payments'] || [];
  const nos = (invoice.invoiceNumber || '').split(',').map(s => s.trim()).filter(Boolean);
  let paid = 0;
  payments.forEach(p => {
    const pnos = (p.invoiceNumbers || '').split(',').map(s => s.trim()).filter(Boolean);
    if (pnos.some(n => nos.indexOf(n) >= 0)) paid += num(p.amount);
  });
  if (paid <= 0) return '未付款';
  if (paid >= num(invoice.amount)) return '已付款';
  return '部分付款';
}

function refreshInvoiceStatus(company) {
  const c = co(company);
  (data[c + '-invoices'] || []).forEach(inv => { inv.status = invoiceStatusOf(inv, c); });
  save(c + '-invoices');
}

function saveInvoice(company, form) {
  const c = co(company);
  const inv = {
    id: form.id || uid('pinv_'),
    invoiceNumber: form.invoiceNumber || '',
    invoiceDate: form.invoiceDate || '',
    purchaseOrder: form.purchaseOrder || '',
    supplier: form.supplier || '',
    amount: r2(num(form.amount)),
    status: '未付款',
    remark: form.remark || '',
    createdAt: form.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const list = data[c + '-invoices'];
  const idx = list.findIndex(x => x.id === inv.id);
  if (idx >= 0) list[idx] = Object.assign({}, list[idx], inv, { status: list[idx].status }); else list.push(inv);
  save(c + '-invoices');
  refreshInvoiceStatus(c);
  return inv;
}

function deleteInvoice(company, id) {
  const c = co(company);
  data[c + '-invoices'] = listInvoices(c).filter(x => x.id !== id);
  save(c + '-invoices');
}

// ==================== 付款 ====================

function listPayments(company) { return data[co(company) + '-payments'] || []; }

function savePayment(company, form) {
  const c = co(company);
  const p = {
    id: form.id || uid('ppay_'),
    paymentNumber: form.paymentNumber || ('PMT-' + Date.now()),
    paymentType: form.paymentType || 'contract-first',
    invoiceNumbers: form.invoiceNumbers || '',
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    paymentDate: form.paymentDate || '',
    amount: r2(num(form.amount)),
    paymentMethod: form.paymentMethod || '',
    remark: form.remark || '',
    createdAt: form.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const list = data[c + '-payments'];
  const idx = list.findIndex(x => x.id === p.id);
  if (idx >= 0) list[idx] = p; else list.push(p);
  save(c + '-payments');
  refreshInvoiceStatus(c);
  return p;
}

function deletePayment(company, id) {
  const c = co(company);
  data[c + '-payments'] = listPayments(c).filter(x => x.id !== id);
  save(c + '-payments');
  refreshInvoiceStatus(c);
}

// ==================== 供应商（全局） ====================

function listSuppliers() { return data.suppliers || []; }

function saveSupplier(form) {
  const s = {
    supplierNumber: form.supplierNumber || '',
    supplierName: form.supplierName || '',
    contactPerson: form.contactPerson || '',
    phoneNumber: form.phoneNumber || '',
    email: form.email || '',
    companyAddress: form.companyAddress || '',
    bankName: form.bankName || '',
    bankCode: form.bankCode || '',
    bankAccount: form.bankAccount || '',
    remarks: form.remarks || ''
  };
  const list = data.suppliers;
  if (form.id) {
    const idx = list.findIndex(x => x.id === form.id);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], s);
    else list.push(Object.assign({ id: uid('sup_') }, s));
  } else {
    s.id = uid('sup_');
    list.push(s);
  }
  save('suppliers');
}

function deleteSupplier(id) {
  data.suppliers = listSuppliers().filter(x => x.id !== id);
  save('suppliers');
}

// ==================== 收货 / 退货 ====================

function listReceipts(company) { return data['receipts_' + co(company)] || []; }

function saveReceipt(company, form) {
  const c = co(company);
  const r = {
    id: form.id || uid('rcp_'),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    productName: form.productName || '',
    quantity: num(form.quantity),
    unit: form.unit || '只',
    receiptDate: form.receiptDate || '',
    remark: form.remark || ''
  };
  const list = data['receipts_' + c];
  const idx = list.findIndex(x => x.id === r.id);
  if (idx >= 0) list[idx] = r; else list.push(r);
  save('receipts_' + c);
}

function deleteReceipt(company, id) {
  const c = co(company);
  data['receipts_' + c] = listReceipts(c).filter(x => x.id !== id);
  save('receipts_' + c);
}

function listReturns(company) { return data['returns_' + co(company)] || []; }

function saveReturn(company, form) {
  const c = co(company);
  const r = {
    id: form.id || uid('rtn_'),
    contractNumber: form.contractNumber || '',
    supplier: form.supplier || '',
    productName: form.productName || '',
    quantity: num(form.quantity),
    unit: form.unit || '只',
    returnDate: form.returnDate || '',
    reason: form.reason || ''
  };
  const list = data['returns_' + c];
  const idx = list.findIndex(x => x.id === r.id);
  if (idx >= 0) list[idx] = r; else list.push(r);
  save('returns_' + c);
}

function deleteReturn(company, id) {
  const c = co(company);
  data['returns_' + c] = listReturns(c).filter(x => x.id !== id);
  save('returns_' + c);
}

// ==================== 看板 / 报表 ====================

function getStats(company) {
  const c = co(company);
  const orders = listOrders(c);
  const invoices = listInvoices(c);
  const payments = listPayments(c);
  const contracts = listContracts(c);
  const purchaseTotal = r2(orders.reduce((s, o) => s + num(o.totalAmount), 0));
  const invoiceTotal = r2(invoices.reduce((s, x) => s + num(x.amount), 0));
  const paymentTotal = r2(payments.reduce((s, x) => s + num(x.amount), 0));
  const supMap = {};
  orders.forEach(o => {
    const k = o.supplier || '未指定';
    if (!supMap[k]) supMap[k] = { name: k, orderCount: 0, purchaseTotal: 0, invoiceTotal: 0, paymentTotal: 0 };
    supMap[k].orderCount++;
    supMap[k].purchaseTotal += num(o.totalAmount);
  });
  invoices.forEach(x => { if (supMap[x.supplier]) supMap[x.supplier].invoiceTotal += num(x.amount); });
  payments.forEach(x => { if (supMap[x.supplier]) supMap[x.supplier].paymentTotal += num(x.amount); });
  const bySupplier = Object.values(supMap).map(x => ({
    name: x.name, orderCount: x.orderCount,
    purchaseTotal: r2(x.purchaseTotal), invoiceTotal: r2(x.invoiceTotal), paymentTotal: r2(x.paymentTotal),
    unpaid: r2(x.invoiceTotal - x.paymentTotal)
  })).sort((a, b) => b.purchaseTotal - a.purchaseTotal);
  return { orderCount: orders.length, invoiceCount: invoices.length, paymentCount: payments.length, contractCount: contracts.length, purchaseTotal, invoiceTotal, paymentTotal, payable: r2(invoiceTotal - paymentTotal), bySupplier };
}

// ==================== 备份 ====================

function exportBackup(company) {
  const c = co(company);
  return {
    app: 'purchase-miniprogram',
    exportedAt: new Date().toISOString(),
    company: c,
    purchaseOrders: data['purchaseOrders_' + c],
    invoices: data[c + '-invoices'],
    payments: data[c + '-payments'],
    contracts: data['contracts_' + c],
    receipts: data['receipts_' + c],
    returns: data['returns_' + c],
    suppliers: data.suppliers
  };
}

function importBackup(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.purchaseOrders)) return false;
  const c = co(obj.company);
  data['purchaseOrders_' + c] = obj.purchaseOrders;
  data[c + '-invoices'] = Array.isArray(obj.invoices) ? obj.invoices : [];
  data[c + '-payments'] = Array.isArray(obj.payments) ? obj.payments : [];
  data['contracts_' + c] = Array.isArray(obj.contracts) ? obj.contracts : [];
  data['receipts_' + c] = Array.isArray(obj.receipts) ? obj.receipts : [];
  data['returns_' + c] = Array.isArray(obj.returns) ? obj.returns : [];
  if (Array.isArray(obj.suppliers)) data.suppliers = obj.suppliers;
  ['purchaseOrders_' + c, c + '-invoices', c + '-payments', 'contracts_' + c, 'receipts_' + c, 'returns_' + c].forEach(k => save(k));
  save('suppliers');
  return true;
}

module.exports = {
  COMPANIES, KEYS, COST_CATEGORIES, UNITS_DEFAULT, data, uid, num, r2, co,
  loadAll, save, syncFromCloud,
  listOrders, saveOrder, deleteOrder,
  listContracts, deriveContracts,
  listInvoices, saveInvoice, deleteInvoice, refreshInvoiceStatus, invoiceStatusOf,
  listPayments, savePayment, deletePayment,
  listSuppliers, saveSupplier, deleteSupplier,
  listReceipts, saveReceipt, deleteReceipt,
  listReturns, saveReturn, deleteReturn,
  getStats, exportBackup, importBackup
};
