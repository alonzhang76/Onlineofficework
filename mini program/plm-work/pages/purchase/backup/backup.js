const db = require('../../../utils/purchase-db');
const fmt = require('../../../utils/format');
const supa = require('../../../utils/cloudbase');
const csv = require('../../../utils/csv');

Page({
  data: { companyName: '', counts: { orders: 0, invoices: 0, payments: 0, suppliers: 0 } },

  onLoad(options) {
    this.company = options.company || 'companyA';
    const c = db.COMPANIES.find(x => x.id === this.company) || db.COMPANIES[0];
    this.setData({ companyName: c.short });
  },

  onShow() { this.render(); },

  render() {
    this.setData({
      counts: {
        orders: db.listOrders(this.company).length,
        invoices: db.listInvoices(this.company).length,
        payments: db.listPayments(this.company).length,
        suppliers: db.listSuppliers().length
      }
    });
  },

  backupData() {
    const d = db.exportBackup(this.company);
    const name = '采购数据备份_' + this.company + '_' + fmt.today() + '.json';
    csv.exportFile(name, JSON.stringify(d, null, 2), function () {
      wx.showToast({ title: '备份完成', icon: 'success' });
    });
  },

  restoreData() {
    const that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: res => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f) return;
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: 'utf8',
          success: r => {
            let data;
            try { data = JSON.parse(r.data); } catch (e) { wx.showToast({ title: '文件解析失败', icon: 'none' }); return; }
            if (!data || !Array.isArray(data.purchaseOrders)) { wx.showToast({ title: '备份文件不含采购数据', icon: 'none' }); return; }
            wx.showModal({
              title: '确认恢复',
              content: '采购订单 ' + data.purchaseOrders.length + ' 单，将覆盖当前公司（' + that.data.companyName + '）数据！',
              confirmColor: '#FF3B30', confirmText: '恢复',
              success: m => {
                if (!m.confirm) return;
                data.company = that.company;
                db.importBackup(data);
                wx.showToast({ title: '数据恢复成功', icon: 'success' });
                that.render();
              }
            });
          },
          fail() { wx.showToast({ title: '文件读取失败', icon: 'none' }); }
        });
      }
    });
  },

  pullCloud() {
    if (!supa.isConfigured()) { wx.showToast({ title: '未配置 CloudBase', icon: 'none' }); return; }
    wx.showLoading({ title: '拉取中...' });
    db.syncFromCloud(() => {
      wx.hideLoading();
      this.render();
      wx.showToast({ title: '已拉取云端', icon: 'success' });
    });
  }
});
