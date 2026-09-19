const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const pdfShare = require('../../../utils/pdf-share');
const docRenderers = require('../../../utils/doc-renderers');

const PAYMENT_MODES = ['T/T 电汇', 'L/C 信用证', 'D/P 付款交单', 'D/A 承兑交单', '其他'];

function emptyForm() {
  return {
    shipmentNo: '',
    departureDate: fmt.today(),
    shipper: '', seller: '', consignee: '',
    terms: 'FOB', shippingMode: '海运', currency: 'USD',
    vessel: '', pol: '上海 Shanghai', pod: '', destination: '',
    tradeType: '一般贸易', paymentMode: '', boundaryPort: '上海海关',
    billNo: '', contractNo: '', packing: 'Plywood case',
    marks: '', remarks: '',
    termsIdx: 0, modeIdx: 0, curIdx: 0, pmIdx: -1
  };
}

function emptyItem() {
  return {
    rid: db.uid('it_'),
    orderNo: '', hsCode: '', description: '', drawingNo: '', spec: '', projectNo: '',
    qtyCrate: '', unit: '', quantity: '', unitPrice: '', nw: '', gw: '', volume: '',
    amountText: '0.00'
  };
}

Page({
  data: {
    mode: 'list',
    kw: '',
    list: [], sumAmount: '0.00', sumCrates: 0,

    terms: db.TRADE_TERMS,
    shippingModes: db.TRANSPORT_METHODS,
    currencies: db.CURRENCIES,
    paymentModes: PAYMENT_MODES,

    modal: false, editId: '',
    form: emptyForm(),
    items: [emptyItem()],
    totals: { amount: '0.00', qty: 0, crates: 0, nw: '0.00', gw: '0.00', volume: '0.00' },

    orderOptions: [], orderIdx: 0,

    docTab: 0, doc: null,
    pdfReady: false, pdfPath: ''
  },

  onShow() { this.renderList(); },

  /* ---------------- 列表 ---------------- */

  renderList() {
    const kw = this.data.kw.toLowerCase().trim();
    const list = db.data.customsRecords
      .filter(r => {
        if (!kw) return true;
        const hay = [r.shipmentNo, r.consignee, r.customer, r.orderNos, r.pol, r.pod, r.vessel, r.billNo]
          .join(' ').toLowerCase();
        return hay.indexOf(kw) > -1;
      })
      .sort(fmt.cmpDateDesc('departureDate'))
      .map(r => ({
        id: r.id,
        shipmentNo: r.shipmentNo,
        departureDate: fmt.fmtDate(r.departureDate),
        shippingMode: r.shippingMode, terms: r.terms, currency: r.currency,
        pol: r.pol, pod: r.pod, destination: r.destination,
        consignee: r.consignee, orderNos: r.orderNos, vessel: r.vessel,
        totalAmount: fmt.fmtMoney(r.totalAmount),
        totalQty: r.totalQty, totalCrates: r.totalCrates,
        totalGw: fmt.fmtMoney(r.totalGw), totalVolume: fmt.fmtMoney(r.totalVolume)
      }));
    const sumAmount = db.data.customsRecords
      .filter(r => {
        if (!kw) return true;
        const hay = [r.shipmentNo, r.consignee, r.customer, r.orderNos, r.pol, r.pod, r.vessel, r.billNo]
          .join(' ').toLowerCase();
        return hay.indexOf(kw) > -1;
      })
      .reduce((s, r) => s + db.num(r.totalAmount), 0);
    const sumCrates = db.data.customsRecords.reduce((s, r) => s + db.num(r.totalCrates), 0);
    this.setData({ list, sumAmount: fmt.fmtMoney(sumAmount), sumCrates });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.renderList(); },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除确认', content: '确定删除该出货与报关记录吗？',
      success: res => {
        if (!res.confirm) return;
        db.deleteCustoms(id);
        this.renderList();
        if (this.data.doc && this.data.doc.id === id) this.setData({ mode: 'list', doc: null });
      }
    });
  },

  /* ---------------- 新增 / 编辑 ---------------- */

  openAdd() {
    const grouped = db.groupOrdersByNo();
    const orderOptions = Object.keys(grouped).sort().map(no => ({
      value: no,
      label: no + ' ｜ ' + (grouped[no].customer || '-') + ' ｜ ' + grouped[no].rows.length + '款'
    }));
    this.setData({
      modal: true, editId: '',
      form: Object.assign(emptyForm(), { shipmentNo: db.nextShipmentNo() }),
      items: [emptyItem()],
      orderOptions, orderIdx: 0
    });
    this.recalc();
  },

  editItem(e) {
    const id = e.currentTarget.dataset.id;
    const r = db.data.customsRecords.find(x => String(x.id) === String(id));
    if (!r) return;

    const grouped = db.groupOrdersByNo();
    const orderOptions = Object.keys(grouped).sort().map(no => ({
      value: no,
      label: no + ' ｜ ' + (grouped[no].customer || '-') + ' ｜ ' + grouped[no].rows.length + '款'
    }));

    const items = (r.items && r.items.length ? r.items : [{}]).map(p => ({
      rid: db.uid('it_'),
      orderNo: p.orderNo || '', hsCode: p.hsCode || '', description: p.description || '',
      drawingNo: p.drawingNo || '', spec: p.spec || '', projectNo: p.projectNo || '',
      qtyCrate: p.qtyCrate || p.qtyCrate === 0 ? String(p.qtyCrate) : '',
      unit: p.unit || '',
      quantity: p.quantity || p.quantity === 0 ? String(p.quantity) : '',
      unitPrice: p.unitPrice || p.unitPrice === 0 ? String(p.unitPrice) : '',
      nw: p.nw || p.nw === 0 ? String(p.nw) : '',
      gw: p.gw || p.gw === 0 ? String(p.gw) : '',
      volume: p.volume || p.volume === 0 ? String(p.volume) : '',
      amountText: fmt.fmtMoney(p.amount)
    }));

    const form = Object.assign(emptyForm(), {
      shipmentNo: r.shipmentNo, departureDate: fmt.fmtDate(r.departureDate),
      shipper: r.shipper, seller: r.seller, consignee: r.consignee,
      terms: r.terms || 'FOB', shippingMode: r.shippingMode || '海运', currency: r.currency || 'USD',
      vessel: r.vessel, pol: r.pol, pod: r.pod, destination: r.destination,
      tradeType: r.tradeType || '一般贸易', paymentMode: r.paymentMode || '',
      boundaryPort: r.boundaryPort || '上海海关', billNo: r.billNo, contractNo: r.contractNo,
      packing: r.packing || 'Plywood case', marks: r.marks, remarks: r.remarks,
      termsIdx: Math.max(0, db.TRADE_TERMS.indexOf(r.terms)),
      modeIdx: Math.max(0, db.TRANSPORT_METHODS.indexOf(r.shippingMode)),
      curIdx: Math.max(0, db.CURRENCIES.indexOf(r.currency)),
      pmIdx: PAYMENT_MODES.indexOf(r.paymentMode)
    });

    this.setData({ modal: true, editId: id, form, items, orderOptions, orderIdx: 0 });
    this.recalc();
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  onField(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  onDate(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  onPick(e) {
    const k = e.currentTarget.dataset.k;
    const idx = +e.detail.value;
    const patch = {};
    let value = '';
    if (k === 'terms') { value = db.TRADE_TERMS[idx]; patch['form.termsIdx'] = idx; }
    else if (k === 'shippingMode') { value = db.TRANSPORT_METHODS[idx]; patch['form.modeIdx'] = idx; }
    else if (k === 'currency') { value = db.CURRENCIES[idx]; patch['form.curIdx'] = idx; }
    else if (k === 'paymentMode') { value = PAYMENT_MODES[idx]; patch['form.pmIdx'] = idx; }
    patch['form.' + k] = value;
    this.setData(patch);
  },

  /* ---------------- 货物行 ---------------- */

  onItemField(e) {
    const idx = +e.currentTarget.dataset.idx;
    const k = e.currentTarget.dataset.k;
    this.setData({ ['items[' + idx + '].' + k]: e.detail.value });
  },

  onItemNum(e) {
    const idx = +e.currentTarget.dataset.idx;
    const k = e.currentTarget.dataset.k;
    this.setData({ ['items[' + idx + '].' + k]: e.detail.value });
    this.recalc(idx);
  },

  addItem() {
    const items = this.data.items.concat([emptyItem()]);
    this.setData({ items });
  },

  removeItem(e) {
    const idx = +e.currentTarget.dataset.idx;
    const items = this.data.items.slice();
    items.splice(idx, 1);
    this.setData({ items });
    this.recalc();
  },

  /** 从订单带入：按订单号追加该订单全部产品行 */
  onPickOrder(e) {
    const idx = +e.detail.value;
    const opt = this.data.orderOptions[idx];
    if (!opt) return;
    const g = db.groupOrdersByNo()[opt.value];
    if (!g) return;
    const newRows = g.rows.map(r => {
      const it = emptyItem();
      it.orderNo = r.orderNo || '';
      it.description = r.productName || '';
      it.drawingNo = r.drawingNo || '';
      it.spec = r.spec || '';
      it.unit = r.unit || '';
      it.quantity = r.quantity ? String(r.quantity) : '';
      it.unitPrice = r.unitPrice ? String(r.unitPrice) : '';
      it.amountText = fmt.fmtMoney(r.amount);
      return it;
    });
    // 首个空白行被自动占位时直接替换
    let items = this.data.items;
    if (items.length === 1 && !items[0].description && !items[0].orderNo) items = [];
    this.setData({ items: items.concat(newRows), orderIdx: idx });
    this.recalc();
    wx.showToast({ title: '已带入 ' + newRows.length + ' 行', icon: 'none' });
  },

  /** 重算某行金额与全部合计（idx 为当前编辑行） */
  recalc(focusIdx) {
    const items = this.data.items.slice();
    if (focusIdx !== undefined) {
      const p = items[focusIdx];
      p.amountText = fmt.fmtMoney(db.num(p.unitPrice) * db.num(p.quantity));
    }
    items.forEach(p => {
      if (focusIdx === undefined) p.amountText = fmt.fmtMoney(db.num(p.unitPrice) * db.num(p.quantity));
    });
    const totals = {
      amount: fmt.fmtMoney(items.reduce((s, p) => s + db.num(p.unitPrice) * db.num(p.quantity), 0)),
      qty: db.r2(items.reduce((s, p) => s + db.num(p.quantity), 0)),
      crates: db.r2(items.reduce((s, p) => s + db.num(p.qtyCrate), 0)),
      nw: fmt.fmtMoney(items.reduce((s, p) => s + db.num(p.nw), 0)),
      gw: fmt.fmtMoney(items.reduce((s, p) => s + db.num(p.gw), 0)),
      volume: fmt.fmtMoney(items.reduce((s, p) => s + db.num(p.volume), 0))
    };
    this.setData({ items, totals });
  },

  save() {
    const f = this.data.form;
    if (!f.shipmentNo.trim()) { wx.showToast({ title: '请填写运编号', icon: 'none' }); return; }
    if (!f.consignee.trim()) { wx.showToast({ title: '请填写收货人', icon: 'none' }); return; }
    const valid = this.data.items.filter(p => p.description || p.orderNo || p.hsCode);
    if (valid.length === 0) { wx.showToast({ title: '请至少填写一行货物', icon: 'none' }); return; }

    const rec = db.saveCustoms(f, valid, this.data.editId || undefined);
    this.setData({ modal: false, editId: '' });
    this.renderList();
    // 正在预览该单据时同步刷新
    if (this.data.doc && this.data.doc.id === rec.id) this.buildDoc(rec.id);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  /* ---------------- 单据预览 ---------------- */

  viewDoc(e) {
    this.setData({ mode: 'doc', docTab: 0 });
    this.buildDoc(e.currentTarget.dataset.id);
  },

  backList() { this.setData({ mode: 'list', doc: null }); },
  onDocTab(e) { this.setData({ docTab: +e.currentTarget.dataset.i, pdfReady: false }); },

  buildDoc(id) {
    const r = db.data.customsRecords.find(x => String(x.id) === String(id));
    if (!r) { this.setData({ doc: null }); return; }
    const doc = {
      id: r.id,
      shipmentNo: r.shipmentNo,
      departureDate: fmt.fmtDate(r.departureDate),
      shipper: r.shipper, seller: r.seller, consignee: r.consignee,
      terms: r.terms, shippingMode: r.shippingMode, currency: r.currency,
      vessel: r.vessel, pol: r.pol, pod: r.pod, destination: r.destination,
      tradeType: r.tradeType, paymentMode: r.paymentMode, boundaryPort: r.boundaryPort,
      billNo: r.billNo, contractNo: r.contractNo, packing: r.packing,
      marks: r.marks, remarks: r.remarks,
      totalAmount: fmt.fmtMoney(r.totalAmount),
      totalQty: r.totalQty, totalCrates: r.totalCrates,
      totalNw: fmt.fmtMoney(r.totalNw), totalGw: fmt.fmtMoney(r.totalGw),
      totalVolume: fmt.fmtMoney(r.totalVolume),
      items: (r.items || []).map((p, i) => ({
        rid: 'p' + i,
        orderNo: p.orderNo, hsCode: p.hsCode,
        desc: p.description + (p.spec ? '\n' + p.spec : ''),
        desc2: (p.description || '-') + (p.spec ? ' / ' + p.spec : ''),
        unit: p.unit, qtyCrate: p.qtyCrate, quantity: p.quantity,
        unitPrice: fmt.fmtMoney(p.unitPrice), amount: fmt.fmtMoney(p.amount),
        nw: fmt.fmtMoney(p.nw), gw: fmt.fmtMoney(p.gw), volume: fmt.fmtMoney(p.volume)
      }))
    };
    this.setData({ doc, pdfReady: false });
  },

  buildPDF() {
    const d = this.data.doc;
    if (!d) return;
    const t = this.data.docTab;
    // 将单据数据映射到渲染器所需格式
    const docData = {
      invoiceNo: d.shipmentNo,
      invoiceDate: d.departureDate,
      seller: d.shipper || d.seller || '',
      buyer: d.consignee || '',
      tradeTerms: d.terms || '',
      loadingPort: d.pol || '',
      deliveryPort: d.pod || '',
      originCountry: d.destination || '',
      vessel: d.vessel || '',
      shipmentNo: d.shipmentNo || '',
      bolNo: d.billNo || '',
      supervisionMode: d.tradeType || '',
      settlementMode: d.paymentMode || '',
      exitCustoms: d.boundaryPort || '',
      shipper: d.shipper || '',
      consignee: d.consignee || '',
      marks: d.marks || '',
      items: (d.items || []).map(p => ({
        description: p.desc2 ? p.desc2.split(' / ')[0] : '',
        spec: p.desc2 && p.desc2.indexOf(' / ') > -1 ? p.desc2.split(' / ')[1] : '',
        hsCode: p.hsCode || '',
        cartons: p.qtyCrate || '',
        quantity: p.quantity || '',
        unit: p.unit || '',
        unitPrice: p.unitPrice || '',
        amount: p.amount || '',
        netWeight: p.nw || '',
        grossWeight: p.gw || '',
        volume: p.volume || ''
      }))
    };

    var renderFn, fileName;
    if (t === 0) {
      renderFn = docRenderers.renderInvoice;
      fileName = '商业发票_' + d.shipmentNo;
    } else if (t === 1) {
      renderFn = docRenderers.renderPackingList;
      fileName = '装箱单_' + d.shipmentNo;
    } else {
      renderFn = docRenderers.renderCustoms;
      fileName = '报关明细_' + d.shipmentNo;
    }

    pdfShare.buildFile(renderFn, docData, fileName, 'portrait', (ok, filePath) => {
      if (ok) {
        this.setData({ pdfReady: true, pdfPath: filePath });
        wx.showToast({ title: 'PDF已生成，请发送', icon: 'success' });
      }
    });
  },

  // 必须由“发送给微信好友”按钮直接 tap 触发
  onShareFile() {
    pdfShare.sharePrepared(this.data.pdfPath, null);
  }
});
