const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

function emptyForm() {
  return { customer: '', orderNo: '', paymentDate: fmt.today(), amount: '', payer: '', recipient: '', remark: '' };
}

Page({
  data: {
    kw: '',
    custOptions: ['全部客户'], custIdx: 0,
    typeOptions: ['全部类型'].concat(db.PAYMENT_METHODS), typeIdx: 0,
    recipientOptions: ['全部收款单位'], recipientIdx: 0,
    dateFrom: '', dateTo: '',

    list: [], sumAmount: '0.00',

    modal: false, editId: '', form: emptyForm(),
    methodOptions: [''].concat(db.PAYMENT_METHODS), methodIdx: 0,

    pickModal: false, allOrders: []
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const typeSel = this.data.typeIdx > 0 ? this.data.typeOptions[this.data.typeIdx] : '';
    const recipientSel = this.data.recipientIdx > 0 ? this.data.recipientOptions[this.data.recipientIdx] : '';

    const list = db.data.indexPaymentRecords
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (typeSel && (o.paymentMethod || '') !== typeSel) return false;
        if (recipientSel && (o.recipient || '') !== recipientSel) return false;
        const dv = String(o.paymentDate || '');
        if (this.data.dateFrom && dv && dv < this.data.dateFrom) return false;
        if (this.data.dateTo && dv && dv > this.data.dateTo) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.payer, o.recipient, o.remark].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('paymentDate'))
      .map(o => ({
        id: o.id, customer: o.customer, orderNo: o.orderNo,
        paymentDate: fmt.fmtDate(o.paymentDate),
        amount: fmt.fmtMoney(o.amount),
        paymentMethod: o.paymentMethod, payer: o.payer,
        recipient: o.recipient, remark: o.remark
      }));

    const custOptions = ['全部客户'].concat(
      Array.from(new Set(db.data.indexPaymentRecords.map(o => o.customer).filter(Boolean))).sort()
    );
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;

    const recipientOptions = ['全部收款单位'].concat(
      Array.from(new Set(db.data.indexPaymentRecords.map(o => o.recipient).filter(Boolean))).sort()
    );
    let recipientIdx = this.data.recipientIdx;
    if (recipientIdx >= recipientOptions.length) recipientIdx = 0;

    this.setData({
      list, custOptions, custIdx, recipientOptions, recipientIdx,
      sumAmount: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.amount) || 0, 0))
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onCust(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onType(e) { this.setData({ typeIdx: +e.detail.value }); this.render(); },
  onRecipient(e) { this.setData({ recipientIdx: +e.detail.value }); this.render(); },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.render(); },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', custIdx: 0, typeIdx: 0, recipientIdx: 0, dateFrom: '', dateTo: '' });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm(), methodIdx: 0 });
  },

  editItem(e) {
    const o = db.data.indexPaymentRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customer: o.customer || '', orderNo: o.orderNo || '',
        paymentDate: fmt.fmtDate(o.paymentDate),
        amount: o.amount === undefined ? '' : String(o.amount),
        payer: o.payer || '', recipient: o.recipient || '', remark: o.remark || ''
      },
      methodIdx: Math.max(0, this.data.methodOptions.indexOf(o.paymentMethod || ''))
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onMethod(e) { const i = +e.detail.value; this.setData({ methodIdx: i }); },

  pickOrders() {
    const groups = db.groupOrdersByNo();
    const allOrders = Object.keys(groups).map(no => ({
      orderNo: no,
      customer: groups[no].customer || '-',
      amount: fmt.fmtMoney(groups[no].amount),
      currency: groups[no].currency || 'USD'
    })).sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    this.setData({ pickModal: true, allOrders: allOrders });
  },

  chooseOrder(e) {
    const no = e.currentTarget.dataset.no;
    const g = db.groupOrdersByNo()[no];
    const patch = { 'form.orderNo': no, pickModal: false };
    if (g && !this.data.form.customer) patch['form.customer'] = g.customer || '';
    this.setData(patch);
  },

  closePick() { this.setData({ pickModal: false }); },

  save() {
    const f = this.data.form;
    if (!String(f.customer || '').trim()) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    if (!db.num(f.amount)) { wx.showToast({ title: '请填写付款金额', icon: 'none' }); return; }
    db.savePayment(Object.assign({}, f, {
      customer: String(f.customer).trim(),
      paymentMethod: this.data.methodOptions[this.data.methodIdx] || ''
    }), this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '付款记录已更新' : '付款记录已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此付款记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deletePayment(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  exportCSV() {
    if (!db.data.indexPaymentRecords.length) { wx.showToast({ title: '暂无付款数据', icon: 'none' }); return; }
    const headers = ['客户', '订单号', '付款日期', '付款金额', '付款类型', '付款单位', '收款单位', '备注'];
    const rows = [headers];
    db.data.indexPaymentRecords.forEach(o => {
      rows.push([
        o.customer || '', o.orderNo || '', fmt.fmtDate(o.paymentDate),
        o.amount || 0, o.paymentMethod || '', o.payer || '', o.recipient || '', o.remark || ''
      ]);
    });
    csv.exportFile('付款记录_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
