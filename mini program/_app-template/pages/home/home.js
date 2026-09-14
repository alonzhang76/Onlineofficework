const db = require('../../utils/db');
const cb = require('../../utils/cloudbase');
const fmt = require('../../utils/format');

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

Page({
  data: {
    appName: '',
    todayText: '',
    weekText: '',
    stats: [],
    modules: [],
    user: null,
    userLabel: '',
    userBadge: '',
    cloudOn: false
  },

  onLoad() {
    const now = new Date();
    this.setData({
      todayText: now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日',
      weekText: WEEK[now.getDay()]
    });
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) {
      app.globalData.user = cb.getUser();
    }
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      this.render();
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已同步云端数据', icon: 'none' });
    });
  },

  onCloudUpdate() { this.render(); },

  render() {
    const app = getApp();
    const modules = app.globalData.modules || [];

    const stats = modules
      .filter(m => m.stat)
      .map(m => {
        const recs = db.get(m.key) || [];
        let value = recs.length;
        let label = '条' + (m.statLabel || '记录');
        if (m.stat === 'sum' && m.sumField) {
          value = recs.reduce((s, r) => s + (Number(r[m.sumField]) || 0), 0);
          label = m.statLabel || '合计';
          return { key: m.key, label: label, value: fmt.fmtMoney(value), color: m.color, money: true };
        }
        return { key: m.key, label: label, value: String(value), color: m.color, money: false };
      });

    const email = (app.globalData.user && app.globalData.user.email) || '';

    this.setData({
      appName: app.globalData.appName,
      modules: modules.map(m => {
        const recs = db.get(m.key) || [];
        let count = recs.length;
        if (m.stat === 'sum' && m.sumField) {
          const sum = recs.reduce((s, r) => s + (Number(r[m.sumField]) || 0), 0);
          count = '¥' + fmt.fmtMoney(sum);
        }
        return { key: m.key, name: m.title, icon: m.icon, url: m.url, count: String(count) };
      }),
      stats: stats.slice(0, 4),
      cloudOn: cb.isConfigured(),
      user: app.globalData.user,
      userLabel: email || '已登录',
      userBadge: (email ? email.slice(0, 1).toUpperCase() : '用')
    });
  },

  openModule(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#e02020',
      success: res => {
        if (!res.confirm) return;
        cb.logoutUser();
        getApp().globalData.user = null;
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  },

  goCloud() { wx.navigateTo({ url: '/pages/cloudfiles/cloudfiles?app=main' }); },
  goBackup() { wx.navigateTo({ url: '/pages/backup/backup' }); }
});
