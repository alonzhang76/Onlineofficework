/**
 * WXML 结构校验
 * 检查：标签配对、wx:for/wx:if 指令中的变量是否在页面 data 或 js 中定义
 */
const fs = require('fs');
const path = require('path');

// 真正的自闭合/空元素（WXML 中这些标签通常不需要闭合）
const SELF_CLOSING = new Set(['input', 'image', 'import', 'include', 'wxs', 'icon', 'progress', 'slider', 'switch', 'textarea', 'video', 'camera', 'live-player', 'live-pusher', 'open-data', 'web-view', 'ad', 'official-account', 'audio', 'canvas', 'map', 'br']);

function checkTags(file) {
  const s = fs.readFileSync(file, 'utf8');
  const errs = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(s))) {
    const isClose = m[1] === '/';
    const tag = m[2];
    const selfClosed = m[4] === '/';
    if (isClose) {
      if (!stack.length) { errs.push('多余的 </' + tag + '>'); continue; }
      const top = stack.pop();
      if (top !== tag) errs.push('标签不匹配：<' + top + '> 被 </' + tag + '> 关闭');
    } else if (!selfClosed && !SELF_CLOSING.has(tag)) {
      stack.push(tag);
    }
  }
  if (stack.length) errs.push('未闭合标签：' + stack.join(' > '));
  return errs;
}

/** 检查 wxml 中引用的 {{var}} 是否在 js 的 data 中（仅提示，不做强校验） */
function checkDataRefs(file, jsFile) {
  if (!fs.existsSync(jsFile)) return [];
  const wxml = fs.readFileSync(file, 'utf8');
  const js = fs.readFileSync(jsFile, 'utf8');
  // 收集 wxml 中所有 {{ }} 表达式里的顶层标识符
  const ids = new Set();
  const re = /\{\{([^}]+)\}\}/g;
  let m;
  const KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'item', 'index', 'true', 'length']);
  while ((m = re.exec(wxml))) {
    const expr = m[1];
    const idRe = /([a-zA-Z_$][\w$]*)/g;
    let im;
    while ((im = idRe.exec(expr))) {
      const id = im[1];
      if (KEYWORDS.has(id)) continue;
      // 跳过属性访问的后半段（如 a.b 中的 b）
      const before = expr.slice(0, im.index);
      if (/\.\s*$/.test(before)) continue;
      // 跳过对象字面量的 key
      const after = expr.slice(im.index + id.length);
      if (/^\s*:/.test(after)) continue;
      // 跳过字符串
      if (/'[^']*$/.test(before) || /"[^"]*$/.test(before)) continue;
      ids.add(id);
    }
  }
  // 收集 wx:for-item / wx:for-index 别名 + wx:for 的 item
  const aliasRe = /wx:for-item="([^"]+)"|wx:for-index="([^"]+)"/g;
  let am;
  while ((am = aliasRe.exec(wxml))) { if (am[1]) ids.add(am[1]); if (am[2]) ids.add(am[2]); }
  if (/wx:for=/.test(wxml)) { ids.add('item'); ids.add('index'); }
  // 收集 js 中 data 的 key + 方法名
  const missing = [];
  ids.forEach(id => {
    // data 中的 key
    const inData = new RegExp('\\b' + id + '\\s*:').test(js);
    if (!inData) missing.push(id);
  });
  return missing;
}

let failCount = 0, fileCount = 0;

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) { walk(p); return; }
    if (!e.name.endsWith('.wxml')) return;
    fileCount++;
    const tagErrs = checkTags(p);
    if (tagErrs.length) {
      failCount++;
      console.log('✗ ' + p);
      tagErrs.forEach(x => console.log('    ' + x));
    }
    const jsFile = p.replace(/\.wxml$/, '.js');
    const missing = checkDataRefs(p, jsFile);
    if (missing.length) {
      console.log('⚠ ' + p + ' 引用了 js 中未定义的变量：' + missing.join(', '));
    }
  });
}

walk(process.argv[2] || 'pages');
console.log('\n检查 ' + fileCount + ' 个 WXML 文件，' + (failCount ? failCount + ' 个标签结构有问题' : '标签结构全部正确 ✓'));
process.exit(failCount ? 1 : 0);
