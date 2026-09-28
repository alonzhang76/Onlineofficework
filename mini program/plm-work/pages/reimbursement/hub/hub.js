const db = require('../../../utils/reim-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

Page({
  data: {
    me: null,
    modules: [],
    stats: {},
    recent: [],
    cloudOn: false,
    loading: true,
    __syncState: 'idle'
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    // 权限门禁：未选择身份则回到报销登录页
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    this.render();
    if (!db.isCloudSynced()) {
      this.setData({ loading: true });
      db.syncFromCloud(() => { this.setData({ loading: false }); this.render(); });
    }
  },

  /** 本次进入报销模块的身份（全局优先，其次本地持久化） */
  currentUser() {
    const app = getApp();
    let u = app && app.globalData && app.globalData.reimUser;
    if (!u) {
      try { u = wx.getStorageSync('reim_login_user') || null; } catch (e) { u = null; }
      if (u && app && app.globalData) app.globalData.reimUser = u;
    }
    return u || null;
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
    const me = this.currentUser();
    if (!me) return;
    const canImport = db.can(me, 'import');
    const canReview = db.can(me, 'review');

    // 功能入口按角色裁剪
    const modules = [];
    if (canImport) {
      modules.push({ key: 'import', icon: '📥', name: '导入发票', color: '#FF6B35', url: '/pages/reimbursement/import/import' });
    }
    modules.push({ key: 'list', icon: '📒', name: canReview ? '发票审核' : '我的发票', color: '#007AFF', url: '/pages/reimbursement/list/list' });
    if (canImport) {
      modules.push({ key: 'new', icon: '✏️', name: '手工录入', color: '#34C759', url: '/pages/reimbursement/edit/edit' });
    }
    modules.push({ key: 'stats', icon: '📊', name: '统计报表', color: '#5856D6', url: '/pages/reimbursement/stats/stats' });

    // 统计与「最近发票」按角色过滤：报销人只看自己经手的
    const scope = db.can(me, 'viewAll') ? {} : { claimant: me.display_name };
    const all = db.queryInvoices(scope);
    const s = db.summarize(all);
    const recent = all.slice(0, 6).map(r => Object.assign({}, r, {
      statusColor: db.STATUS_COLORS[r.status] || 'badge-gray',
      totalText: fmt.fmtMoney(r.total_amount || 0),
      dateText: (r.invoice_date || '无日期')
    }));

    this.setData({
      loading: false,
      me: Object.assign({}, me, {
        roleName: db.roleName(me.role),
        badge: me.role === 'admin' ? 'badge-red' : (me.role === 'approver' ? 'badge-blue' : 'badge-green'),
        initial: String(me.display_name || '?').slice(0, 1)
      }),
      modules: modules.map(m => Object.assign({}, m, { colorDark: darken(m.color) })),
      stats: {
        count: s.count,
        totalText: fmt.fmtMoney(s.total),
        taxText: fmt.fmtMoney(s.tax),
        pendingCount: s.pending.count,
        pendingTotalText: fmt.fmtMoney(s.pending.total)
      },
      recent: recent,
      cloudOn: supa.isConfigured()
    });
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  goInvoice(e) {
    wx.navigateTo({ url: '/pages/reimbursement/edit/edit?id=' + e.currentTarget.dataset.id });
  },

  /** 切换身份 */
  switchUser() {
    wx.showModal({
      title: '切换身份',
      content: '将退出当前身份并返回身份选择页。',
      success: res => {
        if (!res.confirm) return;
        const app = getApp();
        if (app && app.globalData) app.globalData.reimUser = null;
        try { wx.removeStorageSync('reim_login_user'); } catch (e) {}
        wx.reLaunch({ url: '/pages/reimbursement/login/login' });
      }
    });
  },

  pullCloud() {
    if (!supa.isConfigured()) { wx.showToast({ title: '未配置 CloudBase', icon: 'none' }); return; }
    wx.showLoading({ title: '同步中...' });
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      this.render();
      if (ok) wx.showToast({ title: '已拉取云端（' + count + ' 项）', icon: 'success' });
      else wx.showToast({ title: '拉取失败，请检查网络', icon: 'none' });
    });
  },

  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});

/** 主色调加深，用于图标渐变第三档 */
function darken(hex) {
  const map = { '#FF6B35': '#C24A1E', '#007AFF': '#0062D6', '#5856D6': '#3B39A8', '#34C759': '#248A3D' };
  return map[hex] || hex;
}
