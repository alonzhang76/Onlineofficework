const db = require('../../../utils/schedule-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    tab: 'customer',
    years: ['全部'],
    yearIdx: 0,
    sum: { totalOrders: 0, totalAmountText: '0.00', totalReceivedText: '0.00', totalInvoicedText: '0.00', byCustomer: [], byMonth: [], byStatus: [] }
  },

  onShow() { this.refreshYears(); this.render(); },

  render() {
    const year = this.data.yearIdx > 0 ? this.data.years[this.data.yearIdx] : '';
    const sum = db.getSummary(year);
    sum.totalAmountText = fmt.fmtMoney(sum.totalAmount);
    sum.totalReceivedText = fmt.fmtMoney(sum.totalReceived);
    sum.totalInvoicedText = fmt.fmtMoney(sum.totalInvoiced);
    sum.byCustomer.forEach(c => {
      c.amountText = fmt.fmtMoney(c.amount);
      c.debtText = fmt.fmtMoney(c.debt);
    });
    sum.byMonth.forEach(m => {
      m.amountText = fmt.fmtMoney(m.amount);
      m.receivedText = fmt.fmtMoney(m.received);
    });
    const maxStatus = Math.max.apply(null, [1].concat(sum.byStatus.map(s => s.amount)));
    sum.byStatus.forEach(s => {
      s.amountText = fmt.fmtMoney(s.amount);
      s.pct = Math.round((s.amount / maxStatus) * 100);
    });
    this.setData({ sum });
  },

  refreshYears() {
    const sum = db.getSummary('');
    const years = ['全部'].concat(sum.years);
    let yearIdx = this.data.yearIdx;
    if (yearIdx >= years.length) yearIdx = 0;
    this.setData({ years, yearIdx });
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.t }); this.render(); },

  onYear(e) { this.setData({ yearIdx: +e.detail.value }); this.render(); },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.refreshYears(); this.render(); wx.stopPullDownRefresh(); });
  }
});
