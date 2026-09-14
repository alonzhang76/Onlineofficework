const db = require('../../../utils/wage-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

Page({
  data: {
    tab: 'overview',
    startDate: '', endDate: '',
    yearList: [], yearIdx: 0,
    ov: {}, em: {}, ord: {}, os: {}, tr: {}, mx: {}
  },

  onLoad() {
    const years = [];
    for (let y = 2021; y <= 2030; y++) years.push(y);
    const cur = new Date().getFullYear();
    this.setData({
      yearList: years,
      yearIdx: years.indexOf(cur) >= 0 ? years.indexOf(cur) : 0,
      startDate: cur + '-01-01',
      endDate: fmt.today()
    });
  },

  onShow() {
    this.render();
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); this.render(); },
  onStartDate(e) { this.setData({ startDate: e.detail.value }); this.render(); },
  onEndDate(e) { this.setData({ endDate: e.detail.value }); this.render(); },
  onStatYear(e) { this.setData({ yearIdx: +e.detail.value }); this.render(); },

  render() {
    const t = this.data.tab;
    if (t === 'orderStat') { this.renderOrderStat(); return; }
    const filters = { startDate: this.data.startDate, endDate: this.data.endDate };
    if (t === 'overview') this.renderOverview(filters);
    else if (t === 'employee') this.renderEmployee(filters);
    else if (t === 'order') this.renderOrder(filters);
    else if (t === 'trend') this.renderTrend(filters);
    else if (t === 'matrix') this.renderMatrix(filters);
  },

  renderOverview(filters) {
    const recs = db.queryRecords(filters);
    if (!recs.length) { this.setData({ ov: { daily: [], procTop: [], empTop: [], custTop: [] } }); return; }
    const totalAmount = recs.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    const totalRecords = recs.length;
    const empSet = new Set(recs.map(r => r.employee));
    const dates = Array.from(new Set(recs.map(r => r.date))).sort();
    const avgDaily = dates.length ? totalAmount / dates.length : 0;
    const avgEmp = empSet.size ? totalAmount / empSet.size : 0;
    const totalOutput = db.data.orders.reduce((s, o) => s + (+o.output || 0), 0);
    // 每日
    const dayMap = {};
    recs.forEach(r => { dayMap[r.date] = (dayMap[r.date] || 0) + (+r.totalAmount || 0); });
    const dayList = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-15);
    const maxDay = dayList.length ? Math.max.apply(null, dayList.map(x => x[1])) : 1;
    const daily = dayList.map(x => ({
      date: x[0].slice(5), amount: fmt.fmtMoney(x[1]),
      bar: Math.min(100, x[1] / maxDay * 100).toFixed(0),
      vs: (x[1] / avgDaily > 1 ? '↑+' : x[1] / avgDaily < 1 ? '↓' : '→') + Math.abs((x[1] / avgDaily - 1) * 100).toFixed(0) + '%',
      up: x[1] >= avgDaily
    }));
    const pct = v => totalAmount > 0 ? (v / totalAmount * 100).toFixed(1) : '0';
    const procTop = db.getStats(filters, 'process').slice(0, 6).map(p => ({ name: p.name, totalAmount: fmt.fmtMoney(p.totalAmount), pct: pct(p.totalAmount) }));
    const empTop = db.getStats(filters, 'employee').slice(0, 5).map(p => ({ name: p.name, totalAmount: fmt.fmtMoney(p.totalAmount), pct: pct(p.totalAmount) }));
    const custTop = db.getStats(filters, 'customer').slice(0, 5).map(p => ({ name: p.name, totalAmount: fmt.fmtMoney(p.totalAmount), pct: pct(p.totalAmount) }));
    this.setData({
      ov: { totalAmount: fmt.fmtMoney(totalAmount), totalRecords, dateCount: dates.length, avgDaily: fmt.fmtMoney(avgDaily), avgEmp: fmt.fmtMoney(avgEmp), empCount: empSet.size, totalOutput: Math.round(totalOutput), daily, procTop, empTop, custTop }
    });
  },

  renderEmployee(filters) {
    const recs = db.queryRecords(filters);
    const empMap = {};
    recs.forEach(r => {
      if (!empMap[r.employee]) empMap[r.employee] = { amount: 0, days: {} };
      empMap[r.employee].amount += +r.totalAmount || 0;
      empMap[r.employee].days[r.date] = 1;
    });
    const rows = Object.keys(empMap).map(name => ({
      name, totalAmount: empMap[name].amount, totalDays: Object.keys(empMap[name].days).length
    })).filter(r => r.totalAmount > 0).map(r => Object.assign(r, { dailyAvg: r.totalDays ? r.totalAmount / r.totalDays : 0 }))
      .sort((a, b) => b.dailyAvg - a.dailyAvg);
    const maxDaily = rows.length ? rows[0].dailyAvg : 1;
    const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
    const grandDays = rows.reduce((s, r) => s + r.totalDays, 0);
    this.setData({
      em: {
        count: rows.length, grandTotal: fmt.fmtMoney(grandTotal), grandDays,
        avgTotal: rows.length ? fmt.fmtMoney(grandTotal / rows.length) : '0.00',
        rows: rows.map(r => ({ name: r.name, totalAmount: fmt.fmtMoney(r.totalAmount), totalDays: r.totalDays, dailyAvg: fmt.fmtMoney(r.dailyAvg), bar: Math.min(100, r.dailyAvg / maxDaily * 100).toFixed(0) }))
      }
    });
  },

  renderOrder(filters) {
    const recs = db.queryRecords(filters);
    const map = {};
    recs.forEach(r => {
      const key = r.orderNo || '(无订单号)';
      if (!map[key]) map[key] = { orderNo: key, amount: 0, customer: r.customer || '' };
      map[key].amount += +r.totalAmount || 0;
    });
    db.data.orders.forEach(o => {
      if (map[o.orderNo]) {
        map[o.orderNo].output = +o.output || 0;
        map[o.orderNo].orderQty = +o.qty || 0;
        map[o.orderNo].drawingNo = o.drawingNo || '';
        map[o.orderNo].productType = o.type || '';
      }
    });
    const rows = Object.values(map).sort((a, b) => b.amount - a.amount).map(o => {
      const unitCost = o.output > 0 ? o.amount / o.output : null;
      const warning = !o.output || (o.orderQty && o.output < o.orderQty);
      return {
        orderNo: o.orderNo, customer: o.customer, productType: o.productType || '', drawingNo: o.drawingNo || '',
        amount: fmt.fmtMoney(o.amount), output: o.output || 0, orderQty: o.orderQty || '',
        unitCost: unitCost !== null ? fmt.fmtMoney(unitCost) + ' 元/件' : '无法计算',
        warning: !!warning
      };
    });
    this.setData({
      ord: {
        count: rows.length,
        totalAmount: fmt.fmtMoney(rows.reduce((s, o) => s + (+o.amount || 0), 0)),
        maxAmount: rows.length ? rows[0].amount : '0.00',
        maxOrderNo: rows.length ? rows[0].orderNo : '',
        warnCount: rows.filter(o => o.warning).length,
        rows
      }
    });
  },

  renderOrderStat() {
    const year = this.data.yearList[this.data.yearIdx];
    const orders = db.data.orders.filter(o => o.orderDate && String(o.orderDate).slice(0, 4) === String(year));
    if (!orders.length) { this.setData({ os: { hasData: false, monthly: [], byType: [], byDrawing: [], byCustomer: [] } }); return; }
    const monthTotals = new Array(13).fill(0);
    const typeMap = {}, dwgMap = {}, custMap = {};
    orders.forEach(o => {
      for (let m = 1; m <= 12; m++) {
        const v = +o['m' + m] || 0;
        if (!v) continue;
        monthTotals[m] += v;
        const t = o.type || '未分类';
        typeMap[t] = (typeMap[t] || 0) + v;
        const d = o.drawingNo || '无图号';
        dwgMap[d] = (dwgMap[d] || 0) + v;
        const c = o.customer || '未知客户';
        custMap[c] = (custMap[c] || 0) + v;
      }
    });
    const yearTotal = monthTotals.slice(1).reduce((s, v) => s + v, 0);
    const maxMonth = Math.max.apply(null, monthTotals.slice(1).concat([1]));
    const monthly = [];
    for (let m = 1; m <= 12; m++) monthly.push({ month: m, value: monthTotals[m], bar: Math.min(100, monthTotals[m] / maxMonth * 100).toFixed(0) });
    const toRank = map => Object.keys(map).map(k => ({ name: k, sum: map[k], pct: yearTotal > 0 ? (map[k] / yearTotal * 100).toFixed(1) : '0' }))
      .sort((a, b) => b.sum - a.sum);
    this.setData({
      os: {
        hasData: true, yearTotal,
        typeCount: Object.keys(typeMap).length, dwgCount: Object.keys(dwgMap).length, custCount: Object.keys(custMap).length,
        monthly, byType: toRank(typeMap), byDrawing: toRank(dwgMap), byCustomer: toRank(custMap)
      }
    });
  },

  renderTrend(filters) {
    const recs = db.queryRecords(filters);
    const map = {};
    recs.forEach(r => {
      const m = String(r.date).slice(0, 7);
      if (!map[m]) map[m] = { amount: 0, qty: 0, emps: {}, days: {} };
      map[m].amount += +r.totalAmount || 0;
      map[m].qty += +r.quantity || 0;
      map[m].emps[r.employee] = 1;
      map[m].days[r.date] = 1;
    });
    const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) { this.setData({ tr: { months: [], avgMonth: '0.00', maxAmt: '0', minAmt: '0', maxMonth: '', minMonth: '' } }); return; }
    const amounts = entries.map(x => x[1].amount);
    const totalAmount = amounts.reduce((s, v) => s + v, 0);
    const maxAmt = Math.max.apply(null, amounts);
    const minAmt = Math.min.apply(null, amounts);
    const months = entries.map(x => ({
      month: x[0], amount: fmt.fmtMoney(x[1].amount), qty: Math.round(x[1].qty),
      emps: Object.keys(x[1].emps).length, days: Object.keys(x[1].days).length,
      bar: Math.min(100, x[1].amount / maxAmt * 100).toFixed(0)
    }));
    this.setData({
      tr: {
        months, avgMonth: fmt.fmtMoney(totalAmount / entries.length),
        maxAmt: fmt.fmtMoney(maxAmt), minAmt: fmt.fmtMoney(minAmt),
        maxMonth: entries[amounts.indexOf(maxAmt)][0], minMonth: entries[amounts.indexOf(minAmt)][0]
      }
    });
  },

  renderMatrix(filters) {
    const m = db.getStatsMatrix(filters);
    const rowTotals = {}, colTotals = {};
    let grand = 0;
    const matrix = {};
    m.empNames.forEach(e => {
      matrix[e] = {};
      let rt = 0;
      m.procNames.forEach(p => {
        const v = Math.round(m.matrix[e][p] * 100) / 100;
        matrix[e][p] = v;
        rt += v;
        colTotals[p] = (colTotals[p] || 0) + v;
      });
      rowTotals[e] = fmt.fmtMoney(rt);
      grand += rt;
    });
    this.setData({
      mx: {
        emps: m.empNames, procs: m.procNames, matrix,
        rowTotals,
        colTotals: m.procNames.map(p => fmt.fmtMoney(colTotals[p])),
        grandTotal: fmt.fmtMoney(grand)
      }
    });
  },

  exportCSV() {
    const t = this.data.tab;
    if (t === 'orderStat') { this.exportOrderStat(); return; }
    const filters = { startDate: this.data.startDate, endDate: this.data.endDate };
    let rows;
    if (t === 'overview') {
      rows = [['日期', '姓名', '工序', '单价', '数量', '金额', '客户', '订单号', '备注']];
      db.queryRecords(filters).forEach(r => rows.push([r.date, r.employee, r.process, r.unitPrice, r.quantity, r.totalAmount, r.customer || '', r.orderNo || '', r.notes || '']));
    } else if (t === 'employee') {
      rows = [['排名', '姓名', '工资合计', '出勤天数', '日均工资']];
      this.data.em.rows.forEach((r, i) => rows.push([i + 1, r.name, r.totalAmount, r.totalDays, r.dailyAvg]));
    } else if (t === 'order') {
      rows = [['排名', '订单号', '客户', '工资总额', '产出数量', '订单数量', '单品成本', '状态']];
      this.data.ord.rows.forEach((o, i) => rows.push([i + 1, o.orderNo, o.customer, o.amount, o.output, o.orderQty, o.unitCost, o.warning ? '异常' : '正常']));
    } else if (t === 'trend') {
      rows = [['月份', '工资总额', '产量', '人数', '工作日']];
      this.data.tr.months.forEach(m => rows.push([m.month, m.amount, m.qty, m.emps, m.days]));
    } else if (t === 'matrix') {
      rows = [['员工'].concat(this.data.mx.procs, ['合计'])];
      this.data.mx.emps.forEach(e => {
        const row = [e];
        this.data.mx.procs.forEach(p => row.push(this.data.mx.matrix[e][p]));
        row.push(this.data.mx.rowTotals[e]);
        rows.push(row);
      });
    } else { rows = [['无数据']]; }
    csv.exportFile('统计分析_' + t + '_' + fmt.today() + '.csv', csv.toCSV(rows));
  },

  exportOrderStat() {
    const year = this.data.yearList[this.data.yearIdx];
    const os = this.data.os;
    if (!os.hasData) { wx.showToast({ title: year + '年无订单数据', icon: 'none' }); return; }
    const rows = [['月份', '产出数量']];
    os.monthly.forEach(m => rows.push([m.month + '月', m.value]));
    rows.push(['合计', os.yearTotal]);
    rows.push([], ['炉架类型', '产出']);
    os.byType.forEach(t => rows.push([t.name, t.sum]));
    rows.push([], ['图纸号', '产出']);
    os.byDrawing.forEach(t => rows.push([t.name, t.sum]));
    rows.push([], ['客户', '产出']);
    os.byCustomer.forEach(t => rows.push([t.name, t.sum]));
    csv.exportFile('订单统计_' + year + '年.csv', csv.toCSV(rows));
  }
});
