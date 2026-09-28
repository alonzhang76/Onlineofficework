/**
 * 发票 PDF 解析（微信小程序版）
 *
 * 移植自电脑端 apps/reimbursement-system/static/pdf-parse.js：
 * 字段正则与电脑端完全一致；文本提取部分因小程序主包体积受限
 * （无法内嵌 pdf.js），实现了一个面向发票 PDF 的轻量提取器：
 *   1. 扫描 PDF 间接对象，FlateDecode 流用内置 DEFLATE 解码器解压
 *      （含 ObjStm 压缩对象流的展开）
 *   2. 解析字体 ToUnicode CMap，把 CID 编码还原为中文
 *   3. 按内容流文本操作符（Tj/TJ/Tf/Td/Tm…）提取带坐标的文本片段，
 *      递归处理 Form XObject（部分税局发票把全部文字画在 Form 里）
 *   4. 按 y 坐标聚类、x 坐标排序重建视觉行——比逐项顺序合并更能
 *      适应税局发票「先写标签再写数值」的两段式内容流
 *   5. 用与电脑端相同的正则解析发票号/日期/购销方/金额/税率/品名等
 *
 * 仅支持文本型 PDF；扫描件/图片型会抛错提示改用手工录入。
 * 输入：ArrayBuffer / Uint8Array；输出：字段对象（与电脑端同构）。
 */

/* ==================== DEFLATE 解码（RFC 1951） ==================== */

function inflateRaw(u8) {
  let pos = 0, bitBuf = 0, bitCnt = 0;
  const out = [];

  function bits(n) {
    while (bitCnt < n) {
      if (pos >= u8.length) throw new Error('deflate: 输入提前结束');
      bitBuf |= u8[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  }
  function alignByte() {
    // 丢弃当前字节内已缓存的剩余位：整字节回退到位指针，缓存清零
    pos -= (bitCnt >> 3);
    bitCnt = 0;
    bitBuf = 0;
  }
  function rawByte() { if (pos >= u8.length) throw new Error('deflate: 输入提前结束'); return u8[pos++]; }

  function buildHuff(lengths) {
    const blCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let maxLen = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i]) {
        blCount[lengths[i]]++;
        if (lengths[i] > maxLen) maxLen = lengths[i];
      }
    }
    const nextCode = new Array(maxLen + 2).fill(0);
    let code = 0;
    for (let l = 1; l <= maxLen; l++) {
      code = (code + blCount[l - 1]) << 1;
      nextCode[l] = code;
    }
    // 简单查表：code<<4|len → symbol（发票级数据量下性能足够）
    const table = {};
    for (let i = 0; i < lengths.length; i++) {
      const len = lengths[i];
      if (len) { table[nextCode[len] * 16 + len] = i; nextCode[len]++; }
    }
    return { table: table, maxLen: maxLen };
  }

  function decodeSym(h) {
    let code = 0, len = 0;
    do {
      code = (code << 1) | bits(1);
      len++;
      if (len > h.maxLen) throw new Error('deflate: 非法霍夫曼码');
      const sym = h.table[code * 16 + len];
      if (sym !== undefined) return sym;
    } while (true);
  }

  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function block(huffLit, huffDist) {
    while (true) {
      const sym = decodeSym(huffLit);
      if (sym < 256) { out.push(sym); }
      else if (sym === 256) return;
      else {
        const li = sym - 257;
        if (li >= LEN_BASE.length) throw new Error('deflate: 非法长度码');
        let len = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
        const di = decodeSym(huffDist);
        let dist = DIST_BASE[di] + (DIST_EXTRA[di] ? bits(DIST_EXTRA[di]) : 0);
        if (dist > out.length) throw new Error('deflate: 距离越界');
        let from = out.length - dist;
        for (let k = 0; k < len; k++) out.push(out[from++]);
      }
    }
  }

  const FIXED_LIT = buildHuff((function () {
    const a = new Array(288);
    for (let i = 0; i < 288; i++) a[i] = i < 144 ? 8 : (i < 256 ? 9 : (i < 280 ? 7 : 8));
    return a;
  })());
  const FIXED_DIST = buildHuff(new Array(30).fill(5));

  let final = 0;
  do {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      alignByte();
      const len = rawByte() | (rawByte() << 8);
      rawByte(); rawByte(); // NLEN
      for (let i = 0; i < len; i++) out.push(rawByte());
    } else if (type === 1) {
      block(FIXED_LIT, FIXED_DIST);
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const clLens = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = bits(3);
      const clHuff = buildHuff(clLens);
      const lens = new Array(hlit + hdist).fill(0);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = decodeSym(clHuff);
        if (sym < 16) { lens[i++] = sym; }
        else if (sym === 16) { let prev = lens[i - 1]; let n = 3 + bits(2); while (n-- && i < lens.length) lens[i++] = prev; }
        else if (sym === 17) { let n = 3 + bits(3); while (n-- && i < lens.length) lens[i++] = 0; }
        else { let n = 11 + bits(7); while (n-- && i < lens.length) lens[i++] = 0; }
      }
      block(buildHuff(lens.slice(0, hlit)), buildHuff(lens.slice(hlit)));
    } else {
      throw new Error('deflate: 非法块类型');
    }
  } while (!final);

  return Uint8Array.from(out);
}

function inflateZlib(u8) {
  if (u8.length < 3) throw new Error('zlib: 数据过短');
  const cm = u8[0] & 0x0f;
  if (cm !== 8) throw new Error('zlib: 非法压缩方法 ' + cm);
  return inflateRaw(u8.subarray(2, u8.length - 4 >= 2 ? u8.length - 4 : u8.length));
}

