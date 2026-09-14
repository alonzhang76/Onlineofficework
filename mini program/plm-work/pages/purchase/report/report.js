const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');

Page({
  data: { companyName: '', stats: { bySupplier: [] } },

  onLoad(options) {
    this.company = options.company || 'companyA';
    const c = db.COMPANIES.find(x => x.id === this.company) || db.COMPANIES[0];
    this.setData({ companyName: c.short });
  },

  onShow() { this.render(); },
  onPullDownRefresh() { db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); }); },

  render() {
    const stats = db.getStats(this.company);
    stats.purchaseTotalText = fmt.fmtMoney(stats.purchaseTotal);
    stats.invoiceTotalText = fmt.fmtMoney(stats.invoiceTotal);
    stats.paymentTotalText = fmt.fmtMoney(stats.paymentTotal);
    stats.payableText = fmt.fmtMoney(stats.payable);
    stats.bySupplier.forEach(s => {
      s.purchaseTotalText = fmt.fmtMoney(s.purchaseTotal);
      s.invoiceTotalText = fmt.fmtMoney(s.invoiceTotal);
      s.paymentTotalText = fmt.fmtMoney(s.paymentTotal);
      s.unpaidText = fmt.fmtMoney(s.unpaid);
    });
    this.setData({ stats });
  }
});
