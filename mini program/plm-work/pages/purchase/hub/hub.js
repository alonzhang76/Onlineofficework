const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

const MODULE_COLOR = {
  dashboard: '#007AFF', purchase: '#5856D6', ship: '#FF9500', receive: '#34C759',
  invoice: '#FF3B30', payment: '#00C7BE', recon: '#AF52DE', suppliers: '#FF9F0A',
  reports: '#5AC8FA', tools: '#8E8E93', admin: '#1C1C1E'
};
const MODULE_ICON = {
  dashboard: '⌂', purchase: '📋', ship: '🚚', receive: '📥', invoice: '🧾',
  payment: '💳', recon: '⚖️', suppliers: '🏭', reports: '📊', tools: '🧮', admin: '⚙️'
};

Page({
  data: {
    companyIdx: 0,
    companyOptions: [],
    isSupplier: false,
    brandName: '',
    brandEn: '',
    roleName: '',
    userName: '',
    modules: [],
    kpi: {},
    todos: [],
    recents: [],
    cloudOn: false,
    __syncState: 'idle'
  },

  onLoad() {
    this.guard();
    if (typeof db.syncFromCloud === 'function') {
      db.syncFromCloud(() => { if (this.__ready) this.render(); });
    }
  },

  onShow() {
    if (!this.guard()) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  /** 登录门禁：无会话或会话失效 → 跳采购登录页 */
  guard() {
    db.loadSession();
    if (!db.Session.user) {
      wx.redirectTo({ url: '/pages/purchase/login/login' });
      return false;
    }
    this.__ready = true;
    return true;
  },

  onPullDownRefresh() {
    try { if (typeof supa.flushQueue === 'function') supa.flushQueue(); } catch (e) {}
    db.syncFromCloud((ok, count) => {
      this.render();
      wx.stopPullDownRefresh();
      if (ok) wx.showToast({ title: '已同步云端（' + count + ' 项）', icon: 'none' });
      else wx.showToast({ title: '云端同步失败，请检查网络', icon: 'none' });
    });
  },

  render() {
    const S = db.Session;
    if (!S.user) return;
    const isSupplier = S.isSupplier();
    const comps = db.companies();
    const options = comps.map(c => c.code);
    let idx = options.indexOf(db.curCompany());
    if (idx < 0) idx = 0;
    // 首次进入 / 云端主体已失效时归一化当前公司主体
    if (db.curCompany() !== options[idx]) db.setCurCompany(options[idx]);

    const st = db.dashboardStats();
    const role = S.role();

    // 快捷入口：按权限过滤（adminOnly 仅管理员可见；供应商不显示供应商管理）
    const modules = db.PAGES.filter(p => {
      if (p.adminOnly && !S.isAdmin()) return false;
      if (!S.can(p.key)) return false;
      if (isSupplier && p.key === 'suppliers') return false;
      if (isSupplier && p.key === 'admin') return false;
      return true;
    }).map(p => Object.assign({}, p, {
      icon: MODULE_ICON[p.key] || '•',
      color: MODULE_COLOR[p.key] || '#007AFF'
    }));

    // 待办：供应商看未读「需方消息」
    const todos = [];
    if (isSupplier) {
      db.unreadShipMsgs().forEach(r => todos.push({
        id: r.id, title: '需方消息 · ' + (r.shipNumber || ''),
        sub: (r.product || '') + ' · 发货 ' + db.num(r.quantity) + (r.receiveRemark ? ' · ' + r.receiveRemark : ''),
        tag: '待查看', cls: 'badge-orange'
      }));
    } else {
      // 采购员：待确认到货 / 逾期未收合同
      const pending = db.pendingShips();
      if (pending.length) todos.push({
        id: 'pending-ship', title: '待确认到货',
        sub: pending.length + ' 条发货单等待收货确认', tag: '待处理', cls: 'badge-orange'
      });
      const today = db.todayStr();
      const overdue = db.list('orders').filter(o => {
        if (!o.deliveryDate || o.deliveryDate >= today) return false;
        const stt = db.orderStatus(o);
        return stt.t === '未收货' || stt.t === '部分收货';
      });
      if (overdue.length) todos.push({
        id: 'overdue', title: '交货期逾期',
        sub: overdue.length + ' 份合同已过交货期仍未收齐', tag: '关注', cls: 'badge-red'
      });
      const diff = db.quantityDiffs();
      if (diff.length) todos.push({
        id: 'diff', title: '数量差异待处理',
        sub: diff.length + ' 项实收与合同数量不一致', tag: '核对', cls: 'badge-blue'
      });
    }

    const kpi = {
      contractCount: st.orderCount,
      totalAmount: fmt.fmtMoney(st.totalAmount),
      invoiced: fmt.fmtMoney(st.invoiced),
      invoiceCount: st.invoiceCount,
      paid: fmt.fmtMoney(st.paid),
      payCount: st.payCount,
      card4Label: st.card4Label,
      card4Value: fmt.fmtMoney(st.card4Value),
      card4Cls: st.card4Value > 0.005 ? 'red' : 'green'
    };

    const info = db.buyerInfoOf(isSupplier ? '' : db.curCompany());

    this.setData({
      companyIdx: idx,
      companyOptions: options,
      isSupplier: isSupplier,
      brandName: isSupplier ? (S.mySupplier() || '供应商门户') : (db.companyName(db.curCompany())),
      brandEn: isSupplier ? 'SUPPLIER PORTAL' : info.companyName,
      roleName: role.name || '',
      userName: S.displayName(),
      modules: modules,
      kpi: kpi,
      todos: todos,
      recents: db.recentActivities(),
      cloudOn: supa.isConfigured()
    });
  },

  onCompany(e) {
    const i = +e.currentTarget.dataset.i;
    const code = this.data.companyOptions[i] || this.data.companyOptions[0];
    db.setCurCompany(code);
    this.render();
    wx.showToast({ title: '已切换到：' + db.companyName(code), icon: 'none' });
  },

  go(e) {
    const key = e.currentTarget.dataset.key;
    const p = db.PAGE_BY_KEY[key];
    if (!p) return;
    if (!db.Session.can(key)) { wx.showToast({ title: '当前角色无权访问该模块', icon: 'none' }); return; }
    wx.navigateTo({ url: p.url });
  },

  goHome() { wx.reLaunch({ url: '/pages/home/home' }); },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前采购账号？本机数据保留，云端数据不受影响。',
      confirmText: '退出', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.logout();
        wx.redirectTo({ url: '/pages/purchase/login/login' });
      }
    });
  }
});
