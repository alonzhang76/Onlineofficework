const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const pdfShare = require('../../../utils/pdf-share');
const docRenderers = require('../../../utils/doc-renderers');

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];

function pad2(n) { return String(n).padStart(2, '0'); }
function shiftDate(baseStr, days, months) {
  var d = baseStr ? new Date(baseStr + 'T00:00:00') : new Date();
  if (days) d.setDate(d.getDate() + days);
  if (months) d.setMonth(d.getMonth() + months);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function todayStr() { return shiftDate('', 0, 0); }
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round(num(v) * 100) / 100; }
function money(v) { return fmt.fmtMoney(r2(v)); }

function emptyLine() {
  return {
    productNo: '', productName: '', drawingNumber: '', specification: '',
    unit: '', quantity: '', unitPrice: '', currency: 'USD', remark: '',
    amountText: '0.00'
  };
}

Page({
  data: {
    isEdit: false,
    oldQuoteNo: '',
    companyIdx: 0,
    companyTabs: ['龙力', '普利美', '天梁'],

    header: {
      quoteNo: '', quoteDate: '', validUntil: '',
      customerCompany: '', customerContact: '', customerTel: '', customerEmail: '', customerAddress: '',
      deliveryMethod: '海运 | Sea Freight', deliveryLocation: '上海 | Shanghai',
      deliveryDate: '', deliveryRemarks: '',
      terms: 'EXW', paymentMethod: '电汇 | T/T', paymentRatio: '', taxRate: '13% (增值税)',
      bankAccountInfo: '', companyName: ''
    },

    units: [], terms: [], methods: [], ratios: [],
    deliveryMethods: db.QUOTE_DELIVERY_METHODS,
    deliveryLocations: db.QUOTE_DELIVERY_LOCATIONS,
    taxRates: db.QUOTE_TAX_RATES,
    currencies: CURRENCIES,

    unitIdx: -1, termsIdx: 0, methodIdx: 0, ratioIdx: -1,
    dmIdx: 2, dlIdx: 0, taxIdx: 0,

    customers: [], customerLabels: [], customerIdx: -1,
    productPicks: [], productLabels: [],

    products: [emptyLine()],

    subtotalText: '0.00', taxText: '0.00', totalText: '0.00',
    currencyLabel: 'USD'
  },

  onLoad(query) {
    db.ensureQuoteOptions();

    var units = db.getQuoteOptions('quotationSystemUnits');
    var terms = db.getQuoteOptions('quotationSystemTerms');
    var methods = db.getQuoteOptions('quotationSystemPaymentMethods');
    var ratios = db.getQuoteOptions('quotationSystemPaymentRatios');

    var customers = db.data.customerRecords.filter(function (c) { return !!c.customerName; });
    var customerLabels = customers.map(function (c) {
      return c.customerName + (c.contactName ? '（' + c.contactName + '）' : '') + (c.phone ? ' ' + c.phone : '');
    });

    var picks = db.quoteProductCandidates();
    var pickLabels = picks.map(function (p) {
      return (p.fromLib ? '📦 ' : '🕘 ') + p.productNo + ' ' + (p.productName || '') + (p.specification ? ' / ' + p.specification : '');
    });

    var base = {
      units: units, terms: terms, methods: methods, ratios: ratios,
      customers: customers, customerLabels: customerLabels,
      productPicks: picks, productLabels: pickLabels
    };

    if (query && query.no) {
      var q = db.getQuotation(decodeURIComponent(query.no));
      if (q) {
        this.loadExisting(q, base);
        return;
      }
    }
    this.loadNew(base);
  },

  loadNew(base) {
    var c0 = db.QUOTE_COMPANIES[0];
    var today = todayStr();
    var h = {
      quoteNo: db.nextQuoteNo(), quoteDate: today, validUntil: shiftDate(today, 0, 1),
      customerCompany: '', customerContact: '', customerTel: '', customerEmail: '', customerAddress: '',
      deliveryMethod: '海运 | Sea Freight', deliveryLocation: '上海 | Shanghai',
      deliveryDate: shiftDate(today, 60, 0), deliveryRemarks: '',
      terms: base.terms[0] || 'EXW',
      paymentMethod: base.methods[0] || '电汇 | T/T',
      paymentRatio: base.ratios[0] || '',
      taxRate: c0.tax, bankAccountInfo: c0.bank, companyName: c0.name
    };
    this.setData(Object.assign(base, {
      isEdit: false,
      header: h,
      products: [emptyLine()],
      termsIdx: 0, methodIdx: 0, ratioIdx: base.ratios.indexOf(h.paymentRatio),
      dmIdx: this.data.deliveryMethods.indexOf(h.deliveryMethod),
      dlIdx: this.data.deliveryLocations.indexOf(h.deliveryLocation),
      taxIdx: this.data.taxRates.indexOf(h.tax)
    }));
    this.recompute();
  },

  loadExisting(q, base) {
    var h = q.header;
    var companyIdx = 0;
    db.QUOTE_COMPANIES.forEach(function (c, i) { if (c.name === h.companyName) companyIdx = i; });
    var company = db.QUOTE_COMPANIES[companyIdx];
    var today = todayStr();
    if (!h.quoteDate) h.quoteDate = today;
    if (!h.validUntil) h.validUntil = shiftDate(h.quoteDate, 0, 1);
    if (!h.deliveryDate) h.deliveryDate = shiftDate(h.quoteDate, 60, 0);
    if (!h.companyName) h.companyName = company.name;
    if (!h.taxRate) h.taxRate = company.tax;
    if (!h.bankAccountInfo) h.bankAccountInfo = company.bank;
    if (!h.terms) h.terms = base.terms[0] || 'EXW';
    if (!h.paymentMethod) h.paymentMethod = base.methods[0] || '电汇 | T/T';

    var lines = q.products.length ? q.products.map(function (p) {
      return {
        productNo: p.productNo, productName: p.productName,
        drawingNumber: p.drawingNumber, specification: p.specification,
        unit: p.unit,
        quantity: p.quantity ? String(p.quantity) : '',
        unitPrice: p.unitPrice ? String(p.unitPrice) : '',
        currency: p.currency || 'USD', remark: p.remark || '',
        amountText: money(p.amount)
      };
    }) : [emptyLine()];

    this.setData(Object.assign(base, {
      isEdit: true,
      oldQuoteNo: h.quoteNo,
      companyIdx: companyIdx,
      header: h,
      products: lines,
      unitIdx: -1,
      termsIdx: base.terms.indexOf(h.terms),
      methodIdx: base.methods.indexOf(h.paymentMethod),
      ratioIdx: base.ratios.indexOf(h.paymentRatio),
      dmIdx: this.data.deliveryMethods.indexOf(h.deliveryMethod),
      dlIdx: this.data.deliveryLocations.indexOf(h.deliveryLocation),
      taxIdx: this.data.taxRates.indexOf(h.taxRate)
    }));
    this.recompute();
  },

  /* ---------- 公司 / 条款联动 ---------- */

  onCompany(e) {
    var idx = Number(e.currentTarget.dataset.i);
    var c = db.QUOTE_COMPANIES[idx];
    var patch = {};
    patch['companyIdx'] = idx;
    patch['header.companyName'] = c.name;
    patch['header.bankAccountInfo'] = c.bank;
    patch['header.taxRate'] = c.tax;
    patch['taxIdx'] = this.data.taxRates.indexOf(c.tax);
    this.setData(patch);
    this.recompute();
  },

  onTerms(e) {
    var idx = Number(e.detail.value);
    var term = this.data.terms[idx];
    var link = db.deliveryForTerms(term);
    var patch = { termsIdx: idx, 'header.terms': term };
    if (link.method) {
      patch['header.deliveryMethod'] = link.method;
      patch.dmIdx = this.data.deliveryMethods.indexOf(link.method);
    }
    if (link.location) {
      patch['header.deliveryLocation'] = link.location;
      patch.dlIdx = this.data.deliveryLocations.indexOf(link.location);
    }
    this.setData(patch);
  },

  onMethod(e) {
    var idx = Number(e.detail.value);
    this.setData({ methodIdx: idx, 'header.paymentMethod': this.data.methods[idx] });
  },
  onRatio(e) {
    var idx = Number(e.detail.value);
    this.setData({ ratioIdx: idx, 'header.paymentRatio': this.data.ratios[idx] });
  },
  onDeliveryMethod(e) {
    var idx = Number(e.detail.value);
    this.setData({ dmIdx: idx, 'header.deliveryMethod': this.data.deliveryMethods[idx] });
  },
  onDeliveryLocation(e) {
    var idx = Number(e.detail.value);
    this.setData({ dlIdx: idx, 'header.deliveryLocation': this.data.deliveryLocations[idx] });
  },
  onTax(e) {
    var idx = Number(e.detail.value);
    this.setData({ taxIdx: idx, 'header.taxRate': this.data.taxRates[idx] });
    this.recompute();
  },

  /* ---------- 日期 ---------- */

  onQuoteDate(e) {
    var d = e.detail.value;
    this.setData({
      'header.quoteDate': d,
      'header.validUntil': shiftDate(d, 0, 1),
      'header.deliveryDate': shiftDate(d, 60, 0)
    });
  },
  onValidUntil(e) { this.setData({ 'header.validUntil': e.detail.value }); },
  onDeliveryDate(e) { this.setData({ 'header.deliveryDate': e.detail.value }); },

  /* ---------- 头部输入 ---------- */

  onHeadInput(e) {
    var f = e.currentTarget.dataset.f;
    var patch = {};
    patch['header.' + f] = e.detail.value;
    this.setData(patch);
  },

  regenNo() {
    this.setData({ 'header.quoteNo': db.nextQuoteNo() });
  },

  /* ---------- 客户速填 ---------- */

  onCustomerPick(e) {
    var idx = Number(e.detail.value);
    var c = this.data.customers[idx];
    if (!c) return;
    this.setData({
      customerIdx: idx,
      'header.customerCompany': c.customerName || '',
      'header.customerContact': c.contactName || '',
      'header.customerTel': c.phone || '',
      'header.customerEmail': c.email || '',
      'header.customerAddress': c.address || ''
    });
  },

  /* ---------- 产品行 ---------- */

  onLineInput(e) {
    var i = e.currentTarget.dataset.i;
    var f = e.currentTarget.dataset.f;
    var patch = {};
    patch['products[' + i + '].' + f] = e.detail.value;
    this.setData(patch);
    if (f === 'quantity' || f === 'unitPrice') this.recompute();
  },

  onLineUnit(e) {
    var i = e.currentTarget.dataset.i;
    var ui = Number(e.detail.value);
    var patch = {};
    patch.unitIdx = ui;
    patch['products[' + i + '].unit'] = this.data.units[ui];
    this.setData(patch);
  },

  onLineCurrency(e) {
    var i = e.currentTarget.dataset.i;
    var ci = Number(e.detail.value);
    var patch = {};
    patch['products[' + i + '].currency'] = this.data.currencies[ci];
    this.setData(patch);
    this.recompute();
  },

  onProductPick(e) {
    var i = e.currentTarget.dataset.i;
    var pi = Number(e.detail.value);
    var p = this.data.productPicks[pi];
    if (!p) return;
    var patch = {};
    patch['products[' + i + '].productNo'] = p.productNo || '';
    patch['products[' + i + '].productName'] = p.productName || '';
    patch['products[' + i + '].drawingNumber'] = p.drawingNumber || '';
    patch['products[' + i + '].specification'] = p.specification || '';
    patch['products[' + i + '].unit'] = p.unit || '';
    patch['products[' + i + '].unitPrice'] = p.unitPrice != null && p.unitPrice !== '' ? String(p.unitPrice) : '';
    patch['products[' + i + '].currency'] = p.currency || 'USD';
    patch['products[' + i + '].remark'] = p.remark || '';
    this.setData(patch);
    this.recompute();
  },

  addLine() {
    var lines = this.data.products.slice();
    lines.push(emptyLine());
    this.setData({ products: lines });
  },

  removeLine(e) {
    var i = e.currentTarget.dataset.i;
    var lines = this.data.products.slice();
    lines.splice(i, 1);
    if (!lines.length) lines.push(emptyLine());
    this.setData({ products: lines });
    this.recompute();
  },

  /* ---------- 合计 ---------- */

  recompute() {
    var lines = this.data.products.map(function (l) {
      var amount = r2(num(l.quantity) * num(l.unitPrice));
      return Object.assign({}, l, { amount: amount, amountText: money(amount) });
    });
    var subtotal = 0;
    lines.forEach(function (l) { subtotal += num(l.amount); });
    subtotal = r2(subtotal);
    var rate = parseInt(this.data.header.taxRate, 10);
    if (isNaN(rate)) rate = 0;
    var tax = r2(subtotal * rate / 100);
    var currency = lines.length && lines[0].currency ? lines[0].currency : 'USD';
    this.setData({
      products: lines,
      subtotalText: money(subtotal),
      taxText: money(tax),
      totalText: money(subtotal), // 与正式报价单模板一致：合计不含税
      currencyLabel: currency
    });
  },

  /* ---------- 保存 / PDF ---------- */

  collectForSave() {
    var h = this.data.header;
    if (!h.quoteNo) { wx.showToast({ title: '缺少报价单号', icon: 'none' }); return null; }
    if (!h.quoteDate) { wx.showToast({ title: '缺少报价日期', icon: 'none' }); return null; }
    var products = this.data.products
      .map(function (l) {
        return {
          productNo: (l.productNo || '').trim(),
          productName: (l.productName || '').trim(),
          drawingNumber: (l.drawingNumber || '').trim(),
          specification: (l.specification || '').trim(),
          unit: l.unit || '',
          quantity: num(l.quantity),
          unitPrice: r2(l.unitPrice),
          currency: l.currency || 'USD',
          remark: (l.remark || '').trim()
        };
      })
      .filter(function (p) { return p.productNo || p.productName || p.quantity || p.unitPrice; });
    if (!products.length) { wx.showToast({ title: '请至少填写一行产品', icon: 'none' }); return null; }
    var bad = products.filter(function (p) { return !(p.quantity > 0) || !(p.unitPrice >= 0); });
    if (bad.length) { wx.showToast({ title: '每行需有数量和单价', icon: 'none' }); return null; }
    return { header: h, products: products };
  },

  onSave() {
    var payload = this.collectForSave();
    if (!payload) return;
    db.saveQuotation(payload.header, payload.products, this.data.isEdit ? this.data.oldQuoteNo : '');
    wx.showToast({ title: '已保存并同步云端', icon: 'success' });
    setTimeout(function () { wx.navigateBack(); }, 700);
  },

  onSharePdf() {
    var payload = this.collectForSave();
    if (!payload) return;
    // 出 PDF 前先落库（与桌面端“保存并出单”一致）
    db.saveQuotation(payload.header, payload.products, this.data.isEdit ? this.data.oldQuoteNo : '');

    var h = payload.header;
    var company = db.QUOTE_COMPANIES[this.data.companyIdx] || db.QUOTE_COMPANIES[0];
    var subtotal = 0;
    payload.products.forEach(function (p) { subtotal += r2(p.quantity) * r2(p.unitPrice); });
    subtotal = r2(subtotal);
    var rate = parseInt(h.taxRate, 10);
    if (isNaN(rate)) rate = 0;
    var doc = {
      company: company,
      header: h,
      products: payload.products.map(function (p) {
        return Object.assign({}, p, { amount: r2(p.quantity) * r2(p.unitPrice) });
      }),
      totals: { subtotal: subtotal, tax: r2(subtotal * rate / 100), total: subtotal },
      today: todayStr()
    };
    pdfShare.generateAndShare(
      docRenderers.renderQuotation,
      doc,
      'Quotation_' + h.quoteNo,
      'portrait',
      null
    );
  }
});
