const db = require('../../../utils/wage-db');
const fmt = require('../../../utils/format');

let ridCounter = 0;
function newRow() {
  return { rid: 'r' + (++ridCounter), process: '', price: '', qty: '', over: '0.00', total: '0.00', orderInfo: '', note: '', orderId: '', drawingNo: '', spec: '', orderQty: '' };
}

function findProc(name) {
  return db.data.processes.find(p => p.name === name);
}

/** 计算一行金额：超额计价规则与 Web 版一致 */
function calcRow(row) {
  const proc = findProc(row.process);
  const price = proc ? (+proc.unitPrice || 0) : 0;
  const qty = parseFloat(row.qty) || 0;
  const quota = proc ? (+proc.dailyQuota || 0) : 0;
  const overPrice = proc ? (+proc.overPrice || 0) : 0;
  let over = 0, total;
  if (quota > 0 && overPrice > 0 && qty > quota) {
    over = (qty - quota) * overPrice;
    total = price * quota + over;
  } else {
    total = price * qty;
  }
  row.price = fmt.fmtMoney(price);
  row.over = fmt.fmtMoney(over);
  row.total = fmt.fmtMoney(total);
  return row;
}

Page({
  data: {
    date: fmt.today(),
    empNames: [], empIndex: 0, employee: '',
    procNames: [],
    defaultOrderInfo: '',
    defPick: {},
    rows: [],
    grandTotal: '0.00',
    todayRecords: [],
    todayInfo: '',
    // 订单选择弹层
    showOrderSheet: false, orderKw: '', orderCandidates: [],
    // 工序筛选弹层
    showProcSheet: false, procKw: '', procCandidates: [],
    // 订单信息即时匹配（'def' = 公共订单信息，数字 = 对应行）
    sugs: [], sugFor: null,
    __syncState: 'idle'
  },

  onLoad(options) {
    // 支持从汇总页跳转编辑：/pages/entry/entry?edit=<id>
    if (options && options.edit) this.setData({ pendingEditId: options.edit });
  },

  onShow() {
    const supa = require('../../../utils/cloudbase');
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    const emps = db.data.employees.filter(e => !e.leaveDate || !String(e.leaveDate).trim());
    const empNames = emps.map(e => e.name);
    const procNames = db.data.processes.map(p => p.name);
    let employee = this.data.employee;
    let empIndex = this.data.empIndex;
    if (employee && empNames.indexOf(employee) === -1) { employee = ''; empIndex = 0; }
    this.setData({ empNames: empNames, procNames: procNames, employee: employee, empIndex: empIndex });
    this.refreshToday();
    const editId = this.data.pendingEditId;
    if (editId) {
      this.setData({ pendingEditId: '' });
      const r = db.data.records.find(x => x.id === editId);
      if (r) {
        const row = newRow();
        row.process = r.process;
        row.qty = String(r.quantity);
        calcRow(row);
        row.orderInfo = [r.customer, r.orderNo].filter(Boolean).join(',');
        row.note = r.notes || '';
        row.drawingNo = r.drawingNo || '';
        row.spec = r.spec || '';
        this.setData({ rows: [row], editId: editId, defaultOrderInfo: row.orderInfo, defPick: { drawingNo: row.drawingNo, spec: row.spec }, date: r.date, employee: r.employee, empIndex: Math.max(0, empNames.indexOf(r.employee)) });
        this.updateGrandTotal();
        this.refreshToday();
      }
    }
  },

  onDateChange(e) { this.setData({ date: e.detail.value }); this.refreshToday(); },
  onEmpChange(e) {
    const i = +e.detail.value;
    this.setData({ empIndex: i, employee: this.data.empNames[i] || '' });
    this.refreshToday();
  },
  // 手工改公共订单信息时，清除已选订单的关联信息
  // 手工改公共订单信息：清除已选订单关联，并给出即时匹配
  onDefOrderInput(e) {
    const v = e.detail.value;
    this.setData({ defaultOrderInfo: v, defPick: {}, sugFor: 'def' });
    this.updateOrderSugs(v);
  },

  /* 订单信息即时匹配：与网页版一致，输入即提示"客户,订单号 + 详情行" */
  updateOrderSugs(text) {
    const k = (text || '').toLowerCase().trim();
    if (!k) { this.setData({ sugs: [] }); return; }
    const sugs = this.buildOrderCandidates()
      .filter(o => [o.customer, o.orderNo, o.drawingNo, o.spec, o.type].join(' ').toLowerCase().indexOf(k) >= 0)
      .slice(0, 6)
      .map(o => ({
        id: o.id,
        title: [o.customer, o.orderNo].filter(Boolean).join(','),
        sub: [o.customer, o.orderNo, o.type, o.drawingNo, o.qty ? '订单量 ' + o.qty : ''].filter(Boolean).join(' ｜ '),
        orderId: o.id, drawingNo: o.drawingNo || '', spec: o.spec || '', qty: o.qty || ''
      }));
    this.setData({ sugs });
  },

  onPickOrderSug(e) {
    const s = this.data.sugs[+e.currentTarget.dataset.idx];
    if (!s) return;
    const extras = { orderId: s.orderId, drawingNo: s.drawingNo, spec: s.spec, orderQty: s.qty };
    if (this.data.sugFor === 'def') {
      this.setData({ defaultOrderInfo: s.title, defPick: extras, sugs: [], sugFor: null });
    } else {
      const idx = this.data.sugFor;
      if (idx === null || idx === undefined) return;
      const rows = this.data.rows.slice();
      rows[idx] = Object.assign({}, rows[idx], { orderInfo: s.title }, extras);
      this.setData({ rows: rows, sugs: [], sugFor: null });
    }
  },

  addRow() {
    const rows = this.data.rows.concat([newRow()]);
    this.setData({ rows: rows });
  },

  delRow(e) {
    const idx = e.currentTarget.dataset.idx;
    const rows = this.data.rows.slice();
    rows.splice(idx, 1);
    this.setData({ rows: rows.length ? rows : [newRow()] });
    this.updateGrandTotal();
  },

  onProcPick(e) {
    const idx = +e.currentTarget.dataset.idx;
    // <picker mode="selector"> 的 bindchange 返回的是选中项下标，需用下标到 procNames 取工序名
    const i = +e.detail.value;
    const name = this.data.procNames[i] || '';
    const rows = this.data.rows.slice();
    rows[idx] = calcRow(Object.assign({}, rows[idx], { process: name }));
    this.setData({ rows: rows });
    this.updateGrandTotal();
  },

  onQtyInput(e) {
    const idx = +e.currentTarget.dataset.idx;
    const rows = this.data.rows.slice();
    rows[idx] = calcRow(Object.assign({}, rows[idx], { qty: e.detail.value }));
    this.setData({ rows: rows });
    this.updateGrandTotal();
  },

  onRowOrderInput(e) {
    const idx = +e.currentTarget.dataset.idx;
    const rows = this.data.rows.slice();
    // 手工修改即解除与订单的关联，同时给出即时匹配
    rows[idx] = Object.assign({}, rows[idx], { orderInfo: e.detail.value, orderId: '', drawingNo: '', spec: '', orderQty: '' });
    this.setData({ rows: rows, sugFor: idx });
    this.updateOrderSugs(e.detail.value);
  },

  onNoteInput(e) {
    const idx = +e.currentTarget.dataset.idx;
    const rows = this.data.rows.slice();
    rows[idx] = Object.assign({}, rows[idx], { note: e.detail.value });
    this.setData({ rows: rows });
  },

  syncDefaults() {
    const info = this.data.defaultOrderInfo;
    if (!info) { wx.showToast({ title: '请先填写订单信息', icon: 'none' }); return; }
    const rows = this.data.rows.map(r => {
      if (r.orderInfo) return r;
      return Object.assign({}, r, {
        orderInfo: info,
        orderId: this.data.defPick.orderId || '',
        drawingNo: this.data.defPick.drawingNo || '',
        spec: this.data.defPick.spec || '',
        orderQty: this.data.defPick.orderQty || ''
      });
    });
    this.setData({ rows: rows });
    wx.showToast({ title: '已同步至空白行', icon: 'success' });
  },

  /* ============ 订单选择（仅 待生产 / 生产中） ============ */

  buildOrderCandidates() {
    return db.data.orders
      .filter(o => {
        const st = db.getOrderStatus(o);
        return st === '待生产' || st === '生产中';
      })
      .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
      .map(o => ({
        id: o.id, customer: o.customer, orderNo: o.orderNo, type: o.type,
        drawingNo: o.drawingNo, spec: o.spec, qty: o.qty,
        output: o.output || 0,
        stock: o.output !== undefined ? (o.output - (+o.qty || 0)) : (o.stock || 0),
        plating: o.plating, bow: o.bow, notes: o.notes,
        orderDate: o.orderDate || '', materialDate: o.materialDate || '',
        delivery: o.delivery || '', shipDate: o.shipDate || '',
        status: db.getOrderStatus(o)
      }));
  },

  filterOrders(kw) {
    const k = (kw || '').toLowerCase().trim();
    const all = this.buildOrderCandidates();
    if (!k) return all;
    return all.filter(o => [o.customer, o.orderNo, o.drawingNo, o.spec, o.type, o.notes]
      .join(' ').toLowerCase().indexOf(k) >= 0);
  },

  openOrderSheet(e) {
    // data-idx 为空 => 修改公共订单信息；有值 => 修改对应行
    this._orderTarget = e.currentTarget.dataset.idx;
    this.setData({ showOrderSheet: true, orderKw: '', orderCandidates: this.filterOrders('') });
  },

  onOrderKw(e) {
    const kw = e.detail.value;
    this.setData({ orderKw: kw, orderCandidates: this.filterOrders(kw) });
  },

  closeOrderSheet() { this.setData({ showOrderSheet: false, sugs: [], sugFor: null }); },

  onPickOrder(e) {
    const o = this.data.orderCandidates[+e.currentTarget.dataset.idx];
    if (!o) return;
    const info = [o.customer, o.orderNo].filter(Boolean).join(',');
    const extras = { orderId: o.id, drawingNo: o.drawingNo || '', spec: o.spec || '', orderQty: o.qty || '' };
    if (this._orderTarget === undefined || this._orderTarget === '') {
      this.setData({ defaultOrderInfo: info, defPick: extras, showOrderSheet: false, orderKw: '', orderCandidates: [], sugs: [], sugFor: null });
    } else {
      const idx = +this._orderTarget;
      const rows = this.data.rows.slice();
      rows[idx] = Object.assign({}, rows[idx], { orderInfo: info }, extras);
      this.setData({ rows: rows, showOrderSheet: false, orderKw: '', orderCandidates: [], sugs: [], sugFor: null });
    }
    this._orderTarget = undefined;
  },

  /* ============ 工序筛选（关键词过滤 + 列表点选） ============ */

  filterProcs(kw) {
    const k = (kw || '').toLowerCase().trim();
    return db.data.processes
      .filter(p => !k || (p.name || '').toLowerCase().indexOf(k) >= 0)
      .map(p => ({ name: p.name, priceText: fmt.fmtMoney(p.unitPrice), quota: p.dailyQuota || 0 }));
  },

  openProcSheet(e) {
    this._procIdx = +e.currentTarget.dataset.idx;
    this.setData({ showProcSheet: true, procKw: '', procCandidates: this.filterProcs('') });
  },

  onProcKw(e) {
    const kw = e.detail.value;
    this.setData({ procKw: kw, procCandidates: this.filterProcs(kw) });
  },

  closeProcSheet() { this.setData({ showProcSheet: false }); },

  onPickProc(e) {
    const p = this.data.procCandidates[+e.currentTarget.dataset.idx];
    if (!p || this._procIdx === null || this._procIdx === undefined) return;
    const idx = this._procIdx;
    const rows = this.data.rows.slice();
    rows[idx] = calcRow(Object.assign({}, rows[idx], { process: p.name }));
    this.setData({ rows: rows, showProcSheet: false, procKw: '', procCandidates: [] });
    this.updateGrandTotal();
    this._procIdx = null;
  },

  updateGrandTotal() {
    const total = this.data.rows.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    this.setData({ grandTotal: fmt.fmtMoney(total) });
  },

  saveBatch() {
    const date = this.data.date, employee = this.data.employee;
    if (!date || !employee) { wx.showToast({ title: '请填写日期和员工', icon: 'none' }); return; }
    const defInfo = this.data.defaultOrderInfo;
    const defParts = defInfo.split(',').map(s => s.trim());
    const defCust = defParts[0] || '';
    const defOrd = defParts[1] || '';
    const defPick = this.data.defPick || {};
    const editId = this.data.editId || '';
    let saved = 0;
    this.data.rows.forEach(r => {
      const proc = r.process;
      const qty = parseFloat(r.qty) || 0;
      if (!proc || !qty) return;
      const procData = findProc(proc);
      const price = procData ? (+procData.unitPrice || 0) : 0;
      const quota = procData ? (+procData.dailyQuota || 0) : 0;
      const overPrice = procData ? (+procData.overPrice || 0) : 0;
      const overSub = (quota > 0 && overPrice > 0 && qty > quota) ? (qty - quota) * overPrice : 0;
      const total = (quota > 0 && qty > quota) ? (price * quota + overSub) : (price * qty);
      const parts = (r.orderInfo || defInfo).split(',').map(s => s.trim());
      // 订单图号/规格：行内已选订单用行内的，否则回退到公共选择的订单
      const pick = (r.orderInfo && r.orderId) ? r : defPick;
      const rec = {
        date: date, employee: employee, process: proc,
        unitPrice: price, quantity: qty, totalAmount: total,
        customer: parts[0] || defCust, orderNo: parts[1] || defOrd,
        drawingNo: pick.drawingNo || '', spec: pick.spec || '',
        notes: r.note || ''
      };
      if (editId && saved === 0) { db.updateRecord(editId, rec); this.setData({ editId: '' }); }
      else db.addRecord(rec);
      saved++;
    });
    if (saved === 0) { wx.showToast({ title: '没有有效数据，请至少填写一行', icon: 'none' }); return; }
    wx.showToast({ title: '已保存 ' + saved + ' 条记录', icon: 'success' });
    this.clearBatch();
  },

  clearBatch() {
    ridCounter = 0;
    this.setData({ rows: [newRow()], grandTotal: '0.00', defaultOrderInfo: '', defPick: {}, editId: '', sugs: [], sugFor: null });
    this.refreshToday();
  },

  /** 编辑：把记录回填为单行 */
  editEntry(e) {
    const id = e.currentTarget.dataset.id;
    const r = db.data.records.find(x => x.id === id);
    if (!r) return;
    const row = newRow();
    row.process = r.process;
    row.qty = String(r.quantity);
    calcRow(row);
    row.orderInfo = [r.customer, r.orderNo].filter(Boolean).join(',');
    row.note = r.notes || '';
    row.drawingNo = r.drawingNo || '';
    row.spec = r.spec || '';
    this.setData({ rows: [row], editId: id, defaultOrderInfo: row.orderInfo, defPick: { drawingNo: row.drawingNo, spec: row.spec }, date: r.date, employee: r.employee });
    this.updateGrandTotal();
    this.refreshToday();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  deleteTodayRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确认删除此条记录？',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteRecord(id);
        wx.showToast({ title: '记录已删除', icon: 'success' });
        this.refreshToday();
      }
    });
  },

  refreshToday() {
    const date = this.data.date, emp = this.data.employee;
    if (!date || !emp) { this.setData({ todayRecords: [], todayInfo: '' }); return; }
    const recs = db.data.records
      .filter(r => r.date === date && r.employee === emp)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const total = recs.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    this.setData({
      todayRecords: recs.map(r => Object.assign({}, r, { totalAmount: fmt.fmtMoney(r.totalAmount), unitPrice: fmt.fmtMoney(r.unitPrice) })),
      todayInfo: date + ' ' + emp + '：' + recs.length + '条，合计 ' + fmt.fmtMoney(total) + ' 元'
    });
  }
});
