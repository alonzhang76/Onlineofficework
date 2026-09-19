/**
 * canvas-renderer.js — 通用 Canvas 2D 绘图工具
 * 封装离屏画布创建、文本/表格/二维码绘制等。
 * 所有函数在微信小程序 Canvas 2D API 下工作。
 */

// A4 基础像素尺寸（96 DPI），实际渲染时乘以 RENDER_SCALE
var RENDER_SCALE = 2; // 2x = ~192 DPI，文字清晰
var A4 = {
  landscape: { w: 1190, h: 842 },
  portrait: { w: 842, h: 1190 }
};

/**
 * 创建离屏画布（高分辨率）
 */
function createPage(orientation) {
  var size = A4[orientation] || A4.portrait;
  var actualW = size.w * RENDER_SCALE;
  var actualH = size.h * RENDER_SCALE;
  var canvas = wx.createOffscreenCanvas({ type: '2d', width: actualW, height: actualH });
  var ctx = canvas.getContext('2d');
  // 缩放绘图坐标系，使上层代码仍用基础尺寸坐标
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  // 白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.w, size.h);
  // width/height 为逻辑（绘图坐标）尺寸，pixelWidth/pixelHeight 为画布物理像素尺寸
  return {
    canvas: canvas,
    ctx: ctx,
    width: size.w,
    height: size.h,
    pixelWidth: actualW,
    pixelHeight: actualH
  };
}

/**
 * 绘制文本
 * @param {Object} opts - {ctx, text, x, y, font, size, color, align, baseline, maxWidth, weight}
 */
function drawText(opts) {
  var ctx = opts.ctx;
  var weight = opts.weight || 'normal';
  var size = opts.size || 12;
  ctx.font = weight + ' ' + size + 'px sans-serif';
  ctx.fillStyle = opts.color || '#000000';
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'top';
  if (opts.maxWidth) {
    ctx.fillText(opts.text, opts.x, opts.y, opts.maxWidth);
  } else {
    ctx.fillText(opts.text, opts.x, opts.y);
  }
}

/**
 * 绘制多行文本（自动换行）
 */
function drawTextLines(ctx, text, x, y, maxWidth, lineHeight, size, color) {
  ctx.font = 'normal ' + (size || 12) + 'px sans-serif';
  ctx.fillStyle = color || '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  var chars = text.split('');
  var line = '';
  var yy = y;
  for (var i = 0; i < chars.length; i++) {
    var test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = chars[i];
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + lineHeight;
}

/**
 * 绘制表格
 * @param {Object} opts - {ctx, x, y, columns: [{title, width, align}], rows: [[v1,v2...]], headerHeight, rowHeight, fontSize, headerColor, borderColor}
 */
function drawTable(opts) {
  var ctx = opts.ctx;
  var x = opts.x, y = opts.y;
  var columns = opts.columns;
  var rows = opts.rows || [];
  var headerH = opts.headerHeight || 28;
  var rowH = opts.rowHeight || 24;
  var fontSize = opts.fontSize || 11;
  var totalW = 0;
  for (var i = 0; i < columns.length; i++) totalW += columns[i].width;

  // 表头背景
  ctx.fillStyle = opts.headerColor || '#f0f0f0';
  ctx.fillRect(x, y, totalW, headerH);

  // 表头文字
  ctx.font = 'bold ' + fontSize + 'px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  var cx = x;
  for (var i = 0; i < columns.length; i++) {
    ctx.textAlign = columns[i].align || 'left';
    var tx = cx;
    if (columns[i].align === 'center') tx = cx + columns[i].width / 2;
    if (columns[i].align === 'right') tx = cx + columns[i].width - 4;
    ctx.fillText(columns[i].title, tx, y + headerH / 2);
    cx += columns[i].width;
  }

  // 行
  ctx.font = 'normal ' + fontSize + 'px sans-serif';
  for (var r = 0; r < rows.length; r++) {
    var ry = y + headerH + r * rowH;
    // 斑马纹
    if (r % 2 === 1) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(x, ry, totalW, rowH);
    }
    cx = x;
    for (var i = 0; i < columns.length; i++) {
      ctx.fillStyle = '#000000';
      ctx.textAlign = columns[i].align || 'left';
      var tx = cx;
      if (columns[i].align === 'center') tx = cx + columns[i].width / 2;
      if (columns[i].align === 'right') tx = cx + columns[i].width - 4;
      var val = rows[r][i];
      if (val === undefined || val === null) val = '';
      ctx.fillText(String(val), tx, ry + rowH / 2);
      cx += columns[i].width;
    }
  }

  // 边框
  ctx.strokeStyle = opts.borderColor || '#999999';
  ctx.lineWidth = 0.5;
  // 外框
  ctx.strokeRect(x, y, totalW, headerH + rows.length * rowH);
  // 列分割线
  cx = x;
  for (var i = 0; i < columns.length - 1; i++) {
    cx += columns[i].width;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + headerH + rows.length * rowH);
    ctx.stroke();
  }
  // 行分割线
  for (var r = 0; r <= rows.length; r++) {
    var ry = y + headerH + r * rowH;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + totalW, ry);
    ctx.stroke();
  }

  return y + headerH + rows.length * rowH; // 返回底部 y
}

/**
 * 绘制二维码
 * @param {Object} ctx - canvas context
 * @param {boolean[][]} matrix - 二维码矩阵
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} size - 总尺寸（px）
 */
function drawQRCode(ctx, matrix, x, y, size) {
  var n = matrix.length;
  var cell = size / n;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#000000';
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
}

/**
 * 绘制矩形边框
 */
function drawRect(ctx, x, y, w, h, color, lineWidth) {
  ctx.strokeStyle = color || '#999999';
  ctx.lineWidth = lineWidth || 1;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 绘制填充矩形
 */
function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color || '#ffffff';
  ctx.fillRect(x, y, w, h);
}

/**
 * 绘制水平线
 */
function drawHLine(ctx, x, y, w, color, lineWidth) {
  ctx.strokeStyle = color || '#999999';
  ctx.lineWidth = lineWidth || 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

/**
 * 绘制图片（等比缩放到边界框并居中）
 * @param {Object} opts - {ctx, img, x, y, maxW, maxH} img 须为已加载完成的 Image 对象
 * @returns {boolean} 是否成功绘制
 */
function drawImage(opts) {
  var ctx = opts.ctx;
  var img = opts.img;
  if (!img || !img.width || !img.height) return false;
  var maxW = opts.maxW, maxH = opts.maxH;
  var scale = Math.min(maxW / img.width, maxH / img.height);
  var dw = img.width * scale, dh = img.height * scale;
  var dx = opts.x + (maxW - dw) / 2;
  var dy = opts.y + (maxH - dh) / 2;
  try { ctx.drawImage(img, dx, dy, dw, dh); return true; } catch (e) { return false; }
}

module.exports = {
  A4: A4,
  createPage: createPage,
  drawText: drawText,
  drawTextLines: drawTextLines,
  drawTable: drawTable,
  drawQRCode: drawQRCode,
  drawRect: drawRect,
  fillRect: fillRect,
  drawHLine: drawHLine,
  drawImage: drawImage
};
