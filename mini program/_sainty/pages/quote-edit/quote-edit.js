/**
 * 报价单编辑 / 生成 PDF 发送
 * 数据键 fashion_quotations（数组）、fashion_quotation_settings（对象）
 * 与桌面端 apps/saintysys/quotation.html 完全互通。
 */
const db = require('../../utils/db');
const quoteRender = require('../../utils/quote-render');
const pdfShare = require('../../utils/pdf-share');

const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
const STATUS_LABELS = ['草稿 Draft', '已发送 Sent', '已接受 Accepted', '已拒绝 Rejected', '已过期 Expired'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD', 'HKD'];
const SEASONS = ['', 'SS2026', 'FW2026', 'SS2027', 'FW2027'];

function emptyItem() {
  return { styleNo: '', productName: '', description: '', fabric: '', colors: '', sizes: '', moq: '', unitPrice: '', total: '0.00' };
}
function uid() { return 'qt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(dateStr, days) {
  const d = new Date((dateStr || today()) + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function genQuoteNo() {
  const now = new Date();
  const ym = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0');
  return 'QTSTIG' + ym + Math.floor(1000 + Math.random() * 9000);
}
function fmt(n) {
  return (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Page({
  data: {
    isNew: true,
    id: '',
    quoteNo: '', quoteDate: '', validUntil: '',
    seasons: SEASONS, seasonIndex: 0,
    statuses: STATUS_LABELS, statusIndex: 0,

    contacts: [], contactNames: [], contactIndex: -1,
    customerCompany: '', customerName: '', customerEmail: '', customerPhone: '', customerAddress: '',

    items: [],
    styleLib: [], styleLibNames: [],

    currencies: CURRENCIES, currencyIndex: 0,
    discount: '0', discountTypeIndex: 0,
    hangerCost: '',

    paymentTerms: '', deliveryTerms: '', leadTime: '', notes: '',

    subtotal: '0.00', discountAmount: '0.00', hangerAmount: '0.00', grandTotal: '0.00',
    totalQty: '0',
    busy: false
  },

  onLoad(options) {
    const settings = db.get('fashion_quotation_settings') || {};
    this.settings = settings;

    if (options && options.id) {
      const q = (db.get('fashion_quotations') || []).find(r => r.id === options.id);
      if (q) {
        this.loadQuote(q);
        wx.setNavigationBarTitle({ title: '编辑报价单' });
      } else {
        wx.showToast({ title: '报价单不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
      }
    } else {
      this.loadNew(settings);
      wx.setNavigationBarTitle({ title: '新建报价单' });
    }
    this.buildContacts();
    this.buildStyleLib();
  },

  loadNew(s) {
    this.setData({
      isNew: true,
      id: '',
      quoteNo: genQuoteNo(),
      quoteDate: today(),
      validUntil: addDays(today(), parseInt(s.defaultValidity, 10) || 30),
      seasonIndex: 0,
      statusIndex: 0,
      customerCompany: s.custCompany || '',
      customerName: s.custContact || '',
      customerEmail: s.custEmail || '',
      customerPhone: s.custPhone || '',
      customerAddress: s.custAddress || '',
      items: [emptyItem()],
      currencyIndex: Math.max(0, CURRENCIES.indexOf(s.defaultCurrency || 'USD')),
      discount: String(s.defaultDiscount || 0),
      discountTypeIndex: 0,
      hangerCost: String(s.defaultHangerCost != null ? s.defaultHangerCost : 1.1),
      paymentTerms: s.defaultPaymentTerms || '',
      deliveryTerms: s.defaultDeliveryTerms || '',
      leadTime: s.defaultLeadTime || '',
      notes: s.defaultNotes || ''
    });
    this.recalc();
  },

  loadQuote(q) {
    const items = (q.items && q.items.length ? q.items : [emptyItem()]).map(it => ({
      styleNo: it.styleNo || '', productName: it.productName || '', description: it.description || '',
      fabric: it.fabric || '', colors: it.colors || '', sizes: it.sizes || '',
      moq: it.moq != null ? String(it.moq) : '', unitPrice: it.unitPrice != null ? String(it.unitPrice) : '',
      total: fmt(it.total)
    }));
    this.setData({
      isNew: false,
      id: q.id,
      quoteNo: q.quoteNo || genQuoteNo(),
      quoteDate: q.quoteDate || today(),
      validUntil: q.validUntil || addDays(today(), 30),
      seasonIndex: Math.max(0, SEASONS.indexOf(q.season || '')),
      statusIndex: Math.max(0, STATUSES.indexOf(q.status || 'draft')),
      customerCompany: q.customerCompany || '',
      customerName: q.customerName || '',
      customerEmail: q.customerEmail || '',
      customerPhone: q.customerPhone || '',
      customerAddress: q.customerAddress || '',
      items,
      currencyIndex: Math.max(0, CURRENCIES.indexOf(q.currency || 'USD')),
      discount: String(q.discount != null ? q.discount : 0),
      discountTypeIndex: q.discountType === 'amount' ? 1 : 0,
      hangerCost: String(q.hangerCost != null ? q.hangerCost : 0),
      paymentTerms: q.paymentTerms || '',
      deliveryTerms: q.deliveryTerms || '',
      leadTime: q.leadTime || '',
      notes: q.notes || ''
    });
    this.recalc();
  },

  /* ---------- 通讯录客户速填 ---------- */
  buildContacts() {
    const list = (db.get('contacts') || []).filter(c => !c.type || c.type === '客户' || /customer/i.test(c.type || ''));
    this.setData({
      contacts: list,
      contactNames: list.map(c => c.name + (c.contactPerson ? ' / ' + c.contactPerson : ''))
    });
  },
  onContactPick(e) {
    const i = Number(e.detail.value);
    const c = this.data.contacts[i];
    if (!c) return;
    this.setData({
      contactIndex: i,
      customerCompany: c.name || '',
      customerName: c.contactPerson || '',
      customerEmail: c.email || '',
      customerPhone: c.phone || '',
      customerAddress: c.address || ''
    });
  },

  /* ---------- 款号库：历史报价 + 订单，供速填 ---------- */
  buildStyleLib() {
    const map = {};
    const lib = [];
    const push = (e) => {
      const key = (e.styleNo || '').trim();
      if (!key || map[key]) return;
      map[key] = 1;
      lib.push(e);
    };
    (db.get('fashion_quotations') || []).forEach(q => (q.items || []).forEach(it => {
      if (it.styleNo) push({
        styleNo: it.styleNo, productName: it.productName || '', description: it.description || '',
        fabric: it.fabric || '', colors: it.colors || '', sizes: it.sizes || '',
        moq: it.moq || '', unitPrice: it.unitPrice || ''
      });
    }));
    (db.get('orders') || []).forEach(o => {
      if (o.styleNo) push({
        styleNo: o.styleNo, productName: '', description: '',
        fabric: o.fabricComposition || '', colors: '', sizes: '',
        moq: o.quantity || '', unitPrice: o.unitPrice || ''
      });
    });
    this.setData({
      styleLib: lib,
      styleLibNames: lib.map(e => e.styleNo +
        (e.productName ? ' · ' + e.productName : (e.fabric ? ' · ' + e.fabric : '')) +
        (e.unitPrice ? ' · $' + e.unitPrice : ''))
    });
  },
  onStylePick(e) {
    const rowIdx = Number(e.currentTarget.dataset.i);
    const libIdx = Number(e.detail.value);
    const src = this.data.styleLib[libIdx];
    if (!src) return;
    const patch = {};
    ['styleNo', 'productName', 'description', 'fabric', 'colors', 'sizes'].forEach(f => {
      if (src[f]) patch['items[' + rowIdx + '].' + f] = src[f];
    });
    if (src.moq) patch['items[' + rowIdx + '].moq'] = String(src.moq);
    if (src.unitPrice) patch['items[' + rowIdx + '].unitPrice'] = String(src.unitPrice);
    this.setData(patch);
    this.recalc();
  },

  /* ---------- 表单输入 ---------- */
  onField(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ [f]: e.detail.value });
    if (f === 'discount' || f === 'hangerCost' || f === 'discountTypeIndex') this.recalc();
  },
  onItem(e) {
    const i = e.currentTarget.dataset.i;
    const f = e.currentTarget.dataset.field;
    this.setData({ ['items[' + i + '].' + f]: e.detail.value });
    this.recalc();
  },
  onDate(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  onSeason(e) { this.setData({ seasonIndex: Number(e.detail.value) }); },
  onStatus(e) { this.setData({ statusIndex: Number(e.detail.value) }); },
  onCurrency(e) { this.setData({ currencyIndex: Number(e.detail.value) }); },
  setDiscountType(e) {
    this.setData({ discountTypeIndex: Number(e.currentTarget.dataset.v) });
    this.recalc();
  },

  addRow() {
    const items = this.data.items.concat(emptyItem());
    this.setData({ items });
  },
  delRow(e) {
    const i = Number(e.currentTarget.dataset.i);
    const items = this.data.items.slice();
    if (items.length <= 1) { wx.showToast({ title: '至少保留一行', icon: 'none' }); return; }
    items.splice(i, 1);
    this.setData({ items });
    this.recalc();
  },

  regenNo() {
    this.setData({ quoteNo: genQuoteNo() });
  },

  recalc() {
    let subtotal = 0, qty = 0;
    const totals = this.data.items.map((it, i) => {
      const moq = parseFloat(it.moq) || 0;
      const price = parseFloat(it.unitPrice) || 0;
      const t = moq * price;
      subtotal += t;
      qty += moq;
      return { i, t };
    });
    const patch = {};
    totals.forEach(({ i, t }) => { patch['items[' + i + '].total'] = fmt(t); });
    const discountVal = parseFloat(this.data.discount) || 0;
    const isPct = this.data.discountTypeIndex === 0;
    let discountAmount = isPct ? subtotal * discountVal / 100 : discountVal;
    if (discountAmount > subtotal) discountAmount = subtotal;
    const hanger = parseFloat(this.data.hangerCost) || 0;
    const hangerAmount = qty * hanger;
    patch.subtotal = fmt(subtotal);
    patch.discountAmount = fmt(discountAmount);
    patch.hangerAmount = fmt(hangerAmount);
    patch.grandTotal = fmt(subtotal - discountAmount + hangerAmount);
    patch.totalQty = String(qty);
    this.setData(patch);
  },

  /** 组装数据并保存；返回报价单对象 */
  collectAndSave() {
    const d = this.data;
    const items = d.items.map(it => {
      const moq = parseFloat(it.moq) || 0;
      const unitPrice = parseFloat(it.unitPrice) || 0;
      return {
        styleNo: (it.styleNo || '').trim(),
        productName: (it.productName || '').trim(),
        description: (it.description || '').trim(),
        fabric: (it.fabric || '').trim(),
        colors: (it.colors || '').trim(),
        sizes: (it.sizes || '').trim(),
        moq, unitPrice, total: moq * unitPrice
      };
    });
    if (!items.some(it => it.styleNo || it.productName)) {
      wx.showToast({ title: '请至少填写一行款号/品名', icon: 'none' });
      return null;
    }
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const discountVal = parseFloat(d.discount) || 0;
    const discountAmount = d.discountTypeIndex === 0 ? subtotal * discountVal / 100 : Math.min(discountVal, subtotal);
    const hangerCost = parseFloat(d.hangerCost) || 0;
    const totalQty = items.reduce((s, it) => s + it.moq, 0);
    const hangerAmount = totalQty * hangerCost;
    const nowIso = new Date().toISOString();
    const q = {
      id: d.id || uid(),
      quoteNo: (d.quoteNo || '').trim() || genQuoteNo(),
      quoteDate: d.quoteDate,
      validUntil: d.validUntil,
      customerName: d.customerName.trim(),
      customerCompany: d.customerCompany.trim(),
      customerAddress: d.customerAddress.trim(),
      customerContact: d.customerName.trim(),
      customerEmail: d.customerEmail.trim(),
      customerPhone: d.customerPhone.trim(),
      season: d.seasons[d.seasonIndex] || '',
      currency: d.currencies[d.currencyIndex],
      items, subtotal,
      discount: discountVal,
      discountType: d.discountTypeIndex === 0 ? 'percentage' : 'amount',
      discountAmount, hangerCost, hangerAmount,
      grandTotal: subtotal - discountAmount + hangerAmount,
      paymentTerms: d.paymentTerms,
      deliveryTerms: d.deliveryTerms,
      leadTime: d.leadTime,
      notes: d.notes,
      status: STATUSES[d.statusIndex],
      preparedBy: (this.settings && this.settings.userName) || 'User'
    };

    const arr = db.get('fashion_quotations') || [];
    const idx = arr.findIndex(r => r.id === q.id);
    if (idx >= 0) {
      q.createdAt = arr[idx].createdAt || nowIso;
      q.updatedAt = nowIso;
      arr[idx] = q;
    } else {
      q.createdAt = nowIso;
      q.updatedAt = nowIso;
      arr.push(q);
    }
    db.data['fashion_quotations'] = arr;
    db.save('fashion_quotations');
    return q;
  },

  onSave() {
    const q = this.collectAndSave();
    if (!q) return;
    this.setData({ id: q.id, isNew: false });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onSaveDefaults() {
    const d = this.data;
    const s = Object.assign({}, db.get('fashion_quotation_settings') || {}, {
      defaultCurrency: d.currencies[d.currencyIndex],
      defaultPaymentTerms: d.paymentTerms,
      defaultDeliveryTerms: d.deliveryTerms,
      defaultLeadTime: d.leadTime,
      defaultNotes: d.notes,
      defaultHangerCost: parseFloat(d.hangerCost) || 0,
      defaultDiscount: parseFloat(d.discount) || 0
    });
    db.data['fashion_quotation_settings'] = s;
    this.settings = s;
    db.save('fashion_quotation_settings');
    wx.showToast({ title: '条款已存为默认', icon: 'success' });
  },

  onSharePdf() {
    if (this.data.busy) return;
    const q = this.collectAndSave();
    if (!q) return;
    this.setData({ busy: true, id: q.id, isNew: false });

    const doc = Object.assign({}, q, {
      settings: this.settings || {},
      printDate: new Date().toLocaleDateString('en-US')
    });
    pdfShare.sharePages(
      quoteRender.renderQuote(doc),
      'Quotation_' + q.quoteNo,
      (ok) => {
        this.setData({ busy: false });
        if (ok) {
          // 成功发送后自动置为“已发送”
          if (q.status === 'draft') {
            const arr = db.get('fashion_quotations') || [];
            const row = arr.find(r => r.id === q.id);
            if (row) { row.status = 'sent'; row.updatedAt = new Date().toISOString(); db.save('fashion_quotations'); }
          }
          wx.showToast({ title: '报价单已发送', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        }
      },
      '正在生成报价单…'
    );
  }
});
