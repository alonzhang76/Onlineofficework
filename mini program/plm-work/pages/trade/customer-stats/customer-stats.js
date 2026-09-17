const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    yearOptions: [{ value: 'all', label: '全部年份' }],
    yearIdx: 0,
    year: 'all',
    customers: [],
    totalCNY: '0.00'
  },

  onShow() { this.render(); },

  onYear(e) {
    const idx = +e.detail.value;
    this.setData({ yearIdx: idx, year: this.data.yearOptions[idx].value });
    this.render();
  },

  toggle(e) {
    const idx = +e.currentTarget.dataset.idx;
    this.setData({
      ['customers[' + idx + '].open']: !this.data.customers[idx].open
    });
  },

  render() {
    const stats = db.getCustomerStats(this.data.year);

    // 年份选项（有数据的年份）
    const yearOptions = [{ value: 'all', label: '全部年份' }]
      .concat(stats.years.map(y => ({ value: y, label: y + ' 年' })));
    let yearIdx = yearOptions.findIndex(o => o.value === this.data.year);
    if (yearIdx < 0) yearIdx = 0;

    // 统计各客户订单条数（同年份口径）
    const orderCount = {};
    db.data.orderRecords.forEach(o => {
      if (!o.customer) return;
      if (this.data.year !== 'all' && fmt.fmtDate(o.orderDate).slice(0, 4) !== this.data.year) return;
      orderCount[o.customer] = (orderCount[o.customer] || 0) + 1;
    });

    // 将 客户×币种 行按客户归并为卡片
    const map = {};
    stats.rows.forEach(r => {
      if (!map[r.customer]) {
        map[r.customer] = { name: r.customer, cny: 0, percent: 0, orderCount: 0, rows: [], open: false };
      }
      map[r.customer].cny += r.cnyAmount;
      map[r.customer].rows.push({
        currency: r.currency,
        amount: fmt.fmtMoney(r.amount),
        rate: r.rate,
        cnyAmount: fmt.fmtMoney(r.cnyAmount)
      });
    });
    const customers = Object.values(map)
      .sort((a, b) => b.cny - a.cny)
      .map(c => ({
        name: c.name,
        cny: fmt.fmtMoney(c.cny),
        percent: stats.totalCNY > 0 ? (c.cny / stats.totalCNY * 100).toFixed(1) : '0.0',
        orderCount: orderCount[c.name] || 0,
        rows: c.rows,
        open: c.open
      }));
    // 默认展开第一名
    if (customers.length > 0) customers[0].open = true;

    this.setData({
      yearOptions,
      yearIdx,
      customers,
      totalCNY: fmt.fmtMoney(stats.totalCNY)
    });
  }
});
