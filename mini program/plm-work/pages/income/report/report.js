const db = require('../../../utils/income-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    company: 'company1',
    tab: 'category',
    years: ['全部'],
    yearIdx: 0,
    s: { incomeText: '0.00', expenseText: '0.00', balanceText: '0.00', count: 0, byMonth: [] },
    incomeCats: [],
    expenseCats: []
  },

  onLoad(options) { this.setData({ company: options.company || 'company1' }); },

  onShow() { this.refreshYears(); this.render(); },

  onPullDownRefresh() { db.syncFromCloud(() => { this.refreshYears(); this.render(); wx.stopPullDownRefresh(); }); },

  refreshYears() {
    const s = db.getStats(this.data.company, '');
    const years = ['全部'].concat(s.years);
    let idx = this.data.yearIdx;
    if (idx >= years.length) idx = 0;
    this.setData({ years, yearIdx: idx });
  },

  render() {
    const year = this.data.yearIdx > 0 ? this.data.years[this.data.yearIdx] : '';
    const s = db.getStats(this.data.company, year);
    s.incomeText = fmt.fmtMoney(s.income);
    s.expenseText = fmt.fmtMoney(s.expense);
    s.balanceText = fmt.fmtMoney(s.balance);
    s.byMonth = s.byMonth.map(m => Object.assign({}, m, {
      incomeText: fmt.fmtMoney(m.income),
      expenseText: fmt.fmtMoney(m.expense),
      balanceText: fmt.fmtMoney(m.balance)
    }));

    const cats = s.byCategory.map(c => Object.assign({}, c, {
      amountText: fmt.fmtMoney(c.amount),
      pct: 0
    }));
    const incomeCats = cats.filter(c => c.type === 'income');
    const expenseCats = cats.filter(c => c.type === 'expense');
    const sumIn = incomeCats.reduce((a, c) => a + c.amount, 0) || 1;
    const sumOut = expenseCats.reduce((a, c) => a + c.amount, 0) || 1;
    incomeCats.forEach(c => { c.pct = Math.round((c.amount / sumIn) * 1000) / 10; });
    expenseCats.forEach(c => { c.pct = Math.round((c.amount / sumOut) * 1000) / 10; });

    this.setData({ s, incomeCats, expenseCats });
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.t }); },
  onYear(e) { this.setData({ yearIdx: +e.detail.value }); this.render(); }
});
