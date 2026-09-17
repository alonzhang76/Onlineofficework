/**
 * 外贸出口管理系统数据层 —— 与 Web 版 apps/wicketorders 完全同构
 *
 * 存储：wx storage（键名与 Web 版 localStorage 一致，便于与网页版共用 CloudBase 云端数据）
 * 同步：每次保存异步推送 CloudBase（见 utils/cloudbase.js，命名空间 trade）
 *
 * 数据键（8 类，与网页版一致）：
 *   orderRecords          订单管理
 *   customerRecords       客户信息
 *   exportRecords         出口管理
 *   invoiceRecords        发票管理
 *   receiptRecords        收汇管理
 *   indexPaymentRecords   账务管理（付款）
 *   memoRecords           备忘录
 *   businessRecords       业务跟踪
 */
const fmt = require('./format');
const supa = require('./cloudbase');

const KEYS = {
  orderRecords: 'orderRecords',
  customerRecords: 'customerRecords',
  exportRecords: 'exportRecords',
  invoiceRecords: 'invoiceRecords',
  receiptRecords: 'receiptRecords',
  indexPaymentRecords: 'indexPaymentRecords',
  memoRecords: 'memoRecords',
  businessRecords: 'businessRecords',
  customsRecords: 'customsRecords'
};

/** 固定汇率表（与网页版 displayDebtStatistics 保持一致） */
const FIXED_RATES = { USD: 7.2, EUR: 8.0, GBP: 9.2, JPY: 0.048, CNY: 1 };

/** 常用币种 */
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];

/** 备忘颜色（与网页版 MEMO_COLORS 一致） */
const MEMO_COLORS = [
  { name: '默认', value: '#ffffff', border: '#e5e7eb' },
  { name: '黄色', value: '#fef9c3', border: '#fde047' },
  { name: '绿色', value: '#dcfce7', border: '#86efac' },
  { name: '蓝色', value: '#dbeafe', border: '#93c5fd' },
  { name: '粉色', value: '#fce7f3', border: '#f9a8d4' },
  { name: '紫色', value: '#f3e8ff', border: '#d8b4fe' }
];

/** 业务跟踪状态 / 反馈枚举 */
const BUSINESS_STATUS = ['跟进中/已发邮件', '已回复', '已下单', '已终止'];
const FEEDBACK_TYPES = ['积极', '中性', '消极', '待回复'];

/** 订单状态枚举 */
const ORDER_STATUS = ['待生产', '生产中', '已出货'];

/** 付款方式 */
const PAYMENT_METHODS = ['预付款', '尾款', '全款', '其他'];

/** 交易条款 / 运输方式 */
const TRADE_TERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP', 'FCA'];
const TRANSPORT_METHODS = ['海运', '空运', '快递', '陆运'];

/** LOGO 选项（与网页版 addProductRow 一致） */
const LOGO_OPTIONS = ['无', 'LONGLI', 'KBA', 'PERM', 'EPCCS', 'INGHOR', 'CC', 'J', 'HS'];

/** 单位选项 */
const UNIT_OPTIONS = ['只', '个', '套', '箱', '公斤', '吨', '袋'];

const data = {
  orderRecords: [],
  customerRecords: [],
  exportRecords: [],
  invoiceRecords: [],
  receiptRecords: [],
  indexPaymentRecords: [],
  memoRecords: [],
  businessRecords: [],
  customsRecords: []
};

function uid(prefix) {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 数值安全转换 */
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** 保留 2 位小数（返回数字） */
function r2(v) { return Math.round(num(v) * 100) / 100; }

/* ============ 加载 / 保存 ============ */

function loadAll() {
  Object.keys(KEYS).forEach(k => {
    const v = supa.safeGet(KEYS[k]);
    if (Array.isArray(v)) data[k] = v;
  });
}

function save(key) {
  try { supa.safeSet(KEYS[key], data[key]); } catch (e) { console.warn('storage full', e); }
  supa.push(KEYS[key], data[key]).catch(err => console.warn('[cloudbase] push failed', KEYS[key], err));
}

/** 从云端拉取外贸系统全部数据并覆盖本地（云端优先） */
function syncFromCloud(cb) {
  if (typeof cb !== 'function') cb = function () {};
  if (!supa.isConfigured()) { cb(false); return; }
  supa.setSuppressPush(true);
  supa.pullAll('trade').then(rows => {
    let applied = 0;
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        const k = Object.keys(KEYS).find(x => KEYS[x] === r.key);
        if (!k || !Array.isArray(r.value)) return;
        // 本机存在未确认的新写入（或本地时间戳更新）时保留本地，防止旧云端数据回灌覆盖
        if (!supa.takeCloud(r.key, r.updatedAt, data[k])) return;
        data[k] = r.value;
        supa.safeSet(r.key, r.value);
        applied++;
      });
    }
    supa.setSuppressPush(false);
    cb(true, applied);
  }).catch(err => { supa.setSuppressPush(false); console.warn('[cloudbase] pull failed', err); cb(false, 0); });
}

