const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const TABS = [
  { key: 'pending', name: '待确认到货' },
  { key: 'receipt', name: '收货记录' },
  { key: 'diff', name: '数量差异' },
  { key: 'return', name: '退货记录' },
  { key: 'inventory', name: '库存统计' }
];

function emptyReceipt() {
  return { id: '', receiptNumber: '', contractNumber: '', product: '', quantity: '', receiptDate: fmt.today(), person: '', remark: '' };
}
function emptyReturn() {
  return { id: '', returnNumber: '', contractNumber: '', product: '', quantity: '', returnDate: fmt.today(), reason: '' };
}

Page({
  data: {
    ready: false, denied: false, canWrite: false,

    tabs: TABS, tabIdx: 0, tab: 'pending',
    kw: '',

    pendingList: [], receiptList: [], diffList: [], returnList: [], inventoryList: [],
    stat: { pending: 0, receipt: 0, diff: 0, ret: 0, balance: 0 },

    // 确认到货
    cf: null,
    // 收货记录表单
    rcModal: false, rcEditId: '', rc: emptyReceipt(),
    rcContractOptions: ['请选择合同'], rcContractIdx: 0,
    rcProductOptions: ['请选择产品'], rcProductIdx: 0,
    // 退货表单
    rtModal: false, rtEditId: '', rt: emptyReturn(),
    rtContractOptions: ['请选择合同'], rtContractIdx: 0,
    rtProductOptions: ['请选择产品'], rtProductIdx: 0,

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('receive')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true, canWrite: db.Session.canWrite('receive') });
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

  onTab(e) {
    const i = +e.currentTarget.dataset.i;
    this.setData({ tabIdx: i, tab: TABS[i].key });
    this.render();
  },
  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },

  matchKw(parts) {
    const kw = String(this.data.kw || '').trim().toLowerCase();
    if (!kw) return true;
    return parts.join(' ').toLowerCase().indexOf(kw) >= 0;
  },

  /* ==================== 渲染 ==================== */

  render() {
    const tab = this.data.tab;

    // 待确认到货
    const pendingList = db.pendingShips().map(r => {
      const done = db.confirmedQtyOfShip(r);
      return {
        id: r.id, shipNumber: r.shipNumber, contractNumber: r.contractNumber,
        supplier: r.supplier, product: r.product,
        quantity: db.num(r.quantity), done: db.r2(done),
        remain: db.r2(db.num(r.quantity) - done),
        shipDate: fmt.fmtDate(r.shipDate),
        status: db.deriveShipStatus(r), statusClass: db.shipStatusBadge(db.deriveShipStatus(r)),
        isNew: !r.supplierReadAt && db.deriveShipStatus(r) === db.SHIP_PENDING
      };
    }).filter(r => this.matchKw([r.shipNumber, r.contractNumber, r.supplier, r.product]));

    // 收货记录
    const receiptList = db.list('receipts').map(r => ({
      id: r.id, receiptNumber: r.receiptNumber, contractNumber: r.contractNumber,
      supplier: r.supplier, product: r.product, quantity: db.num(r.quantity),
      receiptDate: fmt.fmtDate(r.receiptDate), person: r.person || '', remark: r.remark || '',
      shipNumber: r.shipNumber || '',
      sourceText: r.source === 'ship-confirm' ? '确认到货' : r.source === 'manual-import' ? '导入登记' : '手工登记',
      status: r.status || db.RECV_CONFIRMED
    })).sort((a, b) => String(b.receiptDate).localeCompare(String(a.receiptDate)))
      .filter(r => this.matchKw([r.receiptNumber, r.contractNumber, r.supplier, r.product, r.person]));

    // 数量差异
    const diffList = db.quantityDiffs().filter(r => this.matchKw([r.contractNumber, r.supplier, r.product]));

    // 退货记录
    const returnList = db.list('returns').map(r => ({
      id: r.id, returnNumber: r.returnNumber, contractNumber: r.contractNumber,
      supplier: r.supplier, product: r.product, quantity: db.num(r.quantity),
      returnDate: fmt.fmtDate(r.returnDate), reason: r.reason || ''
    })).sort((a, b) => String(b.returnDate).localeCompare(String(a.returnDate)))
      .filter(r => this.matchKw([r.returnNumber, r.contractNumber, r.supplier, r.product, r.reason]));

    // 库存统计
    const inventoryList = db.inventoryRows().filter(r => this.matchKw([r.contractNumber, r.supplier, r.product]));

    const stat = {
      pending: db.pendingShips().length,
      receipt: db.list('receipts').length,
      diff: db.quantityDiffs().length,
      ret: db.list('returns').length,
      balance: db.r2(inventoryList.reduce((s, r) => s + r.balance, 0))
    };

    this.setData({
      pendingList: pendingList, receiptList: receiptList, diffList: diffList,
      returnList: returnList, inventoryList: inventoryList, stat: stat
    });
  },

  /* ==================== 确认到货 ==================== */

  openConfirm(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法确认到货', icon: 'none' }); return; }
    const r = db.list('shipments').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const done = db.confirmedQtyOfShip(r);
    this.setData({
      cf: {
        shipId: r.id, shipNumber: r.shipNumber, contractNumber: r.contractNumber,
        supplier: r.supplier, product: r.product,
        shipQty: db.num(r.quantity), done: db.r2(done),
        remain: db.r2(db.num(r.quantity) - done),
        qty: String(db.r2(Math.max(0, db.num(r.quantity) - done))), // 默认填待收数量，可改
        date: fmt.today(), person: '', remark: ''
      }
    });
  },
  cfField(e) { this.setData({ ['cf.' + e.currentTarget.dataset.k]: e.detail.value }); },
  cfDate(e) { this.setData({ 'cf.date': e.detail.value }); },
  closeConfirm() { this.setData({ cf: null }); },

  saveConfirm() {
    const cf = this.data.cf;
    if (!cf) return;
    if (!(db.num(cf.qty) > 0)) { wx.showToast({ title: '请填写本次实收数量', icon: 'none' }); return; }
    const res = db.confirmShipReceive(cf.shipId, {
      quantity: cf.qty, receiptDate: cf.date, person: cf.person, remark: cf.remark
    });
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    this.setData({ cf: null });
    this.render();
    wx.showToast({ title: '已确认到货', icon: 'success' });

    if (res.askAdjust) {
      wx.showModal({
        title: '实收超出合同',
        content: '实收合计 ' + res.receivedTotal + '，合同数量 ' + res.orderedQty + '。\n是否按实收调整合同数量？',
        confirmText: '调整合同', cancelText: '暂不调整',
        success: r => {
          if (!r.confirm) return;
          const ar = db.adjustOrderProduct(res.orderId, cf.product);
          if (!ar.ok) { wx.showToast({ title: ar.msg, icon: 'none' }); return; }
          wx.showToast({ title: '合同数量已按实收调整', icon: 'none' });
          this.render();
        }
      });
    }
  },

  /* ==================== 按实收调整合同（数量差异页） ==================== */

  adjustFromDiff(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读', icon: 'none' }); return; }
    const d = this.data.diffList.find(x => x.id === e.currentTarget.dataset.id);
    if (!d) return;
    const o = db.orderByNo(d.contractNumber);
    if (!o) { wx.showToast({ title: '合同不存在', icon: 'none' }); return; }
    wx.showModal({
      title: '按实收调整合同',
      content: '合同 ' + d.contractNumber + ' · ' + d.product + '\n数量 ' + d.ordered + ' → ' + d.received +
        '（退货 ' + d.returned + ' 冲减后净收 ' + db.r2(d.received - d.returned) + '）\n金额将按 单价 × 新数量 重算。',
      confirmText: '确认调整',
      success: r => {
        if (!r.confirm) return;
        const ar = db.adjustOrderProduct(o.id, d.product);
        if (!ar.ok) { wx.showToast({ title: ar.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已按实收调整', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 收货记录：手工登记 / 编辑 / 删除 ==================== */

  openReceiptAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法登记', icon: 'none' }); return; }
    const rc = emptyReceipt();
    rc.receiptNumber = db.nextReceiptNo();
    this.setData({
      rcModal: true, rcEditId: '', rc: rc,
      rcContractOptions: ['请选择合同'].concat(db.list('orders').map(o => o.contractNumber)),
      rcContractIdx: 0, rcProductOptions: ['请选择产品'], rcProductIdx: 0
    });
  },
  editReceipt(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const r = db.list('receipts').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const opts = ['请选择合同'].concat(db.list('orders').map(o => o.contractNumber));
    let ci = opts.indexOf(r.contractNumber); if (ci < 0) ci = 0;
    const popts = ['请选择产品'].concat(this.productsOf(r.contractNumber));
    let pi = popts.indexOf(r.product); if (pi < 0) pi = 0;
    this.setData({
      rcModal: true, rcEditId: String(r.id),
      rc: {
        id: r.id, receiptNumber: r.receiptNumber || '', contractNumber: r.contractNumber || '',
        product: r.product || '', quantity: r.quantity === undefined ? '' : String(r.quantity),
        receiptDate: fmt.fmtDate(r.receiptDate), person: r.person || '', remark: r.remark || ''
      },
      rcContractOptions: opts, rcContractIdx: ci,
      rcProductOptions: popts, rcProductIdx: pi
    });
  },
  rcContract(e) {
    const i = +e.detail.value;
    const cno = this.data.rcContractOptions[i] || '';
    this.setData({
      rcContractIdx: i, 'rc.contractNumber': i > 0 ? cno : '',
      rcProductOptions: ['请选择产品'].concat(this.productsOf(cno)), rcProductIdx: 0, 'rc.product': ''
    });
  },
  rcProduct(e) {
    const i = +e.detail.value;
    this.setData({ rcProductIdx: i, 'rc.product': i > 0 ? this.data.rcProductOptions[i] : '' });
  },
  rcField(e) { this.setData({ ['rc.' + e.currentTarget.dataset.k]: e.detail.value }); },
  rcDate(e) { this.setData({ 'rc.receiptDate': e.detail.value }); },
  closeReceipt() { this.setData({ rcModal: false }); },

  saveReceipt() {
    const rc = this.data.rc;
    if (!rc.contractNumber) { wx.showToast({ title: '请选择合同', icon: 'none' }); return; }
    if (!rc.product) { wx.showToast({ title: '请选择产品', icon: 'none' }); return; }
    if (!(db.num(rc.quantity) > 0)) { wx.showToast({ title: '请填写实收数量', icon: 'none' }); return; }
    const o = db.orderByNo(rc.contractNumber);
    const res = db.saveReceipt({
      id: this.data.rcEditId || '',
      receiptNumber: rc.receiptNumber, contractNumber: rc.contractNumber,
      supplier: o ? o.supplier : '', product: rc.product, quantity: rc.quantity,
      receiptDate: rc.receiptDate, person: rc.person, remark: rc.remark,
      company: o ? o.company : db.writeCompany(),
      status: db.RECV_CONFIRMED, source: ''
    });
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    wx.showToast({ title: this.data.rcEditId ? '收货记录已更新' : '已登记收货', icon: 'success' });
    this.setData({ rcModal: false });
    this.render();
  },

  delReceipt(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const r = db.list('receipts').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const fromShip = r.source === 'ship-confirm';
    wx.showModal({
      title: '确认删除',
      content: '确认删除收货记录 ' + r.receiptNumber + '？' +
        (fromShip ? '\n该记录由「确认到货」生成，删除后对应发货单会回到待确认列表。' : ''),
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteReceipt(r.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  /* ==================== 退货 ==================== */

  openReturnAdd() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法登记退货', icon: 'none' }); return; }
    const rt = emptyReturn();
    rt.returnNumber = db.nextReturnNo();
    this.setData({
      rtModal: true, rtEditId: '', rt: rt,
      rtContractOptions: ['请选择合同'].concat(db.list('orders').map(o => o.contractNumber)),
      rtContractIdx: 0, rtProductOptions: ['请选择产品'], rtProductIdx: 0
    });
  },
  editReturn(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法编辑', icon: 'none' }); return; }
    const r = db.list('returns').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    const opts = ['请选择合同'].concat(db.list('orders').map(o => o.contractNumber));
    let ci = opts.indexOf(r.contractNumber); if (ci < 0) ci = 0;
    const popts = ['请选择产品'].concat(this.productsOf(r.contractNumber));
    let pi = popts.indexOf(r.product); if (pi < 0) pi = 0;
    this.setData({
      rtModal: true, rtEditId: String(r.id),
      rt: {
        id: r.id, returnNumber: r.returnNumber || '', contractNumber: r.contractNumber || '',
        product: r.product || '', quantity: r.quantity === undefined ? '' : String(r.quantity),
        returnDate: fmt.fmtDate(r.returnDate), reason: r.reason || ''
      },
      rtContractOptions: opts, rtContractIdx: ci,
      rtProductOptions: popts, rtProductIdx: pi
    });
  },
  rtContract(e) {
    const i = +e.detail.value;
    const cno = this.data.rtContractOptions[i] || '';
    this.setData({
      rtContractIdx: i, 'rt.contractNumber': i > 0 ? cno : '',
      rtProductOptions: ['请选择产品'].concat(this.productsOf(cno)), rtProductIdx: 0, 'rt.product': ''
    });
  },
  rtProduct(e) {
    const i = +e.detail.value;
    this.setData({ rtProductIdx: i, 'rt.product': i > 0 ? this.data.rtProductOptions[i] : '' });
  },
  rtField(e) { this.setData({ ['rt.' + e.currentTarget.dataset.k]: e.detail.value }); },
  rtDate(e) { this.setData({ 'rt.returnDate': e.detail.value }); },
  closeReturn() { this.setData({ rtModal: false }); },

  saveReturn() {
    const rt = this.data.rt;
    if (!rt.contractNumber) { wx.showToast({ title: '请选择合同', icon: 'none' }); return; }
    if (!rt.product) { wx.showToast({ title: '请选择产品', icon: 'none' }); return; }
    if (!(db.num(rt.quantity) > 0)) { wx.showToast({ title: '请填写退货数量', icon: 'none' }); return; }
    const o = db.orderByNo(rt.contractNumber);
    const res = db.saveReturn({
      id: this.data.rtEditId || '',
      returnNumber: rt.returnNumber, contractNumber: rt.contractNumber,
      supplier: o ? o.supplier : '', product: rt.product, quantity: rt.quantity,
      returnDate: rt.returnDate, reason: rt.reason,
      company: o ? o.company : db.writeCompany()
    });
    if (!res.ok) { wx.showToast({ title: res.msg, icon: 'none' }); return; }
    wx.showToast({ title: this.data.rtEditId ? '退货记录已更新' : '已登记退货', icon: 'success' });
    this.setData({ rtModal: false });
    this.render();
  },

  delReturn(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    const r = db.list('returns').find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!r) return;
    wx.showModal({
      title: '确认删除',
      content: '确认删除退货记录 ' + r.returnNumber + '？',
      confirmText: '删除', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteReturn(r.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  productsOf(cno) {
    const o = db.orderByNo(cno);
    return o ? db.orderProducts(o).map(p => p.name).filter(Boolean) : [];
  },

  /* ==================== 导入 / 导出 / 清空 ==================== */

  exportCSV() {
    const tab = this.data.tab;
    let headers, rows, name;
    if (tab === 'pending') {
      headers = ['发货单号', '合同号', '供应商', '产品', '发货数量', '已确认', '待收', '状态', '发货日期'];
      rows = this.data.pendingList.map(r => [r.shipNumber, r.contractNumber, r.supplier, r.product, r.quantity, r.done, r.remain, r.status, r.shipDate]);
      name = '待确认到货';
    } else if (tab === 'receipt') {
      headers = ['收货单号', '合同号', '供应商', '产品', '实收数量', '收货日期', '收货人', '来源', '备注'];
      rows = this.data.receiptList.map(r => [r.receiptNumber, r.contractNumber, r.supplier, r.product, r.quantity, r.receiptDate, r.person, r.sourceText, r.remark]);
      name = '收货记录';
    } else if (tab === 'diff') {
      headers = ['合同号', '供应商', '产品', '合同数量', '实收合计', '退货', '差异', '差异类型'];
      rows = this.data.diffList.map(r => [r.contractNumber, r.supplier, r.product, r.ordered, r.received, r.returned, r.diff, r.type]);
      name = '数量差异';
    } else if (tab === 'return') {
      headers = ['退货单号', '合同号', '供应商', '产品', '退货数量', '退货日期', '退货原因'];
      rows = this.data.returnList.map(r => [r.returnNumber, r.contractNumber, r.supplier, r.product, r.quantity, r.returnDate, r.reason]);
      name = '退货记录';
    } else {
      headers = ['合同号', '供应商', '产品', '单位', '合同数量', '已收货', '已退货', '结存', '收货进度%'];
      rows = this.data.inventoryList.map(r => [r.contractNumber, r.supplier, r.product, r.unit, r.ordered, r.received, r.returned, r.balance, r.progress]);
      name = '库存统计';
    }
    if (!rows.length) { wx.showToast({ title: '当前页签没有数据', icon: 'none' }); return; }
    csv.exportFile(name + '_' + fmt.today() + '.csv', csv.toCSV([headers].concat(rows)));
  },

  importReceiptCSV() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法导入', icon: 'none' }); return; }
    csv.chooseCSV(rows => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const head = rows[0].map(h => String(h).trim());
      const col = names => { for (let i = 0; i < names.length; i++) { const k = head.findIndex(h => h.indexOf(names[i]) > -1); if (k > -1) return k; } return -1; };
      const C = {
        contractNumber: col(['合同号']), product: col(['产品']), quantity: col(['实收数量', '数量']),
        receiptDate: col(['收货日期']), person: col(['收货人']), remark: col(['备注'])
      };
      if (C.contractNumber < 0 || C.product < 0) {
        wx.showToast({ title: '表头缺少「合同号 / 产品」列', icon: 'none' });
        return;
      }
      const g = (r, k) => C[k] >= 0 ? String(r[C[k]] == null ? '' : r[C[k]]).trim() : '';
      const exist = {};
      db.all('receipts').forEach(r => {
        exist[r.company + '|' + r.contractNumber + '|' + r.product + '|' + db.num(r.quantity) + '|' + (r.receiptDate || '')] = 1;
      });
      const recs = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const cno = g(r, 'contractNumber'), prod = g(r, 'product');
        if (!cno || !prod) continue;
        const o = db.orderByNo(cno);
        const qty = db.num(g(r, 'quantity'));
        const receiptDate = csv.parseCellDate(g(r, 'receiptDate'));
        const company = o ? o.company : db.writeCompany();
        if (exist[company + '|' + cno + '|' + prod + '|' + qty + '|' + (receiptDate || '')]) continue;
        recs.push({
          id: '', receiptNumber: db.nextReceiptNo(), contractNumber: cno,
          supplier: o ? o.supplier : '', product: prod, quantity: qty,
          receiptDate: receiptDate, person: g(r, 'person'), remark: g(r, 'remark'),
          company: company, status: db.RECV_CONFIRMED, source: 'manual-import'
        });
      }
      if (!recs.length) { wx.showToast({ title: '没有新数据可导入', icon: 'none' }); return; }
      wx.showModal({
        title: '导入确认',
        content: '解析到 ' + recs.length + ' 条新收货记录，确认导入？（来源标记为「导入登记」）',
        success: res => {
          if (!res.confirm) return;
          let ok = 0;
          recs.forEach(r => { if (db.saveReceipt(r).ok) ok++; });
          wx.showToast({ title: '已导入 ' + ok + ' 条', icon: 'none' });
          this.render();
        }
      });
    });
  },

  clearReceipts() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.list('receipts').length;
    if (!n) { wx.showToast({ title: '当前范围没有收货记录', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 清空收货记录',
      content: '将清空当前公司主体的 ' + n + ' 条收货记录（发货单状态随之回到待确认），此操作不可恢复！',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const r = db.clearColl('receipts');
        if (!r.ok) { wx.showToast({ title: r.msg, icon: 'none' }); return; }
        wx.showToast({ title: '已清空 ' + n + ' 条', icon: 'none' });
        this.render();
      }
    });
  },

  noop() {}
});
