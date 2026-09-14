/**
 * 统一登录页
 * - CloudBase 邮箱/用户名 + 密码登录（与网页版同一账号体系）
 * - 登录态持久化，冷启动自动进入
 */
const cb = require('../../utils/cloudbase');

Page({
  data: {
    account: '',
    password: '',
    loading: false,
    errMsg: ''
  },

  onLoad() {
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
    this.setData({ loading: true, errMsg: '' });
    try {
      await cb.login(account, password);
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
