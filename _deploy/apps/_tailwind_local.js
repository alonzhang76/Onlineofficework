const fs = require('fs');
fs.copyFileSync(
  'c:/Users/MI/Downloads/Onlineofficework/apps/wicketorders/tailwindcss.js',
  'c:/Users/MI/Downloads/Onlineofficework/apps/purchase/tailwindcss.js'
);
console.log('copied tailwindcss.js to purchase/');
const files = ['invoice list.html', 'contract-inventory.html', 'index.html', '对账单.html', 'procurement contract.html', 'ply box.html', '收支表.html', '普票登记系统.html'];
let total = 0;
for (const f of files) {
  const fp = 'c:/Users/MI/Downloads/Onlineofficework/apps/purchase/' + f;
  let s = fs.readFileSync(fp, 'utf8');
  const from = '<script src="https://cdn.tailwindcss.com"></script>';
  const to = '<script src="tailwindcss.js?v=20260909b"></script>';
  if (s.includes(from)) { s = s.split(from).join(to); fs.writeFileSync(fp, s); total++; }
  else console.log('PATTERN MISS:', f);
}
console.log('pages updated:', total);