/* ============ 订单管理 ============ */

/**
 * 保存订单（多产品行）—— 与网页版 saveOrderRecord 一致
 * 每行产品生成一条独立记录
 * @param {object} base 订单公共字段
 * @param {Array} products 产品行数组
 */
function saveOrder(base, products) {
  const saved = [];
  (products || []).forEach((p) => {
    const rec = {
      // uid() 带随机后缀，避免同一毫秒内多行产品 id 冲突
      id: uid('ord_'),
      orderDate: base.orderDate || '',
      customer: base.customer || '',
      orderNo: base.orderNo || '',
      deliveryDate: base.deliveryDate || '',
      tradeTerms: base.tradeTerms || '',
      paymentMethod: base.paymentMethod || '',
      transportMethod: base.transportMethod || '',
      currency: base.currency || 'USD',
      packing: base.packing || '',
      remark: base.remark || '',
      status: '待生产',
      productName: p.productName || '',
      spec: p.spec || '',
      drawingNo: p.drawingNo || '',
      plating: p.plating || '',
      logo: p.logo || '',
      unit: p.unit || '',
      unitPrice: r2(p.unitPrice),
      quantity: num(p.quantity),
      amount: r2(num(p.unitPrice) * num(p.quantity)),
      createdAt: new Date().toISOString()
    };
    data.orderRecords.push(rec);
    saved.push(rec);
  });
  save('orderRecords');
  return saved;
}

/** 更新订单（按 id） */
function updateOrder(id, patch) {
  const r = data.orderRecords.find(x => String(x.id) === String(id));
  if (!r) return null;
  Object.assign(r, patch);
  if (patch.unitPrice !== undefined || patch.quantity !== undefined) {
    r.amount = r2(num(r.unitPrice) * num(r.quantity));
  }
  save('orderRecords');
  return r;
}

function deleteOrder(id) {
  data.orderRecords = data.orderRecords.filter(x => String(x.id) !== String(id));
  save('orderRecords');
}

/** 按订单号聚合订单（同一订单号可能有多条产品行） */
function groupOrdersByNo() {
  const map = {};
  data.orderRecords.forEach(o => {
    const no = String(o.orderNo || '').trim();
    if (!no) return;
    if (!map[no]) map[no] = { orderNo: no, rows: [], amount: 0, customer: o.customer, currency: o.currency, status: o.status, deliveryDate: o.deliveryDate, orderDate: o.orderDate, paymentMethod: o.paymentMethod, tradeTerms: o.tradeTerms };
    map[no].rows.push(o);
    map[no].amount += num(o.amount);
    // 状态取最新（已出货 > 生产中 > 待生产）
    const rank = { '待生产': 1, '生产中': 2, '已出货': 3 };
    if ((rank[o.status] || 0) > (rank[map[no].status] || 0)) map[no].status = o.status;
  });
  return map;
}

/* ============ 出口管理 ============ */

/**
 * 保存出口记录 —— 与网页版 saveExportRecord 一致
 * 字段映射：shipmentNo→shippingNo、vesselVoyage→shipName、containerSeal→containerNo
 * 多订单号数组 → ', ' 拼接
 */
function saveExport(form, id) {
  const orderNos = Array.isArray(form.orderNo) ? form.orderNo.join(', ') : String(form.orderNo || '');
  const rec = {
    id: id || uid('exp_'),
    status: form.status || '未开票',
    exportDate: form.exportDate || '',
    arrivalDate: form.arrivalDate || '',
    customer: form.customer || '',
    quantity: r2(form.quantity),
    orderNo: orderNos,
    shippingNo: form.shipmentNo || form.shippingNo || '',
    shipName: form.vesselVoyage || form.shipName || '',
    containerNo: form.containerSeal || form.containerNo || '',
    billNo: form.billNo || '',
    declarationAmount: r2(form.declarationAmount),
    remark: form.remark || '',
    createdAt: new Date().toISOString()
  };
  if (id) {
    const i = data.exportRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.exportRecords[i] = Object.assign({}, data.exportRecords[i], rec);
  } else {
    data.exportRecords.push(rec);
  }
  save('exportRecords');
  // 出口后同步订单状态为「已出货」
  updateOrderStatusBasedOnExport(orderNos);
  return rec;
}

/** 出口订单号对应的订单状态置为「已出货」 */
function updateOrderStatusBasedOnExport(orderNoStr) {
  const nos = String(orderNoStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!nos.length) return;
  let changed = false;
  data.orderRecords.forEach(o => {
    if (nos.indexOf(String(o.orderNo || '').trim()) > -1 && o.status !== '已出货') {
      o.status = '已出货';
      changed = true;
    }
  });
  if (changed) save('orderRecords');
}

