/**
 * 系统管理（仅管理员）— 4 页签
 *  ① 用户管理：用户列表 + 新建/编辑（供应商角色才显示「关联供应商」）+ 重置密码/启停用/删除
 *  ② 角色权限：权限矩阵（行 = 10 个业务模块，列 = 角色，三态 读写/只读/不显示）+ 新建/删除角色
 *  ③ 公司抬头：简称 + 公司名称，增删改（业务数据按公司主体隔离）
 *  ④ 数据与云：云同步状态与手动拉取、JSON 备份导出/恢复导入、清空业务数据（双重确认）
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const TABS = ['user', 'role', 'company', 'data'];
const TAB_NAMES = ['用户管理', '角色权限', '公司抬头', '数据与云'];
const PERM_OPTIONS = ['读写', '只读', '不显示'];
const PERM_VALUES = ['rw', 'r', 'none'];
const PERM_LABEL = { rw: '读写', r: '只读', none: '不显示' };

Page({
  data: {
    ready: false, denied: false,

    tab: 'user', tabNames: TAB_NAMES,

    /* 用户 */
    users: [], userModal: false, userIsEdit: false,
    userForm: { id: '', username: '', name: '', pwdPlain: '', role: 'purchaser', supplierName: '', active: true },
    roleOptions: [], roleIdx: 0, showSupplier: false,
    supplierOptions: ['请选择'], supplierIdx: 0,
    needSupplier: false,

    /* 权限矩阵 */
    permOptions: PERM_OPTIONS,
    matrix: [], roleCols: [],

    /* 公司 */
    companies: [], companyModal: false, companyIsEdit: false,
    companyForm: { code: '', name: '' },

    /* 数据与云 */
    cloudOn: false, syncState: 'idle', backupInfo: '', counts: [],

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('admin') || !db.Session.isAdmin()) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true, cloudOn: supa.isConfigured() });
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
    const roles = db.roles();

    /* ---- 用户 ---- */
    const users = db.users().map(u => {
      const r = roles.find(x => x.key === u.role);
      return {
        id: u.id, username: u.username, name: u.name || u.username,
        roleKey: u.role || '', roleName: r ? r.name : (u.role || ''),
        roleClass: u.role === 'admin' ? 'badge-purple' : (r && r.supplierRole) ? 'badge-blue' : 'badge-gray',
        supplierName: u.supplierName || '',
        active: u.active !== false,
        activeText: u.active !== false ? '启用' : '停用',
        activeClass: u.active !== false ? 'badge-green' : 'badge-red',
        createdAt: fmt.fmtDate(u.createdAt),
        canDelete: u.username !== 'admin'
      };
    });

    /* ---- 权限矩阵 ---- */
    const pages = db.PAGES.filter(p => !p.adminOnly);
    const matrix = pages.map(p => ({
      key: p.key, name: p.name, group: p.group,
      cells: roles.map(r => {
        const raw = (r.permissions || {})[p.key];
        const v = raw === 'rw' || raw === true ? 'rw' : raw === 'r' ? 'r' : 'none';
        return {
          roleId: r.id, roleKey: r.key, roleName: r.name,
          locked: r.key === 'admin' || !!r.locked,
          value: v, label: PERM_LABEL[v],
          idx: Math.max(0, PERM_VALUES.indexOf(v))
        };
      })
    }));

    /* ---- 公司 ---- */
    const companies = db.companies().map(c => ({
      code: c.code, name: c.name,
      isCurrent: c.code === db.curCompany(),
      contracts: db.all('orders').filter(o => o.company === c.code).length
    }));

    /* ---- 数据与云 ---- */
    const DATA_LABEL = {
      orders: '采购合同', shipments: '发货记录', receipts: '收货记录', returns: '退货记录',
      invoices: '发票', suppliers: '供应商', tool_records: '计算记录'
    };
    const counts = Object.keys(DATA_LABEL).map(k => ({ key: k, label: DATA_LABEL[k], n: db.all(k).length }));
    const local = db.KEYS.filter(k => k !== 'pis_plyPaste').length;

    this.setData({
      users: users,
      roleOptions: roles.map(r => r.name),
      matrix: matrix,
      roleCols: roles.map(r => ({ id: r.id, name: r.name, locked: r.key === 'admin' || !!r.locked })),
      companies: companies,
      counts: counts,
      syncState: typeof supa.getSyncState === 'function' ? supa.getSyncState() : 'idle',
      backupInfo: '本地键 ' + local + ' 项 · 供应商 ' + db.suppliers().length + ' 家 · 用户 ' + db.users().length + ' 个 · 角色 ' + roles.length + ' 个'
    });
  },

  onTab(e) {
    this.setData({ tab: TABS[+e.currentTarget.dataset.i] });
    this.render();
  },

  /* ==================== 用户管理 ==================== */

  openUserAdd() {
    const roles = db.roles();
    this.setData({
      userModal: true, userIsEdit: false,
      userForm: { id: '', username: '', name: '', pwdPlain: '', role: 'purchaser', supplierName: '', active: true },
      roleIdx: Math.max(0, roles.findIndex(r => r.key === 'purchaser')),
      supplierOptions: ['请选择'].concat(db.supplierNames().sort()),
      supplierIdx: 0,
      showSupplier: !!(roles.find(r => r.key === 'purchaser') || {}).supplierRole,
      needSupplier: !!(roles.find(r => r.key === 'purchaser') || {}).supplierRole
    });
  },

  openUserEdit(e) {
    const u = db.users().find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!u) return;
    const roles = db.roles();
    const ri = Math.max(0, roles.findIndex(r => r.key === u.role));
    const supOpts = ['请选择'].concat(db.supplierNames().sort());
    const si = u.supplierName ? Math.max(0, supOpts.indexOf(u.supplierName)) : 0;
    const isSup = !!(roles[ri] || {}).supplierRole;
    this.setData({
      userModal: true, userIsEdit: true,
      userForm: { id: u.id, username: u.username, name: u.name || '', pwdPlain: '', role: u.role || 'purchaser', supplierName: u.supplierName || '', active: u.active !== false },
      roleIdx: ri, supplierOptions: supOpts, supplierIdx: si,
      showSupplier: isSup, needSupplier: isSup
    });
  },

  onUserField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['userForm.' + k]: e.detail.value });
  },

  onUserRole(e) {
    const i = +e.detail.value;
    const r = db.roles()[i];
    const isSup = !!(r && r.supplierRole);
    this.setData({
      roleIdx: i, 'userForm.role': r ? r.key : 'purchaser',
      showSupplier: isSup, needSupplier: isSup,
      supplierOptions: ['请选择'].concat(db.supplierNames().sort()),
      supplierIdx: 0, 'userForm.supplierName': ''
    });
  },

  onUserSupplier(e) {
    const i = +e.detail.value;
    this.setData({ supplierIdx: i, 'userForm.supplierName': i > 0 ? this.data.supplierOptions[i] : '' });
  },

  saveUser() {
    const f = this.data.userForm;
    if (!String(f.username || '').trim()) { wx.showToast({ title: '请填写用户名', icon: 'none' }); return; }
    if (!this.data.userIsEdit && String(f.pwdPlain || '').length < 4) { wx.showToast({ title: '密码至少 4 位', icon: 'none' }); return; }
    if (this.data.needSupplier && !String(f.supplierName || '').trim()) { wx.showToast({ title: '请选择关联供应商', icon: 'none' }); return; }
    const payload = {
      id: f.id || '', username: String(f.username).trim(), name: f.name || String(f.username).trim(),
      role: f.role, supplierName: this.data.needSupplier ? f.supplierName : '', active: f.active !== false
    };
    if (!this.data.userIsEdit) payload.pwdPlain = f.pwdPlain;
    else payload.pwd = (db.users().find(x => String(x.id) === String(f.id)) || {}).pwd;
    const res = db.saveUser(payload);
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    wx.showToast({ title: '用户已保存', icon: 'success' });
    this.setData({ userModal: false });
    this.render();
  },

  resetPwd(e) {
    const u = db.users().find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!u) return;
    wx.showModal({
      title: '重置密码',
      editable: true, placeholderText: '为用户「' + u.username + '」设置新密码（至少 4 位）',
      success: r => {
        if (!r.confirm) return;
        const np = String(r.content || '').trim();
        if (np.length < 4) { wx.showToast({ title: '密码至少 4 位', icon: 'none' }); return; }
        const res = db.resetUserPwd(u.id, np);
        wx.showToast({ title: res.ok ? '密码已重置' : res.msg, icon: res.ok ? 'success' : 'none' });
      }
    });
  },

  toggleActive(e) {
    const id = e.currentTarget.dataset.id;
    const u = db.users().find(x => String(x.id) === String(id));
    if (!u) return;
    const next = !(u.active !== false);
    const res = db.setUserActive(id, next);
    wx.showToast({ title: res.ok ? (next ? '已启用' : '已停用') : res.msg, icon: res.ok ? 'success' : 'none' });
    this.render();
  },

  delUser(e) {
    const id = e.currentTarget.dataset.id;
    const u = db.users().find(x => String(x.id) === String(id));
    if (!u) return;
    wx.showModal({
      title: '确认删除',
      content: '删除用户「' + u.username + '」？',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        const res = db.deleteUser(id);
        wx.showToast({ title: res.ok ? '已删除' : res.msg, icon: res.ok ? 'success' : 'none' });
        this.render();
      }
    });
  },

  closeUserModal() { this.setData({ userModal: false }); },

  /* ==================== 角色权限 ==================== */

  onPerm(e) {
    const roleId = e.currentTarget.dataset.rid;
    const pageKey = e.currentTarget.dataset.pkey;
    const v = PERM_VALUES[+e.detail.value];
    const res = db.setRolePerm(roleId, pageKey, v);
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); this.render(); return; }
    const r = db.roles().find(x => String(x.id) === String(roleId));
    wx.showToast({ title: '权限已保存：' + (r ? r.name : '') + ' · ' + pageKey + ' · ' + PERM_LABEL[v], icon: 'none' });
    this.render();
  },

  addRole() {
    wx.showModal({
      title: '新建角色',
      editable: true, placeholderText: '新角色名称',
      success: r => {
        if (!r.confirm) return;
        const name = String(r.content || '').trim();
        if (!name) { wx.showToast({ title: '请填写角色名称', icon: 'none' }); return; }
        const key = 'role_' + Date.now().toString(36);
        const perms = {};
        db.PAGES.forEach(p => { perms[p.key] = 'none'; });
        perms.dashboard = 'rw';
        const res = db.saveRole({ key: key, name: name, locked: false, permissions: perms });
        if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
        wx.showToast({ title: '角色已创建，请在矩阵中分配权限', icon: 'none' });
        this.render();
      }
    });
  },

  delRole(e) {
    const id = e.currentTarget.dataset.id;
    const r = db.roles().find(x => String(x.id) === String(id));
    if (!r) return;
    if (r.locked) { wx.showToast({ title: '内置角色不可删除', icon: 'none' }); return; }
    if (db.users().some(u => u.role === r.key)) { wx.showToast({ title: '该角色下仍有用户，无法删除', icon: 'none' }); return; }
    wx.showModal({
      title: '确认删除',
      content: '删除角色「' + r.name + '」？',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const out = db.deleteRole(id);
        wx.showToast({ title: out.ok ? '已删除' : out.msg, icon: out.ok ? 'success' : 'none' });
        this.render();
      }
    });
  },

  /* ==================== 公司抬头 ==================== */

  openCompanyAdd() {
    this.setData({ companyModal: true, companyIsEdit: false, companyForm: { code: '', name: '' } });
  },
  openCompanyEdit(e) {
    const c = db.companies().find(x => x.code === e.currentTarget.dataset.code);
    if (!c) return;
    this.setData({ companyModal: true, companyIsEdit: true, companyForm: { code: c.code, name: c.name } });
  },
  onCompanyField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['companyForm.' + k]: e.detail.value });
  },
  closeCompanyModal() { this.setData({ companyModal: false }); },

  saveCompany() {
    const f = this.data.companyForm;
    const res = db.saveCompany({ code: f.code, name: f.name });
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    wx.showToast({ title: '公司抬头已保存', icon: 'success' });
    this.setData({ companyModal: false });
    this.render();
  },

  delCompany(e) {
    const code = e.currentTarget.dataset.code;
    const c = db.companies().find(x => x.code === code);
    if (!c) return;
    wx.showModal({
      title: '确认删除',
      content: '删除公司抬头「' + c.name + '」？其名下业务数据将不再显示（数据不删除）。',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        const res = db.deleteCompany(code);
        wx.showToast({ title: res.ok ? '已删除' : res.msg, icon: res.ok ? 'success' : 'none' });
        this.render();
      }
    });
  },

  switchCompany(e) {
    db.setCurCompany(e.currentTarget.dataset.code);
    wx.showToast({ title: '已切换到：' + db.companyName(e.currentTarget.dataset.code), icon: 'none' });
    this.render();
  },

  /* ==================== 数据与云 ==================== */

  cloudPull() {
    wx.showLoading({ title: '云端下载中…' });
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      this.render();
      wx.showToast({ title: ok ? '已下载云端数据（' + count + ' 项）' : '云端同步失败，请检查网络', icon: 'none' });
    });
  },

  cloudPush() {
    let n = 0;
    try {
      db.KEYS.forEach(k => {
        if (k === 'pis_plyPaste') return;
        db.save(k);
        n++;
      });
    } catch (e) { /* 静默 */ }
    wx.showToast({ title: '已提交 ' + n + ' 项到云端上传队列', icon: 'none' });
    this.render();
  },

  exportBackup() {
    const snap = db.exportBackup();
    csv.exportJSON('采购一体化备份_' + fmt.today() + '.json', snap, ok => {
      if (ok) wx.showToast({ title: '备份已生成，请选择保存/发送', icon: 'none' });
    });
  },

  importBackup() {
    wx.showModal({
      title: '从备份恢复',
      content: '恢复将用备份内容覆盖本机当前采购数据（用户/角色/公司/供应商及全部业务单据），确定继续？',
      success: r => {
        if (!r.confirm) return;
        csv.chooseJSON(obj => {
          if (!obj) { wx.showToast({ title: '备份文件格式不正确', icon: 'none' }); return; }
          const res = db.importBackup(obj);
          if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
          wx.showToast({ title: '恢复成功，已应用 ' + res.applied + ' 项', icon: 'success' });
          this.render();
        });
      }
    });
  },

  clearBiz() {
    wx.showModal({
      title: '⚠ 危险操作',
      content: '此操作将清空全部业务单据（合同/发货/收货/退货/发票/付款/计算记录），且不可恢复！请先备份。是否继续？',
      confirmText: '继续', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '请确保已备份！确定清空全部业务数据？（保留用户 / 角色 / 公司 / 供应商）',
          confirmText: '确定清空', confirmColor: '#FF3B30',
          success: r2 => {
            if (!r2.confirm) return;
            db.clearBiz();
            wx.showToast({ title: '业务数据已清空', icon: 'none' });
            this.render();
          }
        });
      }
    });
  },

  noop() {}
});
