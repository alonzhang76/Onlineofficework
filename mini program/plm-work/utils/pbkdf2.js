/**
 * 纯 JS SHA-256 + HMAC-SHA256 + PBKDF2 实现
 * 用于小程序端校验电脑端 werkzeug pbkdf2:sha256 格式的密码哈希。
 *
 * 性能：260000 次迭代在真机约 1~3 秒（仅登录时调用一次）。
 */

// SHA-256 常量
var K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

var H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

/** 处理一个 64 字节块（传入 16 个 32 位大端整数） */
function sha256Block(w, h) {
  var i;
  for (i = 16; i < 64; i++) {
    var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (i = 0; i < 64; i++) {
    var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    var ch = (e & f) ^ (~e & g);
    var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
    var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    var mj = (a & b) ^ (a & c) ^ (b & c);
    var t2 = (S0 + mj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/** SHA-256(data: Uint8Array) → Uint8Array(32) */
function sha256(data) {
  var h = new Uint32Array(H0);
  var len = data.length;
  var bitLen = len * 8;
  // 填充：0x80 + 0x00... + 8 字节大端长度
  var padLen = ((len + 9 + 63) >> 6) << 6; // 对齐到 64 字节
  if (padLen === 0) padLen = 64;
  var buf = new Uint8Array(padLen);
  buf.set(data);
  buf[len] = 0x80;
  // 大端 64 位长度（只填低 32 位，数据 < 4GB）
  buf[padLen - 4] = (bitLen >>> 24) & 0xff;
  buf[padLen - 3] = (bitLen >>> 16) & 0xff;
  buf[padLen - 2] = (bitLen >>> 8) & 0xff;
  buf[padLen - 1] = bitLen & 0xff;

  var w = new Uint32Array(64);
  for (var off = 0; off < padLen; off += 64) {
    for (var i = 0; i < 16; i++) {
      w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) |
             (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3];
    }
    sha256Block(w, h);
  }
  var out = new Uint8Array(32);
  for (var j = 0; j < 8; j++) {
    out[j * 4] = (h[j] >>> 24) & 0xff;
    out[j * 4 + 1] = (h[j] >>> 16) & 0xff;
    out[j * 4 + 2] = (h[j] >>> 8) & 0xff;
    out[j * 4 + 3] = h[j] & 0xff;
  }
  return out;
}

/** HMAC-SHA256(key, message) → Uint8Array(32) */
function hmacSha256(key, msg) {
  // 如果 key > 64 字节，先 hash
  if (key.length > 64) key = sha256(key);
  var k = new Uint8Array(64);
  k.set(key);
  // ipad / opad
  var ipad = new Uint8Array(64);
  var opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  // inner = H(ipad + msg)
  var inner = new Uint8Array(64 + msg.length);
  inner.set(ipad);
  inner.set(msg, 64);
  var innerHash = sha256(inner);
  // outer = H(opad + inner)
  var outer = new Uint8Array(64 + 32);
  outer.set(opad);
  outer.set(innerHash, 64);
  return sha256(outer);
}

/**
 * PBKDF2-HMAC-SHA256(password, salt, iterations, keyLen) → Uint8Array(keyLen)
 * 与 crypto.subtle.deriveBits(...,256) 输出完全一致。
 */
function pbkdf2(password, salt, iterations, keyLen) {
  var pwBytes = strToBytes(password);
  var saltBytes = strToBytes(salt);
  var out = new Uint8Array(keyLen);
  var blockLen = 32; // SHA-256 输出长度
  var blocks = Math.ceil(keyLen / blockLen);

  for (var block = 1; block <= blocks; block++) {
    // U1 = HMAC(password, salt + INT_32_BE(block))
    var saltBlock = new Uint8Array(saltBytes.length + 4);
    saltBlock.set(saltBytes);
    saltBlock[saltBytes.length] = (block >>> 24) & 0xff;
    saltBlock[saltBytes.length + 1] = (block >>> 16) & 0xff;
    saltBlock[saltBytes.length + 2] = (block >>> 8) & 0xff;
    saltBlock[saltBytes.length + 3] = block & 0xff;

    var u = hmacSha256(pwBytes, saltBlock);
    var t = new Uint8Array(u); // 复制
    for (var i = 1; i < iterations; i++) {
      u = hmacSha256(pwBytes, u);
      for (var j = 0; j < blockLen; j++) t[j] ^= u[j];
    }
    var off = (block - 1) * blockLen;
    var copyLen = Math.min(blockLen, keyLen - off);
    out.set(t.subarray(0, copyLen), off);
  }
  return out;
}

/** 字符串 → UTF-8 Uint8Array */
function strToBytes(s) {
  // 微信小程序无 TextEncoder，手动 UTF-8 编码
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // 代理对
      i++;
      var c2 = s.charCodeAt(i);
      var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18));
      bytes.push(0x80 | ((cp >> 12) & 0x3f));
      bytes.push(0x80 | ((cp >> 6) & 0x3f));
      bytes.push(0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/** Uint8Array → hex 字符串 */
function toHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] & 0xff).toString(16);
    hex += b.length < 2 ? '0' + b : b;
  }
  return hex;
}

/**
 * 校验密码是否匹配 werkzeug pbkdf2:sha256 格式的哈希。
 * @param {string} password 明文密码
 * @param {string} storedHash 格式：pbkdf2:sha256:260000$salt$hex_hash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  var parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  var methodParts = parts[0].split(':');
  if (methodParts[0] !== 'pbkdf2' || methodParts[1] !== 'sha256') return false;
  var iterations = parseInt(methodParts[2], 10);
  var salt = parts[1];
  var expected = parts[2];
  var derived = pbkdf2(password, salt, iterations, 32);
  var actual = toHex(derived);
  if (actual.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

module.exports = { verifyPassword, pbkdf2, sha256, hmacSha256, strToBytes, toHex };
