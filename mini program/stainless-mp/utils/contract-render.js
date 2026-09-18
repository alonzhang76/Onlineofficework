/**
 * contract-render.js — 销售合同 / 采购合同 Canvas 渲染器
 *
 * 对齐桌面端 apps/stainlessbusiness 合同模板：
 *   A4 纵向、页眉 Logo+公司抬头、买卖双方信息栏、
 *   销售 13 列 / 采购 12 列产品表、合计与金额大写、
 *   坯料产地/其它要求/备注、13 条合同条款、
 *   签字区红色印章（-5° 旋转、约 56mm、盖在本方盖章处）。
 *
 * 红章 PNG 透明背景先在 canvas 上与合同页合成，再整页导出 JPEG，
 * 从而规避 JPEG 不支持透明通道的问题。
 *
 * renderContract(doc) → Promise<Page[]>，交给 pdf-share.sharePages()
 */
const { amountToChinese } = require('./num-cn');

const RENDER_SCALE = 2;
const W = 842;
const H = 1190;
const M = 40;
const CW = W - M * 2;     // 762
const BOTTOM = 1132;
const SEAL_H = 152;      // 约 56mm（96dpi 逻辑像素）

/* 销售合同 13 列 */
const SALES_COLS = {
  headers: ['序号', '产品', '物料编码/图号', '材质', '规格', '炉号', '质保书号码',
            '数量', '单位', '重量', '重量单位', '单价(元)', '金额(元)'],
  widths: [30, 86, 70, 52, 124, 46, 58, 40, 34, 56, 40, 60, 66]
};
/* 采购合同 12 列 */
const PURCHASE_COLS = {
  headers: ['序号', '产品', '坯料产地', '材质', '规格', '炉号',
            '数量', '单位', '重量', '重量单位', '单价(元)', '金额(元)'],
  widths: [28, 92, 80, 54, 140, 52, 42, 36, 64, 46, 62, 66]
};

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function money(n) {
  const v = round2(n);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function createPageCanvas() {
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: W * RENDER_SCALE, height: H * RENDER_SCALE });
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  return { canvas: canvas, ctx: ctx, width: W, height: H, pixelWidth: W * RENDER_SCALE, pixelHeight: H * RENDER_SCALE, y: M + 90 };
}

function loadImage(page, src) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    try {
      const img = page.canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('[contract] 图片加载失败', src); resolve(null); };
      img.src = src;
    } catch (e) { resolve(null); }
  });
}

function setFont(ctx, weight, size) {
  ctx.font = weight + ' ' + size + 'px sans-serif';
}

/** 等宽中文字间距标题（桌面端逐字加空格效果） */
function drawSpaced(ctx, text, cx, y, size, weight, spacing) {
  setFont(ctx, weight || 'bold', size);
  const gap = spacing === undefined ? 6 : spacing;
  const chars = String(text).split('');
  let total = 0;
  chars.forEach((ch, i) => { total += ctx.measureText(ch).width + (i < chars.length - 1 ? gap : 0); });
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + gap;
  });
}

function wrapLines(ctx, text, maxW, size, weight) {
  setFont(ctx, weight || 'normal', size);
  const out = [];
  String(text == null ? '' : text).split('\n').forEach(seg => {
    let line = '';
    seg.split('').forEach(ch => {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = ch; }
      else line = test;
    });
    out.push(line);
  });
  return out.length ? out : [''];
}

function xPositions(widths) {
  const xs = [M];
  widths.forEach(w => xs.push(xs[xs.length - 1] + w));
  return xs;
}

