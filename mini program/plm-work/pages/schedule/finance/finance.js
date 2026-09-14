const db = require('../../../utils/schedule-db');
const fmt = require('../../../utils/format');

function paidOf(o) { return db.num(o.payAmount1) + db.num(o.payAmount2) + db.num(o.payAmount3) + db.num(o.payAmount4); }

function payClass(s) {
  if (s === '付清') return 'badge-green';
  if (s === '未付' || s === '未开票') return 'badge-gray';
  if (s.indexOf('欠款') === 0) return 'badge-red';
  return 'badge-orange';
}

Page({
  data: {
    kw: '', fCustomer: '', fOrderNo: '',
    payOptions: ['全部', '未开票', '未付', '部分付款', '付清'],
    payIdx: 0,
    invOptions: ['全部', '未开票', '已开票'],
    invIdx: 0,
    dateFrom: '', dateTo: '',
    list: [], sumInvText: '0.00', sumPayText: '0.00'
  },

  onShow() { this.search(); },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  onPick(e) { this.setData({ [e.currentTarget.dataset.k]: +e.detail.value }); },

  search() {
    const d = {
      kw: this.data.kw, fCustomer: this.data.fCustomer, fOrderNo: this.data.fOrderNo,
      payIdx: this.data.payIdx, payOptions: this.data.payOptions,
      invIdx: this.data.invIdx, invOptions: this.data.invOptions,
      dateFrom: this.data.dateFrom, dateTo: this.data.dateTo
    };
    let list = db.data.production_orders_data.filter(o => {
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
      const ps = o.paymentStatus || '';
      if (d.payIdx > 0) {
        const want = d.payOptions[d.payIdx];
        if (want === '部分付款') {
          if (!(ps.indexOf('欠款') === 0)) return false;
        } else if (ps !== want) return false;
      }
      if (d.invIdx > 0 && o.invoiceStatus !== d.invOptions[d.invIdx]) return false;
      if (d.dateFrom && o.date && o.date < d.dateFrom) return false;
      if (d.dateTo && o.date && o.date > d.dateTo) return false;
      return true;
    });

    const sumInv = list.reduce((s, o) => s + db.toCNY(o.invoiceAmount, o.currency), 0);
    const sumPay = list.reduce((s, o) => s + db.toCNY(paidOf(o), o.currency), 0);

    list = list.slice().reverse().map(o => Object.assign({}, o, {
      paidTotal: fmt.fmtMoney(paidOf(o)),
      payClass: payClass(o.paymentStatus)
    }));

    this.setData({ list, sumInvText: fmt.fmtMoney(sumInv), sumPayText: fmt.fmtMoney(sumPay) });
  },

  resetFilter() {
    this.setData({ kw: '', fCustomer: '', fOrderNo: '', payIdx: 0, invIdx: 0, dateFrom: '', dateTo: '' });
    this.search();
  }
});
