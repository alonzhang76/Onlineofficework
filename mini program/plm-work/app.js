/**
 * 普利美工作 —— 企业应用门户小程序
 *
 * 首页为「普利美工作」工作台，点击图标进入各子应用：
 *   1. 计件工资管理（wage）──── utils/wage-db.js
 *   2. 外贸出口管理系统（trade）── utils/trade-db.js（密码保护）
 *   3. 订单排程（schedule）──── utils/schedule-db.js
 *   4. 采购管理（purchase）──── utils/purchase-db.js
 *   5. 收支管理（income）────── utils/income-db.js（密码保护）
 *   6. 发票报销（reimbursement）── utils/reim-db.js（与电脑端报销系统共用云端数据）
 *
 * 各子应用数据独立存储，并各自与 CloudBase 云端同步
 * （命名空间 wage / trade / schedule / purchase，与网页版共用同一后端）。
 */
const wageDb = require('./utils/wage-db');
const tradeDb = require('./utils/trade-db');
const scheduleDb = require('./utils/schedule-db');
const purchaseDb = require('./utils/purchase-db');
const incomeDb = require('./utils/income-db');
const reimDb = require('./utils/reim-db');
const cb = require('./utils/cloudbase');

/* ============ 电脑网页端变更 → 小程序自动更新 ============
 * 1) 小程序在前台时每 15 秒拉取一次云端；切回前台立即拉一次；
 *    页面间切换也会节流触发（8 秒内不重复），保证"回到某页即较新"。
 * 2) 全局包装 Page：注入默认 onCloudUpdate —— 云端数据有变化时自动调用
 *    页面既有的 render()/search()/refresh() 重渲染；编辑弹窗
 *    （data.modal / data.showForm 为真）打开时跳过，绝不打断正在填写的表单。
 *    页面可自定义 onCloudUpdate 覆盖默认行为。
 */
var CLOUD_POLL_INTERVAL = 15000; // 前台停留轮询间隔
var CLOUD_TICK_THROTTLE = 8000;  // onShow/切页触发的最小间隔
var SYNC_DBS = [
  { ns: 'wage', mod: wageDb },
  { ns: 'trade', mod: tradeDb },
  { ns: 'schedule', mod: scheduleDb },
  { ns: 'purchase', mod: purchaseDb },
  { ns: 'incomeexpense', mod: incomeDb },
  { ns: 'reimbursement', mod: reimDb }
];

/*
 * 全局包装 Page：注入默认 onCloudUpdate。
 *
 * 注意（踩坑记录）：不要用 `Page = function(...)` 直接改写全局 Page 标识符。
 * 在 `lazyCodeLoading: "requiredComponents"` 下，页面模块是「按需注入」的，
 * 框架内部仍持有原始 Page 引用；对全局标识符重新赋值会让部分页面走不到
 * 原生注册流程，开发者工具报：
 *     Page "pages/login/login" has not been registered yet.
 *     Component is not found in path "wx://not-found".
 * 正确做法是包装 window/global 上的原始方法并原地回写（见下），
 * 且必须在任何 require('./pages/...') 之前完成。
 */
function _installPageWrapper() {
  var host = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof global !== 'undefined') ? global : this;
  if (!host || typeof host.Page !== 'function') return;
  if (host.__plmPageWrapped) return;      // 幂等：热重载时不会层层套娃
  var _OrigPage = host.Page;
  host.Page = function (options) {
    options = options || {};
    var _onShow = options.onShow;
    options.onShow = function () {
      if (typeof _onShow === 'function') _onShow.apply(this, arguments);
      // 切到该页：节流拉取云端（变化时由 app.cloudTick 回调 onCloudUpdate）
      try {
        var app = getApp();
        if (app && typeof app.cloudTick === 'function') app.cloudTick();
      } catch (e) {}
    };
    if (typeof options.onCloudUpdate !== 'function') {
      options.onCloudUpdate = function () {
        var d = this.data || {};
        // 编辑弹窗打开期间不刷新，避免覆盖正在输入的表单
        if (d.modal || d.showForm) return;
        if (typeof this.render === 'function') return this.render();
        if (typeof this.search === 'function') return this.search();
        if (typeof this.refresh === 'function') return this.refresh();
      };
    }
    return _OrigPage.call(host, options);
  };
  host.__plmPageWrapped = true;
}
_installPageWrapper();

