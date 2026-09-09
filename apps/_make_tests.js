const fs = require('fs');
const root = 'c:/Users/MI/Downloads/Onlineofficework/apps/';

// 1) regenerate stubbed sync from the FIXED supabase-sync.js
let s = fs.readFileSync(root + 'supabase-sync.js', 'utf8');
if (/defineKeyAccessor|ensureAccessorsForKeys|accessorDefined|nativeStorage/.test(s)) throw new Error('accessor refs remain in main file!');
const start = s.indexOf('function loadSupabase()');
const end = s.indexOf('// ===== 匿名登录');
if (start < 0 || end < 0 || end <= start) throw new Error('stub markers not found');
s = s.slice(0, start) + 'function loadSupabase() { return Promise.resolve(null); } // STUBBED for local diagnosis\n\n  ' + s.slice(end);
fs.writeFileSync(root + '_test-sync.js', s);
console.log('_test-sync.js regenerated');

// 2) regenerate purchase test copy from UPDATED index.html
let p = fs.readFileSync(root + 'purchase/index.html', 'utf8');
p = p.replace('src="../supabase-sync.js?v=20260909b"', 'src="../_test-sync.js"');
if (p.includes('../supabase-sync.js')) throw new Error('purchase test copy still references real sync');
fs.writeFileSync(root + 'purchase/_test_purchase.html', p);
console.log('_test_purchase.html regenerated');

// 3) wicketorders test copy
let w = fs.readFileSync(root + 'wicketorders/index.html', 'utf8');
w = w.replace('src="../supabase-sync.js?v=20260909b"', 'src="../_test-sync.js"');
if (w.includes('../supabase-sync.js?v=')) throw new Error('wicket test copy still references real sync');
fs.writeFileSync(root + 'wicketorders/_test_wickets.html', w);
console.log('_test_wickets.html regenerated');

// 4) stainlessbusiness test copy
let sb = fs.readFileSync(root + 'stainlessbusiness/index.html', 'utf8');
sb = sb.replace('src="./supabase-sync.js?v=20260909b"', 'src="../_test-sync.js"');
fs.writeFileSync(root + 'stainlessbusiness/_test_sb.html', sb);
console.log('_test_sb.html regenerated');
