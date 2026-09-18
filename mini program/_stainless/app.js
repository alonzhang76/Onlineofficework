/**
@APP_TITLE@ —— 微信小程序
 *
 * 登录 → 首页（三抬头切换 + 功能模块入口）→ 各业务模块列表页
 * 数据与网页版共用 CloudBase 后端，双端自动同步。
 */
const db = require('./utils/db');
const cb = require('./utils/cloudbase');

/* 全局包装 Page：云端数据变化时自动刷新当前页（编辑弹窗打开时跳过） */
var _OrigPage = Page;
Page = function (options) {
  options = options || {};
  var _onShow = options.onShow;
  options.onShow = function () {
    if (typeof _onShow === 'function') _onShow.apply(this, arguments);
    try {
      var app = getApp();
      if (app && typeof app.cloudTick === 'function') app.cloudTick();
    } catch (e) {}
  };
  if (typeof options.onCloudUpdate !== 'function') {
    options.onCloudUpdate = function () {
      var d = this.data || {};
      if (d.modal) return;
      if (typeof this.render === 'function') return this.render();
      if (typeof this.refresh === 'function') return this.refresh();
    };
  }
  return _OrigPage(options);
};

App({
  onLaunch() {
    this.globalData.user = cb.getUser();
    db.loadAll();
    db.syncFromCloud(() => {
      try {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.onCloudUpdate === 'function') page.onCloudUpdate();
      } catch (e) {}
    });
    cb.flushQueue();
    this._lastTick = Date.now();
  },

  onShow() { cb.flushQueue(); },
  onHide() { cb.flushQueue(); },

  /** 节流的云端拉取（页面 onShow 触发；8 秒内不重复） */
  cloudTick() {
    if (Date.now() - (this._lastTick || 0) < 8000) return;
    this._lastTick = Date.now();
    db.syncFromCloud((changed) => {
      if (!changed) return;
      try {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.onCloudUpdate === 'function') page.onCloudUpdate();
      } catch (e) {}
    });
  },

  globalData: {
    appName: '@APP_NAME@',
    appNameEn: '@APP_NAME_EN@',
    user: null,
    modules: @@MODULES_JSON@@
  }
});
