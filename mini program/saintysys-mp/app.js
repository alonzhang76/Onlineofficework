/**
 * 服装外贸小程序（与网页版 apps/saintysys 共用 CloudBase 后端） —— 微信小程序
 *
 * 登录 → 首页（功能模块入口）→ 各业务模块列表页
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
    // 恢复登录用户
    this.globalData.user = cb.getUser();
    // 本地加载 + 云端拉取合并
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
    // 同步状态指示灯：监听 cloudbase 状态变化，下发给当前页面 + 关键状态弹 toast
    this._lastToastState = null;
    cb.onSyncStateChange(state => this.propagateSyncState(state));
  },

  onShow() {
    cb.flushQueue();
    this.propagateSyncState(cb.getSyncState());
  },

  onHide() {
    cb.flushQueue();
  },

  /** 把同步状态下发给当前页面（用于驱动指示灯 UI）+ 关键状态弹 toast */
  propagateSyncState(state) {
    try {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && typeof page.setData === 'function') {
        page.setData({ __syncState: state });
      }
    } catch (e) {}
    if (state === this._lastToastState) return;
    this._lastToastState = state;
    if (state === 'error') {
      wx.showToast({ title: '上传失败，重试中', icon: 'none', duration: 1500 });
    } else if (state === 'offline') {
      wx.showToast({ title: '云端未连接', icon: 'none', duration: 1500 });
    }
  },

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
    appName: '服装外贸系统',
    appNameEn: 'SAINTY GARMENT EXPORT',
    user: null,
    // 功能模块清单（构建脚本生成）
    modules: [
  {
    "key": "orders",
    "title": "订单管理",
    "icon": "📋",
    "color": "#34C759",
    "url": "/pages/orders/orders",
    "stat": "sum",
    "sumField": "totalAmount",
    "statLabel": "订单总额(元)"
  },
  {
    "key": "productions",
    "title": "生产跟踪",
    "icon": "🏭",
    "color": "#FF9500",
    "url": "/pages/productions/productions",
    "stat": "count",
    "sumField": "",
    "statLabel": "生产单"
  },
  {
    "key": "fabrics",
    "title": "面料管理",
    "icon": "🧵",
    "color": "#0A84FF",
    "url": "/pages/fabrics/fabrics",
    "stat": "count",
    "sumField": "",
    "statLabel": "面料记录"
  },
  {
    "key": "accessories",
    "title": "辅料管理",
    "icon": "🧷",
    "color": "#AF52DE",
    "url": "/pages/accessories/accessories",
    "stat": "count",
    "sumField": "",
    "statLabel": "辅料记录"
  },
  {
    "key": "washes",
    "title": "水洗管理",
    "icon": "🫧",
    "color": "#00C7BE",
    "url": "/pages/washes/washes",
    "stat": "count",
    "sumField": "",
    "statLabel": "水洗记录"
  },
  {
    "key": "samples",
    "title": "样衣管理",
    "icon": "👗",
    "color": "#EC4899",
    "url": "/pages/samples/samples",
    "stat": "count",
    "sumField": "",
    "statLabel": "样衣记录"
  },
  {
    "key": "shippings",
    "title": "出货管理",
    "icon": "🚢",
    "color": "#0EA5E9",
    "url": "/pages/shippings/shippings",
    "stat": "count",
    "sumField": "",
    "statLabel": "出货单"
  },
  {
    "key": "collections",
    "title": "收汇管理",
    "icon": "💰",
    "color": "#10B981",
    "url": "/pages/collections/collections",
    "stat": "sum",
    "sumField": "rmbAmount",
    "statLabel": "收汇合计(元)"
  },
  {
    "key": "invoices",
    "title": "发票管理",
    "icon": "🧾",
    "color": "#F59E0B",
    "url": "/pages/invoices/invoices",
    "stat": "count",
    "sumField": "",
    "statLabel": "发票记录"
  },
  {
    "key": "payments",
    "title": "付款管理",
    "icon": "💳",
    "color": "#EF4444",
    "url": "/pages/payments/payments",
    "stat": "sum",
    "sumField": "amount",
    "statLabel": "付款合计(元)"
  },
  {
    "key": "contacts",
    "title": "通讯录",
    "icon": "👥",
    "color": "#6366F1",
    "url": "/pages/contacts/contacts",
    "stat": "count",
    "sumField": "",
    "statLabel": "联系人"
  },
  {
    "key": "express_delivery_data_v2",
    "title": "快递物流",
    "icon": "📦",
    "color": "#F97316",
    "url": "/pages/express_delivery_data_v2/express_delivery_data_v2",
    "stat": "sum",
    "sumField": "cost",
    "statLabel": "快递费合计(元)"
  }
]
  }
});
