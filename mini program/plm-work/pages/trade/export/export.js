const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const STATUS_LIST = ['未开票', '已开票'];
const STATUS_CLASS = { '未开票': 'badge-orange', '已开票': 'badge-green' };
const DATE_TYPE = ['出货日期', '到港日期'];

function emptyForm() {
  return {
    customer: '', exportDate: fmt.today(), arrivalDate: '',
    orderNoText: '', shipmentNo: '', quantity: '',
    vesselVoyage: '', containerSeal: '', billNo: '',
    declarationAmount: '', remark: ''
  };
}

Page({
  data: {
    kw: '',
    custOptions: ['全部客户'], custIdx: 0,
    statusOptions: ['全部状态'].concat(STATUS_LIST), statusIdx: 0,
    dateTypeOptions: DATE_TYPE, dateTypeIdx: 0,
    dateFrom: '', dateTo: '',

    list: [], sumAmount: '0.00', sumQty: 0, sumContainers: 0,

    modal: false, editId: '', form: emptyForm(),
    pickModal: false, allOrders: []
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const custSel = this.data.custIdx > 0 ? this.data.custOptions[this.data.custIdx] : '';
    const statusSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';
    const dateField = this.data.dateTypeIdx === 0 ? 'exportDate' : 'arrivalDate';

    const list = db.data.exportRecords
      .filter(o => {
        if (custSel && o.customer !== custSel) return false;
        if (statusSel && (o.status || '未开票') !== statusSel) return false;
        const dv = String(o[dateField] || '');
        if (this.data.dateFrom && dv && dv < this.data.dateFrom) return false;
        if (this.data.dateTo && dv && dv > this.data.dateTo) return false;
        if (kw) {
          const hay = [o.orderNo, o.customer, o.shippingNo, o.shipName, o.containerNo, o.billNo, o.remark].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('exportDate'))
      .map(o => ({
        id: o.id, customer: o.customer, orderNo: o.orderNo,
        exportDate: fmt.fmtDate(o.exportDate), arrivalDate: fmt.fmtDate(o.arrivalDate),
        shippingNo: o.shippingNo, shipName: o.shipName, containerNo: o.containerNo,
        billNo: o.billNo, quantity: o.quantity,
        declarationAmount: fmt.fmtMoney(o.declarationAmount),
        remark: o.remark,
        status: o.status || '未开票', statusClass: STATUS_CLASS[o.status || '未开票'] || 'badge-orange'
      }));

    const custOptions = ['全部客户'].concat(
      Array.from(new Set(db.data.exportRecords.map(o => o.customer).filter(Boolean))).sort()
    );
    let custIdx = this.data.custIdx;
    if (custIdx >= custOptions.length) custIdx = 0;

    this.setData({
      list, custOptions, custIdx,
      sumAmount: fmt.fmtMoney(list.reduce((s, o) => s + parseFloat(o.declarationAmount) || 0, 0)),
      sumQty: list.reduce((s, o) => s + (+o.quantity || 0), 0),
      sumContainers: list.filter(o => o.containerNo).length
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onCust(e) { this.setData({ custIdx: +e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  onDateType(e) { this.setData({ dateTypeIdx: +e.detail.value }); this.render(); },
  onDateFrom(e) { this.setData({ dateFrom: e.detail.value }); this.render(); },
  onDateTo(e) { this.setData({ dateTo: e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', custIdx: 0, statusIdx: 0, dateTypeIdx: 0, dateFrom: '', dateTo: '' });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm() });
  },

  editItem(e) {
    const o = db.data.exportRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customer: o.customer || '', exportDate: fmt.fmtDate(o.exportDate),
        arrivalDate: fmt.fmtDate(o.arrivalDate), orderNoText: o.orderNo || '',
        shipmentNo: o.shippingNo || '', quantity: o.quantity === undefined ? '' : String(o.quantity),
        vesselVoyage: o.shipName || '', containerSeal: o.containerNo || '',
        billNo: o.billNo || '',
        declarationAmount: o.declarationAmount === undefined ? '' : String(o.declarationAmount),
        remark: o.remark || ''
      }
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onOrderNo(e) { this.setData({ 'form.orderNoText': e.detail.value }); },

  /** 从订单中选择订单号 */
  pickOrders() {
    const selected = String(this.data.form.orderNoText || '').split(',').map(s => s.trim()).filter(Boolean);
    const groups = db.groupOrdersByNo();
    const allOrders = Object.keys(groups).map(no => ({
      orderNo: no,
      customer: groups[no].customer || '-',
      amount: fmt.fmtMoney(groups[no].amount),
      currency: groups[no].currency || 'USD',
      checked: selected.indexOf(no) > -1
    })).sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    this.setData({ pickModal: true, allOrders: allOrders });
  },

  toggleOrder(e) {
    const no = e.currentTarget.dataset.no;
    const allOrders = this.data.allOrders.map(o => {
      if (o.orderNo === no) o.checked = !o.checked;
      return o;
    });
    this.setData({ allOrders: allOrders });
  },

  confirmPick() {
    const nos = this.data.allOrders.filter(o => o.checked).map(o => o.orderNo);
    this.setData({ 'form.orderNoText': nos.join(', '), pickModal: false });
  },

  closePick() { this.setData({ pickModal: false }); },

  save() {
    const f = this.data.form;
    if (!String(f.customer || '').trim()) { wx.showToast({ title: '请填写客户', icon: 'none' }); return; }
    const orderNos = String(f.orderNoText || '').split(',').map(s => s.trim()).filter(Boolean);
    db.saveExport({
      status: (db.data.exportRecords.find(x => String(x.id) === String(this.data.editId)) || {}).status || '未开票',
      exportDate: f.exportDate, arrivalDate: f.arrivalDate,
      customer: String(f.customer).trim(),
      quantity: f.quantity, orderNo: orderNos,
      shipmentNo: f.shipmentNo, vesselVoyage: f.vesselVoyage,
      containerSeal: f.containerSeal, billNo: f.billNo,
      declarationAmount: f.declarationAmount, remark: f.remark
    }, this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '出口记录已更新' : '出口记录已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此出口记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteExport(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  goShipment() { wx.navigateTo({ url: '/pages/trade/shipment/shipment' }); },

  exportCSV() {
    if (!db.data.exportRecords.length) { wx.showToast({ title: '暂无出口数据', icon: 'none' }); return; }
    const headers = ['状态', '出货日期', '到港日期', '客户', '数量', '订单号', '运编号', '船名航次', '集装箱号封号', '提单号', '报关金额', '备注'];
    const rows = [headers];
    db.data.exportRecords.forEach(o => {
      rows.push([
        o.status || '未开票', fmt.fmtDate(o.exportDate), fmt.fmtDate(o.arrivalDate),
        o.customer || '', o.quantity || 0, o.orderNo || '', o.shippingNo || '',
        o.shipName || '', o.containerNo || '', o.billNo || '',
        o.declarationAmount || 0, o.remark || ''
      ]);
    });
    csv.exportFile('出口记录_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
