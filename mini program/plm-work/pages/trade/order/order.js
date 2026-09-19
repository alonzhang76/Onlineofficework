const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const STATUS_CLASS = { '待生产': 'badge-gray', '生产中': 'badge-orange', '已出货': 'badge-green' };
const PLATING_LIST = ['', '是', '否'];
const DATE_TYPE = ['订单日期', '交货日期'];

let ridCounter = 0;

// LOGO 选项（名称 + 对应图片路径；图片按约定存 /assets/logos/{名小写}.png，无图文件时 <image binderror> 隐藏）
const LOGO_OPTS = db.LOGO_OPTIONS.map(n => ({
  name: n,
  img: n === '无' ? '' : '/assets/logos/' + n.toLowerCase() + '.png'
}));
function logoImgOf(name) {
  const o = LOGO_OPTS.find(x => x.name === name);
  return o ? o.img : (name ? '/assets/logos/' + String(name).toLowerCase() + '.png' : '');
}

function newProduct() {
  return {
    rid: 'p' + (++ridCounter),
    productName: '', spec: '', drawingNo: '',
    platingIdx: 0, logo: '无', logoImg: '', logoMenu: false, logoIdx: 0, unitIdx: 0,
    unitPrice: '', quantity: '', amount: '0.00'
  };
}

function emptyForm() {
  return {
    customer: '', orderNo: '', orderDate: fmt.today(), deliveryDate: '',
    tradeTerms: '', paymentMethod: '', transportMethod: '', currency: 'USD',
    packing: '', remark: '', status: '待生产'
  };
}

