const db = require('../../../utils/income-db');
const fmt = require('../../../utils/format');
const supa = require('../../../utils/cloudbase');
const csv = require('../../../utils/csv');

Page({
  data: { counts: { c1: 0, c2: 0, todos: 0 } },

  onShow() { this.render(); },

  render() {
    this.setData({
      counts: {
        c1: db.listTx('company1').length,
        c2: db.listTx('company2').length,
        todos: db.listTodos().length
      }
    });
  },

  backupData() {
    const d = db.exportBackup();
    const name = '收支数据备份_' + fmt.today() + '.json';
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
            // 兼容网页版导出格式：{version, data:{transactions...}} → 解包
            if (data && data.data && typeof data.data === 'object' && !data.transactions) data = data.data;
            if (!data || !data.transactions) { wx.showToast({ title: '备份文件不含收支数据', icon: 'none' }); return; }
            const c1 = (data.transactions.company1 || []).length;
            const c2 = (data.transactions.company2 || []).length;
            wx.showModal({
              title: '确认恢复',
              content: '普利美 ' + c1 + ' 笔、无锡龙力 ' + c2 + ' 笔，此操作将覆盖当前全部收支数据！',
              confirmColor: '#FF3B30', confirmText: '恢复',
              success: m => {
                if (!m.confirm) return;
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
    db.syncFromCloud((ok, count) => {
      wx.hideLoading();
      this.render();
      if (ok) wx.showToast({ title: '已拉取云端（' + count + ' 项）', icon: 'success' });
      else wx.showToast({ title: '拉取失败，请检查网络', icon: 'none' });
    });
  }
});
