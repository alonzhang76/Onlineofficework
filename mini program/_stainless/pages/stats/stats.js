/**
 * 统计分析（当前抬头）
 * 销售/采购汇总、收付款、发票进销项、库存、客户销售排行
 */
const db = require('../../utils/db');
const cb = require('../../utils/cloudbase');
const company = require('../../utils/company');
const fmt = require('../../utils/format');

function sum(list, fn) { return list.reduce((s, r) => s + (Number(fn(r)) || 0), 0); }

Page({
  data: {
    companyName: '',
    cards: [],
    rank: []
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) app.globalData.user = cb.getUser();
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.render();
  },

  onCloudUpdate() { this.render(); },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); });
  },

  switchCompany() {
    const list = company.getCompanies();
    wx.showActionSheet({
      itemList: list.map(c => c.nameCn || c.id),
      success: (res) => {
        const c = list[res.tapIndex];
        if (c && c.id !== company.getCurrentId()) {
          company.switchCompany(c.id);
          this.render();
        }
      }
    });
  },

  render() {
    const cur = company.getCurrent();

    const sales = db.get('salesOrders') || [];
    const purchases = db.get('purchaseOrders') || [];
    const invoices = db.get('invoices') || [];
    const transactions = db.get('transactions') || [];
    const inventory = db.get('inventoryRecords') || [];

    const salesAmt = sum(sales, r => r.totalAmount);
    const purchaseAmt = sum(purchases, r => r.totalAmount);
    const salesWeight = sum(sales, r => (Number(r.weight) || 0) + (Number(r.weightAdjustment) || 0));
    const purchaseWeight = sum(purchases, r => r.weight);

    const outputInvoices = invoices.filter(r => String(r.type).indexOf('销') >= 0);
    const inputInvoices = invoices.filter(r => String(r.type).indexOf('进') >= 0);
    const outputTax = sum(outputInvoices, r => r.totalAmount || (Number(r.amount) || 0) + (Number(r.taxAmount) || 0));
    const inputTax = sum(inputInvoices, r => r.totalAmount || (Number(r.amount) || 0) + (Number(r.taxAmount) || 0));

    const inflow = sum(transactions.filter(r => /收/.test(String(r.category || ''))), r => r.amount);
    const outflow = sum(transactions.filter(r => /付/.test(String(r.category || ''))), r => r.amount);

    const stockWeight = sum(inventory, r => r.weight);
    const pendingShip = sales.filter(r => !r.status || /待发/.test(String(r.status))).length;

    const cards = [
      { group: '销售', items: [
        { label: '销售订单', value: String(sales.length) + ' 单' },
        { label: '销售总额', value: '¥' + fmt.fmtMoney(salesAmt), hot: true },
        { label: '销售重量', value: fmt.fmtNum(salesWeight) + ' kg' },
        { label: '待发货', value: String(pendingShip) + ' 单' }
      ]},
      { group: '采购', items: [
        { label: '采购订单', value: String(purchases.length) + ' 单' },
        { label: '采购总额', value: '¥' + fmt.fmtMoney(purchaseAmt), hot: true },
        { label: '采购重量', value: fmt.fmtNum(purchaseWeight) + ' kg' },
        { label: '进销差额', value: '¥' + fmt.fmtMoney(salesAmt - purchaseAmt) }
      ]},
      { group: '发票 / 收付款', items: [
        { label: '销项发票(价税合计)', value: '¥' + fmt.fmtMoney(outputTax) },
        { label: '进项发票(价税合计)', value: '¥' + fmt.fmtMoney(inputTax) },
        { label: '收款合计', value: '¥' + fmt.fmtMoney(inflow) },
        { label: '付款合计', value: '¥' + fmt.fmtMoney(outflow) }
      ]},
      { group: '库存', items: [
        { label: '库存记录', value: String(inventory.length) + ' 条' },
        { label: '库存重量', value: fmt.fmtNum(stockWeight) + ' kg' }
      ]}
    ];

    // 客户销售排行
    const rankMap = {};
    sales.forEach(r => {
      const name = r.customer || '（未填客户）';
      if (!rankMap[name]) rankMap[name] = { name: name, amount: 0, count: 0, weight: 0 };
      rankMap[name].amount += Number(r.totalAmount) || 0;
      rankMap[name].count += 1;
      rankMap[name].weight += (Number(r.weight) || 0) + (Number(r.weightAdjustment) || 0);
    });
    const rank = Object.keys(rankMap).map(k => rankMap[k])
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((r, i) => ({
        idx: i + 1,
        name: r.name,
        amount: '¥' + fmt.fmtMoney(r.amount),
        sub: r.count + ' 单 · ' + fmt.fmtNum(r.weight) + ' kg'
      }));

    this.setData({
      companyName: cur.nameCn || '',
      cards: cards,
      rank: rank
    });
  }
});
