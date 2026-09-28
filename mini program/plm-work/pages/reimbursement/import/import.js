const db = require('../../../utils/reim-db');
const reimPdf = require('../../../utils/reim-pdf');
const cbFiles = require('../../../utils/cb-files');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');

/**
 * 导入发票页
 * 流程：wx.chooseMessageFile 从微信聊天记录选 PDF → reimPdf 轻量解析
 *       → reimDb.saveInvoice 查重/公司匹配/科目归类/入库
 *       → cbFiles.uploadExact 按电脑端约定归档 PDF/{公司}/{方向}/{发票号}.pdf
 * 解析较重，逐个串行执行，避免并发卡顿。
 */
Page({
  data: {
    me: null,
    claimant: '',
    claimantLocked: false,
    items: [],          // 导入结果列表
    importing: false,
    doneCount: 0,
    okCount: 0,
    dupCount: 0,
    failCount: 0,
    cloudOn: false,
    __syncState: 'idle'
  },

  onLoad() {
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    // 无导入权限的角色（审核人）直接退回
    if (!db.can(me, 'import')) {
      wx.showToast({ title: '当前角色无导入权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
      return;
    }
    // 报销人：报销人字段锁定为本人（电脑端同规则）；管理员可自由指定
    const locked = me.role === 'claimant';
    this.setData({
      me: Object.assign({}, me, { roleName: db.roleName(me.role) }),
      claimant: me.display_name || me.username || '',
      claimantLocked: locked,
      cloudOn: supa.isConfigured()
    });
  },

  onShow() {
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
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

  onClaimant(e) {
    if (this.data.claimantLocked) return;
    this.setData({ claimant: e.detail.value });
  },

  /** 从微信聊天记录选择 PDF 发票 */
  chooseFiles() {
    if (this.data.importing) return;
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      extension: ['pdf'],
      success: res => {
        const files = (res.tempFiles || []).filter(f => f && f.path);
        if (!files.length) return;
        this.importFiles(files);
      },
      fail: (e) => {
        if (e && /cancel/.test(e.errMsg || '')) return;
        wx.showToast({ title: '选择文件失败', icon: 'none' });
      }
    });
  },

  importFiles(files) {
    // 新文件占位插到列表最前面，旧结果保留在下方
    const slots = files.map((f, i) => ({
      key: 'f' + Date.now() + '_' + i,
      fileName: f.name || String(f.path).split('/').pop(),
      filePath: f.path,
      sizeText: this.fmtSize(f.size || 0),
      state: 'wait',       // wait | parsing | ok | dup | fail
      stateText: '等待解析',
      stateColor: 'badge-gray',
      inv: null,
      error: ''
    }));
    this.setData({
      items: slots.concat(this.data.items),
      importing: true,
      doneCount: 0,
      okCount: 0,
      dupCount: 0,
      failCount: 0
    });
    // 串行处理，全部完成后汇总提示
    let p = Promise.resolve();
    slots.forEach(slot => { p = p.then(() => this.processOne(slot)); });
    p.then(() => {
      this.setData({ importing: false });
      const s = this.data;
      wx.showToast({
        title: '完成：新增' + s.okCount + ' 重复' + s.dupCount + ' 失败' + s.failCount,
        icon: 'none', duration: 2500
      });
    });
  },

  /** 单个文件：读文件 → 解析 → 入库 → 归档 PDF */
  processOne(slot) {
    this.patch(slot.key, { state: 'parsing', stateText: '解析中...', stateColor: 'badge-blue' });
    return this.readBuf(slot.filePath)
      .then(buf => reimPdf.parseInvoicePdf(buf))
      .then(parsed => {
        // 报销人：锁定角色固定用本人，其余用表单值
        const claimant = this.data.claimantLocked
          ? (this.data.me && (this.data.me.display_name || this.data.me.username)) || this.data.claimant
          : this.data.claimant;
        // 入库（saveInvoice 内部做查重 + 公司方向匹配 + 科目归类）
        const res = db.saveInvoice(Object.assign({}, parsed, {
          claimant: claimant,
          department: (this.data.me && this.data.me.department) || '',
          source: '微信导入'
        }));
        if (!res.ok) {
          const dup = !!res.duplicate;
          this.bump(dup ? 'dupCount' : 'failCount');
          this.patch(slot.key, {
            state: dup ? 'dup' : 'fail',
            stateText: dup ? '发票号已存在，自动跳过' : (res.msg || '入库失败'),
            stateColor: dup ? 'badge-orange' : 'badge-red',
            inv: this.view({ invoice_no: parsed.invoice_no, total_amount: parsed.total_amount })
          });
          return;
        }
        const inv = res.invoice;
        // 归档 PDF 到云端（失败不阻塞入库，cloud_path 留空可稍后补传）
        const cloudKey = db.cloudPdfKey(inv.company_short, inv.direction, inv.invoice_no);
        return cbFiles.uploadExact('reimbursement', cloudKey, slot.filePath)
          .then(() => {
            inv.cloud_path = cloudKey;
            db.saveInvoice(inv); // 回写 cloud_path
            this.bump('okCount');
            this.patch(slot.key, {
              state: 'ok', stateText: '已入库 · PDF 已归档',
              stateColor: 'badge-green', inv: this.view(inv)
            });
          })
          .catch(err => {
            this.bump('okCount');
            this.patch(slot.key, {
              state: 'ok', stateText: '已入库 · PDF 归档失败',
              stateColor: 'badge-green', inv: this.view(inv),
              error: err.message || String(err)
            });
          });
      })
      .catch(err => {
        this.bump('failCount');
        this.patch(slot.key, {
          state: 'fail', stateText: '解析失败',
          stateColor: 'badge-red',
          error: err.message || String(err)
        });
      });
  },

  /** 本地文件 → ArrayBuffer */
  readBuf(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        success: r => resolve(r.data),
        fail: e => reject(new Error('读取文件失败: ' + (e.errMsg || '')))
      });
    });
  },

  /** 展示字段 */
  view(inv) {
    return Object.assign({}, inv, {
      totalText: fmt.fmtMoney(inv.total_amount || 0),
      statusColor: db.STATUS_COLORS[inv.status] || 'badge-gray'
    });
  },

  bump(counter) {
    const d = {};
    d[counter] = this.data[counter] + 1;
    d.doneCount = this.data.doneCount + 1;
    this.setData(d);
  },

  fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
    return (n / 1024 / 1024).toFixed(2) + 'MB';
  },

  patch(key, fields) {
    const items = this.data.items.map(it => it.key === key ? Object.assign({}, it, fields) : it);
    this.setData({ items: items });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/reimbursement/edit/edit?id=' + id });
  },

  clearDone() {
    const items = this.data.items.filter(it => it.state === 'wait' || it.state === 'parsing');
    this.setData({ items: items });
  }
});
