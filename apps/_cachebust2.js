const fs = require('fs');
const f = 'c:/Users/MI/Downloads/Onlineofficework/apps/stainlessbusiness/index.html';
let s = fs.readFileSync(f, 'utf8');
const from = 'src="./supabase-sync.js"';
const to = 'src="./supabase-sync.js?v=20260909b"';
if (s.includes(from)) {
  s = s.split(from).join(to);
  fs.writeFileSync(f, s);
  console.log('updated OK');
} else if (s.includes(to)) {
  console.log('already updated');
} else {
  console.log('PATTERN NOT FOUND');
}
