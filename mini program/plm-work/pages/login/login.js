/**
 * 统一登录页 —— 对齐网页版门户（Onlineofficework index.html）
 *
 * - 一个登录界面，不同用户名（邮箱）登录后显示不同的应用
 *   （权限来自 CloudBase user_app_permissions，与网页版同一套数据）；
 * - 管理员（alonzhang76@outlook.com）登录可见全部应用；
 * - 登录态持久化在本地存储 plm_user_v1，冷启动自动恢复；
 * - 数据云同步使用独立的共享同步账号，与登录用户互不影响。
 */
const cb = require('../../utils/cloudbase');

Page({
  data: {
    account: '',
    password: '',
    loading: false,
    errMsg: '',
    cloudOn: cb.isConfigured()
  },

  onLoad() {
    // 已登录：直接进入工作台
    if (cb.getUser()) {
      wx.reLaunch({ url: '/pages/home/home' });
    }
  },

  onInputAccount(e) { this.setData({ account: e.detail.value, errMsg: '' }); },
  onInputPwd(e) { this.setData({ password: e.detail.value, errMsg: '' }); },

  async doLogin() {
    if (this.data.loading) return;
    const account = String(this.data.account || '').trim();
    const password = String(this.data.password || '');
    if (!account || !password) {
      this.setData({ errMsg: '请输入账号和密码' });
      return;
    }
    if (!cb.isConfigured()) {
      this.setData({ errMsg: '云端未配置，请检查 utils/cloudbase.js' });
      return;
    }
    this.setData({ loading: true, errMsg: '' });
    try {
      const user = await cb.login(account, password);
      // 权限为空且非管理员：提示找管理员配置（与网页版一致，不显示任何应用）
      if (!user.isAdmin && !user.perms) {
        this.setData({ loading: false, password: '' });
        wx.showModal({
          title: '尚未配置应用权限',
          content: '账号 ' + (user.email || account) + ' 还没有分配任何应用。\n请联系管理员在网页版门户「管理面板」中设置。',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      wx.showToast({ title: '欢迎回来', icon: 'success' });
      setTimeout(() => { wx.reLaunch({ url: '/pages/home/home' }); }, 400);
    } catch (e) {
      console.warn('[login] 登录失败', e);
      let msg = '登录失败，请检查账号密码';
      const d = e && (e.data || e);
      const desc = (d && (d.error_description || d.message || d.errMsg)) || '';
      if (/invalid|incorrect|密码|账号/i.test(desc)) msg = '账号或密码不正确';
      else if (/captcha/i.test(desc)) msg = '登录尝试过于频繁，请稍后再试';
      else if (/request:fail|domain|合法/.test(desc)) msg = '网络不可用：请将 CloudBase 网关域名加入 request 合法域名';
      this.setData({ loading: false, errMsg: msg, password: '' });
    }
  }
});
