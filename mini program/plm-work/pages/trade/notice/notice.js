const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const pdfShare = require('../../../utils/pdf-share');
const docRenderers = require('../../../utils/doc-renderers');

Page({
  data: {
    orderOptions: [],
    orderIdx: -1,
    doc: null,
    pdfReady: false,
    pdfPath: ''
  },

  onLoad(query) {
    this.preselect = query && query.orderNo ? decodeURIComponent(query.orderNo) : '';
  },

  onShow() { this.renderList(); },

  renderList() {
    const grouped = db.groupOrdersByNo();
    const orderOptions = Object.keys(grouped).map(no => {
      const g = grouped[no];
      const firstDate = g.orderDate || '';
      return {
        value: no,
        label: no + ' ｜ ' + (g.customer || '-') + ' ｜ ' + firstDate + ' ｜ ' + g.rows.length + '款',
        sortTs: fmt.dateTs(firstDate)
      };
    }).sort((a, b) => {
      const ok = !isNaN(a.sortTs), bk = !isNaN(b.sortTs);
      if (ok && bk && a.sortTs !== b.sortTs) return b.sortTs - a.sortTs;
      if (ok !== bk) return ok ? -1 : 1;
      return b.value.localeCompare(a.value);
    });

    let orderIdx = -1;
    if (this.preselect) {
      orderIdx = orderOptions.findIndex(o => o.value === this.preselect);
      this.preselect = '';
    }
    this.setData({ orderOptions, orderIdx });
    if (orderIdx >= 0) this.buildDoc(orderOptions[orderIdx].value);
  },

  onOrder(e) {
    const idx = +e.detail.value;
    this.setData({ orderIdx: idx, pdfReady: false });
    this.buildDoc(this.data.orderOptions[idx].value);
  },

  buildDoc(orderNo) {
    const g = db.groupOrdersByNo()[orderNo];
    if (!g) { this.setData({ doc: null }); return; }

    // 交货期提醒（与网页版一致：临近/逾期提示）
    let deliveryWarn = '';
    if (g.deliveryDate) {
      const ts = fmt.dateTs(g.deliveryDate);
      if (!isNaN(ts)) {
        const days = Math.ceil((ts - fmt.dateTs(fmt.today())) / 86400000);
        if (days < 0) deliveryWarn = '交货期已逾期 ' + Math.abs(days) + ' 天，请尽快完成生产';
        else if (days <= 7) deliveryWarn = '距离交货期还有 ' + days + ' 天，请确保按时完成生产';
      }
    }

    const products = g.rows.map(r => ({
      id: r.id,
      productName: r.productName,
      spec: r.spec,
      drawingNo: r.drawingNo,
      plating: r.plating,
      logo: r.logo,
      quantity: r.quantity
    }));
    const totalQty = products.reduce((s, p) => s + (db.num(p.quantity) || 0), 0);
    const remarks = Array.from(new Set(g.rows.map(r => r.remark).filter(Boolean)));

    this.setData({
      pdfReady: false,
      doc: {
        orderNo: g.orderNo,
        customer: g.customer,
        orderDate: fmt.fmtDate(g.orderDate),
        deliveryDate: fmt.fmtDate(g.deliveryDate),
        deliveryWarn,
        products,
        totalQty,
        remark: remarks.join('\n')
      }
    });
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
      docRenderers.renderProductionNotice,
      pdfData,
      '生产通知单_' + d.orderNo,
      'landscape',
      (ok, filePath) => {
        if (ok) {
          this.setData({ pdfReady: true, pdfPath: filePath });
          wx.showToast({ title: 'PDF已生成，请发送', icon: 'success' });
        }
      }
    );
  },

  // 必须由“发送给微信好友”按钮直接 tap 触发，内部第一时间同步调起分享
  onShareFile() {
    pdfShare.sharePrepared(this.data.pdfPath, null);
  }
});
