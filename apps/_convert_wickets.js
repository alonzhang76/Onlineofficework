const fs = require('fs');
const f = 'c:/Users/MI/Downloads/Onlineofficework/apps/wicketorders/index.html';
let s = fs.readFileSync(f, 'utf8');
const keys = ['orderRecords', 'customerRecords', 'exportRecords', 'invoiceRecords', 'receiptRecords', 'indexPaymentRecords', 'memoRecords', 'orderLabelsData'];
let n = 0;

// writes -> setItem
for (const k of keys) {
  const srcKey = k === 'indexPaymentRecords' ? 'paymentRecords' : k;
  const w = 'localStorage.' + k + ' = JSON.stringify(data.data.' + srcKey + ' || []);';
  if (s.includes(w)) {
    s = s.split(w).join("localStorage.setItem('" + k + "', JSON.stringify(data.data." + srcKey + " || []));");
    n++;
  }
}
const w2 = 'localStorage.invoiceRecords = JSON.stringify(records);';
if (s.includes(w2)) { s = s.split(w2).join("localStorage.setItem('invoiceRecords', JSON.stringify(records));"); n++; }

// reads -> getItem
for (const k of keys) {
  const r = 'localStorage.' + k + " || '[]'";
  let c = 0, idx = 0;
  while ((idx = s.indexOf(r, idx)) !== -1) { c++; idx += r.length; }
  if (c > 0) { s = s.split(r).join("localStorage.getItem('" + k + "') || '[]'"); n += c; }
}
fs.writeFileSync(f, s);
console.log('replacements applied:', n);

// verify no property-style access remains for these keys
const bad = [];
for (const k of keys) {
  if (new RegExp('localStorage\\.' + k + '\\s*=[^=]').test(s)) bad.push(k + ':write');
  if (s.indexOf("localStorage." + k + " || '[]'") !== -1) bad.push(k + ':read');
}
console.log('remaining property-style:', bad.length ? bad.join(',') : 'NONE');
