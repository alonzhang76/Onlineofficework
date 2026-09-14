const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

const COLOR_DARK = { '#5856D6': '#3B39A8', '#007AFF': '#0062D6', '#34C759': '#248A3D', '#FF9500': '#C46F00', '#FF3B30': '#C1271E', '#00C7BE': '#008F89', '#AF52DE': '#7A32A0' };

Page({
  data: {
    companyIdx: 0,
    modules: [
      { key: 'order', icon: '📋', name: '采购订单', color: '#007AFF', url: '/pages/purchase/order/order' },
      { key: 'invoice', icon: '🧾', name: '发票登记', color: '#FF9500', url: '/pages/purchase/invoice/invoice' },
      { key: 'payment', icon: '💳', name: '付款管理', color: '#34C759', url: '/pages/purchase/payment/payment' },
      { key: 'supplier', icon: '🏭', name: '供应商', color: '#00C7BE', url: '/pages/purchase/supplier/supplier' },
      { key: 'contract', icon: '📦', name: '合同台账', color: '#5856D6', url: '/pages/purchase/contract/contract' },
      { key: 'report', icon: '📈', name: '报表统计', color: '#AF52DE', url: '/pages/purchase/report/report' },
      { key: 'backup', icon: '💾', name: '数据备份', color: '#FF3B30', url: '/pages/purchase/backup/backup' }
    ],
    stats: {},
    cloudOn: false,
    __syncState: 'idle'
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      this.render();
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已同步云端数据', icon: 'none' });
    });
  },

  render() {
    const company = db.COMPANIES[this.data.companyIdx].id;
    const stats = db.getStats(company);
    stats.purchaseTotalText = fmt.fmtMoney(stats.purchaseTotal);
    stats.invoiceTotalText = fmt.fmtMoney(stats.invoiceTotal);
    stats.paymentTotalText = fmt.fmtMoney(stats.paymentTotal);
    stats.payableText = fmt.fmtMoney(stats.payable);
    this.setData({ stats, cloudOn: supa.isConfigured() });
  },

  onCompany(e) {
    this.setData({ companyIdx: +e.currentTarget.dataset.i });
    this.render();
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url + '?company=' + db.COMPANIES[this.data.companyIdx].id }); },

  pullCloud() {
    if (!supa.isConfigured()) { wx.showToast({ title: '未配置 CloudBase', icon: 'none' }); return; }
    wx.showLoading({ title: '同步中...' });
    db.syncFromCloud(() => { wx.hideLoading(); this.render(); wx.showToast({ title: '已拉取云端', icon: 'success' }); });
  },

  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
