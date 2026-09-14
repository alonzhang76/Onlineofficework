const db = require('../../utils/db');
const fmt = require('../../utils/format');
const csv = require('../../utils/csv');

const MONTH_FIELDS = [];
for (let m = 1; m <= 12; m++) MONTH_FIELDS.push({ key: 'm' + m, label: m + '月' });

const STATUS_OPTIONS = ['全部状态', '已出货', '生产结束', '生产中', '待生产'];

function emptyForm() {
  const f = { customer: '', orderNo: '', orderDate: fmt.today(), type: '', drawingNo: '', spec: '', qty: '', plating: '', bow: '', notes: '', delivery: '', materialDate: '', packDate: '', shipDate: '' };
  for (let m = 1; m <= 12; m++) f['m' + m] = '';
  return f;
}

function calcOutput(form) {
  let output = 0;
  for (let m = 1; m <= 12; m++) output += parseInt(form['m' + m]) || 0;
  const qty = parseInt(form.qty) || 0;
  return { output: output, stock: output - qty };
}

Page({
  data: {
    keyword: '',
    custOptions: ['全部客户'], custIdx: 0,
    statusOptions: STATUS_OPTIONS, statusIdx: 0,
    list: [], sumQty: 0, sumOutput: 0,
    monthFields: MONTH_FIELDS,
    modal: false, editId: '', form: emptyForm(),
    formOutput: 0, formStock: 0, formStatus: '待生产'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 });
    this.render();
  },

  onUnload() { db.syncOrdersToCalendar(); },

  render() {
    const kw = this.data.keyword.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const statusSel = this.data.statusIdx > 0 ? STATUS_OPTIONS[this.data.statusIdx] : '';
    const list = db.data.orders
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (statusSel && db.getOrderStatus(o) !== statusSel) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.spec, o.notes, o.drawingNo, o.type, o.plating, o.bow].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
      .map(o => ({
        id: o.id, customer: o.customer, orderNo: o.orderNo, type: o.type, drawingNo: o.drawingNo,
        spec: o.spec, qty: o.qty, output: o.output || 0, stock: o.output !== undefined ? (o.output - (+o.qty || 0)) : (o.stock || 0),
        plating: o.plating, bow: o.bow, notes: o.notes,
        orderDate: fmt.fmtDate(o.orderDate), materialDate: fmt.fmtDate(o.materialDate),
        delivery: fmt.fmtDate(o.delivery), shipDate: fmt.fmtDate(o.shipDate),
        status: db.getOrderStatus(o)
      }));
    const custOptions = ['全部客户'].concat(Array.from(new Set(db.data.orders.map(o => o.customer).filter(Boolean))).sort());
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;
    this.setData({
      list,
      custOptions, custIdx,
      sumQty: list.reduce((s, o) => s + (+o.qty || 0), 0),
      sumOutput: list.reduce((s, o) => s + (o.output || 0), 0)
    });
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.render(); },
  onCustFilter(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onStatusFilter(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },

  openAdd() {
    const f = emptyForm();
    this.setData({ modal: true, editId: '', form: f, formOutput: 0, formStock: 0, formStatus: '待生产' });
  },

  editOrder(e) {
    const o = db.data.orders.find(x => x.id === e.currentTarget.dataset.id);
    if (!o) return;
    const f = emptyForm();
    Object.keys(f).forEach(k => { if (o[k] !== undefined && o[k] !== null) f[k] = String(o[k]); });
    f.orderDate = fmt.fmtDate(o.orderDate);
    f.delivery = fmt.fmtDate(o.delivery);
    f.materialDate = fmt.fmtDate(o.materialDate);
    f.packDate = fmt.fmtDate(o.packDate);
    f.shipDate = fmt.fmtDate(o.shipDate);
    const c = calcOutput(f);
    this.setData({ modal: true, editId: o.id, form: f, formOutput: c.output, formStock: c.stock, formStatus: db.getOrderStatus(f) });
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['form.' + k]: e.detail.value });
    this.recalcForm();
  },

  onDateChange(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['form.' + k]: e.detail.value });
    this.recalcForm();
  },

  recalcForm() {
    // setData 是异步渲染但 this.data.form 已同步更新（input 输入时）
    const c = calcOutput(this.data.form);
    this.setData({ formOutput: c.output, formStock: c.stock, formStatus: db.getOrderStatus(this.data.form) });
  },

  saveOrder() {
    const f = this.data.form;
    if (!f.customer.trim() || !f.orderNo.trim()) { wx.showToast({ title: '请填写客户和订单号', icon: 'none' }); return; }
    const c = calcOutput(f);
    const data = {
      customer: f.customer.trim(), orderNo: f.orderNo.trim(),
      orderDate: f.orderDate, type: f.type.trim(), drawingNo: f.drawingNo.trim(),
      spec: f.spec.trim(), qty: parseInt(f.qty) || 0,
      output: c.output, stock: c.stock,
      plating: f.plating.trim(), bow: f.bow.trim(), notes: f.notes.trim(),
      delivery: f.delivery, materialDate: f.materialDate, packDate: f.packDate, shipDate: f.shipDate
    };
    for (let m = 1; m <= 12; m++) data['m' + m] = parseInt(f['m' + m]) || 0;
    data.status = db.getOrderStatus(data);
    if (this.data.editId) { db.updateOrder(this.data.editId, data); wx.showToast({ title: '订单已更新', icon: 'success' }); }
    else { db.addOrder(data); wx.showToast({ title: '订单已添加', icon: 'success' }); }
    db.syncOrdersToCalendar();
    this.closeModal();
    this.render();
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此订单？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteOrder(id);
        db.syncOrdersToCalendar();
        wx.showToast({ title: '订单已删除', icon: 'success' });
        this.render();
      }
    });
  },

  exportCSV() {
    if (!db.data.orders.length) { wx.showToast({ title: '暂无订单数据', icon: 'none' }); return; }
    const headers = ['下单日期', '客户', '订单号', '炉架类型', '图纸号', '规格', '订单数量', '产出数量', '库存', '电镀', '蝴蝶结', '投料日期', '包装结束', '出货日期', '交期', '状态', '备注'];
    for (let m = 1; m <= 12; m++) headers.push(m + '月');
    const rows = [headers];
    db.data.orders.forEach(o => {
      const row = [fmt.fmtDate(o.orderDate), o.customer || '', o.orderNo || '', o.type || '', o.drawingNo || '', o.spec || '',
        o.qty || 0, o.output || 0, o.stock || 0, o.plating || '', o.bow || '',
        fmt.fmtDate(o.materialDate), fmt.fmtDate(o.packDate), fmt.fmtDate(o.shipDate), fmt.fmtDate(o.delivery),
        db.getOrderStatus(o), o.notes || ''];
      for (let m = 1; m <= 12; m++) row.push(o['m' + m] || 0);
      rows.push(row);
    });
    csv.exportFile('订单表_' + fmt.today() + '.csv', csv.toCSV(rows));
  },

  importCSV() {
    csv.chooseCSV((rows) => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const header = rows[0].map(h => String(h).trim());
      const rules = [
        { field: 'orderDate', test: h => /下单.*日期|订单日期|下单日/.test(h) },
        { field: 'customer', test: h => /^客户$|客户名称/.test(h) },
        { field: 'orderNo', test: h => /订单号|订单编号/.test(h) },
        { field: 'type', test: h => /炉架类型|产品类型|类型/.test(h) },
        { field: 'drawingNo', test: h => /图纸号|图号/.test(h) },
        { field: 'spec', test: h => /规格/.test(h) },
        { field: 'qty', test: h => /订单数量|订货数量|订单数/.test(h) },
        { field: 'plating', test: h => /电镀/.test(h) },
        { field: 'bow', test: h => /蝴蝶结/.test(h) },
        { field: 'notes', test: h => /备注/.test(h) },
        { field: 'shipDate', test: h => /出货日期|发货日期/.test(h) },
        { field: 'delivery', test: h => /交期|交货期/.test(h) },
        { field: 'materialDate', test: h => /投料/.test(h) },
        { field: 'packDate', test: h => /包装/.test(h) }
      ];
      for (let m = 1; m <= 12; m++) rules.push({ field: 'm' + m, test: h => h === m + '月' || h === m + '月份' });
      const colMap = {};
      let matches = 0;
      header.forEach((h, j) => {
        for (const r of rules) {
          if (r.test(h) && colMap[r.field] === undefined) { colMap[r.field] = j; matches++; break; }
        }
      });
      if (colMap.customer === undefined || colMap.orderNo === undefined) { wx.showToast({ title: '未找到"客户/订单号"列', icon: 'none' }); return; }
      const valid = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const gv = f => colMap[f] !== undefined ? r[colMap[f]] : '';
        const customer = String(gv('customer') || '').trim();
        const orderNo = String(gv('orderNo') || '').trim();
        if (!customer || !orderNo) continue;
        const data = {
          customer, orderNo,
          orderDate: csv.parseCellDate(gv('orderDate')), type: String(gv('type') || '').trim(),
          drawingNo: String(gv('drawingNo') || '').trim(), spec: String(gv('spec') || '').trim(),
          qty: parseInt(gv('qty')) || 0, stock: 0,
          plating: String(gv('plating') || '').trim(), bow: String(gv('bow') || '').trim(),
          notes: String(gv('notes') || '').trim(),
          shipDate: csv.parseCellDate(gv('shipDate')), delivery: csv.parseCellDate(gv('delivery')),
          materialDate: csv.parseCellDate(gv('materialDate')), packDate: csv.parseCellDate(gv('packDate'))
        };
        let output = 0;
        for (let m = 1; m <= 12; m++) { data['m' + m] = parseInt(gv('m' + m)) || 0; output += data['m' + m]; }
        data.output = output;
        data.stock = output - data.qty;
        data.status = db.getOrderStatus(data);
        valid.push(data);
      }
      if (!valid.length) { wx.showToast({ title: '未找到有效订单数据', icon: 'none' }); return; }
      wx.showModal({
        title: '导入方式',
        content: '将导入 ' + valid.length + ' 条订单。\n确定=覆盖，取消=追加',
        confirmText: '覆盖', cancelText: '追加',
        success: res => {
          if (res.confirm) db.data.orders = [];
          valid.forEach(o => { o.id = db.uid(); db.data.orders.push(o); });
          db.save('orders');
          db.syncOrdersToCalendar();
          wx.showToast({ title: '成功导入 ' + valid.length + ' 条', icon: 'success' });
          this.render();
        }
      });
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {}
});