/* ================= 主入口 ================= */
async function renderContract(doc) {
  const isSales = doc.type !== 'purchase';
  const COLS = isSales ? SALES_COLS : PURCHASE_COLS;
  const pages = [];
  let cur = null;
  const company = doc.company || {};
  const party = doc.party || {};
  const contact = doc.contact || {};

  async function newPage(first) {
    const page = createPageCanvas();
    pages.push(page);
    cur = page;
    if (first) await drawFirstHeader(page);
    else drawContHeader(page);
    return page;
  }

  /* ---- 首页页眉 ---- */
  async function drawFirstHeader(page) {
    const ctx = page.ctx;
    const logo = await loadImage(page, doc.logoPath);
    if (logo) {
      const h = 46;
      const w = Math.max(30, Math.round(h * logo.width / logo.height));
      ctx.drawImage(logo, M, 26, w, h);
    }
    const nameX = M + 92;
    ctx.fillStyle = '#111827';
    drawSpaced(ctx, company.nameCn || '', nameX + 150, 28, 19, 'bold', 2);
    ctx.textAlign = 'left';
    setFont(ctx, 'normal', 8.5);
    ctx.fillStyle = '#6b7280';
    if (company.nameEn) ctx.fillText(company.nameEn, nameX, 54, 520);
    setFont(ctx, 'normal', 9);
    ctx.fillStyle = '#374151';
    if (company.address) wrapLines(ctx, company.address, 520, 9).forEach((l, i) => ctx.fillText(l, nameX, 66 + i * 12));

    // 右上合同信息
    setFont(ctx, 'normal', 10);
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const metas = [
      '合同号：' + (doc.no || ''),
      '签约地：无锡',
      '合同日期：' + (doc.date || ''),
      '交货日期：' + (doc.deliveryDate || '')
    ];
    metas.forEach((t, i) => ctx.fillText(t, W - M, 28 + i * 16));
    ctx.textAlign = 'left';

    // 标题
    ctx.fillStyle = '#111827';
    drawSpaced(ctx, isSales ? '销售合同' : '采购合同', W / 2, 92, 24, 'bold', 10);
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, 126);
    ctx.lineTo(W - M, 126);
    ctx.stroke();
    page.y = 136;
  }

  /* ---- 续页页眉 ---- */
  function drawContHeader(page) {
    const ctx = page.ctx;
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawSpaced(ctx, company.nameCn || '', M + 70, 24, 12, 'bold', 1);
    setFont(ctx, 'normal', 9);
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText((isSales ? '销售合同' : '采购合同') + '  ' + (doc.no || ''), W - M, 26);
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(M, 46);
    ctx.lineTo(W - M, 46);
    ctx.stroke();
    ctx.textAlign = 'left';
    page.y = 56;
  }

  /* ---- 买卖双方信息栏 ---- */
  async function drawParties(page) {
    const ctx = page.ctx;
    const gap = 10;
    const bw = (CW - gap) / 2;
    const pad = 8;
    const labelW = 58;
    const size = 9;
    const lh = 14.5;

    const leftRole = isSales ? '卖方' : '买方';
    const rightRole = isSales ? '买方' : '卖方';
    const leftRows = [
      ['名称', company.nameCn || ''],
      ['纳税人识别号', company.taxNo || ''],
      ['地址', company.address || ''],
      ['电话', company.phone || ''],
      ['开户行', company.bankName || ''],
      ['账号', company.bankAccount || ''],
      ['行号', company.bankCode || '']
    ];
    const rightRows = [
      ['名称', party.name || ''],
      ['地址', contact.address || ''],
      ['联系人', contact.contactPerson || ''],
      ['电话', contact.phone || ''],
      ['邮箱', contact.email || ''],
      ['开户行', contact.bankAddress || ''],
      ['行号', contact.bankCode || ''],
      ['账号', contact.bankAccount || '']
    ];

    function measure(rows) {
      let lines = 0;
      rows.forEach(r => {
        const text = r[0] + '：' + (r[1] || '');
        lines += wrapLines(ctx, text, bw - pad * 2 - labelW, size).length;
      });
      return lines;
    }
    const bodyLines = Math.max(measure(leftRows), measure(rightRows));
    const headH = 22;
    const boxH = headH + pad + bodyLines * lh + pad;

    function drawBox(x, role, rows) {
      ctx.strokeStyle = '#9ca3af';
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(x, page.y, bw, headH);
      ctx.strokeRect(x, page.y, bw, boxH);
      ctx.beginPath();
      ctx.moveTo(x, page.y + headH);
      ctx.lineTo(x + bw, page.y + headH);
      ctx.stroke();
      setFont(ctx, 'bold', 10);
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(role, x + pad, page.y + headH / 2 + 1);
      // 内容
      setFont(ctx, 'normal', size);
      ctx.textBaseline = 'top';
      let yy = page.y + headH + pad;
      rows.forEach(r => {
        const head = r[0] + '：';
        const ls = wrapLines(ctx, head + (r[1] || ''), bw - pad * 2 - labelW, size);
        ls.forEach((line, i) => {
          ctx.fillStyle = '#374151';
          if (i === 0) {
            setFont(ctx, 'normal', size);
            ctx.fillStyle = '#6b7280';
            ctx.fillText(head, x + pad, yy);
            ctx.fillStyle = '#1f2937';
            ctx.fillText(line.slice(head.length), x + pad + labelW, yy);
          } else {
            ctx.fillStyle = '#1f2937';
            ctx.fillText(line, x + pad + labelW, yy);
          }
          yy += lh;
        });
      });
    }

    drawBox(M, leftRole, leftRows);
    drawBox(M + bw + gap, rightRole, rightRows);
    page.y += boxH + 12;
  }

  /* ---- 产品表 ---- */
  const xs = xPositions(COLS.widths);
  const headH = 26;

  function drawTableHeader(atY) {
    const ctx = cur.ctx;
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(M, atY, CW, headH);
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(M, atY, CW, headH);
    setFont(ctx, 'bold', 8.5);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    COLS.headers.forEach((h, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2;
      wrapLines(ctx, h, COLS.widths[i] - 4, 8.5, 'bold').forEach((l, li, arr) => {
        ctx.fillText(l, cx, atY + headH / 2 + (li - (arr.length - 1) / 2) * 10 + 1);
      });
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(xs[i], atY);
        ctx.lineTo(xs[i], atY + headH);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'left';
  }

  function cellLines(item, colIdx) {
    const size = 8.5;
    let v;
    if (isSales) {
      const wAdj = (Number(item.weight) || 0) + (Number(item.weightAdjustment) || 0);
      const amount = round2(wAdj * (Number(item.price) || 0));
      v = [
        item.seq, item.product, item.materialCode, item.material, item.specification,
        item.heatNo, item.warrantyNo,
        item.quantity === '' || item.quantity == null ? '' : String(item.quantity),
        item.unit || '',
        wAdj.toFixed(2), item.weightUnit || '',
        item.price === '' || item.price == null ? '' : money(item.price),
        money(amount)
      ][colIdx];
    } else {
      const amount = item.totalAmount !== '' && item.totalAmount != null
        ? round2(item.totalAmount)
        : round2((Number(item.weight) || 0) * (Number(item.price) || 0));
      v = [
        item.seq, item.product, item.inventoryNo, item.material, item.specification,
        item.heatNo,
        item.quantity === '' || item.quantity == null ? '' : String(item.quantity),
        item.unit || '',
        (Number(item.weight) || 0).toFixed(2), item.weightUnit || '',
        item.price === '' || item.price == null ? '' : money(item.price),
        money(amount)
      ][colIdx];
    }
    const lines = wrapLines(cur.ctx, v === undefined || v === null ? '' : v, COLS.widths[colIdx] - 6, size);
    return lines.slice(0, 4);
  }

  async function drawItemRow(item, totals) {
    const lineSets = COLS.headers.map((h, i) => cellLines(item, i));
    const maxLines = Math.max.apply(null, lineSets.map(ls => ls.length));
    const rowH = Math.max(24, maxLines * 11 + 7);
    if (cur.y + rowH + headH > BOTTOM) {
      await newPage(false);
      drawTableHeader(cur.y);
      cur.y += headH;
    }
    const ctx = cur.ctx;
    const atY = cur.y;
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(M, atY, CW, rowH);
    setFont(ctx, 'normal', 8.5);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lineSets.forEach((ls, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2;
      ls.forEach((l, li) => {
        ctx.fillText(l, cx, atY + rowH / 2 + (li - (ls.length - 1) / 2) * 11);
      });
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(xs[i], atY);
        ctx.lineTo(xs[i], atY + rowH);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'left';
    cur.y += rowH;

    totals.qty += Number(item.quantity) || 0;
    if (isSales) {
      totals.weight += (Number(item.weight) || 0) + (Number(item.weightAdjustment) || 0);
      totals.amount += round2(((Number(item.weight) || 0) + (Number(item.weightAdjustment) || 0)) * (Number(item.price) || 0));
    } else {
      totals.weight += Number(item.weight) || 0;
      totals.amount += item.totalAmount !== '' && item.totalAmount != null
        ? round2(item.totalAmount)
        : round2((Number(item.weight) || 0) * (Number(item.price) || 0));
    }
  }

  async function drawTotals(totals) {
    const rowH = 26;
    if (cur.y + rowH + headH > BOTTOM) {
      await newPage(false);
      drawTableHeader(cur.y);
      cur.y += headH;
    }
    const ctx = cur.ctx;
    const atY = cur.y;
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(M, atY, CW, rowH);
    const segs = [
      { from: 0, to: 6, text: '数量合计  ' + round2(totals.qty) },
      { from: 7, to: 9, text: (isSales ? '调整后重量合计  ' : '重量合计  ') + totals.weight.toFixed(2) },
      { from: 10, to: 10, text: '' },
      { from: 11, to: 12, text: '金额合计  ¥' + money(totals.amount) }
    ];
    setFont(ctx, 'bold', 9);
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'middle';
    segs.forEach(s => {
      const x0 = xs[s.from];
      const x1 = xs[s.to + 1];
      ctx.textAlign = 'right';
      if (s.text) ctx.fillText(s.text, x1 - 6, atY + rowH / 2 + 1);
      if (s.from > 0) {
        ctx.beginPath();
        ctx.moveTo(x0, atY);
        ctx.lineTo(x0, atY + rowH);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'left';
    cur.y += rowH + 12;
    return round2(totals.amount);
  }

  /* ---- 普通文本块（自动分页，整块移动） ---- */
  async function drawBlock(title, lines2) {
    if (!lines2 || !lines2.length) return;
    const ctx = cur.ctx;
    const size = 9;
    const lh = 14;
    const all = [];
    lines2.forEach(l => { wrapLines(ctx, l, CW - 8, size).forEach(w => all.push(w)); });
    const need = 18 + all.length * lh + 8;
    if (cur.y + need > BOTTOM) await newPage(false);
    setFont(ctx, 'bold', 10);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, M, cur.y);
    cur.y += 18;
    setFont(ctx, 'normal', size);
    ctx.fillStyle = '#1f2937';
    all.forEach(l => { ctx.fillText(l, M + 4, cur.y); cur.y += lh; });
    cur.y += 8;
  }

  /* ---- 合同条款 ---- */
  async function drawTerms() {
    const terms = doc.terms || [];
    const ctx = cur.ctx;
    const size = 9;
    const lh = 14;
    const groups = terms.map((t, i) => {
      const head = (i + 1) + '. ';
      const ls = wrapLines(ctx, head + (t.content || t), CW - 22, size);
      return ls;
    });
    // 标题
    if (cur.y + 40 > BOTTOM) await newPage(false);
    setFont(ctx, 'bold', 10.5);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('合同条款', M, cur.y);
    cur.y += 20;
    groups.forEach(ls => {
      const need = ls.length * lh + 4;
      if (cur.y + need > BOTTOM) {
        // 单条跨页：续页继续
      }
      setFont(ctx, 'normal', size);
      ctx.fillStyle = '#1f2937';
      ls.forEach((l, i) => {
        if (cur.y + lh > BOTTOM) { /* 理论上空间足够；兜底 */ }
        ctx.fillText(l, i === 0 ? M + 2 : M + 16, cur.y);
        cur.y += lh;
      });
      cur.y += 4;
    });
    cur.y += 6;
  }

  /* ---- 签字栏 + 红章 ---- */
  async function drawSignatures() {
    const need = 168;
    if (cur.y + need > BOTTOM) await newPage(false);
    const ctx = cur.ctx;
    const leftRole = isSales ? '卖方（盖章）：' : '买方（盖章）：';
    const rightRole = isSales ? '买方（盖章）：' : '卖方（盖章）：';
    const x0 = M;
    const x1 = M + CW / 2 + 10;
    const y0 = cur.y + 6;
    const lh = 26;
    setFont(ctx, 'normal', 10);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const leftLines = [leftRole, '', '单位名称：' + (company.nameCn || ''),
      '代表签字：' + (company.legalPerson || ''), '日期：' + (doc.date || '')];
    const rightLines = [rightRole, '', '单位名称：' + (party.name || ''),
      '代表签字：', '日期：'];
    leftLines.forEach((l, i) => ctx.fillText(l, x0, y0 + i * lh));
    rightLines.forEach((l, i) => ctx.fillText(l, x1, y0 + i * lh));

    // 红色印章：盖在本方（左栏）签字区，-5° 旋转
    try {
      const seal = await loadImage(cur, doc.sealPath);
      if (seal) {
        const h = SEAL_H;
        const w = h * seal.width / seal.height;
        const cx = x0 + 118;
        const cy = y0 + 58;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.translate(cx, cy);
        ctx.rotate(-5 * Math.PI / 180);
        ctx.drawImage(seal, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    } catch (e) {}
    cur.y += need;
  }

  /* ---- 页脚（排版完成、总页数确定后统一绘制） ---- */
  function drawFooters() {
    const total = pages.length;
    const d = new Date();
    const printDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    pages.forEach((p, i) => {
      const ctx = p.ctx;
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(M, H - 40);
      ctx.lineTo(W - M, H - 40);
      ctx.stroke();
      setFont(ctx, 'normal', 8);
      ctx.fillStyle = '#9ca3af';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('合同号：' + (doc.no || ''), M, H - 32);
      ctx.textAlign = 'center';
      ctx.fillText('第 ' + (i + 1) + ' / ' + total + ' 页', W / 2, H - 32);
      ctx.textAlign = 'right';
      ctx.fillText('打印日期：' + printDate, W - M, H - 32);
      ctx.textAlign = 'left';
    });
  }

  /* ================= 排版流程 ================= */
  await newPage(true);
  await drawParties(cur);

  drawTableHeader(cur.y);
  cur.y += headH;

  const totals = { qty: 0, weight: 0, amount: 0 };
  const items = (doc.items || []).map((it, idx) => Object.assign({ seq: idx + 1 }, it));
  for (let i = 0; i < items.length; i++) {
    await drawItemRow(items[i], totals);
  }
  await drawTotals(totals);

  // 金额大写
  {
    const ctx = cur.ctx;
    if (cur.y + 40 > BOTTOM) await newPage(false);
    setFont(ctx, 'bold', 10);
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const line1 = '共计人民币（含税）：¥' + money(totals.amount);
    const line2 = '大写：' + amountToChinese(totals.amount);
    wrapLines(ctx, line1, CW, 10, 'bold').forEach((l, i) => { ctx.fillText(l, M, cur.y); cur.y += 16; });
    cur.y += 2;
    wrapLines(ctx, line2, CW, 10, 'bold').forEach((l, i) => { ctx.fillText(l, M, cur.y); cur.y += 16; });
    cur.y += 8;
  }

  // 坯料产地 / 其它要求 / 备注
  if (isSales) {
    const origins = [], reqs = [], remarks = [];
    items.forEach((it, i) => {
      if (it.inventoryNo) origins.push('序号' + (i + 1) + '：' + it.inventoryNo);
      if (it.otherRequirements) reqs.push('序号' + (i + 1) + '：' + it.otherRequirements);
      if (it.description) remarks.push('序号' + (i + 1) + '：' + it.description);
    });
    await drawBlock('坯料产地', origins);
    await drawBlock('其它要求', reqs);
    await drawBlock('备注', remarks);
  } else {
    const reqs = [], remarks = [];
    items.forEach((it, i) => {
      if (it.otherRequirements) reqs.push('序号' + (i + 1) + '：' + it.otherRequirements);
      if (it.remarks) remarks.push('序号' + (i + 1) + '：' + it.remarks);
    });
    await drawBlock('其它要求', reqs);
    await drawBlock('备注', remarks);
  }

  await drawTerms();
  await drawSignatures();
  drawFooters();

  return pages;
}

module.exports = { renderContract };
