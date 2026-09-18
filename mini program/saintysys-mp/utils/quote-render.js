/**
 * quote-render.js — 外贸报价单 Canvas 渲染器
 *
 * 对齐桌面端 apps/saintysys/quotation.html 的打印版面：
 *   A4 纵向、#004D6D 主色；公司抬头 + QUOTATION 大标题 + 红色报价号徽章；
 *   From(Seller)/To(Customer) 买卖双方；深青表头的 8 列款号明细行；
 *   Subtotal/Discount/Hanger/Grand Total 合计；
 *   Payment/Delivery/Lead Time/Currency/Season 条款行；
 *   Notes 灰底备注框；双方签字栏；有效期与打印人页脚。
 *
 * renderQuote(doc) → Promise<Page[]>，交给 pdf-share.sharePages()
 */
const RENDER_SCALE = 2;
const W = 842;
const H = 1190;
const M = 46;
const CW = W - M * 2;      // 750
const BOTTOM = 1078;   // 页脚分隔线在 1086，内容不得侵入

const PRIMARY = '#004D6D';
const PRIMARY_LIGHT = '#e8f1f5';
const INK = '#1f2937';
const GRAY = '#6b7280';
const GRAY_LIGHT = '#9ca3af';
const ROW_ALT = '#f9fafb';
const RED = '#d32f2f';

/* 明细列：# / Style / Description / Colors / Sizes / MOQ / Unit Price / Total */
const COLS = [
  { key: 'idx', title: '#', w: 32, align: 'center' },
  { key: 'styleNo', title: 'Style No.', w: 86, align: 'left' },
  { key: 'desc', title: 'Product Description', w: 252, align: 'left' },
  { key: 'colors', title: 'Colors', w: 86, align: 'left' },
  { key: 'sizes', title: 'Sizes', w: 64, align: 'center' },
  { key: 'moq', title: 'MOQ', w: 58, align: 'center' },
  { key: 'unitPrice', title: 'Unit Price', w: 80, align: 'right' },
  { key: 'total', title: 'Total', w: 92, align: 'right' }
];

const STATUS_STYLE = {
  draft:   { bg: '#f3f4f6', fg: '#4b5563' },
  sent:    { bg: '#dbeafe', fg: '#1e40af' },
  accepted:{ bg: '#d1fae5', fg: '#065f46' },
  rejected:{ bg: '#fee2e2', fg: '#991b1b' },
  expired: { bg: '#fef3c7', fg: '#92400e' }
};

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function fmtMoney(n) {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function setFont(ctx, weight, size) { ctx.font = weight + ' ' + size + 'px sans-serif'; }

function createPageCanvas() {
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: W * RENDER_SCALE, height: H * RENDER_SCALE });
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx, width: W, height: H, pixelWidth: W * RENDER_SCALE, pixelHeight: H * RENDER_SCALE, y: 0 };
}

/** 英文按词换行，超长词按字符断行 */
function wrapWords(ctx, text, maxW, size, weight) {
  setFont(ctx, weight || 'normal', size);
  const out = [];
  String(text == null ? '' : text).split('\n').forEach(seg => {
    let line = '';
    seg.split(/\s+/).filter(Boolean).forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) {
        if (!line && ctx.measureText(word).width > maxW) {
          // 超长单词：逐字符断
          let chunk = '';
          word.split('').forEach(ch => {
            if (ctx.measureText(chunk + ch).width > maxW && chunk) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          });
          line = chunk;
        } else {
          line = test;
        }
      } else {
        out.push(line);
        line = word;
      }
    });
    out.push(line);
  });
  return out.length ? out : [''];
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function badge(ctx, text, x, y, style, fontSize) {
  const fs = fontSize || 10;
  setFont(ctx, 'bold', fs);
  const tw = ctx.measureText(text).width;
  const padX = 8, h = fs + 6;
  const w = tw + padX * 2;
  ctx.fillStyle = style.bg;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = style.fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padX, y + 3);
  return { w, h };
}