/** ASCII85（Base85）解码，处理 'z' 缩写与 '~>' 结束符 */
function decodeAscii85(u8) {
  const out = [];
  let group = [];
  for (let i = 0; i < u8.length; i++) {
    const c = u8[i];
    if (c === 126 && i + 1 < u8.length && u8[i + 1] === 62) break; // ~>
    if (c === 122 && group.length === 0) { out.push(0, 0, 0, 0); continue; } // z = 4 个 0
    if (c < 33 || c > 117) continue; // 忽略空白等
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (let k = 0; k < 5; k++) v = v * 85 + group[k];
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84); // 补 'u'
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + group[k];
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    for (let k = 0; k < n - 1; k++) out.push(bytes[k]);
  }
  return Uint8Array.from(out);
}

/** ASCIIHex 解码，处理 '>' 结束符 */
function decodeAsciiHex(u8) {
  const out = [];
  let hex = '';
  for (let i = 0; i < u8.length; i++) {
    const c = u8[i];
    if (c === 62) break; // >
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)) hex += String.fromCharCode(c);
  }
  if (hex.length % 2) hex += '0';
  for (let h = 0; h < hex.length; h += 2) out.push(parseInt(hex.substr(h, 2), 16));
  return Uint8Array.from(out);
}

/* ==================== 字节/字符串工具 ==================== */

function toLatin1(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)));
  }
  return s;
}

/** UTF-16BE 字节数组 → JS 字符串（代理对自动合并） */
function utf16be(bytes) {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return s;
}

/** latin1 字节 → 字符串（PDFDocEncoding 近似） */
function latin1Str(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/* ==================== PDF 对象扫描 ==================== */

/**
 * 解析 PDF → { objects, decodedStream, latin1 }
 * objects: Map<objId, {dict, hasStream, streamOff, streamEnd, length, filter}>
 */
function scanPdf(u8) {
  const head = toLatin1(u8.subarray(0, 1024));
  if (head.indexOf('%PDF') !== 0) throw new Error('不是有效的 PDF 文件');
  const src = toLatin1(u8);

  const objects = {};
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const id = m[1];
    const bodyStart = m.index + m[0].length;
    const endIdx = src.indexOf('endobj', bodyStart);
    if (endIdx < 0) continue;
    const body = src.slice(bodyStart, endIdx);
    const obj = { dict: '', hasStream: false, length: -1, filter: null };

    const sIdx = body.indexOf('stream');
    const headPart = sIdx >= 0 ? body.slice(0, sIdx) : body;
    const dStart = headPart.indexOf('<<');
    if (dStart >= 0) obj.dict = headPart.slice(dStart);

    const dm = obj.dict.match(/\/Length\s+(\d+)(?:\s+\d+\s+R)?/);
    if (dm) obj.length = parseInt(dm[1], 10);
    // /Filter 可能是单个名称或数组（如 [/ASCII85Decode /FlateDecode]）
    obj.filters = [];
    const fa = obj.dict.match(/\/Filter\s*\[([^\]]*)\]/);
    if (fa) {
      const fre = /\/(\w+)/g;
      let fm2;
      while ((fm2 = fre.exec(fa[1])) !== null) obj.filters.push(fm2[1]);
    } else {
      const fm = obj.dict.match(/\/Filter\s*\/(\w+)/);
      if (fm) obj.filters.push(fm[1]);
    }
    obj.filter = obj.filters[0] || null;

    if (sIdx >= 0) {
      // 流数据：跳过 stream 关键字后的 EOL（stream\r\n / stream\n / stream ）
      let dataStart = sIdx + 6;
      if (body.charAt(dataStart) === '\r') dataStart++;
      if (body.charAt(dataStart) === '\n') dataStart++;
      let dataEnd;
      if (obj.length >= 0 && dataStart + obj.length <= body.length) {
        dataEnd = dataStart + obj.length;
      } else {
        dataEnd = body.lastIndexOf('endstream');
        if (dataEnd < 0) dataEnd = body.length;
      }
      obj.streamOff = bodyStart + dataStart;
      obj.streamEnd = bodyStart + dataEnd;
      obj.hasStream = true;
    }
    if (objects[id]) continue; // 同号重复对象取第一个
    objects[id] = obj;
  }

  function streamBytes(obj) {
    const start = obj.streamOff, end = Math.min(obj.streamEnd, src.length);
    if (end <= start) return new Uint8Array(0);
    return u8.subarray(start, end);
  }

  function decodedStream(obj) {
    let bytes = streamBytes(obj);
    for (let fi = 0; fi < obj.filters.length; fi++) {
      const f = obj.filters[fi];
      if (f === 'FlateDecode') {
        try { bytes = inflateZlib(bytes); } catch (e) {
          // 兜底：当 raw deflate 再试一次
          bytes = inflateRaw(bytes);
        }
      } else if (f === 'ASCII85Decode') {
        bytes = decodeAscii85(bytes);
      } else if (f === 'ASCIIHexDecode') {
        bytes = decodeAsciiHex(bytes);
      } else if (f !== 'DCTDecode' && f !== 'JPXDecode' && f !== 'CCITTFaxDecode') {
        throw new Error('不支持的流过滤器 ' + f);
      }
    }
    return bytes;
  }

  return { objects: objects, decodedStream: decodedStream, latin1: src };
}

/* ==================== ToUnicode CMap ==================== */

