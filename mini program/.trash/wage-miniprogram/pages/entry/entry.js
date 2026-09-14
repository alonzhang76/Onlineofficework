const db = require('../../utils/db');
const fmt = require('../../utils/format');

let ridCounter = 0;
function newRow() {
  return { rid: 'r' + (++ridCounter), process: '', price: '', qty: '', over: '0.00', total: '0.00', orderInfo: '', note: '' };
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
    rows: [],
    grandTotal: '0.00',
    todayRecords: [],
    todayInfo: ''
  },

  onLoad(options) {
    // 支持从汇总页跳转编辑：/pages/entry/entry?edit=<id>
    if (options && options.edit) this.setData({ pendingEditId: options.edit });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 0 });
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
        this.setData({ rows: [row], editId: editId, defaultOrderInfo: row.orderInfo, date: r.date, employee: r.employee, empIndex: Math.max(0, empNames.indexOf(r.employee)) });
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
  onDefOrderInput(e) { this.setData({ defaultOrderInfo: e.detail.value }); },

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
    const name = e.detail.value;
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
    rows[idx] = Object.assign({}, rows[idx], { orderInfo: e.detail.value });
    this.setData({ rows: rows });
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
    const rows = this.data.rows.map(r => r.orderInfo ? r : Object.assign({}, r, { orderInfo: info }));
    this.setData({ rows: rows });
    wx.showToast({ title: '已同步至空白行', icon: 'success' });
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
      const rec = {
        date: date, employee: employee, process: proc,
        unitPrice: price, quantity: qty, totalAmount: total,
        customer: parts[0] || defCust, orderNo: parts[1] || defOrd,
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
    this.setData({ rows: [newRow()], grandTotal: '0.00', defaultOrderInfo: '', editId: '' });
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
    this.setData({ rows: [row], editId: id, defaultOrderInfo: row.orderInfo, date: r.date, employee: r.employee });
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