function deleteExport(id) {
  data.exportRecords = data.exportRecords.filter(x => String(x.id) !== String(id));
  save('exportRecords');
}

/* ============ 收汇管理 ============ */

/**
 * 保存收汇记录 —— 与网页版 saveReceiptRecord 一致
 * 有 id 走 update，否则新增；保存后订单从「待生产」→「生产中」
 */
function saveReceipt(form, id) {
  const rec = {
    id: id || uid('rcp_'),
    status: form.status || '未开票',
    customer: form.customer || '',
    orderNo: form.orderNo || '',
    receiptDate: form.receiptDate || '',
    amountReceived: r2(form.amountReceived),
    fee: r2(form.fee),
    currency: form.currency || 'USD',
    exchangeRate: num(form.exchangeRate) || FIXED_RATES[form.currency || 'USD'] || 1,
    rate: num(form.rate),
    remark: form.remark || '',
    createdAt: new Date().toISOString()
  };
  if (id) {
    const i = data.receiptRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.receiptRecords[i] = Object.assign({}, data.receiptRecords[i], rec);
  } else {
    data.receiptRecords.push(rec);
  }
  save('receiptRecords');
  updateOrderStatusForReceipt(rec.orderNo);
  return rec;
}

/** 收到预付款/定金后，订单由「待生产」推进为「生产中」 */
function updateOrderStatusForReceipt(orderNo) {
  const no = String(orderNo || '').trim();
  if (!no) return;
  let changed = false;
  data.orderRecords.forEach(o => {
    if (String(o.orderNo || '').trim() === no && o.status === '待生产') {
      o.status = '生产中';
      changed = true;
    }
  });
  if (changed) save('orderRecords');
}

function deleteReceipt(id) {
  data.receiptRecords = data.receiptRecords.filter(x => String(x.id) !== String(id));
  save('receiptRecords');
}

/* ============ 发票管理 ============ */

function saveInvoice(form, id) {
  const rec = {
    id: id || uid('inv_'),
    status: form.status || '未收款',
    customer: form.customer || '',
    orderNo: form.orderNo || '',
    productName: form.productName || '',
    shippingNo: form.shipmentNo || form.shippingNo || '',
    payer: form.payer || '',
    payee: form.payee || '',
    receiptTotal: r2(form.receiptTotal),
    invoiceDate: form.invoiceDate || '',
    quantity: num(form.quantity),
    unitPrice: r2(form.unitPrice),
    amount: r2(form.amount),
    agentFee: r2(form.agentFee),
    domesticFreight: r2(form.domesticFreight),
    overseasFreight: r2(form.overseasFreight),
    remark: form.remark || '',
    createdAt: new Date().toISOString()
  };
  if (id) {
    const i = data.invoiceRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.invoiceRecords[i] = Object.assign({}, data.invoiceRecords[i], rec);
  } else {
    data.invoiceRecords.push(rec);
  }
  save('invoiceRecords');
  return rec;
}

function deleteInvoice(id) {
  data.invoiceRecords = data.invoiceRecords.filter(x => String(x.id) !== String(id));
  save('invoiceRecords');
}

/* ============ 账务管理（付款） ============ */

function savePayment(form, id) {
  const rec = {
    id: id || uid('pay_'),
    customer: form.customer || '',
    orderNo: form.orderNo || '',
    paymentDate: form.paymentDate || '',
    amount: r2(form.amount),
    paymentMethod: form.paymentMethod || '',
    payer: form.payer || '',
    recipient: form.recipient || '',
    remark: form.remark || '',
    createdAt: new Date().toISOString()
  };
  if (id) {
    const i = data.indexPaymentRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.indexPaymentRecords[i] = Object.assign({}, data.indexPaymentRecords[i], rec);
  } else {
    data.indexPaymentRecords.push(rec);
  }
  save('indexPaymentRecords');
  return rec;
}

function deletePayment(id) {
  data.indexPaymentRecords = data.indexPaymentRecords.filter(x => String(x.id) !== String(id));
  save('indexPaymentRecords');
}

/* ============ 备忘录 ============ */