/** 解析 CMap 文本 → { map: {cid: string}, twoByte: bool } */
function parseCMap(text) {
  const map = {};
  let twoByte = false;

  // codespace 判断：存在 2 字节 codespace（hex ≥ 3 位）即按双字节解码
  const csr = text.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
  if (csr) {
    const hexPairs = csr[1].match(/<([0-9A-Fa-f]+)>/g) || [];
    for (let i = 0; i < hexPairs.length; i += 2) {
      const lo = hexPairs[i].replace(/[<>]/g, '');
      if (lo.length >= 3) twoByte = true;
    }
  }

  // CMap 目标值为 UTF-16BE：每 4 个 hex 位 = 一个码元（如 <7535> → 电）
  function hexToStr(h) {
    let s = '';
    const units = Math.floor(h.length / 4);
    for (let i = 0; i < units; i++) {
      s += String.fromCharCode(parseInt(h.substr(i * 4, 4), 16));
    }
    if (h.length % 4 === 2) { // 兼容 2 位长度的遗留写法
      s += String.fromCharCode(parseInt(h.substr(units * 4, 2), 16));
    }
    return s;
  }

  // bfchar: <src> <dst>
  const bfcharBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  bfcharBlocks.forEach(function (blk) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
    let m;
    while ((m = re.exec(blk)) !== null) {
      const src = parseInt(m[1], 16);
      if (m[1].length >= 3) twoByte = true;
      if (m[2].length === 0) { map[src] = ''; continue; }
      map[src] = hexToStr(m[2]);
    }
  });

  // bfrange: <lo> <hi> <dstStart>  |  <lo> <hi> [<d1> <d2> ...]
  const bfrangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  bfrangeBlocks.forEach(function (blk) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]*)>|\[[^\]]*\])/g;
    let m;
    while ((m = re.exec(blk)) !== null) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (m[1].length >= 3 || m[2].length >= 3) twoByte = true;
      if (hi < lo || hi - lo > 65535) continue;
      if (m[3].charAt(0) === '[') {
        const arr = m[3].match(/<([0-9A-Fa-f]*)>/g) || [];
        for (let c = lo; c <= hi && (c - lo) < arr.length; c++) {
          const hh = arr[c - lo].replace(/[<>]/g, '');
          map[c] = hh ? hexToStr(hh) : '';
        }
      } else {
        const startHex = m[4] || '';
        const pad = Math.max(4, Math.ceil(startHex.length / 4) * 4);
        const start = parseInt(startHex, 16) || 0;
        for (let c = lo; c <= hi; c++) {
          const v = start + (c - lo);
          map[c] = hexToStr(v.toString(16).padStart(pad, '0'));
        }
      }
    }
  });

  if (Object.keys(map).length && Object.keys(map).some(function (k) { return +k > 255; })) twoByte = true;
  return { map: map, twoByte: twoByte };
}

/* ==================== 资源字典解析 ==================== */

/** 从资源字典提取 name → objId 映射（/Font、/XObject） */
function parseNameRefs(resDict, kind, objects) {
  const refs = {};
  let region = resDict;
  const rm = resDict.match(new RegExp('\\/' + kind + '\\s+(\\d+)\\s+\\d+\\s+R'));
  if (rm && objects && objects[rm[1]]) {
    region = objects[rm[1]].dict; // /Font 12 0 R 间接引用
  } else {
    const ki = resDict.indexOf('/' + kind);
    if (ki < 0) return refs;
    const js = resDict.indexOf('>>', ki);
    region = resDict.slice(ki, js >= 0 ? js + 2 : resDict.length);
  }
  // 名称可含 +0 等 sonorant（/F2+0），按非分隔符匹配
  const re = /\/([^\s/[\]<>()]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(region)) !== null) refs[m[1]] = m[2];
  return refs;
}

function dictGet(dict, key) {
  const re = new RegExp('\\/' + key + '\\s+(\\d+)\\s+\\d+\\s+R');
  const m = dict.match(re);
  return m ? m[1] : null;
}

/* ==================== 文本片段提取 ==================== */

function decodeStringBytes(bytes, font) {
  if (!bytes.length) return '';
  // 预定义 CMap（如 UniGB-UCS2-H）：字符串字节本身就是 UCS2（UTF-16BE），
  // 直接解码，不做启发式 —— 数电票"购买方/销售方信息"栏的公司名用的就是这种字体，
  // 而"无"(U+65E0) 首字节 0x65 是合法 ASCII，会绕过下方的首字节门控被误判成 latin1。
  if (font && font.ucs2) return utf16be(bytes);
  if (font && font.cmap) {
    const map = font.cmap.map;
    if (font.cmap.twoByte) {
      let s = '';
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const cid = (bytes[i] << 8) | bytes[i + 1];
        s += (map[cid] !== undefined) ? map[cid] : String.fromCharCode(cid);
      }
      return s;
    }
    let s1 = '';
    for (let i = 0; i < bytes.length; i++) {
      s1 += (map[bytes[i]] !== undefined) ? map[bytes[i]] : String.fromCharCode(bytes[i]);
    }
    return s1;
  }
  // 无 ToUnicode：UTF-16BE 启发（CJK 常见），否则 latin1
  if (bytes.length % 2 === 0 && bytes.length >= 2 && (bytes[0] === 0 || bytes[0] >= 0x80)) {
    const s = utf16be(bytes);
    if (/^[\u0020-\u9fff\uff00-\uffef、，。：；（）《》]+$/.test(s)) return s;
  }
  return latin1Str(bytes);
}

