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
  cv.drawText({ ctx: ctx, text: '普利美', x: margin, y: margin, size: 22, weight: 'bold', color: '#1a56db' });
  cv.drawText({ ctx: ctx, text: '生产通知单', x: margin + 80, y: margin, size: 22, weight: 'bold', color: '#1a56db' });
  cv.drawText({ ctx: ctx, text: 'PRODUCTION ORDER', x: margin + 80, y: margin + 26, size: 10, color: '#999999' });
  cv.drawText({ ctx: ctx, text: '公司名称：普利美（常州）环境工程科技有限公司', x: margin, y: margin + 52, size: 10, color: '#666666' });
  cv.drawText({ ctx: ctx, text: '地址：常州市武进区雪堰镇周南路8号6-1（中南高科常州雪堰智造产业园）', x: margin, y: margin + 68, size: 10, color: '#666666' });
  cv.drawText({ ctx: ctx, text: '电话：139 5158 9291', x: margin, y: margin + 84, size: 10, color: '#666666' });

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
    cv.drawText({ ctx: ctx, text: fields[i].label, x: fx, y: fy, size: 9, color: '#999999' });
    cv.drawText({ ctx: ctx, text: fields[i].value, x: fx, y: fy + 14, size: 12, color: '#333333', weight: 'bold' });
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
      cv.drawText({ ctx: ctx, text: '⚠ 交货期提醒：距离交货期还有' + days + '天，请确保按时完成生产。', x: margin + 8, y: alertY + 10, size: 11, color: '#92400e' });
      alertY += 44;
    } else if (days < 0) {
      cv.fillRect(ctx, margin, alertY, W - margin * 2, 36, '#fef2f2');
      cv.drawRect(ctx, margin, alertY, W - margin * 2, 36, '#fecaca', 1);
      cv.drawText({ ctx: ctx, text: '⚠ 交货期已过' + (-days) + '天，请尽快安排生产。', x: margin + 8, y: alertY + 10, size: 11, color: '#991b1b' });
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
  var rows = products.map(function (p) {
    return [p.productName || '', p.specification || '', p.drawingNumber || '', p.plating || '', p.bowLogo || '', p.quantity || ''];
  });

  // 合计行
  var totalQty = products.reduce(function (s, p) {
    return s + (parseFloat(p.quantity) || 0);
  }, 0);
  rows.push(['合计', '', '', '', '', String(totalQty)]);

  var tableBottom = cv.drawTable({
    ctx: ctx, x: margin, y: tableY,
    columns: columns, rows: rows,
    headerHeight: 26, rowHeight: 22, fontSize: 10
  });

  // --- 备注 ---
  var remarkY = tableBottom + 16;
  if (data.remark) {
    cv.drawHLine(ctx, margin, remarkY, tableW, '#d1d5db', 1);
    cv.drawText({ ctx: ctx, text: '备注：', x: margin, y: remarkY + 6, size: 11, weight: 'bold', color: '#555555' });
    cv.drawTextLines(ctx, data.remark, margin + 44, remarkY + 6, tableW - 44, 16, 11, '#333333');
    remarkY += 30;
  }

  // --- 底部签字栏 ---
  var signY = H - margin - 70;
  var signColW = (W - margin * 2) / 4;
  var signLabels = ['制单', '审核', '生产', '日期'];
  var signValues = [data.createdBy || '', data.approvedBy || '', data.productionBy || '', data.signDate || ''];
  for (var i = 0; i < 4; i++) {
    var sx = margin + i * signColW;
    cv.drawText({ ctx: ctx, text: signLabels[i], x: sx + signColW / 2, y: signY, size: 11, weight: 'bold', align: 'center' });
    cv.drawHLine(ctx, sx + 20, signY + 40, signColW - 40, '#d1d5db', 1);
    cv.drawText({ ctx: ctx, text: signValues[i], x: sx + signColW / 2, y: signY + 44, size: 9, color: '#999999', align: 'center' });
  }

  return page;
}

