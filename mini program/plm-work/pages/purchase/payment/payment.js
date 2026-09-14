const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    companyName: '',
    fSupplier: '',
    typeOptions: ['全部', '凭合同付款', '凭发票付款'],
    typeIdx: 0,
    dateFrom: '', dateTo: '',
    supplierNames: [],
    list: [], sumText: '0.00',
    showForm: false,
    form: { id: '', paymentType: 'contract-first', invoiceNumbers: '', contractNumber: '', supplier: '', paymentDate: '', amount: '', paymentMethod: '', remark: '' }
  },

  onLoad(options) {
    this.company = options.company || 'companyA';
    const c = db.COMPANIES.find(x => x.id === this.company) || db.COMPANIES[0];
    this.setData({ companyName: c.short });
  },

  onShow() { this.refreshSuppliers(); this.search(); },

  refreshSuppliers() {
    this.setData({ supplierNames: db.listSuppliers().map(s => s.supplierName).filter(Boolean) });
  },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  onPick(e) { this.setData({ [e.currentTarget.dataset.k]: +e.detail.value }); },

  search() {
    const d = { fSupplier: this.data.fSupplier, typeIdx: this.data.typeIdx, typeOptions: this.data.typeOptions, dateFrom: this.data.dateFrom, dateTo: this.data.dateTo };
    const list = db.listPayments(this.company).filter(x => {
      if (d.fSupplier && (x.supplier || '').toLowerCase().indexOf(d.fSupplier.toLowerCase()) < 0) return false;
      if (d.typeIdx > 0 && x.paymentType !== (d.typeIdx === 1 ? 'contract-first' : 'invoice-first')) return false;
      if (d.dateFrom && x.paymentDate && x.paymentDate < d.dateFrom) return false;
      if (d.dateTo && x.paymentDate && x.paymentDate > d.dateTo) return false;
      return true;
    }).slice().reverse().map(x => Object.assign({}, x, {
      typeName: x.paymentType === 'invoice-first' ? '凭发票' : '凭合同',
      contractLabel: x.paymentType === 'invoice-first' ? '关联发票号' : '合同编号',
      contractValue: x.paymentType === 'invoice-first' ? x.invoiceNumbers : x.contractNumber,
      amountText: fmt.fmtMoney(x.amount)
    }));
    const sum = list.reduce((s, x) => s + db.num(x.amount), 0);
    this.setData({ list, sumText: fmt.fmtMoney(sum) });
  },

  resetFilter() { this.setData({ fSupplier: '', typeIdx: 0, dateFrom: '', dateTo: '' }); this.search(); },

  openNew() {
    this.refreshSuppliers();
    this.setData({ showForm: true, form: { id: '', paymentType: 'contract-first', invoiceNumbers: '', contractNumber: '', supplier: '', paymentDate: '', amount: '', paymentMethod: '', remark: '' } });
  },

  edit(e) {
    const x = db.listPayments(this.company).find(v => v.id === e.currentTarget.dataset.id);
    if (!x) return;
    this.refreshSuppliers();
    this.setData({
      showForm: true,
      form: { id: x.id, paymentType: x.paymentType || 'contract-first', invoiceNumbers: x.invoiceNumbers || '', contractNumber: x.contractNumber || '', supplier: x.supplier || '', paymentDate: x.paymentDate || '', amount: x.amount || '', paymentMethod: x.paymentMethod || '', remark: x.remark || '' }
    });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onSupplier(e) { this.setData({ 'form.supplier': this.data.supplierNames[+e.detail.value] || '' }); },
  onType(e) { this.setData({ 'form.paymentType': e.currentTarget.dataset.t }); },

  save() {
    const f = this.data.form;
    if (!f.amount) { wx.showToast({ title: '请填写金额', icon: 'none' }); return; }
    db.savePayment(this.company, f);
    this.setData({ showForm: false });
    wx.showToast({ title: f.id ? '付款已更新' : '付款已登记', icon: 'success' });
    this.search();
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除付款', content: '确定删除该付款记录吗？发票付款状态会同步更新。', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deletePayment(this.company, id);
        this.search();
      }
    });
  }
});
