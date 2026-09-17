/**
 * qrcode-matrix.js — 纯 JS 二维码矩阵生成（无 DOM 依赖）
 * 基于 QR Code Model 2 标准，适配微信小程序环境。
 * 输出 boolean[][] 矩阵供 Canvas 绘制。
 * 不使用 Array.prototype.fill（部分小程序引擎不支持）
 */

// --- 辅助：创建并填充数组（替代 Array.prototype.fill）---
function filledArray(len, val) {
  var arr = new Array(len);
  for (var i = 0; i < len; i++) arr[i] = val;
  return arr;
}

// --- Galois Field 256 操作（Reed-Solomon 纠错用）---
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

// --- RS 纠错码生成 ---
function rsGenPoly(ecLen) {
  var poly = [1];
  for (var i = 0; i < ecLen; i++) {
    var newPoly = new Array(poly.length + 1);
    for (var j = 0; j < newPoly.length; j++) newPoly[j] = 0;
    for (var j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j];
      newPoly[j + 1] ^= gfMul(poly[j], EXP_TABLE[i]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsEncode(data, ecLen) {
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

// --- QR 码版本与容量表 ---
// [版本, 数据容量(字节-L级), 纠错码字数(L级), 总数据码字数(含纠错)]
var VERSION_TABLE = [
  [1, 19, 7, 26], [2, 34, 10, 44], [3, 55, 15, 70], [4, 84, 20, 100],
  [5, 119, 26, 134], [6, 154, 36, 172], [7, 202, 40, 196], [8, 235, 48, 242],
  [9, 275, 60, 292], [10, 332, 72, 346]
];

function chooseVersion(byteLen) {
  for (var i = 0; i < VERSION_TABLE.length; i++) {
    if (VERSION_TABLE[i][1] >= byteLen) return VERSION_TABLE[i];
  }
  return VERSION_TABLE[VERSION_TABLE.length - 1];
}

// --- 位流编码 ---
function encodeData(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 0x3F)); }
    else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3F)); bytes.push(0x80 | (c & 0x3F)); }
  }
  return bytes;
}

