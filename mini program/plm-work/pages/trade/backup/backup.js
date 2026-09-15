const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const supa = require('../../../utils/cloudbase');
const csv = require('../../../utils/csv');

Page({
  data: { overview: [], cloudOn: false },

  onShow() { this.render(); },

  render() {
    const d = db.data;
    const stat = db.getReportStatistics();
    const debts = db.generateDebtStatistics();
    const dates = d.orderRecords.map(o => o.orderDate).filter(Boolean).sort();
    const dateRange = dates.length ? fmt.fmtDate(dates[0]) + ' ~ ' + fmt.fmtDate(dates[dates.length - 1]) : '-';
    this.setData({
      cloudOn: supa.isConfigured(),
      overview: [
        { label: '订单记录', value: d.orderRecords.length },
        { label: '客户数量', value: d.customerRecords.length },
        { label: '出口记录', value: d.exportRecords.length },
        { label: '收汇记录', value: d.receiptRecords.length },
        { label: '发票记录', value: d.invoiceRecords.length },
        { label: '付款记录', value: d.indexPaymentRecords.length },
        { label: '备忘录', value: d.memoRecords.length },
        { label: '业务跟踪', value: d.businessRecords.length },
        { label: '累计收汇(CNY)', value: fmt.fmtMoney(stat.totalReceipt) },
        { label: '累计付款(CNY)', value: fmt.fmtMoney(stat.totalPayment) },
        { label: '欠款订单', value: debts.length },
        { label: '订单日期范围', value: dateRange }
      ]
    });
  },

  backupData() {
    const d = db.exportBackup();
    const name = '外贸数据备份_' + fmt.today() + '.json';
    const msg = '订单' + d.orderRecords.length + '条，客户' + d.customerRecords.length + '个，收汇' + d.receiptRecords.length + '条';
    csv.exportFile(name, JSON.stringify(d, null, 2), function () {
      wx.showToast({ title: '备份完成：' + msg, icon: 'none' });
    });
  },

  restoreData() {
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
            if (!data || typeof data !== 'object') { wx.showToast({ title: '备份文件格式不正确', icon: 'none' }); return; }
            const hasAny = Object.keys(db.KEYS).some(k => Array.isArray(data[k]));
            if (!hasAny) { wx.showToast({ title: '备份文件不含外贸数据', icon: 'none' }); return; }
            const lines = Object.keys(db.KEYS).map(k => {
              const label = { orderRecords: '订单', customerRecords: '客户', exportRecords: '出口', invoiceRecords: '发票', receiptRecords: '收汇', indexPaymentRecords: '付款', memoRecords: '备忘录', businessRecords: '业务跟踪' }[k];
              return label + ' ' + (Array.isArray(data[k]) ? data[k].length : 0) + ' 条';
            }).join('\n');
            wx.showModal({
              title: '确认恢复',
              content: lines + '\n\n此操作将覆盖当前所有数据！',
              confirmColor: '#FF3B30', confirmText: '恢复',
              success: m => {
                if (!m.confirm) return;
                db.importBackup(data);
                wx.showToast({ title: '数据恢复成功', icon: 'success' });
                this.render();
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
    wx.showLoading({ title: '正在拉取…' });
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      if (ok) wx.showToast({ title: '已从云端同步（' + count + ' 项）', icon: 'success' });
      else wx.showToast({ title: '同步失败，请检查网络', icon: 'none' });
      this.render();
    });
  },

  goWorkspace() { wx.reLaunch({ url: '/pages/home/home' }); }
});