/** 仿射矩阵乘法 A×B（点先经 B 再经 A 变换）[a b c d e f] */
function mulM(A, B) {
  return [
    A[0] * B[0] + A[1] * B[2],
    A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2],
    A[2] * B[1] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

/**
 * 处理一段内容流，把文本片段 push 进 env.out。
 * env: { fonts, fontRefs, xobjRefs, pdf, depth, out, ctm }
 * 片段形态 {text, x, y}；x/y 为设备空间近似坐标（经 CTM 变换）。
 * 图形状态：q/Q 入栈出栈，cm 级联；文本状态：BT、Tm、Td、T星、TL 级联，
 * 文本渲染矩阵 Trm = Tlm × CTM，取 e/f 作为片段坐标。
 */
function processContent(content, env) {
  const fonts = env.fonts, fontRefs = env.fontRefs;
  const ctm0 = env.ctm || [1, 0, 0, 1, 0, 0];
  const gsStack = [];      // q/Q 图形状态栈（CTM）
  let ctm = ctm0.slice();  // 当前变换矩阵
  let tlm = [1, 0, 0, 1, 0, 0]; // 文本行矩阵（BT 重置；Tm 设置；Td/T*/TL 相对）
  let leading = 0;
  let curFont = null;
  let fontSize = 0;
  const stack = [];
  let i = 0;
  const n = content.length;

  /** 估算文本设备宽度：CJK 全宽、ASCII 半宽（近似即可，用于列间距判断） */
  function estWidth(text, trm) {
    let w = 0;
    for (let k = 0; k < text.length; k++) {
      const code = text.charCodeAt(k);
      w += (code >= 0x2e80 || (code >= 0xff00 && code <= 0xffef)) ? 1.0 : 0.52;
    }
    const scale = Math.hypot(trm[0], trm[1]) || 1;
    return { w: w * (fontSize || 1) * scale, fs: (fontSize || 1) * scale };
  }

  function pushText(text) {
    if (!text) return;
    const trm = mulM(tlm, ctm);
    const est = estWidth(text, trm);
    env.out.push({ text: text, x: trm[4], y: trm[5], end: trm[4] + est.w, fs: est.fs });
  }

  function flushOp(op) {
    switch (op) {
      case 'q': gsStack.push(ctm.slice()); break;
      case 'Q': ctm = gsStack.length ? gsStack.pop() : ctm0.slice(); break;
      case 'cm': {
        const nums = stack.filter(function (t) { return t.type === 'num'; });
        if (nums.length >= 6) {
          const m = nums.slice(-6).map(function (t) { return t.value; });
          ctm = mulM(m, ctm);
        }
        break;
      }
      case 'BT': tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'Tf': {
        const nameTok = stack.find(function (t) { return t.type === 'name'; });
        curFont = nameTok ? (fontRefs[nameTok.value] || null) : null;
        const sizeTok = stack.filter(function (t) { return t.type === 'num'; }).pop();
        if (sizeTok) fontSize = sizeTok.value;
        break;
      }
      case 'Tm': {
        const nums = stack.filter(function (t) { return t.type === 'num'; });
        if (nums.length >= 6) tlm = nums.slice(-6).map(function (t) { return t.value; });
        break;
      }
      case 'Td': {
        const nums = stack.filter(function (t) { return t.type === 'num'; });
        if (nums.length >= 2) tlm = mulM([1, 0, 0, 1, nums[nums.length - 2].value, nums[nums.length - 1].value], tlm);
        break;
      }
      case 'TD': {
        const nums = stack.filter(function (t) { return t.type === 'num'; });
        if (nums.length >= 2) {
          leading = -nums[nums.length - 1].value;
          tlm = mulM([1, 0, 0, 1, nums[nums.length - 2].value, nums[nums.length - 1].value], tlm);
        }
        break;
      }
      case 'TL': {
        const nums = stack.filter(function (t) { return t.type === 'num'; });
        if (nums.length) leading = nums[nums.length - 1].value;
        break;
      }
      case 'T*': tlm = mulM([1, 0, 0, 1, 0, -leading], tlm); break;
      case 'Tj': {
        const st = stack.filter(function (t) { return t.type === 'str'; }).pop();
        if (st) pushText(decodeStringBytes(st.bytes, curFont ? fonts[curFont] : null));
        break;
      }
      case "'": {
        tlm = mulM([1, 0, 0, 1, 0, -leading], tlm);
        const st = stack.filter(function (t) { return t.type === 'str'; }).pop();
        if (st) pushText(decodeStringBytes(st.bytes, curFont ? fonts[curFont] : null));
        break;
      }
      case '"': {
        tlm = mulM([1, 0, 0, 1, 0, -leading], tlm);
        const st = stack.filter(function (t) { return t.type === 'str'; }).pop();
        if (st) pushText(decodeStringBytes(st.bytes, curFont ? fonts[curFont] : null));
        break;
      }
      case 'TJ': {
        const arr = stack.filter(function (t) { return t.type === 'arr'; }).pop();
        if (arr) {
          let joined = '';
          arr.value.forEach(function (el) {
            if (el.type === 'str') joined += decodeStringBytes(el.bytes, curFont ? fonts[curFont] : null);
          });
          pushText(joined);
        }
        break;
      }
      case 'Do': {
        // Form XObject：文字可能全部画在 Form 里（税局数电票常见），
        // Form 内容以执行 Do 时的 CTM 为基础坐标系
        if (env.depth < 4 && env.xobjRefs) {
          const nameTok = stack.find(function (t) { return t.type === 'name'; });
          const formId = nameTok ? env.xobjRefs[nameTok.value] : null;
          if (formId) {
            processFormXObject(formId, env, ctm.slice());
          }
        }
        break;
      }
    }
    stack.length = 0;
  }

  while (i < n) {
    const ch = content.charAt(i);
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\0') { i++; continue; }

    if (ch === '(') {
      // 字面量字符串（含嵌套与转义）
      const bytes = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const c = content.charAt(i);
        if (c === '\\') {
          const d = content.charAt(i + 1);
          if (d === 'n') { bytes.push(10); i += 2; }
          else if (d === 'r') { bytes.push(13); i += 2; }
          else if (d === 't') { bytes.push(9); i += 2; }
          else if (d === 'b') { bytes.push(8); i += 2; }
          else if (d === 'f') { bytes.push(12); i += 2; }
          else if (d >= '0' && d <= '7') {
            let oct = '';
            while (oct.length < 3 && /[0-7]/.test(content.charAt(i + 1))) { oct += content.charAt(++i); }
            bytes.push(parseInt(oct, 8) & 0xff);
            i++;
          }
          else if (d === '\n') { i += 2; } // 行续接
          else if (d === '\r') { i += (content.charAt(i + 2) === '\n' ? 3 : 2); }
          else { bytes.push(d.charCodeAt(0) & 0xff); i += 2; }
        } else if (c === '(') { depth++; bytes.push(40); i++; }
        else if (c === ')') {
          depth--;
          if (depth === 0) { i++; break; }
          bytes.push(41); i++;
        }
        else { bytes.push(content.charCodeAt(i) & 0xff); i++; }
      }
      stack.push({ type: 'str', bytes: bytes });
      continue;
    }

    if (ch === '<' && content.charAt(i + 1) !== '<') {
      let hex = '';
      i++;
      while (i < n && content.charAt(i) !== '>') {
        const c = content.charAt(i);
        if (/[0-9A-Fa-f]/.test(c)) hex += c;
        i++;
      }
      i++;
      if (hex.length % 2) hex += '0';
      const bytes = [];
      for (let h = 0; h < hex.length; h += 2) bytes.push(parseInt(hex.substr(h, 2), 16));
      stack.push({ type: 'str', bytes: bytes });
      continue;
    }

    if (ch === '[') {
      const arr = [];
      i++;
      let depth = 1;
      while (i < n && depth > 0) {
        const c = content.charAt(i);
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
        else if (c === '(') {
          const bytes = [];
          let d2 = 1;
          i++;
          while (i < n && d2 > 0) {
            const c2 = content.charAt(i);
            if (c2 === '\\') { bytes.push(content.charCodeAt(i + 1) & 0xff); i += 2; }
            else if (c2 === '(') { d2++; bytes.push(40); i++; }
            else if (c2 === ')') { d2--; if (d2 === 0) { i++; break; } bytes.push(41); i++; }
            else { bytes.push(content.charCodeAt(i) & 0xff); i++; }
          }
          arr.push({ type: 'str', bytes: bytes });
          continue;
        }
        else if (c === '<' && content.charAt(i + 1) !== '<') {
          let hex = '';
          i++;
          while (i < n && content.charAt(i) !== '>') {
            const c3 = content.charAt(i);
            if (/[0-9A-Fa-f]/.test(c3)) hex += c3;
            i++;
          }
          i++;
          if (hex.length % 2) hex += '0';
          const bytes = [];
          for (let h = 0; h < hex.length; h += 2) bytes.push(parseInt(hex.substr(h, 2), 16));
          arr.push({ type: 'str', bytes: bytes });
          continue;
        }
        else if (!/\s/.test(c)) {
          // 数组内的数字（kerning）
          let num = '';
          while (i < n && !/[\s\[\]<>()/]/.test(content.charAt(i))) { num += content.charAt(i); i++; }
          const v = parseFloat(num);
          if (!isNaN(v)) arr.push({ type: 'num', value: v });
          else if (!num) i++; // 无法识别的字符也要推进，避免死循环
          continue;
        }
        i++;
      }
      stack.push({ type: 'arr', value: arr });
      continue;
    }

    if (ch === '/') {
      let name = '';
      i++;
      while (i < n && !/[\s/[\]()<>{}]/.test(content.charAt(i))) { name += content.charAt(i); i++; }
      stack.push({ type: 'name', value: name });
      continue;
    }

    if (/[0-9.+-]/.test(ch)) {
      // 数字（含负号/小数；不支持科学计数法——PDF 内容流基本不用）
      let num = '';
      if (ch === '+' || ch === '-') { num = ch; i++; }
      let sawDigit = false;
      while (i < n && /[0-9.]/.test(content.charAt(i))) {
        if (/[0-9]/.test(content.charAt(i))) sawDigit = true;
        num += content.charAt(i);
        i++;
      }
      if (sawDigit) {
        const v = parseFloat(num);
        if (!isNaN(v)) stack.push({ type: 'num', value: v });
      } else if (num) {
        stack.push({ type: 'num', value: 0 }); // 孤立 +/-，占位推进
      }
      continue;
    }

    if (ch === '<') { // 内联字典（BDC 等）忽略
      i += 2;
      stack.length = 0;
      continue;
    }

    // 操作符
    let op = '';
    while (i < n && !/[\s/[\]()<>]/.test(content.charAt(i))) { op += content.charAt(i); i++; }
    if (op) flushOp(op);
    else i++; // 无法识别的字符（如孤立 > } 等）也要推进，避免死循环
  }
}

