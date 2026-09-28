const db = require('../../../utils/reim-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

/** 时间范围：全部 / 本月 / 近3月 / 今年 → 起始日期（空串表示不限） */
function rangeStart(key) {
  const now = new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (key === 'month') return y + '-' + p(m) + '-01';
  if (key === 'quarter') {
    const startM = m - 2 <= 0 ? m + 10 : m - 2;
    const startY = m - 2 <= 0 ? y - 1 : y;
    return startY + '-' + p(startM) + '-01';
  }
  if (key === 'year') return y + '-01-01';
  return '';
}

Page({
  data: {
    me: null,
    range: 'all',          // all | month | quarter | year
    ranges: [
      { key: 'all', name: '全部' },
      { key: 'month', name: '本月' },
      { key: 'quarter', name: '近3月' },
      { key: 'year', name: '今年' }
    ],
    kpi: {},
    byStatus: [],
    bySubject: [],
    byMonth: [],
    byDirection: [],
    __syncState: 'idle'
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    this.render();
    if (!db.isCloudSynced()) {
      db.syncFromCloud(() => this.render());
    }
  },

  /** 当前身份（全局优先，其次本地持久化） */
  currentUser() {
    const app = getApp();
    let u = app && app.globalData && app.globalData.reimUser;
    if (!u) {
      try { u = wx.getStorageSync('reim_login_user') || null; } catch (e) { u = null; }
      if (u && app && app.globalData) app.globalData.reimUser = u;
    }
    return u || null;
  },

  onPullDownRefresh() {
    db.syncFromCloud((ok, count) => {
      this.render();
      wx.stopPullDownRefresh();
      if (ok) wx.showToast({ title: '已同步云端（' + count + ' 项）', icon: 'none' });
      else wx.showToast({ title: '云端同步失败', icon: 'none' });
    });
  },

  onRange(e) {
    this.setData({ range: e.currentTarget.dataset.k });
    this.render();
  },

  render() {
    const me = this.currentUser();
    if (!me) return;
    // 报销人只看自己的发票统计
    const scope = db.can(me, 'viewAll') ? {} : { claimant: me.display_name };
    const rows = db.queryInvoices(Object.assign({ dateFrom: rangeStart(this.data.range) }, scope));
    const s = db.summarize(rows);
    const maxTotal = Math.max(1, s.total);

    const maxStatus = Math.max(1, ...Object.keys(s.byStatus).map(k => s.byStatus[k].total || 0));
    const byStatus = Object.keys(s.byStatus).map(k => ({
      name: k,
      count: s.byStatus[k].count,
      total: s.byStatus[k].total,
      totalText: fmt.fmtMoney(s.byStatus[k].total),
      color: db.STATUS_COLORS[k] || 'badge-gray',
      pct: Math.round((s.byStatus[k].total || 0) / maxStatus * 100)
    })).sort((a, b) => b.total - a.total);

    const maxSubject = Math.max(1, ...Object.keys(s.bySubject).map(k => s.bySubject[k].total || 0));
    const bySubject = Object.keys(s.bySubject).map(k => ({
      name: k,
      code: rows.find(r => r.subject_name === k) ? (rows.find(r => r.subject_name === k).subject_code || '') : '',
      count: s.bySubject[k].count,
      total: s.bySubject[k].total,
      tax: s.bySubject[k].tax,
      totalText: fmt.fmtMoney(s.bySubject[k].total),
      taxText: fmt.fmtMoney(s.bySubject[k].tax),
      pct: Math.round((s.bySubject[k].total || 0) / maxSubject * 100)
    })).sort((a, b) => b.total - a.total);

    const byMonth = Object.keys(s.byMonth).sort().reverse().map(k => ({
      name: k,
      count: s.byMonth[k].count,
      total: s.byMonth[k].total,
      totalText: fmt.fmtMoney(s.byMonth[k].total),
      pct: Math.round((s.byMonth[k].total || 0) / maxTotal * 100)
    }));

    const jin = rows.filter(r => r.direction === '进项');
    const xiao = rows.filter(r => r.direction === '销项');
    const sumOf = list => list.reduce((t, r) => t + (r.total_amount || 0), 0);
    const byDirection = [
      { name: '进项', count: jin.length, totalText: fmt.fmtMoney(Math.round(sumOf(jin) * 100) / 100), taxText: fmt.fmtMoney(Math.round(jin.reduce((t, r) => t + (r.tax_amount || 0), 0) * 100) / 100), cls: 'in' },
      { name: '销项', count: xiao.length, totalText: fmt.fmtMoney(Math.round(sumOf(xiao) * 100) / 100), taxText: fmt.fmtMoney(Math.round(xiao.reduce((t, r) => t + (r.tax_amount || 0), 0) * 100) / 100), cls: 'out' }
    ];

    this.setData({
      me: Object.assign({}, me, {
        roleName: db.roleName(me.role),
        scopeText: db.can(me, 'viewAll') ? '全部发票' : '我经手的发票'
      }),
      kpi: {
        count: s.count,
        totalText: fmt.fmtMoney(s.total),
        taxText: fmt.fmtMoney(s.tax),
        amountText: fmt.fmtMoney(s.amount),
        pendingCount: s.pending.count,
        pendingTotalText: fmt.fmtMoney(s.pending.total)
      },
      byStatus: byStatus,
      bySubject: bySubject,
      byMonth: byMonth,
      byDirection: byDirection
    });
  }
});
