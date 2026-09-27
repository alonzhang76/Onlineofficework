/* ===== 发票与付款系统 - 前端 PDF 解析 =====
 * 使用 pdf.js 提取文本，用正则解析发票字段。
 * 翻译自 invoice_parser.py（pdfplumber 版），保持相同的解析逻辑。
 */
window.REIM_PDF_LOADED = true;

var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var _pdfjsPromise = null;

function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise(function (resolve, reject) {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    var s = document.createElement('script');
    s.src = PDFJS_URL;
    s.onload = function () {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else { reject(new Error('pdf.js 加载失败')); }
    };
    s.onerror = function () { reject(new Error('pdf.js 加载失败，请检查网络')); };
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

async function extractText(file) {
  var pdfjsLib = await loadPdfJs();
  var buf = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  var parts = [];
  var maxPages = Math.min(pdf.numPages, 3);
  for (var i = 1; i <= maxPages; i++) {
    var page = await pdf.getPage(i);
    var tc = await page.getTextContent();
    parts.push(rebuildLines(tc.items));
  }
  return parts.join('\n');
}

/* 按视觉坐标重建文本行（对齐 pdfplumber extract_text 的行为）。
 * 数电票 PDF 的内容流中"标签"和"值"是分批绘制的（先画全部标签、
 * 后画全部值），直接按流顺序拼接会得到"发票号码："与号码相隔数百字，
 * 因此必须按 y 坐标聚类成行、行内按 x 排序，标签和值才会相邻。 */
function rebuildLines(items) {
  var nodes = [];
  items.forEach(function (it) {
    if (!it.str || it.str.length === 0) return;
    var h = it.height || Math.abs(it.transform[3]) || 9;
    nodes.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: h });
  });
  // 按 y 从大到小（页面上到下）排序，聚类成行
  nodes.sort(function (a, b) { return b.y - a.y; });
  var lines = [];
  nodes.forEach(function (n) {
    var target = null;
    for (var k = 0; k < lines.length; k++) {
      var tol = Math.max(2.5, lines[k].h * 0.35);
      if (Math.abs(n.y - lines[k].y) <= tol) { target = lines[k]; break; }
    }
    if (!target) {
      target = { y: n.y, h: n.h, items: [] };
      lines.push(target);
    } else {
      var cnt = target.items.length;
      target.y = (target.y * cnt + n.y) / (cnt + 1);
      if (n.h > target.h) target.h = n.h;
    }
    target.items.push(n);
  });
  lines.forEach(function (ln) {
    ln.minX = Math.min.apply(null, ln.items.map(function (n) { return n.x; }));
  });
  lines.sort(function (a, b) { return (b.y - a.y) || (a.minX - b.minX); });
  return lines.map(function (ln) {
    ln.items.sort(function (a, b) { return a.x - b.x; });
    var s = '';
    var prevEnd = null;
    ln.items.forEach(function (n) {
      if (prevEnd !== null && n.x - prevEnd > 3) s += ' ';
      s += n.str;
      prevEnd = n.x + Math.max(n.w, n.str.length * n.h * 0.4);
    });
    return s;
  }).join('\n');
}

/* ---------- 解析逻辑（翻译自 invoice_parser.py） ---------- */
var NOISE_PATTERNS = [
  '发票监制章', '全国统一发票监制章', '国家税务总局', '增值税电子普通发票',
  '电子发票（普通发票）', '电子发票（增值税专用发票）', '增值税专用发票',
  '增值税普通发票', '发票联', '抵扣联', '记账联', '第一联', '第二联', '第三联',
  '无效发票', '作废',
];

function cleanLines(text) {
  var lines = [];
  text.split(/\r?\n/).forEach(function (raw) {
    var line = raw.trim();
    if (!line) return;
    var isNoise = NOISE_PATTERNS.some(function (p) {
      return line.indexOf(p) >= 0 && line.length < 40 && line.indexOf(':') < 0 && line.indexOf('：') < 0;
    });
    if (!isNoise) lines.push(line);
  });
  return lines;
}

function extractInvoiceNo(text) {
  var m = text.match(/发\s*票\s*号\s*码[:：\s]*([0-9]{8,20})/);
  if (m) return m[1];
  // 兜底：个别数电票版式号码独立成行（20 位纯数字）
  m = text.match(/(?:^|\n)\s*(\d{20})\s*(?:\n|$)/);
  return m ? m[1] : null;
}

