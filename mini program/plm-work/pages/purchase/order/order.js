const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');

function blankProduct() {
  return { rid: db.uid('r_'), productName: '', specification: '', unitPrice: '', quantity: '', unit: '只', amount: '0.00', remark: '' };
}

function recalc(form) {
  form.products.forEach(p => {
    p.amount = db.r2(db.num(p.unitPrice) * db.num(p.quantity)).toFixed(2);
  });
  form.totalAmount = db.r2(form.products.reduce((s, p) => s + db.num(p.amount), 0)).toFixed(2);
  return form;
}

Page({
  data: {
    companyName: '',
    fContract: '', fSupplier: '', kw: '',
    units: db.UNITS_DEFAULT,
    costCategories: db.COST_CATEGORIES,
    supplierNames: [],
    list: [], sumText: '0.00',
    showForm: false,
    form: { id: '', contractNumber: '', supplier: '', orderDate: '', deliveryDate: '', actualArrivalDate: '', costCategory: '', remarks: '', products: [], totalAmount: '0.00' }
  },

  onLoad(options) {
    const company = options.company || 'companyA';
    this.company = company;
    const c = db.COMPANIES.find(x => x.id === company) || db.COMPANIES[0];
    this.setData({ companyName: c.short });
  },

  onShow() { this.refreshSuppliers(); this.search(); },

  refreshSuppliers() {
    this.setData({ supplierNames: db.listSuppliers().map(s => s.supplierName).filter(Boolean) });
  },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },

  search() {
    const d = { fContract: this.data.fContract, fSupplier: this.data.fSupplier, kw: this.data.kw };
    const list = db.listOrders(this.company).filter(o => {
      if (d.fContract && (o.contractNumber || '').toLowerCase().indexOf(d.fContract.toLowerCase()) < 0) return false;
      if (d.fSupplier && (o.supplier || '').toLowerCase().indexOf(d.fSupplier.toLowerCase()) < 0) return false;
      if (d.kw) {
        const text = JSON.stringify(o).toLowerCase();
        if (text.indexOf(d.kw.trim().toLowerCase()) < 0) return false;
      }
      return true;
    }).slice().reverse().map(o => Object.assign({}, o, {
      totalAmountText: fmt.fmtMoney(o.totalAmount),
      products: (o.products || []).map(p => Object.assign({}, p, { amountText: fmt.fmtMoney(p.amount) }))
    }));
    const sum = list.reduce((s, o) => s + db.num(o.totalAmount), 0);
    this.setData({ list, sumText: fmt.fmtMoney(sum) });
  },

  resetFilter() { this.setData({ fContract: '', fSupplier: '', kw: '' }); this.search(); },

  openNew() {
    this.refreshSuppliers();
    this.setData({ showForm: true, form: { id: '', contractNumber: '', supplier: '', orderDate: '', deliveryDate: '', actualArrivalDate: '', costCategory: '', remarks: '', products: [blankProduct()], totalAmount: '0.00' } });
  },

  editOrder(e) {
    const o = db.listOrders(this.company).find(x => x.id === e.currentTarget.dataset.id);
    if (!o) return;
    this.refreshSuppliers();
    const form = {
      id: o.id, contractNumber: o.contractNumber || '', supplier: o.supplier || '',
      orderDate: o.orderDate || '', deliveryDate: o.deliveryDate || '',
      actualArrivalDate: o.actualArrivalDate || '', costCategory: o.costCategory || '', remarks: o.remarks || '',
      products: (o.products && o.products.length ? o.products : [blankProduct()]).map(p => Object.assign(blankProduct(), p)),
      totalAmount: o.totalAmount || 0
    };
    this.setData({ showForm: true, form: recalc(form) });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onSupplier(e) { this.setData({ 'form.supplier': this.data.supplierNames[+e.detail.value] || '' }); },
  onCost(e) { this.setData({ 'form.costCategory': db.COST_CATEGORIES[+e.detail.value] || '' }); },

  onProd(e) {
    const i = e.currentTarget.dataset.i, k = e.currentTarget.dataset.k;
    this.setData({ ['form.products[' + i + '].' + k]: e.detail.value });
    // 金额联动重算（延时一拍读取最新值）
    const form = this.data.form;
    form.products[i][k] = e.detail.value;
    form.products[i].amount = db.r2(db.num(form.products[i].unitPrice) * db.num(form.products[i].quantity)).toFixed(2);
    form.totalAmount = db.r2(form.products.reduce((s, p) => s + db.num(p.amount), 0)).toFixed(2);
    this.setData({ form });
  },

  onProdUnit(e) {
    this.setData({ ['form.products[' + e.currentTarget.dataset.i + '].unit']: db.UNITS_DEFAULT[+e.detail.value] || '只' });
  },

  addProduct() {
    const form = this.data.form;
    form.products.push(blankProduct());
    this.setData({ form });
  },

  removeProduct(e) {
    const form = this.data.form;
    if (form.products.length <= 1) { wx.showToast({ title: '至少保留一行产品', icon: 'none' }); return; }
    form.products.splice(+e.currentTarget.dataset.i, 1);
    this.setData({ form: recalc(form) });
  },

  save() {
    const f = this.data.form;
    if (!f.contractNumber.trim()) { wx.showToast({ title: '请填写合同号', icon: 'none' }); return; }
    const validProducts = f.products.filter(p => (p.productName || '').trim());
    if (validProducts.length === 0) { wx.showToast({ title: '请至少填写一行产品', icon: 'none' }); return; }
    db.saveOrder(this.company, {
      id: f.id || undefined,
      contractNumber: f.contractNumber.trim(), supplier: f.supplier,
      orderDate: f.orderDate, deliveryDate: f.deliveryDate,
      actualArrivalDate: f.actualArrivalDate, costCategory: f.costCategory, remarks: f.remarks,
      products: validProducts, totalAmount: f.totalAmount
    });
    this.setData({ showForm: false });
    wx.showToast({ title: f.id ? '订单已更新' : '订单已保存', icon: 'success' });
    this.search();
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除采购订单', content: '确定删除该订单吗？合同台账会同步更新。',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteOrder(this.company, id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.search();
      }
    });
  }
});