/** 递归处理 Form XObject（ctm 为执行 Do 时的变换矩阵） */
function processFormXObject(formId, env, ctm) {
  const fo = env.pdf.objects[formId];
  if (!fo || !fo.hasStream) return;
  if (!(/\/Subtype\s*\/Form/.test(fo.dict) || fo.dict.indexOf('/BBox') >= 0)) return; // 图像等跳过
  let resDict = fo.dict;
  const rr = dictGet(fo.dict, 'Resources');
  if (rr && env.pdf.objects[rr]) resDict = env.pdf.objects[rr].dict;
  const sub = {
    fonts: env.fonts,
    pdf: env.pdf,
    depth: env.depth + 1,
    out: env.out,
    ctm: ctm || [1, 0, 0, 1, 0, 0],
    fontRefs: parseNameRefs(resDict, 'Font', env.pdf.objects),
    xobjRefs: parseNameRefs(resDict, 'XObject', env.pdf.objects),
  };
  try {
    processContent(latin1Str(env.pdf.decodedStream(fo)), sub);
  } catch (e) { /* 跳过坏流 */ }
}

/* ==================== 行重建与主提取流程 ==================== */

/** 页面对象 → 文本片段（含 Form XObject 递归） */
function pageItems(pdf, pageId, fonts) {
  const o = pdf.objects[pageId];
  let resDict = o.dict;
  const resRef = dictGet(o.dict, 'Resources');
  if (resRef && pdf.objects[resRef]) resDict = pdf.objects[resRef].dict;
  else if (resDict.indexOf('/Font') < 0 && resDict.indexOf('/XObject') < 0) {
    // 尝试从父节点继承资源
    const parentRef = dictGet(o.dict, 'Parent');
    if (parentRef && pdf.objects[parentRef]) {
      const pd = pdf.objects[parentRef].dict;
      const pr = dictGet(pd, 'Resources');
      if (pr && pdf.objects[pr]) resDict = pdf.objects[pr].dict;
      else if (pd.indexOf('/Font') >= 0 || pd.indexOf('/XObject') >= 0) resDict = pd;
    }
  }
  const env = {
    fonts: fonts,
    pdf: pdf,
    depth: 0,
    out: [],
    fontRefs: parseNameRefs(resDict, 'Font', pdf.objects),
    xobjRefs: parseNameRefs(resDict, 'XObject', pdf.objects),
  };
  // 内容流（/Contents 单引用或数组）
  const contentIds = [];
  const cRef = dictGet(o.dict, 'Contents');
  if (cRef) contentIds.push(cRef);
  else {
    const cm = o.dict.match(/\/Contents\s*\[([\s\S]*?)\]/);
    if (cm) {
      const re = /(\d+)\s+\d+\s+R/g;
      let m2;
      while ((m2 = re.exec(cm[1])) !== null) contentIds.push(m2[1]);
    }
  }
  let content = '';
  for (let c = 0; c < contentIds.length; c++) {
    const co = pdf.objects[contentIds[c]];
    if (!co || !co.hasStream) continue;
    try { content += latin1Str(pdf.decodedStream(co)); } catch (e) { /* 跳过坏流 */ }
  }
  if (content) processContent(content, env);
  return env.out;
}

