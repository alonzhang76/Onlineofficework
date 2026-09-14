const db = require('../../../utils/schedule-db');

const STATUS_CLASS = { '已出货': 'badge-green', '已交货': 'badge-green', '结束': 'badge-green', '生产中': 'badge-orange' };

function matches(o, d) {
  if (d.kw) {
    const kws = d.kw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const text = JSON.stringify(o).toLowerCase();
    if (!kws.some(k => text.indexOf(k) >= 0)) return false;
  }
  if (d.fCustomer && (o.customer || '').toLowerCase().indexOf(d.fCustomer.toLowerCase()) < 0) return false;
  if (d.fOrderNo) {
    const nos = d.fOrderNo.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!nos.some(k => (o.orderNo || '').toLowerCase().indexOf(k) >= 0)) return false;
  }
  if (d.fProduct) {
    const ps = d.fProduct.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!ps.some(k => (o.product || '').toLowerCase().indexOf(k) >= 0)) return false;
  }
  if (d.statusIdx > 0 && o.status !== d.statusOptions[d.statusIdx]) return false;
  if (d.dateFrom && o.date && o.date < d.dateFrom) return false;
  if (d.dateTo && o.date && o.date > d.dateTo) return false;
  return true;
}

Page({
  data: {
    kw: '', fCustomer: '', fOrderNo: '', fProduct: '',
    statusOptions: ['全部', '生产中', '已出货'],
    statusIdx: 0,
    dateFrom: '', dateTo: '',
    list: []
  },

  onShow() { this.search(); },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  onPick(e) { this.setData({ [e.currentTarget.dataset.k]: +e.detail.value }); },

  search() {
    const d = {
      kw: this.data.kw, fCustomer: this.data.fCustomer, fOrderNo: this.data.fOrderNo,
      fProduct: this.data.fProduct, statusIdx: this.data.statusIdx,
      statusOptions: this.data.statusOptions, dateFrom: this.data.dateFrom, dateTo: this.data.dateTo
    };
    const list = db.data.production_orders_data
      .filter(o => matches(o, d))
      .slice()
      .reverse()
      .map(o => Object.assign({}, o, { badgeClass: STATUS_CLASS[o.status] || 'badge-gray' }));
    this.setData({ list });
  },

  resetFilter() {
    this.setData({ kw: '', fCustomer: '', fOrderNo: '', fProduct: '', statusIdx: 0, dateFrom: '', dateTo: '' });
    this.search();
  }
});
