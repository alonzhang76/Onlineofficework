/* 第九轮 · 交付截图：管理员菜单展开 + 只读角色视图 */
const { chromium } = require('playwright');
const DIR = 'C:/Users/MI/Downloads/Onlineofficework/apps/purchase-integrated';
const BASE = 'file:///C:/Users/MI/Downloads/Onlineofficework/apps/purchase-integrated/';
const now = new Date().toISOString();

function seed(asUser) {
  return `
    localStorage.clear(); sessionStorage.clear();
    const users = [
      { id:'u_admin', username:'admin', pwd:'x', name:'系统管理员', role:'admin', supplierName:'', active:true, createdAt:'${now}' },
      { id:'u_inv_r', username:'invread', pwd:'x', name:'李会计(只读)', role:'role_inv_r', supplierName:'', active:true, createdAt:'${now}' }];
    localStorage.setItem('pis_users', JSON.stringify(users));
    localStorage.setItem('pis_roles', JSON.stringify([
      { id:'role_admin', key:'admin', name:'管理员', locked:true, permissions:{} },
      { id:'role_inv_r', key:'role_inv_r', name:'发票只读', locked:false, permissions:{ dashboard:'rw', invoice:'r', payment:'r' } }]));
    localStorage.setItem('pis_companies', JSON.stringify([{ code:'普利美', name:'普利美' }]));
    localStorage.setItem('pis_orders', JSON.stringify([
      { id:'o1', company:'普利美', contractNumber:'PO-2026-001', supplier:'丁一钢铁', orderDate:'2026-09-01', deliveryDate:'2026-09-20', totalAmount:10000, products:[{ name:'钢板', quantity:10, price:1000 }], remark:'', createdAt:'${now}' }]));
    localStorage.setItem('pis_invoices', JSON.stringify([
      { id:'v1', company:'普利美', invoiceNumber:'INV-001', invoiceType:'增值税专用发票', invoiceDate:'2026-09-05', supplier:'丁一钢铁', buyerName:'普利美', itemName:'钢板', netAmount:8849.56, taxRate:'13%', taxAmount:1150.44, amount:10000, contractNumber:'PO-2026-001', remark:'', reimStatus:'已通过', createdAt:'${now}' },
      { id:'v2', company:'普利美', invoiceNumber:'INV-002', invoiceType:'增值税普通发票', invoiceDate:'2026-09-12', supplier:'丁一钢铁', buyerName:'普利美', itemName:'钢板', netAmount:0, taxRate:'', taxAmount:0, amount:5000, contractNumber:'PO-2026-001', remark:'', reimStatus:'', createdAt:'${now}' }]));
    localStorage.setItem('pis_payments', JSON.stringify([]));
    localStorage.setItem('pis_suppliers', JSON.stringify([
      { id:'s1', supplierNumber:'SUP-001', supplierName:'丁一钢铁', contactPerson:'丁一', phoneNumber:'138', email:'', companyAddress:'', bankName:'', bankCode:'', bankAccount:'', remarks:'', createdAt:'${now}' }]));
    sessionStorage.setItem('pis_session', JSON.stringify(users.find(u => u.id === '${asUser}')));
  `;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/api/payments/external', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, invoices: [], records: [] }) }));

  await page.addInitScript(seed('u_admin'));
  await page.goto(BASE + 'invoice.html', { waitUntil: 'load' });
  await page.waitForSelector('#invMore', { timeout: 8000 });
  await page.click('#invMore');
  await page.waitForTimeout(300);
  await page.screenshot({ path: DIR + '/_shot_r9_admin_menu.png' });

  await page.addInitScript(seed('u_inv_r'));
  await page.goto(BASE + 'invoice.html', { waitUntil: 'load' });
  await page.waitForSelector('#invMore', { timeout: 8000 });
  await page.click('#invMore');
  await page.waitForTimeout(300);
  await page.screenshot({ path: DIR + '/_shot_r9_readonly_menu.png' });

  await browser.close();
  console.log('截图完成');
})().catch(e => { console.error(e); process.exit(1); });
