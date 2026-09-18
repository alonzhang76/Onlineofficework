/**
 * 报价单列表（与桌面端 apps/saintysys/quotation.html 共用 fashion_quotations）
 */
const db = require('../../utils/db');

const STATUS_LABELS = {
  all: '全部', draft: '草稿', sent: '已发送', accepted: '已接受', rejected: '已拒绝', expired: '已过期'
};
const FILTERS = ['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'];

Page({
  data: {
    filters: FILTERS.map(k => ({ key: k, label: STATUS_LABELS[k] })),
    filter: 'all',
    q: '',
    list: [],
    totalText: '',
    totalAmount: ''
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) app.globalData.user = require('../../utils/cloudbase').getUser();
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.render();
  },

  onCloudUpdate() { this.render(); },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      this.render();
      wx.stopPullDownRefresh();
    });
  },

  render() {
    const filter = this.data.filter;
    const kw = (this.data.q || '').trim().toLowerCase();
    const all = db.get('fashion_quotations') || [];
    let rows = all.slice().sort((a, b) => (b.quoteDate || '').localeCompare(a.quoteDate || ''));
    if (filter !== 'all') rows = rows.filter(r => (r.status || 'draft') === filter);
    if (kw) {
      rows = rows.filter(r => {
        const hay = [r.quoteNo, r.customerName, r.customerCompany, r.season,
          (r.items || []).map(i => [i.styleNo, i.productName].join(' ')).join(' ')
        ].join(' ').toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    }
    let amount = 0;
    (db.get('fashion_quotations') || []).forEach(r => { amount += Number(r.grandTotal) || 0; });

    this.setData({
      list: rows.map(r => ({
        id: r.id,
        quoteNo: r.quoteNo || '(无编号)',
        customer: r.customerCompany || r.customerName || '—',
        attn: r.customerName || '',
        season: r.season || '',
        date: r.quoteDate || '',
        validUntil: r.validUntil || '',
        amount: (r.currency || 'USD') + ' ' + this.fmt(r.grandTotal),
        status: r.status || 'draft',
        statusLabel: STATUS_LABELS[r.status || 'draft'] || r.status || 'draft'
      })),
      totalText: '共 ' + rows.length + ' 份报价',
      totalAmount: this.fmt(amount)
    });
  },

  fmt(n) {
    return (Math.round((Number(n) || 0) * 100) / 100)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  onSearch(e) {
    this.setData({ q: e.detail.value });
    this.render();
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.render();
  },

  create() {
    wx.navigateTo({ url: '/pages/quote-edit/quote-edit' });
  },

  open(e) {
    wx.navigateTo({ url: '/pages/quote-edit/quote-edit?id=' + e.currentTarget.dataset.id });
  },

  onLong(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑', '复制为新报价单', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/quote-edit/quote-edit?id=' + id });
        } else if (res.tapIndex === 1) {
          this.duplicate(id);
        } else if (res.tapIndex === 2) {
          this.remove(id);
        }
      }
    });
  },

  duplicate(id) {
    const arr = db.get('fashion_quotations') || [];
    const src = arr.find(r => r.id === id);
    if (!src) return;
    const now = new Date();
    const ym = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0');
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'qt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    copy.quoteNo = 'QTSTIG' + ym + Math.floor(1000 + Math.random() * 9000);
    copy.quoteDate = this.today();
    copy.validUntil = this.addDays(copy.quoteDate, 30);
    copy.status = 'draft';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    arr.push(copy);
    db.save('fashion_quotations');
    wx.showToast({ title: '已复制', icon: 'success' });
    this.render();
  },

  remove(id) {
    wx.showModal({
      title: '删除报价单',
      content: '确定删除该报价单？此操作会同步到云端。',
      confirmColor: '#d44848',
      success: (r) => {
        if (!r.confirm) return;
        const arr = (db.get('fashion_quotations') || []).filter(x => x.id !== id);
        db.data['fashion_quotations'] = arr;
        db.save('fashion_quotations');
        this.render();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
});
