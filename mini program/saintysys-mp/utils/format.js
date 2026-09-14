/** 通用格式化工具 */
function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function today() {
  const d = new Date();
  const p = x => (x < 10 ? '0' + x : '' + x);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function nowTime() {
  const d = new Date();
  const p = x => (x < 10 ? '0' + x : '' + x);
  return today() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

module.exports = { fmtMoney, fmtNum, today, nowTime, fileSize };
