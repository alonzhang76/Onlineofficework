const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    companyName: '',
    tab: 'contract',
    units: db.UNITS_DEFAULT,
    supplierNames: [],
    list: [],
    showForm: false,
    form: { id: '', contractNumber: '', supplier: '', productName: '', quantity: '', unit: '只', dateVal: '', note: '' }
  },

  onLoad(options) {
    this.company = options.company || 'companyA';
    const c = db.COMPANIES.find(x => x.id === this.company) || db.COMPANIES[0];
    this.setData({ companyName: c.short });
  },

  onShow() { this.setData({ supplierNames: db.listSuppliers().map(s => s.supplierName).filter(Boolean) }); this.search(); },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t, showForm: false });
    this.search();
  },

  search() {
    let list = [];
    if (this.data.tab === 'contract') {
      list = db.listContracts(this.company).slice().reverse().map(x => Object.assign({}, x, {
        totalAmountText: fmt.fmtMoney(x.totalAmount)
      }));
    } else if (this.data.tab === 'receipt') {
      list = db.listReceipts(this.company).slice().reverse();
    } else {
      list = db.listReturns(this.company).slice().reverse();
    }
    this.setData({ list });
  },

  openNew() {
    this.setData({ showForm: true, form: { id: '', contractNumber: '', supplier: '', productName: '', quantity: '', unit: '只', dateVal: '', note: '' } });
  },

  editRec(e) {
    const isReceipt = this.data.tab === 'receipt';
    const src = isReceipt ? db.listReceipts(this.company) : db.listReturns(this.company);
    const x = src.find(v => v.id === e.currentTarget.dataset.id);
    if (!x) return;
    this.setData({
      showForm: true,
      form: {
        id: x.id, contractNumber: x.contractNumber || '', supplier: x.supplier || '',
        productName: x.productName || '', quantity: x.quantity || '', unit: x.unit || '只',
        dateVal: isReceipt ? (x.receiptDate || '') : (x.returnDate || ''),
        note: isReceipt ? (x.remark || '') : (x.reason || '')
      }
    });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ 'form.dateVal': e.detail.value }); },
  onSupplier(e) { this.setData({ 'form.supplier': this.data.supplierNames[+e.detail.value] || '' }); },
  onUnit(e) { this.setData({ 'form.unit': db.UNITS_DEFAULT[+e.detail.value] || '只' }); },

  save() {
    const f = this.data.form;
    if (!f.contractNumber.trim()) { wx.showToast({ title: '请填写合同号', icon: 'none' }); return; }
    const common = {
      id: f.id || undefined,
      contractNumber: f.contractNumber.trim(), supplier: f.supplier,
      productName: f.productName, quantity: f.quantity, unit: f.unit
    };
    if (this.data.tab === 'receipt') {
      db.saveReceipt(this.company, Object.assign(common, { receiptDate: f.dateVal, remark: f.note }));
    } else {
      db.saveReturn(this.company, Object.assign(common, { returnDate: f.dateVal, reason: f.note }));
    }
    this.setData({ showForm: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.search();
  },

  delRec(e) {
    const id = e.currentTarget.dataset.id;
    const isReceipt = this.data.tab === 'receipt';
    wx.showModal({
      title: '删除记录', content: '确定删除该' + (isReceipt ? '收货' : '退货') + '记录吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        if (isReceipt) db.deleteReceipt(this.company, id); else db.deleteReturn(this.company, id);
        this.search();
      }
    });
  }
});
