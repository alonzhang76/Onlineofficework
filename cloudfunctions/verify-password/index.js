/* ===== 云函数 verify-password =====
 *
 * 功能：校验明文密码是否匹配 werkzeug pbkdf2:sha256 格式的哈希。
 * 背景：小程序无 crypto.subtle，纯 JS PBKDF2-SHA256（260000 次迭代）
 *       在真机耗时约 1~2 分钟，严重影响登录体验。
 *       云函数运行在 Node.js 环境，可使用内置 crypto 模块，耗时 < 100ms。
 *
 * 入参（event）：
 *   - password {string} 明文密码
 *   - hash     {string} werkzeug 格式哈希 pbkdf2:sha256:260000$salt$hex
 *
 * 返回：
 *   { ok: boolean } — true 表示密码正确
 *   失败返回 { ok: false, error?: string }
 */
const crypto = require('crypto');

exports.main = async (event) => {
  const { password, hash } = event;
  if (!password || !hash) return { ok: false, error: 'missing params' };

  // 解析 werkzeug 格式：pbkdf2:sha256:260000$salt$hex_hash
  const parts = hash.split('$');
  if (parts.length !== 3) return { ok: false, error: 'bad hash format' };
  const methodParts = parts[0].split(':');
  if (methodParts[0] !== 'pbkdf2' || methodParts[1] !== 'sha256')
    return { ok: false, error: 'unsupported method' };

  const iterations = parseInt(methodParts[2], 10);
  const salt = parts[1];
  const expected = parts[2];
  const keyLen = Buffer.from(expected, 'hex').length;

  const derived = crypto.pbkdf2Sync(password, salt, iterations, keyLen, 'sha256');
  const actual = derived.toString('hex');

  // 常量时间比较防时序攻击
  if (actual.length !== expected.length) return { ok: false };
  let diff = 0;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return { ok: diff === 0 };
};
