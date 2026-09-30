/* ==========================================================
   采购一体化系统 · 前端 PDF 发票解析
   ----------------------------------------------------------
   来源：移植自 apps/reimbursement-system/static/pdf-parse.js
         （原解析逻辑翻译自该应用后端 invoice_parser.py / pdfplumber 版）
   原理：pdf.js 提取文本 → 按视觉坐标重建文本行 → 正则解析各字段
   特性：
     - 纯前端、无后端依赖，pdf.js 走 CDN 按需加载（多源回退）
     - 支持数电票 / 增值税专票 / 普票 / 电子发票
     - 扫描件（图片型 PDF）无法提文本时抛出可读错误，提示手工录入
   导出：window.PisPdf = { parseInvoicePdf, extractText }
   ========================================================== */
'use strict';

(function () {

  /* pdf.js 多源回退：第一源为本地 vendor（离线/内网/受限环境首选）。
     cmaps/standard_fonts：数电票的"值"（发票号/日期/金额/公司名）使用 CID 编码字体，
     不提供 CMap 时 pdf.js 解码失败、这些字符整体缺失（表现为"未找到发票号码"），
     因此 getDocument 必须带 cMapUrl + standardFontDataUrl。
     inline:true 源会把 CMap/标准字体 base64 数据（vendor/cmaps-data.js、vendor/fonts-data.js）
     一并加载，getDocument 走内嵌工厂（useWorkerFetch:false），全程零 fetch——
     某些静态托管按扩展名做白名单（拒绝 .bcmap/.pfb 返回 403 Forbidden），内嵌方案可绕开。 */
  var PDFJS_SOURCES = [
    { lib: 'vendor/pdf.min.js', worker: 'vendor/pdf.worker.min.js',
      cmaps: 'vendor/cmaps/', fonts: 'vendor/standard_fonts/', inline: true },
    { lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
      cmaps: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      fonts: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/' },
    { lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
      cmaps: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      fonts: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/' },
    { lib: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
      cmaps: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      fonts: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/' }
  ];
  var _pdfjsPromise = null;
  var _activeSource = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('加载失败: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------- 内嵌 CMap/标准字体工厂（零 fetch，绕开托管端扩展名白名单） ---------- */
  function b64ToU8(b64) {
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  /* CMap 工厂：pdf.js 以 { name }（不带扩展名）调用 fetch，成功返回 { cMapData, compressionType }；
     未命中内嵌表时回退 fetch 同 URL（保持 CDN 源行为）。 */
  function makeInlineCMapFactory(fallbackUrl) {
    var table = window.PisCMapData || {};
    function F(opts) { this.baseUrl = (opts && opts.baseUrl) || fallbackUrl || ''; }
    F.prototype.fetch = function (req) {
      var name = req && req.name;
      var b64 = name && table[name];
      if (b64) return Promise.resolve({ cMapData: b64ToU8(b64), compressionType: 1 });
      return fetch(this.baseUrl + name + '.bcmap').then(function (r) {
        if (!r.ok) throw new Error('fetchBuiltInCMap: failed to fetch file "' + name + '.bcmap"');
        return r.arrayBuffer();
      }).then(function (ab) { return { cMapData: new Uint8Array(ab), compressionType: 1 }; });
    };
    return F;
  }
  /* 标准字体工厂：pdf.js 以 { filename }（带扩展名）调用，成功返回 { data }。 */
  function makeInlineFontFactory(fallbackUrl) {
    var table = window.PisFontData || {};
    function F(opts) { this.baseUrl = (opts && opts.baseUrl) || fallbackUrl || ''; }
    F.prototype.fetch = function (req) {
      var name = req && (req.filename || req.name);
      var b64 = name && table[name];
      if (b64) return Promise.resolve({ data: b64ToU8(b64) });
      return fetch(this.baseUrl + name).then(function (r) {
        if (!r.ok) throw new Error('fetchStandardFontData: failed to fetch file "' + name + '"');
        return r.arrayBuffer();
      }).then(function (ab) { return { data: new Uint8Array(ab) }; });
    };
    return F;
  }
  function buildDocParams(buf, src) {
    var params = {
      data: buf,
      cMapUrl: src.cmaps,
      cMapPacked: true,
      standardFontDataUrl: src.fonts
    };
    try {
      if (window.PisCMapData) {
        params.useWorkerFetch = false;               // CMap 请求回传主线程，走内嵌工厂
        params.CMapReaderFactory = makeInlineCMapFactory(src.cmaps);
        if (window.PisFontData) {
          params.StandardFontDataFactory = makeInlineFontFactory(src.fonts);
        }
      }
    } catch (e) { /* 工厂不可用时保持默认 fetch 行为 */ }
    return params;
  }

  function loadPdfJs() {
    if (_pdfjsPromise) return _pdfjsPromise;
    _pdfjsPromise = (async function () {
      if (window.pdfjsLib) { _activeSource = PDFJS_SOURCES[1]; return window.pdfjsLib; }
      var lastErr = null;
      for (var i = 0; i < PDFJS_SOURCES.length; i++) {
        var src = PDFJS_SOURCES[i];
        try {
          if (!window.pdfjsLib) await loadScript(src.lib);
          if (window.pdfjsLib) {
            try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.worker; } catch (e) { /* 忽略 */ }
            if (src.inline) {
              try { if (!window.PisCMapData) await loadScript('vendor/cmaps-data.js'); } catch (e) { /* 缺数据走 fetch 回退 */ }
              try { if (!window.PisFontData) await loadScript('vendor/fonts-data.js'); } catch (e) { /* 同上 */ }
            }
            _activeSource = src;
            return window.pdfjsLib;
          }
        } catch (e) { lastErr = e; }
      }
      throw new Error('pdf.js 加载失败，请检查网络连接后重试（' + (lastErr ? lastErr.message : '无可用源') + '）');
    })();
    return _pdfjsPromise;
  }

  /* ---------- 文本提取 ---------- */
  async function extractText(file) {
    var pdfjsLib = await loadPdfJs();
    var buf = await file.arrayBuffer();
    var src = _activeSource || {};
    var pdf = await pdfjsLib.getDocument(buildDocParams(buf, src)).promise;
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
        /* 行锚不漂移：江苏版数电票左侧的竖排装饰（监制章"全国统一发票监制章"、
           "购买方信息"竖排）y 跨度 20+，若做 y 均值漂移会把行锚一路拉偏，
           导致同一水平线上的"发票号码："与号码（y 相差仅 0.5）被吞进竖排行、
           行内排序后标签跑到值的后面，发票号正则失配。改为锚定首个成员的 y。 */
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

  /* ---------- 解析逻辑 ---------- */
  var NOISE_PATTERNS = [
    '发票监制章', '全国统一发票监制章', '国家税务总局', '增值税电子普通发票',
    '电子发票（普通发票）', '电子发票（增值税专用发票）', '增值税专用发票',
    '增值税普通发票', '发票联', '抵扣联', '记账联', '第一联', '第二联', '第三联',
    '无效发票', '作废'
  ];

  function extractInvoiceNo(text) {
    var m = text.match(/发\s*票\s*号\s*码[:：\s]*([0-9]{8,20})/);
    if (m) return m[1];
    /* 兜底：新版数电票标签与号码被拆散到不同行时，号码（20 位）可能游离在
       监制章文字旁，按独立 20 位数字全局查找（前后不得紧挨数字） */
    m = text.match(/(?:^|[^0-9])([0-9]{20})(?![0-9])/);
    return m ? m[1] : null;
  }

  function extractInvoiceCode(text) {
    var m = text.match(/发\s*票\s*代\s*码[:：\s]*([0-9A-Z]{10,12})/);
    return m ? m[1] : null;
  }

  function extractDate(text) {
    var m = text.match(/开\s*票\s*日\s*期[:：\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (m) return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
    m = text.match(/开\s*票\s*日\s*期[:：\s]*(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
    if (m) return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
    /* 兜底：标签与日期值被拆散到不同行（新版数电票）时全文取第一个「YYYY年M月D日」 */
    m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (m) return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
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

  /* 兜底识别企业名称（标签与公司名被拆散到不同行的新版数电票版式）：
     按阅读顺序发现企业/经营主体，左栏购买方在前、右栏销售方在后 */
  var ORG_SUFFIX = '(?:有限责任公司|股份有限公司|个人独资企业|个体工商户|农民专业合作社|' +
    '合伙企业|有限公司|分公司|合作社|研究所|研究院|事务所|经营部|经销部|' +
    '门市部|加工厂|制造厂|商行|门店|工厂|中心|工作室|宾馆|酒店|商店|医院)';
  var ORG_NAME_RE = new RegExp('[一-龥A-Za-z0-9（）()·]{2,40}?' + ORG_SUFFIX, 'g');
  var ORG_NOISE = ['税务总局', '税务局', '国务院', '财政部', '海关', '人民政府', '人民法院',
    '市场监督管理局', '公安局', '住建局', '教育局', '卫生局'];
  function discoverOrgs(t) {
    var out = [], mm;
    ORG_NAME_RE.lastIndex = 0;
    while ((mm = ORG_NAME_RE.exec(t)) !== null) {
      var name = cleanPartyName(mm[0]);
      if (!name) continue;
      var noise = false;
      for (var i = 0; i < ORG_NOISE.length; i++) if (name.indexOf(ORG_NOISE[i]) >= 0) { noise = true; break; }
      if (noise) continue;
      if (out.indexOf(name) < 0) out.push(name);
    }
    return out;
  }

  function extractParties(text) {
    /* 数电票按坐标重建后两栏同行："名称：购方公司 销 名称：销方公司" */
    var m = text.match(/名\s*称\s*[:：]\s*(.+?)\s*[购销售]\s*名\s*称\s*[:：]\s*([^\n]+)/);
    if (!m) m = text.match(/名\s*称\s*[:：]\s*([^\n:：]+?)\s{1,}名\s*称\s*[:：]\s*([^\n]+)/);
    var buyer = null, seller = null;
    if (m) {
      buyer = cleanPartyName(m[1].split(/统一社会信用代码|纳税人识别号/)[0]);
      seller = cleanPartyName(m[2].split(/统一社会信用代码|纳税人识别号/)[0]);
    }
    /* 数电票两栏同行版式（竖排前缀未并入名称行）——仅当上方未拿到完整双方时尝试 */
    if (!buyer || !seller) {
      m = text.match(/[购买]\s*名\s*称\s*[:：]\s*(.+?)\s*[销售]\s*名\s*称\s*[:：]\s*([^\n]+)/);
      if (m) {
        var b2 = cleanPartyName(m[1].split(/统一社会信用代码|纳税人识别号/)[0]);
        var s2 = cleanPartyName(m[2].split(/统一社会信用代码|纳税人识别号/)[0]);
        if (b2 && b2 !== '售' && b2 !== '销') buyer = buyer || b2;
        if (s2) seller = seller || s2;
      }
    }
    /* 传统版式 */
    function party(role) {
      var re = new RegExp(role + '\\s*名\\s*称[:：\\s]*([^\\n]+)');
      var mm = text.match(re);
      if (!mm) return null;
      return cleanPartyName(mm[1].split(/统一社会信用代码|纳税人识别号|登记号/)[0]);
    }
    buyer = buyer || party('购(?:买|货)方') || party('购买方');
    seller = seller || party('销(?:售|货)方') || party('销售方');
    /* 兜底：标签行无值（如只剩"名称：  名称："），按阅读顺序发现企业名 */
    if (!buyer || !seller) {
      var orgs = discoverOrgs(text);
      if (!buyer && orgs.length) buyer = orgs[0];
      if (!seller) for (var k = 0; k < orgs.length; k++) { if (orgs[k] !== buyer) { seller = orgs[k]; break; } }
    }
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
    rates = Array.from(new Set(rates)).sort(function (a, b) { return parseFloat(b) - parseFloat(a); });
    return rates;
  }

  function extractAmounts(text) {
    var amount = null, tax = null, total = null;
    /* 合计行：新版数电票（如江苏）聚类后"合 计"标签与两个金额可能分处相邻行，
       用限长 [\s\S] 跨行（限 80 字符防吞到价税合计的金额） */
    var m = text.match(/合\s*计[\s\S]{0,80}?[¥￥]\s*([0-9,]+\.\d{2})[\s\S]{0,20}?[¥￥]\s*([0-9,]+\.\d{2})/);
    if (m) { amount = m[1]; tax = m[2]; }
    /* 价税合计：(小写)与金额可能跨行，且中间可能隔大写金额文字 */
    m = text.match(/价税合计[（(]大写[）)][\s\S]{0,60}?[（(]小写[）)]\s*[¥￥]?\s*([0-9,]+\.\d{2})/);
    if (!m) m = text.match(/[（(]小写[）)][\s\S]{0,50}?[¥￥]\s*([0-9,]+\.\d{2})/);
    if (!m) m = text.match(/价\s*税\s*合\s*计[\s\S]{0,60}?[¥￥]\s*([0-9,]+\.\d{2})/);
    if (m) total = m[1];
    if (tax === null) { m = text.match(/税\s*额[\s\S]{0,40}?[¥￥]\s*([0-9,]+\.\d{2})/); if (m) tax = m[1]; }
    if (amount === null) { m = text.match(/金\s*额[\s\S]{0,40}?[¥￥]\s*([0-9,]+\.\d{2})/); if (m) amount = m[1]; }
    /* 互推兜底：三者知其二可推其三（聚类后个别标签行仍可能丢失） */
    function num(s) { return s ? parseFloat(String(s).replace(/,/g, '')) : null; }
    var a = num(amount), t = num(tax), tt = num(total);
    if (tt !== null && a === null && t !== null) amount = (tt - t).toFixed(2);
    if (tt !== null && t === null && a !== null) tax = (tt - a).toFixed(2);
    if (tt === null && a !== null && t !== null) total = (a + t).toFixed(2);
    return { amount: amount, tax: tax, total: total };
  }

  var NUM_TOKEN = /^[\d.,%¥￥+\-—*#:：/（）()()\[\]]+$/;

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
      var toks = rest.split(/\s+/).filter(function (t) { return !NUM_TOKEN.test(t) && !UNIT_TOKENS[t]; });
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

  /* 解析出的发票类型 → 本系统 invoices.invoiceType 取值（专用发票 / 普通发票） */
  function mapInvoiceType(t) {
    if (!t) return '';
    if (t.indexOf('专用') >= 0) return '专用发票';
    if (t.indexOf('普通') >= 0) return '普通发票';
    return '';
  }

  /* 销方名称归一化：去掉常见后缀噪声与空白，便于与供应商名做模糊匹配 */
  function normPartyName(n) {
    if (!n) return '';
    return String(n)
      .replace(/\u3000/g, '')
      .replace(/[\s（）()·、,，]/g, '')
      .replace(/(有限责任公司|股份有限公司|有限公司|公司|厂|经营部|商行|店)$/, '')
      .trim();
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
    var rawType = extractTitle(text);
    return {
      /* 原始字段（与参考应用保持一致，便于对照） */
      invoice_no: invoiceNo,
      invoice_code: extractInvoiceCode(text),
      invoice_type: rawType,
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
      /* 本系统映射字段 */
      pis_type: mapInvoiceType(rawType),
      seller_norm: normPartyName(parties.seller)
    };
  }

  window.PisPdf = {
    parseInvoicePdf: parseInvoicePdf,
    extractText: extractText,
    normPartyName: normPartyName,
    mapInvoiceType: mapInvoiceType
  };
})();
