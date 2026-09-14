const db = require('../../utils/db');
const fmt = require('../../utils/format');
const csv = require('../../utils/csv');

Page({
  data: {
    yearList: [], yearIndex: 0,
    empOptions: ['全部'], empIndex: 0,
    monthOptions: ['全部', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    monthIdx: 0,
    title: '', rows: [], grandTotal: '0.00',
    expanded: -1
  },

  onLoad() {
    const years = [];
    for (let y = 2021; y <= 2030; y++) years.push(y);
    const cur = new Date().getFullYear();
    this.setData({ yearList: years, yearIndex: years.indexOf(cur) >= 0 ? years.indexOf(cur) : 0 });
  },

  onShow() { this.render(); },

  onYearChange(e) { this.setData({ yearIndex: +e.detail.value, expanded: -1 }); this.render(); },
  onEmpChange(e) { this.setData({ empIndex: +e.detail.value, expanded: -1 }); this.render(); },
  onMonthFilter(e) { this.setData({ monthIdx: +e.detail.value }); this.render(); },
  toggleExpand(e) {
    const i = +e.currentTarget.dataset.idx;
    this.setData({ expanded: this.data.expanded === i ? -1 : i });
  },

  render() {
    const year = this.data.yearList[this.data.yearIndex];
    let raw = db.getAnnualSummary(year);
    const rawNames = db.data.employees.map(e => e.name);
    const empOptions = ['全部'].concat(rawNames);
    // 员工筛选
    const empSel = this.data.empIndex > 0 ? empOptions[this.data.empIndex] : '';
    if (empSel) raw = raw.filter(r => r.name === empSel);
    const monthFilter = this.data.monthIdx > 0 ? this.data.monthIdx : 0;
    const rows = raw.map(r => ({
      name: r.name,
      // 只显示筛选月份的数据或全年12个月
      monthly: r.monthly.map((v, i) => (monthFilter === 0 || i + 1 === monthFilter) ? fmt.fmtMoney(v) : 0).map(v => parseFloat(v)),
      baseWageSum: fmt.fmtMoney(r.baseWageSum), perfSum: fmt.fmtMoney(r.perfSum),
      housingSum: fmt.fmtMoney(r.housingSum), otherSum: fmt.fmtMoney(r.otherSum),
      yearEndSum: fmt.fmtMoney(r.yearEndSum), socialSum: fmt.fmtMoney(r.socialSum),
      fundSum: fmt.fmtMoney(r.fundSum), loanSum: fmt.fmtMoney(r.loanSum), taxSum: fmt.fmtMoney(r.taxSum),
      total: fmt.fmtMoney(r.total)
    }));
    const grandTotal = fmt.fmtMoney(raw.reduce((s, r) => s + r.total, 0));
    const title = year + '年年度工资汇总' + (empSel ? ' - ' + empSel : '') + (monthFilter ? ' - ' + monthFilter + '月' : '');
    this.setData({ empOptions: empOptions, rows: rows, grandTotal: grandTotal, title: title });
  },

  exportCSV() {
    if (!this.data.rows.length) { wx.showToast({ title: '无数据可导出', icon: 'none' }); return; }
    const year = this.data.yearList[this.data.yearIndex];
    const monthFilter = this.data.monthIdx;
    const headers = ['序号', '姓名'];
    const monthCount = monthFilter ? [monthFilter] : [1,2,3,4,5,6,7,8,9,10,11,12];
    monthCount.forEach(m => headers.push(m + '月'));
    headers.push('基本工资', '绩效奖', '房贴', '其它补贴', '年终奖', '代扣社保', '代扣公积金', '扣借款', '代扣个税', '实发合计');
    const rows = [headers];
    this.data.rows.forEach((r, i) => {
      const row = [i + 1, r.name];
      monthCount.forEach(m => row.push(r.monthly[m - 1] || 0));
      row.push(r.baseWageSum, r.perfSum, r.housingSum, r.otherSum, r.yearEndSum, r.socialSum, r.fundSum, r.loanSum, r.taxSum, r.total);
      rows.push(row);
    });
    csv.exportFile('年度工资汇总_' + year + '年.csv', csv.toCSV(rows));
  }
});
