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
  // 微信小程序 Canvas 2D API: canvas.toDataURL 不可用
  // 使用 wx.canvasToTempFilePath 但需要真实的 canvas node
  // 离屏 canvas 可以用 canvas.toDataURL
  var dataURL = '';
  try {
    dataURL = canvas.toDataURL('image/jpeg', quality || 0.92);
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
    if (b64[i + 2] !== '=') bytes.push((n >> 16) & 0xFF);
    if (b64[i + 3] !== '=') bytes.push((n >> 8) & 0xFF);
    bytes.push(n & 0xFF);
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

  // 渲染页面
  var result;
  try {
    result = renderFn(data);
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '渲染失败: ' + (e.message || ''), icon: 'none' });
    done && done(false);
    return;
  }

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
    images.push({ data: imgData, width: p.width, height: p.height });
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

  // 写文件
  var fs = wx.getFileSystemManager();
  var filePath = wx.env.USER_DATA_PATH + '/' + fileName + '_' + fmt.today() + '.pdf';
  try {
    fs.writeFileSync(filePath, pdfBuffer, 'binary');
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '文件写入失败', icon: 'none' });
    done && done(false);
    return;
  }

  wx.hideLoading();

  // 分享
  wx.shareFileMessage({
    filePath: filePath,
    success: function () {
      wx.showToast({ title: '已发送', icon: 'success' });
      done && done(true);
    },
    fail: function (err) {
      // 分享失败 → 尝试保存图片到相册作为回退
      saveFirstPageToAlbum(pages[0], function (ok) {
        if (!ok) {
          wx.showToast({ title: '分享已取消', icon: 'none' });
        }
        done && done(false);
      });
    }
  });
}

/**
 * 保存第一页为图片到相册（回退方案）
 */
function saveFirstPageToAlbum(page, done) {
  if (!page || !page.canvas) { done && done(false); return; }
  try {
    var dataURL = page.canvas.toDataURL('image/jpeg', 0.92);
    var base64 = dataURL.split(',')[1];
    var fs = wx.getFileSystemManager();
    var path = wx.env.USER_DATA_PATH + '/doc_page.jpg';
    fs.writeFileSync(path, base64ToUint8Array(base64).buffer, 'binary');
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
