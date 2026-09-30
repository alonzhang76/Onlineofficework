const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');
const pdfShare = require('../../../utils/pdf-share');

const PAGE_SIZES = [15, 30, 50, 100];

let ridSeq = 0;
function newProduct(unitOptions) {
  return {
    rid: 'p' + (++ridSeq),
    name: '', spec: '', unit: '只', unitIdx: 0,
    unitPrice: '', quantity: '', amount: '0.00', remark: ''
  };
}
function emptyForm() {
  return {
    id: '', contractNumber: '', supplier: '', po: '',
    orderDate: fmt.today(), deliveryDate: '', category: '', remark: '',
    company: db.writeCompany()
  };
}

Page({
  data: {
    ready: false,
    denied: false,

    // 筛选
    kw: '',
    supplierOptions: ['全部供应商'], supplierIdx: 0,
    categoryOptions: ['全部类别'], categoryIdx: 0,
    pageSizeIdx: 0, pageSizeOptions: PAGE_SIZES.map(String),
    shown: 15,

    list: [], total: 0,
    sumQty: 0, sumAmount: '0.00',

    // 表单
    modal: false, editId: '', form: emptyForm(), products: [newProduct()],
    formTotal: '0.00',
    unitOptions: db.DEFAULT_UNITS,
    isSupplier: false,
    companyOptions: [], companyIdx: 0,

    // 明细
    detail: null,

    // PDF 两步式：先生成、再发送（微信要求 shareFileMessage 在 tap 同步栈内）
    pdfReady: false, pdfPath: '', pdfName: '',

    canWrite: false,
    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('purchase')) { this.setData({ denied: true, ready: true }); return; }
    const ps = db.num(db.data.pis_poPageSize) || 15;
    let psi = PAGE_SIZES.indexOf(ps);
    if (psi < 0) psi = 0;
    const coOptions = db.companies().map(c => c.code);
    let coIdx = coOptions.indexOf(db.curCompany());
    if (coIdx < 0) coIdx = 0;
    this.setData({
      ready: true,
      canWrite: db.Session.canWrite('purchase'),
      isSupplier: db.Session.isSupplier(),
      companyOptions: coOptions,
      companyIdx: coIdx,
      pageSizeIdx: psi,
      pageSize: PAGE_SIZES[psi],
      shown: PAGE_SIZES[psi],
      unitOptions: (db.data.pis_units && db.data.pis_units.length) ? db.data.pis_units : db.DEFAULT_UNITS
    });
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

  /* ==================== 列表 ==================== */

  render() {
    const kw = String(this.data.kw || '').trim().toLowerCase();
    const supSel = this.data.supplierIdx > 0 ? this.data.supplierOptions[this.data.supplierIdx] : '';
    const catSel = this.data.categoryIdx > 0 ? this.data.categoryOptions[this.data.categoryIdx] : '';
    const today = db.todayStr();

    let rows = db.list('orders').filter(o => {
      if (supSel && o.supplier !== supSel) return false;
      if (catSel && (o.category || '') !== catSel) return false;
      if (kw) {
        const hay = [o.contractNumber, o.supplier, o.po, o.category, o.remark]
          .concat(db.orderProducts(o).map(p => (p.name || '') + ' ' + (p.spec || '')))
          .join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const d = String(b.orderDate || '').localeCompare(String(a.orderDate || ''));
      if (d !== 0) return d;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    const shown = rows.slice(0, this.data.shown).map(o => {
      const st = db.orderStatus(o);
      const overdue = !!(o.deliveryDate && o.deliveryDate < today && (st.t === '未收货' || st.t === '部分收货'));
      const invoiced = db.invoicedOfContract(o.contractNumber);
      const paid = db.paidOfContract(o.contractNumber);
      const prods = db.orderProducts(o);
      return {
        id: o.id,
        company: o.company,
        contractNumber: o.contractNumber,
        supplier: o.supplier,
        po: o.po || '',
        orderDate: fmt.fmtDate(o.orderDate),
        deliveryDate: fmt.fmtDate(o.deliveryDate),
        category: o.category || '',
        remark: o.remark || '',
        productCount: prods.length,
        qty: db.orderOrderedQty(o),
        totalAmount: fmt.fmtMoney(o.totalAmount),
        statusText: st.t, statusClass: st.c,
        overdue: overdue,
        invoiced: fmt.fmtMoney(invoiced),
        paid: fmt.fmtMoney(paid),
        unInvoiced: fmt.fmtMoney(Math.max(0, db.num(o.totalAmount) - invoiced)),
        products: prods.map(p => ({
          name: p.name || '', spec: p.spec || '', unit: p.unit || '',
          unitPrice: fmt.fmtMoney(p.unitPrice), quantity: p.quantity,
          amount: fmt.fmtMoney(db.productAmount(p)), remark: p.remark || ''
        }))
      };
    });

    const supplierOptions = ['全部供应商'].concat(db.supplierNames().sort());
    let supplierIdx = this.data.supplierIdx;
    if (supplierIdx >= supplierOptions.length) supplierIdx = 0;

    const cats = [], seenCat = {};
    db.list('orders').forEach(o => { if (o.category && !seenCat[o.category]) { seenCat[o.category] = 1; cats.push(o.category); } });
    db.DEFAULT_CATEGORIES.forEach(c => { if (!seenCat[c]) { seenCat[c] = 1; cats.push(c); } });
    const categoryOptions = ['全部类别'].concat(cats);
    let categoryIdx = this.data.categoryIdx;
    if (categoryIdx >= categoryOptions.length) categoryIdx = 0;

    this.setData({
      list: shown,
      total: rows.length,
      supplierOptions: supplierOptions, supplierIdx: supplierIdx,
      categoryOptions: categoryOptions, categoryIdx: categoryIdx,
      sumQty: db.r2(shown.reduce((s, o) => s + db.num(o.qty), 0)),
      sumAmount: fmt.fmtMoney(shown.reduce((s, o) => s + db.num(o.totalAmount), 0))
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value, shown: this.data.pageSize }); this.render(); },
  onSupplier(e) { this.setData({ supplierIdx: +e.detail.value, shown: this.data.pageSize }); this.render(); },
  onCategory(e) { this.setData({ categoryIdx: +e.detail.value, shown: this.data.pageSize }); this.render(); },
  onPageSize(e) {
    const i = +e.detail.value;
    const ps = PAGE_SIZES[i] || 15;
    db.data.pis_poPageSize = ps; db.save('pis_poPageSize');
    this.setData({ pageSizeIdx: i, pageSize: ps, shown: ps });
    this.render();
  },
  resetFilter() {
    this.setData({ kw: '', supplierIdx: 0, categoryIdx: 0, shown: this.data.pageSize });
    this.render();
  },
  loadMore() { this.setData({ shown: this.data.shown + this.data.pageSize }); this.render(); },

  /* ==================== 表单 ==================== */

  openAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法新增', icon: 'none' }); return; }
    const co = db.writeCompany();
    if (db.curCompany() === db.ALL_COMPANIES) {
      wx.showToast({ title: '「全部公司」视图下按 ' + co + ' 建档', icon: 'none' });
    }
    const form = emptyForm();
    form.contractNumber = db.nextOrderNo();
    form.company = co;
    this.setData({
      modal: true, editId: '', form: form,
      products: [newProduct()], formTotal: '0.00', pdfReady: false, pdfPath: ''
    });
    this.recalc();
  },

  editItem(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const o = db.list('orders').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const products = db.orderProducts(o).map(p => {
      const it = newProduct();
      it.name = p.name || ''; it.spec = p.spec || '';
      it.unit = p.unit || '只';
      it.unitPrice = p.unitPrice === undefined ? '' : String(p.unitPrice);
      it.quantity = p.quantity === undefined ? '' : String(p.quantity);
      it.amount = fmt.fmtMoney(db.productAmount(p));
      it.remark = p.remark || '';
      return it;
    });
    if (!products.length) products.push(newProduct());
    this.syncUnitIdx(products);
    let coIdx = this.data.companyOptions.indexOf(o.company || db.writeCompany());
    if (coIdx < 0) coIdx = 0;
    this.setData({
      modal: true, editId: String(o.id), companyIdx: coIdx,
      form: {
        id: o.id, contractNumber: o.contractNumber || '', supplier: o.supplier || '',
        po: o.po || '', orderDate: fmt.fmtDate(o.orderDate), deliveryDate: fmt.fmtDate(o.deliveryDate),
        category: o.category || '', remark: o.remark || '', company: o.company || db.writeCompany()
      },
      products: products, pdfReady: false, pdfPath: ''
    });
    this.recalc();
  },

  closeModal() { this.setData({ modal: false, pdfReady: false, pdfPath: '' }); },
  noop() {},

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onCompanyPick(e) {
    const i = +e.detail.value;
    this.setData({ companyIdx: i, 'form.company': db.companies()[i].code });
  },

  pickSupplier() {
    const names = db.supplierNames().sort();
    if (!names.length) { wx.showToast({ title: '暂无供应商档案，可直接手工填写', icon: 'none' }); return; }
    wx.showActionSheet({
      itemList: names.slice(0, 6),
      success: res => { this.setData({ 'form.supplier': names[res.tapIndex] }); },
      fail: () => {}
    });
  },
  pickCategory() {
    const cats = db.DEFAULT_CATEGORIES;
    wx.showActionSheet({
      itemList: cats.slice(0, 6),
      success: res => { this.setData({ 'form.category': cats[res.tapIndex] }); },
      fail: () => {}
    });
  },

  /* ---- 产品明细行 ---- */
  onProductField(e) {
    const i = +e.currentTarget.dataset.idx, k = e.currentTarget.dataset.k;
    const products = this.data.products;
    products[i][k] = e.detail.value;
    products[i].amount = fmt.fmtMoney((parseFloat(products[i].unitPrice) || 0) * (parseFloat(products[i].quantity) || 0));
    this.setData({ products: products });
    this.recalc();
  },
  onProductUnit(e) {
    const i = +e.currentTarget.dataset.idx;
    const ui = +e.detail.value;
    const products = this.data.products;
    products[i].unitIdx = ui;
    products[i].unit = this.data.unitOptions[ui] || '只';
    this.setData({ products: products });
  },
  /** 依据单位名回填 unitIdx（编辑已有合同时用） */
  syncUnitIdx(products) {
    const opts = this.data.unitOptions;
    products.forEach(p => {
      let i = opts.indexOf(p.unit);
      if (i < 0) i = 0;
      p.unitIdx = i;
    });
    return products;
  },
  addProduct() { this.setData({ products: this.data.products.concat([newProduct()]) }); },
  removeProduct(e) {
    const i = +e.currentTarget.dataset.idx;
    const products = this.data.products.filter((_, idx) => idx !== i);
    this.setData({ products: products.length ? products : [newProduct()] });
    this.recalc();
  },
  recalc() {
    const total = this.data.products.reduce((s, p) => s + db.num(p.unitPrice) * db.num(p.quantity), 0);
    this.setData({ formTotal: fmt.fmtMoney(total) });
  },

  /** 「规格型号」粘贴联动：带出工具箱复制的尺寸 / 单位 / 单价（对应桌面端 pis_plyPaste） */
  pasteSpec(e) {
    const paste = db.getPlyPaste();
    if (!paste) { wx.showToast({ title: '工具箱暂无复制的尺寸，请先到「工具箱」复制', icon: 'none' }); return; }
    const i = +e.currentTarget.dataset.idx;
    const products = this.data.products;
    if (!products[i]) return;
    if (paste.spec) products[i].spec = paste.spec;
    if (paste.unit) products[i].unit = paste.unit;
    if (paste.price) products[i].unitPrice = String(paste.price);
    products[i].amount = fmt.fmtMoney(db.num(products[i].unitPrice) * db.num(products[i].quantity));
    this.setData({ products: products });
    this.recalc();
    wx.showToast({ title: '已带入尺寸与单价', icon: 'none' });
  },

  save() {
    const f = this.data.form;
    if (!String(f.supplier || '').trim()) { wx.showToast({ title: '请填写供应商', icon: 'none' }); return; }
    const valid = this.data.products.filter(p => String(p.name || '').trim() || db.num(p.quantity) > 0);
    if (!valid.length) { wx.showToast({ title: '请至少填写一行产品明细', icon: 'none' }); return; }
    const res = db.saveOrder({
      id: this.data.editId || '',
      contractNumber: f.contractNumber,
      supplier: String(f.supplier).trim(),
      po: f.po, orderDate: f.orderDate, deliveryDate: f.deliveryDate,
      category: f.category, remark: f.remark, company: f.company,
      products: valid.map(p => ({
        name: String(p.name || '').trim(), spec: p.spec, unit: p.unit,
        unitPrice: p.unitPrice, quantity: p.quantity, remark: p.remark
      }))
    });
    if (!res.ok) { wx.showModal({ title: '保存失败', content: res.msg, showCancel: false }); return; }
    wx.showToast({ title: this.data.editId ? '合同已更新' : '合同已保存', icon: 'success' });
    this.setData({ modal: false });
    this.render();
  },

  copyItem(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法复制', icon: 'none' }); return; }
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '复制合同',
      content: '将按所选合同复制一份新合同（新合同号，内容与明细一致），确认继续？',
      success: res => {
        if (!res.confirm) return;
        const r = db.copyOrder(id);
        if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已复制为 ' + r.order.contractNumber, icon: 'none' });
        this.render();
      }
    });
  },

  delItem(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const id = e.currentTarget.dataset.id;
    const o = db.list('orders').find(x => String(x.id) === String(id));
    wx.showModal({
      title: '确认删除',
      content: '确认删除合同 ' + (o ? o.contractNumber : '') + '？此操作不可恢复。',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteOrder(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 明细 ==================== */

  openDetail(e) {
    const o = db.list('orders').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const invoiced = db.invoicedOfContract(o.contractNumber);
    const paid = db.paidOfContract(o.contractNumber);
    const st = db.orderStatus(o);
    this.setData({
      detail: {
        contractNumber: o.contractNumber, supplier: o.supplier, po: o.po || '',
        orderDate: fmt.fmtDate(o.orderDate), deliveryDate: fmt.fmtDate(o.deliveryDate),
        category: o.category || '', remark: o.remark || '', company: o.company,
        statusText: st.t, statusClass: st.c,
        totalAmount: fmt.fmtMoney(o.totalAmount),
        invoiced: fmt.fmtMoney(invoiced),
        unInvoiced: fmt.fmtMoney(Math.max(0, db.num(o.totalAmount) - invoiced)),
        paid: fmt.fmtMoney(paid),
        waitPay: fmt.fmtMoney(Math.max(0, invoiced - paid)),
        qty: db.orderOrderedQty(o),
        products: db.orderProducts(o).map(p => ({
          name: p.name || '', spec: p.spec || '', unit: p.unit || '',
          unitPrice: fmt.fmtMoney(p.unitPrice), quantity: db.num(p.quantity),
          amount: fmt.fmtMoney(db.productAmount(p)),
          shipped: db.r2(db.shippedQty(o.contractNumber, p.name)),
          received: db.r2(db.receivedQty(o.contractNumber, p.name)),
          returned: db.r2(db.returnedQty(o.contractNumber, p.name)),
          balance: db.r2(db.receivedQty(o.contractNumber, p.name) - db.returnedQty(o.contractNumber, p.name))
        }))
      }
    });
  },
  closeDetail() { this.setData({ detail: null }); },

  /* ==================== 导入 / 导出 / 清空 ==================== */

  exportCSV() {
    const rows = db.list('orders');
    if (!rows.length) { wx.showToast({ title: '当前范围没有合同数据', icon: 'none' }); return; }
    const out = [[
      '公司', '合同号', 'PO', '供应商', '合同日期', '交货期', '成本类别',
      '产品名称', '规格型号', '单位', '单价', '数量', '金额', '说明', '合同总额', '备注'
    ]];
    rows.forEach(o => {
      const ps = db.orderProducts(o);
      if (!ps.length) {
        out.push([o.company, o.contractNumber, o.po || '', o.supplier, fmt.fmtDate(o.orderDate), fmt.fmtDate(o.deliveryDate),
          o.category || '', '', '', '', '', '', '', '', db.num(o.totalAmount), o.remark || '']);
        return;
      }
      ps.forEach(p => out.push([
        o.company, o.contractNumber, o.po || '', o.supplier, fmt.fmtDate(o.orderDate), fmt.fmtDate(o.deliveryDate),
        o.category || '', p.name || '', p.spec || '', p.unit || '',
        db.num(p.unitPrice), db.num(p.quantity), db.productAmount(p), p.remark || '', db.num(o.totalAmount), o.remark || ''
      ]));
    });
    csv.exportFile('采购合同_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  importCSV() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法导入', icon: 'none' }); return; }
    csv.chooseCSV(rows => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const head = rows[0].map(h => String(h).trim());
      const col = names => { for (let i = 0; i < names.length; i++) { const k = head.findIndex(h => h.indexOf(names[i]) > -1); if (k > -1) return k; } return -1; };
      const C = {
        company: col(['公司']), contractNumber: col(['合同号']), po: col(['PO']),
        supplier: col(['供应商']), orderDate: col(['合同日期', '订单日期']), deliveryDate: col(['交货期', '交货日期']),
        category: col(['成本类别']), name: col(['产品名称']), spec: col(['规格']), unit: col(['单位']),
        unitPrice: col(['单价']), quantity: col(['数量']), remark: col(['说明']), orderRemark: col(['备注'])
      };
      if (C.contractNumber < 0 || C.supplier < 0 || C.name < 0) {
        wx.showToast({ title: '表头缺少「合同号 / 供应商 / 产品名称」列', icon: 'none' });
        return;
      }
      const g = (r, k) => C[k] >= 0 ? String(r[C[k]] == null ? '' : r[C[k]]).trim() : '';
      const map = {}, order = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const cno = g(r, 'contractNumber'), name = g(r, 'name');
        if (!cno || !name) continue;
        if (!map[cno]) { map[cno] = { order: null, products: [] }; order.push(cno); }
        const bucket = map[cno];
        if (!bucket.order) {
          bucket.order = {
            id: '', contractNumber: cno,
            supplier: g(r, 'supplier'), po: g(r, 'po'),
            orderDate: csv.parseCellDate(g(r, 'orderDate')),
            deliveryDate: csv.parseCellDate(g(r, 'deliveryDate')),
            category: g(r, 'category'), remark: g(r, 'orderRemark'),
            company: g(r, 'company') || db.writeCompany(),
            products: bucket.products
          };
        }
        bucket.products.push({
          name: name, spec: g(r, 'spec'), unit: g(r, 'unit') || '只',
          unitPrice: db.num(g(r, 'unitPrice')), quantity: db.num(g(r, 'quantity')),
          remark: g(r, 'remark')
        });
      }
      const recs = order.map(c => map[c].order);
      if (!recs.length) { wx.showToast({ title: '未找到有效合同数据', icon: 'none' }); return; }
      const exist = {};
      db.all('orders').forEach(o => { exist[o.company + '|' + o.contractNumber] = 1; });
      const fresh = recs.filter(r => !exist[(r.company || db.writeCompany()) + '|' + r.contractNumber]);
      const skip = recs.length - fresh.length;
      if (!fresh.length) { wx.showToast({ title: '没有新数据可导入（' + skip + ' 份已存在）', icon: 'none' }); return; }
      wx.showModal({
        title: '导入确认',
        content: '解析到 ' + fresh.length + ' 份新合同' + (skip ? '，跳过已存在 ' + skip + ' 份' : '') + '。确认导入？',
        success: res => {
          if (!res.confirm) return;
          let ok = 0, fail = 0;
          fresh.forEach(r => { const rr = db.saveOrder(r); if (rr.ok) ok++; else fail++; });
          wx.showToast({ title: '已导入 ' + ok + ' 份' + (fail ? '，失败 ' + fail : ''), icon: 'none' });
          this.render();
        }
      });
    });
  },

  clearAll() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.list('orders').length;
    if (!n) { wx.showToast({ title: '当前范围没有合同', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 清空采购合同',
      content: '将清空当前公司主体的 ' + n + ' 份合同（含明细），此操作不可恢复！',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const r = db.clearColl('orders');
        if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已清空 ' + n + ' 份', icon: 'none' });
        this.render();
      }
    });
  },

  /* ==================== 生成采购合同 PDF（两步式） ==================== */

  buildContractPdf(e) {
    const o = db.list('orders').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const buyer = db.buyerInfoOf(o.company);
    const sup = db.findSupplierByName(o.supplier) || {};
    const payload = {
      contractNumber: o.contractNumber, po: o.po || '',
      orderDate: fmt.fmtDate(o.orderDate), deliveryDate: fmt.fmtDate(o.deliveryDate),
      category: o.category || '',
      totalAmount: db.num(o.totalAmount),
      totalAmountCn: db.moneyCn(o.totalAmount),
      orderRemark: o.remark || '',
      companyName: buyer.companyName,
      buyerCompanyAddress: buyer.address,
      buyerContactPerson: buyer.contact,
      buyerPhoneNumber: buyer.phone,
      chopFile: buyer.chop,
      supplierInfo: {
        supplierName: o.supplier,
        companyAddress: sup.companyAddress || '',
        contactPerson: sup.contactPerson || '',
        phoneNumber: sup.phoneNumber || '',
        email: sup.email || '',
        bankName: sup.bankName || '',
        bankCode: sup.bankCode || '',
        bankAccount: sup.bankAccount || ''
      },
      terms: (db.data.pis_terms && db.data.pis_terms.length) ? db.data.pis_terms : db.DEFAULT_TERMS,
      products: db.orderProducts(o).map(p => ({
        productName: p.name || '', specification: p.spec || '',
        unit: p.unit || '', unitPrice: db.num(p.unitPrice), quantity: db.num(p.quantity),
        amount: db.productAmount(p), remark: p.remark || ''
      }))
    };
    pdfShare.buildFile(pdfShare.docRenderers.renderPurchaseContract, payload,
      '采购合同_' + o.contractNumber, 'portrait', (ok, path) => {
        if (!ok) return;
        this.setData({ pdfReady: true, pdfPath: path, pdfName: '采购合同_' + o.contractNumber + '.pdf' });
        wx.showModal({
          title: '合同已生成',
          content: '点击下方「发送PDF」可转发给微信好友或另存为文件。',
          showCancel: false, confirmText: '知道了'
        });
      });
  },

  /** 必须在 tap 同步调用栈中执行（微信限制），不能包在回调里 */
  sendPdf() {
    if (!this.data.pdfPath) { wx.showToast({ title: '请先生成合同', icon: 'none' }); return; }
    pdfShare.sharePrepared(this.data.pdfPath, () => {});
  },

  goTools() { wx.navigateTo({ url: '/pages/purchase/tools/tools' }); }
});
