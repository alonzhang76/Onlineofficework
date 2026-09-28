/**
 * 报销系统登录页（用户名 + 密码）
 *
 * 账号由电脑端网页版「用户管理」维护，存储在 reim_users（与小程序同步）。
 * 用户选择用户名后输入密码，用 PBKDF2-SHA256 本地校验（与电脑端 store.js
 * checkPasswordHash 一致），不向云端发送密码。
 *
 * 角色：
 *   admin    管理员  —— 全部权限（含入账、批量操作）
 *   approver 审核人  —— 审核通过/驳回、查看全部发票
 *   claimant 报销人  —— 录入/编辑/提交自己的发票，只看自己的
 */
const db = require('../../../utils/reim-db');
const supa = require('../../../utils/cloudbase');
const pbkdf2 = require('../../../utils/pbkdf2');

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
    selectedUser: '',
    selectedUserName: '',
    password: '',
    pwdError: '',
    verifying: false,
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
    if (!db.isCloudSynced() || !hasLocal) {
      this.setData({ loading: true });
      db.syncFromCloud(() => {
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

  /** 选择用户名（下拉） */
  onUserChange(e) {
    const idx = e.detail.value;
    const u = this.data.users[idx];
    this.setData({
      selectedUser: u ? String(u.id) : '',
      selectedUserName: u ? u.display_name : '',
      pwdError: ''
    });
  },

  onPwdInput(e) {
    this.setData({ password: e.detail.value, pwdError: '' });
  },

  /** 确认登录：校验密码 */
  doLogin() {
    if (this.data.verifying) return;
    const username = this.data.selectedUser;
    const password = this.data.password;
    if (!username) { this.setData({ pwdError: '请选择用户名' }); return; }
    if (!password) { this.setData({ pwdError: '请输入密码' }); return; }

    // 找到用户原始记录（含 password_hash）
    const rawUsers = db.listAllUsers();
    const u = rawUsers.find(r => String(r.id) === String(username));
    if (!u) { this.setData({ pwdError: '用户不存在或已被停用' }); return; }
    if (!u.password_hash) { this.setData({ pwdError: '该账号未设置密码，请联系管理员' }); return; }

    this.setData({ verifying: true, pwdError: '' });

    // PBKDF2 校验较慢（260000 次迭代），异步执行避免阻塞 UI
    setTimeout(() => {
      const ok = pbkdf2.verifyPassword(password, u.password_hash);
      this.setData({ verifying: false });

      if (!ok) {
        this.setData({ pwdError: '密码错误' });
        return;
      }

      // 登录成功
      const userView = {
        id: u.id,
        username: u.username || u.email || '',
        display_name: u.display_name || u.username || u.email || '未命名用户',
        role: u.role || 'claimant',
        department: u.department || ''
      };
      const app = getApp();
      if (app && app.globalData) app.globalData.reimUser = userView;
      try { wx.setStorageSync('reim_login_user', userView); } catch (err) { /* 忽略 */ }

      wx.showToast({ title: '已登录 · ' + userView.display_name, icon: 'success', duration: 700 });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/reimbursement/hub/hub' });
      }, 500);
    }, 50);
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