/**
 * 文本片段 → 视觉行：按 y 聚类（同行 y 差 ≤ 1.45），行内按 x 排序拼接。
 * 适应税局发票「先写全部标签、再写全部数值」的两段式内容流。
 */
function itemsToLines(items) {
  const its = items.filter(function (it) { return it.text && it.text.trim(); });
  if (!its.length) return [];
  its.forEach(function (it, idx) { it._idx = idx; });
  its.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x) || (a._idx - b._idx); });
  const lines = [];
  let cur = null;
  its.forEach(function (it) {
    if (!cur || Math.abs(it.y - cur.y0) > 1.45) {
      cur = { y0: it.y, items: [it] };
      lines.push(cur);
    } else {
      cur.items.push(it);
    }
  });
  return lines.map(function (L) {
    const sorted = L.items.sort(function (a, b) { return (a.x - b.x) || (a._idx - b._idx); });
    let out = '';
    let prevEnd = -Infinity, prevFs = 1;
    sorted.forEach(function (it) {
      if (prevEnd > -Infinity && it.x - prevEnd > Math.max(0.6, prevFs * 0.18)) out += ' '; // 列间距明显时补空格
      out += it.text;
      if (it.end > prevEnd) prevEnd = it.end;
      prevFs = it.fs;
    });
    return out;
  });
}

/**
 * 提取 PDF 文本（前 maxPages 页），返回按视觉行组织的文本。
 */
function extractText(u8, maxPages) {
  maxPages = maxPages || 3;
  const pdf = scanPdf(u8);
  const objects = pdf.objects;

  // ObjStm 展开：把压缩对象流中的对象补进 objects（仅 dict 文本）
  Object.keys(objects).forEach(function (id) {
    const o = objects[id];
    if (o.dict.indexOf('/ObjStm') < 0 || !o.hasStream) return;
    let text;
    try { text = latin1Str(pdf.decodedStream(o)); } catch (e) { return; }
    const nm = o.dict.match(/\/N\s+(\d+)/), fmi = o.dict.match(/\/First\s+(\d+)/);
    if (!nm || !fmi) return;
    const N = parseInt(nm[1], 10), First = parseInt(fmi[1], 10);
    const header = text.slice(0, First).trim().split(/\s+/);
    const bodyText = text.slice(First);
    for (let k = 0; k < N && k * 2 + 1 < header.length; k++) {
      const innerId = header[k * 2];
      const off = parseInt(header[k * 2 + 1], 10);
      if (objects[innerId]) continue;
      const endI = bodyText.indexOf('endobj', off);
      const seg = bodyText.slice(off, endI > 0 ? endI : bodyText.length);
      const ds = seg.indexOf('<<');
      objects[innerId] = { dict: ds >= 0 ? seg.slice(ds) : '', hasStream: false };
    }
  });

  // 字体解码映射：ToUnicode CMap 优先；无 ToUnicode 但 Encoding 为
  // 预定义 UCS2 CMap（UniGB-UCS2-H 等）时标记 ucs2（字节即 UTF-16BE）。
  // 数电票购买方/销售方栏的 STSong-Light 字体正是这种情况，缺失此分支
  // 会导致公司名乱码（如 "无锡..." → "eà!RpÁ¾..."）。
  const fonts = {};
  Object.keys(objects).forEach(function (id) {
    const o = objects[id];
    if (o.dict.indexOf('/Font') < 0) return;
    const tu = dictGet(o.dict, 'ToUnicode');
    if (tu && objects[tu] && objects[tu].hasStream) {
      try {
        fonts[id] = { cmap: parseCMap(latin1Str(pdf.decodedStream(objects[tu]))) };
      } catch (e) { fonts[id] = null; }
      return;
    }
    // /Encoding 既可能是间接引用（dictGet 处理），也可能是内联名字
    // （/Encoding/UniGB-UCS2-H），须直接正则取名字值。
    const em = o.dict.match(/\/Encoding\s*\/([A-Za-z0-9+\-]+)/);
    if (em && /-UCS2-H$/.test(em[1])) fonts[id] = { ucs2: true };
  });

  // 页面收集（排除 /Pages 节点；须含 /Contents）
  const pageIds = [];
  Object.keys(objects).forEach(function (id) {
    const o = objects[id];
    if (o.hasStream) return;
    if (o.dict.indexOf('/Pages') >= 0) return;
    if (/\/Type\s*\/Page\b/.test(o.dict) && o.dict.indexOf('/Contents') >= 0) {
      if (pageIds.indexOf(id) < 0) pageIds.push(id);
    }
  });

  const parts = [];
  let done = 0;
  for (let p = 0; p < pageIds.length && done < maxPages; p++) {
    const items = pageItems(pdf, pageIds[p], fonts);
    if (!items.length) continue;
    const lines = itemsToLines(items);
    if (!lines.length) continue;
    parts.push(lines.join('\n'));
    done++;
  }
  return parts.join('\n');
}

