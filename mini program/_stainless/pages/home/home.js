/**
 * 首页：三抬头切换 + 分组宫格 + 当前抬头数据概览
 */
const db = require('../../utils/db');
const cb = require('../../utils/cloudbase');
const company = require('../../utils/company');
const fmt = require('../../utils/format');

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* 工具入口（非 schema 模块） */
const TOOL_CONTRACT_SALES = { key: '_contract_sales', name: '销售合同', icon: '📄', url: '/pages/contract/contract?type=sales' };
const TOOL_CONTRACT_PURCHASE = { key: '_contract_purchase', name: '采购合同', icon: '📑', url: '/pages/contract/contract?type=purchase' };
const TOOL_STATS = { key: '_stats', name: '统计分析', icon: '📊', url: '/pages/stats/stats' };
const TOOL_CLOUD = { key: '_cloud', name: '云存储', icon: '☁️', url: '/pages/cloudfiles/cloudfiles?app=main' };
const TOOL_BACKUP = { key: '_backup', name: '数据备份', icon: '💾', url: '/pages/backup/backup' };

Page({
  data: {
    appName: '',
    todayText: '',
    weekText: '',
    companies: [],
    currentId: '',
    currentName: '',
    currentNameEn: '',
    overview: [],
    groups: [],
    user: null,
    userLabel: '',
    userBadge: '',
    cloudOn: false
  },

  onLoad() {
    const now = new Date();
    this.setData({
      appName: getApp().globalData.appName || '不锈钢业务管理',
      todayText: now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日',
      weekText: WEEK[now.getDay()]
    });
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) app.globalData.user = cb.getUser();
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
    });
  },

  onCloudUpdate() { this.render(); },

  render() {
    const app = getApp();
    const companies = company.getCompanies().map(c => ({
      id: c.id,
      nameCn: c.nameCn,
      nameEn: c.nameEn,
      active: c.id === company.getCurrentId()
    }));
    const cur = company.getCurrent();

    // 当前抬头概览
    const sales = db.get('salesOrders') || [];
    const purchases = db.get('purchaseOrders') || [];
    const salesAmt = sales.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const purchaseAmt = purchases.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const salesWeight = sales.reduce((s, r) =>
      s + (Number(r.weight) || 0) + (Number(r.weightAdjustment) || 0), 0);
    const contacts = db.get('contacts') || [];

    const overview = [
      { label: '销售总额(元)', value: '¥' + fmt.fmtMoney(salesAmt), color: '#007AFF' },
      { label: '采购总额(元)', value: '¥' + fmt.fmtMoney(purchaseAmt), color: '#5856D6' },
      { label: '销售重量(kg)', value: fmt.fmtNum(salesWeight), color: '#34C759' },
      { label: '通讯录(家)', value: String(contacts.length), color: '#FF9500' }
    ];

    const moduleMap = {};
    (app.globalData.modules || []).forEach(m => { moduleMap[m.key] = m; });
    const M = key => moduleMap[key];
    const groups = [
      {
        name: '销售管理',
        items: [M('salesOrders'), TOOL_CONTRACT_SALES, M('salesReturnRecords'), M('inquiries'), M('quotations')]
      },
      {
        name: '采购管理',
        items: [M('purchaseOrders'), TOOL_CONTRACT_PURCHASE, M('returnRecords'), M('invoices'), M('transactions')]
      },
      {
        name: '仓储 / 财务',
        items: [M('inventoryRecords'), M('warehouses'), TOOL_STATS, M('calendarEvents'), M('memos')]
      },
      {
        name: '基础资料 / 工具',
        items: [M('contacts'), M('gradeComparisons'), M('hscodes'), M('calculationParams'), TOOL_CLOUD, TOOL_BACKUP]
      }
    ].map(g => ({ name: g.name, items: g.items.filter(Boolean) }));

    const email = (app.globalData.user && app.globalData.user.email) || '';
    this.setData({
      companies: companies,
      currentId: cur.id,
      currentName: cur.nameCn || '',
      currentNameEn: cur.nameEn || '',
      overview: overview,
      groups: groups,
      cloudOn: cb.isConfigured(),
      user: app.globalData.user,
      userLabel: email || '已登录',
      userBadge: email ? email.slice(0, 1).toUpperCase() : '用'
    });
  },

  /* 切换抬头 */
  switchCompany(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.currentId) return;
    if (company.switchCompany(id)) {
      this.render();
      const c = company.getCurrent();
      wx.showToast({ title: '已切换至 ' + (c.nameCn || c.id), icon: 'none' });
    }
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
  }
});
