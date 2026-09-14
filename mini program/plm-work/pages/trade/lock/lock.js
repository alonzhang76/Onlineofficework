// 模块访问验证页（外贸出口 / 订单排程通用）
// 通过 ?module=trade|schedule 区分，密码与解锁状态存于 app.globalData
const app = getApp();

const MODULE_CONF = {
  trade: {
    title: '外贸出口管理系统',
    pwdKey: 'tradePassword',
    unlockKey: 'tradeUnlocked',
    defaultRedirect: '/pages/trade/hub/hub'
  },
  schedule: {
    title: '订单排程系统',
    pwdKey: 'schedulePassword',
    unlockKey: 'scheduleUnlocked',
    defaultRedirect: '/pages/schedule/hub/hub'
  },
  incomeexpense: {
    title: '收支管理系统',
    pwdKey: 'incomeExpensePassword',
    unlockKey: 'incomeExpenseUnlocked',
    defaultRedirect: '/pages/income/hub/hub'
  }
};

Page({
  data: {
    module: 'trade',
    title: MODULE_CONF.trade.title,
    companyName: '',
    companyNameEn: '',
    pwd: '',
    err: '',
    shake: false,
    fails: 0
  },

  onLoad(options) {
    const mod = options && MODULE_CONF[options.module] ? options.module : 'trade';
    this.conf = MODULE_CONF[mod];
    const g = app.globalData || {};
    this.setData({
      module: mod,
      title: this.conf.title,
      themeClass: mod === 'schedule' ? 'theme-orange' : (mod === 'incomeexpense' ? 'theme-teal' : 'theme-green'),
      btnClass: mod === 'schedule' ? 'orange' : (mod === 'incomeexpense' ? 'teal' : 'green'),
      companyName: g.companyName || '',
      companyNameEn: g.companyNameEn || ''
    });
    // 验证后的落地页，默认各模块首页
    this.redirect = options.redirect || this.conf.defaultRedirect;
  },

  onInput(e) {
    this.setData({ pwd: e.detail.value, err: '' });
  },

  clear() {
    this.setData({ pwd: '', err: '' });
  },

  submit() {
    const input = (this.data.pwd || '').trim();
    if (!input) {
      this.showErr('请输入访问密码');
      return;
    }
    const expect = (app.globalData && app.globalData[this.conf.pwdKey]) || '';
    if (input === expect) {
      app.globalData[this.conf.unlockKey] = true;
      wx.showToast({ title: '验证通过', icon: 'success', duration: 800 });
      setTimeout(() => {
        wx.redirectTo({ url: this.redirect || this.conf.defaultRedirect });
      }, 300);
    } else {
      const fails = this.data.fails + 1;
      this.setData({ fails });
      this.showErr(fails >= 3 ? '密码错误，请确认后重试' : '密码错误');
      this.setData({ pwd: '' });
    }
  },

  showErr(msg) {
    this.setData({ err: msg, shake: true });
    setTimeout(() => this.setData({ shake: false }), 420);
  },

  goBack() {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
