/**
 * 云存储（CloudBase 文件中心）—— wage / trade(外贸出口) / schedule(订单排程) 共用
 *
 * 对齐网页版各应用的「☁️ 云存储」页签（移植自 saintysys/cb-files.html）：
 *   - 分区上传：图片 / PDF / Excel / Word / PPT / 其他
 *   - 文件管理器：目录层级浏览、预览/打开、下载链接、删除
 *   - 应用间云端路径隔离：wage/ 、wicketorders/ 、orderschedule/（与网页版一致）
 */
const cbFiles = require('../../utils/cb-files');

const ZONES = [
  { key: 'image', icon: '🖼️', name: '图片', folder: '图片文件', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'], type: 'image' },
  { key: 'pdf', icon: '📄', name: 'PDF', folder: 'PDF 文件', exts: ['pdf'], type: 'file' },
  { key: 'excel', icon: '📊', name: 'Excel', folder: 'Excel 表格', exts: ['xlsx', 'xls', 'xlsm', 'csv'], type: 'file' },
  { key: 'word', icon: '📝', name: 'Word', folder: 'Word 文档', exts: ['doc', 'docx'], type: 'file' },
  { key: 'ppt', icon: '📽️', name: 'PPT', folder: 'PPT 演示', exts: ['ppt', 'pptx'], type: 'file' },
  { key: 'other', icon: '📎', name: '其他', folder: '其他文件', exts: null, type: 'file' }
];

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const DOC_EXTS = ['pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx'];

const TITLES = {"main":"服装外贸系统 · 云存储"};

Page({
  data: {
    app: 'wage',
    title: '',
    root: '',
    zones: ZONES.map(z => ({ key: z.key, icon: z.icon, name: z.name })),
    // 当前目录（应用内相对路径，'' 为根）
    cur: '',
    crumbs: [],
    folders: [],
    files: [],
    loading: false,
    uploading: false,
    statusText: '',
    statusOk: false
  },

  onLoad(options) {
    const app = options.app || 'wage';
    wx.setNavigationBarTitle({ title: TITLES[app] || '云存储' });
    this.setData({ app: app, root: cbFiles.rootOf(app) });
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh(() => wx.stopPullDownRefresh());
  },

  /** 刷新当前目录 */
  refresh(done) {
    this.setData({ loading: true });
    cbFiles.list(this.data.cur, this.data.app).then(res => {
      this.setData({
        loading: false,
        folders: res.folders.map(f => ({
          name: f.name,
          path: f.path,
          icon: this.folderIcon(f.name)
        })),
        files: res.files.map(f => Object.assign({}, f, {
          sizeText: this.fmtSize(f.size),
          icon: this.fileIcon(f.name),
          isImage: IMAGE_EXTS.indexOf(this.extOf(f.name)) > -1
        })),
        crumbs: this.buildCrumbs(this.data.cur),
        statusText: 'CloudBase 云存储已连接',
        statusOk: true
      });
      if (typeof done === 'function') done();
    }).catch(err => {
      console.warn('[cloudfiles] 列目录失败', err);
      this.setData({
        loading: false,
        statusText: 'CloudBase 云存储连接失败：' + this.errText(err),
        statusOk: false
      });
      wx.showToast({ title: '加载文件列表失败', icon: 'none' });
      if (typeof done === 'function') done();
    });
  },

  /* ============ 上传 ============ */

  /** 点击分区卡片 → 选文件并上传 */
  pickAndUpload(e) {
    if (this.data.uploading) return;
    const zone = ZONES.find(z => z.key === e.currentTarget.dataset.zone);
    if (!zone) return;

    if (zone.type === 'image') {
      wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        success: res => {
          const files = (res.tempFiles || []).map(f => ({
            path: f.tempFilePath,
            name: this.fileNameOf(f.tempFilePath)
          }));
          this.uploadBatch(zone, files);
        }
      });
    } else {
      wx.chooseMessageFile({
        count: 9,
        type: 'file',
        success: res => {
          const files = (res.tempFiles || []).filter(f => this.matchZone(f.name, zone))
            .map(f => ({ path: f.path, name: f.name, size: f.size }));
          if (!files.length) {
            wx.showToast({ title: '所选文件不属于' + zone.name + '分区', icon: 'none' });
            return;
          }
          this.uploadBatch(zone, files);
        }
      });
    }
  },

  uploadBatch(zone, files) {
    if (!files.length) return;
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传 0/' + files.length, mask: true });
    let ok = 0, failed = [];
    const next = i => {
      if (i >= files.length) {
        wx.hideLoading();
        this.setData({ uploading: false });
        if (ok) wx.showToast({ title: '成功上传 ' + ok + ' 个文件', icon: 'success' });
        if (failed.length) wx.showModal({
          title: '部分文件上传失败',
          content: failed.join('\n'),
          showCancel: false
        });
        this.refresh();
        return;
      }
      const f = files[i];
      wx.showLoading({ title: '上传 ' + (i + 1) + '/' + files.length, mask: true });
      cbFiles.upload(this.data.app, zone.folder, f.path, f.name).then(() => {
        ok++; next(i + 1);
      }).catch(err => {
        console.warn('[cloudfiles] 上传失败', f.name, err);
        failed.push(f.name + '：' + this.errText(err));
        next(i + 1);
      });
    };
    next(0);
  },

  /* ============ 目录浏览 ============ */

  enterFolder(e) {
    const path = e.currentTarget.dataset.path;
    this.setData({ cur: path }, () => this.refresh());
  },

  tapCrumb(e) {
    const path = e.currentTarget.dataset.path;
    this.setData({ cur: path }, () => this.refresh());
  },

  /* ============ 文件操作 ============ */

  tapFile(e) {
    const idx = e.currentTarget.dataset.index;
    const file = this.data.files[idx];
    if (!file) return;
    wx.showActionSheet({
      itemList: file.isImage ? ['预览图片', '复制下载链接', '删除'] : ['打开 / 预览', '复制下载链接', '删除'],
      success: res => {
        if (res.tapIndex === 0) this.openFile(file);
        else if (res.tapIndex === 1) this.copyLink(file);
        else if (res.tapIndex === 2) this.deleteFile(file);
      }
    });
  },

  openFile(file) {
    wx.showLoading({ title: '获取文件…', mask: true });
    cbFiles.downloadUrl(this.data.app, file).then(url => {
      wx.downloadFile({
        url: url,
        success: dres => {
          wx.hideLoading();
          if (file.isImage) {
            wx.previewImage({ urls: [dres.tempFilePath] });
          } else if (DOC_EXTS.indexOf(this.extOf(file.name)) > -1) {
            wx.openDocument({
              filePath: dres.tempFilePath,
              showMenu: true,
              fail: () => wx.showToast({ title: '无法打开该格式', icon: 'none' })
            });
          } else {
            wx.showToast({ title: '该格式仅支持下载链接', icon: 'none' });
          }
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      console.warn('[cloudfiles] 获取下载链接失败', err);
      wx.showToast({ title: this.errText(err), icon: 'none' });
    });
  },

  copyLink(file) {
    wx.showLoading({ title: '获取链接…', mask: true });
    cbFiles.downloadUrl(this.data.app, file).then(url => {
      wx.hideLoading();
      wx.setClipboardData({ data: url });
    }).catch(err => {
      wx.hideLoading();
      console.warn('[cloudfiles] 获取下载链接失败', err);
      wx.showToast({ title: this.errText(err), icon: 'none' });
    });
  },

  deleteFile(file) {
    wx.showModal({
      title: '删除文件',
      content: '确定删除「' + file.name + '」吗？此操作不可恢复。',
      confirmText: '删除',
      confirmColor: '#e02020',
      success: res => {
        if (!res.confirm) return;
        cbFiles.remove(this.data.app, file).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        }).catch(err => {
          console.warn('[cloudfiles] 删除失败', err);
          wx.showToast({ title: '删除失败：' + this.errText(err), icon: 'none' });
        });
      }
    });
  },

  /* ============ 工具 ============ */

  buildCrumbs(cur) {
    const crumbs = [{ name: '根目录', path: '' }];
    if (!cur) return crumbs;
    const parts = cur.split('/');
    let acc = '';
    parts.forEach(p => {
      acc = acc ? acc + '/' + p : p;
      crumbs.push({ name: p, path: acc });
    });
    return crumbs;
  },

  folderIcon(name) {
    const map = { '图片文件': '🖼️', 'PDF 文件': '📄', 'Excel 表格': '📊', 'Word 文档': '📝', 'PPT 演示': '📽️', '其他文件': '📎' };
    return map[name] || '📁';
  },

  fileIcon(name) {
    const e = this.extOf(name);
    if (IMAGE_EXTS.indexOf(e) > -1) return '🖼️';
    if (e === 'pdf') return '📄';
    if (['xlsx', 'xls', 'xlsm', 'csv'].indexOf(e) > -1) return '📊';
    if (['doc', 'docx'].indexOf(e) > -1) return '📝';
    if (['ppt', 'pptx'].indexOf(e) > -1) return '📽️';
    return '📎';
  },

  extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  },

  matchZone(name, zone) {
    if (!zone.exts) return true;
    return zone.exts.indexOf(this.extOf(name)) > -1;
  },

  fileNameOf(path) {
    const m = /[\\/]([^\\/]+)$/.exec(String(path || ''));
    return m ? m[1] : ('image-' + Date.now() + '.jpg');
  },

  fmtSize(bytes) {
    const n = +bytes || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  },

  errText(err) {
    const d = err && (err.data || err);
    return String((d && (d.message || d.errMsg || d.error_description)) || (err && err.message) || '未知错误');
  }
});
