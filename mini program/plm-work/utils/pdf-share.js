/**
 * pdf-share.js — PDF 生成与分享入口（两步式）
 *
 * 微信限制 wx.shareFileMessage 必须在用户 TAP 手势的同步调用栈中触发，
 * 因此把“生成文件”和“发送文件”拆成两个独立动作：
 *   第一步按钮 → buildFile()：渲染 Canvas → JPEG → PDF → 写文件（可异步/重活）
 *   第二步按钮 → sharePrepared()：tap 中直接同步调起 wx.shareFileMessage
 * 禁止在 Promise.then / setTimeout / 写文件回调里调 shareFileMessage。
 */

var pdfBuilder = require('./pdf-builder');
var docRenderers = require('./doc-renderers');
var fmt = require('./format');

// 最近一次生成的文件信息（供分享失败时相册兜底）
var lastBuilt = { filePath: '', firstJpg: null };

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
 * 第一步：渲染并生成 PDF 文件（不触发分享，可在任意时机调用）
 * @param {Function} renderFn - 渲染函数，同步返回 {canvas,width,height} 或数组
 * @param {*} data - 传给渲染函数的数据
 * @param {string} fileName - PDF 文件名（不含扩展名）
 * @param {string} orientation - 'portrait' | 'landscape'
 * @param {Function} done - done(success:boolean, filePath?:string)
 */
function buildFile(renderFn, data, fileName, orientation, done) {
  wx.showLoading({ title: '生成PDF中...', mask: true });

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

  lastBuilt = { filePath: filePath, firstJpg: images[0].data, fileName: fileName + '.pdf' };
  wx.hideLoading();
  done && done(true, filePath);
  }
}

/**
 * 第二步：发送已生成的 PDF 给微信好友
 * 必须在 bindtap 处理函数中直接、同步调用（不要包 Promise/setTimeout/回调）。
 * @param {string} [filePath] - buildFile 返回的路径；不传则用最近一次生成的文件
 * @param {Function} [done] - done(success:boolean, reason?:string)
 */
function sharePrepared(filePath, done) {
  var path = filePath || lastBuilt.filePath;
  if (!path) {
    wx.showToast({ title: '请先生成PDF', icon: 'none' });
    done && done(false, 'empty');
    return;
  }
  // 路径用安全名写入，分享显示名保留中文（lastBuilt.fileName 由 buildFile 记录）
  wx.shareFileMessage({
    filePath: path,
    fileName: lastBuilt.fileName || path.substring(path.lastIndexOf('/') + 1),
    success: function () {
      wx.showToast({ title: '已发送', icon: 'success' });
      done && done(true);
    },
    fail: function (err) {
      var msg = (err && err.errMsg) || '';
      // 用户主动取消分享 → 只提示，不存图片
      if (/cancel/i.test(msg)) {
        wx.showToast({ title: '已取消分享', icon: 'none' });
        done && done(false, 'cancel');
        return;
      }
      // 真实错误 → 提示错误原因，并提供"存为图片"兜底
      wx.showModal({
        title: 'PDF分享失败',
        content: '错误：' + msg + '\n\n可将首页保存为图片，或稍后重试。',
        showCancel: true,
        cancelText: '知道了',
        confirmText: '存为图片',
        success: function (res) {
          if (res.confirm) {
            saveFirstJpgToAlbum(lastBuilt.firstJpg, function () {});
          }
        }
      });
      done && done(false, 'fail');
    }
  });
}

/**
 * 保存首页 JPEG 到相册（分享失败的回退方案）
 */
function saveFirstJpgToAlbum(jpgData, done) {
  if (!jpgData) { done && done(false); return; }
  try {
    var path = wx.env.USER_DATA_PATH + '/doc_page.jpg';
    wx.getFileSystemManager().writeFileSync(path, jpgData.buffer);
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
  buildFile: buildFile,
  sharePrepared: sharePrepared,
  canvasToJPEG: canvasToJPEG,
  base64ToUint8Array: base64ToUint8Array,
  docRenderers: docRenderers
};
