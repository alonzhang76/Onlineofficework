const db = require('../../../utils/wage-db');
const fmt = require('../../../utils/format');

const ADJ_FIELDS = [
  { key: 'performance', label: '绩效奖', type: 'dropdown' },
  { key: 'housing', label: '房贴', type: 'dropdown' },
  { key: 'otherAllowance', label: '其它补贴', type: 'input' },
  { key: 'yearEndBonus', label: '年终奖', type: 'input' },
  { key: 'socialInsurance', label: '代扣社保', type: 'dropdown' },
  { key: 'housingFund', label: '代扣公积金', type: 'dropdown' },
  { key: 'loanDeduction', label: '扣借款', type: 'input' },
  { key: 'tax', label: '代扣个税', type: 'input' }
];

Page({
  data: {
    yearList: [], yearIndex: 0,
    monthNames: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
    monthIndex: 0,
    adjFields: [],
    summary: [], grandTotal: '0.00',
    empOptions: [], detailIndex: 0, detailEmp: '',
    detailRows: [], detailTotal: '0.00',
    editor: { show: false },
    mgr: { show: false }
  },

  onLoad() {
    const years = [];
    for (let y = 2021; y <= 2030; y++) years.push(y);
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    this.setData({
      yearList: years,
      yearIndex: years.indexOf(prevMonthYear) >= 0 ? years.indexOf(prevMonthYear) : 0,
      monthIndex: prevMonth - 1,
      adjFields: ADJ_FIELDS.map(f => Object.assign({}, f))
    });
  },

  onShow() { this.render(); },

  onYearChange(e) { this.setData({ yearIndex: +e.detail.value }); this.render(); },
  onMonthChange(e) { this.setData({ monthIndex: +e.detail.value }); this.render(); },

  render() {
    const year = this.data.yearList[this.data.yearIndex];
    const month = this.data.monthIndex + 1;
    const raw = db.getMonthlySummary(year, month);
    const summary = raw.map(r => {
      const o = { name: r.name, attendDays: r.attendDays, baseWage: fmt.fmtMoney(r.baseWage), total: fmt.fmtMoney(r.total), recordCount: r.recordCount };
      ADJ_FIELDS.forEach(f => { o[f.key] = fmt.fmtMoney(r[f.key]); });
      return o;
    });
    const grandTotal = fmt.fmtMoney(raw.reduce((s, r) => s + r.total, 0));
    const empOptions = summary.map(r => r.name);
    let detailEmp = this.data.detailEmp;
    let detailIndex = this.data.detailIndex;
    if (detailEmp && empOptions.indexOf(detailEmp) === -1) { detailEmp = ''; detailIndex = 0; }
    this.setData({ summary: summary, grandTotal: grandTotal, empOptions: empOptions, detailEmp: detailEmp, detailIndex: detailIndex });
    this.renderDetail();
  },

  onDetailEmpChange(e) {
    const i = +e.detail.value;
    this.setData({ detailIndex: i, detailEmp: this.data.empOptions[i] || '' });
    this.renderDetail();
  },

  renderDetail() {
    const emp = this.data.detailEmp;
    if (!emp) { this.setData({ detailRows: [], detailTotal: '0.00' }); return; }
    const year = this.data.yearList[this.data.yearIndex];
    const monthStr = fmt.pad(this.data.monthIndex + 1);
    const prefix = year + '-' + monthStr;
    const recs = db.data.records.filter(r => r.employee === emp && String(r.date).indexOf(prefix) === 0);
    if (!recs.length) { this.setData({ detailRows: [], detailTotal: '0.00' }); return; }
    const map = {};
    recs.forEach(r => {
      if (!map[r.process]) map[r.process] = { process: r.process, days: {}, quantity: 0, total: 0 };
      map[r.process].days[r.date] = 1;
      map[r.process].quantity += +r.quantity || 0;
      map[r.process].total += +r.totalAmount || 0;
    });
    const rows = Object.values(map).sort((a, b) => b.total - a.total);
    const totalAmt = rows.reduce((s, r) => s + r.total, 0);
    this.setData({
      detailRows: rows.map(r => ({
        process: r.process, days: Object.keys(r.days).length,
        quantity: (Math.round(r.quantity * 100) / 100).toFixed(2),
        total: fmt.fmtMoney(r.total),
        pct: totalAmt > 0 ? (r.total / totalAmt * 100).toFixed(1) + '%' : '-'
      })),
      detailTotal: fmt.fmtMoney(totalAmt)
    });
  },

  /* ---- 字段编辑 ---- */
  onFieldTap(e) {
    const d = e.currentTarget.dataset;
    const options = (db.data.dropdownOptions[d.field] || []).slice();
    this.setData({ editor: { show: true, emp: d.emp, field: d.field, label: d.label, type: d.type, options: options, value: '' } });
    if (d.type === 'dropdown' && !options.length) {
      wx.showToast({ title: '暂无选项，长按字段可管理选项', icon: 'none' });
    }
  },

  /** 长按直接打开选项管理（下拉字段） */
  onFieldLongpress(e) {
    const d = e.currentTarget.dataset;
    if (d.type !== 'dropdown') { this.onFieldTap(e); return; }
    this.setData({ mgr: { show: true, field: d.field, label: d.label, options: (db.data.dropdownOptions[d.field] || []).slice(), newVal: '' } });
  },

  onEditorInput(e) { this.setData({ 'editor.value': e.detail.value }); },

  pickOption(e) {
    const val = e.currentTarget.dataset.val;
    this.applyEditor(val);
  },

  confirmInput() {
    const v = parseFloat(this.data.editor.value);
    if (isNaN(v)) { wx.showToast({ title: '请输入有效数字', icon: 'none' }); return; }
    this.applyEditor(v);
  },

  applyEditor(val) {
    const ed = this.data.editor;
    const year = this.data.yearList[this.data.yearIndex];
    const month = this.data.monthIndex + 1;
    db.saveAdjustmentField(ed.emp, year, month, ed.field, val);
    this.closeEditor();
    wx.showToast({ title: '已保存', icon: 'success' });
    this.render();
  },

  closeEditor() { this.setData({ editor: { show: false } }); },

  /* ---- 选项管理 ---- */
  onNewOptInput(e) { this.setData({ 'mgr.newVal': e.detail.value }); },
  addOption() {
    const v = parseFloat(this.data.mgr.newVal);
    if (isNaN(v)) { wx.showToast({ title: '请输入有效数字', icon: 'none' }); return; }
    const field = this.data.mgr.field;
    const opts = db.data.dropdownOptions[field] || [];
    if (opts.indexOf(v) >= 0) { wx.showToast({ title: '该选项已存在', icon: 'none' }); return; }
    opts.push(v);
    opts.sort((a, b) => a - b);
    db.data.dropdownOptions[field] = opts;
    db.save('dropdownOptions');
    this.setData({ 'mgr.options': opts.slice(), 'mgr.newVal': '' });
    wx.showToast({ title: '选项已添加', icon: 'success' });
  },
  removeOption(e) {
    const field = this.data.mgr.field;
    const opts = (db.data.dropdownOptions[field] || []).slice();
    opts.splice(+e.currentTarget.dataset.idx, 1);
    db.data.dropdownOptions[field] = opts;
    db.save('dropdownOptions');
    this.setData({ 'mgr.options': opts.slice() });
    wx.showToast({ title: '选项已删除', icon: 'success' });
  },
  closeMgr() { this.setData({ mgr: { show: false } }); this.render(); },

  noop() {}
});
