const db = require('../../../utils/reim-db');
const cbFiles = require('../../../utils/cb-files');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

/**
 * 状态 → 工作流动作。
 * need 字段声明该动作需要的角色能力，渲染时用 db.can() 过滤，
 * 避免审核人看到"提交"、报销人看到"通过/入账"这类越权按钮。
 */
const STATUS_ACTIONS = {
  '草稿': [{ key: 'submit', name: '提交审核', cls: 'btn-primary', need: 'submitWf' }],
  '待审核': [
    { key: 'approve', name: '通过', cls: 'btn-success', need: 'review' },
    { key: 'reject', name: '驳回', cls: 'btn-danger', need: 'review' },
    { key: 'withdraw', name: '撤回', cls: 'btn-plain', need: 'submitWf' }
  ],
  '已通过': [{ key: 'post', name: '入账', cls: 'btn-success', need: 'post' }],
  '已驳回': [{ key: 'submit', name: '重新提交', cls: 'btn-primary', need: 'submitWf' }],
  '已入账': []
};

Page({
  data: {
    me: null,
    kw: '',
    status: 'all',
    direction: '',
    statuses: ['all', '草稿', '待审核', '已通过', '已驳回', '已入账'],
    list: [],
    total: { count: 0, total: 0, tax: 0 },
    totalText: '0',
    taxText: '0',
    loading: false,
    canImport: false,
    // 操作弹窗
    modal: false,
    cur: null,
    curActions: [],
    curLog: [],
    curCanEdit: false,
    curCanDelete: false,
    __syncState: 'idle'
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    this.render();
    // 冷启动时云端数据可能还没回来，等同步完成后再渲染一次
    if (!db.isCloudSynced()) {
      this.setData({ loading: true });
      db.syncFromCloud(() => { this.setData({ loading: false }); this.render(); });
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

  render() {
    const me = this.currentUser();
    if (!me) return;
    // 数据范围：报销人只能看自己经手的发票，审核人/管理员看全部
    const scope = db.can(me, 'viewAll') ? {} : { claimant: me.display_name };
    const rows = db.queryInvoices(Object.assign({
      kw: this.data.kw,
      status: this.data.status,
      direction: this.data.direction
    }, scope));
    const sum = db.summarize(rows);
    this.setData({
      loading: false,
      me: Object.assign({}, me, {
        roleName: db.roleName(me.role),
        badge: me.role === 'admin' ? 'badge-red' : (me.role === 'approver' ? 'badge-blue' : 'badge-green'),
        initial: String(me.display_name || '?').slice(0, 1)
      }),
      canImport: db.can(me, 'import'),
      list: rows.map(r => Object.assign({}, r, {
        statusColor: db.STATUS_COLORS[r.status] || 'badge-gray',
        totalText: fmt.fmtMoney(r.total_amount || 0),
        taxText: fmt.fmtMoney(r.tax_amount || 0),
        parties: (r.direction === '销项' ? (r.buyer_name || '') : (r.seller_name || ''))
      })),
      total: { count: sum.count, total: sum.total, tax: sum.tax },
      totalText: fmt.fmtMoney(sum.total),
      taxText: fmt.fmtMoney(sum.tax)
    });
  },

  onKw(e) {
    this.setData({ kw: e.detail.value });
    // 输入防抖
    if (this._kwTimer) clearTimeout(this._kwTimer);
    this._kwTimer = setTimeout(() => this.render(), 300);
  },

  onStatus(e) {
    this.setData({ status: e.currentTarget.dataset.s });
    this.render();
  },

  onDirection(e) {
    const d = e.currentTarget.dataset.d;
    this.setData({ direction: this.data.direction === d ? '' : d });
    this.render();
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    const inv = db.findById(id);
    if (!inv) return;
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    const pay = db.paymentInfo(inv.total_amount, inv.paid_amount);
    // 动作按「角色能力 + 单据归属 + 单据状态」三重过滤（电脑端同规则）：
    //   状态必须匹配 → 角色必须有该能力 → 报销人还必须是自己的单据
    const actions = (STATUS_ACTIONS[inv.status] || []).filter(a =>
      db.canOnInvoice(me, a.need, inv));
    // 编辑/删除：报销人仅限自己的草稿/已驳回；管理员不限状态（与电脑端一致）
    const stateOk = me.role === 'admin' || inv.status === '草稿' || inv.status === '已驳回';
    this.setData({
      modal: true,
      me: Object.assign({}, me, {
        roleName: db.roleName(me.role),
        badge: me.role === 'admin' ? 'badge-red' : (me.role === 'approver' ? 'badge-blue' : 'badge-green'),
        initial: String(me.display_name || '?').slice(0, 1)
      }),
      cur: Object.assign({}, inv, {
        statusColor: db.STATUS_COLORS[inv.status] || 'badge-gray',
        totalText: fmt.fmtMoney(inv.total_amount || 0),
        amountText: fmt.fmtMoney(inv.amount || 0),
        taxText: fmt.fmtMoney(inv.tax_amount || 0),
        paidText: fmt.fmtMoney(inv.paid_amount || 0),
        payStatus: pay.status
      }),
      curActions: actions,
      curCanEdit: stateOk && db.canOnInvoice(me, 'edit', inv),
      curCanDelete: stateOk && db.canOnInvoice(me, 'del', inv),
      curLog: db.listReviewLogs(id).slice(0, 5)
    });
  },

  closeModal() { this.setData({ modal: false, cur: null }); },

  noop() {},

  /** 新增发票（FAB）：无编辑权限的角色不可用 */
  goNew() {
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    if (!db.can(me, 'import')) { wx.showToast({ title: '没有录入权限', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/reimbursement/edit/edit' });
  },

  goEdit() {
    const cur = this.data.cur;
    if (!cur) return;
    if (!this.data.curCanEdit) { wx.showToast({ title: '没有编辑权限', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/reimbursement/edit/edit?id=' + cur.id });
    this.closeModal();
  },

  doAction(e) {
    const key = e.currentTarget.dataset.key;
    const cur = this.data.cur;
    if (!cur) return;
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    // 越权二次校验：即便按钮被绕过，动作仍按角色能力拦截
    const act = (STATUS_ACTIONS[cur.status] || []).find(a => a.key === key);
    if (!act || !db.canOnInvoice(me, act.need, cur)) {
      wx.showToast({ title: '没有该操作权限', icon: 'none' });
      return;
    }
    const op = me.display_name || me.username || '小程序用户';
    if (key === 'reject') {
      wx.showModal({
        title: '驳回发票',
        content: '发票号 ' + cur.invoice_no,
        editable: true,
        placeholderText: '请填写审核意见（必填）',
        success: res => {
          if (!res.confirm) return;
          const r = db.workflow(cur.id, 'reject', op, (res.content || '').trim());
          if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
          wx.showToast({ title: '已驳回', icon: 'success' });
          this.closeModal();
          this.render();
        }
      });
      return;
    }
    if (key === 'approve' || key === 'post') {
      wx.showModal({
        title: key === 'approve' ? '审核通过' : '确认入账',
        content: '发票号 ' + cur.invoice_no + '，金额 ¥' + fmt.fmtMoney(cur.total_amount || 0),
        success: res => {
          if (!res.confirm) return;
          const r = db.workflow(cur.id, key, op);
          if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
          wx.showToast({ title: key === 'approve' ? '已通过' : '已入账', icon: 'success' });
          this.closeModal();
          this.render();
        }
      });
      return;
    }
    // submit / withdraw 直接执行
    const r = db.workflow(cur.id, key, op);
    if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
    wx.showToast({ title: key === 'submit' ? '已提交审核' : '已撤回', icon: 'success' });
    this.closeModal();
    this.render();
  },

  deleteInvoice() {
    const cur = this.data.cur;
    if (!cur) return;
    if (!this.data.curCanDelete) { wx.showToast({ title: '没有删除权限', icon: 'none' }); return; }
    wx.showModal({
      title: '删除发票',
      content: '删除后不可恢复：' + cur.invoice_no,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        // 云端原件尽力删除（失败不打扰）
        if (cur.cloud_path) {
          cbFiles.removeByPath(cur.cloud_path).catch(() => {});
        }
        db.deleteInvoice(cur.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.closeModal();
        this.render();
      }
    });
  },

  /** 打开云端 PDF 原件 */
  openOriginal() {
    const cur = this.data.cur;
    if (!cur || !cur.cloud_path) {
      wx.showToast({ title: '该发票无云端原件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '获取原件...' });
    cbFiles.downloadUrlByPath(cur.cloud_path).then(url => {
      return new Promise((resolve, reject) => {
        wx.downloadFile({
          url: url,
          success: r => {
            if (r.statusCode !== 200) { reject(new Error('下载失败 ' + r.statusCode)); return; }
            resolve(r.tempFilePath);
          },
          fail: e => reject(new Error(e.errMsg || '下载失败'))
        });
      });
    }).then(path => {
      wx.hideLoading();
      wx.openDocument({
        filePath: path,
        fileType: 'pdf',
        fail: () => wx.showToast({ title: '无法打开 PDF', icon: 'none' })
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '获取原件失败', icon: 'none' });
    });
  }
});
