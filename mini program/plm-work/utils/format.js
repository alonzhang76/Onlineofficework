/** 格式化工具 */
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function fmtMoney(v) {
  return (Math.round((+v || 0) * 100) / 100).toFixed(2);
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  let s = String(d).trim();
  if (s.indexOf('T') > -1) s = s.slice(0, 10);
  else if (s.indexOf('GMT') > -1 || s.indexOf('标准时间') > -1) {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
  return s.slice(0, 10);
}

/** 清洗日期占位符（"-"、"/"、"无"等），非法日期返回 '' */
function sanitizeDateValue(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{4})[.\-\/年](\d{1,2})[.\-\/月](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + pad(mo) + '-' + pad(d);
  }
  return '';
}

/** Excel 序列号 → YYYY-MM-DD */
function excelDate(num) {
  if (typeof num !== 'number' || num <= 0) return '';
  const ms = Math.round((num - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  // 处理时区偏移
  const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return utc.getFullYear() + '-' + pad(utc.getMonth() + 1) + '-' + pad(utc.getDate());
}

/**
 * 把各种日期格式解析为毫秒时间戳（与网页版 applySort 的 toTimestamp 同口径）
 * 支持：Date 对象、Excel 序列号数字、ISO/时间戳字符串、
 *       2026-9-8 / 2026/9/8 / 2026.9.8 / 2026年9月8日 等非补零/中文格式
 * 无法解析返回 NaN
 */
function dateTs(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return (v - 25568) * 86400000; // Excel 序列号（1899-12-30 起算）
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (!s) return NaN;
  // 纯日期（YYYY-M-D，任意分隔符，不含时间部分）：统一按本地零点构造，
  // 避免 ISO 按 UTC、斜杠/点号按本地解析造成的同日时间戳偏差，保证同日同戳
  const m = s.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (m && !/[T\s]/.test(s) && s.length <= 12) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // 含时间的完整时间戳 / ISO 字符串
  const t = Date.parse(s);
  if (!isNaN(t)) return t;
  // 兜底：2026-9-8 / 2026/9/8 / 2026.9.8 / 2026年9月8日（部分引擎 Date.parse 不识别非补零格式）
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return NaN;
}

/**
 * 日期倒序比较器（与网页版各列表默认排序一致：日期新的在前）
 * - 无日期/日期无法解析的记录排最后
 * - 同一天按创建时间（createdAt/updatedAt）倒序，新录入在前
 * @param {string} field 日期字段名
 */
function cmpDateDesc(field) {
  return function (a, b) {
    const ta = dateTs(a[field]);
    const tb = dateTs(b[field]);
    const aOk = !isNaN(ta), bOk = !isNaN(tb);
    if (aOk && bOk && ta !== tb) return tb - ta;
    if (aOk !== bOk) return aOk ? -1 : 1; // 有日期的在前，空日期沉底
    if (!aOk && !bOk) {
      const c = String(b[field] || '').localeCompare(String(a[field] || ''));
      if (c) return c;
    }
    const ca = a.createdAt || a.updatedAt || '';
    const cb = b.createdAt || b.updatedAt || '';
    return String(cb).localeCompare(String(ca));
  };
}

module.exports = { pad, fmtMoney, today, fmtDate, sanitizeDateValue, excelDate, dateTs, cmpDateDesc };
