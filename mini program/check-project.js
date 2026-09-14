/**
 * 小程序项目一致性校验
 * 1. app.json 中注册的页面文件是否齐全
 * 2. navigateTo / switchTab / reLaunch 目标是否已注册
 * 3. require 相对路径是否有效
 * 4. wxml 中是否残留未绑定的内联函数调用
 * 5. JS 语法是否合法（用 vm.Script 解析，避免仅靠人工 node --check）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || '.';
process.chdir(ROOT);

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const registered = new Set(app.pages.map(p => '/' + p));
let problems = 0;

/* ---- 1. 页面文件齐全 ---- */
app.pages.forEach(p => {
  ['.js', '.wxml', '.json', '.wxss'].forEach(ext => {
    if (!fs.existsSync(p + ext)) { console.log('✗ 缺少文件 ' + p + ext); problems++; }
  });
});

/* ---- 收集所有 js ---- */
function collectJs(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) { if (e.name !== 'node_modules') collectJs(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  });
  return out;
}
const jsFiles = collectJs('.');

/* ---- 2. 跳转目标 ---- */
jsFiles.forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  const re = /url:\s*['"](\/pages\/[^'"?]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (!registered.has(m[1])) { console.log('✗ 跳转目标未注册：' + f + ' → ' + m[1]); problems++; }
  }
});

/* ---- 3. require 路径 ---- */
jsFiles.forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  const re = /require\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[1];
    if (!t.startsWith('.')) continue;
    const r = path.join(path.dirname(f), t).replace(/\\/g, '/');
    if (!fs.existsSync(r) && !fs.existsSync(r + '.js')) {
      console.log('✗ require 路径无效：' + f + ' → ' + t); problems++;
    }
  }
});

/* ---- 4. wxml 内联函数调用（不合法写法） ---- */
function collectWxml(dir, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) collectWxml(p, out);
    else if (e.name.endsWith('.wxml')) out.push(p);
  });
  return out;
}
collectWxml('.').forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  // 形如 bindtap="fn('x')" 或 bindchange="fn('x')" —— WXML 不支持传参调用
  const re = /bind(?:tap|change|input|confirm|longpress|longtap)\s*=\s*"([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(s))) {
    console.log('✗ 内联函数调用不合法：' + f + ' → ' + m[1] + '(...)');
    problems++;
  }
});

/* ---- 5. JS 语法校验 ---- */
jsFiles.forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  try {
    new vm.Script(s, { filename: f });
  } catch (e) {
    const line = e.lineNumber || (e.stack.match(/:(\d+)\n/) || [])[1] || '?';
    console.log('✗ JS 语法错误：' + f + ':' + line + ' → ' + e.message);
    problems++;
  }
});

/* ---- 6. 弹层可滚动性 ----
 * 小程序中 <view style="overflow-y:auto"> 不响应触摸滚动，
 * 弹层正文必须交给 <scroll-view scroll-y>，否则会出现
 * 「弹层固定不动、背后页面在动」的穿透问题。
 * 同时遮罩需带 catchtouchmove 阻断背景滚动。
 */
function collectWxmlAll(dir, out = []) {
  try {
    fs.readdirSync(dir).forEach(n => {
      if (n === 'node_modules' || n.startsWith('.')) return;
      const p = path.join(dir, n);
      let st;
      try { st = fs.statSync(p); } catch (e) { return; }
      if (st.isDirectory()) collectWxmlAll(p, out);
      else if (n.endsWith('.wxml')) out.push(p);
    });
  } catch (e) { /* ignore */ }
  return out;
}
const TAG_RE = /<(\/?)([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
const VOID_TAGS = new Set(['input', 'image', 'icon', 'progress', 'slider', 'switch',
  'checkbox', 'radio', 'camera', 'live-player', 'live-pusher', 'wxs', 'import', 'include', 'br']);

collectWxmlAll('.').forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  const toks = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    toks.push({
      name: m[2], isClose: m[1] === '/',
      selfClose: m[4] === '/' || VOID_TAGS.has(m[2]),
      attrs: m[3] || ''
    });
  }
  // 用栈配对，检查 sheet / modal-box 内部是否含 scroll-view
  const stack = [];
  const elementOf = [];   // 每个开标签对应的元素区间信息
  toks.forEach((t, i) => {
    if (t.isClose) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === t.name) { elementOf[stack[k].idx] = { close: i }; stack.length = k; return; }
      }
    } else if (!t.selfClose) {
      stack.push({ name: t.name, idx: i });
    }
  });
  toks.forEach((t, i) => {
    if (t.isClose || t.selfClose || t.name !== 'view') return;
    if (!/(^|\s)class="(sheet|modal-box)(\s[^"]*)?"/.test(t.attrs)) return;
    const span = elementOf[i];
    if (!span) return;
    let hasScroll = false;
    for (let k = i + 1; k < span.close; k++) {
      if (!toks[k].isClose && toks[k].name === 'scroll-view') { hasScroll = true; break; }
    }
    if (!hasScroll) {
      console.log('✗ 弹层缺少 scroll-view（滑动会穿透到背景）：' + f);
      problems++;
    }
  });
  // 遮罩必须阻断触摸滚动
  toks.forEach(t => {
    if (t.isClose || t.selfClose || t.name !== 'view') return;
    if (!/(^|\s)class="mask/.test(t.attrs)) return;
    if (!/catchtouchmove/.test(t.attrs)) {
      console.log('✗ 遮罩缺少 catchtouchmove（背景会跟着滚动）：' + f);
      problems++;
    }
  });
});

/* ---- 7. data 中未定义但被 wx:for 之外的表达式引用（粗略） ---- */
console.log('');
console.log('检查文件：' + jsFiles.length + ' 个 JS，' + collectWxml('.').length + ' 个 WXML');
console.log(problems ? '发现 ' + problems + ' 个问题' : '✓ 全部检查通过');
process.exit(problems ? 1 : 0);
