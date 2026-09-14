const db = require('../../../utils/income-db');
const fmt = require('../../../utils/format');

function blankForm(type) {
  return {
    id: '', type: type || 'expense', amount: '', categoryId: '', categoryName: '',
    date: db.today(), description: '', paymentMethod: '', payeeUnit: '', payerUnit: ''
  };
}

/** 往来单位候选：两家公司流水里出现过的收/付款单位，按时间倒序去重 */
function counterparties(company) { return db.listCounterparties(company); }

Page({
  data: {
    company: 'company1',
    fType: 'all',
    kw: '', dateFrom: '', dateTo: '',
    categoryNames: ['全部分类'],
    cateIdx: 0,
    list: [],
    sum: { incomeText: '0.00', expenseText: '0.00', balanceText: '0.00' },
    showForm: false,
    formCategoryNames: [],
    form: blankForm('expense'),
    unitName: '',
    unitOptions: [],
    sugs: []
  },

  onLoad(options) {
    this.setData({ company: options.company || 'company1' });
    if (options.action === 'new') this.openNew();
  },

  onShow() {
    this.buildCategoryOptions();
    this.setData({ unitName: db.companyName(this.data.company) });
    this.refreshUnitOptions();
    this.search();
  },

  // 分类下拉：全部 + 收入 + 支出（按当前筛选类型）
  buildCategoryOptions() {
    const names = ['全部分类'];
    this.cateMap = [''];
    const push = (type, list) => list.forEach(c => { names.push(c.name + '（' + (type === 'income' ? '收' : '支') + '）'); this.cateMap.push(type + '|' + c.id); });
    push('income', db.CATEGORIES.income);
    push('expense', db.CATEGORIES.expense);
    if (this.data.cateIdx >= names.length) this.setData({ cateIdx: 0 });
    this.setData({ categoryNames: names });
  },

  buildFormCategories(type) {
    const list = db.CATEGORIES[type] || [];
    this.formCateList = list;
    this.setData({ formCategoryNames: list.map(c => c.name) });
  },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },
  onType(e) { this.setData({ fType: e.currentTarget.dataset.t, cateIdx: 0 }); this.search(); },
  onPick(e) { this.setData({ cateIdx: +e.detail.value }); this.search(); },

  search() {
    const picked = this.cateMap ? this.cateMap[this.data.cateIdx] : '';
    const f = {
      type: this.data.fType,
      categoryId: picked ? picked.split('|')[1] : '',
      kw: this.data.kw,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo
    };
    const list = db.queryTx(this.data.company, f).map(t => Object.assign({}, t, {
      amountText: fmt.fmtMoney(t.amount)
    }));
    const s = db.summarize(list);
    this.setData({
      list,
      sum: { incomeText: fmt.fmtMoney(s.income), expenseText: fmt.fmtMoney(s.expense), balanceText: fmt.fmtMoney(s.balance) }
    });
  },

  resetFilter() {
    this.setData({ fType: 'all', cateIdx: 0, kw: '', dateFrom: '', dateTo: '' });
    this.search();
  },

  // 重新收集往来单位候选（记账/删除后调用）
  refreshUnitOptions() { this.setData({ unitOptions: counterparties(this.data.company) }); },

  openNew() {
    const form = blankForm('expense');
    this.buildFormCategories(form.type);
    this.setData({ showForm: true, form, sugs: [] });
  },

  edit(e) {
    const t = db.listTx(this.data.company).find(x => x.id === e.currentTarget.dataset.id);
    if (!t) return;
    const form = Object.assign(blankForm(t.type), t);
    this.buildFormCategories(form.type);
    this.setData({ showForm: true, form, sugs: [] });
  },

  closeForm() { this.setData({ showForm: false, sugs: [] }); },
  noop() {},

  onFormType(e) {
    const form = this.data.form;
    form.type = e.currentTarget.dataset.t;
    form.categoryId = '';
    form.categoryName = '';
    this.buildFormCategories(form.type);
    this.setData({ form, sugs: [] });
  },

  onCategory(e) {
    const c = this.formCateList[+e.detail.value];
    if (!c) return;
    this.setData({ 'form.categoryId': c.id, 'form.categoryName': c.name });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k, v = e.detail.value;
    this.setData({ ['form.' + k]: v });
    if (k === 'payeeUnit' || k === 'payerUnit') this.updateSugs(v);
  },

  // 收/付款单位筛选提示：从已有往来单位里按输入过滤
  updateSugs(text) {
    const t = (text || '').trim().toLowerCase();
    const all = this.data.unitOptions || [];
    const sugs = (t ? all.filter(x => x.toLowerCase().indexOf(t) >= 0) : all).slice(0, 6);
    this.setData({ sugs });
  },

  onPickSug(e) {
    const v = e.currentTarget.dataset.val;
    if (!v) return;
    const field = this.data.form.type === 'income' ? 'payerUnit' : 'payeeUnit';
    this.setData({ ['form.' + field]: v, sugs: [] });
  },

  onDate(e) { this.setData({ 'form.date': e.detail.value }); },

  save() {
    const f = this.data.form;
    if (!f.categoryId) { wx.showToast({ title: '请选择分类', icon: 'none' }); return; }
    if (!f.amount || db.num(f.amount) <= 0) { wx.showToast({ title: '请填写金额', icon: 'none' }); return; }
    db.saveTx(this.data.company, f);
    this.setData({ showForm: false, sugs: [] });
    wx.showToast({ title: f.id ? '已更新' : '已记账', icon: 'success' });
    this.refreshUnitOptions();
    this.search();
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除流水', content: '确定删除这条记录吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteTx(this.data.company, id);
        this.refreshUnitOptions();
        this.search();
      }
    });
  }
});
