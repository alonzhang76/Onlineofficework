/**
 * pdf-share.js — 合同 PDF 生成与分享（两步式）
 * 离屏 Canvas 页面 → JPEG → PDF 1.4 → 写临时文件 → wx.shareFileMessage 转发微信好友
 * 渲染器为异步（需等待 logo/印章图片加载），因此 pages 支持 Promise。
 *
 * 微信限制 wx.shareFileMessage 必须在用户 TAP 手势的同步调用栈中触发，
 * 所以拆成两步：
 *   第一步按钮 → buildPages()：await 渲染 + 写文件（异步重活）
 *   第二步按钮 → sharePrepared()：tap 中直接同步调起 wx.shareFileMessage
 */
const pdfBuilder = require('./pdf-builder');

// 最近一次生成的文件信息（供失败兜底）
let lastBuilt = { filePath: '', firstJpg: null };

function canvasToJPEG(canvas, quality) {
  let dataURL = '';
  try {
    dataURL = canvas.toDataURL('image/jpeg', quality || 0.92);
  } catch (e) {
    return null;
  }
  return base64ToUint8Array(dataURL.split(',')[1]);
}

function base64ToUint8Array(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = {};
  for (let i = 0; i < 64; i++) lookup[chars[i]] = i;
  const bytes = [];
  for (let i = 0; i < b64.length; i += 4) {
    const a = lookup[b64[i]] || 0;
    const b = lookup[b64[i + 1]] || 0;
    const c = lookup[b64[i + 2]] || 0;
    const d = lookup[b64[i + 3]] || 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (b64[i + 2] !== '=') {
      bytes.push((n >> 16) & 0xFF);
      if (b64[i + 3] !== '=') {
        bytes.push((n >> 8) & 0xFF);
        bytes.push(n & 0xFF);
      }
    }
  }
  return new Uint8Array(bytes);
}

function today() {
  const d = new Date();
  const p = x => (x < 10 ? '0' + x : '' + x);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function safeFileName(fileName) {
  return String(fileName || '合同').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

/**
 * 第一步：等待渲染完成并写出 PDF 文件（不触发分享）
 * @param pagesOrPromise renderContract() 的结果（页面数组或其 Promise）
 * @param fileName 文件名（不含扩展名）
 * @returns {Promise<{filePath:string, safeName:string}>}
 */
function buildPages(pagesOrPromise, fileName) {
  wx.showLoading({ title: '正在生成合同…', mask: true });
  return Promise.resolve(pagesOrPromise).then(pages0 => {
    const pages = Array.isArray(pages0) ? pages0 : [pages0];
    if (!pages.length) throw new Error('empty');

    const images = pages.map(p => ({
      data: canvasToJPEG(p.canvas),
      width: p.pixelWidth || p.width,
      height: p.pixelHeight || p.height
    }));
    if (images.some(im => !im.data)) throw new Error('canvas export');

    const pdfBuffer = pdfBuilder.buildPDF(images, { orientation: 'portrait' });
    const safeName = safeFileName(fileName);
    const filePath = (wx.env.USER_DATA_PATH || '') + '/' + safeName + '_' + today() + '.pdf';
    wx.getFileSystemManager().writeFileSync(filePath, pdfBuffer, 'binary');
    lastBuilt = { filePath, firstJpg: images[0].data };
    wx.hideLoading();
    return { filePath, safeName };
  }).catch(err => {
    wx.hideLoading();
    console.warn('[pdf-share] 生成失败', err);
    wx.showToast({ title: '生成失败：' + ((err && err.message) || err), icon: 'none' });
    throw err;
  });
}

/**
 * 第二步：发送已生成的 PDF 给微信好友
 * 必须在 bindtap 处理函数中直接、同步调用（不要包 Promise/setTimeout/回调）。
 */
function sharePrepared(filePath, done) {
  const path = filePath || lastBuilt.filePath;
  if (!path) {
    wx.showToast({ title: '请先生成PDF', icon: 'none' });
    done && done(false, 'empty');
    return;
  }
  wx.shareFileMessage({
    filePath: path,
    success: () => {
      wx.showToast({ title: '已发送给好友', icon: 'success' });
      done && done(true);
    },
    fail: (err) => {
      const msg = (err && err.errMsg) || '';
      if (/cancel/i.test(msg)) {
        done && done(false, 'cancel');
        return;
      }
      // 其它失败：首页存相册兜底
      saveFirstJpgToAlbum(lastBuilt.firstJpg, ok => {
        if (!ok) {
          wx.showModal({
            title: 'PDF 已生成',
            content: '发送未完成，文件已保存到本机，可稍后重试：' + path,
            showCancel: false
          });
        }
        done && done(false, 'fail');
      });
    }
  });
}

function saveFirstJpgToAlbum(jpgData, cb) {
  try {
    if (!jpgData) { cb(false); return; }
    const path = (wx.env.USER_DATA_PATH || '') + '/contract_preview.jpg';
    wx.getFileSystemManager().writeFileSync(path, jpgData.buffer, 'binary');
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => { wx.showToast({ title: '首页已存相册', icon: 'success' }); cb(true); },
      fail: () => cb(false)
    });
  } catch (e) { cb(false); }
}

module.exports = { buildPages, sharePrepared, canvasToJPEG, base64ToUint8Array };