/* ==================== 发票字段解析（与电脑端 pdf-parse.js 一致） ==================== */

var NOISE_PATTERNS = [
  '发票监制章', '全国统一发票监制章', '国家税务总局', '增值税电子普通发票',
  '电子发票（普通发票）', '电子发票（增值税专用发票）', '增值税专用发票',
  '增值税普通发票', '发票联', '抵扣联', '记账联', '第一联', '第二联', '第三联',
  '无效发票', '作废',
];

function extractInvoiceNo(text) {
  var m = text.match(/发\s*票\s*号\s*码[:：\s]*([0-9]{8,20})/);
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
  // 兜底：标签与数值分处相邻两行的两段式内容流
  m = text.match(/开\s*票\s*日\s*期[:：\s]*\n(\d{4})\s*\n年\s*\n(\d{1,2})\s*\n月\s*\n(\d{1,2})\s*\n日/);
  if (m) return m[1] + '-' + String(parseInt(m[2])).padStart(2, '0') + '-' + String(parseInt(m[3])).padStart(2, '0');
  // 兜底2（数电票新版式）：标签行与日期行之间隔着监制章等噪声行，
  // 从标签行向后扫描几行找第一个完整日期。
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    if (!/开\s*票\s*日\s*期/.test(lines[i])) continue;
    for (var j = i; j <= i + 5 && j < lines.length; j++) {
      var dm = lines[j].match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (dm) return dm[1] + '-' + String(parseInt(dm[2])).padStart(2, '0') + '-' + String(parseInt(dm[3])).padStart(2, '0');
    }
    break;
  }
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

var PARTY_SUFFIX = /(公司|中心|厂|店|部|社|行|馆|院|所|城|商行|商行|企业|集团|合作社|事务所|超市|宾馆|酒店|饭店|药房|药店|诊所|门诊)$/;
var PARTY_RUN = new RegExp('([\\u4e00-\\u9fff\\u3400-\\u4dbf（）《》""·、A-Za-z0-9]{4,})', 'g');

/** 从一行里抽出像公司名的长 CJK 串（过滤栏目词与监制章噪声） */
function companyRuns(line) {
  var runs = [];
  var m;
  PARTY_RUN.lastIndex = 0;
  while ((m = PARTY_RUN.exec(line)) !== null) {
    var s = (m[1] || '').replace(/^[0-9A-Za-z\s]+/, '').trim();
    if (s.length < 4) continue;
    if (!PARTY_SUFFIX.test(s)) continue;
    if (/税务|监制|发票|国家|识别号|信用代码|名称|购买|销售|统一社会/.test(s)) continue;
    if (runs.indexOf(s) < 0) runs.push(s);
  }
  return runs;
}

