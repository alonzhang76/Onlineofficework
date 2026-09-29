/* 第九轮改造 · 静态断言：语法编译 + 关键结构检查 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = 'C:/Users/MI/Downloads/Onlineofficework/apps/purchase-integrated';
let fail = 0;
const chk = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + msg); if (!cond) fail++; };

const files = ['invoice.html', 'recon.html', 'tools.html', 'payment.html', 'reports.html', 'purchase.html', 'ship.html', 'receive.html'];

/* 1) 所有内联 script 语法可编译 */
for (const f of files) {
  const html = fs.readFileSync(path.join(DIR, f), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => {
    try { new vm.Script(s, { filename: f + '#inline' + i }); chk(true, f + ' 内联script#' + i + ' 语法编译'); }
    catch (e) { chk(false, f + ' 内联script#' + i + ' 语法错误: ' + e.message); }
  });
}

/* 2) 各页关键结构 */
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const inv = read('invoice.html');
chk(inv.includes("moreMenuHTML('invMore'"), 'invoice: 存在 invMore 菜单生成');
chk(inv.includes("bindMoreMenu('invMore'"), 'invoice: 存在 invMore 菜单绑定');
chk(inv.includes('exportInvoicesExcel') && inv.includes('handleInvoiceImport'), 'invoice: 导出/导入函数存在');
chk(inv.includes("clearCollConfirm('invoices'"), 'invoice: 清空走通用件(invoices)');
chk(!inv.includes('invExport'), 'invoice: 旧 invExport 无残留');
chk(inv.includes("m: 'import', label: '📥 导入EXCEL'"), 'invoice: 菜单含导入项');
chk(inv.indexOf('canW ? [') < inv.indexOf('clearCollConfirm') && inv.includes("].concat(canW ? ["), 'invoice: 导入/清空仅 canW 可见');

const rc = read('recon.html');
chk(rc.includes("bindMoreMenu('rcMore'") && rc.includes('exportReconExcel'), 'recon: rcMore 菜单 + 导出函数');
chk(!rc.includes('rcExport'), 'recon: 旧 rcExport 无残留');
chk(!rc.includes("m: 'import'") && !rc.includes("m: 'clear'"), 'recon: 派生视图不提供导入/清空');

const tl = read('tools.html');
chk(tl.includes("bindMoreMenu('toolMore'"), 'tools: toolMore 菜单绑定');
chk(tl.includes("m: 'clear'") && tl.includes('DB.del'), 'tools: 清空记录功能保留');
chk(!tl.includes('toolExport') && !tl.includes('toolClear'), 'tools: 旧按钮无残留');

const pay = read('payment.html');
chk(pay.includes("bindMoreMenu('paygMore'") && pay.includes("bindMoreMenu('payrMore'"), 'payment: 双卡导出菜单');
chk(pay.includes("todayFileTag() + '.xlsx'"), 'payment: 导出为 xlsx 文件名');
chk(!pay.includes('paygExport') && !pay.includes('payrExport'), 'payment: 旧 CSV 按钮无残留');
chk(!pay.includes("m: 'import'"), 'payment: 只读页无导入项');

const rep = read('reports.html');
chk(rep.includes("bindMoreMenu('repMore'"), 'reports: repMore 菜单绑定');
chk(!rep.includes('repExport'), 'reports: 旧按钮无残留');

/* 3) 全局无导出CSV(排除参考文件 ply box.html) */
for (const f of files) chk(!/导出CSV|导出.*CSV/.test(read(f)), f + ': 无「导出CSV」文案');

/* 4) common.js 三态权限与通用件完整性 */
const cm = fs.readFileSync(path.join(DIR, 'js/common.js'), 'utf8');
chk(cm.includes("permOf(page)") || cm.includes('permOf('), 'common.js: permOf 三态归一化');
chk(cm.includes("=== 'rw'") && cm.includes("!== 'none'"), 'common.js: canWrite/can 三态判断');
chk(cm.includes('function moreMenuHTML') && cm.includes('function bindMoreMenu'), 'common.js: 更多菜单通用件');
chk(cm.includes('async function exportCollExcel') && cm.includes('async function importCollExcel') && cm.includes('function clearCollConfirm'), 'common.js: 导入/导出/清空通用件');

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过'));
process.exit(fail ? 1 : 0);