function extractInvoiceCode(text) {
  var m = text.match(/发\s*票\s*代\s*码[:：\s]*([0-9A-Z]{10,12})/);
  return m ? m[1] : null;
}

function extractDate(text) {
  var m = text.match(/开\s*票\s*日\s*期[:：\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return m[1] + '-' + String(parseInt(m[2])).padStart(2, '0') + '-' + String(parseInt(m[3])).padStart(2, '0');
  m = text.match(/开\s*票\s*日\s*期[:：\s]*(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) return m[1] + '-' + String(parseInt(m[2])).padStart(2, '0') + '-' + String(parseInt(m[3])).padStart(2, '0');
  return null;
}

var CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf（）《》""·、';

function cleanPartyName(name) {
  if (!name) return null;
  var s = name.replace(/\u3000/g, ' ').trim();
  var pattern = new RegExp('([' + CJK + '])\\s+(?=[' + CJK + '])', 'g');
  var prev = null;
  while (prev !== s) { prev = s; s = s.replace(pattern, '$1'); }
  s = s.replace(/^[\s:：、,，]+|[\s:：、,，]+$/g, '');
  return s || null;
}

function extractParties(text) {
  // 数电票按坐标重建后两栏同行："名称：购方公司 销 名称：销方公司"
  // （购/销/售可能是竖排"购买方/销售方"标签残留在同一行）
  var m = text.match(/名\s*称\s*[:：]\s*(.+?)\s*[购销售]\s*名\s*称\s*[:：]\s*([^\n]+)/);
  if (!m) m = text.match(/名\s*称\s*[:：]\s*([^\n:：]+?)\s{1,}名\s*称\s*[:：]\s*([^\n]+)/);
  if (m) {
    var buyer2 = cleanPartyName(m[1].split(/统一社会信用代码|纳税人识别号/)[0]);
    var seller2 = cleanPartyName(m[2].split(/统一社会信用代码|纳税人识别号/)[0]);
    if (buyer2 || seller2) return { buyer: buyer2, seller: seller2 };
  }
  // 数电票两栏同行版式（竖排前缀未并入名称行）
  m = text.match(/[购买]\s*名\s*称\s*[:：]\s*(.+?)\s*[销售]\s*名\s*称\s*[:：]\s*([^\n]+)/);
  if (m) {
    var buyer = cleanPartyName(m[1].split(/统一社会信用代码|纳税人识别号/)[0]);
    var seller = cleanPartyName(m[2].split(/统一社会信用代码|纳税人识别号/)[0]);
    return { buyer: buyer, seller: seller };
  }
  // 传统版式
  function party(role) {
    var re = new RegExp(role + '\\s*名\\s*称[:：\\s]*([^\\n]+)');
    var mm = text.match(re);
    if (!mm) return null;
    var name = mm[1].split(/统一社会信用代码|纳税人识别号|登记号/)[0];
    return cleanPartyName(name);
  }
  var buyer = party('购(?:买|货)方') || party('购买方');
  var seller = party('销(?:售|货)方') || party('销售方');
  return { buyer: buyer, seller: seller };
}

function extractTitle(text) {
  var head = text.slice(0, 600);
  if (head.indexOf('增值税专用发票') >= 0 || head.indexOf('电子发票（增值税专用发票）') >= 0) return '增值税专用发票';
  if (head.indexOf('增值税普通发票') >= 0 || head.indexOf('电子发票（普通发票）') >= 0) return '增值税普通发票';
  if (head.indexOf('增值税电子专用发票') >= 0) return '增值税专用发票';
  if (head.indexOf('增值税电子普通发票') >= 0) return '增值税普通发票';
  if (head.indexOf('发票') >= 0) return '其他发票';
  return null;
}

function extractTaxRates(text) {
  var rates = [];
  var re = /(?:^|[\s（(])((?:1[0-3]|9|6|5|3|1|0)(?:\.\d+)?%)(?=[\s）)*/\d¥￥]|$)/g;
  var m;
  while ((m = re.exec(text)) !== null) rates.push(m[1]);
  if (/免\s*税/.test(text)) rates.push('免税');
  if (/不\s*征\s*税/.test(text)) rates.push('不征税');
  rates = Array.from(new Set(rates)).sort(function (a, b) {
    return parseFloat(b) - parseFloat(a);
  });
  return rates;
}

function extractAmounts(text) {
  var amount = null, tax = null, total = null;
  var m = text.match(/合\s*计[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})[^\d¥￥]*[¥￥]\s*([0-9,]+\.\d{2})/);
  if (m) { amount = m[1]; tax = m[2]; }
  m = text.match(/价税合计[（(]大写[）)][^\n]*?[（(]小写[）)]\s*[¥￥]?\s*([0-9,]+\.\d{2})/);
  if (!m) m = text.match(/[（(]小写[）)]\s*[¥￥]\s*([0-9,]+\.\d{2})/);
  if (!m) m = text.match(/价\s*税\s*合\s*计[^\n¥￥]*?[¥￥]\s*([0-9,]+\.\d{2})/);
  if (m) total = m[1];
  if (tax === null) { m = text.match(/税\s*额[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})/); if (m) tax = m[1]; }
  if (amount === null) { m = text.match(/金\s*额[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})/); if (m) amount = m[1]; }
  return { amount: amount, tax: tax, total: total };
}

