const db = require('../../../utils/trade-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

Page({
  data: {
    menu: [
      { icon: '🏠', title: '外贸首页', sub: '9 大功能模块入口', url: '/pages/trade/hub/hub' },
      { icon: '📊', title: '报表统计', sub: '收汇 / 付款 / 提醒 / 欠款', url: '/pages/trade/report/report' },
      { icon: '☁️', title: '云存储', sub: '文件上传 / 预览 / 下载', url: '/pages/cloudfiles/cloudfiles?app=trade' },
      { icon: '💾', title: '数据备份', sub: '导出 / 恢复 / 云同步', url: '/pages/trade/backup/backup' }
    ],
    shortcuts: [],
    cloudOn: false
  },

  onShow() {
    this.setData({
      cloudOn: supa.isConfigured(),
      shortcuts: [
        { key: 'memo', icon: '📝', name: '备忘录', url: '/pages/trade/memo/memo' },
        { key: 'business', icon: '📈', name: '业务跟踪', url: '/pages/trade/business/business' },
        { key: 'payment', icon: '💳', name: '账务', url: '/pages/trade/payment/payment' },
        { key: 'invoice', icon: '📄', name: '发票', url: '/pages/trade/invoice/invoice' },
        { key: 'export', icon: '📤', name: '出口', url: '/pages/trade/export/export' },
        { key: 'receipt', icon: '💰', name: '收汇', url: '/pages/trade/receipt/receipt' },
        { key: 'order', icon: '📋', name: '订单', url: '/pages/trade/order/order' },
        { key: 'customer', icon: '👥', name: '客户', url: '/pages/trade/customer/customer' }
      ]
    });
  },

  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }); },
  goCloud() { wx.navigateTo({ url: '/pages/trade/backup/backup' }); },
  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); },

  // 手动锁定外贸模块，下次从门户进入需重新验证密码
  lockModule() {
    wx.showModal({
      title: '锁定外贸模块',
      content: '锁定后，下次进入需重新输入访问密码。',
      confirmText: '锁定',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        getApp().globalData.tradeUnlocked = false;
        wx.showToast({ title: '已锁定', icon: 'success', duration: 800 });
        setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 500);
      }
    });
  }
});
