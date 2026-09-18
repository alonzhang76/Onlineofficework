/**
 * 不锈钢贸易小程序（与网页版 apps/stainlessbusiness 共用 CloudBase 后端） —— 微信小程序
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
    appName: '不锈钢业务管理',
    appNameEn: 'STAINLESS STEEL BUSINESS',
    user: null,
    modules: [
  {
    "key": "salesOrders",
    "title": "销售订单",
    "icon": "💼",
    "color": "#007AFF",
    "url": "/pages/salesOrders/salesOrders",
    "stat": "sum",
    "sumField": "totalAmount",
    "statLabel": "销售总额(元)"
  },
  {
    "key": "purchaseOrders",
    "title": "采购订单",
    "icon": "🛒",
    "color": "#5856D6",
    "url": "/pages/purchaseOrders/purchaseOrders",
    "stat": "sum",
    "sumField": "totalAmount",
    "statLabel": "采购总额(元)"
  },
  {
    "key": "inquiries",
    "title": "询价单",
    "icon": "📨",
    "color": "#F59E0B",
    "url": "/pages/inquiries/inquiries",
    "stat": "count",
    "sumField": "",
    "statLabel": "询价单"
  },
  {
    "key": "quotations",
    "title": "报价单",
    "icon": "💰",
    "color": "#10B981",
    "url": "/pages/quotations/quotations",
    "stat": "count",
    "sumField": "",
    "statLabel": "报价单"
  },
  {
    "key": "returnRecords",
    "title": "采购收退货",
    "icon": "📥",
    "color": "#10B981",
    "url": "/pages/returnRecords/returnRecords",
    "stat": "count",
    "sumField": "",
    "statLabel": "收退货记录"
  },
  {
    "key": "salesReturnRecords",
    "title": "销售发退货",
    "icon": "📤",
    "color": "#EF4444",
    "url": "/pages/salesReturnRecords/salesReturnRecords",
    "stat": "count",
    "sumField": "",
    "statLabel": "发退货记录"
  },
  {
    "key": "inventoryRecords",
    "title": "库存记录",
    "icon": "🏬",
    "color": "#0A84FF",
    "url": "/pages/inventoryRecords/inventoryRecords",
    "stat": "count",
    "sumField": "",
    "statLabel": "库存记录"
  },
  {
    "key": "warehouses",
    "title": "仓库设置",
    "icon": "🗄️",
    "color": "#64748B",
    "url": "/pages/warehouses/warehouses",
    "stat": "count",
    "sumField": "",
    "statLabel": "仓库"
  },
  {
    "key": "transactions",
    "title": "收付款",
    "icon": "💴",
    "color": "#F97316",
    "url": "/pages/transactions/transactions",
    "stat": "sum",
    "sumField": "amount",
    "statLabel": "收付款合计(元)"
  },
  {
    "key": "invoices",
    "title": "发票登记",
    "icon": "🧾",
    "color": "#F59E0B",
    "url": "/pages/invoices/invoices",
    "stat": "sum",
    "sumField": "totalAmount",
    "statLabel": "价税合计(元)"
  },
  {
    "key": "calendarEvents",
    "title": "日历记事",
    "icon": "📅",
    "color": "#AF52DE",
    "url": "/pages/calendarEvents/calendarEvents",
    "stat": "count",
    "sumField": "",
    "statLabel": "记事"
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
    "key": "memos",
    "title": "备忘录",
    "icon": "📝",
    "color": "#8B5CF6",
    "url": "/pages/memos/memos",
    "stat": "count",
    "sumField": "",
    "statLabel": "备忘"
  },
  {
    "key": "gradeComparisons",
    "title": "材质对照",
    "icon": "🔩",
    "color": "#0F766E",
    "url": "/pages/gradeComparisons/gradeComparisons",
    "stat": "count",
    "sumField": "",
    "statLabel": "材质牌号"
  },
  {
    "key": "vocabularies",
    "title": "钢材英语",
    "icon": "🔤",
    "color": "#0284C7",
    "url": "/pages/vocabularies/vocabularies",
    "stat": "count",
    "sumField": "",
    "statLabel": "词汇"
  },
  {
    "key": "hscodes",
    "title": "HS编码/标准",
    "icon": "📚",
    "color": "#7C3AED",
    "url": "/pages/hscodes/hscodes",
    "stat": "count",
    "sumField": "",
    "statLabel": "编码"
  },
  {
    "key": "calculationParams",
    "title": "理算参数",
    "icon": "🧮",
    "color": "#DB2777",
    "url": "/pages/calculationParams/calculationParams",
    "stat": "count",
    "sumField": "",
    "statLabel": "公式"
  }
]
  }
});
