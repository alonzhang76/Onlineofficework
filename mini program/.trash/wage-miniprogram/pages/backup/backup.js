const db = require('../../utils/db');
const fmt = require('../../utils/format');
const supa = require('../../utils/supabase');

Page({
  data: { overview: [], cloudOn: false },

  onShow() { this.render(); },

  render() {
    const totalAmount = db.data.records.reduce((s, r) => s + (+r.totalAmount || 0), 0);
    const totalQty = db.data.records.reduce((s, r) => s + (+r.quantity || 0), 0);
    const dates = db.data.records.map(r => r.date).filter(Boolean).sort();
    const dateRange = dates.length ? dates[0] + ' ~ ' + dates[dates.length - 1] : '-';
    this.setData({
      cloudOn: supa.isConfigured(),
      overview: [
        { label: '工序记录', value: db.data.records.length },
        { label: '员工人数', value: db.data.employees.length },
        { label: '在职员工', value: db.data.employees.filter(e => e.status === '1' || !e.leaveDate).length },
        { label: '工序种类', value: db.data.processes.length },
        { label: '订单数量', value: db.data.orders.length },
        { label: '日历事件', value: db.data.calendarEvents.length },
        { label: '总金额', value: fmt.fmtMoney(totalAmount) },
        { label: '总数量', value: Math.round(totalQty) },
        { label: '记录日期范围', value: dateRange }
      ]
    });
  },

  backupData() {
    const d = {};
    Object.keys(db.KEYS).forEach(k => { d[k] = db.data[k]; });
    d.version = '1.0';
    d.exportDate = new Date().toISOString();
    const now = new Date();
    const name = '工资数据备份_' + now.getFullYear() + fmt.pad(now.getMonth() + 1) + fmt.pad(now.getDate()) + '.json';
    const msg = '记录' + d.records.length + '条，员工' + d.employees.length + '人，订单' + d.orders.length + '条，事件' + d.calendarEvents.length + '个';
    require('../../utils/csv').exportFile(name, JSON.stringify(d, null, 2), function () {
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
            if (!data.records || !data.employees) { wx.showToast({ title: '备份文件格式不正确', icon: 'none' }); return; }
            wx.showModal({
              title: '确认恢复',
              content: '工资记录 ' + data.records.length + ' 条\n员工 ' + data.employees.length + ' 人\n工序 ' + (data.processes || []).length + ' 项\n订单 ' + (data.orders || []).length + ' 条\n日历事件 ' + (data.calendarEvents || []).length + ' 个\n\n此操作将覆盖当前所有数据！',
              confirmColor: '#FF3B30', confirmText: '恢复',
              success: m => {
                if (!m.confirm) return;
                Object.keys(db.KEYS).forEach(k => {
                  if (k === 'dropdownOptions') { if (data[k]) Object.assign(db.data.dropdownOptions, data[k]); }
                  else if (k === 'calendarEventTypes') { if (Array.isArray(data[k]) && data[k].length) db.data.calendarEventTypes = data[k]; }
                  else if (Array.isArray(data[k])) db.data[k] = data[k];
                });
                Object.keys(db.KEYS).forEach(k => db.save(k));
                wx.showToast({ title: '数据恢复成功', icon: 'success' });
                this.render();
              }
            });
          },
          fail() { wx.showToast({ title: '文件读取失败', icon: 'none' }); }
        });
      }
    });
  }
});
