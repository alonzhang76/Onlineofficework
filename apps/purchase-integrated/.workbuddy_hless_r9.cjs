/* 第九轮改造 · headless Edge 实测验证
   覆盖：更多菜单实际功能(导出xlsx/导入csv去重/清空confirm) + 权限三态实际生效 */
const { chromium } = require('playwright');
const DIR = 'C:/Users/MI/Downloads/Onlineofficework/apps/purchase-integrated';
const BASE = 'file:///C:/Users/MI/Downloads/Onlineofficework/apps/purchase-integrated/';
let pass = 0, failN = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : failN++; };

const now = new Date().toISOString();
const PKEYS = ['dashboard', 'purchase', 'ship', 'receive', 'invoice', 'payment', 'recon', 'suppliers', 'reports', 'tools', 'admin'];
const mkPerm = rwKeys => Object.fromEntries(PKEYS.map(k => [k, rwKeys.includes(k) ? 'rw' : 'none']));

function seedScript(asUser) {
  return `
    localStorage.clear(); sessionStorage.clear();
    const users = [
      { id:'u_admin', username:'admin', pwd:'x', name:'系统管理员', role:'admin', supplierName:'', active:true, createdAt:'${now}' },
      { id:'u_inv_r', username:'invread', pwd:'x', name:'发票只读小李', role:'role_inv_r', supplierName:'', active:true, createdAt:'${now}' },
      { id:'u_sup', username:'sup1', pwd:'x', name:'丁一', role:'supplier', supplierName:'丁一钢铁', active:true, createdAt:'${now}' }];
    localStorage.setItem('pis_users', JSON.stringify(users));
    const roles = [
      { id:'role_admin', key:'admin', name:'管理员', locked:true, permissions:{} },
      { id:'role_supplier', key:'supplier', name:'供应商', locked:true, supplierRole:true,
        permissions: Object.assign({ dashboard:'r', purchase:'r', ship:'rw', receive:'r', invoice:'r', payment:'r', recon:'r' }) },
      { id:'role_inv_r', key:'role_inv_r', name:'发票只读', locked:false,
        permissions: { dashboard:'rw', invoice:'r', payment:'r' } }];
    localStorage.setItem('pis_roles', JSON.stringify(roles));
    localStorage.setItem('pis_companies', JSON.stringify([{ code:'普利美', name:'普利美' }]));
    localStorage.setItem('pis_orders', JSON.stringify([
      { id:'o1', company:'普利美', contractNumber:'PO-2026-001', supplier:'丁一钢铁', orderDate:'2026-09-01',
        deliveryDate:'2026-09-20', totalAmount:10000, products:[{ name:'钢板', quantity:10, price:1000 }], remark:'', createdAt:'${now}' }]));
    localStorage.setItem('pis_invoices', JSON.stringify([
      { id:'v1', company:'普利美', invoiceNumber:'INV-001', invoiceType:'增值税专用发票', invoiceDate:'2026-09-05',
        supplier:'丁一钢铁', buyerName:'普利美', itemName:'钢板', netAmount:8849.56, taxRate:'13%', taxAmount:1150.44,
        amount:10000, contractNumber:'PO-2026-001', remark:'', reimStatus:'', createdAt:'${now}' }]));
    localStorage.setItem('pis_payments', JSON.stringify([]));
    localStorage.setItem('pis_suppliers', JSON.stringify([
      { id:'s1', supplierNumber:'SUP-001', supplierName:'丁一钢铁', contactPerson:'丁一', phoneNumber:'138', email:'', companyAddress:'', bankName:'', bankCode:'', bankAccount:'', remarks:'', createdAt:'${now}' }]));
    sessionStorage.setItem('pis_session', JSON.stringify(users.find(u => u.id === '${asUser}')));
  `;
}
const CSV = '发票号码,类型,开票日期,购买方,销售方,品名,不含税,税率,税额,价税合计,会计科目,所属项目,备注\n' +
  'INV-100,增值税专用发票,2026-09-10,普利美,丁一钢铁,钢板,8849.56,13%,1150.44,10000,,PO-2026-001,导入测试\n' +
  'INV-001,增值税专用发票,2026-09-05,普利美,丁一钢铁,钢板,8849.56,13%,1150.44,10000,,PO-2026-001,重复行\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  // 拦截报销系统付款 API（headless 下不依赖本地 Flask 在线）
  await page.route('**/api/payments/external', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      invoices: [{ invoice_no: 'RINV-001', seller_name: '丁一钢铁', item_name: '服务费', total_amount: 5000, paid_amount: 5000,
        balance: 0, payment_status: '已付清', invoice_date: '2026-09-08', invoice_type: '增值税专用发票',
        payment_date: '2026-09-20', payment_method: '银行转账', project: 'PO-2026-001', claimant: '张三' }],
      records: [{ invoice_no: 'RINV-001', seller_name: '丁一钢铁', item_name: '服务费', total_amount: 5000, paid_amount: 5000,
        balance: 0, payment_status: '已付清', payment_date: '2026-09-20', payment_method: '银行转账',
        payee: '销售方', claimant: '', project: 'PO-2026-001', payment_note: '尾款' }]
    })
  }));
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  /* ===== 视角A：管理员 ===== */
  await page.addInitScript(seedScript('u_admin'));

  // A1. invoice 台账：菜单3项(导出/导入/清空)
  await page.goto(BASE + 'invoice.html', { waitUntil: 'load' });
  await page.waitForSelector('#invMore', { timeout: 8000 });
  ok(await page.$('#invMore') !== null, 'A1 管理员·发票台账出现「更多」按钮');
  await page.click('#invMore');
  await page.waitForTimeout(200);
  const items = await page.$$eval('#invMoreMenu button[data-m]', els => els.map(e => e.dataset.m));
  ok(items.join(',') === 'export,import,clear', 'A1 菜单项=导出/导入/清空 (实际: ' + items.join(',') + ')');

  // A2. 导出EXCEL：先触发 XLSX 懒加载，再 hook writeFile 断言调用与文件名
  await page.evaluate(async () => { await ensureXLSX(); const o = XLSX.writeFile; window.__dl = null; XLSX.writeFile = function (wb, n) { window.__dl = n; return o.apply(this, arguments); }; });
  await page.click('#invMoreMenu button[data-m="export"]');
  await page.waitForFunction('window.__dl', { timeout: 10000 });
  const dl1 = await page.evaluate('window.__dl');
  ok(/^发票台账_\d{8}\.xlsx$/.test(dl1), 'A2 导出触发且文件名正确 (实际: ' + dl1 + ')');
  const wsNameOk = await page.evaluate(() => { const arr = JSON.parse(localStorage.getItem('pis_invoices')); return arr.length === 1; });
  ok(wsNameOk, 'A2 导出不改数据');

  // A3. 导入EXCEL(CSV)：2行(1新+1重复) → 导入1条跳过1条
  await page.setInputFiles('#invImportFile', { name: '发票导入.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + CSV, 'utf8') });
  await page.waitForFunction(() => document.querySelector('#toastBox') && document.querySelector('#toastBox').textContent.includes('已导入'), { timeout: 10000 });
  const invCnt = await page.evaluate(() => JSON.parse(localStorage.getItem('pis_invoices')).length);
  ok(invCnt === 2, 'A3 导入后发票 1→2 条，重复行已去重 (实际: ' + invCnt + ')');
  const impRec = await page.evaluate(() => JSON.parse(localStorage.getItem('pis_invoices')).find(v => v.invoiceNumber === 'INV-100'));
  ok(impRec && impRec.source === 'EXCEL导入' && impRec.supplier === '丁一钢铁' && impRec.amount === 10000 && !!impRec.subjectName,
    'A3 导入字段映射正确(来源/供应商/金额/会计科目自动归类)');

  // A4. 清空：confirm 已全局 accept → 数据清空
  await page.click('#invMore');
  await page.waitForTimeout(150);
  await page.click('#invMoreMenu button[data-m="clear"]');
  await page.waitForFunction(() => document.querySelector('#toastBox').textContent.includes('已清空'), { timeout: 8000 });
  const invCnt2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pis_invoices')).length);
  ok(invCnt2 === 0, 'A4 清空后发票 0 条 (实际: ' + invCnt2 + ')');

  /* ===== 视角B：发票只读角色(dashboard=rw, invoice/payment=r, 其余none) ===== */
  await page.addInitScript(seedScript('u_inv_r'));
  await page.goto(BASE + 'invoice.html', { waitUntil: 'load' });
  await page.waitForSelector('#invMore', { timeout: 8000 });
  await page.click('#invMore');
  await page.waitForTimeout(200);
  const itemsR = await page.$$eval('#invMoreMenu button[data-m]', els => els.map(e => e.dataset.m));
  ok(itemsR.join(',') === 'export', 'B1 只读角色菜单仅「导出EXCEL」 (实际: ' + itemsR.join(',') + ')');
  ok(await page.$('#invAdd') === null, 'B2 只读角色无「登记发票」按钮');
  ok(await page.$('#invSubmitReim') === null, 'B2 只读角色无「提交到报销系统」按钮');
  const rowOps = await page.$$eval('#invTableBox button[data-a]', els => els.map(e => e.dataset.a).filter(a => a !== 's'));
  ok(rowOps.length === 0, 'B2 只读角色表格行无编辑/删除按钮');
  await page.evaluate(async () => { await ensureXLSX(); const o = XLSX.writeFile; window.__dl2 = null; XLSX.writeFile = function (wb, n) { window.__dl2 = n; return o.apply(this, arguments); }; });
  await page.click('#invMoreMenu button[data-m="export"]');
  await page.waitForFunction('window.__dl2', { timeout: 10000 });
  ok(await page.evaluate('window.__dl2') !== null, 'B3 只读角色仍可导出EXCEL');

  // B4. 权限「不显示」：role_inv_r 未授权 purchase/recon 等 → 导航不含
  await page.goto(BASE + 'dashboard.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const navTxt = await page.evaluate(() => document.querySelector('#navMenu').textContent);
  ok(!navTxt.includes('采购合同') && !navTxt.includes('对账管理'), 'B4 未授权模块不在导航 (采购合同/对账管理已隐藏)');
  ok(navTxt.includes('开票管理'), 'B4 只读模块仍在导航 (开票管理可见)');
  // 直接访问 URL 也被拒
  await page.goto(BASE + 'purchase.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const urlNow = page.url();
  ok(urlNow.includes('login.html') || urlNow.includes('dashboard'), 'B4 直接访问未授权页被重定向 (url: ' + urlNow.split('/').pop() + ')');

  /* ===== 视角C：供应商(ship=rw, invoice=r) ===== */
  await page.addInitScript(seedScript('u_sup'));
  await page.goto(BASE + 'invoice.html', { waitUntil: 'load' });
  await page.waitForSelector('#invMore', { timeout: 8000 });
  await page.click('#invMore');
  await page.waitForTimeout(200);
  const itemsSup = await page.$$eval('#invMoreMenu button[data-m]', els => els.map(e => e.dataset.m));
  ok(itemsSup.join(',') === 'export', 'C1 供应商·发票页菜单仅导出 (实际: ' + itemsSup.join(',') + ')');
  ok(await page.$('#invTabs button[data-t="upload"]') === null, 'C2 供应商无「发票录入」标签');
  // C3 供应商发货页有完整菜单(导入+清空; 供应商清空按 ship.html 逻辑 isSup 时隐藏 clear)
  await page.goto(BASE + 'ship.html', { waitUntil: 'load' });
  await page.waitForSelector('#shipMore', { timeout: 8000 });
  await page.click('#shipMore');
  await page.waitForTimeout(200);
  const itemsSupShip = await page.$$eval('#shipMoreMenu button[data-m]', els => els.map(e => e.dataset.m));
  ok(itemsSupShip.includes('import') && itemsSupShip.includes('export') && !itemsSupShip.includes('clear'),
    'C3 供应商·发货菜单=导出+导入,无清空 (实际: ' + itemsSupShip.join(',') + ')');
  // C4 供应商导航不含报表/工具
  await page.waitForTimeout(500);
  const navSup = await page.evaluate(() => document.querySelector('#navMenu').textContent);
  ok(!navSup.includes('数据统计') && !navSup.includes('工具箱'), 'C4 供应商导航隐藏报表/工具');

  /* ===== 视角D：管理员 · 其余页面菜单冒烟 ===== */
  await page.addInitScript(seedScript('u_admin'));
  const smoke = [
    ['recon.html', '#rcMore', 1],
    ['tools.html', '#toolMore', 2],
    ['reports.html', '#repMore', 1],
  ];
  for (const [f, sel, n] of smoke) {
    await page.goto(BASE + f, { waitUntil: 'load' });
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel);
    await page.waitForTimeout(200);
    const cnt = await page.$$eval(sel + 'Menu button[data-m]', els => els.length);
    ok(cnt === n, 'D 冒烟 ' + f + ' 菜单项数=' + n + ' (实际: ' + cnt + ')');
  }
  // payment.html 双菜单
  await page.goto(BASE + 'payment.html', { waitUntil: 'load' });
  await page.waitForSelector('#paygMore', { timeout: 8000 });
  const payOk = (await page.$('#paygMore') !== null) && (await page.$('#payrMore') !== null);
  ok(payOk, 'D 冒烟 payment.html 总览/明细双「更多」菜单存在');
  await page.evaluate(async () => { await ensureXLSX(); const o = XLSX.writeFile; window.__dl3 = null; XLSX.writeFile = function (wb, n) { window.__dl3 = n; return o.apply(this, arguments); }; });
  await page.click('#paygMore');
  await page.waitForTimeout(200);
  await page.click('#paygMoreMenu button[data-m="export"]');
  await page.waitForFunction('window.__dl3', { timeout: 10000 });
  const dl3 = await page.evaluate('window.__dl3');
  ok(/^供应商付款总览_\d{8}\.xlsx$/.test(dl3), 'D payment 总览导出 xlsx (实际: ' + dl3 + ')');

  await browser.close();
  console.log('\n' + (failN ? '❌ ' + failN + ' 项失败 / ' : '✅ ') + pass + ' 项通过');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
