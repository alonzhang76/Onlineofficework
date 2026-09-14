const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const STATUS_LIST = ['未收款', '部分收款', '已收款'];
const STATUS_CLASS = { '未收款': 'badge-orange', '部分收款': 'badge-blue', '已收款': 'badge-green' };

function emptyForm() {
  return {
    customer: '', orderNo: '', productName: '', shipmentNo: '',
    payer: '', payee: '', receiptTotal: '', invoiceDate: fmt.today(),
    quantity: '', unitPrice: '', amount: '',
    agentFee: '', domesticFreight: '', overseasFreight: '', remark: ''
  };
}

Page({
  data: {
    kw: '',
    custOptions: ['全部客户'], custIdx: 0,
    statusOptions: ['全部状态'].concat(STATUS_LIST), statusIdx: 0,
    payeeOptions: ['全部收款单位'], payeeIdx: 0,
    dateFrom: '', dateTo: '',

    list: [], sumAmount: '0.00', sumAgentFee: '0.00',

    modal: false, editId: '', form: emptyForm(),
    pickModal: false, allOrders: []
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const statusSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';
    const payeeSel = this.data.payeeIdx > 0 ? this.data.payeeOptions[this.data.payeeIdx] : '';

    const list = db.data.invoiceRecords
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (statusSel && (o.status || '未收款') !== statusSel) return false;
        if (payeeSel && (o.payee || '') !== payeeSel) return false;
        const dv = String(o.invoiceDate || '');
        if (this.data.dateFrom && dv && dv < this.data.dateFrom) return false;
        if (this.data.dateTo && dv && dv > this.data.dateTo) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.productName, o.shippingNo, o.payer, o.payee, o.remark].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('invoiceDate'))
      .map(o => ({
        id: o.id, customer: o.customer, orderNo: o.orderNo,
        productName: o.productName, shippingNo: o.shippingNo,
        payer: o.payer, payee: o.payee,
        receiptTotal: fmt.fmtMoney(o.receiptTotal),
        invoiceDate: fmt.fmtDate(o.invoiceDate),
        quantity: o.quantity, unitPrice: fmt.fmtMoney(o.unitPrice),
        amount: fmt.fmtMoney(o.amount),
        agentFee: fmt.fmtMoney(o.agentFee),
        domesticFreight: fmt.fmtMoney(o.domesticFreight),
        overseasFreight: fmt.fmtMoney(o.overseasFreight),
        remark: o.remark,
        status: o.status || '未收款', statusClass: STATUS_CLASS[o.status || '未收款'] || 'badge-orange'
      }));

    const custOptions = ['全部客户'].concat(
      Array.from(new Set(db.data.invoiceRecords.map(o => o.customer).filter(Boolean))).sort()
    );
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;

    const payeeOptions = ['全部收款单位'].concat(
      Array.from(new Set(db.data.invoiceRecords.map(o => o.payee).filter(Boolean))).sort()
    );
    let payeeIdx = this.data.payeeIdx;
    if (payeeIdx >= payeeOptions.length) payeeIdx = 0;

    this.setData({
      list, custOptions, custIdx, payeeOptions, payeeIdx,
      sumAmount: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.amount) || 0, 0)),
      sumAgentFee: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.agentFee) || 0, 0))
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onCust(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  onPayee(e) { this.setData({ payeeIdx: +e.detail.value }); this.render(); },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.render(); },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', custIdx: 0, statusIdx: 0, payeeIdx: 0, dateFrom: '', dateTo: '' });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm(), statusIdx: 0 });
  },

  editItem(e) {
    const o = db.data.invoiceRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customer: o.customer || '', orderNo: o.orderNo || '',
        productName: o.productName || '', shipmentNo: o.shippingNo || '',
        payer: o.payer || '', payee: o.payee || '',
        receiptTotal: o.receiptTotal === undefined ? '' : String(o.receiptTotal),
        invoiceDate: fmt.fmtDate(o.invoiceDate),
        quantity: o.quantity === undefined ? '' : String(o.quantity),
        unitPrice: o.unitPrice === undefined ? '' : String(o.unitPrice),
        amount: o.amount === undefined ? '' : String(o.amount),
        agentFee: o.agentFee === undefined ? '' : String(o.agentFee),
        domesticFreight: o.domesticFreight === undefined ? '' : String(o.domesticFreight),
        overseasFreight: o.overseasFreight === undefined ? '' : String(o.overseasFreight),
        remark: o.remark || ''
      },
      statusIdx: Math.max(0, this.data.statusOptions.indexOf(o.status || '未收款'))
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  calcAmount() {
    const f = this.data.form;
    this.setData({ 'form.amount': fmt.fmtMoney((parseFloat(f.unitPrice) || 0) * (parseFloat(f.quantity) || 0)) });
  },

  pickOrders() {
    const groups = db.groupOrdersByNo();
    const allOrders = Object.keys(groups).map(no => ({
      orderNo: no,
      customer: groups[no].customer || '-',
      amount: fmt.fmtMoney(groups[no].amount),
      currency: groups[no].currency || 'USD'
    })).sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    this.setData({ pickModal: true, allOrders: allOrders });
  },

  chooseOrder(e) {
    const no = e.currentTarget.dataset.no;
    const g = db.groupOrdersByNo()[no];
    const patch = { 'form.orderNo': no, pickModal: false };
    if (g) {
      if (!this.data.form.customer) patch['form.customer'] = g.customer || '';
      if (!this.data.form.productName && g.rows && g.rows[0]) patch['form.productName'] = g.rows[0].productName || '';
      if (!this.data.form.receiptTotal) patch['form.receiptTotal'] = fmt.fmtMoney(g.amount);
    }
    this.setData(patch);
  },

  closePick() { this.setData({ pickModal: false }); },

  save() {
    const f = this.data.form;
    if (!String(f.customer || '').trim()) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    const existing = db.data.invoiceRecords.find(x => String(x.id) === String(this.data.editId));
    db.saveInvoice(Object.assign({}, f, {
      customer: String(f.customer).trim(),
      status: this.data.statusOptions[this.data.statusIdx] || (existing ? existing.status : '未收款')
    }), this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '发票记录已更新' : '发票记录已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此发票记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteInvoice(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  exportCSV() {
    if (!db.data.invoiceRecords.length) { wx.showToast({ title: '暂无发票数据', icon: 'none' }); return; }
    const headers = ['状态', '客户', '订单号', '商品名称', '运编号', '付款单位', '收款单位', '收汇总额',
      '开票日期', '开票数量', '开票单价', '开票金额', '代理费', '国内运杂费', '海外运杂费', '备注'];
    const rows = [headers];
    db.data.invoiceRecords.forEach(o => {
      rows.push([
        o.status || '未收款', o.customer || '', o.orderNo || '', o.productName || '', o.shippingNo || '',
        o.payer || '', o.payee || '', o.receiptTotal || 0, fmt.fmtDate(o.invoiceDate),
        o.quantity || 0, o.unitPrice || 0, o.amount || 0, o.agentFee || 0,
        o.domesticFreight || 0, o.overseasFreight || 0, o.remark || ''
      ]);
    });
    csv.exportFile('发票记录_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
