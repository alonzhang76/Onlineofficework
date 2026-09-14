const db = require('../../../utils/purchase-db');

Page({
  data: {
    kw: '',
    list: [],
    showForm: false,
    form: { id: '', supplierNumber: '', supplierName: '', contactPerson: '', phoneNumber: '', email: '', companyAddress: '', bankName: '', bankCode: '', bankAccount: '', remarks: '' }
  },

  onShow() { this.search(); },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },

  search() {
    const kw = this.data.kw.trim().toLowerCase();
    let list = db.listSuppliers();
    if (kw) {
      list = list.filter(s => [s.supplierName, s.contactPerson, s.phoneNumber, s.supplierNumber]
        .some(v => (v || '').toLowerCase().indexOf(kw) >= 0));
    }
    this.setData({ list });
  },

  openNew() {
    this.setData({ showForm: true, form: { id: '', supplierNumber: '', supplierName: '', contactPerson: '', phoneNumber: '', email: '', companyAddress: '', bankName: '', bankCode: '', bankAccount: '', remarks: '' } });
  },

  edit(e) {
    const s = db.listSuppliers().find(x => x.id === e.currentTarget.dataset.id);
    if (!s) return;
    this.setData({ showForm: true, form: Object.assign({ id: '', supplierNumber: '', supplierName: '', contactPerson: '', phoneNumber: '', email: '', companyAddress: '', bankName: '', bankCode: '', bankAccount: '', remarks: '' }, s) });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  save() {
    const f = this.data.form;
    if (!f.supplierName.trim()) { wx.showToast({ title: '请填写供应商名称', icon: 'none' }); return; }
    db.saveSupplier(f);
    this.setData({ showForm: false });
    wx.showToast({ title: '供应商已保存', icon: 'success' });
    this.search();
  },

  callSupplier(e) {
    const s = db.listSuppliers().find(x => x.id === e.currentTarget.dataset.id);
    if (!s || !s.phoneNumber) { wx.showToast({ title: '未填写电话', icon: 'none' }); return; }
    wx.showModal({
      title: '联系供应商',
      content: '拨打 ' + s.phoneNumber + '？',
      confirmText: '拨打',
      success: res => {
        if (res.confirm) wx.makePhoneCall({ phoneNumber: s.phoneNumber }).catch(() => {});
      }
    });
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除供应商', content: '确定删除该供应商吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteSupplier(id);
        this.search();
      }
    });
  }
});
