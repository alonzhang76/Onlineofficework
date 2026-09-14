const db = require('../../../utils/wage-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const PAGE_SIZE = 20;

Page({
  data: {
    startDate: '', endDate: '',
    empNames: [], empIndex: 0, empFilter: '',
    processFilter: '', customerFilter: '', orderNoFilter: '',
    result: [], paged: [], resultTotal: '0.00'
  },
  pageSize: PAGE_SIZE,

  onShow() {
    const empNames = db.data.employees.map(e => e.name + (e.leaveDate && String(e.leaveDate).trim() ? '（离职）' : ''));
    const rawNames = db.data.employees.map(e => e.name);
    let empFilter = this.data.empFilter, empIndex = this.data.empIndex;
    if (empFilter && rawNames.indexOf(empFilter) === -1) { empFilter = ''; empIndex = 0; }
    this.setData({ empNames: ['全部'].concat(empNames), empFilter: empFilter, empIndex: empIndex });
    this.executeQuery();
  },

  onStartDate(e) { this.setData({ startDate: e.detail.value }); },
  onEndDate(e) { this.setData({ endDate: e.detail.value }); },
  onEmpFilter(e) {
    const i = +e.detail.value;
    const name = i === 0 ? '' : this.data.empNames[i].replace('（离职）', '');
    this.setData({ empIndex: i, empFilter: name });
  },
  onProcessInput(e) { this.setData({ processFilter: e.detail.value }); },
  onCustomerInput(e) { this.setData({ customerFilter: e.detail.value }); },
  onOrderNoInput(e) { this.setData({ orderNoFilter: e.detail.value }); },

  executeQuery() {
    const result = db.queryRecords({
      startDate: this.data.startDate, endDate: this.data.endDate,
      employee: this.data.empFilter, process: this.data.processFilter.trim(),
      customer: this.data.customerFilter.trim(), orderNo: this.data.orderNoFilter.trim()
    });
    const display = result.map(r => Object.assign({}, r, { totalAmount: fmt.fmtMoney(r.totalAmount), unitPrice: fmt.fmtMoney(r.unitPrice) }));
    const total = result.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    this.setData({ result: display, resultTotal: fmt.fmtMoney(total), paged: display.slice(0, this.pageSize) });
  },

  loadMore() {
    this.pageSize += PAGE_SIZE;
    this.setData({ paged: this.data.result.slice(0, this.pageSize) });
  },

  editRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/wage/entry/entry?edit=' + id });
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此条记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteRecord(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.executeQuery();
      }
    });
  },

  exportCSV() {
    const data = this.data.result;
    if (!data.length) { wx.showToast({ title: '无数据可导出', icon: 'none' }); return; }
    const rows = [['序号', '日期', '员工', '工序名称', '单价', '数量', '合计金额', '客户', '订单号', '备注']];
    data.forEach((r, i) => rows.push([i + 1, r.date, r.employee, r.process, r.unitPrice, r.quantity, r.totalAmount, r.customer || '', r.orderNo || '', r.notes || '']));
    rows.push(['', '', '', '', '', '合计', fmt.fmtMoney(data.reduce((s, r) => s + (+r.totalAmount || 0), 0)), '', '', '']);
    csv.exportFile('工资查询结果_' + fmt.today() + '.csv', csv.toCSV(rows));
  },

  importCSV() {
    csv.chooseCSV((rows) => {
      if (!rows || rows.length < 2) { wx.showToast({ title: '文件无数据', icon: 'none' }); return; }
      const header = rows[0].map(h => String(h).trim());
      const colMap = {};
      header.forEach((h, i) => {
        if (/日期/.test(h)) colMap.date = i;
        else if (/员工|姓名/.test(h)) colMap.employee = i;
        else if (/工序/.test(h)) colMap.process = i;
        else if (/单价/.test(h)) colMap.unitPrice = i;
        else if (/数量/.test(h)) colMap.quantity = i;
        else if (/合计|金额/.test(h)) colMap.totalAmount = i;
        else if (/客户/.test(h)) colMap.customer = i;
        else if (/订单/.test(h)) colMap.orderNo = i;
        else if (/备注/.test(h)) colMap.notes = i;
      });
      const ci = (k, fb) => colMap[k] !== undefined ? colMap[k] : fb;
      const valid = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const employee = String(r[ci('employee', 2)] || '').trim();
        const process = String(r[ci('process', 3)] || '').trim();
        if (!employee || !process) continue;
        valid.push({
          date: csv.parseCellDate(r[ci('date', 1)]) || fmt.today(),
          employee, process,
          unitPrice: parseFloat(r[ci('unitPrice', 4)]) || 0,
          quantity: parseFloat(r[ci('quantity', 5)]) || 0,
          totalAmount: parseFloat(r[ci('totalAmount', 6)]) || 0,
          customer: String(r[ci('customer', 7)] || ''),
          orderNo: String(r[ci('orderNo', 8)] || ''),
          notes: String(r[ci('notes', 9)] || '').trim()
        });
      }
      if (!valid.length) { wx.showToast({ title: '未找到有效数据', icon: 'none' }); return; }
      wx.showModal({
        title: '导入方式',
        content: '将导入 ' + valid.length + ' 条记录。\n确定=覆盖现有记录，取消=追加到现有记录',
        confirmText: '覆盖', cancelText: '追加',
        success: res => {
          const overwrite = !!res.confirm;
          if (overwrite) db.data.records = [];
          const now = new Date().toISOString();
          valid.forEach(r => { r.id = db.uid(); r.createdAt = now; db.data.records.push(r); });
          db.save('records');
          wx.showToast({ title: '成功导入 ' + valid.length + ' 条', icon: 'success' });
          this.executeQuery();
        }
      });
    });
  },

  clearAll() {
    if (!db.data.records.length) { wx.showToast({ title: '当前无记录', icon: 'none' }); return; }
    wx.showModal({
      title: '清空确认',
      content: '确认清空全部 ' + db.data.records.length + ' 条工资记录？此操作不可恢复！',
      confirmColor: '#FF3B30', confirmText: '清空',
      success: res => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认', content: '真的要清空全部记录吗？', confirmColor: '#FF3B30', confirmText: '清空',
          success: r2 => {
            if (!r2.confirm) return;
            db.data.records = [];
            db.save('records');
            wx.showToast({ title: '全部记录已清空', icon: 'success' });
            this.executeQuery();
          }
        });
      }
    });
  }
});