function buildBitStream(bytes, version) {
  var bits = [];
  function pushBits(val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  }
  // 模式指示符: byte = 0100
  pushBits(0x4, 4);
  // 字符数指示符（版本1-9用8位，10+用16位）
  var lenBits = version[0] <= 9 ? 8 : 16;
  pushBits(bytes.length, lenBits);
  // 数据
  for (var i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
  // 终止符
  var totalBits = version[1] * 8; // 数据容量（字节）× 8 = 总数据位数
  var remaining = totalBits - bits.length;
  if (remaining >= 4) pushBits(0, 4);
  else { for (var i = 0; i < remaining; i++) bits.push(0); }
  // 对齐到字节边界
  while (bits.length % 8 !== 0) bits.push(0);
  // 填充字节
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
    for (var j = 0; j < 8 && i + j < bits.length; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return bytes;
}

// --- 对齐图案位置（QR Code Model 2 标准中心坐标）---
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
  if (v === 10) return [6, 28, 50];
  return [6, 28, 50];
}

// --- BCH 编码（格式信息）---
function bchEncode(data) {
  var g = 0x537;
  var d = data << 10;
  for (var i = 4; i >= 0; i--) {
    if ((d >> (i + 10)) & 1) d ^= g << i;
  }
  return d & 0x3FF;
}

// --- 矩阵构建 ---
function buildMatrix(version, dataBytes) {
  var v = version[0];
  var size = 17 + v * 4;
  var matrix = [];
  var reserved = [];
  for (var i = 0; i < size; i++) {
    matrix.push(filledArray(size, null));
    reserved.push(filledArray(size, false));
  }

  // 1. 放置定位图案 (Finder Pattern)
  function placeFinder(r, c) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var val = null;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          if (dr === 0 || dr === 6 || dc === 0 || dc === 6) val = true;
          else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) val = true;
          else val = false;
        } else if ((dr === 7 && dc >= 0 && dc <= 6) || (dc === 7 && dr >= 0 && dr <= 6)) {
          val = false;
        }
        if (val !== null) {
          matrix[rr][cc] = val;
          reserved[rr][cc] = true;
        }
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. 对齐图案 (Alignment Pattern)
  var alignPos = getAlignmentPositions(v);
  for (var i = 0; i < alignPos.length; i++) {
    for (var j = 0; j < alignPos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === alignPos.length - 1) || (i === alignPos.length - 1 && j === 0)) continue;
      var ar = alignPos[i], ac = alignPos[j];
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          var val = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
          matrix[ar + dr][ac + dc] = val;
          reserved[ar + dr][ac + dc] = true;
        }
      }
    }
  }

  // 3. 时序图案
  for (var i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { matrix[6][i] = i % 2 === 0; reserved[6][i] = true; }
    if (!reserved[i][6]) { matrix[i][6] = i % 2 === 0; reserved[i][6] = true; }
  }

  // 4. 格式信息区域（预留）
  for (var i = 0; i < 9; i++) {
    if (i < size && !reserved[8][i]) reserved[8][i] = true;
    if (i < size && !reserved[i][8]) reserved[i][8] = true;
  }
  for (var i = 0; i < 8; i++) {
    var r = size - 1 - i;
    if (!reserved[r][8]) reserved[r][8] = true;
    if (!reserved[8][size - 1 - i]) reserved[8][size - 1 - i] = true;
  }

  // 5. 黑块
  matrix[size - 8][8] = true;
  reserved[size - 8][8] = true;

  // 6. 放置数据（之字形）
  var bitIdx = 0;
  var upward = true;
  for (var col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (var i = 0; i < size; i++) {
      var row = upward ? size - 1 - i : i;
      for (var dc = 0; dc < 2; dc++) {
        var c = col - dc;
        if (!reserved[row][c]) {
          var bit = false;
          if (bitIdx < dataBytes.length * 8) {
            bit = ((dataBytes[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
          }
          matrix[row][c] = bit;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // 7. 应用掩码（掩码0 = (row+col)%2==0）
  for (var r = 0; r < size; r++) {
    for (var c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if ((r + c) % 2 === 0) matrix[r][c] = !matrix[r][c];
    }
  }

  // 8. 格式信息（L级，掩码0）
  var formatBits = 0x01 << 3 | 0x00; // L=01, mask=000
  var formatCode = bchEncode(formatBits);
  var fullFormat = (formatBits << 10) | formatCode;
  var formatBits15 = [];
  for (var i = 14; i >= 0; i--) formatBits15.push((fullFormat >> i) & 1);

  for (var i = 0; i < 6; i++) matrix[8][i] = formatBits15[i] === 1;
  matrix[8][7] = formatBits15[6] === 1;
  matrix[8][8] = formatBits15[7] === 1;
  matrix[7][8] = formatBits15[8] === 1;
  for (var i = 9; i < 15; i++) matrix[14 - i][8] = formatBits15[i] === 1;

  for (var i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits15[14 - i] === 1;
  for (var i = 0; i < 7; i++) matrix[8][size - 7 + i] = formatBits15[i] === 1;

  return matrix;
}

/**
 * 生成二维码矩阵
 * @param {string} text - 编码文本
 * @returns {boolean[][]} 二维布尔矩阵，true=黑
 */
function generateQRMatrix(text) {
  var bytes = encodeData(text);
  var version = chooseVersion(bytes.length);
  var bits = buildBitStream(bytes, version);
  var dataBytes = bitsToBytes(bits);
  var ecWords = version[2];
  var dataWithEC = dataBytes.concat(rsEncode(dataBytes, ecWords));
  return buildMatrix(version, dataWithEC);
}

module.exports = {
  generateQRMatrix: generateQRMatrix
};