var NUM_TOKEN = /^[\d.,%¥￥+\-—*#:：/（）()()\[\]]+$/;

/* 合并相邻 CJK 字符间的空白（PDF 分块绘制会把一个词拆成多段） */
function collapseCjkSpaces(s) {
  if (!s) return s;
  var pattern = new RegExp('([' + CJK + '])\\s+(?=[' + CJK + '])', 'g');
  var prev = null;
  while (prev !== s) { prev = s; s = s.replace(pattern, '$1'); }
  return s;
}
var UNIT_TOKENS = { '吨': 1, '个': 1, '件': 1, '台': 1, '张': 1, '次': 1, '米': 1, '千克': 1, '公斤': 1, '克': 1, '升': 1, '箱': 1, '盒': 1, '瓶': 1, '桶': 1, '卷': 1, '包': 1, '套': 1, '只': 1, '根': 1, '块': 1, '批': 1, 'kg': 1, 'L': 1, 'm': 1 };

function extractItems(text) {
  var lines = text.split(/\r?\n/);
  var items = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/\*([^*\n]+)\*(.*)/);
    if (!m) continue;
    var cat = collapseCjkSpaces(m[1].trim()), rest = m[2].trim();
    var toks = rest.split(/\s+/).filter(function (t) {
      return !NUM_TOKEN.test(t) && !UNIT_TOKENS[t];
    });
    var name = collapseCjkSpaces(toks.join(' '));
    var nxt = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    if (nxt && nxt.indexOf('*') !== 0 &&
        !/^(合\s*计|价税|备\s*注|开票人|项目名称|规格型号|销|购|购\s*名|销\s*名)/.test(nxt) &&
        /[\u4e00-\u9fa5A-Za-z]/.test(nxt) &&
        !/[¥￥]|\d{2,}%|\*\S+\*/.test(nxt)) {
      name = collapseCjkSpaces((name ? name + ' ' + nxt : nxt).trim());
    }
    var full = (cat || name) ? (cat + (name ? ' ' + name : '')).trim() : '';
    if (full && items.indexOf(full) < 0) items.push(full);
  }
  return items.slice(0, 6);
}

function extractCheckCode(text) {
  var m = text.match(/校\s*验\s*码[:：\s]*([0-9 ]{6,24})/);
  return m ? m[1].replace(/ /g, '') : null;
}

async function parseInvoicePdf(file) {
  var text = await extractText(file);
  if (!text || text.trim().length < 20) {
    throw new Error('无法从 PDF 中提取文本，可能是扫描件/图片型发票，请改用手工录入。');
  }
  var invoiceNo = extractInvoiceNo(text);
  if (!invoiceNo) {
    throw new Error('未找到发票号码，请确认这是否为增值税/普通发票 PDF，或改用手工录入。');
  }
  var amounts = extractAmounts(text);
  var rates = extractTaxRates(text);
  var items = extractItems(text);
  var parties = extractParties(text);
  return {
    invoice_no: invoiceNo,
    invoice_code: extractInvoiceCode(text),
    invoice_type: extractTitle(text),
    invoice_date: extractDate(text),
    buyer_name: parties.buyer,
    seller_name: parties.seller,
    item_name: items.length ? items.join('；') : null,
    amount: amounts.amount,
    tax_amount: amounts.tax,
    total_amount: amounts.total,
    tax_rate: rates.length ? rates[0] : null,
    all_tax_rates: rates,
    check_code: extractCheckCode(text),
  };
}

window.ReimPdf = {
  parseInvoicePdf: parseInvoicePdf,
  extractText: extractText,
};
