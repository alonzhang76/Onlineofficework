const supa = require('../../../utils/cloudbase');

Page({
  data: {
    menu: [
      { icon: '📅', title: '月度汇总', url: '/pages/wage/monthly/monthly' },
      { icon: '📈', title: '年度汇总', url: '/pages/wage/annual/annual' },
      { icon: '🗓', title: '日历记事', url: '/pages/wage/calendar/calendar' },
      { icon: '👥', title: '员工管理', url: '/pages/wage/employees/employees' },
      { icon: '🔧', title: '工序管理', url: '/pages/wage/processes/processes' },
      { icon: '☁️', title: '云存储', url: '/pages/cloudfiles/cloudfiles?app=wage' },
      { icon: '💾', title: '数据备份', url: '/pages/wage/backup/backup' }
    ],
    cloudOn: false
  },

  onShow() {
    this.setData({ cloudOn: supa.isConfigured() });
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
  goCloud() { wx.navigateTo({ url: '/pages/wage/backup/backup' }); },
  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
