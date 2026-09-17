const db = require('../../../utils/trade-db');
const pdfShare = require('../../../utils/pdf-share');
const docRenderers = require('../../../utils/doc-renderers');

const DEFAULT_COMPANY = '普利美（常州）环境工程科技有限公司';
const MAX_BOXES = 500;

function emptyForm() {
  return {
    company: DEFAULT_COMPANY,
    po: '', artNo: '', maschinenNr: '', lfdEkNr: '', projektNr: '',
    qtyPerBox: '', unit: '', totalQty: '', remarks: '', totalBoxes: ''
  };
}

Page({
  data: {
    form: emptyForm(),
    labels: []
  },

  onLoad(query) {
    // 从订单管理带入：订单号 / 总数量 / 图号（唯一时）
    if (query && query.orderNo) {
      const orderNo = decodeURIComponent(query.orderNo);
      const g = db.groupOrdersByNo()[orderNo];
      if (g) {
        const form = this.data.form;
        form.lfdEkNr = orderNo;
        form.totalQty = String(g.rows.reduce((s, r) => s + db.num(r.quantity), 0) || '');
        const drawings = Array.from(new Set(g.rows.map(r => r.drawingNo).filter(Boolean)));
        if (drawings.length === 1) form.artNo = drawings[0];
        const units = Array.from(new Set(g.rows.map(r => r.unit).filter(Boolean)));
        if (units.length === 1) form.unit = units[0];
        this.setData({ form });
      }
    }
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['form.' + k]: e.detail.value });
  },

  onQtyInput(e) {
    const k = e.currentTarget.dataset.k;
    const form = this.data.form;
    form[k] = e.detail.value;
    // 与网页版一致：总箱数 = ceil(总数量 ÷ 每箱数量)
    const totalQty = parseInt(form.totalQty, 10);
    const qtyPerBox = parseInt(form.qtyPerBox, 10);
    if (totalQty > 0 && qtyPerBox > 0) {
      form.totalBoxes = String(Math.ceil(totalQty / qtyPerBox));
    }
    this.setData({ form });
  },

  generate() {
    const f = this.data.form;
    const totalQty = parseInt(f.totalQty, 10) || 0;
    const qtyPerBox = parseInt(f.qtyPerBox, 10) || 0;
    let totalBoxes = parseInt(f.totalBoxes, 10) || 0;

    if (totalQty <= 0) { wx.showToast({ title: '请填写总数量', icon: 'none' }); return; }
    if (qtyPerBox <= 0) { wx.showToast({ title: '请填写每箱数量', icon: 'none' }); return; }
    if (totalBoxes <= 0) totalBoxes = Math.ceil(totalQty / qtyPerBox);
    if (totalBoxes > MAX_BOXES) {
      wx.showToast({ title: '箱数不能超过 ' + MAX_BOXES, icon: 'none' });
      return;
    }

    // 与网页版一致：最后一箱数量 = 总数量 − 每箱数量 × (总箱数−1)
    const labels = [];
    for (let i = 1; i <= totalBoxes; i++) {
      let qty = qtyPerBox;
      if (i === totalBoxes && totalBoxes > 1) {
        qty = totalQty - qtyPerBox * (totalBoxes - 1);
      }
      labels.push({ no: i, qty: qty, last: i === totalBoxes });
    }
    this.setData({ labels });
    wx.showToast({ title: '已生成 ' + totalBoxes + ' 箱', icon: 'success' });
  },

  clearAll() {
    wx.showModal({
      title: '清空',
      content: '确定清空当前唛头信息吗？',
      success: res => {
        if (res.confirm) this.setData({ form: emptyForm(), labels: [] });
      }
    });
  },

  generatePDF() {
    const f = this.data.form;
    const labels = this.data.labels;
    if (!labels.length) {
      wx.showToast({ title: '请先生成箱唛', icon: 'none' });
      return;
    }
    const total = labels.length;
    // 为每箱生成一个 canvas 页面
    const pages = labels.map(label => {
      return docRenderers.renderBoxMark({
        company: f.company,
        po: f.po,
        artNo: f.artNo,
        maschinenNr: f.maschinenNr,
        lfdEkNr: f.lfdEkNr,
        projektNr: f.projektNr,
        unit: f.unit,
        totalQty: f.totalQty,
        perBoxQty: String(label.qty),
        totalBoxes: String(total),
        remark: label.last ? f.remarks : ''
      }, label.no, total);
    });

    pdfShare.generateAndShare(
      function () { return pages; },
      null,
      '箱唛_' + (f.lfdEkNr || f.po || ''),
      'portrait',
      null
    );
  }
});
