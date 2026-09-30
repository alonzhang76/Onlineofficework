/**
 * 供应商管理 — 卡片式供应商档案
 * 字段与桌面端 suppliers.html 一致：supplierNumber/Name、contactPerson、phoneNumber、
 * email、companyAddress、bankName、bankCode、bankAccount、remarks。
 * 改名会级联更新全部业务单据的 supplier 字段（db.saveSupplier 内部处理）。
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const csv = require('../../../utils/csv');

function emptyForm() {
  return {
    id: '', supplierNumber: '', supplierName: '', contactPerson: '', phoneNumber: '',
    email: '', companyAddress: '', bankName: '', bankCode: '', bankAccount: '', remarks: ''
  };
}

Page({
  data: {
    ready: false, denied: false, canWrite: false,
    kw: '',
    list: [], total: 0,
    form: emptyForm(),
    modal: false, isEdit: false,
    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('suppliers')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true, canWrite: db.Session.canWrite('suppliers') });
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); });
  },

  render() {
    const kw = String(this.data.kw || '').trim().toLowerCase();
    let rows = db.suppliers().map(s => {
      const contracts = db.all('orders').filter(o => o.supplier === s.supplierName);
      const invAmt = db.all('invoices').filter(v => v.supplier === s.supplierName)
        .reduce((sum, v) => sum + db.num(v.amount), 0);
      return {
        id: s.id,
        supplierName: s.supplierName || '',
        supplierNumber: s.supplierNumber || '',
        contactPerson: s.contactPerson || '',
        phoneNumber: s.phoneNumber || '',
        email: s.email || '',
        companyAddress: s.companyAddress || '',
        bankName: s.bankName || '',
        bankCode: s.bankCode || '',
        bankAccount: s.bankAccount || '',
        remarks: s.remarks || '',
        contractCount: contracts.length,
        invAmount: db.r2(invAmt)
      };
    });
    if (kw) {
      rows = rows.filter(r => (r.supplierName + ' ' + r.contactPerson + ' ' + r.phoneNumber + ' ' + r.supplierNumber).toLowerCase().indexOf(kw) >= 0);
    }
    rows.sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName), 'zh'));
    this.setData({ list: rows, total: rows.length });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  resetFilter() { this.setData({ kw: '' }); this.render(); },

  /* ==================== 表单 ==================== */

  openAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法新增', icon: 'none' }); return; }
    this.setData({ modal: true, isEdit: false, form: emptyForm() });
  },

  openEdit(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const s = db.suppliers().find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!s) return;
    this.setData({
      modal: true, isEdit: true,
      form: {
        id: s.id, supplierNumber: s.supplierNumber || '',
        supplierName: s.supplierName || '', contactPerson: s.contactPerson || '',
        phoneNumber: s.phoneNumber || '', email: s.email || '',
        companyAddress: s.companyAddress || '', bankName: s.bankName || '',
        bankCode: s.bankCode || '', bankAccount: s.bankAccount || '', remarks: s.remarks || ''
      }
    });
  },

  closeModal() { this.setData({ modal: false, form: emptyForm() }); },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['form.' + k]: e.detail.value });
  },

  save() {
    const f = this.data.form;
    if (!String(f.supplierName || '').trim()) { wx.showToast({ title: '请填写供应商名称', icon: 'none' }); return; }
    const res = db.saveSupplier({
      id: f.id || '', supplierNumber: f.supplierNumber || '',
      supplierName: String(f.supplierName).trim(),
      contactPerson: f.contactPerson, phoneNumber: f.phoneNumber, email: f.email,
      companyAddress: f.companyAddress, bankName: f.bankName,
      bankCode: f.bankCode, bankAccount: f.bankAccount, remarks: f.remarks
    });
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    wx.showToast({ title: this.data.isEdit ? '供应商已更新' : '供应商已添加', icon: 'success' });
    this.setData({ modal: false, form: emptyForm() });
    this.render();
  },

  del(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const id = e.currentTarget.dataset.id;
    const s = db.suppliers().find(x => String(x.id) === String(id));
    if (!s) return;
    wx.showModal({
      title: '确认删除',
      content: '删除供应商「' + s.supplierName + '」？其名下合同记录不会删除。',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        db.deleteSupplier(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  goContracts(e) {
    wx.navigateTo({ url: '/pages/purchase/contract/contract' });
    void e;
  },

  /* ==================== 导入 / 导出 / 清空 ==================== */

  exportCSV() {
    const rows = this.data.list;
    if (!rows.length) { wx.showToast({ title: '暂无供应商可导出', icon: 'none' }); return; }
    const out = [['供应商编号', '供应商名称', '联系人', '电话', '邮箱', '地址', '开户行', '银行行号', '银行账号', '备注']];
    rows.forEach(r => out.push([r.supplierNumber, r.supplierName, r.contactPerson, r.phoneNumber,
      r.email, r.companyAddress, r.bankName, r.bankCode, r.bankAccount, r.remarks]));
    csv.exportFile('供应商清单_' + db.todayStr() + '.csv', csv.toCSV(out));
  },

  importCSV() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法导入', icon: 'none' }); return; }
    csv.chooseCSV(rows => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const head = rows[0].map(h => String(h).trim());
      const col = names => { for (let i = 0; i < names.length; i++) { const k = head.findIndex(h => h.indexOf(names[i]) > -1); if (k > -1) return k; } return -1; };
      const C = {
        supplierName: col(['供应商名称', '名称']), contactPerson: col(['联系人']),
        phoneNumber: col(['电话']), email: col(['邮箱']), companyAddress: col(['地址']),
        bankName: col(['开户行', '开户银行']), bankCode: col(['银行行号']), bankAccount: col(['银行账号']),
        remarks: col(['备注'])
      };
      if (C.supplierName < 0) { wx.showToast({ title: '表头缺少「供应商名称」列', icon: 'none' }); return; }
      const g = (r, k) => C[k] >= 0 ? String(r[C[k]] == null ? '' : r[C[k]]).trim() : '';
      const exist = {};
      db.suppliers().forEach(s => { exist[String(s.supplierName).trim()] = 1; });
      const recs = []; let skip = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const name = g(r, 'supplierName');
        if (!name) continue;
        if (exist[name]) { skip++; continue; }
        exist[name] = 1;
        recs.push({
          id: '', supplierName: name,
          contactPerson: g(r, 'contactPerson'), phoneNumber: g(r, 'phoneNumber'),
          email: g(r, 'email'), companyAddress: g(r, 'companyAddress'),
          bankName: g(r, 'bankName'), bankCode: g(r, 'bankCode'),
          bankAccount: g(r, 'bankAccount'), remarks: g(r, 'remarks')
        });
      }
      if (!recs.length) { wx.showToast({ title: skip ? '没有新供应商可导入（' + skip + ' 行已存在）' : '未找到有效数据', icon: 'none' }); return; }
      wx.showModal({
        title: '导入确认',
        content: '解析到 ' + recs.length + ' 家新供应商' + (skip ? '，跳过已存在 ' + skip + ' 行' : '') + '。确认导入？',
        success: res => {
          if (!res.confirm) return;
          let ok = 0;
          recs.forEach(r => { if (db.saveSupplier(r).ok) ok++; });
          wx.showToast({ title: '已导入 ' + ok + ' 家' + (skip ? '，跳过 ' + skip + ' 行' : ''), icon: 'none' });
          this.render();
        }
      });
    });
  },

  clearAll() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.suppliers().length;
    if (!n) { wx.showToast({ title: '暂无供应商可清空', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 确认清空',
      content: '确认清空全部 ' + n + ' 家供应商档案？其名下合同 / 收发货 / 开票 / 付款记录不会删除，此操作不可恢复！',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        const res = db.clearColl('suppliers');
        if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已清空 ' + n + ' 家', icon: 'none' });
        this.render();
      }
    });
  },

  noop() {}
});
