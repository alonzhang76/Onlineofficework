/* 电镀产品收/发货单 共享生成逻辑（桌面端）
 * 数据流：plating.html → sessionStorage.selectedDeliveries → 本脚本读取 localStorage 汇总渲染
 */
(function () {
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[,¥\s]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fmtQty(v) { return String(Math.round((+v || 0) * 100) / 100); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function readJSON(key, def) {
    try { var v = JSON.parse(localStorage.getItem(key) || ''); return v == null ? def : v; } catch (e) { return def; }
  }
  function dateTs(s) {
    var m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
  }

  /** 收发货记录归一化（cells 数组 / 对象两种格式） */
  function normalizeDelivery(d) {
    if (d && Array.isArray(d.cells)) {
      var c = d.cells;
      return {
        type: c[0] || '', date: c[1] || '', orderNo: c[2] || '', customer: c[3] || '', productName: c[4] || '',
        rough: num(c[5]), electroplate: num(c[6]), replate: num(c[7]), repair: num(c[8]), scrap: num(c[9]),
        remark: c[10] || '', drawingNo: c[11] || '', bow: c[12] || '', plating: c[13] || '', createdAt: d.createdAt || ''
      };
    }
    if (d && typeof d === 'object') {
      return {
        type: d.type || '', date: d.date || '', orderNo: d.orderNo || d.orderNumber || '', customer: d.customer || '',
        productName: d.productName || d.product || '',
        rough: num(d.roughQty != null ? d.roughQty : d.rawQuantity),
        electroplate: num(d.electroplateQty != null ? d.electroplateQty : d.electroplateQuantity),
        replate: num(d.replateQty != null ? d.replateQty : d.reworkQuantity),
        repair: num(d.repairQty != null ? d.repairQty : d.repairQuantity),
        scrap: num(d.scrapQty != null ? d.scrapQty : d.scrapQuantity),
        remark: d.remark || '', drawingNo: d.drawingNo || '', bow: d.bow || '', plating: d.plating || '',
        createdAt: d.createdAt || ''
      };
    }
    return null;
  }

  function build(docType) {
    var isShip = docType === '发货';
    var selected = [];
    try { selected = JSON.parse(sessionStorage.getItem('selectedDeliveries') || '[]'); } catch (e) {}
    if (!selected.length) {
      document.body.innerHTML = '<p style="padding:60px;text-align:center;color:#888">未找到要生成的记录，请返回电镀管理重新操作</p>';
      return;
    }
    var sel = selected.map(normalizeDelivery).filter(Boolean);
    if (!sel.length) {
      document.body.innerHTML = '<p style="padding:60px;text-align:center;color:#888">记录数据为空</p>';
      return;
    }

    var deliveries = readJSON('deliveriesData', []).map(normalizeDelivery).filter(Boolean);
    var orderNoSet = {};
    sel.forEach(function (d) { if (d.orderNo) orderNoSet[d.orderNo] = true; });

    // ---- 订单汇总（与「收发货」订单汇总口径一致）----
    var summaries = Object.keys(orderNoSet).map(function (orderNo) {
      var s = { orderNo: orderNo, customer: '', productName: '', drawingNo: '', orderQuantity: 0,
        blank: 0, electroplating: 0, replating: 0, repair: 0, scrap: 0 };
      deliveries.forEach(function (d) {
        if (d.orderNo !== orderNo) return;
        if (d.type === '收货') { s.electroplating += d.electroplate; s.repair += d.repair; s.scrap += d.scrap; }
        else if (d.type === '发货') { s.blank += d.rough; }
        s.replating += d.replate;
        if (!s.customer && d.customer) s.customer = d.customer;
        if (!s.productName && d.productName) s.productName = d.productName;
        if (!s.drawingNo && d.drawingNo) s.drawingNo = d.drawingNo;
      });
      s.good = s.electroplating - s.replating - s.scrap;
      s.difference = (s.blank - s.repair) - s.good;
      return s;
    });

    // 订单数量：plating 内部订单表
    readJSON('ordersData', []).forEach(function (order) {
      if (!order || !order.cells) return;
      var c = order.cells, orderNo = null, qty = 0;
      if (c.length === 15) { orderNo = c[4]; qty = num(c[9]); }
      else if (c.length === 13) { orderNo = c[0]; qty = num(c[7]); }
      if (!orderNo) return;
      summaries.forEach(function (s) {
        if (s.orderNo === orderNo && qty) s.orderQuantity = qty;
      });
    });

    // 订单数量兜底：wage 订单管理（同域 localStorage / opener）
    var wageOrders = readJSON('wage_orders', []);
    if (!wageOrders.length) {
      try {
        var w = window.opener;
        if (w && w.wageGetOrders) wageOrders = w.wageGetOrders() || [];
        else if (w && w.parent && w.parent.wageGetOrders) wageOrders = w.parent.wageGetOrders() || [];
      } catch (e) {}
    }
    summaries.forEach(function (s) {
      if (s.orderQuantity) return;
      var w = null;
      for (var i = 0; i < wageOrders.length; i++) {
        if (wageOrders[i] && wageOrders[i].orderNo === s.orderNo) { w = wageOrders[i]; break; }
      }
      if (w) {
        s.orderQuantity = num(w.qty);
        if (!s.customer) s.customer = w.customer || '';
        if (!s.productName) s.productName = w.type || w.productName || '';
        if (!s.drawingNo) s.drawingNo = w.drawingNo || '';
      }
    });

    // ---- 该订单号的全部收发货记录（按时间倒序）----
    var records = deliveries.filter(function (d) { return d.orderNo && orderNoSet[d.orderNo]; });
    records.sort(function (a, b) {
      var t = dateTs(b.date) - dateTs(a.date);
      if (t) return t;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    // ---- 本次明细行：按单据类型筛选 ----
    var detailRows = sel.filter(function (d) { return d.type === docType; });
    if (!detailRows.length) detailRows = sel;

    // ---- 渲染 ----
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var deliveryId = today + '-' + String(Math.floor(100 + Math.random() * 900));

    document.title = '电镀产品' + docType + '单';
    document.getElementById('doc-title').textContent = '电镀产品' + docType + '单';
    document.getElementById('delivery-id').textContent = deliveryId;
    document.getElementById('current-date').textContent = today;
    document.getElementById('info-title').textContent = docType + '信息';
    document.getElementById('driver').textContent = sel[0].driver || '';
    document.getElementById('phone').textContent = sel[0].phone || '';
    document.getElementById('license-plate').textContent = sel[0].licensePlate || '';

    // 产品明细
    var detailCols = isShip
      ? ['订单号', '客户', '产品', '蝴蝶结', '电镀厂', '毛坯数量', '返镀数量', '合计']
      : ['订单号', '客户', '产品', '蝴蝶结', '电镀厂', '电镀成品数', '返修数量', '报废数量', '合计'];
    var detailTable = document.getElementById('detail-table');
    var headHtml = '<tr>' + detailCols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    var bodyHtml = '';
    var totalE = 0, totalR2 = 0, totalS = 0, totalC = 0;
    detailRows.forEach(function (d) {
      var q1 = isShip ? d.rough : d.electroplate;
      var q2 = isShip ? d.replate : d.repair;
      var q3 = isShip ? 0 : d.scrap;
      var combined = q1 + q2 + q3;
      totalE += q1; totalR2 += q2; totalS += q3; totalC += combined;
      bodyHtml += '<tr><td>' + esc(d.orderNo || '-') + '</td><td>' + esc(d.customer || '-') + '</td><td>' +
        esc(d.productName || '-') + '</td><td>' + esc(d.bow) + '</td><td>' + esc(d.plating) + '</td><td>' + fmtQty(q1) +
        '</td><td>' + fmtQty(q2) + '</td>' + (isShip ? '' : '<td>' + fmtQty(q3) + '</td>') +
        '<td>' + fmtQty(combined) + '</td></tr>';
    });
    var labelSpan = isShip ? 5 : 5;
    bodyHtml += '<tr style="font-weight:bold;background-color:#e3f2fd;"><td colspan="' + labelSpan + '">合计</td><td>' +
      fmtQty(totalE) + '</td><td>' + fmtQty(totalR2) + '</td>' +
      (isShip ? '' : '<td>' + fmtQty(totalS) + '</td>') + '<td>' + fmtQty(totalC) + '</td></tr>';
    detailTable.querySelector('thead').innerHTML = headHtml;
    detailTable.querySelector('tbody').innerHTML = bodyHtml;

    // 订单汇总
    var sumCols = ['订单号', '客户', '产品名称', '图纸号', '订单数量', '毛坯总发', '电镀成品数', '返镀数量', '返修数量', '报废数量', '良品数量', '差额'];
    var sumTable = document.getElementById('summary-table');
    sumTable.querySelector('thead').innerHTML = '<tr>' + sumCols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    sumTable.querySelector('tbody').innerHTML = summaries.map(function (s) {
      return '<tr><td>' + esc(s.orderNo) + '</td><td>' + esc(s.customer || '-') + '</td><td>' + esc(s.productName || '-') +
        '</td><td>' + esc(s.drawingNo) + '</td><td>' + fmtQty(s.orderQuantity) + '</td><td>' + fmtQty(s.blank) +
        '</td><td>' + fmtQty(s.electroplating) + '</td><td>' + fmtQty(s.replating) + '</td><td>' + fmtQty(s.repair) +
        '</td><td>' + fmtQty(s.scrap) + '</td><td>' + fmtQty(s.good) + '</td><td>' + fmtQty(s.difference) + '</td></tr>';
    }).join('');

    // 收发货记录
    var recCols = ['类型', '收发日期', '电镀厂', '毛坯数量', '电镀成品数', '返镀数量', '返修数量', '报废数量', '备注'];
    var recTable = document.getElementById('records-table');
    recTable.querySelector('thead').innerHTML = '<tr>' + recCols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    recTable.querySelector('tbody').innerHTML = records.map(function (d) {
      return '<tr><td>' + esc(d.type) + '</td><td>' + esc(d.date) + '</td><td>' + esc(d.plating) +
        '</td><td>' + fmtQty(d.rough) + '</td><td>' + fmtQty(d.electroplate) + '</td><td>' + fmtQty(d.replate) +
        '</td><td>' + fmtQty(d.repair) + '</td><td>' + fmtQty(d.scrap) + '</td><td>' + esc(d.remark) + '</td></tr>';
    }).join('') || '<tr><td colspan="9">暂无记录</td></tr>';

    // 备注
    document.getElementById('remark').value = sel[0].remark || '';

    // 签名
    document.getElementById('sign-left').textContent = isShip ? '发货人' : '送货人';
    document.getElementById('sign-right').textContent = '收货人';

    // 二维码
    var container = document.getElementById('qrcodes-container');
    container.innerHTML = '';
    summaries.forEach(function (s) {
      var text = '订单号: ' + s.orderNo + '\n\n' +
        '客户: ' + (s.customer || '') + '\n' +
        '产品名称: ' + (s.productName || '') + '\n' +
        '图纸号: ' + (s.drawingNo || '') + '\n' +
        '订单数量: ' + fmtQty(s.orderQuantity) + '\n' +
        '毛坯总发: ' + fmtQty(s.blank) + '\n' +
        '电镀成品数: ' + fmtQty(s.electroplating) + '\n' +
        '返镀数量: ' + fmtQty(s.replating) + '\n' +
        '返修数量: ' + fmtQty(s.repair) + '\n' +
        '报废数量: ' + fmtQty(s.scrap) + '\n' +
        '良品数量: ' + fmtQty(s.good) + '\n' +
        '差额: ' + fmtQty(s.difference) + '\n';
      var item = document.createElement('div');
      item.className = 'qrcode-item';
      var h4 = document.createElement('h4');
      h4.textContent = '订单号: ' + s.orderNo;
      var imgBox = document.createElement('div');
      item.appendChild(h4);
      item.appendChild(imgBox);
      container.appendChild(item);
      if (window.QRCode && QRCode.toDataURL) {
        QRCode.toDataURL(text, { width: 120, margin: 1 }, function (err, url) {
          if (err) { imgBox.innerHTML = '<p>二维码生成失败</p>'; return; }
          var img = document.createElement('img');
          img.src = url;
          imgBox.appendChild(img);
        });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var docType = document.body.getAttribute('data-doctype') === '收货' ? '收货' : '发货';
    build(docType);
  });
})();
