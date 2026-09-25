const db = require('../../../utils/schedule-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

const COLOR_DARK = {
  '#FF9500': '#C46F00', '#007AFF': '#0062D6', '#34C759': '#248A3D',
  '#5856D6': '#3B39A8', '#AF52DE': '#7A32A0', '#00C7BE': '#008F89'
};

const STATUS_CLASS = {
  '已出货': 'badge-green', '已交货': 'badge-green', '结束': 'badge-green',
  '生产中': 'badge-orange', '生产中 ': 'badge-orange'
};

Page({
  data: {
    modules: [
      { key: 'order', icon: '📋', name: '订单管理', color: '#007AFF', url: '/pages/schedule/order/order' },
      { key: 'notice', icon: '📄', name: '生产通知单', color: '#1A56DB', url: '/pages/schedule/notice/notice' },
      { key: 'production', icon: '🏭', name: '生产跟踪', color: '#FF9500', url: '/pages/schedule/production/production' },
      { key: 'finance', icon: '💰', name: '财务收款', color: '#34C759', url: '/pages/schedule/finance/finance' },
      { key: 'summary', icon: '📈', name: '汇总统计', color: '#5856D6', url: '/pages/schedule/summary/summary' },
      { key: 'calendar', icon: '📅', name: '日历记事', color: '#00C7BE', url: '/pages/schedule/calendar/calendar' },
      { key: 'memo', icon: '📝', name: '备忘录', color: '#AF52DE', url: '/pages/schedule/memo/memo' },
      { key: 'backup', icon: '💾', name: '数据备份', color: '#FF3B30', url: '/pages/schedule/backup/backup' },
      { key: 'cloudfiles', icon: '☁️', name: '云存储', color: '#0A84FF', url: '/pages/cloudfiles/cloudfiles?app=schedule' }
    ],
    dash: { total: 0, delivered: 0, pending: 0, totalAmount: 0, totalAmountText: '0.00', recent: [] },
    cloudOn: false,
    __syncState: 'idle'
  },

  onShow() {
    // 兜底校验：未通过密码验证时退回验证页
    const app = getApp();
    if (!(app.globalData && app.globalData.scheduleUnlocked)) {
      wx.redirectTo({ url: '/pages/trade/lock/lock?module=schedule' });
      return;
    }
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud((ok, count) => {
      this.render();
      wx.stopPullDownRefresh();
      if (ok) wx.showToast({ title: '已同步云端（' + count + ' 项）', icon: 'none' });
      else wx.showToast({ title: '云端同步失败', icon: 'none' });
    });
  },

  render() {
    const dash = db.getDashboard();
    dash.totalAmountText = fmt.fmtMoney(dash.totalAmount);
    dash.recent = dash.recent.map(o => Object.assign({}, o, {
      amountText: fmt.fmtMoney(db.toCNY(o.orderAmount, o.currency)),
      badgeClass: STATUS_CLASS[o.status] || 'badge-gray'
    }));
    this.setData({ dash, cloudOn: supa.isConfigured() });
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },

  pullCloud() {
    if (!supa.isConfigured()) {
      wx.showToast({ title: '未配置 CloudBase', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '同步中...' });
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      this.render();
      if (ok) wx.showToast({ title: '已拉取云端（' + count + ' 项）', icon: 'success' });
      else wx.showToast({ title: '拉取失败，请检查网络', icon: 'none' });
    });
  },

  // 手动锁定排程模块，下次从门户进入需重新验证密码
  lockModule() {
    wx.showModal({
      title: '锁定排程模块',
      content: '锁定后，下次进入需重新输入访问密码。',
      confirmText: '锁定',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        getApp().globalData.scheduleUnlocked = false;
        wx.showToast({ title: '已锁定', icon: 'success', duration: 800 });
        setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 500);
      }
    });
  },

  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
