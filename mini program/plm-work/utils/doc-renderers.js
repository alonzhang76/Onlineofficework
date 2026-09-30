/**
 * doc-renderers.js — 单据渲染器
 * 参照网页版 CSS 布局，用 Canvas 绘制各类单据。
 * 每个渲染函数返回 {canvas, width, height}，供 pdf-share 导出。
 */

var cv = require('./canvas-renderer');
var qr = require('./qrcode-matrix');
var fmt = require('./format');

// ============================================================
// 生产通知单 — 横向 A4
// 参照网页版 生产通知单.html 的 .print-area.a4-landscape 布局
// ============================================================
function renderProductionNotice(data) {
  var page = cv.createPage('landscape');
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var margin = 38; // ~10mm at 96dpi

  // --- 顶部：公司信息（左）+ 订单信息（右）---
  var rightX = W - margin - 420;
  var rightW = 420;

  // 左侧公司
  cv.drawText({ ctx: ctx, text: '普利美', x: margin, y: margin, size: 22, weight: 'bold', color: '#000000' });
  cv.drawText({ ctx: ctx, text: '生产通知单', x: margin + 80, y: margin, size: 22, weight: 'bold', color: '#000000' });
  cv.drawText({ ctx: ctx, text: 'PRODUCTION ORDER', x: margin + 80, y: margin + 26, size: 10, color: '#000000' });
  cv.drawText({ ctx: ctx, text: '公司名称：普利美（常州）环境工程科技有限公司', x: margin, y: margin + 52, size: 10, color: '#000000' });
  cv.drawText({ ctx: ctx, text: '地址：常州市武进区雪堰镇周南路8号6-1（中南高科常州雪堰智造产业园）', x: margin, y: margin + 68, size: 10, color: '#000000' });
  cv.drawText({ ctx: ctx, text: '电话：139 5158 9291', x: margin, y: margin + 84, size: 10, color: '#000000' });

  // 右侧订单信息（2×2 网格）
  var fieldY = margin;
  var colW = rightW / 2 - 10;
  var rowH = 38;
  var fields = [
    { label: '下单日期', value: data.orderDate || '' },
    { label: '订单号', value: data.orderNumber || '' },
    { label: '客户', value: data.customer || '' },
    { label: '交货日期', value: data.deliveryDate || '' }
  ];
  for (var i = 0; i < fields.length; i++) {
    var col = i % 2, row = Math.floor(i / 2);
    var fx = rightX + col * (colW + 20);
    var fy = fieldY + row * rowH;
    cv.drawText({ ctx: ctx, text: fields[i].label, x: fx, y: fy, size: 9, color: '#000000' });
    cv.drawText({ ctx: ctx, text: fields[i].value, x: fx, y: fy + 14, size: 12, color: '#000000', weight: 'bold' });
  }

  // --- 交货期提醒 ---
  var alertY = margin + 110;
  if (data.deliveryDate) {
    var today = new Date();
    var delivery = new Date(data.deliveryDate);
    var days = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
    if (days >= 0 && days <= 7) {
      cv.fillRect(ctx, margin, alertY, W - margin * 2, 36, '#fffbeb');
      cv.drawRect(ctx, margin, alertY, W - margin * 2, 36, '#fde68a', 1);
      cv.drawText({ ctx: ctx, text: '⚠ 交货期提醒：距离交货期还有' + days + '天，请确保按时完成生产。', x: margin + 8, y: alertY + 10, size: 11, color: '#000000' });
      alertY += 44;
    } else if (days < 0) {
      cv.fillRect(ctx, margin, alertY, W - margin * 2, 36, '#fef2f2');
      cv.drawRect(ctx, margin, alertY, W - margin * 2, 36, '#fecaca', 1);
      cv.drawText({ ctx: ctx, text: '⚠ 交货期已过' + (-days) + '天，请尽快安排生产。', x: margin + 8, y: alertY + 10, size: 11, color: '#000000' });
      alertY += 44;
    }
  }

  // --- 产品表格 ---
  var tableY = alertY + 10;
  var tableW = W - margin * 2;
  var products = data.products || [];
  // 表格列：产品名称/规格/图号/电镀/LOGO/数量
  var colWidths = [tableW * 0.22, tableW * 0.18, tableW * 0.15, tableW * 0.13, tableW * 0.12, tableW * 0.20];
  var columns = [
    { title: '产品名称', width: colWidths[0], align: 'left' },
    { title: '规格', width: colWidths[1], align: 'left' },
    { title: '图号', width: colWidths[2], align: 'left' },
    { title: '电镀', width: colWidths[3], align: 'left' },
    { title: 'LOGO', width: colWidths[4], align: 'left' },
    { title: '数量', width: colWidths[5], align: 'right' }
  ];
  var headerH = 26, rowH = 22, fontSize = 10;

  // 预加载 LOGO 图片：仅 LOGO_IMAGE_FILES 中登记的名称才加载图片，其余（含 KBA）显示文字
  var LOGO_IMAGE_FILES = { 'K&B': 'kba.png' };
  var logoImages = {};
  var logoNames = {};
  products.forEach(function (p) { if (p.bowLogo && LOGO_IMAGE_FILES[p.bowLogo]) logoNames[p.bowLogo] = 1; });
  var fs = wx.getFileSystemManager();

  function loadLogo(name) {
    return new Promise(function (resolve) {
      var file = LOGO_IMAGE_FILES[name];
      if (!file) { resolve(); return; }
      var path = '/assets/logos/' + file;
      var dataUrl = null;
      try {
        var buf = fs.readFileSync(path);
        dataUrl = 'data:image/png;base64,' + wx.arrayBufferToBase64(buf);
      } catch (e) { /* 文件不存在，回退文字 */ }
      if (!dataUrl) { resolve(); return; }
      var img = page.canvas.createImage();
      img.onload = function () { logoImages[name] = img; resolve(); };
      img.onerror = function () { resolve(); };
      img.src = dataUrl;
    });
  }

  return Promise.all(Object.keys(logoNames).map(loadLogo)).then(function () {
    // 构造行：有图的 LOGO 单元格留空（图后画），无图显示名称
    var rows = products.map(function (p) {
      var logoCell = (p.bowLogo && logoImages[p.bowLogo]) ? '' : (p.bowLogo || '');
      return [p.productName || '', p.specification || '', p.drawingNumber || '', p.plating || '', logoCell, p.quantity || ''];
    });

    // 合计行
    var totalQty = products.reduce(function (s, p) {
      return s + (parseFloat(p.quantity) || 0);
    }, 0);
    rows.push(['合计', '', '', '', '', String(totalQty)]);

    var tableBottom = cv.drawTable({
      ctx: ctx, x: margin, y: tableY,
      columns: columns, rows: rows,
      headerHeight: headerH, rowHeight: rowH, fontSize: fontSize
    });

    // 在有图的 LOGO 单元格画图片（等比缩放居中）
    var logoColX = margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
    var logoColW = colWidths[4];
    products.forEach(function (p, idx) {
      var im = p.bowLogo && logoImages[p.bowLogo];
      if (im) {
        var ry = tableY + headerH + idx * rowH;
        cv.drawImage({ ctx: ctx, img: im, x: logoColX + 2, y: ry, maxW: logoColW - 4, maxH: rowH - 4 });
      }
    });

    // --- 备注 ---
    var remarkY = tableBottom + 16;
    if (data.remark) {
      cv.drawHLine(ctx, margin, remarkY, tableW, '#999999', 1);
      cv.drawText({ ctx: ctx, text: '备注：', x: margin, y: remarkY + 6, size: 11, weight: 'bold', color: '#000000' });
      cv.drawTextLines(ctx, data.remark, margin + 44, remarkY + 6, tableW - 44, 16, 11, '#000000');
    }

    // --- 底部签字栏 ---
    var signY = H - margin - 70;
    var signColW = (W - margin * 2) / 4;
    var signLabels = ['制单', '审核', '生产', '日期'];
    var signValues = [data.createdBy || '', data.approvedBy || '', data.productionBy || '', data.signDate || ''];
    for (var s = 0; s < 4; s++) {
      var sx = margin + s * signColW;
      cv.drawText({ ctx: ctx, text: signLabels[s], x: sx + signColW / 2, y: signY, size: 11, weight: 'bold', align: 'center' });
      cv.drawHLine(ctx, sx + 20, signY + 40, signColW - 40, '#999999', 1);
      cv.drawText({ ctx: ctx, text: signValues[s], x: sx + signColW / 2, y: signY + 44, size: 9, color: '#000000', align: 'center' });
    }

    return page;
  });
}

