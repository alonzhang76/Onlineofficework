const db = require('../../../utils/schedule-db');
const fmt = require('../../../utils/format');

// LOGO 选项（名称 + 对应图片路径；图片按约定存 assets/logos/{名小写}.png，无图文件时 <image binderror> 隐藏）
const LOGO_NAMES = ['无', 'LONGLI', 'KBA', 'PERM', 'EPCCS', 'INGHOR', 'CC', 'J', 'HS'];
const LOGO_OPTS = LOGO_NAMES.map(n => ({
  name: n,
  img: n === '无' ? '' : '../../../assets/logos/' + n.toLowerCase() + '.png'
}));
function logoImgOf(name) {
  if (!name) return '';
  const o = LOGO_OPTS.find(x => x.name === name);
  return o ? o.img : '../../../assets/logos/' + String(name).toLowerCase() + '.png';
}

const STATUS_CLASS = {
  '已出货': 'badge-green', '已交货': 'badge-green', '结束': 'badge-green',
  '生产中': 'badge-orange'
};

function blankForm() {
  return {
    id: '', date: '', customer: '', orderNo: '', drawing: '', product: '', spec: '',
    plating: '', logo: '', logoImg: '', logoMenu: false, remark: '', currencyIdx: 0, quantity: '', price: '', moldFee: '',
    deadline: '', shipDate: '', month1: '', output1: '', month2: '', output2: '',
    packDate: '', boxSize: '', packaging: '',
    invoiceDate: '', invoiceAmount: '', invoiceTitle: '',
    payDate1: '', payAmount1: '', payDate2: '', payAmount2: '',
    payDate3: '', payAmount3: '', payDate4: '', payAmount4: '',
    orderAmount: '0.00'
  };
}

// 筛选状态（与网页版一致：关键词/订单号/产品支持逗号分隔多条件）
function matches(o, f) {
  if (f.kw) {
    const kws = f.kw.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    const text = JSON.stringify(o).toLowerCase();
    if (!kws.some(k => text.indexOf(k) >= 0)) return false;
  }
  if (f.fCustomer && (o.customer || '').toLowerCase().indexOf(f.fCustomer.toLowerCase()) < 0) return false;
  if (f.fOrderNo) {
    const nos = f.fOrderNo.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    if (!nos.some(k => (o.orderNo || '').toLowerCase().indexOf(k) >= 0)) return false;
  }
  if (f.statusIdx > 0 && o.status !== f.statusOptions[f.statusIdx]) return false;
  const d = f.dateTypeIdx === 0 ? (o.date || '') : (o.shipDate || '');
  if (f.dateFrom && d && d < f.dateFrom) return false;
  if (f.dateTo && d && d > f.dateTo) return false;
  return true;
}

