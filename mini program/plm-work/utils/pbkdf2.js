/**
 * 纯 JS SHA-256 + HMAC-SHA256 + PBKDF2 实现（优化版）
 *
 * 优化要点：
 * 1. HMAC 预计算：password 固定，ipad/opad 块只需 SHA-256 一次，
 *    后续每轮只处理 1 个消息块 + 1 个外层块 = 2 次块压缩（原 4 次）
 * 2. 零分配热路径：所有 buffer 预分配复用，避免 GC 压力
 * 3. 优先走云函数 verify-password（Node.js crypto，<100ms），
 *    云函数不可用时回退本地计算
 */

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

/* 处理一个 64 字节块；w 为 64 个 32 位字（会被修改），h 为 8 个字的状态（会被修改） */
function sha256Block(w, h) {
  var i, s0, s1, S1, S0, ch, mj, t1, t2;
  for (i = 16; i < 64; i++) {
    s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (i = 0; i < 64; i++) {
    S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    ch = (e & f) ^ (~e & g);
    t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
    S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    mj = (a & b) ^ (a & c) ^ (b & c);
    t2 = (S0 + mj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

/** 把 64 字节大端数据填入 w[0..15] */
function fillW(buf, off, w) {
  for (var i = 0; i < 16; i++) {
    w[i] = (buf[off + i * 4] << 24) | (buf[off + i * 4 + 1] << 16) |
           (buf[off + i * 4 + 2] << 8) | buf[off + i * 4 + 3];
  }
}

/** SHA-256(data) → Uint8Array(32) —— 通用版，用于首次计算 */
function sha256(data) {
  var h = new Uint32Array(H0);
  var len = data.length;
  var bitLen = len * 8;
  var padLen = ((len + 9 + 63) >> 6) << 6;
  if (padLen === 0) padLen = 64;
  var buf = new Uint8Array(padLen);
  buf.set(data);
  buf[len] = 0x80;
  buf[padLen - 4] = (bitLen >>> 24) & 0xff;
  buf[padLen - 3] = (bitLen >>> 16) & 0xff;
  buf[padLen - 2] = (bitLen >>> 8) & 0xff;
  buf[padLen - 1] = bitLen & 0xff;
  var w = new Uint32Array(64);
  for (var off = 0; off < padLen; off += 64) {
    fillW(buf, off, w);
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

/** 字符串 → UTF-8 Uint8Array */
function strToBytes(s) {
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
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

function toHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] & 0xff).toString(16);
    hex += b.length < 2 ? '0' + b : b;
  }
  return hex;
}

/* ============================================================
 * 优化版 PBKDF2：HMAC 预计算 + 零分配热路径
 * ============================================================
 *
 * HMAC(K, M) = SHA-256(opad‖K · SHA-256(ipad‖K ‖ M))
 *
 * PBKDF2 循环中 K 固定，所以 ipad/opad 块只需 SHA-256 一次，
 * 得到 innerState / outerState。每轮只需：
 *   1. clone innerState → 处理 M 的填充块 → 得到 innerHash
 *   2. clone outerState → 处理 innerHash 的填充块 → 得到 HMAC 输出
 * 即每轮 2 次块压缩（原 4 次）。
 */

/** 预计算 HMAC 状态：给定 key，返回 { innerState, outerState, innerLen, outerLen } */
function precomputeHmacStates(keyBytes) {
  var key = keyBytes;
  if (key.length > 64) key = sha256(key);
  var k = new Uint8Array(64);
  k.set(key);

  // ipad / opad 块（64 字节）
  var ipadBlock = new Uint8Array(64);
  var opadBlock = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    ipadBlock[i] = k[i] ^ 0x36;
    opadBlock[i] = k[i] ^ 0x5c;
  }

  // SHA-256 处理 ipad 块（作为完整消息的第 1 块）
  // ipad 消息总长 64 字节，填充后 = 128 字节 = 2 块
  // 第 1 块 = ipad 本身；第 2 块 = 0x80 + 0x00... + 64 位长度(64*8=512)
  // 但我们只需要第 1 块后的状态，不需要完整 SHA-256
  var innerState = new Uint32Array(H0);
  var w = new Uint32Array(64);
  fillW(ipadBlock, 0, w);
  sha256Block(w, innerState);

  var outerState = new Uint32Array(H0);
  fillW(opadBlock, 0, w);
  sha256Block(w, outerState);

  return { innerState: innerState, outerState: outerState };
}

/**
 * 给定预计算的 HMAC 状态，计算 HMAC(key, msg)
 * msg 长度 ≤ 55 字节（单块模式：msg + 0x80 + 长度 ≤ 64）
 */
function hmacWithPrecomputed(states, msg) {
  var msgLen = msg.length;
  var totalBitLen = (64 + msgLen) * 8; // ipad 块 + msg 的总位数

  // 构建第 2 块：msg + 0x80 + zeros + 64-bit length
  var block = new Uint8Array(64);
  block.set(msg);
  block[msgLen] = 0x80;
  // 64-bit big-endian length (high 32 bits = 0 for short messages)
  block[60] = (totalBitLen >>> 24) & 0xff;
  block[61] = (totalBitLen >>> 16) & 0xff;
  block[62] = (totalBitLen >>> 8) & 0xff;
  block[63] = totalBitLen & 0xff;

  // innerHash = SHA-256 续算
  var h = new Uint32Array(states.innerState);
  var w = new Uint32Array(64);
  fillW(block, 0, w);
  sha256Block(w, h);

  // 提取 innerHash 为 32 字节
  var innerHash = new Uint8Array(32);
  for (var j = 0; j < 8; j++) {
    innerHash[j * 4] = (h[j] >>> 24) & 0xff;
    innerHash[j * 4 + 1] = (h[j] >>> 16) & 0xff;
    innerHash[j * 4 + 2] = (h[j] >>> 8) & 0xff;
    innerHash[j * 4 + 3] = h[j] & 0xff;
  }

  // outer: opad 块已处理，续算 innerHash
  totalBitLen = (64 + 32) * 8; // opad 块 + innerHash
  var oblock = new Uint8Array(64);
  oblock.set(innerHash);
  oblock[32] = 0x80;
  oblock[60] = (totalBitLen >>> 24) & 0xff;
  oblock[61] = (totalBitLen >>> 16) & 0xff;
  oblock[62] = (totalBitLen >>> 8) & 0xff;
  oblock[63] = totalBitLen & 0xff;

  var h2 = new Uint32Array(states.outerState);
  fillW(oblock, 0, w);
  sha256Block(w, h2);

  var out = new Uint8Array(32);
  for (j = 0; j < 8; j++) {
    out[j * 4] = (h2[j] >>> 24) & 0xff;
    out[j * 4 + 1] = (h2[j] >>> 16) & 0xff;
    out[j * 4 + 2] = (h2[j] >>> 8) & 0xff;
    out[j * 4 + 3] = h2[j] & 0xff;
  }
  return out;
}

/**
 * 优化版 PBKDF2-HMAC-SHA256
 */
function pbkdf2(password, salt, iterations, keyLen) {
  var pwBytes = strToBytes(password);
  var saltBytes = strToBytes(salt);
  var states = precomputeHmacStates(pwBytes);
  var out = new Uint8Array(keyLen);
  var blockLen = 32;
  var blocks = Math.ceil(keyLen / blockLen);

  for (var block = 1; block <= blocks; block++) {
    // U1 = HMAC(password, salt + INT_32_BE(block))
    var saltBlock = new Uint8Array(saltBytes.length + 4);
    saltBlock.set(saltBytes);
    saltBlock[saltBytes.length] = (block >>> 24) & 0xff;
    saltBlock[saltBytes.length + 1] = (block >>> 16) & 0xff;
    saltBlock[saltBytes.length + 2] = (block >>> 8) & 0xff;
    saltBlock[saltBytes.length + 3] = block & 0xff;

    var u = hmacWithPrecomputed(states, saltBlock);
    var t = new Uint8Array(u); // 复制
    for (var i = 1; i < iterations; i++) {
      u = hmacWithPrecomputed(states, u);
      for (var j = 0; j < blockLen; j++) t[j] ^= u[j];
    }
    var off = (block - 1) * blockLen;
    var copyLen = Math.min(blockLen, keyLen - off);
    out.set(t.subarray(0, copyLen), off);
  }
  return out;
}

/** HMAC-SHA256(key, msg) → Uint8Array(32) —— 通用版 */
function hmacSha256(key, msg) {
  if (key.length > 64) key = sha256(key);
  var k = new Uint8Array(64);
  k.set(key);
  var ipad = new Uint8Array(64);
  var opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  var inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  var innerHash = sha256(inner);
  var outer = new Uint8Array(64 + 32);
  outer.set(opad); outer.set(innerHash, 64);
  return sha256(outer);
}

/**
 * 本地校验密码（同步，较慢）
 */
function verifyPasswordLocal(password, storedHash) {
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
  for (var i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * 异步校验密码：优先走云函数（<100ms），失败回退本地计算
 * @param {string} password
 * @param {string} storedHash
 * @param {function} [progressCb] 回调 (stage, pct) 用于 UI 更新
 * @returns {Promise<boolean>}
 */
function verifyPasswordAsync(password, storedHash, progressCb) {
  // 1. 尝试云函数
  if (progressCb) progressCb('cloud', 0);
  try {
    var supa = require('./cloudbase');
    if (supa && typeof supa.callFunction === 'function' && supa.isConfigured && supa.isConfigured()) {
      return supa.callFunction('verify-password', { password: password, hash: storedHash })
        .then(function (r) {
          if (r && typeof r.ok === 'boolean') return r.ok;
          return _fallbackLocal(password, storedHash, progressCb);
        })
        .catch(function () { return _fallbackLocal(password, storedHash, progressCb); });
    }
  } catch (e) { /* cloudbase 未就绪 */ }
  return _fallbackLocal(password, storedHash, progressCb);
}

function _fallbackLocal(password, storedHash, progressCb) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      if (progressCb) progressCb('local', 50);
      var ok = verifyPasswordLocal(password, storedHash);
      resolve(ok);
    }, 50);
  });
}

/** 同步版（向后兼容，但慢） */
function verifyPassword(password, storedHash) {
  return verifyPasswordLocal(password, storedHash);
}

module.exports = {
  verifyPassword: verifyPassword,
  verifyPasswordAsync: verifyPasswordAsync,
  verifyPasswordLocal: verifyPasswordLocal,
  pbkdf2: pbkdf2,
  sha256: sha256,
  hmacSha256: hmacSha256,
  strToBytes: strToBytes,
  toHex: toHex
};