/* ================= 主入口 ================= */
async function renderQuote(q) {
  const s = q.settings || {};
  const pages = [];
  let cur = null;

  function newPage(withHead) {
    const page = createPageCanvas();
    pages.push(page);
    cur = page;
    cur.y = M;
    if (withHead) drawTableHead(cur);
  }

  function ensure(h, withHead) {
    if (!cur || cur.y + h > BOTTOM) newPage(!!withHead);
  }

  function stroke(x1, y1, x2, y2, color, width, ctx2) {
    const c = ctx2 || cur.ctx;
    c.strokeStyle = color || '#e5e7eb';
    c.lineWidth = width || 1;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  function line(x1, y1, x2, y2, color, width) {
    stroke(x1, y1, x2, y2, color, width);
  }

  /* ---------- 页眉（仅首页） ---------- */
  function drawHeader() {
    const ctx = cur.ctx;
    // 左：公司信息
    let y = M;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PRIMARY;
    setFont(ctx, 'bold', 16);
    ctx.fillText(s.companyName || '', M, y);
    y += 26;
    ctx.fillStyle = GRAY_LIGHT;
    setFont(ctx, 'normal', 11);
    if (s.companyAddress) { ctx.fillText(s.companyAddress, M, y); y += 16; }
    const contactLine = [s.companyPhone ? ('Tel: ' + s.companyPhone) : '', s.companyEmail || ''].filter(Boolean).join('  |  ');
    if (contactLine) { ctx.fillText(contactLine, M, y); y += 16; }
    if (s.companyTaxId) { ctx.fillText('Tax ID: ' + s.companyTaxId, M, y); y += 16; }

    // 右：QUOTATION 标题 + 元信息
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    setFont(ctx, '800', 30);
    ctx.fillText('QUOTATION', M + CW, M - 4);
    let my = M + 40;
    ctx.textBaseline = 'top';

    function metaLine(label, node) {
      setFont(ctx, 'bold', 12);
      ctx.fillStyle = GRAY;
      const labelText = label;
      const lw = ctx.measureText(labelText).width;
      const xRight = M + CW;
      ctx.textAlign = 'right';
      ctx.fillText(labelText, xRight, my);
      node(xRight - lw - 8, my);
      my += 21;
    }

    // Quote No. 红色徽章
    setFont(ctx, 'bold', 12);
    ctx.fillStyle = GRAY;
    ctx.textAlign = 'right';
    ctx.fillText('Quote No.:', M + CW, my);
    const noText = q.quoteNo || '';
    setFont(ctx, 'bold', 12);
    const noW = ctx.measureText(noText).width + 18;
    const noH = 20;
    ctx.fillStyle = RED;
    roundRect(ctx, M + CW - 8 - noW, my - 2, noW, noH, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    setFont(ctx, 'bold', 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noText, M + CW - 8 - noW / 2, my - 2 + noH / 2 + 0.5);
    ctx.textBaseline = 'top';
    my += 26;

    const rightText = (label, val, color) => {
      setFont(ctx, 'bold', 12);
      ctx.fillStyle = GRAY;
      ctx.textAlign = 'right';
      ctx.fillText(label, M + CW, my);
      const lw = ctx.measureText(label).width;
      setFont(ctx, 'normal', 12);
      ctx.fillStyle = color || INK;
      ctx.fillText(val || '—', M + CW - lw - 8, my);
      my += 21;
    };
    rightText('Date: ', q.quoteDate || '');
    rightText('Valid Until: ', q.validUntil || '');

    // Status 徽章（右缘与上方元信息对齐）
    setFont(ctx, 'bold', 12);
    ctx.fillStyle = GRAY;
    ctx.textAlign = 'right';
    ctx.fillText('Status: ', M + CW, my);
    const labelW2 = ctx.measureText('Status: ').width;
    const st = q.status || 'draft';
    setFont(ctx, 'bold', 10);
    const stW = ctx.measureText(st).width + 16;
    badge(ctx, st, M + CW - labelW2 - 8 - stW, my - 1, STATUS_STYLE[st] || STATUS_STYLE.draft, 10);

    // 底部 3px 主色分隔线
    line(M, M + 108, M + CW, M + 108, PRIMARY, 3);
    cur.y = M + 108 + 26;
  }

  /* ---------- 买卖双方 ---------- */
  function drawParties() {
    const ctx = cur.ctx;
    const colW = (CW - 32) / 2;
    const xL = M, xR = M + colW + 32;
    let blockH = 22; // label 区
    // 预估高度
    const sellerLines = [s.companyName || ''].concat(
      s.companyAddress ? [s.companyAddress] : [],
      [
        [s.companyPhone ? ('Tel: ' + s.companyPhone) : '', s.companyEmail ? ('Email: ' + s.companyEmail) : ''].filter(Boolean).join('   '),
        s.companyTaxId ? ('Tax ID: ' + s.companyTaxId) : ''
      ].filter(Boolean)
    );
    const buyerLines = [q.customerCompany || q.customerName || '—'];
    if (q.customerName && q.customerCompany) buyerLines.push('Attn: ' + q.customerName);
    if (q.customerAddress) buyerLines.push(q.customerAddress);
    if (q.customerPhone) buyerLines.push('Tel: ' + q.customerPhone);
    if (q.customerEmail) buyerLines.push('Email: ' + q.customerEmail);
    blockH += Math.max(sellerLines.length, buyerLines.length) * 16 + 8;

    ensure(blockH + 12);

    function party(x, label, name, detailLines) {
      let y = cur.y;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = PRIMARY;
      setFont(ctx, 'bold', 10);
      ctx.fillText(label, x, y);
      line(x, y + 14, x + colW, y + 14, PRIMARY_LIGHT, 1);
      y += 22;
      ctx.fillStyle = INK;
      setFont(ctx, 'bold', 14);
      wrapWords(ctx, name, colW, 14, 'bold').slice(0, 2).forEach(t => { ctx.fillText(t, x, y); y += 18; });
      y += 2;
      ctx.fillStyle = GRAY;
      setFont(ctx, 'normal', 11);
      detailLines.forEach(dl => {
        wrapWords(ctx, dl, colW, 11).forEach(t => { ctx.fillText(t, x, y); y += 16; });
      });
      return y;
    }

    const yEndL = party(xL, 'FROM (SELLER)', s.companyName || '—', sellerLines.slice(1));
    const yEndR = party(xR, 'TO (CUSTOMER)', q.customerCompany || q.customerName || '—',
      buyerLines.slice(1));
    cur.y = Math.max(yEndL, yEndR) + 18;
  }

  /* ---------- 明细表头 ---------- */
  function drawTableHead(page) {
    const ctx = page.ctx;
    let x = M;
    const h = 30;
    ctx.fillStyle = PRIMARY;
    ctx.fillRect(M, page.y, CW, h);
    ctx.textBaseline = 'middle';
    COLS.forEach((c, i) => {
      ctx.fillStyle = '#fff';
      setFont(ctx, 'bold', 10);
      if (c.align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(c.title.toUpperCase(), x + c.w - 8, page.y + h / 2 + 0.5);
      } else if (c.align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(c.title.toUpperCase(), x + c.w / 2, page.y + h / 2 + 0.5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(c.title.toUpperCase(), x + 8, page.y + h / 2 + 0.5);
      }
      x += c.w;
    });
    page.y += h;
  }

  function colX(i) {
    let x = M;
    for (let k = 0; k < i; k++) x += COLS[k].w;
    return x;
  }

  function drawItems() {
    const ctx = cur.ctx;
    const items = q.items || [];
    const padV = 8;
    items.forEach((it, idx) => {
      // 组装各列文本行
      const descLines = [];
      if (it.productName) descLines.push({ t: it.productName, bold: true, color: INK, size: 12 });
      if (it.description) wrapWords(ctx, it.description, COLS[2].w - 16, 10).forEach(t =>
        descLines.push({ t, bold: false, color: GRAY_LIGHT, size: 10 }));
      if (it.fabric) wrapWords(ctx, 'Fabric: ' + it.fabric, COLS[2].w - 16, 10).forEach(t =>
        descLines.push({ t, bold: false, color: GRAY_LIGHT, size: 10 }));
      if (!descLines.length) descLines.push({ t: '', bold: false, color: GRAY_LIGHT, size: 10 });

      const colorLines = wrapWords(ctx, it.colors || '—', COLS[3].w - 16, 12);
      const sizeLines = wrapWords(ctx, it.sizes || '—', COLS[4].w - 12, 12);
      const lineHeights = [
        descLines.length * 15,
        colorLines.length * 15,
        sizeLines.length * 15
      ];
      const rowH = Math.max(34, Math.max.apply(null, lineHeights) + padV * 2);
      ensure(rowH, true);

      // 斑马底
      if (idx % 2 === 1) {
        ctx.fillStyle = ROW_ALT;
        ctx.fillRect(M, cur.y, CW, rowH);
      }

      const top = cur.y;
      ctx.textBaseline = 'top';

      // #
      ctx.fillStyle = GRAY;
      setFont(ctx, 'normal', 11);
      ctx.textAlign = 'center';
      ctx.fillText(String(idx + 1), colX(0) + COLS[0].w / 2, top + padV);

      // Style No.
      ctx.fillStyle = PRIMARY;
      setFont(ctx, 'bold', 12);
      ctx.textAlign = 'left';
      wrapWords(ctx, it.styleNo || '', COLS[1].w - 16, 12, 'bold').slice(0, 3).forEach((t, i) =>
        ctx.fillText(t, colX(1) + 8, top + padV + i * 15));

      // Description
      let dy = top + padV;
      descLines.forEach(d => {
        ctx.fillStyle = d.color;
        setFont(ctx, d.bold ? 'bold' : 'normal', d.size);
        ctx.textAlign = 'left';
        ctx.fillText(d.t, colX(2) + 8, dy);
        dy += 15;
      });

      // Colors
      ctx.fillStyle = INK;
      setFont(ctx, 'normal', 12);
      ctx.textAlign = 'left';
      colorLines.forEach((t, i) => ctx.fillText(t, colX(3) + 8, top + padV + i * 15));

      // Sizes
      ctx.textAlign = 'center';
      sizeLines.forEach((t, i) => ctx.fillText(t, colX(4) + COLS[4].w / 2, top + padV + i * 15));

      // MOQ
      ctx.textAlign = 'center';
      ctx.fillText(it.moq ? String(it.moq) : '—', colX(5) + COLS[5].w / 2, top + padV);

      // Unit Price / Total
      ctx.textAlign = 'right';
      setFont(ctx, 'normal', 12);
      ctx.fillText(fmtMoney(it.unitPrice), colX(6) + COLS[6].w - 8, top + padV);
      setFont(ctx, '600', 12);
      ctx.fillText(fmtMoney(it.total != null ? it.total : (Number(it.moq) || 0) * (Number(it.unitPrice) || 0)),
        colX(7) + COLS[7].w - 8, top + padV);

      // 行下边框
      line(M, top + rowH, M + CW, top + rowH, '#e5e7eb', 1);
      cur.y += rowH;
    });
    cur.y += 18;
  }

  /* ---------- 合计 ---------- */
  function drawTotals() {
    const ctx = cur.ctx;
    const TW = 300;
    const xL = M + CW - TW;
    const rows = [{ label: 'Subtotal', val: fmtMoney(q.subtotal) }];
    if (q.discountAmount > 0) {
      rows.push({ label: 'Discount' + (q.discountType === 'percentage' ? ' (' + q.discount + '%)' : ''), val: '- ' + fmtMoney(q.discountAmount) });
    }
    if (q.hangerAmount > 0) {
      rows.push({ label: 'Hanger Cost (' + q.hangerCost + '/pc)', val: fmtMoney(q.hangerAmount) });
    }
    const rh = 26;
    const h = rows.length * rh + 40;
    ensure(h);

    let y = cur.y;
    ctx.textBaseline = 'top';
    rows.forEach(r => {
      ctx.fillStyle = GRAY;
      setFont(ctx, 'normal', 13);
      ctx.textAlign = 'right';
      ctx.fillText(r.label, xL + TW - 110, y + 4);
      ctx.fillStyle = INK;
      setFont(ctx, '500', 13);
      ctx.textAlign = 'right';
      ctx.fillText(r.val, xL + TW, y + 4);
      y += rh;
    });
    // Grand Total
    line(xL, y, xL + TW, y, PRIMARY, 2);
    y += 8;
    ctx.fillStyle = PRIMARY;
    setFont(ctx, 'bold', 14);
    ctx.textAlign = 'right';
    ctx.fillText('Grand Total (' + (q.currency || 'USD') + ')', xL + TW - 110, y);
    setFont(ctx, 'bold', 16);
    ctx.fillText((q.currency || 'USD') + ' ' + fmtMoney(q.grandTotal), xL + TW, y - 1);
    cur.y = y + 34;
  }

  /* ---------- 条款 ---------- */
  function drawTerms() {
    const ctx = cur.ctx;
    const terms = [
      ['Payment Terms', q.paymentTerms],
      ['Delivery Terms', q.deliveryTerms],
      ['Lead Time', q.leadTime],
      ['Currency', q.currency],
      ['Season', q.season]
    ];
    const gap = 18;
    const colW = (CW - gap * 4) / 5;
    // 高度
    let maxLines = 1;
    terms.forEach(t => {
      const n = wrapWords(ctx, t[1] || '—', colW, 12).length;
      if (n > maxLines) maxLines = n;
    });
    const h = 18 + maxLines * 16 + 8;
    ensure(h + 14);

    const y0 = cur.y;
    terms.forEach((t, i) => {
      const x = M + i * (colW + gap);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = PRIMARY;
      setFont(ctx, 'bold', 10);
      ctx.fillText(t[0].toUpperCase(), x, y0);
      ctx.fillStyle = INK;
      setFont(ctx, 'normal', 12);
      let y = y0 + 16;
      wrapWords(ctx, t[1] || '—', colW, 12).forEach(line2 => { ctx.fillText(line2, x, y); y += 16; });
    });
    cur.y = y0 + h;
  }

  /* ---------- 备注 ---------- */
  function drawNotes() {
    if (!q.notes) { cur.y += 8; return; }
    const ctx = cur.ctx;
    const lines = wrapWords(ctx, q.notes, CW - 40, 11);
    const h = 22 + lines.length * 16 + 14;
    ensure(h + 14);

    const y = cur.y;
    ctx.fillStyle = ROW_ALT;
    ctx.fillRect(M, y, CW, h);
    ctx.fillStyle = PRIMARY;
    ctx.fillRect(M, y, 3, h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    setFont(ctx, 'bold', 10);
    ctx.fillText('NOTES & REMARKS', M + 20, y + 12);
    ctx.fillStyle = GRAY;
    setFont(ctx, 'normal', 11);
    let ty = y + 30;
    lines.forEach(l => { ctx.fillText(l, M + 20, ty); ty += 16; });
    cur.y = y + h + 20;
  }

  /* ---------- 签字栏 ---------- */
  function drawSignature() {
    const ctx = cur.ctx;
    const h = 96;
    ensure(h);
    const y = cur.y + 28;
    const bw = 210;
    const xL = M + 30;
    const xR = M + CW - bw - 30;

    [xL, xR].forEach(x => line(x, y, x + bw, y, GRAY_LIGHT, 1));
    ctx.fillStyle = GRAY;
    setFont(ctx, 'normal', 11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Customer Signature & Date', xL + bw / 2, y + 8);
    ctx.fillText('Authorized by ' + (s.companyName || ''), xR + bw / 2, y + 8);
    cur.y = y + 40;
  }

  /* ---------- 页脚 ---------- */
  function drawFooter(page, idx, total) {
    const ctx = page.ctx;
    stroke(M, 1086, M + CW, 1086, '#e5e7eb', 1, ctx);
    ctx.fillStyle = GRAY_LIGHT;
    setFont(ctx, 'normal', 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const validity = 'This quotation is valid until ' + (q.validUntil || '—') +
      '. Prices are subject to change without prior notice after the validity date.';
    wrapWords(ctx, validity, CW, 10).forEach((t, i) => ctx.fillText(t, M + CW / 2, 1094 + i * 14));
    const printed = 'Printed by: ' + (s.userName || 'User') + '  |  ' + (q.printDate || '');
    ctx.fillText(printed, M + CW / 2, 1124);
    setFont(ctx, 'normal', 9);
    ctx.fillText('Page ' + idx + ' of ' + total, M + CW / 2, 1152);
  }

  /* ================= 布局 ================= */
  newPage(false);
  drawHeader();
  drawParties();
  drawTableHead(cur);
  drawItems();
  drawTotals();
  drawTerms();
  drawNotes();
  drawSignature();

  pages.forEach((p, i) => drawFooter(p, i + 1, pages.length));
  return pages;
}

module.exports = { renderQuote };
