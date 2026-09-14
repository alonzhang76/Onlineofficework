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

module.exports = { pad, fmtMoney, today, fmtDate, sanitizeDateValue, excelDate };