Page({
  data: {
    kw: '', fCustomer: '', fOrderNo: '',
    statusOptions: ['全部', '生产中', '已出货'],
    statusIdx: 0,
    dateTypeOptions: ['订单日期', '出货日期'],
    dateTypeIdx: 0,
    dateFrom: '', dateTo: '',
    currencies: db.CURRENCIES,
    list: [],
    sumText: '0.00',
    showForm: false,
    form: blankForm(),
    logoOpts: LOGO_OPTS, logoErr: {}
  },

  onShow() { this.search(); },

  f(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); },

  onPick(e) { this.setData({ [e.currentTarget.dataset.k]: +e.detail.value }); },

  search() {
    const f = {
      kw: this.data.kw, fCustomer: this.data.fCustomer, fOrderNo: this.data.fOrderNo,
      statusIdx: this.data.statusIdx, statusOptions: this.data.statusOptions,
      dateTypeIdx: this.data.dateTypeIdx, dateFrom: this.data.dateFrom, dateTo: this.data.dateTo
    };
    const list = db.data.production_orders_data
      .filter(o => matches(o, f))
      .slice()
      .reverse()
      .map(o => Object.assign({}, o, {
        badgeClass: STATUS_CLASS[o.status] || 'badge-gray'
      }));
    const sum = list.reduce((s, o) => s + db.toCNY(o.orderAmount, o.currency), 0);
    this.setData({ list, sumText: fmt.fmtMoney(sum) });
  },

  resetFilter() {
    this.setData({ kw: '', fCustomer: '', fOrderNo: '', statusIdx: 0, dateTypeIdx: 0, dateFrom: '', dateTo: '' });
    this.search();
  },

  openNew() { this.setData({ showForm: true, form: blankForm() }); },

  editOrder(e) {
    const o = db.data.production_orders_data.find(x => x.id === e.currentTarget.dataset.id);
    if (!o) return;
    const form = Object.assign(blankForm(), o, {
      currencyIdx: Math.max(0, db.CURRENCIES.indexOf(o.currency || 'CNY'))
    });
    form.logoImg = logoImgOf(form.logo);
    form.logoMenu = false;
    form.orderAmount = db.r2(db.num(o.quantity) * db.num(o.price) + db.num(o.moldFee)).toFixed(2);
    this.setData({ showForm: true, form });
  },

  closeForm() { this.setData({ showForm: false }); },
  noop() {},

  // 展开/收起 LOGO 菜单
  toggleLogoMenu() {
    this.setData({ 'form.logoMenu': !this.data.form.logoMenu });
  },
  pickLogo(e) {
    const name = e.currentTarget.dataset.ln;
    this.setData({
      'form.logo': name,
      'form.logoImg': logoImgOf(name),
      'form.logoMenu': false
    });
  },
  closeLogoMenu() { this.setData({ 'form.logoMenu': false }); },
  // 点击弹层空白处关闭 LOGO 菜单（trigger/菜单项用 catchtap 阻止冒泡到此处）
  onSheetTap() { this.closeLogoMenu(); },
  // LOGO 图片加载失败（未放入对应文件）→ 只显示名称文字
  onLogoErr(e) {
    this.setData({ ['logoErr.' + e.currentTarget.dataset.ln]: true });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const form = this.data.form;
    form[k] = e.detail.value;
    if (k === 'quantity' || k === 'price' || k === 'moldFee') {
      form.orderAmount = db.r2(db.num(form.quantity) * db.num(form.price) + db.num(form.moldFee)).toFixed(2);
    }
    this.setData({ form });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  onPickField(e) {
    const k = e.currentTarget.dataset.k;
    if (k === 'currencyIdx') this.setData({ 'form.currencyIdx': +e.detail.value });
  },

  save() {
    const f = this.data.form;
    if (!f.customer) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    db.saveOrder({
      id: f.id || undefined,
      date: f.date, customer: f.customer, orderNo: f.orderNo, drawing: f.drawing,
      product: f.product, spec: f.spec, plating: f.plating, logo: f.logo, remark: f.remark,
      currency: db.CURRENCIES[f.currencyIdx],
      quantity: db.num(f.quantity), price: db.num(f.price), moldFee: db.num(f.moldFee),
      deadline: f.deadline, shipDate: f.shipDate,
      month1: f.month1, output1: db.num(f.output1),
      month2: f.month2, output2: db.num(f.output2),
      packDate: f.packDate, boxSize: f.boxSize, packaging: f.packaging,
      invoiceDate: f.invoiceDate, invoiceAmount: f.invoiceAmount, invoiceTitle: f.invoiceTitle,
      payDate1: f.payDate1, payAmount1: f.payAmount1,
      payDate2: f.payDate2, payAmount2: f.payAmount2,
      payDate3: f.payDate3, payAmount3: f.payAmount3,
      payDate4: f.payDate4, payAmount4: f.payAmount4
    });
    this.setData({ showForm: false });
    wx.showToast({ title: f.id ? '订单已更新' : '订单已添加', icon: 'success' });
    this.search();
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除订单',
      content: '确定要删除这条订单吗？',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteOrder(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.search();
      }
    });
  }
});
