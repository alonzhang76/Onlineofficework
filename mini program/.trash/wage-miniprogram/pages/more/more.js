const supa = require('../../utils/supabase');

Page({
  data: {
    menu: [
      { icon: '📅', title: '月度汇总', url: '/pages/monthly/monthly' },
      { icon: '📈', title: '年度汇总', url: '/pages/annual/annual' },
      { icon: '🗓', title: '日历记事', url: '/pages/calendar/calendar' },
      { icon: '👥', title: '员工管理', url: '/pages/employees/employees' },
      { icon: '🔧', title: '工序管理', url: '/pages/processes/processes' },
      { icon: '💾', title: '数据备份', url: '/pages/backup/backup' }
    ],
    cloudOn: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 4 });
    this.setData({ cloudOn: supa.isConfigured() });
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
  goCloud() { wx.navigateTo({ url: '/pages/backup/backup' }); }
});
