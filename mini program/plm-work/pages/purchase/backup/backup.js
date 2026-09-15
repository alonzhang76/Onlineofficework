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
    const name = '采购数据备份_' + fmt.today() + '.json';
    const msg = '普利美' + (d.data.purchaseOrders.companyA || []).length + '单，无锡龙力' + (d.data.purchaseOrders.companyB || []).length + '单，供应商' + (d.data.suppliers || []).length + '家（含两公司全部数据）';
    csv.exportFile(name, JSON.stringify(d, null, 2), function () {
      wx.showToast({ title: '备份完成：' + msg, icon: 'none' });
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
            // 兼容网页版整包格式：{version, data:{purchaseOrders:{companyA,companyB}, ...}} → 解包
            const isPack = data && data.data && typeof data.data === 'object' && data.data.purchaseOrders && !Array.isArray(data.data.purchaseOrders);
            if (isPack) data = data.data;
            const flat = data && Array.isArray(data.purchaseOrders);
            if (!isPack && !flat) { wx.showToast({ title: '备份文件不含采购数据', icon: 'none' }); return; }
            if (flat) {
              // 旧版单公司格式：仅恢复当前查看的公司
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
              return;
            }
            // 整包格式：覆盖两个公司全部数据
            const nA = (data.purchaseOrders.companyA || []).length;
            const nB = (data.purchaseOrders.companyB || []).length;
            const supN = (data.suppliers || []).length;
            wx.showModal({
              title: '确认恢复',
              content: '普利美 ' + nA + ' 单、无锡龙力 ' + nB + ' 单、供应商 ' + supN + ' 家\n\n此操作将覆盖当前全部采购数据！',
              confirmColor: '#FF3B30', confirmText: '恢复',
              success: m => {
                if (!m.confirm) return;
                db.importBackup({ version: '2.1', data: data });
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
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      this.render();
      if (ok) wx.showToast({ title: '已拉取云端（' + count + ' 项）', icon: 'success' });
      else wx.showToast({ title: '拉取失败，请检查网络', icon: 'none' });
    });
  }
});
