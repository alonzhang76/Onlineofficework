const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');

const STATUS_CLASS = { '待生产': 'badge-gray', '生产中': 'badge-orange', '已出货': 'badge-green' };

Page({
  data: {
    tab: 0,

    stat: { monthlyReceipt: '0.00', yearlyReceipt: '0.00', totalReceipt: '0.00', monthlyPayment: '0.00', yearlyPayment: '0.00', totalPayment: '0.00' },
    netAmount: '0.00',

    receiptByCustomer: [], receiptByCurrency: [],
    paymentByCustomer: [], paymentByType: [],

    reminders: [], remWarning: 0, remInfo: 0, remSuccess: 0,

    debts: [], debtCount: 0, totalDebtCNY: '0.00'
  },

  onShow() { this.render(); },

  onTab(e) { this.setData({ tab: +e.currentTarget.dataset.i }); },

  render() {
    /* ---- 收汇 / 付款统计 ---- */
    const raw = db.getReportStatistics();
    const stat = {
      monthlyReceipt: fmt.fmtMoney(raw.monthlyReceipt),
      yearlyReceipt: fmt.fmtMoney(raw.yearlyReceipt),
      totalReceipt: fmt.fmtMoney(raw.totalReceipt),
      monthlyPayment: fmt.fmtMoney(raw.monthlyPayment),
      yearlyPayment: fmt.fmtMoney(raw.yearlyPayment),
      totalPayment: fmt.fmtMoney(raw.totalPayment)
    };
    const netAmount = fmt.fmtMoney(raw.totalReceipt - raw.totalPayment);

    /* ---- 按客户汇总收汇 ---- */
    const rCust = {};
    db.data.receiptRecords.forEach(r => {
      const key = r.customer || '未填写客户';
      if (!rCust[key]) rCust[key] = { name: key, cny: 0, amount: 0, count: 0 };
      rCust[key].cny += (db.num(r.amountReceived) - db.num(r.fee)) * (db.num(r.exchangeRate) || 1);
      rCust[key].amount += db.num(r.amountReceived);
      rCust[key].count++;
    });
    const receiptByCustomer = Object.values(rCust)
      .sort((a, b) => b.cny - a.cny)
      .map(x => ({ name: x.name, cny: fmt.fmtMoney(x.cny), amount: fmt.fmtMoney(x.amount), count: x.count }));

    /* ---- 按货币汇总收汇 ---- */
    const rCur = {};
    db.data.receiptRecords.forEach(r => {
      const key = r.currency || 'USD';
      if (!rCur[key]) rCur[key] = { name: key, amount: 0, cny: 0 };
      rCur[key].amount += db.num(r.amountReceived);
      rCur[key].cny += (db.num(r.amountReceived) - db.num(r.fee)) * (db.num(r.exchangeRate) || 1);
    });
    const receiptByCurrency = Object.values(rCur)
      .sort((a, b) => b.cny - a.cny)
      .map(x => ({ name: x.name, amount: fmt.fmtMoney(x.amount), cny: fmt.fmtMoney(x.cny) }));

    /* ---- 按客户汇总付款 ---- */
    const pCust = {};
    db.data.indexPaymentRecords.forEach(p => {
      const key = p.customer || '未填写客户';
      if (!pCust[key]) pCust[key] = { name: key, amount: 0, count: 0 };
      pCust[key].amount += db.num(p.amount);
      pCust[key].count++;
    });
    const paymentByCustomer = Object.values(pCust)
      .sort((a, b) => b.amount - a.amount)
      .map(x => ({ name: x.name, amount: fmt.fmtMoney(x.amount), count: x.count }));

    /* ---- 按付款类型汇总 ---- */
    const pType = {};
    db.data.indexPaymentRecords.forEach(p => {
      const key = p.paymentMethod || '未分类';
      if (!pType[key]) pType[key] = { name: key, amount: 0, count: 0 };
      pType[key].amount += db.num(p.amount);
      pType[key].count++;
    });
    const paymentByType = Object.values(pType)
      .sort((a, b) => b.amount - a.amount)
      .map(x => ({ name: x.name, amount: fmt.fmtMoney(x.amount), count: x.count }));

    /* ---- 订单提醒 ---- */
    const rawRem = db.generateOrderReminders();
    const reminders = rawRem.map((r, i) => ({ idx: i, type: r.type, icon: r.icon, text: r.text, orderNo: r.orderNo }));

    /* ---- 欠款统计 ---- */
    const rawDebts = db.generateDebtStatistics();
    const debts = rawDebts.map(d => ({
      orderNo: d.orderNo, customer: d.customer, currency: d.currency,
      orderAmount: fmt.fmtMoney(d.orderAmount),
      totalReceived: fmt.fmtMoney(d.totalReceived),
      debtAmount: fmt.fmtMoney(d.debtAmount),
      debtCNY: fmt.fmtMoney(db.num(d.debtAmount) * (db.FIXED_RATES[d.currency] || 1)),
      createTime: fmt.fmtDate(d.createTime),
      status: d.status, statusClass: STATUS_CLASS[d.status] || 'badge-gray'
    }));

    this.setData({
      stat, netAmount,
      receiptByCustomer, receiptByCurrency,
      paymentByCustomer, paymentByType,
      reminders,
      remWarning: reminders.filter(r => r.type === 'warning').length,
      remInfo: reminders.filter(r => r.type === 'info').length,
      remSuccess: reminders.filter(r => r.type === 'success').length,
      debts, debtCount: debts.length,
      totalDebtCNY: fmt.fmtMoney(db.getTotalDebtCNY(rawDebts))
    });
  }
});
