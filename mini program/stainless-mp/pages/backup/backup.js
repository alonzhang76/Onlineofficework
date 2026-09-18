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

  /** 平台：devtools / windows / mac 上可直接存磁盘，手机走微信发送 */
  getPlatform() {
    try {
      if (wx.getDeviceInfo && wx.getDeviceInfo().platform) return wx.getDeviceInfo().platform;
    } catch (e) {}
    try { return wx.getSystemInfoSync().platform || ''; } catch (e) { return ''; }
    return '';
  },

  /** 导出备份 JSON：电脑端直接存盘，手机端通过微信（可选文件传输助手）发到电脑 */
  exportBackup() {
    if (this.data._exporting) return;
    const keys = cb.CONFIG.namespaces.app;
    const backup = { backupTime: new Date().toISOString(), app: cb.CONFIG.env };
    keys.forEach(k => { backup[k] = db.get(k); });
    const content = JSON.stringify(backup, null, 2);
    const stamp = fmt.today() + '-' + String(Date.now()).slice(-6);
    const path = (wx.env.USER_DATA_PATH || '') + '/backup-' + stamp + '.json';
    try {
      wx.getFileSystemManager().writeFileSync(path, content, 'utf8');
    } catch (err) {
      console.warn('[backup] 写入失败', err);
      wx.showToast({ title: '备份生成失败', icon: 'none' });
      return;
    }

    const isDesktop = ['devtools', 'windows', 'mac'].indexOf(this.getPlatform()) >= 0;
    const saveToDisk = (onUnsupported) => {
      if (typeof wx.saveFileToDisk !== 'function') { onUnsupported(); return; }
      wx.showLoading({ title: '正在保存…', mask: true });
      wx.saveFileToDisk({
        filePath: path,
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '已保存到电脑', icon: 'success' });
        },
        fail: (e) => {
          wx.hideLoading();
          const msg = (e && e.errMsg) || '';
          if (/cancel/i.test(msg)) return;
          onUnsupported(msg);
        }
      });
    };
    const shareToWeChat = (onFail) => {
      if (typeof wx.shareFileMessage !== 'function') { onFail('当前微信版本不支持文件发送'); return; }
      this.data._exporting = true;
      wx.shareFileMessage({
        filePath: path,
        fileName: 'backup-' + stamp + '.json',
        success: () => {
          this.data._exporting = false;
          wx.showToast({ title: '已发送，可在电脑微信接收', icon: 'none' });
        },
        fail: (e) => {
          this.data._exporting = false;
          const msg = (e && e.errMsg) || '';
          if (/cancel/i.test(msg)) return;
          onFail(msg);
        }
      });
    };

    if (isDesktop) {
      // 电脑端优先存磁盘，不支持时退回微信发送，最后兜底弹窗给出文件路径
      saveToDisk(() => shareToWeChat(() => {
        wx.showModal({ title: '备份已生成', content: '文件路径：' + path, showCancel: false });
      }));
    } else {
      // 手机端走微信分享（可选「文件传输助手」）
      shareToWeChat(() => saveToDisk(() => {
        wx.showModal({ title: '备份已生成', content: '文件路径：' + path, showCancel: false });
      }));
    }
  },

  /** 从电脑恢复：手机从微信聊天记录选文件，电脑端直接选磁盘文件 */
  importBackup() {
    wx.showModal({
      title: '从电脑恢复',
      content: '手机：请先让电脑微信把备份文件发到「文件传输助手」，确定后从聊天记录中选取；\n电脑微信/开发者工具：确定后直接选择磁盘上的备份文件。',
      confirmText: '选择文件',
      success: (r) => {
        if (!r.confirm) return;
        this.chooseBackupFile();
      }
    });
  },

  chooseBackupFile() {
    if (typeof wx.chooseMessageFile !== 'function') {
      wx.showToast({ title: '当前微信版本不支持选文件', icon: 'none' });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: res => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f) return;
        wx.showLoading({ title: '正在恢复…', mask: true });
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: 'utf8',
          success: r => {
            wx.hideLoading();
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
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '读取文件失败', icon: 'none' });
          }
        });
      },
      fail: (e) => {
        if (e && /cancel/i.test(e.errMsg || '')) return;
        wx.showToast({ title: '未选择文件', icon: 'none' });
      }
    });
  }
});
