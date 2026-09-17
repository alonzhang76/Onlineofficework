/**
 * qrcode-matrix.js — 纯 JS 二维码矩阵生成（无 DOM 依赖）
 * QR Code Model 2，字节模式（UTF-8），纠错级 L，固定掩码 0。
 * 支持版本 1–10（数据容量 17–271 字节），输出 boolean[][] 供 Canvas 绘制。
 * 不使用 Array.prototype.fill（部分小程序引擎不支持）。
 */

// --- 辅助：创建并填充数组（替代 Array.prototype.fill）---
function filledArray(len, val) {
  var arr = new Array(len);
  for (var i = 0; i < len; i++) arr[i] = val;
  return arr;
}

// --- Galois Field 256（Reed-Solomon 用，本原多项式 0x11D）---
var EXP_TABLE = new Array(256);
var LOG_TABLE = new Array(256);
(function initGF() {
  var x = 1;
  for (var i = 0; i < 256; i++) {
    EXP_TABLE[i] = x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (var i = 0; i < 255; i++) {
    LOG_TABLE[EXP_TABLE[i]] = i;
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

// --- RS 纠错码（单块，ecLen 个纠错码字）---
function rsGenPoly(ecLen) {
  var poly = [1];
  for (var i = 0; i < ecLen; i++) {
    var newPoly = filledArray(poly.length + 1, 0);
    for (var j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j];
      newPoly[j + 1] ^= gfMul(poly[j], EXP_TABLE[i]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsEncodeBlock(data, ecLen) {
  var gen = rsGenPoly(ecLen);
  var result = data.concat(filledArray(ecLen, 0));
  for (var i = 0; i < data.length; i++) {
    var coef = result[i];
    if (coef === 0) continue;
    for (var j = 0; j < gen.length; j++) {
      result[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return result.slice(data.length);
}

// --- 版本表（纠错级 L）---
// 每项: [版本号, 数据码字数, 总码字数, 每块纠错码字数, 各数据块大小...]
var VERSION_TABLE = [
  [1, 19, 26, 7, 19],
  [2, 34, 44, 10, 34],
  [3, 55, 70, 15, 55],
  [4, 80, 100, 20, 80],
  [5, 108, 134, 26, 108],
  [6, 136, 172, 18, 68, 68],
  [7, 156, 196, 20, 78, 78],
  [8, 194, 242, 24, 97, 97],
  [9, 232, 292, 30, 116, 116],
  [10, 274, 346, 18, 68, 68, 69, 69]
];

function chooseVersion(byteLen) {
  for (var i = 0; i < VERSION_TABLE.length; i++) {
    if (VERSION_TABLE[i][1] * 8 - (VERSION_TABLE[i][0] <= 9 ? 12 : 20) >= byteLen * 8) {
      return VERSION_TABLE[i];
    }
  }
  throw new Error('内容过长，超出二维码容量（271 字节）');
}

// --- UTF-8 编码（正确处理代理对/4字节字符）---
function encodeData(text) {
  var bytes = [];
  var i = 0;
  while (i < text.length) {
    var c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
      var c2 = text.charCodeAt(i + 1);
      if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        bytes.push(0xF0 | (cp >> 18));
        bytes.push(0x80 | ((cp >> 12) & 0x3F));
        bytes.push(0x80 | ((cp >> 6) & 0x3F));
        bytes.push(0x80 | (cp & 0x3F));
        i += 2;
        continue;
      }
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 0x3F)); }
    else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3F)); bytes.push(0x80 | (c & 0x3F)); }
    i++;
  }
  return bytes;
}

// --- 数据位流：模式指示 + 字符数 + 数据 + 终止符 + 填充 ---
function buildBitStream(bytes, version) {
  var bits = [];
  function pushBits(val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  }
  pushBits(0x4, 4); // 字节模式 = 0100
  pushBits(bytes.length, version[0] <= 9 ? 8 : 16);
  for (var i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);

  var totalBits = version[1] * 8;
  var remaining = totalBits - bits.length;
  if (remaining >= 4) pushBits(0, 4);
  else for (var k = 0; k < remaining; k++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  var padBytes = [0xEC, 0x11];
  var pi = 0;
  while (bits.length < totalBits) {
    pushBits(padBytes[pi % 2], 8);
    pi++;
  }
  return bits;
}

function bitsToBytes(bits) {
  var bytes = [];
  for (var i = 0; i < bits.length; i += 8) {
    var b = 0;
    for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return bytes;
}

// --- 分块 RS 编码 + 交叉排列（ISO 18004 交错规则）---
function interleave(dataBytes, version) {
  var ecLen = version[3];
  var blockSizes = version.slice(4);
  var blocks = [];
  var offset = 0;
  for (var b = 0; b < blockSizes.length; b++) {
    var blockData = dataBytes.slice(offset, offset + blockSizes[b]);
    offset += blockSizes[b];
    blocks.push({ data: blockData, ec: rsEncodeBlock(blockData, ecLen) });
  }

  var result = [];
  var maxDataLen = 0;
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].data.length > maxDataLen) maxDataLen = blocks[i].data.length;
  }
  // 数据码字按列交错（较长块多出的码字在前）
  for (var i = 0; i < maxDataLen; i++) {
    for (var b = 0; b < blocks.length; b++) {
      if (i < blocks[b].data.length) result.push(blocks[b].data[i]);
    }
  }
  // 纠错码字按列交错
  for (var i = 0; i < ecLen; i++) {
    for (var b = 0; b < blocks.length; b++) {
      result.push(blocks[b].ec[i]);
    }
  }
  return result;
}

// --- 对齐图案中心坐标（Model 2 标准）---
function getAlignmentPositions(v) {
  if (v === 1) return [];
  if (v === 2) return [6, 18];
  if (v === 3) return [6, 22];
  if (v === 4) return [6, 26];
  if (v === 5) return [6, 30];
  if (v === 6) return [6, 34];
  if (v === 7) return [6, 22, 38];
  if (v === 8) return [6, 24, 42];
  if (v === 9) return [6, 26, 46];
  return [6, 28, 50]; // v10
}

// --- BCH 通用编码（格式信息 15,5；版本信息 18,6）---
function bchDivide(value, gen, dataBits) {
  var d = value;
  for (var i = dataBits - 1; i >= 0; i--) {
    if ((d >> (i + genDegree(gen))) & 1) d ^= gen << i;
  }
  return d;
}
function genDegree(gen) {
  var deg = 0, g = gen;
  while (g > 1) { deg++; g >>= 1; }
  return deg;
}

function buildFormatBits() {
  // L 级 = 01，掩码 0 = 000 → 5 位数据 01000
  var data = 0x08;
  var rem = bchDivide(data << 10, 0x537, 5);
  // 标准要求与掩码 101010000010010 异或
  return ((data << 10) | rem) ^ 0x5412;
}

function buildVersionBits(v) {
  var rem = bchDivide(v << 12, 0x1F25, 6);
  return (v << 12) | rem;
}

// --- 矩阵构建 ---
function buildMatrix(version, codewords) {
  var v = version[0];
  var size = 17 + v * 4;
  var matrix = [];
  var reserved = [];
  for (var i = 0; i < size; i++) {
    matrix.push(filledArray(size, false));
    reserved.push(filledArray(size, false));
  }

  function setModule(r, c, val, isFunc) {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    matrix[r][c] = val;
    if (isFunc) reserved[r][c] = true;
  }

  // 1. 定位图案 + 完整 1 模块留白分隔区
  function placeFinder(pr, pc) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var rr = pr + dr, cc = pc + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var val = false;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          val = (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        }
        setModule(rr, cc, val, true);
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. 对齐图案（先于时序图案放置；位于时序行/列 6 上的内部对齐点
  //    同样要画 5×5，其与时序重合的格子取值天然一致；
  //    中心已被定位符占用（含分隔区）的组合跳过）
  var alignPos = getAlignmentPositions(v);
  for (var ai = 0; ai < alignPos.length; ai++) {
    for (var aj = 0; aj < alignPos.length; aj++) {
      var ar = alignPos[ai], ac = alignPos[aj];
      if (reserved[ar][ac]) continue;
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          var val = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
          setModule(ar + dr, ac + dc, val, true);
        }
      }
    }
  }

  // 3. 时序图案（只填空白格；对齐图案已占用的重合格跳过）
  for (var i = 8; i < size - 8; i++) {
    var timingDark = (i % 2 === 0);
    if (!reserved[6][i]) setModule(6, i, timingDark, true);
    if (!reserved[i][6]) setModule(i, 6, timingDark, true);
  }

  // 4. 格式信息区域预留（两份，共 15+15 格；恒黑模块单独处理）
  for (var i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (var i = 0; i < 8; i++) {
    reserved[size - 1 - i][8] = true;
    reserved[8][size - 1 - i] = true;
  }

  // 5. 恒黑模块
  setModule(size - 8, 8, true, true);

  // 6. 版本信息（v7+，两份 6×3）
  if (v >= 7) {
    var vbits = buildVersionBits(v);
    for (var i = 0; i < 6; i++) {
      for (var j = 0; j < 3; j++) {
        var bit = ((vbits >> (i * 3 + j)) & 1) === 1;
        setModule(i, size - 11 + j, bit, true);        // 右上
        setModule(size - 11 + j, i, bit, true);        // 左下
      }
    }
  }

  // 7. 数据之字形填充（剩余空白模块自动补 0，即余数位）
  var bitIdx = 0;
  var totalDataBits = codewords.length * 8;
  var upward = true;
  for (var col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (var step = 0; step < size; step++) {
      var row = upward ? size - 1 - step : step;
      for (var dc = 0; dc < 2; dc++) {
        var c = col - dc;
        if (!reserved[row][c]) {
          var bit = false;
          if (bitIdx < totalDataBits) {
            bit = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
          }
          matrix[row][c] = bit;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // 8. 应用掩码 0：(row + col) % 2 == 0 翻转（仅数据区）
  for (var r = 0; r < size; r++) {
    for (var c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if ((r + c) % 2 === 0) matrix[r][c] = !matrix[r][c];
    }
  }

  // 9. 写入格式信息（掩码之后；bit 0 = LSB，位置映射按 ISO 18004）
  var format = buildFormatBits();
  function fmtBit(i) { return ((format >> i) & 1) === 1; }
  // 竖直条（列 8）：行0..5 = bit0..5，行7 = bit6，行8 = bit7，
  // 行 size-7..size-1 = bit8..14
  for (var i = 0; i < 15; i++) {
    if (i < 6) matrix[i][8] = fmtBit(i);
    else if (i < 8) matrix[i + 1][8] = fmtBit(i);
    else matrix[size - 15 + i][8] = fmtBit(i);
  }
  // 水平条（行 8）：列 size-1..size-8 = bit0..7，列7 = bit8，列5..0 = bit9..14
  for (var i = 0; i < 15; i++) {
    if (i < 8) matrix[8][size - 1 - i] = fmtBit(i);
    else if (i < 9) matrix[8][7] = fmtBit(i);
    else matrix[8][15 - i - 1] = fmtBit(i);
  }

  return matrix;
}

/**
 * 生成二维码矩阵
 * @param {string} text - 编码文本（≤271 字节 UTF-8）
 * @returns {boolean[][]} 二维布尔矩阵，true=黑
 */
function generateQRMatrix(text) {
  var bytes = encodeData(text);
  var version = chooseVersion(bytes.length);
  var bits = buildBitStream(bytes, version);
  var dataBytes = bitsToBytes(bits);
  var codewords = interleave(dataBytes, version);
  if (codewords.length !== version[2]) {
    throw new Error('QR 码字数校验失败: ' + codewords.length + ' != ' + version[2]);
  }
  return buildMatrix(version, codewords);
}

module.exports = {
  generateQRMatrix: generateQRMatrix
};