function addMemo() {
  const now = new Date().toLocaleString('zh-CN');
  const memo = {
    // 注意：不能只用 Date.now()——同一毫秒内连续新建会产生重复 id，
    // 导致后续 saveMemoEdit/deleteMemo 命中错误的记录。
    id: uid('memo_'),
    title: '',
    content: '',
    color: MEMO_COLORS[0].value,
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  data.memoRecords.push(memo);
  save('memoRecords');
  return memo;
}

function saveMemoEdit(id, title, content, color) {
  const m = data.memoRecords.find(x => String(x.id) === String(id));
  if (!m) return;
  m.title = title;
  m.content = content;
  m.color = color;
  m.updatedAt = new Date().toLocaleString('zh-CN');
  save('memoRecords');
}

function toggleMemoPin(id) {
  const m = data.memoRecords.find(x => String(x.id) === String(id));
  if (!m) return;
  m.pinned = !m.pinned;
  m.updatedAt = new Date().toLocaleString('zh-CN');
  save('memoRecords');
}

function deleteMemo(id) {
  data.memoRecords = data.memoRecords.filter(x => String(x.id) !== String(id));
  save('memoRecords');
}

/** 备忘录列表：搜索 → 排序（置顶优先，再按更新时间倒序） */
function queryMemos(searchTerm) {
  const kw = String(searchTerm || '').toLowerCase().trim();
  return data.memoRecords
    .filter(m => !kw || String(m.title || '').toLowerCase().indexOf(kw) > -1 || String(m.content || '').toLowerCase().indexOf(kw) > -1)
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
}

/* ============ 业务跟踪 ============ */

/**
 * 保存业务跟踪记录 —— 与网页版 saveBusinessRecord 一致
 * 保存后自动处理「同跟进单号」状态（保留最新状态，其余置「已回复」）
 */
function saveBusiness(form, id) {
  const rec = {
    id: id || uid('biz_'),
    customerName: form.customerName || '',
    contact: form.contact || '',
    phone: form.phone || '',
    email: form.email || '',
    address: form.address || '',
    industry: form.industry || '',
    status: form.status || BUSINESS_STATUS[0],
    contactDate: form.contactDate || '',
    followupNo: form.followupNo || '',
    quoteNo: form.quoteNo || '',
    nextFollowup: form.nextFollowup || '',
    needs: form.needs || '',
    contactRecords: form.contactRecords || [],
    lastContactDate: form.lastContactDate || form.contactDate || '',
    updatedAt: new Date().toISOString()
  };
  if (id) {
    const i = data.businessRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.businessRecords[i] = Object.assign({}, data.businessRecords[i], rec);
  } else {
    data.businessRecords.push(rec);
  }
  save('businessRecords');
  autoUpdateSameFollowupNoStatus(rec.id);
  return rec;
}

/**
 * 同跟进单号状态自动处理 —— 与网页版 autoUpdateSameFollowupNoStatus 一致
 * 按 followupNo 分组，≥2 条时按 contactDate 降序，保留最新状态，其余置「已回复」
 * @param {string} editingId 当前正在编辑的记录 id（不修改它）
 */
function autoUpdateSameFollowupNoStatus(editingId) {
  const groups = {};
  data.businessRecords.forEach(r => {
    const no = String(r.followupNo || '').trim();
    if (!no) return;
    if (!groups[no]) groups[no] = [];
    groups[no].push(r);
  });
  let changed = false;
  Object.keys(groups).forEach(no => {
    const list = groups[no];
    if (list.length < 2) return;
    list.sort((a, b) => String(b.contactDate || '').localeCompare(String(a.contactDate || '')));
    list.forEach((r, idx) => {
      if (idx === 0) return; // 最新一条保留自身状态
      if (editingId && String(r.id) === String(editingId)) return;
      if (r.status !== '已回复') { r.status = '已回复'; changed = true; }
    });
  });
  if (changed) save('businessRecords');
}

function deleteBusiness(id) {
  data.businessRecords = data.businessRecords.filter(x => String(x.id) !== String(id));
  save('businessRecords');
}

/** 判断业务记录是否需要提醒（同跟进单号最后一条且 nextFollowup >= 今天） */
function isBusinessLastOfGroup(rec) {
  const no = String(rec.followupNo || '').trim();
  if (!no) return true;
  const list = data.businessRecords.filter(r => String(r.followupNo || '').trim() === no);
  if (list.length < 2) return true;
  const sorted = list.slice().sort((a, b) => String(b.contactDate || '').localeCompare(String(a.contactDate || '')));
  return String(sorted[0].id) === String(rec.id);
}

/* ============ 客户信息 ============ */

function saveCustomer(form, id) {
  const rec = {
    id: id || uid('cus_'),
    customerName: form.customerName || '',
    customerType: form.customerType || '客户',
    region: form.region || '',
    contactName: form.contactName || '',
    phone: form.phone || '',
    email: form.email || '',
    address: form.address || '',
    contactTitle: form.contactTitle || '',
    website: form.website || '',
    tags: form.tags || '',
    remark: form.remark || '',
    createdAt: form.createdAt || fmt.today(),
    priority: !!form.priority
  };
  if (id) {
    const i = data.customerRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) data.customerRecords[i] = Object.assign({}, data.customerRecords[i], rec);
  } else {
    data.customerRecords.push(rec);
  }
  save('customerRecords');
  return rec;
}

