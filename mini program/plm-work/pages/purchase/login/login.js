const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');

const REMEMBER_KEY = '_purchase_remember_user';

Page({
  data: {
    username: '',
    password: '',
    remember: true,
    loading: false,
    cloudOn: false,
    errMsg: '',
    hint: '',
    __syncState: 'idle'
  },

  onLoad() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.setData({ cloudOn: supa.isConfigured() });
    // 记住用户名（与桌面端 pis_rememberUser 同行为）
    let remembered = '';
    try { remembered = wx.getStorageSync(REMEMBER_KEY) || ''; } catch (e) { remembered = ''; }
    if (remembered) {
      this.setData({ username: remembered, remember: true });
    } else if (!db.users().length) {
      this.setData({ hint: '正在从云端获取账号…' });
    }
    this.bootstrap();
  },

  /** 首次进入先拉一次云端：手机端在本机没装过账号时也能直接登录 */
  bootstrap() {
    if (!supa.isConfigured()) {
      this.setData({ hint: db.users().length ? '' : '云端未配置，且本机没有可用的采购账号' });
      return;
    }
    db.syncFromCloud((ok, count) => {
      const n = db.users().length;
      if (ok) {
        this.setData({ hint: n ? '' : '云端暂无采购账号，请先在电脑端「系统管理 → 用户管理」中创建' });
      } else {
        this.setData({ hint: n ? '云端同步失败，将使用本机账号' : '云端同步失败，且本机没有可用的采购账号' });
      }
    });
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      wx.stopPullDownRefresh();
      this.bootstrap();
    });
  },

  onUser(e) { this.setData({ username: e.detail.value, errMsg: '' }); },
  onPwd(e) { this.setData({ password: e.detail.value, errMsg: '' }); },
  onRemember(e) { this.setData({ remember: !!e.detail.value }); },

  submit() {
    const u = String(this.data.username || '').trim();
    const p = String(this.data.password || '');
    if (!u) { this.setData({ errMsg: '请输入用户名' }); return; }
    if (!p) { this.setData({ errMsg: '请输入密码' }); return; }

    this.setData({ loading: true, errMsg: '' });
    // 桌面端 hashPwd 在安全上下文用 SHA-256，否则用 djb2 回退；
    // 两种形态这里都能校验，账号在手机与电脑上通用。
    const res = db.login(u, p);
    this.setData({ loading: false });

    if (!res.ok) {
      this.setData({ errMsg: res.msg, password: '' });
      return;
    }
    try {
      if (this.data.remember) wx.setStorageSync(REMEMBER_KEY, u);
      else wx.removeStorageSync(REMEMBER_KEY);
    } catch (e) { /* 静默 */ }
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => { wx.redirectTo({ url: '/pages/purchase/hub/hub' }); }, 400);
  },

  /** 忘记密码：提示找管理员（与桌面端一致的引导语） */
  forgot() {
    wx.showModal({
      title: '忘记密码',
      content: '请联系管理员在电脑端「系统管理 → 用户管理」中重置密码，重置后手机端可直接登录。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  backHome() { wx.reLaunch({ url: '/pages/home/home' }); }
});