// ============================================================
// 制作箱唛 — 纵向 A4
// 参照网页版 merged_order_labels.html 的箱唛布局
// ============================================================
function renderBoxMark(form, pageNo, totalPages) {
  var page = cv.createPage('portrait');
  var ctx = page.ctx;
  var W = page.width;
  var margin = 56;

  // --- 顶部标题 ---
  cv.drawText({ ctx: ctx, text: 'SHIPPING MARKS', x: W / 2, y: margin, size: 18, weight: 'bold', align: 'center' });
  cv.drawHLine(ctx, margin, margin + 52, W - margin * 2, '#000000', 2);

  // --- 客户名称（分隔线下方、靠左、大号粗体）---
  cv.drawText({ ctx: ctx, text: form.company || '', x: margin, y: margin + 66, size: 16, weight: 'bold', color: '#000000', align: 'left', maxWidth: W - margin * 2 });

  // --- 信息字段（两列）---
  var fieldY = margin + 104;
  var leftColX = margin;
  var rightColX = W / 2 + 10;
  var rowH = 36;

  var fields = [
    { label: 'PO No.', value: form.po || '', col: 0, row: 0 },
    { label: 'Art No.', value: form.artNo || '', col: 1, row: 0 },
    { label: 'Maschinennr.', value: form.maschinenNr || '', col: 0, row: 1 },
    { label: 'Projekt Nr.', value: form.projektNr || '', col: 1, row: 1 },
    { label: 'Package No.', value: pageNo + ' / ' + totalPages, col: 0, row: 2 },
    { label: 'Unit', value: form.unit || '', col: 1, row: 2 },
    { label: 'Total Qty', value: form.totalQty || '', col: 0, row: 3 },
    { label: 'Qty Per Box', value: form.perBoxQty || form.qtyPerBox || '', col: 1, row: 3 },
    { label: 'Total Boxes', value: form.totalBoxes || '', col: 0, row: 4 }
  ];

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var fx = f.col === 0 ? leftColX : rightColX;
    var fy = fieldY + f.row * rowH;
    if (!f.value && f.value !== 0 && f.label !== 'Package No.') continue;
    cv.drawText({ ctx: ctx, text: f.label + ':', x: fx, y: fy, size: 10, color: '#000000' });
    cv.drawText({ ctx: ctx, text: String(f.value), x: fx + 100, y: fy, size: 12, color: '#000000', weight: 'bold' });
  }

  // --- 二维码（扫描后显示所有字段内容）---
  var qrSize = 180;
  var qrX = (W - qrSize) / 2;
  var qrY = fieldY + 5 * rowH + 20;
  var qrLines = [
    'Company: ' + (form.company || ''),
    'PO: ' + (form.po || ''),
    'Art No: ' + (form.artNo || ''),
    'Maschinennr: ' + (form.maschinenNr || ''),
    'Projekt Nr: ' + (form.projektNr || ''),
    'Unit: ' + (form.unit || ''),
    'Total Qty: ' + (form.totalQty || ''),
    'Qty Per Box: ' + (form.perBoxQty || form.qtyPerBox || ''),
    'Total Boxes: ' + (form.totalBoxes || ''),
    'Package No: ' + pageNo + '/' + totalPages
  ];
  if (pageNo === totalPages && form.remark) qrLines.push('Remarks: ' + form.remark);
  var qrText = qrLines.join('\n');
  try {
    var matrix = qr.generateQRMatrix(qrText);
    cv.drawQRCode(ctx, matrix, qrX, qrY, qrSize);
  } catch (e) {
    // 二维码生成失败时绘制占位框
    cv.drawRect(ctx, qrX, qrY, qrSize, qrSize, '#cccccc', 1);
    cv.drawText({ ctx: ctx, text: 'QR Code', x: qrX + qrSize / 2, y: qrY + qrSize / 2 - 6, size: 12, color: '#000000', align: 'center' });
  }

  // --- Remarks（仅最后一箱显示）---
  if (pageNo === totalPages && form.remark) {
    var remarkY = qrY + qrSize + 24;
    cv.drawHLine(ctx, margin, remarkY, W - margin * 2, '#999999', 1);
    cv.drawText({ ctx: ctx, text: 'Remarks:', x: margin, y: remarkY + 6, size: 11, weight: 'bold', color: '#000000' });
    cv.drawTextLines(ctx, form.remark, margin + 60, remarkY + 6, W - margin * 2 - 60, 16, 11, '#000000');
  }

  return page;
}