function deleteCustomer(id) {
  data.customerRecords = data.customerRecords.filter(x => String(x.id) !== String(id));
  save('customerRecords');
}

function toggleCustomerPriority(id) {
  const c = data.customerRecords.find(x => String(x.id) === String(id));
  if (!c) return;
  c.priority = !c.priority;
  save('customerRecords');
}

/* ============ 报表统计 ============ */

/**
 * 收汇 / 付款统计 —— 与网页版 updateReportStatistics 一致
 * 收汇：按 (amountReceived - fee) * exchangeRate 累加，按 receiptDate 归集
 * 付款：按 amount 累加，按 paymentDate 归集
 */
function getReportStatistics() {
  const now = new Date();
  const ymPrefix = now.getFullYear() + '-' + fmt.pad(now.getMonth() + 1);
  const yPrefix = String(now.getFullYear());

  let monthlyReceipt = 0, yearlyReceipt = 0, totalReceipt = 0;
  let monthlyPayment = 0, yearlyPayment = 0, totalPayment = 0;

  data.receiptRecords.forEach(r => {
    const cny = (num(r.amountReceived) - num(r.fee)) * (num(r.exchangeRate) || 1);
    totalReceipt += cny;
    const d = String(r.receiptDate || '');
    if (d.indexOf(ymPrefix) === 0) monthlyReceipt += cny;
    if (d.indexOf(yPrefix) === 0) yearlyReceipt += cny;
  });

  data.indexPaymentRecords.forEach(p => {
    const amt = num(p.amount);
    totalPayment += amt;
    const d = String(p.paymentDate || '');
    if (d.indexOf(ymPrefix) === 0) monthlyPayment += amt;
    if (d.indexOf(yPrefix) === 0) yearlyPayment += amt;
  });

  return {
    monthlyReceipt: r2(monthlyReceipt),
    yearlyReceipt: r2(yearlyReceipt),
    totalReceipt: r2(totalReceipt),
    monthlyPayment: r2(monthlyPayment),
    yearlyPayment: r2(yearlyPayment),
    totalPayment: r2(totalPayment)
  };
}

/**
 * 订单动态提醒 —— 与网页版 generateOrderReminders 一致
 * 按订单号分组，检查收汇/付款/出口/发票缺失情况
 * @returns {Array<{type,icon,text,orderNo}>} type: warning|info|success|error
 */
function generateOrderReminders() {
  const grouped = {};
  function ensure(orderNo) {
    const no = String(orderNo || '').trim();
    if (!no) return null;
    if (!grouped[no]) grouped[no] = { orderNo: no, order: null, receipt: [], payment: [], export: [], invoice: [] };
    return grouped[no];
  }

  data.orderRecords.forEach(o => { const g = ensure(o.orderNo); if (g && !g.order) g.order = o; });
  data.receiptRecords.forEach(r => { const g = ensure(r.orderNo); if (g) g.receipt.push(r); });
  data.indexPaymentRecords.forEach(p => { const g = ensure(p.orderNo); if (g) g.payment.push(p); });
  data.exportRecords.forEach(e => {
    String(e.orderNo || '').split(',').map(s => s.trim()).filter(Boolean).forEach(no => {
      const g = ensure(no); if (g) g.export.push(e);
    });
  });
  data.invoiceRecords.forEach(v => { const g = ensure(v.orderNo); if (g) g.invoice.push(v); });

  const reminders = [];
  Object.keys(grouped).forEach(no => {
    const g = grouped[no];
    const order = g.order;

    if (!order) {
      reminders.push({ type: 'warning', icon: '⚠️', orderNo: no, text: '订单 ' + no + ' 存在收汇/出口/发票/付款记录，但缺少订单记录' });
      return;
    }
    if (g.receipt.length === 0) {
      reminders.push({ type: 'info', icon: 'ℹ️', orderNo: no, text: '订单 ' + no + '（' + (order.customer || '-') + '）尚未收到任何款项' });
    }
    if (order.status === '待生产' || order.status === '生产中') {
      reminders.push({ type: 'warning', icon: '⚠️', orderNo: no, text: '订单 ' + no + '（' + (order.customer || '-') + '）状态为「' + order.status + '」，请跟进生产进度' });
    }
    if (g.export.length === 0 && (order.status === '已出货' || g.receipt.length > 0)) {
      reminders.push({ type: 'warning', icon: '⚠️', orderNo: no, text: '订单 ' + no + ' 已有收汇或已出货，但缺少出口记录' });
    }
    if (g.invoice.length === 0 && g.receipt.length > 0) {
      reminders.push({ type: 'info', icon: 'ℹ️', orderNo: no, text: '订单 ' + no + ' 已有收汇，但尚未开具发票' });
    }
    if (g.payment.length === 0 && g.receipt.length > 0) {
      reminders.push({ type: 'info', icon: 'ℹ️', orderNo: no, text: '订单 ' + no + ' 已有收汇，但缺少付款（成本）记录' });
    }
    if (order.paymentMethod === '预付款' && g.export.length === 0) {
      reminders.push({ type: 'success', icon: '✅', orderNo: no, text: '订单 ' + no + ' 为预付款订单，尚未出货，请留意交货期' });
    }
  });

  // 未分组（无收汇/出口/发票/付款）且处于待生产/生产中的订单
  data.orderRecords.forEach(o => {
    const no = String(o.orderNo || '').trim();
    if (!no) return;
    const g = grouped[no];
    if (g && (g.receipt.length || g.export.length || g.invoice.length || g.payment.length)) return;
    if (o.status === '待生产' || o.status === '生产中') {
      if (reminders.some(r => r.orderNo === no && r.type === 'warning' && r.text.indexOf('请跟进生产进度') > -1)) return;
      reminders.push({ type: 'info', icon: 'ℹ️', orderNo: no, text: '订单 ' + no + '（' + (o.customer || '-') + '）状态为「' + o.status + '」，暂无收汇/出口/发票/付款记录' });
    }
  });

  return reminders;
}