Page({
  data: {
    kw: '',
    custOptions: ['全部客户'], custIdx: 0,
    statusOptions: ['全部状态'].concat(db.ORDER_STATUS), statusIdx: 0,
    platingOptions: ['全部', '是', '否'], platingIdx: 0,
    dateTypeOptions: DATE_TYPE, dateTypeIdx: 0,
    dateFrom: '', dateTo: '',

    list: [], sumAmount: '0.00', sumQty: 0,

    modal: false, editId: '',
    form: emptyForm(),
    products: [newProduct()],
    totalAmount: '0.00',

    tradeTerms: [''].concat(db.TRADE_TERMS), ttIdx: 0,
    paymentMethods: [''].concat(db.PAYMENT_METHODS), pmIdx: 0,
    transportMethods: [''].concat(db.TRANSPORT_METHODS), tmIdx: 0,
    currencies: db.CURRENCIES, curIdx: 0,
    statusList: db.ORDER_STATUS, statusIdx2: 0,
    platingList: PLATING_LIST,
    logoOptions: db.LOGO_OPTIONS, logoOpts: LOGO_OPTS, unitOptions: db.UNIT_OPTIONS,
    logoErr: {}, logoMenuAny: false
  },

  onShow() { this.render(); },

  /* ===== 列表渲染 ===== */
  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const statusSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';
    const platingSel = this.data.platingIdx > 0 ? this.data.platingOptions[this.data.platingIdx] : '';
    const dateField = this.data.dateTypeIdx === 0 ? 'orderDate' : 'deliveryDate';

    const list = db.data.orderRecords
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (statusSel && o.status !== statusSel) return false;
        if (platingSel && String(o.plating || '') !== platingSel) return false;
        const dv = String(o[dateField] || '');
        if (this.data.dateFrom && dv && dv < this.data.dateFrom) return false;
        if (this.data.dateTo && dv && dv > this.data.dateTo) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.productName, o.spec, o.drawingNo, o.remark, o.packing].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('orderDate'))
      .map(o => ({
        id: o.id,
        customer: o.customer, orderNo: o.orderNo,
        orderDate: fmt.fmtDate(o.orderDate), deliveryDate: fmt.fmtDate(o.deliveryDate),
        productName: o.productName, spec: o.spec, drawingNo: o.drawingNo,
        plating: o.plating, logo: o.logo, logoImg: logoImgOf(o.logo), unit: o.unit,
        unitPrice: fmt.fmtMoney(o.unitPrice), quantity: o.quantity, amount: fmt.fmtMoney(o.amount),
        currency: o.currency || 'USD', tradeTerms: o.tradeTerms, paymentMethod: o.paymentMethod,
        transportMethod: o.transportMethod, packing: o.packing, remark: o.remark,
        status: o.status || '待生产', statusClass: STATUS_CLASS[o.status || '待生产'] || 'badge-gray'
      }));

    const custOptions = ['全部客户'].concat(
      Array.from(new Set(db.data.orderRecords.map(o => o.customer).filter(Boolean))).sort()
    );
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;

    this.setData({
      list, custOptions, custIdx,
      sumAmount: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.amount) || 0, 0)),
      sumQty: list.reduce((s, o) => s + (+o.quantity || 0), 0)
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onCust(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  onPlating(e) { this.setData({ platingIdx: +e.detail.value }); this.render(); },
  onDateType(e) { this.setData({ dateTypeIdx: +e.detail.value }); this.render(); },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.render(); },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', custIdx: 0, statusIdx: 0, platingIdx: 0, dateTypeIdx: 0, dateFrom: '', dateTo: '' });
    this.render();
  },

  /* ===== 表单 ===== */
  openAdd() {
    this.setData({
      modal: true, editId: '', form: emptyForm(),
      products: [newProduct()], totalAmount: '0.00', logoMenuAny: false,
      ttIdx: 0, pmIdx: 0, tmIdx: 0, curIdx: 0, statusIdx2: 0
    });
  },

  editItem(e) {
    const o = db.data.orderRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const form = {
      customer: o.customer || '', orderNo: o.orderNo || '',
      orderDate: fmt.fmtDate(o.orderDate), deliveryDate: fmt.fmtDate(o.deliveryDate),
      tradeTerms: o.tradeTerms || '', paymentMethod: o.paymentMethod || '',
      transportMethod: o.transportMethod || '', currency: o.currency || 'USD',
      packing: o.packing || '', remark: o.remark || '', status: o.status || '待生产'
    };
    const p = newProduct();
    p.productName = o.productName || '';
    p.spec = o.spec || '';
    p.drawingNo = o.drawingNo || '';
    p.platingIdx = Math.max(0, PLATING_LIST.indexOf(o.plating || ''));
    p.logo = o.logo || '无';
    p.logoImg = logoImgOf(p.logo);
    p.logoIdx = Math.max(0, db.LOGO_OPTIONS.indexOf(p.logo));
    p.unitIdx = Math.max(0, db.UNIT_OPTIONS.indexOf(o.unit || ''));
    p.unitPrice = o.unitPrice === undefined ? '' : String(o.unitPrice);
    p.quantity = o.quantity === undefined ? '' : String(o.quantity);
    p.amount = fmt.fmtMoney(o.amount);

    this.setData({
      modal: true, editId: String(o.id), form: form, products: [p],
      ttIdx: Math.max(0, this.data.tradeTerms.indexOf(form.tradeTerms)),
      pmIdx: Math.max(0, this.data.paymentMethods.indexOf(form.paymentMethod)),
      tmIdx: Math.max(0, this.data.transportMethods.indexOf(form.transportMethod)),
      curIdx: Math.max(0, db.CURRENCIES.indexOf(form.currency)),
      statusIdx2: Math.max(0, db.ORDER_STATUS.indexOf(form.status))
    });
    this.recalc();
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onTT(e) { const i = +e.detail.value; this.setData({ ttIdx: i, 'form.tradeTerms': this.data.tradeTerms[i] }); },
  onPM(e) { const i = +e.detail.value; this.setData({ pmIdx: i, 'form.paymentMethod': this.data.paymentMethods[i] }); },
  onTM(e) { const i = +e.detail.value; this.setData({ tmIdx: i, 'form.transportMethod': this.data.transportMethods[i] }); },
  onCur(e) { const i = +e.detail.value; this.setData({ curIdx: i, 'form.currency': db.CURRENCIES[i] }); },
  onStatusForm(e) { const i = +e.detail.value; this.setData({ statusIdx2: i, 'form.status': db.ORDER_STATUS[i] }); },

  onProductField(e) {
    const i = +e.currentTarget.dataset.idx;
    const k = e.currentTarget.dataset.k;
    const products = this.data.products;
    products[i][k] = e.detail.value;
    products[i].amount = fmt.fmtMoney((parseFloat(products[i].unitPrice) || 0) * (parseFloat(products[i].quantity) || 0));
    this.setData({ products: products });
    this.recalc();
  },

  onProductPlating(e) {
    const i = +e.currentTarget.dataset.idx;
    this.setData({ ['products[' + i + '].platingIdx']: +e.detail.value });
  },
  onProductLogo(e) {
    const i = +e.currentTarget.dataset.idx;
    this.setData({ ['products[' + i + '].logoIdx']: +e.detail.value });
  },

  // 展开/收起某产品行的 LOGO 自定义菜单（同时只保留一个菜单打开）
  toggleLogoMenu(e) {
    const i = +e.currentTarget.dataset.idx;
    const products = this.data.products;
    const willOpen = !products[i].logoMenu;
    products.forEach((p, k) => { p.logoMenu = willOpen && k === i; });
    this.setData({ products: products, logoMenuAny: willOpen });
  },
  pickLogo(e) {
    const i = +e.currentTarget.dataset.idx;
    const name = e.currentTarget.dataset.ln;
    const products = this.data.products;
    products[i].logo = name;
    products[i].logoImg = logoImgOf(name);
    products[i].logoIdx = Math.max(0, db.LOGO_OPTIONS.indexOf(name));
    products[i].logoMenu = false;
    this.setData({ products: products, logoMenuAny: false });
  },
  closeLogoMenus() {
    const products = this.data.products;
    products.forEach(p => { p.logoMenu = false; });
    this.setData({ products: products, logoMenuAny: false });
  },
  // LOGO 图片加载失败（未放入对应文件）→ 记录后只显示名称文字
  onLogoErr(e) {
    this.setData({ ['logoErr.' + e.currentTarget.dataset.ln]: true });
  },
  onProductUnit(e) {
    const i = +e.currentTarget.dataset.idx;
    this.setData({ ['products[' + i + '].unitIdx']: +e.detail.value });
  },

  addProduct() {
    const products = this.data.products.concat([newProduct()]);
    this.setData({ products: products });
  },

  removeProduct(e) {
    const i = +e.currentTarget.dataset.idx;
    const products = this.data.products.filter((_, idx) => idx !== i);
    this.setData({ products: products });
    this.recalc();
  },

  recalc() {
    const total = this.data.products.reduce((s, p) => s + (parseFloat(p.unitPrice) || 0) * (parseFloat(p.quantity) || 0), 0);
    this.setData({ totalAmount: fmt.fmtMoney(total) });
  },

  save() {
    const f = this.data.form;
    if (!String(f.customer || '').trim()) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    if (!String(f.orderNo || '').trim()) { wx.showToast({ title: '请填写订单号', icon: 'none' }); return; }
    const valid = this.data.products.filter(p => String(p.productName || '').trim() || parseFloat(p.quantity) > 0);
    if (!valid.length) { wx.showToast({ title: '请至少填写一行产品', icon: 'none' }); return; }

    const products = valid.map(p => ({
      productName: String(p.productName || '').trim(),
      spec: String(p.spec || '').trim(),
      drawingNo: String(p.drawingNo || '').trim(),
      plating: PLATING_LIST[p.platingIdx] || '',
      logo: p.logo || '无',
      unit: db.UNIT_OPTIONS[p.unitIdx] || '',
      unitPrice: p.unitPrice,
      quantity: p.quantity
    }));

    if (this.data.editId) {
      // 编辑：只更新第一条记录（保持原有 id），其余行重建
      const id = this.data.editId;
      const keep = db.data.orderRecords.find(x => String(x.id) === id);
      const createdAt = keep ? keep.createdAt : new Date().toISOString();
      db.deleteOrder(id);
      const saved = db.saveOrder(f, products);
      if (saved.length && saved[0]) { saved[0].id = keep ? keep.id : saved[0].id; saved[0].createdAt = createdAt; }
      db.save('orderRecords');
      wx.showToast({ title: '订单已更新', icon: 'success' });
    } else {
      db.saveOrder(f, products);
      wx.showToast({ title: '订单已添加', icon: 'success' });
    }
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此订单记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteOrder(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  /* ===== 跳转：客户统计 / 生产通知单 / 制作箱唛 ===== */
  goStats() { wx.navigateTo({ url: '/pages/trade/customer-stats/customer-stats' }); },
  goNoticeAll() { wx.navigateTo({ url: '/pages/trade/notice/notice' }); },
  goMarkAll() { wx.navigateTo({ url: '/pages/trade/mark/mark' }); },
  goNotice(e) {
    const orderNo = e.currentTarget.dataset.order;
    wx.navigateTo({ url: '/pages/trade/notice/notice?orderNo=' + encodeURIComponent(orderNo) });
  },
  goMark(e) {
    const orderNo = e.currentTarget.dataset.order;
    wx.navigateTo({ url: '/pages/trade/mark/mark?orderNo=' + encodeURIComponent(orderNo) });
  },

  /* ===== 导入导出 ===== */
  exportCSV() {
    if (!db.data.orderRecords.length) { wx.showToast({ title: '暂无订单数据', icon: 'none' }); return; }
    const headers = ['状态', '订单日期', '客户', '订单号', '交货日期', '交易条款', '付款方式', '运输方式',
      '产品名称', '规格', '图号', '电镀', 'LOGO', '单位', '单价', '数量', '金额', '货币', '包装', '备注'];
    const rows = [headers];
    db.data.orderRecords.forEach(o => {
      rows.push([
        o.status || '', fmt.fmtDate(o.orderDate), o.customer || '', o.orderNo || '', fmt.fmtDate(o.deliveryDate),
        o.tradeTerms || '', o.paymentMethod || '', o.transportMethod || '',
        o.productName || '', o.spec || '', o.drawingNo || '', o.plating || '', o.logo || '', o.unit || '',
        o.unitPrice || 0, o.quantity || 0, o.amount || 0, o.currency || 'USD', o.packing || '', o.remark || ''
      ]);
    });
    csv.exportFile('订单记录_' + fmt.today() + '.csv', csv.toCSV(rows));
  },

  importCSV() {
    csv.chooseCSV((rows) => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const header = rows[0].map(h => String(h).trim());
      const rules = [
        { field: 'status', test: h => /^状态$/.test(h) },
        { field: 'orderDate', test: h => /订单日期|下单日期/.test(h) },
        { field: 'customer', test: h => /^客户$|客户名称/.test(h) },
        { field: 'orderNo', test: h => /订单号|订单编号/.test(h) },
        { field: 'deliveryDate', test: h => /交货日期|交期/.test(h) },
        { field: 'tradeTerms', test: h => /交易条款/.test(h) },
        { field: 'paymentMethod', test: h => /付款方式/.test(h) },
        { field: 'transportMethod', test: h => /运输方式/.test(h) },
        { field: 'productName', test: h => /产品名称|品名/.test(h) },
        { field: 'spec', test: h => /规格/.test(h) },
        { field: 'drawingNo', test: h => /图号|图纸号/.test(h) },
        { field: 'plating', test: h => /电镀/.test(h) },
        { field: 'logo', test: h => /^LOGO$|logo/i.test(h) },
        { field: 'unit', test: h => /^单位$/.test(h) },
        { field: 'unitPrice', test: h => /单价/.test(h) },
        { field: 'quantity', test: h => /数量/.test(h) },
        { field: 'amount', test: h => /金额/.test(h) },
        { field: 'currency', test: h => /货币|币种/.test(h) },
        { field: 'packing', test: h => /包装/.test(h) },
        { field: 'remark', test: h => /备注/.test(h) }
      ];
      const colMap = {};
      header.forEach((h, j) => {
        for (const r of rules) {
          if (r.test(h) && colMap[r.field] === undefined) { colMap[r.field] = j; break; }
        }
      });
      if (colMap.customer === undefined || colMap.orderNo === undefined) {
        wx.showToast({ title: '未找到"客户/订单号"列', icon: 'none' }); return;
      }
      const valid = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const gv = f => colMap[f] !== undefined ? r[colMap[f]] : '';
        const customer = String(gv('customer') || '').trim();
        const orderNo = String(gv('orderNo') || '').trim();
        if (!customer || !orderNo) continue;
        const unitPrice = db.r2(gv('unitPrice'));
        const quantity = db.num(gv('quantity'));
        const amount = gv('amount') !== '' && gv('amount') !== undefined ? db.r2(gv('amount')) : db.r2(unitPrice * quantity);
        valid.push({
          id: db.uid('ord_'),
          status: String(gv('status') || '待生产').trim() || '待生产',
          orderDate: csv.parseCellDate(gv('orderDate')),
          customer, orderNo,
          deliveryDate: csv.parseCellDate(gv('deliveryDate')),
          tradeTerms: String(gv('tradeTerms') || '').trim(),
          paymentMethod: String(gv('paymentMethod') || '').trim(),
          transportMethod: String(gv('transportMethod') || '').trim(),
          productName: String(gv('productName') || '').trim(),
          spec: String(gv('spec') || '').trim(),
          drawingNo: String(gv('drawingNo') || '').trim(),
          plating: String(gv('plating') || '').trim(),
          logo: String(gv('logo') || '').trim(),
          unit: String(gv('unit') || '').trim(),
          unitPrice, quantity, amount,
          currency: String(gv('currency') || 'USD').trim() || 'USD',
          packing: String(gv('packing') || '').trim(),
          remark: String(gv('remark') || '').trim(),
          createdAt: new Date().toISOString()
        });
      }
      if (!valid.length) { wx.showToast({ title: '未找到有效订单数据', icon: 'none' }); return; }
      wx.showModal({
        title: '导入方式',
        content: '将导入 ' + valid.length + ' 条订单。\n确定=覆盖，取消=追加',
        confirmText: '覆盖', cancelText: '追加',
        success: res => {
          if (res.confirm) db.data.orderRecords = [];
          valid.forEach(o => db.data.orderRecords.push(o));
          db.save('orderRecords');
          wx.showToast({ title: '成功导入 ' + valid.length + ' 条', icon: 'success' });
          this.render();
        }
      });
    });
  }
});
