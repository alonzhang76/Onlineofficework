const db = require('../../../utils/trade-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

const COLOR_DARK = {
  '#007AFF': '#0062D6',
  '#34C759': '#248A3D',
  '#FF9500': '#C46F00',
  '#5856D6': '#3B39A8',
  '#FF3B30': '#C1271E',
  '#00C7BE': '#008F89',
  '#AF52DE': '#7A32A0',
  '#8E8E93': '#636366',
  '#0A84FF': '#0064D2'
};

Page({
  data: {
    modules: [],
    overview: [],
    cloudOn: false,
    __syncState: 'idle'
  },

  onShow() {
    // 兜底校验：未通过密码验证时退回验证页（防止绕过门户直接进入）
    const app = getApp();
    if (!(app.globalData && app.globalData.tradeUnlocked)) {
      wx.redirectTo({ url: '/pages/trade/lock/lock' });
      return;
    }
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  render() {
    const d = db.data;
    const modules = [
      { key: 'memo', icon: '📝', name: '备忘录', nameEn: 'Memo', color: '#FF9500', url: '/pages/trade/memo/memo', count: d.memoRecords.length },
      { key: 'business', icon: '📈', name: '业务跟踪', nameEn: 'Business', color: '#5856D6', url: '/pages/trade/business/business', count: d.businessRecords.length },
      { key: 'payment', icon: '💳', name: '账务管理', nameEn: 'Payment', color: '#AF52DE', url: '/pages/trade/payment/payment', count: d.indexPaymentRecords.length },
      { key: 'invoice', icon: '📄', name: '发票管理', nameEn: 'Invoice', color: '#00C7BE', url: '/pages/trade/invoice/invoice', count: d.invoiceRecords.length },
      { key: 'export', icon: '📤', name: '出口管理', nameEn: 'Export', color: '#007AFF', url: '/pages/trade/export/export', count: d.exportRecords.length },
      { key: 'receipt', icon: '💰', name: '收汇管理', nameEn: 'Receipt', color: '#34C759', url: '/pages/trade/receipt/receipt', count: d.receiptRecords.length },
      { key: 'order', icon: '📋', name: '订单管理', nameEn: 'Order', color: '#FF3B30', url: '/pages/trade/order/order', count: d.orderRecords.length },
      { key: 'customer', icon: '👥', name: '客户信息', nameEn: 'Customer', color: '#8E8E93', url: '/pages/trade/customer/customer', count: d.customerRecords.length },
      { key: 'customerStats', icon: '📊', name: '客户统计', nameEn: 'Cust. Stats', color: '#5AC8FA', url: '/pages/trade/customer-stats/customer-stats', count: 0 },
      { key: 'notice', icon: '🏭', name: '生产通知单', nameEn: 'Prod. Notice', color: '#34C759', url: '/pages/trade/notice/notice', count: 0 },
      { key: 'mark', icon: '🏷️', name: '制作箱唛', nameEn: 'Box Mark', color: '#FF9500', url: '/pages/trade/mark/mark', count: 0 },
      { key: 'shipment', icon: '🚢', name: '出货与报关', nameEn: 'Shipping', color: '#007AFF', url: '/pages/trade/shipment/shipment', count: d.customsRecords.length },
      { key: 'report', icon: '📈', name: '报表统计', nameEn: 'Report', color: '#5856D6', url: '/pages/trade/report/report', count: 0 },
      { key: 'cloudfiles', icon: '☁️', name: '云存储', nameEn: 'Cloud Files', color: '#0A84FF', url: '/pages/cloudfiles/cloudfiles?app=trade', count: 0 }
    ].map(m => Object.assign(m, { colorDark: COLOR_DARK[m.color] || m.color }));

    const stat = db.getReportStatistics();
    const debts = db.generateDebtStatistics();
    const debtCNY = db.getTotalDebtCNY(debts);

    this.setData({
      modules: modules,
      cloudOn: supa.isConfigured(),
      overview: [
        { label: '订单数', value: d.orderRecords.length, color: '#007AFF' },
        { label: '出口记录', value: d.exportRecords.length, color: '#007AFF' },
        { label: '收汇(CNY)', value: fmt.fmtMoney(stat.totalReceipt), color: '#34C759' },
        { label: '付款(CNY)', value: fmt.fmtMoney(stat.totalPayment), color: '#AF52DE' },
        { label: '客户数', value: d.customerRecords.length, color: '#FF9500' },
        { label: '欠款(CNY)', value: fmt.fmtMoney(debtCNY), color: '#FF3B30' }
      ]
    });
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
  goBackup() { wx.navigateTo({ url: '/pages/trade/backup/backup' }); },
  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