/**
 * 欠款统计 —— 与网页版 generateDebtStatistics 一致
 * 1) 订单金额按订单号聚合
 * 2) 收汇按 (amountReceived - fee) * exchangeRate 转 CNY
 * 3) 外币订单用该订单收汇平均汇率折算 CNY
 * 4) 已收 < 订单金额则列入欠款；待生产/生产中且无收汇 → 欠款 = 全款
 * @returns {Array<{orderNo,customer,currency,orderAmount,totalReceived,debtAmount,createTime}>}
 */
function generateDebtStatistics() {
  const orderMap = {};
  data.orderRecords.forEach(o => {
    const no = String(o.orderNo || '').trim();
    if (!no) return;
    if (!orderMap[no]) {
      orderMap[no] = { orderNo: no, customer: o.customer || '', currency: o.currency || 'USD', orderAmount: 0, createTime: o.orderDate || '', status: o.status || '', rows: [] };
    }
    orderMap[no].orderAmount += num(o.amount);
    orderMap[no].rows.push(o);
    const rank = { '待生产': 1, '生产中': 2, '已出货': 3 };
    if ((rank[o.status] || 0) > (rank[orderMap[no].status] || 0)) orderMap[no].status = o.status;
  });

  // 收汇按订单号聚合
  const receiptMap = {};
  data.receiptRecords.forEach(r => {
    const no = String(r.orderNo || '').trim();
    if (!no) return;
    if (!receiptMap[no]) receiptMap[no] = [];
    receiptMap[no].push(r);
  });

  const debts = [];
  Object.keys(orderMap).forEach(no => {
    const o = orderMap[no];
    const receipts = receiptMap[no] || [];
    const currency = o.currency || 'USD';
    const fixedRate = FIXED_RATES[currency] || 1;

    // 累计收汇（原币）与手续费（原币）
    let totalReceived = 0, totalFee = 0, cnyReceived = 0, rateSum = 0, rateCount = 0;
    receipts.forEach(r => {
      totalReceived += num(r.amountReceived);
      totalFee += num(r.fee);
      cnyReceived += (num(r.amountReceived) - num(r.fee)) * (num(r.exchangeRate) || 1);
      if (num(r.exchangeRate) > 0) { rateSum += num(r.exchangeRate); rateCount++; }
    });
    const avgRate = rateCount > 0 ? rateSum / rateCount : fixedRate;

    // 订单金额折算为订单货币
    const orderAmount = r2(o.orderAmount);
    // 累计收汇（折算为订单货币）
    let receivedInOrderCurrency;
    if (currency === 'CNY') {
      receivedInOrderCurrency = cnyReceived;
    } else if (rateCount > 0) {
      receivedInOrderCurrency = totalReceived - totalFee;
    } else {
      // 收汇未填汇率：若收汇货币为 CNY，则按固定汇率折算
      receivedInOrderCurrency = cnyReceived / fixedRate;
    }
    // 若无收汇：待生产/生产中计入全款欠款
    if (receipts.length === 0) {
      if (o.status === '待生产' || o.status === '生产中' || o.status === '') {
        debts.push({
          orderNo: no, customer: o.customer, currency: currency,
          orderAmount: orderAmount, totalReceived: 0, debtAmount: orderAmount,
          createTime: o.createTime, status: o.status
        });
      }
      return;
    }
    const debtAmount = r2(orderAmount - receivedInOrderCurrency - totalFee);
    if (receivedInOrderCurrency < orderAmount - 0.01) {
      debts.push({
        orderNo: no, customer: o.customer, currency: currency,
        orderAmount: orderAmount, totalReceived: r2(receivedInOrderCurrency),
        debtAmount: debtAmount > 0 ? debtAmount : 0,
        createTime: o.createTime, status: o.status
      });
    }
  });

  return debts.sort((a, b) => b.debtAmount - a.debtAmount);
}