App({
  onLaunch() {
    // 每次冷启动重置外贸/排程/收支模块的解锁状态
    this.globalData.tradeUnlocked = false;
    this.globalData.scheduleUnlocked = false;
    this.globalData.incomeExpenseUnlocked = false;
    // 恢复门户登录用户（决定首页可见应用；未登录由 home 页引导去登录页）
    this.globalData.user = cb.getUser();
    /*
     * 所有启动工作推迟到下一个事件循环 tick 执行。
     * 原因：onLaunch 内同步发起 wx.request / setData 时，开发者工具会先抛出
     * "Page route 错误(system error) — appLaunch with non-empty page stack"
     * （request/页面栈尚未初始化完成），并打断首个页面的路由。
     * 推迟一 tick 后页面栈与网络模块均已就绪，异常消失，且对用户无感知。
     */
    setTimeout(() => {
      try {
        // 本地加载
        wageDb.loadAll();
        tradeDb.loadAll();
        scheduleDb.loadAll();
        purchaseDb.loadAll();
        incomeDb.loadAll();
        reimDb.loadAll();
        // 云端拉取合并（本地有更新写入时保留本地并自动补推，未配置 CloudBase 时静默跳过）
        wageDb.syncFromCloud();
        tradeDb.syncFromCloud();
        scheduleDb.syncFromCloud();
        purchaseDb.syncFromCloud();
        incomeDb.syncFromCloud();
        reimDb.syncFromCloud();
        // 补发上次进程被切后台/杀死前未确认成功的本地写入
        cb.flushQueue();
      } catch (e) {
        console.warn('[app] 启动数据加载失败', e);
      }
      // 云端轮询状态
      this._cloudTimer = null;
      this._cloudSyncing = null;
      this._launched = true;            // 启动守卫：允许 cloudTick 拉取
      this._lastCloudSync = Date.now(); // 冷启动已拉过一次，抑制首页 onShow 的重复拉取
      this.startCloudPoll();
    }, 0);
    // 同步状态指示灯：监听 cloudbase 状态变化，下发给当前页面 + 关键状态弹 toast
    this._lastToastState = null;
    cb.onSyncStateChange(state => this.propagateSyncState(state));
  },

  onShow() {
    // 回到前台：补发本地写入 + 立即拉取云端 + 重启轮询
    cb.flushQueue();
    this.startCloudPoll();
    /*
     * 注意：这里不再同步调用 cloudTick()。
     * 冷启动的 onLaunch → onShow 之间页面栈可能尚未就绪，此时发起
     * syncFromCloud 会走到 cloudbase 的 pullAll → wx.request，在网络回调
     * 阶段撞上框架内部的页面类型查询（getPageTypeById），在开发者工具里
     * 报 "SystemError (appServiceSDKScriptError) / Cannot read properties
     * of undefined (reading 'getPageTypeById')"。推迟一 tick 让页面栈就绪。
     * 冷启动的首次拉取已由 onLaunch 的 setTimeout 负责，此处只处理
     * 「从后台返回前台」的场景，且受 _lastCloudSync 节流保护。
     */
    setTimeout(() => {
      try { this.cloudTick(); } catch (e) { /* 页面栈未就绪时静默跳过 */ }
      // 重新向前台页面下发一次状态
      this.propagateSyncState(cb.getSyncState());
    }, 0);
  },

  onHide() {
    // 切到后台：停轮询；尽力把待发送写入发出去（发不完的已持久化，下次回前台继续补发）
    this.stopCloudPoll();
    cb.flushQueue();
  },

  /** 把同步状态下发给当前页面（用于驱动指示灯 UI）+ 关键状态弹 toast
   *  注意：必须延迟到下一个 tick，避免在 App.onLaunch 早期阶段调用 setData
   *  触发框架 "J.updatePage is not a function" 警告。
   */
  propagateSyncState(state) {
    setTimeout(() => {
      try {
        // getCurrentPages 在页面栈未就绪时可能返回非数组，先做形状校验
        const pages = getCurrentPages();
        const page = (Array.isArray(pages) && pages.length) ? pages[pages.length - 1] : null;
        if (page && typeof page.setData === 'function' && page.data) {
          page.setData({ __syncState: state });
        }
      } catch (e) { /* 页面栈未就绪，忽略 */ }
      // 进入错误/离线时弹一次 toast（避免连续重复弹）
      if (state === this._lastToastState) return;
      this._lastToastState = state;
      if (state === 'error') {
        wx.showToast({ title: '上传失败，重试中', icon: 'none', duration: 1500 });
      } else if (state === 'offline') {
        wx.showToast({ title: '云端未连接', icon: 'none', duration: 1500 });
      }
      // idle 状态静默：指示灯变绿即可，不打扰
    }, 0);
  },

  /** 启动前台轮询（重复调用安全） */
  startCloudPoll() {
    this.stopCloudPoll();
    var self = this;
    this._cloudTimer = setInterval(function () { self.cloudTick(true); }, CLOUD_POLL_INTERVAL);
  },

  stopCloudPoll() {
    if (this._cloudTimer) { clearInterval(this._cloudTimer); this._cloudTimer = null; }
  },

  /**
   * 拉取全部命名空间云端数据并把变化下发给当前页。
   * @param {boolean} force 忽略节流（定时轮询时用）
   */
  cloudTick(force) {
    /*
     * 启动守卫：onLaunch 的延迟初始化尚未执行完（_lastCloudSync 未落值）时不拉取。
     * 否则 onShow 可能抢在 onLaunch 的 setTimeout 之前跑到这里，在页面栈/网络
     * 模块未就绪时发起请求，触发框架层 SystemError（screenHeight / getPageTypeById）。
     * onLaunch 完成后会自行置 _lastCloudSync 并启动轮询，不会漏掉首次拉取。
     */
    if (!this._launched) return;
    if (!force && Date.now() - (this._lastCloudSync || 0) < CLOUD_TICK_THROTTLE) return;
    if (this._cloudSyncing) return this._cloudSyncing;
    this._lastCloudSync = Date.now();

    var before = SYNC_DBS.map(function (d) {
      try { return JSON.stringify(d.mod.data); } catch (e) { return ''; }
    });

    this._cloudSyncing = new Promise(resolve => {
      var remaining = SYNC_DBS.length;
      SYNC_DBS.forEach(d => {
        d.mod.syncFromCloud(() => {
          if (--remaining > 0) return;
          var changed = [];
          SYNC_DBS.forEach((d, i) => {
            var after = '';
            try { after = JSON.stringify(d.mod.data); } catch (e) {}
            if (after !== before[i]) changed.push(d.ns);
          });
          this._cloudSyncing = null;
          if (changed.length) {
            try {
              var pages = getCurrentPages();
              var page = (Array.isArray(pages) && pages.length) ? pages[pages.length - 1] : null;
              if (page && typeof page.onCloudUpdate === 'function') page.onCloudUpdate(changed);
            } catch (e) { /* 页面栈未就绪，忽略 */ }
          }
          resolve(changed);
        });
      });
    });
    return this._cloudSyncing;
  },

  globalData: {
    // 公司名称（各页面页首统一展示）
    companyName: '普利美（常州）环境工程科技有限公司',
    companyNameEn: 'PULIMEI (CHANGZHOU) ENVIRONMENTAL ENGINEERING TECHNOLOGY CO., LTD.',
    // 外贸出口模块访问密码（点击门户「外贸出口」需验证）
    tradePassword: 'alon2601',
    // 订单排程模块访问密码
    schedulePassword: 'anny2601',
    // 收支模块访问密码
    incomeExpensePassword: 'anny2601',
    // 本次启动内是否已通过验证（冷启动重置为 false）
    tradeUnlocked: false,
    // 订单排程模块解锁状态（冷启动重置）
    scheduleUnlocked: false,
    // 收支模块解锁状态（冷启动重置）
    incomeExpenseUnlocked: false,
    // 门户应用清单
    apps: [
      {
        key: 'wage',
        name: '计件工资',
        nameEn: 'Piece-rate Wage',
        desc: '登记 · 汇总 · 统计',
        icon: '💰',
        color: '#007AFF',
        url: '/pages/wage/entry/entry'
      },
      {
        key: 'trade',
        name: '外贸出口',
        nameEn: 'Export Trade',
        desc: '订单 · 收汇 · 报表',
        icon: '🚢',
        color: '#34C759',
        url: '/pages/trade/hub/hub'
      },
      {
        key: 'schedule',
        name: '订单排程',
        nameEn: 'Order Schedule',
        desc: '排程 · 生产 · 收款',
        icon: '📅',
        color: '#FF9500',
        url: '/pages/schedule/hub/hub'
      },
      {
        key: 'income',
        name: '收支管理',
        nameEn: 'Income & Expense',
        desc: '流水 · 待办 · 统计',
        icon: '💹',
        color: '#00C7BE',
        url: '/pages/income/hub/hub'
      },
      {
        key: 'purchase',
        name: '采购管理',
        nameEn: 'Purchase',
        desc: '订单 · 发票 · 付款',
        icon: '🛒',
        color: '#5856D6',
        url: '/pages/purchase/hub/hub'
      },
      {
        key: 'reimbursement',
        name: '发票报销',
        nameEn: 'Reimbursement',
        desc: '导入 · 台账 · 审核',
        icon: '🧾',
        color: '#FF6B35',
        url: '/pages/reimbursement/hub/hub'
      }
    ]
  }
});