// ============================================================
// 商业发票 — 纵向 A4
// 参照网页版 customs-doc-generator.html 发票布局
// ============================================================
function renderInvoice(doc) {
  var page = cv.createPage('portrait');
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var margin = 48;

  // 标题
  cv.drawText({ ctx: ctx, text: 'COMMERCIAL INVOICE', x: W / 2, y: margin, size: 20, weight: 'bold', align: 'center' });
  cv.drawText({ ctx: ctx, text: '商业发票', x: W / 2, y: margin + 28, size: 14, color: '#000000', align: 'center' });

  // 发票号/日期
  var infoY = margin + 60;
  cv.drawText({ ctx: ctx, text: 'Invoice No.: ' + (doc.invoiceNo || ''), x: margin, y: infoY, size: 11, color: '#000000' });
  cv.drawText({ ctx: ctx, text: 'Date: ' + (doc.invoiceDate || fmt.today()), x: W - margin - 200, y: infoY, size: 11, color: '#000000' });

  // 卖方/买方
  var partyY = infoY + 30;
  cv.drawText({ ctx: ctx, text: 'Seller:', x: margin, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.seller || '', margin + 50, partyY, W / 2 - margin - 50, 14, 10, '#000000');
  cv.drawText({ ctx: ctx, text: 'Buyer:', x: W / 2, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.buyer || '', W / 2 + 50, partyY, W / 2 - margin - 50, 14, 10, '#000000');

  // 贸易条款
  var termsY = partyY + 70;
  var termsFields = [
    { label: 'Trade Terms', value: doc.tradeTerms || '' },
    { label: 'Port of Loading', value: doc.loadingPort || '' },
    { label: 'Port of Delivery', value: doc.deliveryPort || '' },
    { label: 'Country of Origin', value: doc.originCountry || '' }
  ];
  for (var i = 0; i < termsFields.length; i++) {
    var tx = margin + (i % 2) * (W / 2 - margin);
    var ty = termsY + Math.floor(i / 2) * 28;
    cv.drawText({ ctx: ctx, text: termsFields[i].label + ': ' + termsFields[i].value, x: tx, y: ty, size: 10, color: '#000000' });
  }

  // 装箱明细表
  var tableY = termsY + 70;
  var tableW = W - margin * 2;
  var items = doc.items || [];
  var columns = [
    { title: 'No.', width: tableW * 0.06, align: 'center' },
    { title: 'Description', width: tableW * 0.30, align: 'left' },
    { title: 'HS Code', width: tableW * 0.12, align: 'center' },
    { title: 'Qty', width: tableW * 0.10, align: 'right' },
    { title: 'Unit', width: tableW * 0.07, align: 'center' },
    { title: 'Unit Price', width: tableW * 0.13, align: 'right' },
    { title: 'Amount', width: tableW * 0.22, align: 'right' }
  ];
  var rows = items.map(function (it, idx) {
    return [idx + 1, it.description || '', it.hsCode || '', it.quantity || '', it.unit || '', it.unitPrice || '', it.amount || ''];
  });
  // 合计行
  var totalAmt = items.reduce(function (s, it) { return s + (parseFloat(it.amount) || 0); }, 0);
  rows.push(['', 'TOTAL', '', '', '', '', totalAmt.toFixed(2)]);

  cv.drawTable({
    ctx: ctx, x: margin, y: tableY,
    columns: columns, rows: rows,
    headerHeight: 24, rowHeight: 22, fontSize: 10
  });

  // 签字
  var signY = H - margin - 60;
  cv.drawText({ ctx: ctx, text: 'Signature:', x: margin, y: signY, size: 11, weight: 'bold' });
  cv.drawHLine(ctx, margin + 70, signY + 24, 200, '#000000', 1);

  return page;
}

// ============================================================
// 装箱单 — 纵向 A4
// ============================================================
function renderPackingList(doc) {
  var page = cv.createPage('portrait');
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var margin = 48;

  cv.drawText({ ctx: ctx, text: 'PACKING LIST', x: W / 2, y: margin, size: 20, weight: 'bold', align: 'center' });
  cv.drawText({ ctx: ctx, text: '装箱单', x: W / 2, y: margin + 28, size: 14, color: '#000000', align: 'center' });

  var infoY = margin + 60;
  cv.drawText({ ctx: ctx, text: 'Invoice No.: ' + (doc.invoiceNo || ''), x: margin, y: infoY, size: 11 });
  cv.drawText({ ctx: ctx, text: 'Date: ' + (doc.invoiceDate || fmt.today()), x: W - margin - 200, y: infoY, size: 11 });

  // 买卖方
  var partyY = infoY + 30;
  cv.drawText({ ctx: ctx, text: 'Shipper:', x: margin, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.seller || '', margin + 60, partyY, W / 2 - margin - 60, 14, 10, '#000000');
  cv.drawText({ ctx: ctx, text: 'Consignee:', x: W / 2, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.buyer || '', W / 2 + 60, partyY, W / 2 - margin - 60, 14, 10, '#000000');

  // 明细表
  var tableY = partyY + 70;
  var tableW = W - margin * 2;
  var items = doc.items || [];
  var columns = [
    { title: 'No.', width: tableW * 0.06, align: 'center' },
    { title: 'Description', width: tableW * 0.28, align: 'left' },
    { title: 'CTNs', width: tableW * 0.08, align: 'right' },
    { title: 'Qty', width: tableW * 0.10, align: 'right' },
    { title: 'Unit', width: tableW * 0.08, align: 'center' },
    { title: 'N.W.(kg)', width: tableW * 0.13, align: 'right' },
    { title: 'G.W.(kg)', width: tableW * 0.13, align: 'right' },
    { title: 'Vol(m³)', width: tableW * 0.14, align: 'right' }
  ];
  var rows = items.map(function (it, idx) {
    return [idx + 1, it.description || '', it.cartons || '', it.quantity || '', it.unit || '', it.netWeight || '', it.grossWeight || '', it.volume || ''];
  });
  // 合计
  var totalCtns = items.reduce(function (s, it) { return s + (parseInt(it.cartons) || 0); }, 0);
  var totalNW = items.reduce(function (s, it) { return s + (parseFloat(it.netWeight) || 0); }, 0);
  var totalGW = items.reduce(function (s, it) { return s + (parseFloat(it.grossWeight) || 0); }, 0);
  var totalVol = items.reduce(function (s, it) { return s + (parseFloat(it.volume) || 0); }, 0);
  rows.push(['', 'TOTAL', totalCtns, '', '', totalNW.toFixed(2), totalGW.toFixed(2), totalVol.toFixed(3)]);

  cv.drawTable({
    ctx: ctx, x: margin, y: tableY,
    columns: columns, rows: rows,
    headerHeight: 24, rowHeight: 22, fontSize: 10
  });

  // 签字
  var signY = H - margin - 60;
  cv.drawText({ ctx: ctx, text: 'Signature:', x: margin, y: signY, size: 11, weight: 'bold' });
  cv.drawHLine(ctx, margin + 70, signY + 24, 200, '#000000', 1);

  return page;
}

// ============================================================
// 报关明细 — 纵向 A4
// ============================================================
function renderCustoms(doc) {
  var page = cv.createPage('portrait');
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var margin = 48;

  cv.drawText({ ctx: ctx, text: 'CUSTOMS DECLARATION', x: W / 2, y: margin, size: 18, weight: 'bold', align: 'center' });
  cv.drawText({ ctx: ctx, text: '报关明细', x: W / 2, y: margin + 26, size: 14, color: '#000000', align: 'center' });

  var infoY = margin + 56;
  var infoFields = [
    { label: '运编号', value: doc.shipmentNo || '' },
    { label: '船名/航次', value: doc.vessel || '' },
    { label: '启运港', value: doc.loadingPort || '' },
    { label: '目的港', value: doc.deliveryPort || '' },
    { label: '提运单号', value: doc.bolNo || '' },
    { label: '监管方式', value: doc.supervisionMode || '' },
    { label: '结汇方式', value: doc.settlementMode || '' },
    { label: '出境关别', value: doc.exitCustoms || '' }
  ];
  for (var i = 0; i < infoFields.length; i++) {
    var col = i % 2, row = Math.floor(i / 2);
    var fx = margin + col * (W / 2 - margin);
    var fy = infoY + row * 26;
    cv.drawText({ ctx: ctx, text: infoFields[i].label + ': ' + infoFields[i].value, x: fx, y: fy, size: 10, color: '#000000' });
  }

  // 发货人/收货人
  var partyY = infoY + 4 * 26 + 10;
  cv.drawText({ ctx: ctx, text: '发货人:', x: margin, y: partyY, size: 10, weight: 'bold' });
  cv.drawTextLines(ctx, doc.shipper || '', margin + 55, partyY, W / 2 - margin - 55, 14, 10, '#000000');
  cv.drawText({ ctx: ctx, text: '收货人:', x: W / 2, y: partyY, size: 10, weight: 'bold' });
  cv.drawTextLines(ctx, doc.consignee || '', W / 2 + 55, partyY, W / 2 - margin - 55, 14, 10, '#000000');

  // 明细表
  var tableY = partyY + 70;
  var tableW = W - margin * 2;
  var items = doc.items || [];
  var columns = [
    { title: 'No.', width: tableW * 0.05, align: 'center' },
    { title: 'HS编码', width: tableW * 0.12, align: 'center' },
    { title: '品名', width: tableW * 0.20, align: 'left' },
    { title: '规格', width: tableW * 0.12, align: 'left' },
    { title: '箱数', width: tableW * 0.08, align: 'right' },
    { title: '数量', width: tableW * 0.10, align: 'right' },
    { title: '单价', width: tableW * 0.11, align: 'right' },
    { title: '总重(kg)', width: tableW * 0.11, align: 'right' },
    { title: '体积(m³)', width: tableW * 0.11, align: 'right' }
  ];
  var rows = items.map(function (it, idx) {
    return [idx + 1, it.hsCode || '', it.description || '', it.spec || '', it.cartons || '', it.quantity || '', it.unitPrice || '', it.grossWeight || '', it.volume || ''];
  });

  cv.drawTable({
    ctx: ctx, x: margin, y: tableY,
    columns: columns, rows: rows,
    headerHeight: 24, rowHeight: 22, fontSize: 9
  });

  // 唛头
  var markY = H - margin - 80;
  cv.drawText({ ctx: ctx, text: 'Marks & Numbers:', x: margin, y: markY, size: 10, weight: 'bold' });
  cv.drawTextLines(ctx, doc.marks || '', margin, markY + 18, W - margin * 2, 14, 10, '#000000');

  return page;
}

// ============================================================
// 正式报价单 — 纵向 A4（与桌面端 正式报价单模板.html 同版面）
// ============================================================

// 模板 populateQuotationData 内的专用抬头地址（注意：与报价系统页公司表地址不同）
var QUOTE_FORMAL_ADDRESSES = {
  '无锡龙力印铁设备制造有限公司': 'Room 606, Buliding C ,No.4 Longshan Road, Wangzhuang, New district , Wuxi City , Jiangsu Province, China',
  '普利美(常州)环境工程科技有限公司': '6-1, zhongnan gaoke industrial park, #8 zhounan road, xueyan town, wujin district, Changzhou City, Jiangsu Province, China.P.C.213169',
  '无锡市天梁对外贸易有限公司': 'ROOM605,XINGSHENG BUILDING, NO.900 JIEFANG EAST STREET,WUXI,JIANGSU,CHINA'
};

var QUOTE_TERMS_TEXT = [
  '1. 价格如有变动，恕不另行通知。 Prices are subject to change without prior notice.',
  '2. 交货时间为估算，需确认。 Delivery times are approximate and subject to confirmation.',
  '3. 付款条款必须在订单确认前达成一致。 Payment terms must be agreed upon before order confirmation.',
  '4. 所有产品均受我们的标准保修条件约束。 All products are subject to our standard warranty conditions.'
];

function qThousand(v) {
  var n = Math.round((+v || 0) * 100) / 100;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qQty(v) {
  var n = parseFloat(v);
  if (isNaN(n)) return '0';
  return (Math.round(n * 100) / 100).toString();
}

/** 蓝绿渐变（135deg,#2563eb→#10b981） */
function qGradient(ctx, x0, y0, x1, y1) {
  var g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#2563eb');
  g.addColorStop(1, '#10b981');
  return g;
}

/** 文字按宽度折行（中英混排逐字符断行） */
function qWrap(ctx, text, maxWidth) {
  var s = String(text == null ? '' : text);
  if (!s) return [''];
  var lines = [];
  var line = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    var test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function qRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 信息行：粗体中英标签 + 值 */
function qInfoRow(ctx, x, y, label, value, labelW, valW, opts) {
  opts = opts || {};
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillStyle = '#374151';
  ctx.fillText(label, x, y);
  ctx.font = 'normal 9.5px sans-serif';
  ctx.fillStyle = opts.color || '#1f2937';
  var vx = x + labelW;
  var text = value || 'N/A';
  if (opts.badge) {
    // 红底白字圆角徽章（Terms）
    ctx.font = 'bold 9.5px sans-serif';
    var bw = Math.min(ctx.measureText(text).width + 16, valW);
    qRoundRect(ctx, vx, y - 2, bw, 16, 4);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, vx + 8, y + 6.5, bw - 12);
    ctx.textBaseline = 'top';
  } else {
    var wrapped = qWrap(ctx, text, valW);
    ctx.fillStyle = opts.color || '#1f2937';
    ctx.fillText(wrapped[0], vx, y, valW);
  }
}

function renderQuotation(doc) {
  var pages = [];
  function newPage() { var p = cv.createPage('portrait'); pages.push(p); return p; }

  var page = newPage();
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var M = 40;                    // 页边距
  var tableW = W - M * 2;
  var footerY = H - 38;
  var contentBottom = footerY - 14;

  var h = doc.header || {};
  var company = doc.company || { name: '', nameEn: '' };
  var products = doc.products || [];
  var totals = doc.totals || { subtotal: 0, tax: 0, total: 0 };
  var currency = products.length && products[0].currency ? products[0].currency : 'USD';

  // 列宽（百分比与模板 colgroup 完全一致）
  var colPct = [0.04, 0.07, 0.14, 0.11, 0.12, 0.05, 0.06, 0.08, 0.08, 0.17];
  var cols = colPct.map(function (p) { return tableW * p; });
  var headDef = [
    ['序号', 'No.'], ['产品编号', 'Product No.'], ['产品名称', 'Product Name'],
    ['图号', 'Drawing No.'], ['规格型号', 'Specifications'], ['单位', 'Unit'],
    ['数量', 'Qty'], ['单价', 'Unit Price'], ['金额', 'Amount'], ['备注', 'Remark']
  ];
  var aligns = ['center', 'left', 'left', 'left', 'left', 'center', 'right', 'right', 'right', 'left'];
  var padX = 5, lineH = 11, padY = 4, minRowH = 24, headH = 30;

  /* ---------- 第一页抬头 ---------- */
  var y = 42;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#111827';
  ctx.fillText(company.name || 'N/A', W / 2, y);
  y += 25;
  ctx.font = 'normal 11.5px sans-serif';
  ctx.fillStyle = '#374151';
  ctx.fillText(company.nameEn || '', W / 2, y, W - M * 2);
  y += 17;
  var addr = QUOTE_FORMAL_ADDRESSES[company.name] || '';
  if (addr) {
    ctx.font = 'normal 8.5px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(addr, W / 2, y, W - M * 2);
    y += 13;
  }

  // 渐变标题
  y += 6;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = qGradient(ctx, W / 2 - 130, y, W / 2 + 130, y + 26);
  ctx.fillText('报价单 QUOTATION', W / 2, y);
  y += 30;
  // 2px 渐变分隔线
  ctx.fillStyle = qGradient(ctx, M, y, W - M, y + 2);
  ctx.fillRect(M, y, tableW, 2);
  y += 16;

  /* ---------- 两列信息区 ---------- */
  var colW = (tableW - 16) / 2;
  var leftX = M, rightX = M + colW + 16;
  var rowGap = 19;

  var quoteRows = [
    ['报价单号 Quote No:', h.quoteNo, 118],
    ['报价日期 Quote Date:', h.quoteDate, 118],
    ['有效期至 Valid Until:', h.validUntil, 118]
  ];
  var custRows = [
    ['公司名称 Company:', h.customerCompany, 108],
    ['联系人 Contact:', h.customerContact, 108],
    ['电话 Phone:', h.customerTel, 108],
    ['邮箱 Email:', h.customerEmail, 108]
  ];
  var topY = y;
  quoteRows.forEach(function (r, i) { qInfoRow(ctx, leftX, topY + i * rowGap, r[0], r[1], r[2], colW - r[2]); });
  custRows.forEach(function (r, i) { qInfoRow(ctx, rightX, topY + i * rowGap, r[0], r[1], r[2], colW - r[2]); });
  y = topY + Math.max(quoteRows.length, custRows.length) * rowGap + 10;

  var delRows = [
    ['交货方式 Delivery Method:', h.deliveryMethod, 152],
    ['交货港口/地点 Delivery Port:', h.deliveryLocation, 152],
    ['交货日期 Delivery Date:', h.deliveryDate, 152]
  ];
  var payRows = [
    ['成交条款 Terms:', h.terms, 96, { badge: true }],
    ['付款方式 Payment Method:', h.paymentMethod, 152],
    ['付款比例 Payment Ratio:', h.paymentRatio, 128],
    ['税率 Tax Rate:', h.taxRate, 96]
  ];
  var payY = y;
  delRows.forEach(function (r, i) { qInfoRow(ctx, leftX, payY + i * rowGap, r[0], r[1], r[2], colW - r[2]); });
  payRows.forEach(function (r, i) { qInfoRow(ctx, rightX, payY + i * rowGap, r[0], r[1], r[2], colW - r[2], r[3]); });
  y = payY + Math.max(delRows.length, payRows.length) * rowGap + 12;

  // 产品明细标题（渐变字）
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = qGradient(ctx, M, y, M + 260, y + 16);
  ctx.fillText('产品明细 Product Details', M, y);
  y += 20;

  /* ---------- 产品表明细（支持跨页） ---------- */

  function drawTableHead(x, ty) {
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(x, ty, tableW, headH);
    var cx = x;
    for (var i = 0; i < cols.length; i++) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0d47a1';
      ctx.font = 'bold 9.5px sans-serif';
      ctx.fillText(headDef[i][0], cx + cols[i] / 2, ty + 10, cols[i] - padX);
      ctx.font = 'normal 8px sans-serif';
      ctx.fillText(headDef[i][1], cx + cols[i] / 2, ty + 21, cols[i] - padX);
      cx += cols[i];
    }
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x, ty, tableW, headH);
    var lx = x;
    for (var j = 0; j < cols.length - 1; j++) {
      lx += cols[j];
      ctx.beginPath(); ctx.moveTo(lx, ty); ctx.lineTo(lx, ty + headH); ctx.stroke();
    }
  }

  // 预备每行的显示值与折行
  var rowsData = products.map(function (p, i) {
    return {
      values: [
        String(i + 1), p.productNo, p.productName, p.drawingNumber, p.specification,
        p.unit, qQty(p.quantity), currency + ' ' + qThousand(p.unitPrice),
        currency + ' ' + qThousand((+p.quantity || 0) * (+p.unitPrice || 0)),
        p.remark
      ]
    };
  });

  ctx.font = 'normal 9px sans-serif';
  rowsData.forEach(function (r) {
    r.lines = r.values.map(function (v, ci) { return qWrap(ctx, v, cols[ci] - padX * 2); });
    var maxLines = 1;
    r.lines.forEach(function (ls) { if (ls.length > maxLines) maxLines = ls.length; });
    r.h = Math.max(minRowH, maxLines * lineH + padY * 2);
  });

  var tableTop = y;
  drawTableHead(M, tableTop);
  var cy = tableTop + headH;

  function drawRow(r, rowIdx) {
    var ry = cy;
    // 斑马纹
    if (rowIdx % 2 === 1) { ctx.fillStyle = '#f9fafb'; ctx.fillRect(M, ry, tableW, r.h); }
    // 文字
    ctx.textBaseline = 'top';
    var cx = M;
    for (var ci = 0; ci < cols.length; ci++) {
      var ls = r.lines[ci];
      ctx.textAlign = aligns[ci];
      ctx.fillStyle = '#1f2937';
      ctx.font = ci === 8 ? 'bold 9px sans-serif' : 'normal 9px sans-serif';
      var tx;
      if (aligns[ci] === 'center') tx = cx + cols[ci] / 2;
      else if (aligns[ci] === 'right') tx = cx + cols[ci] - padX;
      else tx = cx + padX;
      for (var li = 0; li < ls.length; li++) {
        if (aligns[ci] === 'center') ctx.fillText(ls[li], tx, ry + padY + li * lineH, cols[ci] - padX * 2);
        else ctx.fillText(ls[li], tx, ry + padY + li * lineH, cols[ci] - padX * 2);
      }
      cx += cols[ci];
    }
    // 单元格边框
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(M, ry, tableW, r.h);
    var lx = M;
    for (var j = 0; j < cols.length - 1; j++) {
      lx += cols[j];
      ctx.beginPath(); ctx.moveTo(lx, ry); ctx.lineTo(lx, ry + r.h); ctx.stroke();
    }
  }

  rowsData.forEach(function (r, i) {
    if (cy + r.h > contentBottom) {
      page = newPage();
      ctx = page.ctx;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(h.quoteNo + '（续 Continued）', M, 24);
      tableTop = 36;
      drawTableHead(M, tableTop);
      cy = tableTop + headH;
    }
    drawRow(r, i);
    cy += r.h;
  });

  var tableEnd = cy;

  /* ---------- 尾部块（合计/备注/条款），空间不足则另起一页 ---------- */

  // 预估尾部高度
  ctx.font = 'normal 9px sans-serif';
  var remarkLines = qWrap(ctx, h.deliveryRemarks || 'N/A', tableW - 120);
  var tailH = 14 /*gap*/ + 86 /*totals*/ + 18 + Math.max(44, remarkLines.length * lineH + 20) + 22 + 18 + 110 /*terms*/;
  if (tableEnd + tailH > contentBottom) {
    page = newPage();
    ctx = page.ctx;
    tableEnd = 50;
  }

  var ty = tableEnd + 14;

  // 合计框（右下 w-72≈260）
  var boxW = 260, boxX = M + tableW - boxW;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#374151';
  ctx.fillText('小计 Subtotal:', boxX, ty + 4);
  ctx.fillText('税费 Tax:', boxX, ty + 26);
  ctx.textAlign = 'right';
  ctx.font = 'normal 10px sans-serif';
  ctx.fillStyle = '#1f2937';
  ctx.fillText(currency + ' ' + qThousand(totals.subtotal), boxX + boxW, ty + 4);
  ctx.fillText(currency + ' ' + qThousand(totals.tax), boxX + boxW, ty + 26);
  // 2px 上边框 + 渐变粗体 Total
  cv.drawHLine(ctx, boxX, ty + 50, boxW, '#d1d5db', 1.5);
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = qGradient(ctx, boxX, ty + 56, boxX + 120, ty + 72);
  ctx.fillText('总计 Total:', boxX, ty + 56);
  ctx.textAlign = 'right';
  ctx.fillText(currency + ' ' + qThousand(totals.total), boxX + boxW, ty + 56);
  ty += 86;

  // 交货备注框（灰边框圆角）
  ty += 4;
  ctx.font = 'normal 9px sans-serif';
  var remarkH = Math.max(44, remarkLines.length * lineH + 20);
  qRoundRect(ctx, M, ty, tableW, remarkH, 8);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillStyle = '#374151';
  ctx.fillText('交货备注', M + 12, ty + 10);
  ctx.fillText('Delivery Remarks:', M + 12, ty + 23);
  ctx.font = 'normal 9px sans-serif';
  ctx.fillStyle = '#1f2937';
  for (var ri = 0; ri < remarkLines.length; ri++) {
    ctx.fillText(remarkLines[ri], M + 110, ty + 10 + ri * lineH, tableW - 124);
  }
  ty += remarkH + 22;

  // 条款和条件标题
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = qGradient(ctx, M, ty, M + 260, ty + 16);
  ctx.fillText('条款和条件 Terms & Conditions', M, ty);
  var termsTop = ty;
  ty += 20;

  // 条款文字（先写，印章后盖在上层）
  ctx.font = 'normal 9px sans-serif';
  QUOTE_TERMS_TEXT.forEach(function (t) {
    var ls = qWrap(ctx, t, tableW);
    ls.forEach(function (l) {
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      ctx.fillText(l, M, ty);
      ty += 13;
    });
    ty += 3;
  });

  // 居中旋转 10° 蓝色印章
  var sealW = 378, sealH = 76; // 100mm × 20mm @96dpi
  var sealCx = W / 2;
  var sealCy = termsTop + (ty - termsTop) / 2;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.translate(sealCx, sealCy);
  ctx.rotate(10 * Math.PI / 180);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  qRoundRect(ctx, -sealW / 2, -sealH / 2, sealW, sealH, 4);
  ctx.stroke();
  ctx.fillStyle = '#2563eb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(company.name || '', 0, -22, sealW - 20);
  ctx.font = 'normal 10.5px sans-serif';
  ctx.fillText(company.nameEn || '', 0, 0, sealW - 20);
  ctx.font = 'italic bold 18px serif';
  ctx.fillText('AlonZhang', 0, 22);
  ctx.restore();

  /* ---------- 页脚（全部页面） ---------- */
  pages.forEach(function (p, pi) {
    var c = p.ctx;
    c.textBaseline = 'top';
    c.font = 'normal 9px sans-serif';
    c.fillStyle = '#999999';
    c.textAlign = 'left';
    c.fillText('Quoted By AlonZhang', M, footerY);
    c.textAlign = 'center';
    c.fillText('Page ' + (pi + 1) + ' / ' + pages.length, W / 2, footerY);
    c.textAlign = 'right';
    c.fillText(doc.today || fmt.today(), W - M, footerY);
  });

  return pages;
}

// ============================================================
// 订单排程·生产通知单 — 横向 A4
// 严格对齐桌面版 apps/orderschedule/生产通知单.html 版面：
// 蓝色(#1a56db)抬头与表头、交货期四色提醒、红底白字备注条、签字栏默认人
// ============================================================
function renderScheduleNotice(data) {
  var page = cv.createPage('landscape');
  var ctx = page.ctx;
  var W = page.width, H = page.height;
  var margin = 38;
  var PRIMARY = '#1a56db';

  // --- 顶部：公司信息（左）+ 订单信息（右）---
  var rightW = 420;
  var rightX = W - margin - rightW;

  // 左侧公司（蓝色大字）
  cv.drawText({ ctx: ctx, text: '普利美', x: margin, y: margin - 4, size: 26, weight: 'bold', color: PRIMARY });
  cv.drawText({ ctx: ctx, text: '生产通知单', x: margin + 96, y: margin - 2, size: 22, weight: 'bold', color: PRIMARY });
  cv.drawText({ ctx: ctx, text: 'PRODUCTION ORDER', x: margin + 96, y: margin + 26, size: 10, color: '#6b7280' });
  cv.drawText({ ctx: ctx, text: '普利美（常州）环境工程科技有限公司', x: margin, y: margin + 54, size: 10.5, color: '#111827' });
  cv.drawText({ ctx: ctx, text: '地址：常州市武进区雪堰镇周南路8号6-1（中南高科常州雪堰智造产业园）', x: margin, y: margin + 71, size: 10, color: '#374151' });
  cv.drawText({ ctx: ctx, text: '电话：139 5158 9291', x: margin, y: margin + 87, size: 10, color: '#374151' });

  // 右侧订单信息（2×2 网格）
  var colW = rightW / 2 - 10;
  var rowH = 38;
  var fields = [
    { label: '下单日期', value: data.orderDate || '' },
    { label: '订单号', value: data.orderNumber || '' },
    { label: '客户', value: data.customer || '' },
    { label: '交货日期', value: data.deliveryDate || '' }
  ];
  for (var fi = 0; fi < fields.length; fi++) {
    var fcol = fi % 2, frow = Math.floor(fi / 2);
    var fx = rightX + fcol * (colW + 20);
    var fy = margin + frow * rowH;
    cv.drawText({ ctx: ctx, text: fields[fi].label, x: fx, y: fy, size: 9, color: '#6b7280' });
    cv.drawText({ ctx: ctx, text: fields[fi].value, x: fx, y: fy + 15, size: 12.5, color: '#111827', weight: 'bold', maxWidth: colW });
  }

  var cursorY = margin + 96;

  // --- 交货期提醒（与桌面版同规则：无日期灰/逾期红/≤3天红紧急/≤7天黄/其余绿）---
  var alert = null;
  if (!data.deliveryDate) {
    alert = { bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280', text: '未设置交货期，请先填写交货日期。' };
  } else {
    var today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    var dl = new Date(data.deliveryDate + 'T00:00:00');
    var days = Math.ceil((dl - today0) / 86400000);
    if (days < 0) {
      alert = { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', text: '已逾期 ' + Math.abs(days) + ' 天！ 请立即处理此订单。', bold: true };
    } else if (days <= 3) {
      alert = { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', text: '紧急！距离交货期仅剩 ' + days + ' 天，请立即安排生产。', bold: true };
    } else if (days <= 7) {
      alert = { bg: '#fffbeb', border: '#fde68a', color: '#92400e', text: '距离交货期还有 ' + days + ' 天，请确保按时完成生产。' };
    } else {
      alert = { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', text: '距离交货期还有 ' + days + ' 天，生产时间充裕。' };
    }
  }
  var alertH = 34;
  cv.fillRect(ctx, margin, cursorY, W - margin * 2, alertH, alert.bg);
  cv.drawRect(ctx, margin, cursorY, W - margin * 2, alertH, alert.border, 1);
  cv.drawText({ ctx: ctx, text: '⚠', x: margin + 10, y: cursorY + 9, size: 12, color: alert.color });
  cv.drawText({
    ctx: ctx, text: alert.text,
    x: margin + 30, y: cursorY + 10, size: 11,
    weight: alert.bold ? 'bold' : 'normal', color: alert.color
  });
  cursorY += alertH + 8;

  // --- 备注条（红底白字，与桌面版一致）---
  if (data.remark) {
    var maxTextW = W - margin * 2 - 70;
    ctx.font = 'normal 11px sans-serif';
    var chars = String(data.remark).split('');
    var lines = [];
    var line = '';
    for (var ci = 0; ci < chars.length; ci++) {
      if (chars[ci] === '\n') { lines.push(line); line = ''; continue; }
      var test = line + chars[ci];
      if (ctx.measureText(test).width > maxTextW && line) {
        lines.push(line);
        line = chars[ci];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 4) lines = lines.slice(0, 4);
    var barH = lines.length * 16 + 14;
    cv.fillRect(ctx, margin, cursorY, W - margin * 2, barH, '#dc2626');
    cv.drawText({ ctx: ctx, text: '备注', x: margin + 12, y: cursorY + 7, size: 11, weight: 'bold', color: '#ffffff' });
    ctx.font = 'normal 11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], margin + 56, cursorY + 7 + li * 16, maxTextW);
    }
    cursorY += barH + 10;
  }

  // --- 产品表格（蓝底白字表头）---
  var tableW = W - margin * 2;
  var products = data.products || [];
  var colWidths = [tableW * 0.22, tableW * 0.18, tableW * 0.15, tableW * 0.13, tableW * 0.12, tableW * 0.20];
  var columns = [
    { title: '产品名称', width: colWidths[0], align: 'left' },
    { title: '规格', width: colWidths[1], align: 'left' },
    { title: '图号', width: colWidths[2], align: 'left' },
    { title: '电镀', width: colWidths[3], align: 'left' },
    { title: 'LOGO', width: colWidths[4], align: 'left' },
    { title: '数量', width: colWidths[5], align: 'right' }
  ];
  var rows = products.map(function (p) {
    return [p.productName || '', p.specification || '', p.drawingNumber || '', p.plating || '', p.bowLogo || '', p.quantity || ''];
  });
  var totalQty = products.reduce(function (s, p) {
    return s + (parseFloat(p.quantity) || 0);
  }, 0);
  rows.push(['合计', '', '', '', '', String(totalQty)]);

  cv.drawTable({
    ctx: ctx, x: margin, y: cursorY,
    columns: columns, rows: rows,
    headerHeight: 28, rowHeight: 23, fontSize: 10.5,
    headerColor: PRIMARY, headerTextColor: '#ffffff',
    borderColor: '#cbd5e1'
  });

  // --- 底部签字栏（默认人与桌面版一致：吴小英/吴小英/许小成/当天）---
  var signY = H - margin - 70;
  var signColW = (W - margin * 2) / 4;
  var signLabels = ['制单', '审核', '生产', '日期'];
  var signValues = [
    data.createdBy || '吴小英',
    data.approvedBy || '吴小英',
    data.productionBy || '许小成',
    data.signDate || fmt.today()
  ];
  for (var si = 0; si < 4; si++) {
    var sx = margin + si * signColW;
    cv.drawText({ ctx: ctx, text: signLabels[si], x: sx + signColW / 2, y: signY, size: 11, weight: 'bold', align: 'center' });
    cv.drawHLine(ctx, sx + 20, signY + 40, signColW - 40, '#9ca3af', 1);
    cv.drawText({ ctx: ctx, text: signValues[si], x: sx + signColW / 2, y: signY + 44, size: 9, color: '#6b7280', align: 'center' });
  }

  return page;
}

// ============================================================
// 采购合同 — A4 纵向
// 1:1 复刻桌面版 apps/purchase-integrated/procurement contract.html 版面：
//   买方抬头（居中 + 下划线）/ 居中大标题「采购合同」/ 右上「合同号·签约地·合同日期」/
//   买卖双方信息两栏 / 二、产品清单（7 列）/ 订单备注 / 数量合计·总金额（含税）·大写金额 /
//   三、合同条款（10 条，交货期由订单带入）/ 签章区（买方加盖公司印章图片）/ 合同生成日期
// ============================================================
var CONTRACT_TERMS = [
  '合同有效期：自合同签订之日起至全部货物交付并验收合格之日止。',
  '交货地点：买方工厂或指定仓库。',
  '交货期：{delivery}前完成全部货物交付。',
  '交货方式：卖方安排并承担所有包装和运输费用。',
  '交货技术参数：货物的技术参数以买方订单及技术资料为准，卖方须严格按照双方确认的图纸、样品及技术要求进行生产和交付。',
  '货物验收：买方在收到货物后7个工作日内完成验收，如发现质量问题需及时通知卖方。',
  '付款方式：验收合格后30个工作日内支付全额货款。',
  '违约责任：如一方违约，需承担合同总金额5%的违约金。',
  '争议解决：双方协商解决，协商不成的提交合同签订地法院诉讼解决。',
  '其他：本合同一式两份，买卖双方各执一份，具有同等法律效力。'
];

function renderPurchaseContract(data) {
  data = data || {};
  var M = 40;
  var page = cv.createPage('portrait');
  var W = page.width, H = page.height;
  var ctx = page.ctx;
  var tableW = W - M * 2;
  var footerY = H - 30;
  var contentBottom = footerY - 16;
  var pages = [page];
  var y = 0;

  function newPage() {
    page = cv.createPage('portrait');
    pages.push(page);
    ctx = page.ctx;
    y = 44;
  }

  /* ---- 印章图片预加载（买方公司章） ---- */
  var chopImg = null;
  var chopReady = new Promise(function (resolve) {
    var file = data.chopFile;
    if (!file) { resolve(); return; }
    try {
      var buf = wx.getFileSystemManager().readFileSync('/assets/logos/' + file);
      var img = page.canvas.createImage();
      img.onload = function () { chopImg = img; resolve(); };
      img.onerror = function () { resolve(); };
      img.src = 'data:image/png;base64,' + wx.arrayBufferToBase64(buf);
    } catch (e) { resolve(); }
  });

  function wrapAt(text, maxWidth, font) {
    ctx.font = font || 'normal 10px sans-serif';
    return qWrap(ctx, text, maxWidth);
  }

  /* ---- 买卖双方信息栏 ---- */
  function partyBox(x, rows, boxW) {
    var labelW = 60, padX = 12;
    var valW = boxW - padX * 2 - labelW;
    var font = 'normal 10px sans-serif';
    ctx.font = font;
    var laid = rows.map(function (r) {
      var val = r[1] || '';
      var lines = val ? qWrap(ctx, val, valW) : ['—'];
      return { label: r[0], lines: lines, bold: !!r[2] };
    });
    var totalLines = laid.reduce(function (s, r) { return s + r.lines.length; }, 0);
    var boxH = 14 + totalLines * 15 + 8;
    cv.fillRect(ctx, x, y, boxW, boxH, '#fafafa');
    qRoundRect(ctx, x, y, boxW, boxH, 6);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.stroke();
    var ty = y + 10;
    laid.forEach(function (r) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#374151';
      ctx.fillText(r.label, x + padX, ty);
      ctx.font = r.bold ? 'bold 10.5px sans-serif' : 'normal 10px sans-serif';
      ctx.fillStyle = '#111827';
      r.lines.forEach(function (l, li) {
        ctx.fillText(l, x + padX + labelW, ty + li * 15, valW);
      });
      ty += r.lines.length * 15;
    });
    return boxH;
  }

  function sectionTitle(t) {
    if (y + 28 > contentBottom) newPage();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 12.5px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(t, M, y);
    y += 8;
    cv.drawHLine(ctx, M, y, tableW, '#e5e7eb', 0.8);
    y += 12;
  }

  /* ---- 产品清单表 ---- */
  var pCols = [0.20, 0.18, 0.11, 0.09, 0.07, 0.13, 0.22];
  var pHeads = ['产品名称', '规格型号', '单价', '数量', '单位', '金额', '说明'];
  var pAligns = ['left', 'left', 'right', 'right', 'center', 'right', 'left'];
  var pWidths = pCols.map(function (p) { return tableW * p; });
  var pHF = 'normal 10px sans-serif';
  var pHeadH = 26, pRowMin = 24, pPadX = 5, pLineH = 13;

  function drawProdHead(ty) {
    cv.fillRect(ctx, M, ty, tableW, pHeadH, '#f3f4f6');
    var cx = M;
    for (var i = 0; i < pHeads.length; i++) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.textBaseline = 'middle';
      ctx.textAlign = pAligns[i] === 'center' ? 'center' : (pAligns[i] === 'right' ? 'right' : 'left');
      var tx = pAligns[i] === 'center' ? cx + pWidths[i] / 2
        : (pAligns[i] === 'right' ? cx + pWidths[i] - pPadX : cx + pPadX);
      ctx.fillText(pHeads[i], tx, ty + pHeadH / 2, pWidths[i] - 2);
      cx += pWidths[i];
    }
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(M, ty, tableW, pHeadH);
    var lx = M;
    for (var j = 0; j < pWidths.length - 1; j++) {
      lx += pWidths[j];
      ctx.beginPath(); ctx.moveTo(lx, ty); ctx.lineTo(lx, ty + pHeadH); ctx.stroke();
    }
    return ty + pHeadH;
  }

  function drawProducts() {
    var products = data.products || [];
    var laid = products.map(function (p) {
      var vals = [
        p.productName || '', p.specification || '',
        '¥' + qThousand(p.unitPrice), qQty(p.quantity), p.unit || '只',
        '¥' + qThousand(p.amount), p.remark || ''
      ];
      ctx.font = pHF;
      var lines = vals.map(function (v, ci) { return qWrap(ctx, v, pWidths[ci] - pPadX * 2); });
      var maxL = 1;
      lines.forEach(function (ls) { if (ls.length > maxL) maxL = ls.length; });
      return { lines: lines, h: Math.max(pRowMin, maxL * pLineH + 10) };
    });

    if (y + pHeadH + pRowMin > contentBottom) newPage();
    var cy = drawProdHead(y);

    laid.forEach(function (r, ri) {
      if (cy + r.h > contentBottom) {
        newPage();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('产品清单（续）', M, 24);
        cy = drawProdHead(36);
      }
      if (ri % 2 === 1) cv.fillRect(ctx, M, cy, tableW, r.h, '#fafafa');
      var cx = M;
      for (var ci = 0; ci < pWidths.length; ci++) {
        ctx.font = pHF;
        ctx.fillStyle = '#1f2937';
        ctx.textBaseline = 'top';
        ctx.textAlign = pAligns[ci] === 'center' ? 'center' : (pAligns[ci] === 'right' ? 'right' : 'left');
        var tx = pAligns[ci] === 'center' ? cx + pWidths[ci] / 2
          : (pAligns[ci] === 'right' ? cx + pWidths[ci] - pPadX : cx + pPadX);
        r.lines[ci].forEach(function (l, li) {
          ctx.fillText(l, tx, cy + 5 + li * pLineH, pWidths[ci] - pPadX * 2);
        });
        cx += pWidths[ci];
      }
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(M, cy, tableW, r.h);
      var lx = M;
      for (var j = 0; j < pWidths.length - 1; j++) {
        lx += pWidths[j];
        ctx.beginPath(); ctx.moveTo(lx, cy); ctx.lineTo(lx, cy + r.h); ctx.stroke();
      }
      cy += r.h;
    });

    if (!laid.length) {
      cv.fillRect(ctx, M, cy, tableW, 30, '#ffffff');
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.6;
      ctx.strokeRect(M, cy, tableW, 30);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'normal 10px sans-serif'; ctx.fillStyle = '#9ca3af';
      ctx.fillText('（暂无产品明细）', M + tableW / 2, cy + 15);
      cy += 30;
    }
    y = cy + 12;
  }

  /* ---- 主绘制 ---- */
  function paint() {
    /* 1. 买方抬头 */
    y = 40;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(data.companyName || '', W / 2, y, tableW);
    y += 22;
    cv.drawHLine(ctx, M, y, tableW, '#111827', 1.4);
    y += 16;

    /* 2. 大标题 */
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('采 购 合 同', W / 2, y);
    y += 40;

    /* 3. 右上合同信息（合同号/签约地/合同日期） */
    var infoW = 250, infoX = W - M - infoW;
    var infoRows = [
      ['合同号：', data.contractNumber || ''],
      ['签约地：', '常州'],
      ['合同日期：', data.orderDate || '']
    ];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    infoRows.forEach(function (r, i) {
      var ry = y + i * 19;
      ctx.font = 'bold 10.5px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText(r[0], infoX, ry);
      ctx.font = 'normal 10.5px sans-serif';
      ctx.fillText(r[1], infoX + 62, ry, infoW - 62);
    });
    y += infoRows.length * 19 + 12;

    /* 4. 买卖双方信息两栏 */
    var colGap = 14;
    var colW = (tableW - colGap) / 2;
    var sup = data.supplierInfo || {};
    var lRows = [
      ['买方：', data.companyName || '', true],
      ['地址：', data.buyerCompanyAddress || ''],
      ['联系人：', data.buyerContactPerson || ''],
      ['联系电话：', data.buyerPhoneNumber || '']
    ];
    var rRows = [
      ['卖方：', sup.supplierName || '', true],
      ['地址：', sup.companyAddress || ''],
      ['联系人：', sup.contactPerson || ''],
      ['联系电话：', sup.phoneNumber || ''],
      ['邮箱：', sup.email || ''],
      ['开户行：', sup.bankName || ''],
      ['行号：', sup.bankCode || ''],
      ['账号：', sup.bankAccount || '']
    ];
    var startY = y;
    var hL = partyBox(M, lRows, colW);
    y = startY;
    var hR = partyBox(M + colW + colGap, rRows, colW);
    y = startY + Math.max(hL, hR) + 16;

    /* 5. 二、产品清单 */
    sectionTitle('二、产品清单');
    drawProducts();

    /* 6. 订单备注 */
    if (y + 46 > contentBottom) newPage();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 10.5px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('订单备注：', M, y);
    y += 17;
    var remarkLines = data.orderRemark ? wrapAt(data.orderRemark, tableW - 8, 'normal 10px sans-serif') : [];
    if (!remarkLines.length) remarkLines = ['（无）'];
    remarkLines.forEach(function (l) {
      cv.drawHLine(ctx, M, y + 14, tableW, '#e5e7eb', 0.6);
      ctx.font = 'normal 10px sans-serif';
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'left';
      ctx.fillText(l, M + 2, y, tableW - 8);
      y += 19;
    });
    y += 10;

    /* 7. 数量合计 / 总金额 / 大写 */
    var totalQty = (data.products || []).reduce(function (s, p) { return s + (parseFloat(p.quantity) || 0); }, 0);
    if (y + 70 > contentBottom) newPage();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('数量合计：', M, y);
    ctx.font = 'normal 11px sans-serif';
    ctx.fillText(qQty(totalQty), M + 70, y);
    y += 21;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('总金额（含税）：', M, y);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('¥' + qThousand(data.totalAmount), M + 100, y);
    y += 21;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('总金额（大写）：', M, y);
    ctx.font = 'normal 11px sans-serif';
    ctx.fillText(data.totalAmountCn || '', M + 100, y, tableW - 100);
    y += 24;

    /* 8. 三、合同条款 */
    sectionTitle('三、合同条款');
    var delivery = data.deliveryDate || '____年____月____日';
    CONTRACT_TERMS.forEach(function (t, i) {
      var text = t.replace('{delivery}', delivery);
      var lines = wrapAt(text, tableW - 20, 'normal 10px sans-serif');
      if (y + lines.length * 15 + 4 > contentBottom) newPage();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = 'normal 10px sans-serif';
      ctx.fillStyle = '#1f2937';
      lines.forEach(function (l, li) {
        if (li === 0) ctx.fillText(String(i + 1) + '.', M, y);
        ctx.fillText(l, M + 18, y, tableW - 20);
        y += 15;
      });
      y += 4;
    });
    y += 6;

    /* 9. 签章区 */
    var signH = 158;
    if (y + signH + 30 > contentBottom) newPage();
    var sGap = 14;
    var sW = (tableW - sGap) / 2;
    var sTop = y;
    [M, M + sW + sGap].forEach(function (sx) {
      cv.fillRect(ctx, sx, sTop, sW, signH, '#ffffff');
      qRoundRect(ctx, sx, sTop, sW, signH, 6);
      ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.stroke();
    });
    // 买方
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 11.5px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('买方（盖章）：', M + 14, sTop + 14);
    ctx.font = 'normal 11px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('授权代表：', M + 14, sTop + 100);
    ctx.fillText('日期：______年______月______日', M + 14, sTop + 126);
    // 印章（圆形裁剪，叠在买方盖章区）
    if (chopImg) {
      var chopSize = 112;
      var chopX = M + 130, chopY = sTop + 16;
      ctx.save();
      ctx.beginPath();
      ctx.arc(chopX + chopSize / 2, chopY + chopSize / 2, chopSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      cv.drawImage({ ctx: ctx, img: chopImg, x: chopX, y: chopY, maxW: chopSize, maxH: chopSize });
      ctx.restore();
    }
    // 卖方
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 11.5px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('卖方（盖章）：', M + sW + sGap + 14, sTop + 14);
    ctx.font = 'normal 11px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('授权代表：', M + sW + sGap + 14, sTop + 100);
    ctx.fillText('日期：______年______月______日', M + sW + sGap + 14, sTop + 126);
    y = sTop + signH + 16;

    /* 10. 合同生成日期 */
    if (y + 20 > contentBottom) newPage();
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.font = 'normal 10px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('合同生成日期：' + fmt.today(), W - M, y);

    /* 11. 页脚 */
    pages.forEach(function (p, pi) {
      var c = p.ctx;
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.font = 'normal 9px sans-serif';
      c.fillStyle = '#9ca3af';
      c.fillText('采购合同 ' + (data.contractNumber || ''), M, footerY);
      c.textAlign = 'right';
      c.fillText('第 ' + (pi + 1) + ' / ' + pages.length + ' 页', W - M, footerY);
    });
  }

  return chopReady.then(function () {
    paint();
    return pages;
  });
}

// ============================================================
// 供应商对账单 — A4 纵向
// 1:1 复刻桌面版 apps/purchase-integrated/recon.html 打印区：
//   居中标题「对 账 单」+ 右上编号 / 需方·供方 / 对账期间·制单日期 /
//   8 列流水表（序号·日期·类型·单据号·合同号·开票金额·付款金额·累计余额）/
//   开票合计·付款合计·未付余额 / 异议提示 / 双方确认盖章行
// ============================================================
function renderReconStatement(data) {
  data = data || {};
  var M = 40;
  var page = cv.createPage('portrait');
  var W = page.width, H = page.height;
  var ctx = page.ctx;
  var tableW = W - M * 2;
  var footerY = H - 30;
  var contentBottom = footerY - 16;
  var pages = [page];
  var y = 0;

  var sCols = [0.06, 0.13, 0.09, 0.18, 0.16, 0.13, 0.13, 0.12];
  var sHeads = ['序号', '日期', '类型', '单据号', '合同号', '开票金额(元)', '付款金额(元)', '累计余额(元)'];
  var sAligns = ['center', 'left', 'left', 'left', 'left', 'right', 'right', 'right'];
  var sWidths = sCols.map(function (p) { return tableW * p; });
  var sFont = 'normal 10px sans-serif';
  var sHeadH = 28, sRowH = 22, sPadX = 5;

  function drawHead(cont) {
    cv.fillRect(ctx, M, y, tableW, sHeadH, '#f3f4f6');
    var cx = M;
    for (var i = 0; i < sHeads.length; i++) {
      ctx.font = 'bold 9.5px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.textBaseline = 'middle';
      ctx.textAlign = sAligns[i] === 'center' ? 'center' : (sAligns[i] === 'right' ? 'right' : 'left');
      var tx = sAligns[i] === 'center' ? cx + sWidths[i] / 2
        : (sAligns[i] === 'right' ? cx + sWidths[i] - sPadX : cx + sPadX);
      ctx.fillText(sHeads[i], tx, y + sHeadH / 2, sWidths[i] - 2);
      cx += sWidths[i];
    }
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(M, y, tableW, sHeadH);
    var lx = M;
    for (var j = 0; j < sWidths.length - 1; j++) {
      lx += sWidths[j];
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + sHeadH); ctx.stroke();
    }
    y += sHeadH;
    void cont;
  }

  function drawTitleBlock() {
    y = 44;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('对  账  单', W / 2, y - 4);
    ctx.textAlign = 'right';
    ctx.font = 'normal 10px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('编号：' + (data.docNo || ''), W - M, y);
    y += 30;

    var colW = (tableW - 16) / 2;
    var lx = M, rx = M + colW + 16;
    function infoRow(x, label, val) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#374151';
      ctx.fillText(label, x, y);
      ctx.font = 'normal 10px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText(val || '—', x + ctx.measureText(label).width + 2, y, colW - 90);
    }
    infoRow(lx, '需方（对账方）：', data.buyerName);
    infoRow(rx, '供方（供应商）：', data.supplier);
    y += 19;
    infoRow(lx, '对账期间：', (data.dateFrom || '起始') + ' 至 ' + (data.dateTo || fmt.today()));
    infoRow(rx, '制单日期：', fmt.today());
    y += 19;
    cv.drawHLine(ctx, M, y, tableW, '#d1d5db', 1);
    y += 10;
  }

  var rows = data.rows || [];
  drawTitleBlock();
  drawHead(false);

  if (!rows.length) {
    cv.fillRect(ctx, M, y, tableW, 40, '#ffffff');
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.6;
    ctx.strokeRect(M, y, tableW, 40);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'normal 10px sans-serif'; ctx.fillStyle = '#9ca3af';
    ctx.fillText('本期间内暂无往来流水。', M + tableW / 2, y + 20);
    y += 40;
  } else {
    rows.forEach(function (r, ri) {
      if (y + sRowH > contentBottom) {
        page = cv.createPage('portrait');
        pages.push(page);
        ctx = page.ctx;
        y = 36;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('对账单 ' + (data.docNo || '') + '（续）', M, 20);
        drawHead(true);
      }
      if (ri % 2 === 1) cv.fillRect(ctx, M, y, tableW, sRowH, '#fafafa');
      var vals = [
        String(r.seq == null ? ri + 1 : r.seq), r.date || '', r.type || '', r.docNo || '',
        r.contractNumber || '',
        r.invoice ? qThousand(r.invoice) : '',
        r.payment ? qThousand(r.payment) : '',
        qThousand(r.balance)
      ];
      var cx = M;
      for (var ci = 0; ci < sWidths.length; ci++) {
        ctx.font = sFont;
        ctx.fillStyle = '#1f2937';
        ctx.textBaseline = 'middle';
        ctx.textAlign = sAligns[ci] === 'center' ? 'center' : (sAligns[ci] === 'right' ? 'right' : 'left');
        var tx = sAligns[ci] === 'center' ? cx + sWidths[ci] / 2
          : (sAligns[ci] === 'right' ? cx + sWidths[ci] - sPadX : cx + sPadX);
        ctx.fillText(String(vals[ci]), tx, y + sRowH / 2, sWidths[ci] - 2);
        cx += sWidths[ci];
      }
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(M, y, tableW, sRowH);
      var lx = M;
      for (var j = 0; j < sWidths.length - 1; j++) {
        lx += sWidths[j];
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + sRowH); ctx.stroke();
      }
      y += sRowH;
    });
  }

  /* 汇总条 */
  if (y + 40 > contentBottom) { page = cv.createPage('portrait'); pages.push(page); ctx = page.ctx; y = 44; }
  cv.fillRect(ctx, M, y, tableW, 30, '#f9fafb');
  ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 0.8;
  ctx.strokeRect(M, y, tableW, 30);
  var totalInv = +data.totalInvoice || 0;
  var totalPay = +data.totalPayment || 0;
  var bal = (data.balance == null ? totalInv - totalPay : +data.balance);
  var stat = [
    ['开票合计：', totalInv],
    ['付款合计：', totalPay],
    ['未付余额：', bal]
  ];
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (var si = 0; si < stat.length; si++) {
    var sx = M + 16 + si * (tableW / 3);
    ctx.font = 'normal 10.5px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(stat[si][0], sx, y + 15);
    ctx.font = 'bold 11.5px sans-serif';
    ctx.fillStyle = stat[si][0].indexOf('未付') === 0 ? '#b91c1c' : '#111827';
    ctx.fillText('¥' + qThousand(stat[si][1]), sx + 60, y + 15);
  }
  y += 42;

  /* 异议提示 */
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'normal 10px sans-serif';
  ctx.fillStyle = '#111827';
  var hint = '经双方核对，以上数据与双方账目相符。如有异议，请于收到本对账单后 5 个工作日内书面提出。';
  qWrap(ctx, hint, tableW).forEach(function (l) {
    ctx.fillText(l, M, y);
    y += 15;
  });
  y += 14;

  /* 双方确认盖章行 */
  if (y + 60 > contentBottom) { page = cv.createPage('portrait'); pages.push(page); ctx = page.ctx; y = 44; }
  var signGap = 20;
  var signW = (tableW - signGap) / 2;
  [M, M + signW + signGap].forEach(function (sx, i) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(i === 0 ? '需方确认（盖章）：' : '供方确认（盖章）：', sx, y);
    cv.drawHLine(ctx, sx, y + 46, signW - 20, '#9ca3af', 1);
    ctx.font = 'normal 10px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('日期：', sx + signW - 130, y + 50);
  });

  /* 页脚 */
  pages.forEach(function (p, pi) {
    var c = p.ctx;
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.font = 'normal 9px sans-serif';
    c.fillStyle = '#9ca3af';
    c.fillText('对账单 ' + (data.docNo || ''), M, footerY);
    c.textAlign = 'center';
    c.fillText(String(data.supplier || ''), W / 2, footerY);
    c.textAlign = 'right';
    c.fillText('第 ' + (pi + 1) + ' / ' + pages.length + ' 页', W - M, footerY);
  });

  return pages;
}

module.exports = {
  renderProductionNotice: renderProductionNotice,
  renderScheduleNotice: renderScheduleNotice,
  renderBoxMark: renderBoxMark,
  renderInvoice: renderInvoice,
  renderPackingList: renderPackingList,
  renderCustoms: renderCustoms,
  renderQuotation: renderQuotation,
  renderPurchaseContract: renderPurchaseContract,
  renderReconStatement: renderReconStatement
};