// ============================================================
// 制作箱唛 — 纵向 A4
// 参照网页版 merged_order_labels.html 的箱唛布局
// ============================================================
function renderBoxMark(form, pageNo, totalPages) {
  var page = cv.createPage('portrait');
  var ctx = page.ctx;
  var W = page.width;
  var margin = 56; // ~15mm

  // --- 顶部标题 ---
  cv.drawText({ ctx: ctx, text: 'SHIPPING MARKS / 箱唛', x: W / 2, y: margin, size: 18, weight: 'bold', align: 'center' });
  cv.drawText({ ctx: ctx, text: form.company || '', x: W / 2, y: margin + 28, size: 12, color: '#555555', align: 'center' });
  cv.drawHLine(ctx, margin, margin + 52, W - margin * 2, '#333333', 2);

  // --- 信息字段（两列）---
  var fieldY = margin + 72;
  var leftColX = margin;
  var rightColX = W / 2 + 10;
  var rowH = 36;

  var fields = [
    { label: 'PO No.', value: form.po || '', col: 0, row: 0 },
    { label: 'Art No.', value: form.artNo || '', col: 1, row: 0 },
    { label: 'Maschinennr.', value: form.maschinenNr || '', col: 0, row: 1 },
    { label: 'Projekt Nr.', value: form.projektNr || '', col: 1, row: 1 },
    { label: 'Package No.', value: pageNo + ' / ' + totalPages, col: 0, row: 2 },
    { label: '单位', value: form.unit || '', col: 1, row: 2 },
    { label: '总数量', value: form.totalQty || '', col: 0, row: 3 },
    { label: '每箱数量', value: form.perBoxQty || '', col: 1, row: 3 },
    { label: '总箱数', value: form.totalBoxes || '', col: 0, row: 4 }
  ];

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var fx = f.col === 0 ? leftColX : rightColX;
    var fy = fieldY + f.row * rowH;
    // 留空字段不显示
    if (!f.value && f.value !== 0 && f.label !== 'Package No.') continue;
    cv.drawText({ ctx: ctx, text: f.label + ':', x: fx, y: fy, size: 10, color: '#888888' });
    cv.drawText({ ctx: ctx, text: f.value, x: fx + 100, y: fy, size: 12, color: '#333333', weight: 'bold' });
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
    'Per Box: ' + (form.perBoxQty || ''),
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
    cv.drawText({ ctx: ctx, text: 'QR Code', x: qrX + qrSize / 2, y: qrY + qrSize / 2 - 6, size: 12, color: '#999999', align: 'center' });
  }

  // --- 备注（仅最后一箱显示）---
  if (pageNo === totalPages && form.remark) {
    var remarkY = qrY + qrSize + 24;
    cv.drawHLine(ctx, margin, remarkY, W - margin * 2, '#d1d5db', 1);
    cv.drawText({ ctx: ctx, text: '备注：', x: margin, y: remarkY + 6, size: 11, weight: 'bold', color: '#555555' });
    cv.drawTextLines(ctx, form.remark, margin + 44, remarkY + 6, W - margin * 2 - 44, 16, 11, '#333333');
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
  cv.drawText({ ctx: ctx, text: '商业发票', x: W / 2, y: margin + 28, size: 14, color: '#555555', align: 'center' });

  // 发票号/日期
  var infoY = margin + 60;
  cv.drawText({ ctx: ctx, text: 'Invoice No.: ' + (doc.invoiceNo || ''), x: margin, y: infoY, size: 11, color: '#333333' });
  cv.drawText({ ctx: ctx, text: 'Date: ' + (doc.invoiceDate || fmt.today()), x: W - margin - 200, y: infoY, size: 11, color: '#333333' });

  // 卖方/买方
  var partyY = infoY + 30;
  cv.drawText({ ctx: ctx, text: 'Seller:', x: margin, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.seller || '', margin + 50, partyY, W / 2 - margin - 50, 14, 10, '#555555');
  cv.drawText({ ctx: ctx, text: 'Buyer:', x: W / 2, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.buyer || '', W / 2 + 50, partyY, W / 2 - margin - 50, 14, 10, '#555555');

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
    cv.drawText({ ctx: ctx, text: termsFields[i].label + ': ' + termsFields[i].value, x: tx, y: ty, size: 10, color: '#555555' });
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
  cv.drawHLine(ctx, margin + 70, signY + 24, 200, '#999999', 1);

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
  cv.drawText({ ctx: ctx, text: '装箱单', x: W / 2, y: margin + 28, size: 14, color: '#555555', align: 'center' });

  var infoY = margin + 60;
  cv.drawText({ ctx: ctx, text: 'Invoice No.: ' + (doc.invoiceNo || ''), x: margin, y: infoY, size: 11 });
  cv.drawText({ ctx: ctx, text: 'Date: ' + (doc.invoiceDate || fmt.today()), x: W - margin - 200, y: infoY, size: 11 });

  // 买卖方
  var partyY = infoY + 30;
  cv.drawText({ ctx: ctx, text: 'Shipper:', x: margin, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.seller || '', margin + 60, partyY, W / 2 - margin - 60, 14, 10, '#555555');
  cv.drawText({ ctx: ctx, text: 'Consignee:', x: W / 2, y: partyY, size: 11, weight: 'bold' });
  cv.drawTextLines(ctx, doc.buyer || '', W / 2 + 60, partyY, W / 2 - margin - 60, 14, 10, '#555555');

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
  cv.drawHLine(ctx, margin + 70, signY + 24, 200, '#999999', 1);

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
  cv.drawText({ ctx: ctx, text: '报关明细', x: W / 2, y: margin + 26, size: 14, color: '#555555', align: 'center' });

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
    cv.drawText({ ctx: ctx, text: infoFields[i].label + ': ' + infoFields[i].value, x: fx, y: fy, size: 10, color: '#555555' });
  }

  // 发货人/收货人
  var partyY = infoY + 4 * 26 + 10;
  cv.drawText({ ctx: ctx, text: '发货人:', x: margin, y: partyY, size: 10, weight: 'bold' });
  cv.drawTextLines(ctx, doc.shipper || '', margin + 55, partyY, W / 2 - margin - 55, 14, 10, '#555555');
  cv.drawText({ ctx: ctx, text: '收货人:', x: W / 2, y: partyY, size: 10, weight: 'bold' });
  cv.drawTextLines(ctx, doc.consignee || '', W / 2 + 55, partyY, W / 2 - margin - 55, 14, 10, '#555555');

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
  cv.drawTextLines(ctx, doc.marks || '', margin, markY + 18, W - margin * 2, 14, 10, '#555555');

  return page;
}

module.exports = {
  renderProductionNotice: renderProductionNotice,
  renderBoxMark: renderBoxMark,
  renderInvoice: renderInvoice,
  renderPackingList: renderPackingList,
  renderCustoms: renderCustoms
};
