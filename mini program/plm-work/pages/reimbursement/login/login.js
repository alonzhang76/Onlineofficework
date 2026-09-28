/**
 * 报销系统登录页（身份选择）
 *
 * 账号由电脑端网页版「用户管理」维护，存储在 reim_users（与小程序同步）。
 * 本页只做身份选择，不校验密码 —— 因此进入报销模块不用输密码，
 * 但登录后所有操作都受角色权限约束（见 utils/reim-db.js 的 can/canOnInvoice）。
 *
 * 角色：
 *   admin    管理员  —— 全部权限（含入账、批量操作）
 *   approver 审核人  —— 审核通过/驳回、查看全部发票
 *   claimant 报销人  —— 录入/编辑/提交自己的发票，只看自己的
 */
const db = require('../../../utils/reim-db');
const supa = require('../../../utils/cloudbase');

const DESC = {
  admin: '全部权限 · 可审核与入账',
  approver: '审核发票 · 查看全部',
  claimant: '录入与提交自己的发票'
};

Page({
  data: {
    users: [],
    loading: true,
    cloudOn: false,
    noUsers: false,
    pendingId: '',
    __syncState: 'idle'
  },

  onLoad() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.setData({ cloudOn: supa.isConfigured() });
    this.refresh();
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      this.refresh();
      wx.stopPullDownRefresh();
    });
  },

  refresh() {
    const hasLocal = db.listUsers().length > 0;
    this.render();
    // 本地没有用户（首次进入/云端还没同步）时，主动拉一次云端再渲染；
    // 本地已有用户则后台静默同步（下拉可手动刷新）。
    if (!db.isCloudSynced() || !hasLocal) {
      this.setData({ loading: true });
      db.syncFromCloud(() => {
        // 全量同步后仍无账号：单独重试 reim_users 单键，
        // 覆盖「app.js 启动同步跑在 reim_users 入白名单之前」的情况。
        if (!db.listUsers().length) {
          db.ensureCloudAccountList().then(() => this.render());
        } else {
          this.render();
        }
      });
    } else if (!hasLocal) {
      db.ensureCloudAccountList().then(() => this.render());
    }
  },

  render() {
    const users = db.listUsers();
    this.setData({
      loading: false,
      noUsers: users.length === 0,
      users: users.map(u => Object.assign({}, u, {
        desc: DESC[u.role] || '',
        badge: u.role === 'admin' ? 'badge-red'
          : (u.role === 'approver' ? 'badge-blue' : 'badge-green'),
        initial: String(u.display_name || '?').slice(0, 1)
      }))
    });
  },

  pick(e) {
    const id = e.currentTarget.dataset.id;
    const u = this.data.users.find(x => String(x.id) === String(id));
    if (!u) return;
    if (this.data.pendingId) return;
    this.setData({ pendingId: id });
    // 写入全局会话 + 本地持久化（跨页面读取角色权限）
    const app = getApp();
    if (app && app.globalData) app.globalData.reimUser = u;
    try { wx.setStorageSync('reim_login_user', u); } catch (err) { /* 忽略 */ }
    wx.showToast({ title: '已进入 · ' + u.display_name, icon: 'success', duration: 700 });
    setTimeout(() => {
      this.setData({ pendingId: '' });
      wx.reLaunch({ url: '/pages/reimbursement/hub/hub' });
    }, 500);
  },

  /** 云端还没有用户数据时的重试 */
  retry() {
    wx.showLoading({ title: '同步中...' });
    db.syncFromCloud((ok, count) => {
      const done = n => {
        wx.hideLoading();
        this.render();
        if (db.listUsers().length) {
          wx.showToast({ title: '已同步（' + n + ' 项）', icon: 'none' });
        } else {
          wx.showToast({ title: '云端暂无账号，请先在电脑端创建', icon: 'none' });
        }
      };
      if (db.listUsers().length) { done(count); return; }
      db.ensureCloudAccountList().then(() => done(count));
    });
  },

  goHome() { wx.reLaunch({ url: '/pages/home/home' }); }
});
