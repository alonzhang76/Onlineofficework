const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');

const STATUS_CLASS = { '未付款': 'badge-red', '部分付款': 'badge-orange', '已付款': 'badge-green' };

Page({
  data: {
    companyName: '',
    kw: '', fSupplier: '',
    statusOptions: ['全部', '未付款', '部分付款', '已付款'],
    statusIdx: 0,
    supplierNames: [],
    list: [], sumText: '0.00',
    showForm: false,
    form: { id: '', invoiceNumber: '', invoiceDate: '', purchaseOrder: '', supplier: '', amount: '', remark: '' }
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
    const d = { kw: this.data.kw, fSupplier: this.data.fSupplier, statusIdx: this.data.statusIdx, statusOptions: this.data.statusOptions };
    const list = db.listInvoices(this.company).filter(x => {
      if (d.kw && (x.invoiceNumber || '').toLowerCase().indexOf(d.kw.toLowerCase()) < 0) return false;
      if (d.fSupplier && (x.supplier || '').toLowerCase().indexOf(d.fSupplier.toLowerCase()) < 0) return false;
      if (d.statusIdx > 0 && db.invoiceStatusOf(x) !== d.statusOptions[d.statusIdx]) return false;
      return true;
    }).slice().reverse().map(x => Object.assign({}, x, {
      status: db.invoiceStatusOf(x),
      statusClass: STATUS_CLASS[db.invoiceStatusOf(x)] || 'badge-gray',
      amountText: fmt.fmtMoney(x.amount)
    }));
    const sum = list.reduce((s, x) => s + db.num(x.amount), 0);
    this.setData({ list, sumText: fmt.fmtMoney(sum) });
  },

  resetFilter() { this.setData({ kw: '', fSupplier: '', statusIdx: 0 }); this.search(); },

  openNew() {
    this.refreshSuppliers();
    this.setData({ showForm: true, form: { id: '', invoiceNumber: '', invoiceDate: '', purchaseOrder: '', supplier: '', amount: '', remark: '' } });
  },

  edit(e) {
    const x = db.listInvoices(this.company).find(v => v.id === e.currentTarget.dataset.id);
    if (!x) return;
    this.refreshSuppliers();
    this.setData({ showForm: true, form: { id: x.id, invoiceNumber: x.invoiceNumber || '', invoiceDate: x.invoiceDate || '', purchaseOrder: x.purchaseOrder || '', supplier: x.supplier || '', amount: x.amount || '', remark: x.remark || '' } });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onSupplier(e) { this.setData({ 'form.supplier': this.data.supplierNames[+e.detail.value] || '' }); },

  save() {
    const f = this.data.form;
    if (!f.invoiceNumber.trim()) { wx.showToast({ title: '请填写发票号', icon: 'none' }); return; }
    if (!f.amount) { wx.showToast({ title: '请填写金额', icon: 'none' }); return; }
    db.saveInvoice(this.company, f);
    this.setData({ showForm: false });
    wx.showToast({ title: f.id ? '发票已更新' : '发票已登记', icon: 'success' });
    this.search();
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除发票', content: '确定删除该发票记录吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteInvoice(this.company, id);
        this.search();
      }
    });
  }
});