function extractParties(text) {
  // 数电票两栏同行版式（同一行内先购买方后销售方）
  var m = text.match(/[购买]\s*名\s*称\s*[:：]\s*(.+?)\s*[销售]\s*名\s*称\s*[:：]\s*([^\n]+)/);
  if (m) {
    var buyer0 = cleanPartyName(m[1].split(/统一社会信用代码|纳税人识别号/)[0]);
    var seller0 = cleanPartyName(m[2].split(/统一社会信用代码|纳税人识别号/)[0]);
    return { buyer: buyer0, seller: seller0 };
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
  if (buyer && seller) return { buyer: buyer, seller: seller };
  // 兜底（数电票新版式）："购买方信息/销售方信息"两栏并排，公司名独占一行、
  // 左右两栏被"息"分隔（如 "息 无锡XX有限公司 息 宜兴XX有限公司"），
  // 下一行才是 名称： 与纳税人识别号。从识别号行向上找含两个公司名串的行，
  // 阅读顺序即 购买方、销售方（与识别号左右顺序一致）。
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var ids = lines[i].match(/(9[0-9A-Z]{17}|[0-9A-Z]{18})/g);
    if (!ids || ids.length < 2 || !/识别号|信用代码/.test(lines[i])) continue;
    for (var j = i - 1; j >= Math.max(0, i - 6); j--) {
      var runs = companyRuns(lines[j]);
      if (runs.length >= 2) return { buyer: runs[0], seller: runs[1] };
    }
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
  // 数电票明细行金额与税率粘连（如 "12347.6113% 45.19"）：
  // 从百分号前的数字串里取"合法税率后缀"（13/9/6/5/3/1/0/1.5...）。
  var re2 = /([0-9])((?:1[0-3]|9|6|5|3|1|0)(?:\.\d+)?%)(?=[\s）)*/¥￥]|$)/g;
  while ((m = re2.exec(text)) !== null) rates.push(m[2]);
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

  var lines = text.split(/\r?\n/);

  // 兜底1（数电票新版式）：合计标签与金额分行 —— 金额行 "¥58819.47 ¥7646.53"
  // 在上、合计标签行在下（或相隔一行）。找含两个 ¥ 金额的行，且相邻 1~2 行内
  // 出现"合计"（非"价税合计"）即认定。
  if (amount === null || tax === null) {
    for (var i = 0; i < lines.length; i++) {
      var mm = lines[i].match(/[¥￥]\s*([0-9,]+\.\d{2})[^¥￥\d]*[¥￥]\s*([0-9,]+\.\d{2})/);
      if (!mm) continue;
      var ctx = '';
      for (var k = Math.max(0, i - 2); k <= Math.min(lines.length - 1, i + 2); k++) ctx += lines[k];
      if (/合\s*计/.test(ctx) && !/价\s*税\s*合\s*计/.test(lines[i])) {
        amount = amount || mm[1];
        tax = tax || mm[2];
        break;
      }
    }
  }

  // 兜底2：明细行 "*类目*品名 单位 数量 单价 金额 税率% 税额"，
  // 税率前的数字是金额、税率后的是税额（多明细行取合计意义不大，仅在无合计时用首行）。
  if (amount === null || tax === null) {
    for (var i2 = 0; i2 < lines.length; i2++) {
      var im = lines[i2].match(/\*[^*\n]+\*.*?([0-9.,]+)\s+((?:1[0-3]|9|6|5|3|1|0)(?:\.\d+)?)%\s+([0-9.,]+)/);
      if (im) {
        amount = amount || im[1].replace(/,/g, '');
        tax = tax || im[3].replace(/,/g, '');
        break;
      }
    }
  }

  // 兜底3（数电票新版式）："价税合计（大写）（小写）"标签行与金额分离，
  // 大写金额行在几行之后（中间隔备注/开票人栏），形如 "…圆整 ¥ 66466.00"。
  if (total === null) {
    for (var i3 = 0; i3 < lines.length; i3++) {
      if (!/价\s*税\s*合\s*计/.test(lines[i3])) continue;
      for (var k3 = i3; k3 <= i3 + 6 && k3 < lines.length; k3++) {
        var tm = lines[k3].match(/[¥￥]\s*([0-9,]+\.\d{2})/);
        if (tm) { total = tm[1]; break; }
      }
      break;
    }
  }
  return { amount: amount, tax: tax, total: total };
}

var NUM_TOKEN = /^[\d.,%¥￥+\-—:：/（）()()\[\]]+$/;
var UNIT_TOKENS = { '吨': 1, '个': 1, '件': 1, '台': 1, '张': 1, '次': 1, '米': 1, '千克': 1, '公斤': 1, '克': 1, '升': 1, '箱': 1, '盒': 1, '瓶': 1, '桶': 1, '卷': 1, '包': 1, '套': 1, '只': 1, '根': 1, '块': 1, '批': 1, 'kg': 1, 'L': 1, 'm': 1 };

function extractItems(text) {
  var lines = text.split(/\r?\n/);
  var items = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/\*([^*\n]+)\*(.*)/);
    if (!m) continue;
    var cat = m[1].trim(), rest = m[2].trim();
    var toks = rest.split(/\s+/).filter(function (t) {
      return !NUM_TOKEN.test(t) && !UNIT_TOKENS[t];
    });
    var name = toks.join(' ');
    var nxt = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    if (nxt && nxt.indexOf('*') !== 0 &&
        !/^(合\s*计|价税|备\s*注|开票人|项目名称|规格型号|销|购|购\s*名|销\s*名)/.test(nxt) &&
        /[\u4e00-\u9fa5A-Za-z]/.test(nxt) &&
        !/[¥￥]|\d{2,}%|\*\S+\*/.test(nxt)) {
      name = (name ? name + ' ' + nxt : nxt).trim();
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

/**
 * 解析发票 PDF → 字段对象。
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns Promise<{invoice_no, invoice_code, invoice_type, invoice_date, buyer_name, seller_name, item_name, amount, tax_amount, total_amount, tax_rate, all_tax_rates, check_code}>
 */
function parseInvoicePdf(buf) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () { // 让出 UI 线程，大 PDF 解析不卡转圈动画
      try {
        var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        var text = extractText(u8, 3);
        if (!text || text.trim().length < 20) {
          reject(new Error('无法从 PDF 中提取文本，可能是扫描件/图片型发票，请改用手工录入。'));
          return;
        }
        var invoiceNo = extractInvoiceNo(text);
        if (!invoiceNo) {
          reject(new Error('未找到发票号码，请确认这是否为增值税/普通发票 PDF，或改用手工录入。'));
          return;
        }
        var amounts = extractAmounts(text);
        var rates = extractTaxRates(text);
        var items = extractItems(text);
        var parties = extractParties(text);
        resolve({
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
        });
      } catch (e) {
        reject(e);
      }
    }, 30);
  });
}

module.exports = {
  parseInvoicePdf: parseInvoicePdf,
  extractText: extractText,
  inflate: inflateZlib,
  // 测试/诊断用内部接口（生产代码勿用）
  _internals: { scanPdf: scanPdf, parseCMap: parseCMap, processContent: processContent, parseNameRefs: parseNameRefs },
};
