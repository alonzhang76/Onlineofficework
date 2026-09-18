/**
 * 数字 → 人民币中文大写（合同金额用，与桌面端 CM/LJe 等价）
 * 例：12345.67 → 壹万贰仟叁佰肆拾伍元陆角柒分
 */
const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const SMALL_UNITS = ['', '拾', '佰', '仟'];
const BIG_UNITS = ['', '万', '亿', '万亿'];

function intToCnSection(section) {
  // 4 位小节转中文
  let str = '';
  let zero = false;
  const s = String(section);
  for (let i = 0; i < s.length; i++) {
    const n = Number(s[i]);
    const unitPos = s.length - 1 - i;
    if (n === 0) {
      zero = true;
    } else {
      if (zero) { str += '零'; zero = false; }
      str += DIGITS[n] + SMALL_UNITS[unitPos];
    }
  }
  return str;
}

function intToCn(numInt) {
  let n = Number(numInt);
  if (!n) return '';
  let out = '';
  let sectionIdx = 0;
  let needZero = false;
  while (n > 0) {
    const section = n % 10000;
    if (section) {
      let part = intToCnSection(section) + BIG_UNITS[sectionIdx];
      // 跨小节且低小节不足 1000 时补零
      if (needZero) out = '零' + out;
      out = part + out;
      needZero = section < 1000;
    } else if (out) {
      needZero = true;
    }
    n = Math.floor(n / 10000);
    sectionIdx++;
  }
  return out;
}

function amountToChinese(value) {
  let n = Number(value);
  if (isNaN(n)) return '';
  if (n === 0) return '零元整';
  let neg = '';
  if (n < 0) { neg = '负'; n = -n; }
  // 四舍五入到分
  n = Math.round(n * 100) / 100;
  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);
  const jiao = Math.floor(cents / 10);
  const fen = cents % 10;

  let out = intToCn(intPart);
  if (!intPart && cents > 0) out = '零';
  out += '元';
  if (jiao === 0 && fen === 0) {
    out += '整';
  } else {
    if (jiao === 0) {
      if (intPart > 0) out += '零';
      out += DIGITS[fen] + '分';
    } else {
      out += DIGITS[jiao] + '角';
      if (fen > 0) out += DIGITS[fen] + '分';
    }
  }
  return neg + out;
}

module.exports = { amountToChinese };