/** 欠款合计（折算 CNY） */
function getTotalDebtCNY(debts) {
  const list = debts || generateDebtStatistics();
  return r2(list.reduce((s, d) => s + num(d.debtAmount) * (FIXED_RATES[d.currency] || 1), 0));
}

/* ============ 客户统计（与网页版 updateCustomerStats 一致） ============ */

/**
 * 按 客户 + 币种 汇总订单金额，折算 CNY 并计算占比
 * @param {string} year 'all' 或四位年份（按 orderDate 筛选）
 * @returns {{rows: Array, totalCNY: number, years: number[]}}
 */
function getCustomerStats(year) {
  const groups = {};
  const yearSet = {};

  data.orderRecords.forEach(o => {
    const dStr = fmt.fmtDate(o.orderDate);
    if (dStr) yearSet[dStr.slice(0, 4)] = true;
    if (!o.customer) return;
    if (year && year !== 'all' && dStr.slice(0, 4) !== String(year)) return;

    const currency = o.currency || 'CNY';
    const amount = num(o.amount);
    if (!groups[o.customer]) groups[o.customer] = {};
    if (!groups[o.customer][currency]) groups[o.customer][currency] = 0;
    groups[o.customer][currency] += amount;
  });

  const rows = [];
  let totalCNY = 0;
  Object.keys(groups).forEach(customer => {
    Object.keys(groups[customer]).forEach(currency => {
      const amount = r2(groups[customer][currency]);
      const rate = FIXED_RATES[currency] || 1;
      const cnyAmount = r2(amount * rate);
      totalCNY += cnyAmount;
      rows.push({ customer, currency, amount, rate, cnyAmount });
    });
  });

  rows.sort((a, b) => b.cnyAmount - a.cnyAmount);
  rows.forEach(r => { r.percent = totalCNY > 0 ? r2(r.cnyAmount / totalCNY * 100) : 0; });

  return {
    rows,
    totalCNY: r2(totalCNY),
    years: Object.keys(yearSet).sort().reverse()
  };
}

/* ============ 出货与报关（参考网页版 customs-doc-generator） ============ */

/** 生成下一个运编号：EX-YY-XXXX（按年份内序号递增） */
function nextShipmentNo() {
  const yy = String(new Date().getFullYear()).slice(2);
  const prefix = 'EX-' + yy + '-';
  let max = 0;
  data.customsRecords.forEach(r => {
    const m = String(r.shipmentNo || '').match(/^EX-\d{2}-(\d+)$/);
    if (m && +m[1] > max) max = +m[1];
  });
  return prefix + String(max + 1).padStart(4, '0');
}

/**
 * 保存出货与报关记录（含产品明细行）
 * @param {object} form 单据头字段
 * @param {Array} items 产品明细
 * @param {string} id 有 id 为更新
 */
function saveCustoms(form, items, id) {
  const list = (items || []).map(p => ({
    orderNo: p.orderNo || '',
    hsCode: p.hsCode || '',
    description: p.description || '',
    drawingNo: p.drawingNo || '',
    spec: p.spec || '',
    projectNo: p.projectNo || '',
    qtyCrate: num(p.qtyCrate),
    unit: p.unit || '',
    quantity: num(p.quantity),
    unitPrice: r2(p.unitPrice),
    amount: r2(num(p.unitPrice) * num(p.quantity)),
    nw: r2(p.nw),
    gw: r2(p.gw),
    volume: r2(p.volume)
  }));
  const totalAmount = r2(list.reduce((s, p) => s + p.amount, 0));
  const totalQty = r2(list.reduce((s, p) => s + p.quantity, 0));
  const totalNw = r2(list.reduce((s, p) => s + p.nw, 0));
  const totalGw = r2(list.reduce((s, p) => s + p.gw, 0));
  const totalVolume = r2(list.reduce((s, p) => s + p.volume, 0));
  const totalCrates = r2(list.reduce((s, p) => s + p.qtyCrate, 0));
  const orderNos = Array.from(new Set(list.map(p => p.orderNo).filter(Boolean))).join(', ');

  const rec = {
    id: id || uid('cus_'),
    shipmentNo: form.shipmentNo || '',
    departureDate: form.departureDate || '',
    shipper: form.shipper || '',
    seller: form.seller || '',
    consignee: form.consignee || '',
    customer: form.consignee || form.customer || '',
    terms: form.terms || '',
    shippingMode: form.shippingMode || '',
    vessel: form.vessel || '',
    pol: form.pol || '',
    pod: form.pod || '',
    destination: form.destination || '',
    tradeType: form.tradeType || '一般贸易',
    paymentMode: form.paymentMode || '',
    boundaryPort: form.boundaryPort || '上海海关',
    billNo: form.billNo || '',
    contractNo: form.contractNo || '',
    packing: form.packing || '',
    currency: form.currency || 'USD',
    marks: form.marks || '',
    remarks: form.remarks || '',
    orderNos: orderNos,
    items: list,
    totalAmount: totalAmount,
    totalQty: totalQty,
    totalNw: totalNw,
    totalGw: totalGw,
    totalVolume: totalVolume,
    totalCrates: totalCrates,
    updatedAt: new Date().toISOString()
  };

  if (id) {
    const i = data.customsRecords.findIndex(x => String(x.id) === String(id));
    if (i > -1) {
      rec.createdAt = data.customsRecords[i].createdAt || rec.updatedAt;
      data.customsRecords[i] = rec;
    } else {
      rec.createdAt = rec.updatedAt;
      data.customsRecords.push(rec);
    }
  } else {
    rec.createdAt = rec.updatedAt;
    data.customsRecords.push(rec);
  }
  save('customsRecords');
  return rec;
}

