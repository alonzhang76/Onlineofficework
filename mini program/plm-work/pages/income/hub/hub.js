const db = require('../../../utils/income-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

const COLOR_DARK = { '#00C7BE': '#008F89', '#007AFF': '#0062D6', '#34C759': '#248A3D', '#FF9500': '#C46F00', '#5856D6': '#3B39A8', '#FF3B30': '#C1271E' };

// 自动云端同步节流时间戳（避免每次 onShow 都请求云端）
let lastCloudSync = 0;

Page({
  data: {
    companyIdx: 0,
    companyName: '',
    modules: [
      { key: 'list', icon: '📒', name: '流水明细', color: '#007AFF', url: '/pages/income/list/list' },
      { key: 'add', icon: '➕', name: '记一笔', color: '#34C759', url: '/pages/income/list/list?action=new' },
      { key: 'todo', icon: '✅', name: '待办事项', color: '#FF9500', url: '/pages/income/todo/todo' },
      { key: 'report', icon: '📈', name: '统计汇总', color: '#5856D6', url: '/pages/income/report/report' },
      { key: 'backup', icon: '💾', name: '数据备份', color: '#00C7BE', url: '/pages/income/backup/backup' }
    ],
    stats: {},
    recent: [],
    cloudOn: false,
    __syncState: 'idle'
  },

  onShow() {
    // 兜底校验：未通过密码验证时退回验证页
    const app = getApp();
    if (!(app.globalData && app.globalData.incomeExpenseUnlocked)) {
      wx.redirectTo({ url: '/pages/trade/lock/lock?module=incomeexpense' });
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

  company() { return db.COMPANIES[this.data.companyIdx].id; },

  render() {
    const c = this.company();
    const s = db.getStats(c);
    s.incomeText = fmt.fmtMoney(s.income);
    s.expenseText = fmt.fmtMoney(s.expense);
    s.balanceText = fmt.fmtMoney(s.balance);
    const recent = db.queryTx(c, {}).slice(0, 6).map(t => Object.assign({}, t, {
      amountText: fmt.fmtMoney(t.amount)
    }));
    this.setData({
      stats: s,
      recent,
      companyName: db.COMPANIES[this.data.companyIdx].short,
      cloudOn: supa.isConfigured()
    });
  },

  onCompany(e) {
    this.setData({ companyIdx: +e.currentTarget.dataset.i });
    this.render();
  },

  go(e) {
    const url = e.currentTarget.dataset.url;
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    wx.navigateTo({ url: url + sep + 'company=' + this.company() });
  },

  pullCloud() {
    if (!supa.isConfigured()) { wx.showToast({ title: '未配置 CloudBase', icon: 'none' }); return; }
    wx.showLoading({ title: '同步中...' });
    db.syncFromCloud((ok, count) => { wx.hideLoading(); this.render(); if (ok) wx.showToast({ title: '已拉取云端（' + count + ' 项）', icon: 'success' }); else wx.showToast({ title: '拉取失败，请检查网络', icon: 'none' }); });
  },

  lockModule() {
    wx.showModal({
      title: '锁定收支模块',
      content: '锁定后，下次进入需重新输入访问密码。',
      confirmText: '锁定',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        getApp().globalData.incomeExpenseUnlocked = false;
        wx.showToast({ title: '已锁定', icon: 'success', duration: 800 });
        setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 500);
      }
    });
  },

  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
