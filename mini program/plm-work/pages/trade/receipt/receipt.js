const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const STATUS_LIST = ['未开票', '已开票'];
const STATUS_CLASS = { '未开票': 'badge-orange', '已开票': 'badge-green' };
const PAID_OPTIONS = ['全部', '未收款', '部分收款', '已收款'];

function emptyForm() {
  return {
    customer: '', orderNo: '', receiptDate: fmt.today(),
    amountReceived: '', fee: '', exchangeRate: '7.2', rate: '', remark: ''
  };
}

Page({
  data: {
    kw: '',
    custOptions: ['全部客户'], custIdx: 0,
    statusOptions: ['全部状态'].concat(STATUS_LIST), statusIdx: 0,
    paidOptions: PAID_OPTIONS, paidIdx: 0,
    dateFrom: '', dateTo: '',

    list: [], sumAmount: '0.00', sumFee: '0.00', sumCNY: '0.00',

    modal: false, editId: '', form: emptyForm(), formCNY: '0.00',
    currencies: db.CURRENCIES, curIdx: 0,

    pickModal: false, allOrders: []
  },

  onShow() { this.render(); },

  /** 计算某订单已收汇（折算订单货币） */
  receivedOf(orderNo) {
    const recs = db.data.receiptRecords.filter(r => String(r.orderNo || '').trim() === orderNo);
    return recs.reduce((s, r) => s + (db.num(r.amountReceived) - db.num(r.fee)), 0);
  },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const statusSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';
    const paidSel = this.data.paidIdx > 0 ? PAID_OPTIONS[this.data.paidIdx] : '';

    const groups = db.groupOrdersByNo();

    let list = db.data.receiptRecords
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (statusSel && (o.status || '未开票') !== statusSel) return false;
        const dv = String(o.receiptDate || '');
        if (this.data.dateFrom && dv && dv < this.data.dateFrom) return false;
        if (this.data.dateTo && dv && dv > this.data.dateTo) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.remark].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('receiptDate'))
      .map(o => {
        const cny = (db.num(o.amountReceived) - db.num(o.fee)) * (db.num(o.exchangeRate) || 1);
        return {
          id: o.id, customer: o.customer, orderNo: o.orderNo,
          receiptDate: fmt.fmtDate(o.receiptDate),
          amountReceived: fmt.fmtMoney(o.amountReceived),
          fee: fmt.fmtMoney(o.fee),
          currency: o.currency || 'USD',
          exchangeRate: o.exchangeRate || '',
          rate: o.rate || '',
          cny: fmt.fmtMoney(cny),
          remark: o.remark,
          status: o.status || '未开票', statusClass: STATUS_CLASS[o.status || '未开票'] || 'badge-orange'
        };
      });

    // 收款情况筛选（按订单聚合判断）
    if (paidSel) {
      list = list.filter(o => {
        const g = groups[String(o.orderNo || '').trim()];
        const orderAmount = g ? g.amount : 0;
        const received = this.receivedOf(String(o.orderNo || '').trim());
        if (paidSel === '未收款') return received <= 0;
        if (paidSel === '已收款') return orderAmount > 0 && received >= orderAmount - 0.01;
        if (paidSel === '部分收款') return received > 0 && (orderAmount <= 0 || received < orderAmount - 0.01);
        return true;
      });
    }

    const custOptions = ['全部客户'].concat(
      Array.from(new Set(db.data.receiptRecords.map(o => o.customer).filter(Boolean))).sort()
    );
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;

    this.setData({
      list, custOptions, custIdx,
      sumAmount: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.amountReceived) || 0, 0)),
      sumFee: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.fee) || 0, 0)),
      sumCNY: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.cny) || 0, 0))
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onCust(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  onPaid(e) { this.setData({ paidIdx: +e.detail.value }); this.render(); },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.render(); },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', custIdx: 0, statusIdx: 0, paidIdx: 0, dateFrom: '', dateTo: '' });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm(), formCNY: '0.00', curIdx: 0 });
  },

  editItem(e) {
    const o = db.data.receiptRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const cur = o.currency || 'USD';
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customer: o.customer || '', orderNo: o.orderNo || '',
        receiptDate: fmt.fmtDate(o.receiptDate),
        amountReceived: o.amountReceived === undefined ? '' : String(o.amountReceived),
        fee: o.fee === undefined ? '' : String(o.fee),
        exchangeRate: o.exchangeRate === undefined ? '' : String(o.exchangeRate),
        rate: o.rate === undefined ? '' : String(o.rate),
        remark: o.remark || ''
      },
      curIdx: Math.max(0, db.CURRENCIES.indexOf(cur))
    });
    this.recalcCNY();
  },

  onField(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
    this.recalcCNY();
  },

  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  onCur(e) {
    const i = +e.detail.value;
    const cur = db.CURRENCIES[i];
    this.setData({ curIdx: i, 'form.exchangeRate': String(db.FIXED_RATES[cur] || 1) });
    this.recalcCNY();
  },

  recalcCNY() {
    const f = this.data.form;
    const cny = (db.num(f.amountReceived) - db.num(f.fee)) * (db.num(f.exchangeRate) || 1);
    this.setData({ formCNY: fmt.fmtMoney(cny) });
  },

  pickOrders() {
    const groups = db.groupOrdersByNo();
    const allOrders = Object.keys(groups).map(no => ({
      orderNo: no,
      customer: groups[no].customer || '-',
      amount: fmt.fmtMoney(groups[no].amount),
      currency: groups[no].currency || 'USD',
      received: fmt.fmtMoney(this.receivedOf(no))
    })).sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    this.setData({ pickModal: true, allOrders: allOrders });
  },

  chooseOrder(e) {
    const no = e.currentTarget.dataset.no;
    const g = db.groupOrdersByNo()[no];
    const patch = { 'form.orderNo': no, pickModal: false };
    if (g && !this.data.form.customer) patch['form.customer'] = g.customer || '';
    this.setData(patch);
  },

  closePick() { this.setData({ pickModal: false }); },

  save() {
    const f = this.data.form;
    if (!String(f.customer || '').trim()) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    if (!db.num(f.amountReceived)) { wx.showToast({ title: '请填写收汇金额', icon: 'none' }); return; }
    const existing = db.data.receiptRecords.find(x => String(x.id) === String(this.data.editId));
    db.saveReceipt({
      status: existing ? existing.status : '未开票',
      customer: String(f.customer).trim(), orderNo: f.orderNo,
      receiptDate: f.receiptDate, amountReceived: f.amountReceived, fee: f.fee,
      currency: db.CURRENCIES[this.data.curIdx],
      exchangeRate: f.exchangeRate, rate: f.rate, remark: f.remark
    }, this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '收汇记录已更新' : '收汇记录已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此收汇记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteReceipt(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  exportCSV() {
    if (!db.data.receiptRecords.length) { wx.showToast({ title: '暂无收汇数据', icon: 'none' }); return; }
    const headers = ['状态', '客户', '订单号', '收汇日期', '收汇金额', '手续费', '货币', '汇率', '比例', '折人民币', '备注'];
    const rows = [headers];
    db.data.receiptRecords.forEach(o => {
      const cny = (db.num(o.amountReceived) - db.num(o.fee)) * (db.num(o.exchangeRate) || 1);
      rows.push([
        o.status || '未开票', o.customer || '', o.orderNo || '', fmt.fmtDate(o.receiptDate),
        o.amountReceived || 0, o.fee || 0, o.currency || 'USD',
        o.exchangeRate || '', o.rate || '', fmt.fmtMoney(cny), o.remark || ''
      ]);
    });
    csv.exportFile('收汇记录_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
