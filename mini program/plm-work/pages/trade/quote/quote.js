const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    kw: '',
    list: []
  },

  onShow() {
    db.ensureQuoteOptions();
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      this.render();
      wx.stopPullDownRefresh();
    });
  },

  render() {
    const list = db.listQuotations(this.data.kw).map(function (g) {
      return Object.assign({}, g, { amountText: g.currency + ' ' + fmt.fmtMoney(g.amount) });
    });
    this.setData({ list: list });
  },

  onSearch(e) {
    this.setData({ kw: e.detail.value });
    this.render();
  },

  newQuote() {
    wx.navigateTo({ url: '/pages/trade/quote-edit/quote-edit' });
  },

  openEdit(e) {
    wx.navigateTo({ url: '/pages/trade/quote-edit/quote-edit?no=' + encodeURIComponent(e.currentTarget.dataset.no) });
  },

  copyQuote(e) {
    const no = e.currentTarget.dataset.no;
    wx.showModal({
      title: '复制报价单',
      content: '将以 ' + no + ' 为模板生成新报价单（新单号/日期为今天）？',
      success: (res) => {
        if (!res.confirm) return;
        const newNo = db.duplicateQuotation(no);
        this.render();
        wx.navigateTo({ url: '/pages/trade/quote-edit/quote-edit?no=' + encodeURIComponent(newNo) });
      }
    });
  },

  delQuote(e) {
    const no = e.currentTarget.dataset.no;
    wx.showModal({
      title: '删除报价单',
      content: '确定删除报价单 ' + no + '（含全部产品行）？此操作会同步到云端。',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return;
        db.deleteQuotation(no);
        this.render();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  }
});
