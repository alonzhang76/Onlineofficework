/**
 * 合同生成向导
 * 销售合同 / 采购合同 → 选客户/供应商 → 勾选订单 → 填合同信息/条款
 * → 渲染带红色印章的 PDF → wx.shareFileMessage 转发微信好友
 */
const db = require('../../utils/db');
const cb = require('../../utils/cloudbase');
const company = require('../../utils/company');
const fmt = require('../../utils/format');
const renderer = require('../../utils/contract-render');
const pdfShare = require('../../utils/pdf-share');

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

Page({
  data: {
    type: 'sales',            // sales | purchase
    typeLabel: '销售合同',
    partyLabel: '客户',
    partyNames: [],
    partyIndex: 0,
    orders: [],               // [{id, no, text, checked}]
    allChecked: false,
    checkedCount: 0,
    contactNames: [],
    contactIndex: 0,
    form: {
      no: '', date: '', deliveryDate: '',
      paymentTerms: '', standards: ''
    },
    termsText: '',
    generating: false,
    fileReady: false,       // PDF 已生成，等待用户点“发送”
    pendingFilePath: ''
  },

  onLoad(options) {
    const type = options && options.type === 'purchase' ? 'purchase' : 'sales';
    this.setData({ type: type });
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) app.globalData.user = cb.getUser();
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.initType();
  },

  /* ===== 类型 / 单位 / 订单 ===== */
  initType() {
    const isSales = this.data.type === 'sales';
    const today = fmt.today();
    // 默认条款
    const terms = company.getTerms(this.data.type).map(t => t.content || '');
    // 抬头下的单位去重
    const records = db.get(isSales ? 'salesOrders' : 'purchaseOrders') || [];
    const nameField = isSales ? 'customer' : 'supplier';
    const map = {};
    records.forEach(r => { if (r[nameField]) map[r[nameField]] = 1; });
    const partyNames = Object.keys(map);
    this.setData({
      typeLabel: isSales ? '销售合同' : '采购合同',
      partyLabel: isSales ? '客户' : '供应商',
      partyNames: partyNames,
      partyIndex: 0,
      orders: [],
      allChecked: false,
      checkedCount: 0,
      contactNames: [],
      contactIndex: 0,
      form: { no: this.autoNo(), date: today, deliveryDate: today, paymentTerms: '', standards: '' },
      termsText: terms.join('\n'),
      fileReady: false,
      pendingFilePath: ''
    }, () => {
      if (partyNames.length) this.loadParty(0);
    });
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.type) return;
    this.setData({ type: type }, () => this.initType());
  },

  loadParty(index) {
    const isSales = this.data.type === 'sales';
    const nameField = isSales ? 'customer' : 'supplier';
    const partyName = this.data.partyNames[index] || '';
    const records = (db.get(isSales ? 'salesOrders' : 'purchaseOrders') || [])
      .filter(r => r[nameField] === partyName);
    const orders = records.map(r => ({
      id: r.id,
      no: r.orderNo || r.id,
      text: [r.product, r.material, r.specification].filter(Boolean).join(' / '),
      amount: r.totalAmount != null && r.totalAmount !== '' ? fmt.fmtMoney(r.totalAmount) : '',
      checked: false
    }));

    // 通讯录匹配：精确单位名 → 否则全部联系人
    const allContacts = db.get('contacts') || [];
    let matches = allContacts.filter(c => c.name === partyName);
    if (!matches.length) matches = allContacts.slice();
    const contactNames = matches.map(c => (c.name || '') + '（' + (c.contactPerson || '无联系人') + '）');
    this._contacts = matches;
    this._records = records;

    this.setData({
      partyIndex: index,
      orders: orders,
      allChecked: false,
      checkedCount: 0,
      contactNames: contactNames,
      contactIndex: 0,
      fileReady: false,
      pendingFilePath: ''
    });
  },

  onPartyChange(e) {
    this.loadParty(Number(e.detail.value));
  },

  onContactChange(e) {
    this.setData({ contactIndex: Number(e.detail.value), fileReady: false, pendingFilePath: '' });
  },

  toggleOrder(e) {
    const id = e.currentTarget.dataset.id;
    const orders = this.data.orders.map(o => o.id === id ? Object.assign({}, o, { checked: !o.checked }) : o);
    this.setData({
      orders: orders,
      allChecked: orders.length > 0 && orders.every(o => o.checked),
      checkedCount: orders.filter(o => o.checked).length,
      fileReady: false,
      pendingFilePath: ''
    });
  },

  toggleAll() {
    const checked = !this.data.allChecked;
    const orders = this.data.orders.map(o => Object.assign({}, o, { checked: checked }));
    this.setData({
      orders: orders, allChecked: checked,
      checkedCount: checked ? orders.length : 0,
      fileReady: false,
      pendingFilePath: ''
    });
  },

  /* ===== 表单 ===== */
  onInput(e) {
    const f = e.currentTarget.dataset.f;
    const form = Object.assign({}, this.data.form);
    form[f] = e.detail.value;
    this.setData({ form: form, fileReady: false, pendingFilePath: '' });
  },

  onDate(e) {
    const f = e.currentTarget.dataset.f;
    const form = Object.assign({}, this.data.form);
    form[f] = e.detail.value;
    this.setData({ form: form, fileReady: false, pendingFilePath: '' });
  },

  onTermsInput(e) {
    this.setData({ termsText: e.detail.value, fileReady: false, pendingFilePath: '' });
  },

  autoNo() {
    const d = new Date();
    const prefix = this.data.type === 'sales' ? 'XS' : 'CG';
    const ym = String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
    return prefix + ym + String(Math.floor(1000 + Math.random() * 9000));
  },

  regenNo() {
    const form = Object.assign({}, this.data.form, { no: this.autoNo() });
    this.setData({ form: form, fileReady: false, pendingFilePath: '' });
  },

  resetTerms() {
    const terms = company.getTerms(this.data.type).map(t => t.content || '');
    this.setData({ termsText: terms.join('\n'), fileReady: false, pendingFilePath: '' });
    wx.showToast({ title: '已恢复默认条款', icon: 'none' });
  },

  /* ===== 生成 PDF 并分享 ===== */
  async onGenerate() {
    if (this.data.generating) return;
    const isSales = this.data.type === 'sales';
    const form = this.data.form;

    if (!this.data.partyNames.length) {
      wx.showToast({ title: '该抬头下暂无' + (isSales ? '销售订单' : '采购订单'), icon: 'none' });
      return;
    }
    const partyName = this.data.partyNames[this.data.partyIndex];
    const checked = this.data.orders.filter(o => o.checked);
    if (!checked.length) { wx.showToast({ title: '请至少勾选一个订单', icon: 'none' }); return; }
    if (!form.no || !form.no.trim()) { wx.showToast({ title: '请填写合同号', icon: 'none' }); return; }
    if (!form.date) { wx.showToast({ title: '请选择合同日期', icon: 'none' }); return; }

    const records = (this._records || []).filter(r => checked.some(o => o.id === r.id));
    const contact = (this._contacts && this._contacts[this.data.contactIndex]) || {};

    // 条款：文本框每行一条；付款方式与国标替换
    let termLines = String(this.data.termsText || '').split('\n')
      .map(s => s.trim()).filter(Boolean);
    if (!termLines.length) { wx.showToast({ title: '合同条款不能为空', icon: 'none' }); return; }
    if (form.paymentTerms) termLines[1] = '付款方式：' + form.paymentTerms + '。';
    if (isSales && form.standards && termLines[0]) {
      termLines[0] = termLines[0].replace('国家标准', '国家标准（' + form.standards + '）');
    }
    const terms = termLines.map((c, i) => ({ id: i + 1, content: c }));

    this.setData({ generating: true });
    wx.showLoading({ title: '渲染合同中…', mask: true });

    let sealPath = '';
    try { sealPath = await company.resolveSealPath(); } catch (e) { sealPath = '/images/hschop.png'; }

    const doc = {
      type: this.data.type,
      company: company.getCurrent(),
      party: { name: partyName },
      contact: contact,
      items: records,
      no: form.no.trim(),
      date: form.date,
      deliveryDate: form.deliveryDate || '',
      terms: terms,
      sealPath: sealPath,
      logoPath: company.resolveLogoPath()
    };

    let pagesPromise;
    try {
      pagesPromise = renderer.renderContract(doc);
      await pagesPromise; // 提前暴露渲染错误
    } catch (err) {
      wx.hideLoading();
      this.setData({ generating: false });
      console.warn('[contract] 渲染失败', err);
      wx.showToast({ title: '渲染失败：' + ((err && err.message) || err), icon: 'none' });
      return;
    }

    const fileName = (isSales ? '销售合同' : '采购合同') + '_' + partyName + '_' + form.no.trim();
    try {
      const built = await pdfShare.buildPages(pagesPromise, fileName);
      // 只落盘并缓存，不在这里调分享（分享必须在用户 tap 的同步栈中）
      this._pending = { records: records, terms: terms };
      this.setData({
        generating: false,
        fileReady: true,
        pendingFilePath: built.filePath
      });
      wx.showToast({ title: 'PDF已生成，请发送', icon: 'success' });
    } catch (e) {
      this.setData({ generating: false });
    }
  },

  /** 第二步：由“发送给微信好友”按钮直接 tap 触发，内部第一时间同步调起分享 */
  onShareFile() {
    const filePath = this.data.pendingFilePath;
    if (!filePath) {
      wx.showToast({ title: '请先生成PDF', icon: 'none' });
      return;
    }
    const pending = this._pending || {};
    pdfShare.sharePrepared(filePath, (ok) => {
      if (ok) this.afterShared(pending.records, pending.terms);
    });
  },

  /** 分享成功后回写合同号/交货日期与条款 */
  afterShared(records, terms) {
    const isSales = this.data.type === 'sales';
    const key = isSales ? 'salesOrders' : 'purchaseOrders';
    const form = this.data.form;
    const list = db.get(key) || [];
    const ids = {};
    records.forEach(r => { ids[r.id] = 1; });
    list.forEach(r => {
      if (!ids[r.id]) return;
      r.contractNo = form.no.trim();
      if (isSales) {
        if (form.deliveryDate) r.deliveryDate = form.deliveryDate;
        if (form.paymentTerms) r.paymentTerms = form.paymentTerms;
      } else {
        if (form.deliveryDate) r.expectedDate = form.deliveryDate;
      }
    });
    db.commit(key);
    company.saveTerms(this.data.type, terms);
    wx.showToast({ title: '合同信息已回写订单', icon: 'none' });
  }
});
