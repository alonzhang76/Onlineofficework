const fs = require('fs');
const path = require('path');
const root = 'c:/Users/MI/Downloads/Onlineofficework/apps';
const VER = 'v=20260909b';
const files = [
  'purchase/contract-inventory.html',
  'purchase/invoice.html',
  'purchase/index.html',
  'purchase/invoice list.html',
  'purchase/procurement contract.html',
  'purchase/对账单.html',
  'purchase/收支表.html',
  'purchase/普票登记系统.html',
  'purchase/ply box.html',
  'wicketorders/delivery_notice.html',
  'wicketorders/customs-doc-generator.html',
  'wicketorders/index.html',
  'wicketorders/merged_order_labels.html',
  'wicketorders/销售合同.html',
  'wicketorders/生产通知单.html',
  'wicketorders/正式报价单模板.html',
  'wicketorders/报价系统.html',
  'wicketorders/发票.html',
  'wicketorders/shipment-detail.html',
  'orderschedule/index.html'
];
// stainlessbusiness references its local copy
const sbDir = path.join(root, 'stainlessbusiness');
const sbFiles = fs.readdirSync(sbDir).filter(f => f.endsWith('.html'));
for (const f of sbFiles) files.push('stainlessbusiness/' + f);

let total = 0;
for (const rel of files) {
  const fp = path.join(root, rel);
  let s;
  try { s = fs.readFileSync(fp, 'utf8'); } catch (e) { console.log('SKIP', rel); continue; }
  let n = 0;
  s = s.replace(/src="(\.\.\/)?supabase-sync\.js(\?[^"]*)?"/g, (m, p1) => {
    n++;
    return 'src="' + (p1 || '') + 'supabase-sync.js?' + VER + '"';
  });
  if (n > 0) { fs.writeFileSync(fp, s); total += n; console.log(rel, '->', n); }
}
console.log('total cache-bust updates:', total);
