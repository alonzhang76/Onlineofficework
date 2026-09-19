/**
 * pdf-share.js — PDF 生成与分享入口
 * 流程：渲染 Canvas → 导出 JPEG → 构造 PDF → 写文件 → 分享
 */

var pdfBuilder = require('./pdf-builder');
var docRenderers = require('./doc-renderers');
var fmt = require('./format');

/**
 * 从离屏 Canvas 导出 JPEG Uint8Array
 */
function canvasToJPEG(canvas, quality) {
  // 微信小程序 Canvas 2D API: 离屏 canvas 可用 canvas.toDataURL
  var dataURL = '';
  try {
    dataURL = canvas.toDataURL('image/jpeg', quality || 1.0);
  } catch (e) {
    // 某些小程序版本不支持离屏 canvas.toDataURL
    return null;
  }
  // data:image/jpeg;base64,... → Uint8Array
  var base64 = dataURL.split(',')[1];
  return base64ToUint8Array(base64);
}

function base64ToUint8Array(b64) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var lookup = {};
  for (var i = 0; i < 64; i++) lookup[chars[i]] = i;
  var bytes = [];
  for (var i = 0; i < b64.length; i += 4) {
    var a = lookup[b64[i]] || 0;
    var b = lookup[b64[i + 1]] || 0;
    var c = lookup[b64[i + 2]] || 0;
    var d = lookup[b64[i + 3]] || 0;
    var n = (a << 18) | (b << 12) | (c << 6) | d;
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

/**
 * 生成 PDF 并分享
 * @param {Function} renderFn - 渲染函数，返回 {canvas, width, height} 或数组
 * @param {*} data - 传给渲染函数的数据
 * @param {string} fileName - PDF 文件名（不含扩展名）
 * @param {string} orientation - 'portrait' | 'landscape'
 * @param {Function} done - 完成回调 done(success)
 */
function generateAndShare(renderFn, data, fileName, orientation, done) {
  wx.showLoading({ title: '生成PDF中...' });

  // 渲染页面（支持同步返回或返回 Promise 的渲染函数，如生产通知单需预加载 LOGO 图片）
  var syncResult;
  try {
    syncResult = renderFn(data);
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '渲染失败: ' + (e.message || ''), icon: 'none' });
    done && done(false);
    return;
  }
  if (syncResult && typeof syncResult.then === 'function') {
    syncResult.then(renderPdfPages, function (e) {
      wx.hideLoading();
      wx.showToast({ title: '渲染失败: ' + ((e && e.message) || e), icon: 'none' });
      done && done(false);
    });
    return;
  }
  renderPdfPages(syncResult);

  function renderPdfPages(result) {
    // 归一化为数组
  var pages = Array.isArray(result) ? result : [result];
  if (pages.length === 0) {
    wx.hideLoading();
    wx.showToast({ title: '无内容可生成', icon: 'none' });
    done && done(false);
    return;
  }

  // 导出每页为 JPEG
  var images = [];
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    var imgData = canvasToJPEG(p.canvas);
    if (!imgData) {
      wx.hideLoading();
      wx.showToast({ title: 'Canvas 导出失败', icon: 'none' });
      done && done(false);
      return;
    }
    // PDF 图像对象的宽高必须是 JPEG 的真实物理像素（2x），与排版用逻辑尺寸区分
    images.push({
      data: imgData,
      width: p.pixelWidth || p.width,
      height: p.pixelHeight || p.height
    });
  }

  // 构造 PDF
  var pdfBuffer;
  try {
    pdfBuffer = pdfBuilder.buildPDF(images, { orientation: orientation || 'portrait' });
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: 'PDF构造失败: ' + (e.message || ''), icon: 'none' });
    done && done(false);
    return;
  }

  // 写文件（pdfBuffer 为 ArrayBuffer，直接写入，不传 encoding）
  var fs = wx.getFileSystemManager();
  // 文件名中的中文/特殊字符可能导致 wx.shareFileMessage 失败，路径用安全名，分享显示名保留中文
  var safeName = String(fileName).replace(/[^\w\-]/g, '_');
  var filePath = wx.env.USER_DATA_PATH + '/' + safeName + '_' + fmt.today() + '.pdf';
  try {
    fs.writeFileSync(filePath, pdfBuffer);
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '文件写入失败: ' + (e.message || ''), icon: 'none' });
    done && done(false);
    return;
  }
  // 校验文件是否写入成功
  var stat = null;
  try { stat = fs.statSync(filePath); } catch (e2) {}
  if (!stat || stat.size === 0) {
    wx.hideLoading();
    wx.showToast({ title: 'PDF文件生成失败', icon: 'none' });
    done && done(false);
    return;
  }

  wx.hideLoading();

  // 分享为 PDF 文件给微信好友
  wx.shareFileMessage({
    filePath: filePath,
    fileName: fileName + '.pdf',
    success: function () {
      wx.showToast({ title: '已发送', icon: 'success' });
      done && done(true);
    },
    fail: function (err) {
      var msg = (err && err.errMsg) || '';
      // 用户主动取消分享 → 只提示，不存图片
      if (msg.indexOf('cancel') >= 0) {
        wx.showToast({ title: '已取消分享', icon: 'none' });
        done && done(false);
        return;
      }
      // 真实错误 → 提示错误，不自动存图片（避免用户误以为是图片分享）
      wx.showModal({
        title: 'PDF分享失败',
        content: '错误：' + msg + '\n\n可尝试在"文件"中手动发送，或重新生成。',
        showCancel: true,
        cancelText: '知道了',
        confirmText: '存为图片',
        success: function (res) {
          if (res.confirm) {
            saveFirstPageToAlbum(pages[0], function () {});
          }
        }
      });
      done && done(false);
    }
  });
  }
}

/**
 * 保存第一页为图片到相册（回退方案）
 */
function saveFirstPageToAlbum(page, done) {
  if (!page || !page.canvas) { done && done(false); return; }
  try {
    var dataURL = page.canvas.toDataURL('image/jpeg', 1.0);
    var base64 = dataURL.split(',')[1];
    var fs = wx.getFileSystemManager();
    var path = wx.env.USER_DATA_PATH + '/doc_page.jpg';
    fs.writeFileSync(path, base64ToUint8Array(base64).buffer);
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () {
        wx.showToast({ title: '已保存图片到相册', icon: 'success' });
        done && done(true);
      },
      fail: function () { done && done(false); }
    });
  } catch (e) {
    done && done(false);
  }
}

module.exports = {
  generateAndShare: generateAndShare,
  canvasToJPEG: canvasToJPEG,
  base64ToUint8Array: base64ToUint8Array,
  docRenderers: docRenderers
};
