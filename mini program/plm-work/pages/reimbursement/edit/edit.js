const db = require('../../../utils/reim-db');
const supa = require('../../../utils/cloudbase');

/**
 * 发票编辑/手工录入页
 * ?id=xxx 编辑已有发票；无参为手工新增。
 * 保存时自动查重、匹配公司方向、科目归类（未手选科目时）。
 */
const TAX_RATES = ['13%', '9%', '6%', '3%', '1%', '0%', '免税'];

Page({
  data: {
    me: null,
    isEdit: false,
    claimantLocked: false,
    subjects: [],
    taxRates: TAX_RATES,
    settles: db.SETTLES,
    payees: db.PAYEES,
    // 表单（字符串输入，保存时转换）
    form: {
      id: null,
      invoice_no: '',
      invoice_code: '',
      invoice_type: '',
      invoice_date: '',
      buyer_name: '',
      seller_name: '',
      item_name: '',
      amount: '',
      tax_rate: '',
      tax_amount: '',
      total_amount: '',
      subject_code: '',
      subject_name: '',
      claimant: '',
      department: '',
      project: '',
      remark: '',
      settle: '正常付款',
      payee: '销售方'
    },
    subjectIdx: -1,
    taxRateIdx: -1,
    settleIdx: 0,
    payeeIdx: 0
  },

  onLoad(options) {
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    // 无编辑权限的角色（审核人）不允许进入
    if (!db.can(me, 'edit')) {
      wx.showToast({ title: '当前角色无编辑权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
      return;
    }
    const meView = Object.assign({}, me, { roleName: db.roleName(me.role) });
    // 报销人：报销人字段锁定为本人；管理员可自由指定
    const locked = me.role === 'claimant';
    const defaultClaimant = locked
      ? (me.display_name || me.username || '')
      : '';

    const subjects = db.allSubjects();
    if (options && options.id) {
      const inv = db.findById(options.id);
      if (inv) {
        // 越权校验：报销人只能编辑自己经手的单据
        if (!db.canOnInvoice(me, 'edit', inv)) {
          wx.showToast({ title: '只能编辑自己的发票', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 900);
          return;
        }
        const subjectIdx = subjects.findIndex(s => s.code === inv.subject_code);
        const taxRateIdx = TAX_RATES.indexOf(inv.tax_rate);
        this.setData({
          me: meView,
          claimantLocked: locked,
          isEdit: true,
          subjects: subjects,
          subjectIdx: subjectIdx,
          taxRateIdx: taxRateIdx,
          settleIdx: Math.max(0, db.SETTLES.indexOf(inv.settle)),
          payeeIdx: Math.max(0, db.PAYEES.indexOf(inv.payee)),
          form: {
            id: inv.id,
            invoice_no: inv.invoice_no || '',
            invoice_code: inv.invoice_code || '',
            invoice_type: inv.invoice_type || '',
            invoice_date: inv.invoice_date || '',
            buyer_name: inv.buyer_name || '',
            seller_name: inv.seller_name || '',
            item_name: inv.item_name || '',
            amount: inv.amount === null || inv.amount === undefined ? '' : String(inv.amount),
            tax_rate: inv.tax_rate || '',
            tax_amount: inv.tax_amount === null || inv.tax_amount === undefined ? '' : String(inv.tax_amount),
            total_amount: inv.total_amount === null || inv.total_amount === undefined ? '' : String(inv.total_amount),
            subject_code: inv.subject_code || '',
            subject_name: inv.subject_name || '',
            claimant: locked ? defaultClaimant : (inv.claimant || ''),
            department: inv.department || (me.department || ''),
            project: inv.project || '',
            remark: inv.remark || '',
            settle: inv.settle || '正常付款',
            payee: inv.payee || '销售方'
          }
        });
        wx.setNavigationBarTitle({ title: '编辑发票' });
        return;
      }
    }
    // 新增：默认今天
    this.setData({
      me: meView,
      claimantLocked: locked,
      subjects: subjects,
      form: Object.assign({}, this.data.form, {
        invoice_date: db.today(),
        claimant: defaultClaimant,
        department: me.department || ''
      })
    });
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

  onInput(e) {
    const key = e.currentTarget.dataset.k;
    const form = Object.assign({}, this.data.form);
    form[key] = e.detail.value;
    const d = { form: form };
    // 税额/合计自动算（有金额+税率且未手改时）
    if (key === 'amount' || key === 'tax_amount') {
      const total = this.calcTotal(form.amount, form.tax_amount);
      if (total !== null) d.form.total_amount = String(total);
    }
    this.setData(d);
  },

  /** 价税合计 = 金额 + 税额 */
  calcTotal(amount, tax) {
    const a = parseFloat(amount), t = parseFloat(tax);
    if (isNaN(a) && isNaN(t)) return null;
    return Math.round(((isNaN(a) ? 0 : a) + (isNaN(t) ? 0 : t)) * 100) / 100;
  },

  onDate(e) {
    const form = Object.assign({}, this.data.form, { invoice_date: e.detail.value });
    this.setData({ form: form });
  },

  onSubject(e) {
    const i = +e.detail.value;
    const s = this.data.subjects[i];
    if (!s) return;
    const form = Object.assign({}, this.data.form, { subject_code: s.code, subject_name: s.name });
    this.setData({ form: form, subjectIdx: i });
  },

  onTaxRate(e) {
    const i = +e.detail.value;
    const form = Object.assign({}, this.data.form, { tax_rate: this.data.taxRates[i] || '' });
    this.setData({ form: form, taxRateIdx: i });
  },

  onSettle(e) {
    const i = +e.detail.value;
    const form = Object.assign({}, this.data.form, { settle: this.data.settles[i] });
    this.setData({ form: form, settleIdx: i });
  },

  onPayee(e) {
    const i = +e.detail.value;
    const form = Object.assign({}, this.data.form, { payee: this.data.payees[i] });
    this.setData({ form: form, payeeIdx: i });
  },

  save() {
    const f = this.data.form;
    const me = this.currentUser();
    if (!me) { wx.reLaunch({ url: '/pages/reimbursement/login/login' }); return; }
    // 越权二次校验（防止绕过入口直接调用）
    if (f.id) {
      const old = db.findById(f.id);
      if (!db.canOnInvoice(me, 'edit', old)) {
        wx.showToast({ title: '只能编辑自己的发票', icon: 'none' });
        return;
      }
    } else if (!db.can(me, 'edit')) {
      wx.showToast({ title: '没有录入权限', icon: 'none' });
      return;
    }
    if (!f.invoice_no || !f.invoice_no.trim()) {
      wx.showToast({ title: '请填写发票号码', icon: 'none' });
      return;
    }
    const res = db.saveInvoice({
      id: f.id || undefined,
      invoice_no: f.invoice_no,
      invoice_code: f.invoice_code || null,
      invoice_type: f.invoice_type || null,
      invoice_date: f.invoice_date || null,
      buyer_name: f.buyer_name || null,
      seller_name: f.seller_name || null,
      item_name: f.item_name || null,
      amount: f.amount,
      tax_rate: f.tax_rate || null,
      tax_amount: f.tax_amount,
      total_amount: f.total_amount,
      subject_code: f.subject_code || null,
      subject_name: f.subject_name || null,
      // 报销人：锁定角色强制用本人（防止表单值被篡改）
      claimant: this.data.claimantLocked
        ? (me.display_name || me.username || '')
        : f.claimant,
      department: f.department,
      project: f.project || null,
      remark: f.remark || null,
      settle: f.settle,
      payee: f.payee,
      source: this.data.isEdit ? undefined : '手工录入'
    });
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none', duration: 2200 });
      return;
    }
    wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' });
    setTimeout(() => {
      if (this.data.isEdit) {
        wx.navigateBack();
      } else {
        // 继续录入下一张：清空单据相关字段，保留报销人/部门
        this.setData({
          form: Object.assign({}, this.data.form, {
            id: null,
            invoice_no: '',
            invoice_code: '',
            invoice_type: '',
            amount: '',
            tax_amount: '',
            total_amount: '',
            item_name: '',
            remark: ''
          }),
          subjectIdx: -1,
          taxRateIdx: -1
        });
      }
    }, 600);
  }
});
