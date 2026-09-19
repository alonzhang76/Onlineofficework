// 订单排程·生产通知单
// 勾选同一客户的订单（≤10 条）→ 生成与桌面版同版面 PDF → 发送微信好友
// 与桌面版 apps/orderschedule/生产通知单.html 的生成规则保持一致
const db = require('../../../utils/schedule-db');
const fmt = require('../../../utils/format');
const pdfShare = require('../../../utils/pdf-share');
const docRenderers = require('../../../utils/doc-renderers');

const MAX_PRODUCTS = 10;

Page({
  data: {
    customers: [],          // ['全部客户', '甲', '乙']
    customerIdx: 0,
    list: [],
    checkedCount: 0,
    doc: null,
    pdfReady: false,
    pdfPath: ''
  },

  onLoad() {
    this.checkedIds = {};   // id -> true
  },

  onShow() { this.render(); },

  render() {
    const all = db.data.production_orders_data.slice().reverse();
    const custMap = {};
    all.forEach(o => { if (o.customer) custMap[o.customer] = 1; });
    const customers = ['全部客户'].concat(Object.keys(custMap).sort());

    let customerIdx = this.data.customerIdx;
    if (customerIdx >= customers.length) customerIdx = 0;
    const selCustomer = customerIdx > 0 ? customers[customerIdx] : '';

    const rows = (selCustomer ? all.filter(o => o.customer === selCustomer) : all).map(o => ({
      id: o.id,
      orderNo: o.orderNo || '',
      customer: o.customer || '',
      date: o.date || '',
      deadline: o.deadline || '',
      product: o.product || '',
      spec: o.spec || '',
      drawing: o.drawing || '',
      plating: o.plating || '',
      logo: o.logo || '',
      quantity: o.quantity,
      shipDate: o.shipDate || '',
      status: o.status || (o.shipDate ? '已出货' : '生产中'),
      checked: !!this.checkedIds[o.id]
    }));

    this.setData({
      customers,
      customerIdx,
      list: rows,
      checkedCount: Object.keys(this.checkedIds).length
    });
  },

  onCustomer(e) {
    // 切换客户后清空勾选，避免跨客户误选
    this.checkedIds = {};
    this.setData({ customerIdx: +e.detail.value, doc: null, pdfReady: false });
    this.render();
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const order = db.data.production_orders_data.find(o => o.id === id);
    if (!order) return;

    if (!this.checkedIds[id]) {
      // 同一通知单只能包含同一客户的订单（与桌面版一致）
      const existed = Object.keys(this.checkedIds);
      if (existed.length) {
        const first = db.data.production_orders_data.find(o => o.id === existed[0]);
        if (first && (first.customer || '') !== (order.customer || '')) {
          wx.showToast({ title: '只能选择同一客户的订单', icon: 'none' });
          return;
        }
      }
      const count = existed.length;
      if (count >= MAX_PRODUCTS) {
        wx.showToast({ title: '一张通知单最多 ' + MAX_PRODUCTS + ' 条订单', icon: 'none' });
        return;
      }
      this.checkedIds[id] = true;
    } else {
      delete this.checkedIds[id];
    }
    this.setData({ doc: null, pdfReady: false });
    this.render();
  },

  toggleAll() {
    if (this.data.customerIdx === 0) {
      wx.showToast({ title: '请先在上方选择具体客户', icon: 'none' });
      return;
    }
    const visible = this.data.list;
    const allOn = visible.length > 0 && visible.every(o => o.checked);
    if (allOn) {
      visible.forEach(o => { delete this.checkedIds[o.id]; });
    } else {
      visible.forEach(o => { this.checkedIds[o.id] = true; });
    }
    this.setData({ doc: null, pdfReady: false });
    this.render();
  },

  // 组装通知单数据并预览
  previewDoc() {
    const ids = this.checkedIds;
    const orders = this.data.list.filter(o => ids[o.id]);
    if (!orders.length) {
      wx.showToast({ title: '请勾选订单', icon: 'none' });
      return;
    }
    if (orders.length > MAX_PRODUCTS) {
      wx.showToast({ title: '一张通知单最多 ' + MAX_PRODUCTS + ' 条订单', icon: 'none' });
      return;
    }

    const doBuild = () => {
      const first = orders[0];
      const products = orders.map(o => ({
        id: o.id,
        productName: o.product,
        spec: o.spec,
        drawingNo: o.drawing,
        plating: o.plating,
        logo: o.logo,
        quantity: o.quantity
      }));
      const totalQty = products.reduce((s, p) => s + (db.num(p.quantity) || 0), 0);
      const remarks = Array.from(new Set(orders.map(o => o.remark).filter(Boolean)));
      const warn = this.deliveryWarn(first.deadline);

      this.setData({
        doc: {
          orderNo: first.orderNo,
          customer: first.customer,
          orderDate: first.date,
          deliveryDate: first.deadline,
          warn: warn,
          products,
          totalQty,
          remark: remarks.join('\n')
        }
      });
      wx.pageScrollTo({ scrollTop: 9999, duration: 200 });
    };

    // 含已出货订单时二次确认（与桌面版一致）
    if (orders.some(o => o.shipDate)) {
      wx.showModal({
        title: '提示',
        content: '勾选的订单中包含已出货订单，仍要生成生产通知单吗？',
        success: res => { if (res.confirm) doBuild(); }
      });
    } else {
      doBuild();
    }
  },

  // 与桌面版提醒规则一致
  deliveryWarn(date) {
    if (!date) return { level: 'gray', text: '未设置交货期，请先填写交货日期。' };
    const ts = fmt.dateTs(date);
    if (isNaN(ts)) return null;
    const days = Math.ceil((ts - fmt.dateTs(fmt.today())) / 86400000);
    if (days < 0) return { level: 'red', text: '已逾期 ' + Math.abs(days) + ' 天！ 请立即处理此订单。' };
    if (days <= 3) return { level: 'red', text: '紧急！距离交货期仅剩 ' + days + ' 天，请立即安排生产。' };
    if (days <= 7) return { level: 'yellow', text: '距离交货期还有 ' + days + ' 天，请确保按时完成生产。' };
    return { level: 'green', text: '距离交货期还有 ' + days + ' 天，生产时间充裕。' };
  },

  buildPDF() {
    const d = this.data.doc;
    if (!d) return;
    const pdfData = {
      orderDate: d.orderDate,
      orderNumber: d.orderNo,
      customer: d.customer,
      deliveryDate: d.deliveryDate,
      products: d.products.map(p => ({
        productName: p.productName,
        specification: p.spec,
        drawingNumber: p.drawingNo,
        plating: p.plating,
        bowLogo: p.logo,
        quantity: p.quantity
      })),
      remark: d.remark
    };
    pdfShare.buildFile(
      docRenderers.renderScheduleNotice,
      pdfData,
      '生产通知单_' + (d.orderNo || d.customer || ''),
      'landscape',
      (ok, filePath) => {
        if (ok) {
          this.setData({ pdfReady: true, pdfPath: filePath });
          wx.showToast({ title: 'PDF已生成，请发送', icon: 'success' });
        }
      }
    );
  },

  // 必须由“发送给微信好友”按钮直接 tap 触发
  onShareFile() {
    pdfShare.sharePrepared(this.data.pdfPath, null);
  }
});
