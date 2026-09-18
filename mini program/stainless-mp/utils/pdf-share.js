/**
 * pdf-share.js — 合同 PDF 生成与分享
 * 离屏 Canvas 页面 → JPEG → PDF 1.4 → 写临时文件 → wx.shareFileMessage 转发微信好友
 * 渲染器为异步（需等待 logo/印章图片加载），因此 pages 支持 Promise。
 */
const pdfBuilder = require('./pdf-builder');

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

/**
 * @param pagesOrPromise renderContract() 的结果（已渲染页面数组或其 Promise）
 * @param fileName 文件名（不含扩展名）
 * @param done 回调 done(success:boolean, filePath?:string)
 */
function sharePages(pagesOrPromise, fileName, done) {
  wx.showLoading({ title: '正在生成合同…', mask: true });
  Promise.resolve(pagesOrPromise).then(pages0 => {
    const pages = Array.isArray(pages0) ? pages0 : [pages0];
    if (!pages.length) throw new Error('empty');

    const images = pages.map(p => ({
      data: canvasToJPEG(p.canvas),
      width: p.pixelWidth || p.width,
      height: p.pixelHeight || p.height
    }));
    if (images.some(im => !im.data)) throw new Error('canvas export');

    const pdfBuffer = pdfBuilder.buildPDF(images, { orientation: 'portrait' });
    const safeName = String(fileName || '合同').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
    const filePath = (wx.env.USER_DATA_PATH || '') + '/' + safeName + '_' + today() + '.pdf';
    wx.getFileSystemManager().writeFileSync(filePath, pdfBuffer, 'binary');
    wx.hideLoading();

    wx.shareFileMessage({
      filePath: filePath,
      fileName: safeName + '.pdf',
      success: () => {
        wx.showToast({ title: '已发送给好友', icon: 'success' });
        done && done(true, filePath);
      },
      fail: (err) => {
        if (err && /cancel/i.test(err.errMsg || '')) {
          done && done(false, filePath);
          return;
        }
        // 分享失败：尝试把首页存相册兜底
        saveFirstPageToAlbum(pages[0], ok => {
          if (!ok) wx.showModal({
            title: 'PDF 已生成',
            content: '文件已保存：' + filePath,
            showCancel: false
          });
          done && done(false, filePath);
        });
      }
    });
  }).catch(err => {
    wx.hideLoading();
    console.warn('[pdf-share] 生成失败', err);
    wx.showToast({ title: '生成失败：' + ((err && err.message) || ''), icon: 'none' });
    done && done(false);
  });
}

function saveFirstPageToAlbum(page, cb) {
  try {
    const dataURL = page.canvas.toDataURL('image/jpeg', 0.92);
    const path = (wx.env.USER_DATA_PATH || '') + '/contract_preview.jpg';
    wx.getFileSystemManager().writeFileSync(path,
      base64ToUint8Array(dataURL.split(',')[1]).buffer, 'binary');
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => { wx.showToast({ title: '首页已存相册', icon: 'success' }); cb(true); },
      fail: () => cb(false)
    });
  } catch (e) { cb(false); }
}

module.exports = { sharePages, canvasToJPEG, base64ToUint8Array };
