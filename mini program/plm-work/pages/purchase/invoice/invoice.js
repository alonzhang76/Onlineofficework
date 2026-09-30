const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const reim = require('../../../utils/reim-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const PAY_FILTERS = ['全部付款状态', '未付款', '部分付款', '已付清'];
const AUDIT_FILTERS = ['全部审核状态', '未提交', '待审核', '已通过', '已入账', '已驳回'];

function emptyForm() {
  return {
    id: '', invoiceNumber: '', invoiceDate: fmt.today(), invoiceType: db.INVOICE_TYPES[0],
    contractNumber: '', supplier: '', amount: '', netAmount: '', taxAmount: '', taxRate: '',
    itemName: '', buyerName: '', subjectCode: '', subjectName: '', remark: ''
  };
}

Page({
  data: {
    ready: false, denied: false, canWrite: false, isSupplier: false,

    tab: 0, tabNames: ['登记发票', '发票台账'],

    // 台账
    kw: '',
    payOptions: PAY_FILTERS, payIdx: 0,
    auditOptions: AUDIT_FILTERS, auditIdx: 0,
    list: [], total: 0, sumAmount: '0.00', sumPaid: '0.00', sumWait: '0.00',
    reimCount: 0,

    // 表单
    form: emptyForm(),
    typeOptions: db.INVOICE_TYPES, typeIdx: 0,
    subjectOptions: ['（自动归类）'].concat(db.allSubjects().map(s => s.code + ' ' + s.name)), subjectIdx: 0,
    openContracts: [],
    supplierOptions: ['（不指定）'],

    detail: null,
    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('invoice')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({
      ready: true,
      canWrite: db.Session.canWrite('invoice'),
      isSupplier: db.Session.isSupplier()
    });
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    // 报销侧数据 → 采购发票台账自动同步（销售方匹配命中的进项票）
    try {
      const added = db.Pay.syncInvoices();
      if (added > 0) wx.showToast({ title: '已从报销台账同步 ' + added + ' 张发票', icon: 'none' });
      db.Pay.reconcile();
    } catch (e) { /* 静默 */ }
    this.render();
  },

  onPullDownRefresh() {
    // 先拉采购命名空间，再拉报销命名空间（付款/审核状态来源）
    db.syncFromCloud(() => {
      reim.syncFromCloud(() => {
        try { db.Pay.syncInvoices(); db.Pay.reconcile(); } catch (e) {}
        this.render();
        wx.stopPullDownRefresh();
      });
    });
  },

  onTab(e) {
    const i = +e.currentTarget.dataset.i;
    this.setData({ tab: i });
    this.render();
  },

  /* ==================== 台账 ==================== */

  render() {
    const kw = String(this.data.kw || '').trim().toLowerCase();
    const paySel = this.data.payIdx > 0 ? this.data.payOptions[this.data.payIdx] : '';
    const auditSel = this.data.auditIdx > 0 ? this.data.auditOptions[this.data.auditIdx] : '';

    let rows = db.list('invoices').map(v => {
      const paid = db.paidOfInvoice(v.invoiceNumber);
      const st = db.invoiceStatus(v);
      const audit = v.reimStatus || db.Pay.auditStatusOfInvoice(v.invoiceNumber);
      return {
        id: v.id,
        invoiceNumber: v.invoiceNumber,
        invoiceDate: fmt.fmtDate(v.invoiceDate),
        invoiceDateRaw: v.invoiceDate || '',
        invoiceType: v.invoiceType || '',
        supplier: v.supplier || '',
        buyerName: v.buyerName || '',
        itemName: v.itemName || '',
        contractNumber: v.contractNumber || '',
        amount: fmt.fmtMoney(v.amount),
        amountRaw: db.num(v.amount),
        netAmount: fmt.fmtMoney(v.netAmount),
        taxAmount: fmt.fmtMoney(v.taxAmount),
        taxRate: v.taxRate || '',
        subjectName: v.subjectName || '',
        subjectCode: v.subjectCode || '',
        remark: v.remark || '',
        source: v.source || '',
        payText: st.t, payClass: st.c,
        paid: fmt.fmtMoney(paid),
        paidRaw: paid,
        wait: fmt.fmtMoney(Math.max(0, db.num(v.amount) - paid)),
        waitCls: Math.max(0, db.num(v.amount) - paid) > 0.005 ? 'red sm' : 'sm',
        payDate: db.Pay.dateOfInvoice(v.invoiceNumber),
        payMethod: db.Pay.methodOfInvoice(v.invoiceNumber),
        payNote: db.Pay.noteOfInvoice(v.invoiceNumber),
        audit: audit || '未提交',
        auditClass: audit === '已入账' ? 'badge-green' : audit === '已通过' ? 'badge-blue'
          : audit === '已驳回' ? 'badge-red' : audit === '待审核' ? 'badge-orange' : 'badge-gray',
        reimComment: v.reimComment || '',
        canSubmit: !audit || audit === '未提交' || audit === '已驳回'
      };
    });

    if (paySel) rows = rows.filter(r => r.payText === paySel);
    if (auditSel) {
      if (auditSel === '未提交') rows = rows.filter(r => !r.reimComment && r.audit === '未提交');
      else rows = rows.filter(r => r.audit === auditSel);
    }
    if (kw) {
      rows = rows.filter(r => {
        const hay = [r.invoiceNumber, r.supplier, r.buyerName, r.itemName, r.contractNumber,
          r.subjectName, r.remark, r.invoiceDateRaw, r.audit].join(' ').toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    }
    rows.sort((a, b) => {
      const d = String(b.invoiceDateRaw).localeCompare(String(a.invoiceDateRaw));
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });

    this.setData({
      list: rows,
      total: rows.length,
      sumAmount: fmt.fmtMoney(rows.reduce((s, r) => s + r.amountRaw, 0)),
      sumPaid: fmt.fmtMoney(rows.reduce((s, r) => s + r.paidRaw, 0)),
      sumWait: fmt.fmtMoney(rows.reduce((s, r) => s + Math.max(0, r.amountRaw - r.paidRaw), 0)),
      reimCount: db.reimInvoices().length
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onPay(e) { this.setData({ payIdx: +e.detail.value }); this.render(); },
  onAudit(e) { this.setData({ auditIdx: +e.detail.value }); this.render(); },
  resetFilter() { this.setData({ kw: '', payIdx: 0, auditIdx: 0 }); this.render(); },

  /* ==================== 登记 / 编辑 ==================== */

  startAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法登记发票', icon: 'none' }); return; }
    const open = db.openContracts();
    this.setData({
      tab: 0,
      form: emptyForm(),
      typeIdx: 0, subjectIdx: 0,
      openContracts: open.map(o => ({
        contractNumber: o.contractNumber, supplier: o.supplier,
        totalAmount: fmt.fmtMoney(o.totalAmount),
        invoiced: fmt.fmtMoney(db.invoicedOfContract(o.contractNumber)),
        left: fmt.fmtMoney(Math.max(0, db.num(o.totalAmount) - db.invoicedOfContract(o.contractNumber)))
      })),
      supplierOptions: ['（不指定）'].concat(db.supplierNames().sort())
    });
  },

  editRow(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const v = db.list('invoices').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!v) return;
    const subs = db.allSubjects();
    let si = 0;
    if (v.subjectCode) {
      const k = subs.findIndex(s => s.code === v.subjectCode);
      si = k >= 0 ? k + 1 : 0;
    }
    const ti = Math.max(0, db.INVOICE_TYPES.indexOf(v.invoiceType));
    this.setData({
      tab: 0, typeIdx: ti, subjectIdx: si,
      form: {
        id: v.id, invoiceNumber: v.invoiceNumber || '', invoiceDate: fmt.fmtDate(v.invoiceDate),
        invoiceType: v.invoiceType || db.INVOICE_TYPES[0], contractNumber: v.contractNumber || '',
        supplier: v.supplier || '', amount: v.amount === undefined ? '' : String(v.amount),
        netAmount: v.netAmount === undefined ? '' : String(v.netAmount),
        taxAmount: v.taxAmount === undefined ? '' : String(v.taxAmount),
        taxRate: v.taxRate || '', itemName: v.itemName || '', buyerName: v.buyerName || '',
        subjectCode: v.subjectCode || '', subjectName: v.subjectName || '', remark: v.remark || ''
      },
      openContracts: db.openContracts().map(o => ({
        contractNumber: o.contractNumber, supplier: o.supplier,
        totalAmount: fmt.fmtMoney(o.totalAmount),
        invoiced: fmt.fmtMoney(db.invoicedOfContract(o.contractNumber)),
        left: fmt.fmtMoney(Math.max(0, db.num(o.totalAmount) - db.invoicedOfContract(o.contractNumber)))
      })),
      supplierOptions: ['（不指定）'].concat(db.supplierNames().sort())
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    const patch = { ['form.' + k]: e.detail.value };
    this.setData(patch);
    // 不含税 / 税额 / 价税合计 三者互推
    if (k === 'netAmount' || k === 'taxAmount' || k === 'amount') {
      this.syncAmounts(k);
    }
    if (k === 'itemName' || k === 'supplier') this.autoClassify();
  },

  syncAmounts(changed) {
    const f = this.data.form;
    let net = db.num(f.netAmount), tax = db.num(f.taxAmount), total = db.num(f.amount);
    if (changed === 'amount' && total > 0) {
      if (net > 0 && tax <= 0) tax = db.r2(total - net);
      else if (tax > 0 && net <= 0) net = db.r2(total - tax);
      else if (net <= 0 && tax <= 0 && f.taxRate) {
        // 无明细时按税率反推
        const rate = parseFloat(String(f.taxRate).replace('%', ''));
        if (rate > 0) { net = db.r2(total / (1 + rate / 100)); tax = db.r2(total - net); }
      }
    } else if (changed === 'netAmount' || changed === 'taxAmount') {
      if (net > 0 || tax > 0) total = db.r2(net + tax);
    }
    this.setData({ 'form.netAmount': net ? String(net) : f.netAmount, 'form.taxAmount': tax ? String(tax) : f.taxAmount, 'form.amount': total ? String(total) : f.amount });
  },

  autoClassify() {
    const f = this.data.form;
    if (f.subjectCode) return; // 已手工指定则不覆盖
    const r = db.classifySubject(f.itemName, f.supplier);
    this.setData({ 'form.subjectCode': r.code, 'form.subjectName': r.name });
  },

  onType(e) { this.setData({ typeIdx: +e.detail.value, 'form.invoiceType': db.INVOICE_TYPES[+e.detail.value] }); },
  onDate(e) { this.setData({ 'form.invoiceDate': e.detail.value }); },
  onSubject(e) {
    const i = +e.detail.value;
    if (i === 0) {
      this.setData({ subjectIdx: 0, 'form.subjectCode': '', 'form.subjectName': '' });
      this.autoClassify();
      return;
    }
    const s = db.allSubjects()[i - 1];
    this.setData({ subjectIdx: i, 'form.subjectCode': s.code, 'form.subjectName': s.name });
  },

  /** 供应商选择 */
  pickSupplier() {
    const names = db.supplierNames().sort();
    if (!names.length) { wx.showToast({ title: '暂无供应商档案，可直接手工填写', icon: 'none' }); return; }
    wx.showActionSheet({
      itemList: names.slice(0, 6),
      success: res => {
        this.setData({ 'form.supplier': names[res.tapIndex] });
        this.autoClassify();
      },
      fail: () => {}
    });
  },

  /** 关联合同：从未开票 / 部分开票合同中挑（可多选，逗号分隔） */
  pickContract() {
    const open = this.data.openContracts;
    if (!open.length) { wx.showToast({ title: '没有未开票合同可选', icon: 'none' }); return; }
    const labels = open.slice(0, 6).map(o => o.contractNumber + ' 待开 ¥' + o.left);
    wx.showActionSheet({
      itemList: labels,
      success: res => {
        const c = open[res.tapIndex];
        const cur = String(this.data.form.contractNumber || '').trim();
        const list = cur ? cur.split(/[，,、;；\s]+/).filter(Boolean) : [];
        if (list.indexOf(c.contractNumber) < 0) list.push(c.contractNumber);
        const patch = { 'form.contractNumber': list.join('，') };
        if (!this.data.form.supplier && c.supplier) {
          patch['form.supplier'] = c.supplier;
        }
        this.setData(patch);
        this.autoClassify();
      },
      fail: () => {}
    });
  },

  saveInvoice() {
    const f = this.data.form;
    if (!String(f.invoiceNumber || '').trim()) { wx.showToast({ title: '请填写发票号码', icon: 'none' }); return; }
    if (!(db.num(f.amount) > 0)) { wx.showToast({ title: '请填写发票金额（价税合计）', icon: 'none' }); return; }
    if (!String(f.supplier || '').trim()) { wx.showToast({ title: '请填写供应商（销售方）', icon: 'none' }); return; }
    const res = db.saveInvoice({
      id: f.id || '', invoiceNumber: String(f.invoiceNumber).trim(),
      invoiceDate: f.invoiceDate, invoiceType: f.invoiceType,
      contractNumber: f.contractNumber, supplier: String(f.supplier).trim(),
      amount: f.amount, netAmount: f.netAmount, taxAmount: f.taxAmount, taxRate: f.taxRate,
      itemName: f.itemName, buyerName: f.buyerName,
      subjectCode: f.subjectCode, subjectName: f.subjectName,
      remark: f.remark, source: '手工录入',
      company: db.writeCompany()
    });
    if (!res.ok) { wx.showModal({ title: '保存失败', content: res.msg, showCancel: false }); return; }
    wx.showToast({ title: f.id ? '发票已更新' : '发票已登记', icon: 'success' });
    this.setData({ form: emptyForm(), typeIdx: 0, subjectIdx: 0 });
    this.render();
  },

  cancelForm() {
    this.setData({ form: emptyForm(), typeIdx: 0, subjectIdx: 0 });
  },

  delRow(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const id = e.currentTarget.dataset.id;
    const v = db.list('invoices').find(x => String(x.id) === String(id));
    wx.showModal({
      title: '确认删除',
      content: '确认删除发票 ' + (v ? v.invoiceNumber : '') + '？',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteInvoice(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 明细 ==================== */

  openDetail(e) {
    const v = this.data.list.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!v) return;
    this.setData({ detail: v });
  },
  closeDetail() { this.setData({ detail: null }); },

  /* ==================== 提交报销（与桌面端同一动作） ==================== */

  submitReim(e) {
    const v = db.list('invoices').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!v) return;
    const buyer = db.buyerInfoOf(v.company);
    const subj = db.classifySubject(v.itemName, v.supplier);
    wx.showModal({
      title: '提交到报销系统',
      content: '将发票 ' + v.invoiceNumber + '（¥' + fmt.fmtMoney(v.amount) + '）提交到发票报销台账，状态为「待审核」。确认提交？',
      success: r => {
        if (!r.confirm) return;
        const res = reim.saveInvoice({
          invoice_no: v.invoiceNumber,
          invoice_type: v.invoiceType,
          invoice_date: v.invoiceDate,
          buyer_name: v.buyerName || buyer.companyName,
          seller_name: v.supplier,
          item_name: v.itemName,
          amount: v.netAmount,
          tax_amount: v.taxAmount,
          total_amount: v.amount,
          tax_rate: v.taxRate,
          subject_code: v.subjectCode || subj.code,
          subject_name: v.subjectName || subj.name,
          project: v.contractNumber,
          remark: v.remark,
          claimant: db.Session.displayName(),
          status: '待审核',
          source: '采购提交'
        });
        if (!res.ok) {
          wx.showModal({
            title: '提交未完成',
            content: res.msg + (res.duplicate ? '\n该发票号已存在于报销台账，可直接在回执中查看审核状态。' : ''),
            showCancel: false
          });
          return;
        }
        // 回写审核状态与报销侧 id，便于后续对账
        db.update('invoices', v.id, { reimStatus: '待审核', reimId: res.invoice.id, reimComment: '' });
        db.save('pis_invoices');
        wx.showToast({ title: '已提交，等待审核', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 导入 / 导出 / 清空 ==================== */

  exportCSV() {
    const rows = this.data.list;
    if (!rows.length) { wx.showToast({ title: '当前范围没有发票', icon: 'none' }); return; }
    const out = [['发票号码', '类型', '开票日期', '购买方', '销售方', '品名', '不含税', '税率', '税额', '价税合计',
      '会计科目', '关联合同', '备注', '付款状态', '已付款', '未付差额', '付款日期', '付款方式', '审核状态']];
    rows.forEach(r => out.push([
      r.invoiceNumber, r.invoiceType, r.invoiceDateRaw, r.buyerName, r.supplier, r.itemName,
      r.netAmount, r.taxRate, r.taxAmount, r.amount,
      r.subjectName, r.contractNumber, r.remark, r.payText, r.paid, r.wait, r.payDate, r.payMethod, r.audit
    ]));
    csv.exportFile('发票台账_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  importCSV() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法导入', icon: 'none' }); return; }
    csv.chooseCSV(rows => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const head = rows[0].map(h => String(h).trim());
      const col = names => { for (let i = 0; i < names.length; i++) { const k = head.findIndex(h => h.indexOf(names[i]) > -1); if (k > -1) return k; } return -1; };
      const C = {
        invoiceNumber: col(['发票号码', '发票号']), invoiceType: col(['类型']), invoiceDate: col(['开票日期']),
        buyerName: col(['购买方']), supplier: col(['销售方', '供应商']), itemName: col(['品名', '货物']),
        netAmount: col(['不含税', '金额']), taxRate: col(['税率']), taxAmount: col(['税额']),
        amount: col(['价税合计', '合计']), contractNumber: col(['关联合同', '合同号']), remark: col(['备注'])
      };
      if (C.invoiceNumber < 0 || C.supplier < 0 || C.amount < 0) {
        wx.showToast({ title: '表头缺少「发票号码 / 销售方 / 价税合计」列', icon: 'none' });
        return;
      }
      const g = (r, k) => C[k] >= 0 ? String(r[C[k]] == null ? '' : r[C[k]]).trim() : '';
      const exist = {};
      db.all('invoices').forEach(v => { exist[String(v.invoiceNumber)] = 1; });
      const recs = [], skipDup = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const no = g(r, 'invoiceNumber');
        if (!no) continue;
        if (exist[no]) { skipDup.push(no); continue; }
        const net = db.num(g(r, 'netAmount')), tax = db.num(g(r, 'taxAmount'));
        let total = db.num(g(r, 'amount'));
        if (!total && (net || tax)) total = db.r2(net + tax);
        const typeRaw = g(r, 'invoiceType');
        recs.push({
          id: '', invoiceNumber: no,
          invoiceDate: csv.parseCellDate(g(r, 'invoiceDate')),
          invoiceType: /专用/.test(typeRaw) ? '增值税专用发票' : /普通/.test(typeRaw) ? '增值税普通发票' : (typeRaw || db.INVOICE_TYPES[0]),
          contractNumber: g(r, 'contractNumber'), supplier: g(r, 'supplier'),
          amount: total, netAmount: net, taxAmount: tax, taxRate: g(r, 'taxRate'),
          itemName: g(r, 'itemName'), buyerName: g(r, 'buyerName'),
          remark: g(r, 'remark'), source: 'EXCEL导入',
          company: db.writeCompany()
        });
      }
      if (!recs.length) {
        wx.showToast({ title: skipDup.length ? '发票号均已存在，无新数据' : '未找到有效发票数据', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '导入确认',
        content: '解析到 ' + recs.length + ' 张新发票' + (skipDup.length ? '，跳过已存在 ' + skipDup.length + ' 张' : '') + '。确认导入？',
        success: res => {
          if (!res.confirm) return;
          let ok = 0, fail = 0;
          recs.forEach(r => { if (db.saveInvoice(r).ok) ok++; else fail++; });
          wx.showToast({ title: '已导入 ' + ok + ' 张' + (fail ? '，失败 ' + fail : ''), icon: 'none' });
          this.render();
        }
      });
    });
  },

  clearAll() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.list('invoices').length;
    if (!n) { wx.showToast({ title: '当前范围没有发票', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 清空发票台账',
      content: '将清空当前公司主体的 ' + n + ' 张发票，此操作不可恢复！付款与审核状态来自报销系统，不受影响。',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const r = db.clearColl('invoices');
        if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已清空 ' + n + ' 张', icon: 'none' });
        this.render();
      }
    });
  },

  /** 手动从报销台账同步（拉取 reimbursement 命名空间） */
  pullReim() {
    wx.showLoading({ title: '同步报销数据…' });
    reim.syncFromCloud((ok, count) => {
      let added = 0;
      try { added = db.Pay.syncInvoices(); db.Pay.reconcile(); } catch (e) {}
      wx.hideLoading();
      this.render();
      if (ok) wx.showToast({ title: '报销台账已同步，新增发票 ' + added + ' 张', icon: 'none' });
      else wx.showToast({ title: '报销数据同步失败', icon: 'none' });
    });
  },

  goPayment() { wx.navigateTo({ url: '/pages/purchase/payment/payment' }); },
  noop() {}
});