function deleteCustoms(id) {
  data.customsRecords = data.customsRecords.filter(x => String(x.id) !== String(id));
  save('customsRecords');
}

/* ============ 备份 / 恢复 ============ */

function exportBackup() {
  // 与网页版（apps/wicketorders/index.html 数据备份）一致的包格式：
  // {backupTime, version:'1.1', data:{orderRecords..., paymentRecords(=indexPaymentRecords)}}
  // 网页端可直接导入本文件；本端导入同时兼容网页版与小程序旧版（平铺）两种格式
  const d = { backupTime: new Date().toISOString(), version: '1.1', data: {} };
  Object.keys(KEYS).forEach(k => {
    d.data[k] = data[k];
    if (k === 'indexPaymentRecords') d.data.paymentRecords = data[k]; // 网页版键名
  });
  return d;
}

function importBackup(obj) {
  if (!obj || typeof obj !== 'object') return false;
  let src = obj;
  // 网页版/新版包格式：{backupTime, version, data:{...}} → 解包
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    src = Object.assign({}, obj.data);
    // 网页版把 indexPaymentRecords 存为 paymentRecords
    if (!Array.isArray(src.indexPaymentRecords) && Array.isArray(src.paymentRecords)) {
      src.indexPaymentRecords = src.paymentRecords;
    }
  }
  let count = 0;
  Object.keys(KEYS).forEach(k => {
    if (Array.isArray(src[k])) { data[k] = src[k]; save(k); count++; }
  });
  return count > 0;
}

/* ============ 导出 ============ */

module.exports = {
  data: data,
  KEYS: KEYS,
  FIXED_RATES: FIXED_RATES,
  CURRENCIES: CURRENCIES,
  MEMO_COLORS: MEMO_COLORS,
  BUSINESS_STATUS: BUSINESS_STATUS,
  FEEDBACK_TYPES: FEEDBACK_TYPES,
  ORDER_STATUS: ORDER_STATUS,
  PAYMENT_METHODS: PAYMENT_METHODS,
  TRADE_TERMS: TRADE_TERMS,
  TRANSPORT_METHODS: TRANSPORT_METHODS,
  LOGO_OPTIONS: LOGO_OPTIONS,
  UNIT_OPTIONS: UNIT_OPTIONS,
  uid: uid,
  num: num,
  r2: r2,
  loadAll: loadAll,
  save: save,
  syncFromCloud: syncFromCloud,
  // 订单
  saveOrder, updateOrder, deleteOrder, groupOrdersByNo,
  // 出口
  saveExport, deleteExport, updateOrderStatusBasedOnExport,
  // 收汇
  saveReceipt, deleteReceipt, updateOrderStatusForReceipt,
  // 发票
  saveInvoice, deleteInvoice,
  // 账务
  savePayment, deletePayment,
  // 备忘录
  addMemo, saveMemoEdit, toggleMemoPin, deleteMemo, queryMemos,
  // 业务跟踪
  saveBusiness, deleteBusiness, autoUpdateSameFollowupNoStatus, isBusinessLastOfGroup,
  // 客户
  saveCustomer, deleteCustomer, toggleCustomerPriority,
  // 报表
  getReportStatistics, generateOrderReminders, generateDebtStatistics, getTotalDebtCNY,
  // 客户统计
  getCustomerStats,
  // 出货与报关
  nextShipmentNo, saveCustoms, deleteCustoms,
  // 备份
  exportBackup, importBackup
};
