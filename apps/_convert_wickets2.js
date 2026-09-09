const fs = require('fs');
const files = [
  'c:/Users/MI/Downloads/Onlineofficework/apps/wicketorders/delivery_notice.html',
  'c:/Users/MI/Downloads/Onlineofficework/apps/wicketorders/customs-doc-generator.html'
];
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const k of ['orderRecords', 'orderLabelsData']) {
    const r = 'localStorage.' + k + " || '[]'";
    let c = 0, idx = 0;
    while ((idx = s.indexOf(r, idx)) !== -1) { c++; idx += r.length; }
    if (c > 0) { s = s.split(r).join("localStorage.getItem('" + k + "') || '[]'"); n += c; }
  }
  fs.writeFileSync(f, s);
  console.log(f.split('/').pop(), '->', n, 'replacements');
}
