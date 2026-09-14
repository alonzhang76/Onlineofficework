const wageDb = require('../../utils/wage-db');
const tradeDb = require('../../utils/trade-db');
const scheduleDb = require('../../utils/schedule-db');
const purchaseDb = require('../../utils/purchase-db');
const incomeDb = require('../../utils/income-db');
const supa = require('../../utils/cloudbase');
const fmt = require('../../utils/format');

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

Page({
  data: {
    apps: [],
    overview: [],
    cloudOn: false,
    todayText: '',
    weekText: '',
    user: null,
    userLabel: '',
    userBadge: '',
    noPerms: false,
    __syncState: 'idle'
  },

  onLoad() {
    const now = new Date();
    this.setData({
      todayText: now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日',
      weekText: WEEK[now.getDay()]
    });
  },

  onShow() {
    // 登录门禁：未登录跳转统一登录页
    const app = getApp();
    if (!app.globalData.user) {
      app.globalData.user = supa.getUser();
    }
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    // 从 app 同步一下当前云端同步状态（驱动指示灯）
    if (typeof supa.getSyncState === 'function') {
      this.setData({ __syncState: supa.getSyncState() });
    }
    this.render();
  },

  onPullDownRefresh() {
    Promise.all([
      new Promise(r => wageDb.syncFromCloud(r)),
      new Promise(r => tradeDb.syncFromCloud(r)),
      new Promise(r => scheduleDb.syncFromCloud(r)),
      new Promise(r => purchaseDb.syncFromCloud(r)),
      new Promise(r => incomeDb.syncFromCloud(r))
    ]).then(() => {
      this.render();
      wx.stopPullDownRefresh();
      wx.showToast({ title: '已同步云端数据', icon: 'none' });
    }).catch(() => {
      this.render();
      wx.stopPullDownRefresh();
    });
  },

  render() {
    const app = getApp();
    const wageTotal = wageDb.data.records.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    const tradeOrders = tradeDb.data.orderRecords.length;
    const tradeDebts = tradeDb.generateDebtStatistics();
    const tradeDebtCNY = tradeDb.getTotalDebtCNY(tradeDebts);
    const schedOrders = scheduleDb.data.production_orders_data.length;
    const purchTotal = purchaseDb.getStats('companyA').purchaseTotal + purchaseDb.getStats('companyB').purchaseTotal;
    const incStatsA = incomeDb.getStats('company1');
    const incStatsB = incomeDb.getStats('company2');
    const incBalance = incStatsA.balance + incStatsB.balance;

    // 应用可见性过滤：按登录用户权限（user_app_permissions）决定显示哪些应用
    const user = app.globalData.user || null;
    const visibleApps = (app.globalData.apps || []).filter(a => supa.appVisible(user, a.key));

    const apps = visibleApps.map(a => {
      const o = Object.assign({}, a);
      o.colorDark = darken(a.color);
      if (a.key === 'wage') {
        o.stat = wageDb.data.records.length;
        o.statLabel = '条工序记录';
      } else if (a.key === 'trade') {
        o.stat = tradeOrders;
        o.statLabel = '条订单记录';
        // 外贸模块需密码验证
        o.needPwd = true;
        o.locked = !(app.globalData && app.globalData.tradeUnlocked);
      } else if (a.key === 'schedule') {
        o.stat = schedOrders;
        o.statLabel = '条排程订单';
        o.needPwd = true;
        o.locked = !(app.globalData && app.globalData.scheduleUnlocked);
      } else if (a.key === 'purchase') {
        o.stat = fmt.fmtMoney(purchTotal);
        o.statLabel = '采购总额(双公司)';
      } else if (a.key === 'income') {
        o.stat = fmt.fmtMoney(incBalance);
        o.statLabel = '账户结余(双公司)';
        // 收支模块需密码验证
        o.needPwd = true;
        o.locked = !(app.globalData && app.globalData.incomeExpenseUnlocked);
      }
      return o;
    });

    // 数据总览只展示已授权应用相关的统计项
    const visibleKeys = {};
    visibleApps.forEach(a => { visibleKeys[a.key] = true; });
    const allOverview = [
      { app: 'wage', label: '工序记录', value: wageDb.data.records.length, color: '#007AFF' },
      { app: 'wage', label: '在职员工', value: wageDb.data.employees.filter(e => e.status === '1' || !e.leaveDate).length, color: '#007AFF' },
      { app: 'wage', label: '工资总额', value: fmt.fmtMoney(wageTotal), color: '#007AFF' },
      { app: 'trade', label: '外贸订单', value: tradeOrders, color: '#34C759' },
      { app: 'trade', label: '客户数量', value: tradeDb.data.customerRecords.length, color: '#34C759' },
      { app: 'trade', label: '欠款(CNY)', value: fmt.fmtMoney(tradeDebtCNY), color: '#FF9500' },
      { app: 'schedule', label: '排程订单', value: schedOrders, color: '#FF9500' },
      { app: 'purchase', label: '采购总额', value: fmt.fmtMoney(purchTotal), color: '#5856D6' },
      { app: 'income', label: '收支结余', value: fmt.fmtMoney(incBalance), color: '#00C7BE' }
    ];

    const email = (user && user.email) || '';
    this.setData({
      apps: apps,
      cloudOn: supa.isConfigured(),
      noPerms: visibleApps.length === 0,
      user: user,
      userLabel: email || '已登录用户',
      userBadge: (email ? email.slice(0, 1).toUpperCase() : '用'),
      overview: allOverview.filter(o => visibleKeys[o.app]).map(o => ({ label: o.label, value: o.value, color: o.color }))
    });
  },

  /** 退出登录：清除用户会话并回到登录页（数据同步共享账号不受影响） */
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#e02020',
      success: res => {
        if (!res.confirm) return;
        supa.logoutUser();
        const app = getApp();
        app.globalData.user = null;
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  },

  openApp(e) {
    const ds = e.currentTarget.dataset;
    const app = getApp();
    // 外贸模块：未解锁则先走密码验证页
    if (ds.key === 'trade' && !(app.globalData && app.globalData.tradeUnlocked)) {
      wx.navigateTo({ url: '/pages/trade/lock/lock?module=trade' });
      return;
    }
    if (ds.key === 'schedule' && !(app.globalData && app.globalData.scheduleUnlocked)) {
      wx.navigateTo({ url: '/pages/trade/lock/lock?module=schedule' });
      return;
    }
    if (ds.key === 'income' && !(app.globalData && app.globalData.incomeExpenseUnlocked)) {
      wx.navigateTo({ url: '/pages/trade/lock/lock?module=incomeexpense' });
      return;
    }
    wx.navigateTo({ url: ds.url });
  },

  goCloud() {
    const app = getApp();
    // 云同步页属外贸模块，同样受密码保护
    if (!(app.globalData && app.globalData.tradeUnlocked)) {
      wx.navigateTo({ url: '/pages/trade/lock/lock?redirect=' + encodeURIComponent('/pages/trade/backup/backup') });
      return;
    }
    wx.navigateTo({ url: '/pages/trade/backup/backup' });
  }
});

/** 主色调加深，用于图标渐变第三档 */
function darken(hex) {
  const map = { '#007AFF': '#0062D6', '#34C759': '#248A3D', '#FF9500': '#C46F00', '#5856D6': '#3B39A8', '#00C7BE': '#008F89' };
  return map[hex] || hex;
}
