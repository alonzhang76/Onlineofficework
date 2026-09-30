/**
 * 数据统计 — 合同 · 开票 · 付款 · 供应商维度汇总
 * 全部取自 db.reportStats()（与桌面端 reports.html 同口径）。
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

Page({
  data: {
    ready: false, denied: false,
    kpi: { totalAmount: '0.00', orderCount: 0, invoiced: '0.00', invoiceRate: 0, paid: '0.00', waitPay: '0.00', recvTotal: 0, retTotal: 0 },
    bySupplier: [], months: [],
    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('reports')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true });
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); });
  },

  render() {
    const s = db.reportStats();
    this.setData({
      kpi: {
        totalAmount: fmt.fmtMoney(s.totalAmount), orderCount: s.orderCount,
        invoiced: fmt.fmtMoney(s.invoiced), invoiceRate: s.invoiceRate,
        paid: fmt.fmtMoney(s.paid), waitPay: fmt.fmtMoney(s.waitPay),
        recvTotal: s.recvTotal, retTotal: s.retTotal
      },
      bySupplier: s.bySupplier.map(x => ({
        name: x.name, cnt: x.cnt, pct: x.pct,
        amount: fmt.fmtMoney(x.amount),
        inv: fmt.fmtMoney(x.inv),
        pay: fmt.fmtMoney(x.pay),
        wait: fmt.fmtMoney(x.wait),
        waitRaw: x.wait
      })),
      months: s.months.map(m => ({
        month: m.month, amt: fmt.fmtMoney(m.amt), inv: fmt.fmtMoney(m.inv), pay: fmt.fmtMoney(m.pay)
      }))
    });
  },

  exportCSV() {
    const rows = this.data.bySupplier;
    if (!rows.length) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }
    const out = [['供应商', '合同数', '合同金额', '开票金额', '付款金额', '待付金额']];
    rows.forEach(r => out.push([r.name, r.cnt, r.amount, r.inv, r.pay, r.wait]));
    csv.exportFile('供应商汇总_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  exportMonths() {
    const ms = this.data.months;
    if (!ms.length) { wx.showToast({ title: '暂无月度数据', icon: 'none' }); return; }
    const out = [['月份', '合同金额', '开票金额', '付款金额']];
    ms.forEach(m => out.push([m.month, m.amt, m.inv, m.pay]));
    csv.exportFile('月度趋势_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  goRecon() { wx.navigateTo({ url: '/pages/purchase/recon/recon' }); },
  goPayment() { wx.navigateTo({ url: '/pages/purchase/payment/payment' }); },
  noop() {}
});
