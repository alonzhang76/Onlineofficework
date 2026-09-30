const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const STATUS_FILTERS = ['全部状态', db.SHIP_PENDING, db.SHIP_PARTIAL, db.SHIP_CONFIRMED];

function emptyForm() {
  return {
    id: '', shipNumber: '', contractNumber: '', product: '',
    quantity: '', shipDate: fmt.today(), carrier: '', trackingNo: '', remark: ''
  };
}

Page({
  data: {
    ready: false, denied: false,
    isSupplier: false, canWrite: false, mySupplier: '',

    kw: '',
    statusOptions: STATUS_FILTERS, statusIdx: 0,
    list: [],
    stat: { all: 0, pending: 0, partial: 0, confirmed: 0 },

    modal: false, editId: '', form: emptyForm(),
    contractOptions: ['请选择合同'], contractIdx: 0,
    productOptions: ['请选择产品'], productIdx: 0,

    detail: null,
    msg: null,

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('ship')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({
      ready: true,
      isSupplier: db.Session.isSupplier(),
      canWrite: db.Session.canWrite('ship'),
      mySupplier: db.Session.mySupplier()
    });
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
    // 供应商：登录后自动提示未读的需方消息
    if (this.data.isSupplier && !this.__msgShown) {
      this.__msgShown = true;
      const unread = db.unreadShipMsgs();
      if (unread.length) this.openMsg({ currentTarget: { dataset: { id: unread[0].id } } });
    }
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); });
  },

  /* ==================== 列表 ==================== */

  render() {
    const kw = String(this.data.kw || '').trim().toLowerCase();
    const stSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';

    const rows = db.list('shipments').map(r => {
      const st = db.deriveShipStatus(r);
      const done = db.confirmedQtyOfShip(r);
      return {
        id: r.id,
        shipNumber: r.shipNumber,
        contractNumber: r.contractNumber,
        supplier: r.supplier,
        product: r.product,
        quantity: db.num(r.quantity),
        done: db.r2(done),
        diff: db.r2(db.num(r.quantity) - done),
        shipDate: fmt.fmtDate(r.shipDate),
        shipDateRaw: r.shipDate || '',
        carrier: r.carrier || '',
        trackingNo: r.trackingNo || '',
        remark: r.remark || '',
        receiveRemark: r.receiveRemark || '',
        receivedAt: r.receivedAt ? fmt.fmtDate(r.receivedAt) : '',
        supplierReadAt: r.supplierReadAt || '',
        status: st, statusClass: db.shipStatusBadge(st),
        contractTotal: (function () {
          const o = db.orderByNo(r.contractNumber);
          return o ? fmt.fmtMoney(o.totalAmount) : '';
        })()
      };
    }).filter(r => {
      if (stSel && r.status !== stSel) return false;
      if (kw) {
        const hay = [r.shipNumber, r.contractNumber, r.supplier, r.product, r.carrier, r.trackingNo, r.remark]
          .join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    }).sort((a, b) => {
      const d = String(b.shipDateRaw || '').localeCompare(String(a.shipDateRaw || ''));
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });

    const all = db.list('shipments');
    const stat = { all: all.length, pending: 0, partial: 0, confirmed: 0 };
    all.forEach(r => {
      const st = db.deriveShipStatus(r);
      if (st === db.SHIP_CONFIRMED) stat.confirmed++;
      else if (st === db.SHIP_PARTIAL) stat.partial++;
      else stat.pending++;
    });

    this.setData({ list: rows, stat: stat });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  resetFilter() { this.setData({ kw: '', statusIdx: 0 }); this.render(); },

  /* ==================== 表单 ==================== */

  openAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法登记发货', icon: 'none' }); return; }
    const form = emptyForm();
    form.shipNumber = db.nextShipNo();
    // 供应商：只能对自己合同发货
    const cos = db.list('orders');
    const opts = ['请选择合同'].concat(cos.map(o => o.contractNumber));
    // 已收齐的合同排到后面，便于优先选择待交付合同
    this.setData({
      modal: true, editId: '', form: form,
      contractOptions: opts, contractIdx: 0,
      productOptions: ['请选择产品'], productIdx: 0
    });
  },

  editItem(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const r = db.list('shipments').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const st = db.deriveShipStatus(r);
    if (this.data.isSupplier && st === db.SHIP_CONFIRMED) {
      wx.showToast({ title: '已确认到货的发货单不可修改', icon: 'none' });
      return;
    }
    const opts = ['请选择合同'].concat(db.list('orders').map(o => o.contractNumber));
    let ci = opts.indexOf(r.contractNumber);
    if (ci < 0) ci = 0;
    const prods = this.productsOf(r.contractNumber);
    const popts = ['请选择产品'].concat(prods);
    let pi = popts.indexOf(r.product);
    if (pi < 0) pi = 0;
    this.setData({
      modal: true, editId: String(r.id),
      form: {
        id: r.id, shipNumber: r.shipNumber || '', contractNumber: r.contractNumber || '',
        product: r.product || '', quantity: r.quantity === undefined ? '' : String(r.quantity),
        shipDate: fmt.fmtDate(r.shipDate), carrier: r.carrier || '',
        trackingNo: r.trackingNo || '', remark: r.remark || ''
      },
      contractOptions: opts, contractIdx: ci,
      productOptions: popts, productIdx: pi
    });
  },

  productsOf(cno) {
    const o = db.orderByNo(cno);
    return o ? db.orderProducts(o).map(p => p.name).filter(Boolean) : [];
  },

  onContract(e) {
    const i = +e.detail.value;
    const cno = this.data.contractOptions[i] || '';
    const prods = this.productsOf(cno);
    const o = db.orderByNo(cno);
    this.setData({
      contractIdx: i,
      'form.contractNumber': i > 0 ? cno : '',
      productOptions: ['请选择产品'].concat(prods),
      productIdx: 0,
      'form.product': ''
    });
    if (o && this.data.isSupplier && o.supplier !== this.data.mySupplier) {
      wx.showToast({ title: '该合同不属于当前供应商账号', icon: 'none' });
    }
  },
  onProduct(e) {
    const i = +e.detail.value;
    this.setData({ productIdx: i, 'form.product': i > 0 ? this.data.productOptions[i] : '' });
  },
  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  save() {
    const f = this.data.form;
    if (!f.contractNumber) { wx.showToast({ title: '请选择合同', icon: 'none' }); return; }
    if (!f.product) { wx.showToast({ title: '请选择产品', icon: 'none' }); return; }
    if (!(db.num(f.quantity) > 0)) { wx.showToast({ title: '请填写本次发货数量', icon: 'none' }); return; }

    const o = db.orderByNo(f.contractNumber);
    const supplier = this.data.isSupplier ? this.data.mySupplier : (o ? o.supplier : '');
    if (this.data.isSupplier && o && o.supplier !== this.data.mySupplier) {
      wx.showToast({ title: '该合同不属于当前供应商账号', icon: 'none' });
      return;
    }

    // 发货数量可超合同数量：仅提示，不阻断（与桌面端一致）
    const ordered = (function () {
      const p = db.orderProducts(o).find(x => x.name === f.product);
      return p ? db.num(p.quantity) : 0;
    })();
    const shipped = db.shippedQty(f.contractNumber, f.product);
    const willTotal = db.num(f.quantity) + (this.data.editId
      ? shipped - db.num((db.list('shipments').find(x => String(x.id) === String(this.data.editId)) || {}).quantity)
      : shipped);
    const warn = ordered > 0 && willTotal > ordered + 0.0001;

    const go = () => {
      const res = db.saveShipment({
        id: this.data.editId || '',
        shipNumber: f.shipNumber, contractNumber: f.contractNumber,
        supplier: supplier, product: f.product, quantity: f.quantity,
        shipDate: f.shipDate, carrier: f.carrier, trackingNo: f.trackingNo, remark: f.remark
      });
      if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
      wx.showToast({ title: this.data.editId ? '发货单已更新' : '发货已登记', icon: 'success' });
      this.setData({ modal: false });
      this.render();
    };

    if (warn) {
      wx.showModal({
        title: '数量超出合同',
        content: '累计发货 ' + db.r2(willTotal) + '，已超过合同数量 ' + ordered + '。仍要登记吗？',
        confirmText: '仍要登记',
        success: res => { if (res.confirm) go(); }
      });
      return;
    }
    go();
  },

  delItem(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const r = db.list('shipments').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    if (this.data.isSupplier && db.deriveShipStatus(r) === db.SHIP_CONFIRMED) {
      wx.showToast({ title: '已确认到货的发货单不可删除', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: '确认删除发货单 ' + r.shipNumber + '？关联收货记录不受影响。',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteShipment(r.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 明细 / 需方消息 ==================== */

  openDetail(e) {
    const r = db.list('shipments').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const st = db.deriveShipStatus(r);
    const done = db.confirmedQtyOfShip(r);
    const receipts = db.all('receipts')
      .filter(x => x.company === r.company && x.contractNumber === r.contractNumber &&
        x.product === r.product && x.shipNumber === r.shipNumber)
      .map(x => ({
        receiptNumber: x.receiptNumber, quantity: db.num(x.quantity),
        receiptDate: fmt.fmtDate(x.receiptDate), person: x.person || '', remark: x.remark || ''
      }));
    const o = db.orderByNo(r.contractNumber);
    this.setData({
      detail: {
        shipNumber: r.shipNumber, contractNumber: r.contractNumber, supplier: r.supplier,
        product: r.product, quantity: db.num(r.quantity), shipDate: fmt.fmtDate(r.shipDate),
        carrier: r.carrier || '', trackingNo: r.trackingNo || '', remark: r.remark || '',
        status: st, statusClass: db.shipStatusBadge(st),
        done: db.r2(done), diff: db.r2(db.num(r.quantity) - done),
        receiveRemark: r.receiveRemark || '',
        receivedAt: r.receivedAt ? fmt.fmtDate(r.receivedAt) : '',
        contractTotal: o ? fmt.fmtMoney(o.totalAmount) : '',
        receipts: receipts
      }
    });
  },
  closeDetail() { this.setData({ detail: null }); },

  openMsg(e) {
    const r = db.list('shipments').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const st = db.deriveShipStatus(r);
    const done = db.confirmedQtyOfShip(r);
    const o = db.orderByNo(r.contractNumber);
    const head = st === db.SHIP_CONFIRMED ? '需方已确认收货'
      : st === db.SHIP_PARTIAL ? '需方已确认部分到货' : '需方尚未确认到货';
    const cls = st === db.SHIP_CONFIRMED ? 'badge-green'
      : st === db.SHIP_PARTIAL ? 'badge-orange' : 'badge-gray';
    this.setData({
      msg: {
        id: r.id, shipNumber: r.shipNumber, contractNumber: r.contractNumber,
        product: r.product, shipDate: fmt.fmtDate(r.shipDate),
        quantity: db.num(r.quantity), done: db.r2(done),
        diff: db.r2(db.num(r.quantity) - done),
        head: head, cls: cls,
        receiveRemark: r.receiveRemark || '',
        contractTotal: o ? fmt.fmtMoney(o.totalAmount) : '',
        tips: st === db.SHIP_CONFIRMED
          ? '本次发货已全部收讫，无需其他操作。'
          : st === db.SHIP_PARTIAL
            ? '需方已确认收货 ' + db.r2(done) + '，尚有 ' + db.r2(Math.max(0, db.num(r.quantity) - done)) + ' 待收，请按需方要求安排后续补发。'
            : '需方正在核对，请耐心等待确认结果。'
      }
    });
  },
  closeMsg() { this.setData({ msg: null }); },
  ackMsg() {
    const m = this.data.msg;
    if (m) db.markSupplierRead(m.id);
    this.setData({ msg: null });
    wx.showToast({ title: '已标记为已读', icon: 'none' });
    this.render();
  },

  /* ==================== 导入 / 导出 / 清空 ==================== */

  exportCSV() {
    const rows = db.list('shipments');
    if (!rows.length) { wx.showToast({ title: '当前范围没有发货记录', icon: 'none' }); return; }
    const out = [['发货单号', '合同号', '供应商', '产品', '发货数量', '已确认收货', '差异', '状态', '发货日期', '物流公司', '物流单号', '备注']];
    rows.forEach(r => {
      const done = db.confirmedQtyOfShip(r);
      out.push([r.shipNumber, r.contractNumber, r.supplier, r.product, db.num(r.quantity),
        db.r2(done), db.r2(db.num(r.quantity) - done), db.deriveShipStatus(r),
        fmt.fmtDate(r.shipDate), r.carrier || '', r.trackingNo || '', r.remark || '']);
    });
    csv.exportFile('发货记录_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  importCSV() {
    if (!this.data.canWrite || this.data.isSupplier) return;
    csv.chooseCSV(rows => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const head = rows[0].map(h => String(h).trim());
      const col = names => { for (let i = 0; i < names.length; i++) { const k = head.findIndex(h => h.indexOf(names[i]) > -1); if (k > -1) return k; } return -1; };
      const C = {
        shipNumber: col(['发货单号']), contractNumber: col(['合同号']), product: col(['产品']),
        quantity: col(['发货数量', '数量']), shipDate: col(['发货日期']), carrier: col(['物流公司']),
        trackingNo: col(['物流单号']), remark: col(['备注'])
      };
      if (C.contractNumber < 0 || C.product < 0) {
        wx.showToast({ title: '表头缺少「合同号 / 产品」列', icon: 'none' });
        return;
      }
      const g = (r, k) => C[k] >= 0 ? String(r[C[k]] == null ? '' : r[C[k]]).trim() : '';
      const exist = {};
      db.all('shipments').forEach(r => {
        exist[r.company + '|' + r.contractNumber + '|' + r.product + '|' + db.num(r.quantity) + '|' + (r.shipDate || '')] = 1;
      });
      const recs = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const cno = g(r, 'contractNumber'), prod = g(r, 'product');
        if (!cno || !prod) continue;
        const o = db.orderByNo(cno);
        const qty = db.num(g(r, 'quantity'));
        const shipDate = csv.parseCellDate(g(r, 'shipDate'));
        const company = o ? o.company : db.writeCompany();
        if (exist[company + '|' + cno + '|' + prod + '|' + qty + '|' + (shipDate || '')]) continue;
        recs.push({
          id: '', shipNumber: g(r, 'shipNumber') || db.nextShipNo(),
          contractNumber: cno, supplier: o ? o.supplier : '',
          product: prod, quantity: qty, shipDate: shipDate,
          carrier: g(r, 'carrier'), trackingNo: g(r, 'trackingNo'), remark: g(r, 'remark'),
          company: company
        });
      }
      if (!recs.length) { wx.showToast({ title: '没有新数据可导入', icon: 'none' }); return; }
      wx.showModal({
        title: '导入确认',
        content: '解析到 ' + recs.length + ' 条新发货记录，确认导入？',
        success: res => {
          if (!res.confirm) return;
          let ok = 0;
          recs.forEach(r => { if (db.saveShipment(r).ok) ok++; });
          wx.showToast({ title: '已导入 ' + ok + ' 条', icon: 'none' });
          this.render();
        }
      });
    });
  },

  clearAll() {
    if (this.data.isSupplier) { wx.showToast({ title: '供应商账号不可清空发货记录', icon: 'none' }); return; }
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.list('shipments').length;
    if (!n) { wx.showToast({ title: '当前范围没有发货记录', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 清空发货记录',
      content: '将清空当前公司主体的 ' + n + ' 条发货记录，此操作不可恢复！',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const r = db.clearColl('shipments');
        if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已清空 ' + n + ' 条', icon: 'none' });
        this.render();
      }
    });
  }
});
