/**
 * 数据备份页
 * - 云端同步（拉取 + 推送）
 * - 导出 JSON 备份（通过微信聊天/文件发送）
 * - 导入恢复（选择聊天中的备份文件，整包覆盖并推云端）
 */
const db = require('../../utils/db');
const cb = require('../../utils/cloudbase');
const fmt = require('../../utils/format');

Page({
  data: {
    cloudOn: false,
    syncing: false,
    lastSyncText: '',
    keyCount: 0,
    recordCount: 0
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.user) {
      app.globalData.user = cb.getUser();
    }
    if (!app.globalData.user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.render();
  },

  render() {
    const keys = cb.CONFIG.namespaces.app;
    let count = 0;
    keys.forEach(k => {
      const v = db.get(k);
      count += Array.isArray(v) ? v.length : (v && typeof v === 'object' ? 1 : 0);
    });
    let last = '';
    try { last = wx.getStorageSync('_last_sync_text') || ''; } catch (e) {}
    this.setData({
      cloudOn: cb.isConfigured(),
      keyCount: keys.length,
      recordCount: count,
      lastSyncText: last
    });
  },

  /** 从云端拉取合并 */
  pullCloud() {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    db.syncFromCloud((changed, applied) => {
      this.setData({ syncing: false });
      const text = '上次同步：' + fmt.nowTime();
      try { wx.setStorageSync('_last_sync_text', text); } catch (e) {}
      this.render();
      if (changed === false && applied === 0) {
        wx.showToast({ title: '同步失败，请检查网络', icon: 'none' });
      } else {
        wx.showToast({ title: changed ? ('已同步（' + applied + ' 项更新）') : '已同步（无变化）', icon: 'none' });
      }
    });
  },

  /** 导出备份 JSON 并发送 */
  exportBackup() {
    const keys = cb.CONFIG.namespaces.app;
    const backup = { backupTime: new Date().toISOString(), app: cb.CONFIG.env };
    keys.forEach(k => { backup[k] = db.get(k); });
    const content = JSON.stringify(backup, null, 2);
    const path = (wx.env.USER_DATA_PATH || '') + '/backup-' + fmt.today() + '.json';
    try {
      const fs = wx.getFileSystemManager();
      fs.writeFileSync(path, content, 'utf8');
      wx.shareFileMessage({
        filePath: path,
        success: () => wx.showToast({ title: '备份已发送', icon: 'success' }),
        fail: (e) => {
          if (e && /cancel/i.test(e.errMsg || '')) return;
          wx.showModal({
            title: '备份已生成',
            content: '文件已保存到：' + path + '\n（发送失败时可在电脑端开发者工具中取出）',
            showCancel: false
          });
        }
      });
    } catch (err) {
      console.warn('[backup] 导出失败', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  /** 导入恢复 */
  importBackup() {
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
            try {
              const data = JSON.parse(r.data);
              if (!data || !data.backupTime) throw new Error('格式不对');
              const keys = cb.CONFIG.namespaces.app;
              let applied = 0;
              keys.forEach(k => {
                if (data[k] !== undefined) {
                  db.replace(k, data[k], true);
                  applied++;
                }
              });
              // 批量推云端（跳过 suppress，直接入队）
              keys.forEach(k => { if (data[k] !== undefined) db.save(k); });
              wx.showModal({
                title: '恢复完成',
                content: '已恢复 ' + applied + ' 个数据集\n备份时间：' + data.backupTime.replace('T', ' ').slice(0, 19),
                showCancel: false
              });
              this.render();
            } catch (e) {
              wx.showToast({ title: '无效的备份文件', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' })
        });
      }
    });
  }
});
