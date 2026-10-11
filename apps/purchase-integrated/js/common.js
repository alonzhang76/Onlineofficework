/* ==========================================================
   采购一体化系统 · 公共脚本（多模块版）
   数据层：本地 localStorage（键前缀 pis_），预留腾讯 CloudBase 适配层
   各模块页引入顺序：js/common.js → js/auth-guard.js → 页面脚本 → initPage(...)
   ========================================================== */
'use strict';

/* ---------- 双R徽标（SVG symbol 注入，所有页面共用） ---------- */
(function () {
  var wrap = document.createElement('div');
  wrap.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="rrlogo" viewBox="0 0 48 48">' +
    '<text x="4" y="34" font-family="Georgia,Times New Roman,serif" font-size="30" font-weight="700" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1">R</text>' +
    '<text x="17" y="40" font-family="Georgia,Times New Roman,serif" font-size="30" font-weight="700" fill="#ffffff">R</text>' +
    '</symbol></svg>';
  document.body.insertBefore(wrap.firstChild, document.body.firstChild);
})();

/* ---------- 小工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const pad2 = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney = n => '¥' + (Math.round((+n || 0) * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = n => (+n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
const fmtDate = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const splitMulti = s => String(s || '').split(/[，,、;；\s]+/).map(x => x.trim()).filter(Boolean);
function toast(msg, type) {
  const box = $('#toastBox'); if (!box) return;
  const el = document.createElement('div');
  el.className = type === 'ok' ? 't-ok' : type === 'err' ? 't-err' : 't-info';
  el.textContent = msg; box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
}
/* 需方消息弹窗（供应商在发货管理「查看消息」/ 登录后自动提示）：
   展示采购员对某条发货单的确认结果与差异反馈，点击「我知道了」视为回执，之后不再提示该条。 */
function showSupplierMsg(rec) {
  if (!rec) return;
  const o = contractByNo(rec.contractNumber);
  const st = deriveShipStatus(rec);
  const done = confirmedQtyOfShip(rec);
  const diff = (+rec.quantity || 0) - done;
  const ok = st === SHIP_CONFIRMED;
  const rows = Data.list('receipts').filter(x => x.company === rec.company && x.contractNumber === rec.contractNumber && x.product === rec.product && x.shipNumber === rec.shipNumber);
  const head = ok ? '需方已确认收货' : st === SHIP_PARTIAL ? '需方已确认部分到货' : '需方尚未确认到货';
  const cls = ok ? 'b-green' : st === SHIP_PARTIAL ? 'b-amber' : 'b-gray';
  openModal('<h3>需方收货消息 · ' + esc(rec.shipNumber) + '</h3>' +
    '<div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
    '<div class="stat-card"><div class="l">本次发货</div><div class="v">' + fmtNum(rec.quantity) + '</div><div class="s">' + esc(rec.product || '') + ' · ' + esc(rec.shipDate || '') + '</div></div>' +
    '<div class="stat-card hl"><div class="l">实收确认</div><div class="v">' + fmtNum(done) + '</div><div class="s">合同 ' + esc(rec.contractNumber) + '</div></div>' +
    '<div class="stat-card ' + (ok ? 'good' : diff > 0 ? 'warn' : 'bad') + '"><div class="l">差异</div><div class="v">' + (diff > 0 ? fmtNum(diff) : '0') + '</div><div class="s">发货 − 实收</div></div></div>' +
    '<div class="swal-msg"><span class="badge ' + cls + '">' + head + '</span>' +
    (ok ? '<p>本次发货已全部收讫，无需其他操作。</p>' : st === SHIP_PARTIAL ? '<p>需方已确认收货 <b>' + fmtNum(done) + '</b>，尚有 <b>' + fmtNum(Math.max(0, diff)) + '</b> 待收，请按需方要求安排后续补发。</p>' : '<p>需方正在核对，请耐心等待确认结果。</p>') +
    (rec.receiveRemark ? '<p class="swal-note">需方反馈：' + esc(rec.receiveRemark) + '</p>' : '') +
    (o ? '<p class="swal-sub">合同总额 ' + fmtMoney(o.totalAmount) + '（如收货数量与合同有差异，需方会同步调整合同数量与金额）</p>' : '') +
    '</div>' +
    '<div class="tbl-wrap"><table><thead><tr><th>收货单号</th><th class="num">实收数量</th><th>收货日期</th><th>收货人</th><th>备注</th></tr></thead><tbody>' +
    (rows.length ? rows.map(x => '<tr><td class="mono">' + esc(x.receiptNumber) + '</td><td class="num"><b>' + fmtNum(x.quantity) + '</b></td><td>' + esc(x.receiptDate || '') + '</td><td>' + esc(x.person || '') + '</td><td class="subtle">' + esc(x.remark || '') + '</td></tr>').join('')
      : '<tr><td colspan="5" class="empty">需方尚未确认收货</td></tr>') +
    '</tbody></table></div>' +
    '<div class="modal-foot"><button type="button" class="btn btn-outline" onclick="closeModal()">关闭</button><button type="button" class="btn btn-primary" id="supMsgOk">我知道了</button></div>', 'wide');
  const rcOk = $('#supMsgOk');
  if (rcOk) rcOk.addEventListener('click', () => { markSupplierRead(rec); closeModal(); toast('已标记为已读', 'ok'); if (window.__supplierMsgTick) window.__supplierMsgTick(); });
}
/* 供应商已读回执：成功后不再自动弹出，可随时在「需方消息」中再次查看 */
function markSupplierRead(rec) {
  if (!rec) return;
  Data.update('shipments', rec.id, { supplierReadAt: new Date().toISOString() });
}
/* 待供应商查看的需方消息（登录后自动提示用）：已确认有回执 / 待确认 / 需方有反馈 */
function unreadShipMsgs() {
  const now = Date.now();
  return Data.list('shipments').filter(r => !r.supplierReadAt).filter(r =>
    deriveShipStatus(r) !== SHIP_PENDING || r.receiveRemark ||
    (r.receivedAt && now - new Date(r.receivedAt).getTime() < 30 * 864e5)); // 近 30 天内确认过的视为新消息
}
function nextNo(prefix) {
  const d = new Date(); const ds = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  const key = 'seq_' + prefix + '_' + ds; const n = (+DB.get(key, 0)) + 1; DB.set(key, n);
  return prefix + ds + '-' + String(n).padStart(3, '0');
}
// 预览单号：不消耗序号，仅在业务保存成功后按需 DB.set(key, n) 落号（避免取消表单也消耗序号）
function peekNo(prefix) {
  const d = new Date(); const ds = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  const key = 'seq_' + prefix + '_' + ds; const n = (+DB.get(key, 0)) + 1;
  return { no: prefix + ds + '-' + String(n).padStart(3, '0'), key, n };
}
/* 金额转人民币大写 */
function moneyCn(n) {
  n = Math.round((+n || 0) * 100) / 100;
  if (n === 0) return '零元整';
  const digits = '零壹贰叁肆伍陆柒捌玖', units = ['', '拾', '佰', '仟'], bigs = ['', '万', '亿', '兆'];
  let [intPart, decPart] = n.toFixed(2).split('.');
  let out = '';
  if (+intPart > 0) {
    const intDigits = intPart.split('').map(Number);
    const groups = []; for (let i = intDigits.length; i > 0; i -= 4) groups.unshift(intDigits.slice(Math.max(0, i - 4), i));
    groups.forEach((g, gi) => {
      let gs = ''; const gz = g.reduce((s, v) => s + v, 0) === 0;
      if (gz) { if (out && !out.endsWith('零') && gi < groups.length - 1) out += '零'; return; }
      g.forEach((v, i) => {
        const pos = g.length - 1 - i;
        if (v === 0) { if (!gs.endsWith('零') && i < g.length - 1) gs += '零'; }
        else gs += digits[v] + units[pos];
      });
      gs = gs.replace(/零+$/, '');
      out += gs + bigs[groups.length - 1 - gi];
    });
    out = out.replace(/零+/g, '零').replace(/零+$/, '') + '元';
  }
  const jiao = +decPart[0], fen = +decPart[1];
  if (jiao === 0 && fen === 0) return out + '整';
  if (+intPart === 0) { // 纯角分：0.05 → 伍分，0.50 → 伍角，0.55 → 伍角伍分
    let r = '';
    if (jiao > 0) r += digits[jiao] + '角';
    if (fen > 0) r += digits[fen] + '分';
    return r;
  }
  if (jiao > 0) out += digits[jiao] + '角';
  else if (fen > 0) out += '零';
  if (fen > 0) out += digits[fen] + '分'; else out += '整';
  return out;
}

/* ---------- 数据层（本地 localStorage + 云端自动同步） ---------- */
/* 云端同步由页面引入的 ../cloudbase-sync.js 完成（与其它应用同一套机制）：
   拦截 localStorage 读写，业务数据写入后自动防抖上传、定时从云端拉取，
   页面顶端 cloudbase-admin.js 工具条提供手动保存/下载/备份/恢复。
   业务代码只经 DB/Data 层，不直接感知云端。 */
const DB = {
  prefix: 'pis_',
  get(k, d) { try { const v = localStorage.getItem(this.prefix + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(this.prefix + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(this.prefix + k); },
  snapshot() {
    const out = {}; const p = this.prefix;
    // reim_api 为本机接口地址、reim_cache 为报销侧派生缓存：均不进备份/恢复
    const SKIP = ['reim_api', 'reim_cache'];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p) && SKIP.indexOf(k.slice(p.length)) < 0) out[k.slice(p.length)] = localStorage.getItem(k);
    }
    return { app: 'purchase-integrated', version: 2, exportedAt: new Date().toISOString(), data: out };
  },
  restore(snap) {
    if (!snap || !snap.data) throw new Error('备份文件格式不正确');
    Object.keys(snap.data).forEach(k => localStorage.setItem(this.prefix + k, snap.data[k]));
  },
  clearBiz() { // 清空业务数据（保留用户/角色/公司）
    ['orders','shipments','receipts','returns','invoices','payments','suppliers','tool_records']
      .forEach(c => this.del(c));
    Object.keys(localStorage).filter(k => k.startsWith(this.prefix + 'seq_')).forEach(k => localStorage.removeItem(k));
  }
};

/* ---------- 集合与状态 ---------- */
const COLLS = { orders: '采购合同', shipments: '发货记录', receipts: '收货记录', returns: '退货记录', invoices: '发票', payments: '付款记录', suppliers: '供应商' };
const State = { company: '普利美', page: 'dashboard', receiveTab: 'pending', adminTab: 'user', reconTab: 'ledger' };
const ALL_COMPANIES = '__all__'; // 公司主体筛选哨兵：全部公司（仅用于查看，不可作为数据归属）

/* ---------- 页面定义（key 即模块页文件名） ---------- */
const PAGES = [
  { key: 'dashboard', name: '工作台',   group: '概览',     ico: '⌂' },
  { key: 'purchase',  name: '采购管理', group: '业务流程', ico: '▤' },
  { key: 'ship',      name: '发货管理', group: '业务流程', ico: '⇨' },
  { key: 'receive',   name: '收货管理', group: '业务流程', ico: '⇩' },
  { key: 'invoice',   name: '开票管理', group: '业务流程', ico: '⎘' },
  { key: 'payment',   name: '付款管理', group: '业务流程', ico: '¥' },
  { key: 'recon',     name: '对账管理', group: '业务流程', ico: '⇌' },
  { key: 'suppliers', name: '供应商管理', group: '基础数据', ico: '◈' },
  { key: 'reports',   name: '数据统计', group: '分析与工具', ico: '▟' },
  { key: 'tools',     name: '工具箱',   group: '分析与工具', ico: '⚙' },
  { key: 'admin',     name: '系统管理', group: '系统',     ico: '☰', adminOnly: true }
];

/* ---------- 默认数据 ---------- */
const DEFAULT_COMPANIES = [
  { code: '普利美', name: '普利美（常州）环境工程科技有限公司' },
  { code: '龙力', name: '无锡龙力印铁设备制造有限公司' }
];
const DEFAULT_PAGES_PERM = PAGES.map(p => p.key);
/* 角色权限三态：'rw' 读写 / 'r' 只读 / 'none' 不显示（兼容旧布尔，读取时归一化） */
const DEFAULT_ROLES = [
  { id: 'role_admin', key: 'admin', name: '管理员', locked: true, permissions: Object.fromEntries(DEFAULT_PAGES_PERM.map(k => [k, 'rw'])) },
  { id: 'role_purchaser', key: 'purchaser', name: '采购员', locked: false,
    permissions: Object.fromEntries(DEFAULT_PAGES_PERM.map(k => [k, ['dashboard','purchase','ship','receive','suppliers','reports','tools'].includes(k) ? 'rw' : 'none'])) },
  { id: 'role_warehouse', key: 'warehouse', name: '仓管员', locked: false,
    permissions: Object.fromEntries(DEFAULT_PAGES_PERM.map(k => [k, ['dashboard','ship','receive','reports','tools'].includes(k) ? 'rw' : 'none'])) },
  { id: 'role_finance', key: 'finance', name: '财务人员', locked: false,
    permissions: Object.fromEntries(DEFAULT_PAGES_PERM.map(k => [k, ['dashboard','invoice','payment','recon','reports','tools'].includes(k) ? 'rw' : 'none'])) },
  { id: 'role_supplier', key: 'supplier', name: '供应商', locked: true, supplierRole: true,
    permissions: Object.fromEntries(DEFAULT_PAGES_PERM.map(k => [k,
      k === 'ship' ? 'rw' : ['dashboard','purchase','receive','invoice','payment','recon'].includes(k) ? 'r' : 'none'])) }
];
const DEFAULT_UNITS = ['只', '卷', '箱', '吨', '公斤', '套', '个', '张', '米'];
const DEFAULT_CATEGORIES = ['包装箱费用', '包装材料', '原材料', '辅助材料', '易耗品材料', '贸易往来', '贸易产品', '固定资产'];
const DEFAULT_TERMS = [
  '交货方式：供方送货至需方指定地点，运费由供方承担。',
  '验收标准：货到后需方按合同约定数量及外观验收，如有异议应于收货后三日内书面提出。',
  '结算方式：供方凭增值税发票及需方签收单结算，票到账期30天。',
  '质量要求：产品应符合国家标准、行业标准及双方确认的样品要求，因质量问题产生的损失由供方承担。',
  '本合同一式两份，双方各执一份，经双方签字盖章后生效，传真件具有同等法律效力。'
];

/* 种子闸门：云端首拉落定前禁止写默认数据。
   否则新设备打开时 seed 的默认 admin/角色/公司时间戳比云端新：
   ① processCloudRows 的 LWW 保护会挡住云端真实数据落地；
   ② 默认值还会经上传队列无版本保护地 upsert 覆盖云端（全量用户被清成 admin）。
   登录页（PIS_NO_AUTO_SEED）自行在云端确认空租户后调用 PIS_bootstrapSeed。 */
const SeedGate = { blocked: !!window.PIS_NO_AUTO_SEED };
function seed() {
  if (SeedGate.blocked) return;
  if (!DB.get('companies', null)) DB.set('companies', DEFAULT_COMPANIES);
  if (!DB.get('units', null)) DB.set('units', DEFAULT_UNITS);
  if (!DB.get('terms', null)) DB.set('terms', DEFAULT_TERMS);
  if (!DB.get('roles', null)) DB.set('roles', DEFAULT_ROLES);
  if (!DB.get('users', null)) {
    DB.set('users', [{ id: uid(), username: 'admin', pwd: 'seed:admin123', name: '系统管理员', role: 'admin', supplierName: '', active: true, createdAt: new Date().toISOString() }]);
  }
  if (!DB.get('suppliers', null)) DB.set('suppliers', []);
}
/* 云端就绪后：仅当云端未带来任何用户数据（全新租户首台设备）时才播种；
   云端已有数据则一切以云端为准。20 秒超时为离线/异常兜底（此时本机无数据才播种）。 */
(function installSeedGate() {
  if (window.PIS_NO_AUTO_SEED) {
    window.PIS_bootstrapSeed = function () { SeedGate.blocked = false; seed(); };
    return;
  }
  if (typeof window.CloudbaseSync === 'undefined') return; // 无同步层：直接 seed
  SeedGate.blocked = true;
  let done = false;
  const release = () => {
    if (done) return; done = true; SeedGate.blocked = false;
    if (DB.get('users', null) == null) seed();
  };
  window.addEventListener('cloud-data-updated', e => {
    if (e && e.detail && e.detail.initial) release();
  });
  setTimeout(release, 20000);
})();

/* ---------- 密码 ----------
   哈希策略：
     s1: 前缀 = SHA-256（crypto.subtle，仅安全上下文 HTTPS/localhost/file 可用）
     f1: 前缀 = 自定义回退哈希（非安全上下文 HTTP 下使用）
   ⚠️ 同一密码在不同安全上下文下 hashPwd 返回值不同，直接用 === 比较会导致
      「HTTPS 下设的密码，HTTP 下登录失败」或反之。因此验证密码必须用 verifyPwd，
      它同时计算两种哈希并逐一比对，确保跨环境兼容。 */
function _pwdSalted(pwd) { return 'pis::' + pwd; }
/* 纯 JS SHA-256（不依赖 crypto.subtle，非安全上下文 HTTP 下也能算 s1: 哈希） */
function _sha256Bytes(bytes) {
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function rotr(n,x){return (x>>>n)|(x<<(32-n));}
  var data = Array.from(bytes); var bitLen = data.length * 8;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  // 64 位大端长度（JS >>> 移位量会取模32，必须拆成高/低 32 位分别取字节）
  var lo = bitLen >>> 0;
  var hi = (bitLen - lo) / 0x100000000; // 高 32 位（短消息为 0）
  data.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  data.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
  for (var off = 0; off < data.length; off += 64) {
    var w = new Array(64);
    for (var t = 0; t < 16; t++)
      w[t] = (data[off+t*4]<<24)|(data[off+t*4+1]<<16)|(data[off+t*4+2]<<8)|data[off+t*4+3];
    for (var t = 16; t < 64; t++) {
      var s0 = rotr(7,w[t-15])^rotr(18,w[t-15])^(w[t-15]>>>3);
      var s1 = rotr(17,w[t-2])^rotr(19,w[t-2])^(w[t-2]>>>10);
      w[t] = (w[t-16]+s0+w[t-7]+s1)>>>0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (var t = 0; t < 64; t++) {
      var S1 = rotr(6,e)^rotr(11,e)^rotr(25,e);
      var ch = (e&f)^(~e&g);
      var t1 = (h+S1+ch+K[t]+w[t])>>>0;
      var S0 = rotr(2,a)^rotr(13,a)^rotr(22,a);
      var maj = (a&b)^(a&c)^(b&c);
      var t2 = (S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  var hex = '';
  for (var i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8,'0');
  return hex;
}
async function _hashS1(pwd) { // SHA-256（安全上下文用 crypto.subtle，否则纯JS回退）
  try {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(_pwdSalted(pwd)));
      return 's1:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* 回退纯JS */ }
  // 非安全上下文（HTTP/IP访问）：crypto.subtle 不可用，用纯JS SHA-256 兜底
  try { return 's1:' + _sha256Bytes(new TextEncoder().encode(_pwdSalted(pwd))); }
  catch (e) { return null; }
}
function _hashF1(pwd) { // 自定义回退哈希（任意环境）
  const salted = _pwdSalted(pwd);
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < salted.length; i++) { const c = salted.charCodeAt(i); h1 = ((h1 << 5) + h1 + c) >>> 0; h2 = ((h2 << 5) + h2 ^ c) >>> 0; }
  return 'f1:' + h1.toString(16) + '-' + h2.toString(16);
}
async function hashPwd(pwd) {
  // 设置密码时优先用 s1（更强），不可用时回退 f1
  const s1 = await _hashS1(pwd);
  return s1 || _hashF1(pwd);
}
/* 验证密码：同时尝试 s1 和 f1 两种哈希，匹配任一即通过（跨安全上下文兼容） */
async function verifyPwd(pwd, stored) {
  if (!stored) return false;
  if (stored === 'seed:admin123') return pwd === 'admin123'; // 种子明文兜底
  const s1 = await _hashS1(pwd);
  if (s1 && stored === s1) return true;
  return stored === _hashF1(pwd);
}
async function ensureAdminHash() { // 把种子密码升级为哈希
  const users = DB.get('users', []);
  const admin = users.find(u => u.username && u.username.toLowerCase() === 'admin');
  if (admin && admin.pwd === 'seed:admin123') { admin.pwd = await hashPwd('admin123'); DB.set('users', users); }
}

/* ---------- 会话与权限（三态：rw 读写 / r 只读 / none 不显示） ---------- */
const Session = {
  user: null,
  role() { return (DB.get('roles', []).find(r => r.key === (this.user && this.user.role)) || {}); },
  isSupplier() { const r = this.role(); return !!(r && r.supplierRole); },
  isAdmin() { return this.user && this.user.role === 'admin'; },
  /* 仅管理员与指定账号 alonzhang 可执行「从电脑恢复」，避免他人误覆盖数据 */
  canRestore() {
    const u = this.user;
    return !!u && (this.isAdmin() || !!(u.username && String(u.username).toLowerCase() === 'alonzhang'));
  },
  /* permOf：归一化为三态。兼容旧布尔权限（true→rw，false/undefined→none） */
  permOf(page) {
    if (!this.user) return 'none';
    if (this.isAdmin()) return 'rw';
    const v = (this.role().permissions || {})[page];
    if (v === 'rw' || v === true) return 'rw';
    if (v === 'r') return 'r';
    return 'none';
  },
  can(page) { return this.permOf(page) !== 'none'; },   // 可访问（菜单可见）；'不显示'的模块整个隐藏
  canWrite(page) {
    if (this.permOf(page) !== 'rw') return false;       // 只读角色不能新增/编辑/删除/导入/清空
    if (this.isSupplier()) return page === 'ship' || page === 'invoice'; // 供应商：发货 + 发票录入可写
    return true;
  },
  mySupplier() { return this.isSupplier() ? this.user.supplierName : ''; },
  /* ---------- 记录修改权（防推责）----------
     管理员可修改/删除全部记录；其他内部账号只能修改/删除自己创建的记录
     （createdBy 由 Data.add 自动落标）。供应商数据本就按名下隔离，不受影响。
     历史旧数据无经办人标记的保持可编辑，但任何修改都会落 updatedBy 留痕。 */
  canTouchRec(rec) {
    const u = this.user;
    if (!u) return false;
    if (this.isAdmin() || this.isSupplier()) return true;
    if (!rec || rec.createdBy == null) return true; // 旧数据无经办人标记：放开（修改有 updatedBy 留痕）
    return rec.createdBy === u.username;
  },
  /* 带提示的校验：不可改时 toast 并返回 false（编辑/删除入口统一调用） */
  guardTouch(rec, label) {
    if (this.canTouchRec(rec)) return true;
    const nm = (rec && (rec.createdByName || rec.createdBy)) || '其他经办人';
    toast((label || '该记录') + '由「' + nm + '」创建，仅创建人或管理员可修改 / 删除', 'err');
    return false;
  }
};
function saveSession() { sessionStorage.setItem('pis_session', JSON.stringify(Session.user)); }
function loadSession() { try { Session.user = JSON.parse(sessionStorage.getItem('pis_session') || 'null'); } catch (e) { Session.user = null; } }

/* ---------- 数据访问（含公司过滤 + 供应商隔离） ---------- */
const Data = {
  GLOBAL_COLS: ['suppliers'],
  list(coll) {
    let arr = DB.get(coll, []); if (!Array.isArray(arr)) arr = [];
    if (this.GLOBAL_COLS.indexOf(coll) < 0 && !Session.isSupplier()) {
      if (State.company !== ALL_COMPANIES) arr = arr.filter(r => !r.company || r.company === State.company); // 全部公司视图：不按主体过滤
    }
    if (Session.isSupplier()) {
      const me = Session.mySupplier();
      if (this.GLOBAL_COLS.indexOf(coll) < 0) arr = arr.filter(r => r.supplier === me);
      else arr = arr.filter(r => r.supplierName === me); // 供应商只见自己的档案
    }
    return arr;
  },
  all(coll) { let arr = DB.get(coll, []); return Array.isArray(arr) ? arr : []; },
  /* 经办人自动落标：新增/修改时记录当前登录人，用于区分多个采购员（及仓管/财务/供应商）的操作 */
  stamp(rec, mode) {
    const u = Session.user; if (!u || !rec) return;
    if (mode !== 'update') { rec.createdBy = u.username; rec.createdByName = u.name || u.username; }
    rec.updatedBy = u.username; rec.updatedByName = u.name || u.username;
  },
  add(coll, rec) { this.stamp(rec, 'add'); const arr = DB.get(coll, []); arr.unshift(rec); DB.set(coll, arr); if (window.NC) NC.onAdd(coll, rec); },
  update(coll, id, patch) { this.stamp(patch, 'update'); const arr = DB.get(coll, []); const i = arr.findIndex(r => r.id === id); if (i > -1) { Object.assign(arr[i], patch, { updatedAt: new Date().toISOString() }); DB.set(coll, arr); } },
  remove(coll, id) { DB.set(coll, DB.get(coll, []).filter(r => r.id !== id)); }
};
/* 经办人色标：按用户名稳定取色（同一人永远同色，多人一眼区分） */
function userHue(s) { const str = String(s || 'x'); let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
/* 小号头像徽标（表格/弹窗内嵌用）：圆形底色 + 姓名首字 */
function opBadgeHTML(name, extra) {
  const nm = String(name || '').trim(); if (!nm) return '<span class="subtle">—</span>';
  const hue = userHue(nm);
  return '<span class="op-badge" title="' + esc(nm) + (extra ? ' · ' + esc(extra) : '') + '"><i style="background:hsl(' + hue + ',62%,44%)">' + esc(nm.charAt(0)) + '</i>' + esc(nm) + '</span>';
}
const getCompany = code => { const c = (DB.get('companies', []).find(x => x.code === code) || {}); return c.name || code; };
// 当前公司兜底：全部公司视图下的写入操作回落到第一家公司（哨兵值绝不能写入数据）
const curCo = () => {
  if (State.company !== ALL_COMPANIES) {
    const c = DB.get('companies', []).find(x => x.code === State.company);
    if (c) return c.code;
  }
  const first = DB.get('companies', [])[0];
  return first ? first.code : State.company;
};
// 当前公司显示名：全部公司视图显示"全部公司"
const curCoName = () => State.company === ALL_COMPANIES ? '全部公司' : getCompany(State.company);

/* ---------- 报销系统数据桥（只读，付款/审核状态唯一数据源） ----------
   付款登记统一在 reimbursement-system 完成；本系统已无本地付款写入点，
   台账 / 对账 / 工作台 / 统计的付款金额、付款日期、发票审核状态均取自报销侧。
   取数顺序（不依赖某一台电脑开着服务）：
   ① 云端直连（首选）：报销系统的正式数据就在 CloudBase app_data_store
      （reim_invoices / reim_review_log 行），复用本页 cloudbase-sync 的共享
      账号登录态，任何电脑 / 任何浏览器联网即可查询，供应商也能自助查自己的数据；
   ② 本机报销系统服务（兜底）：GET {pis_reim_api}/api/payments/external
      （令牌 purchase-link-2026），供云端不可达时降级。
   - 接口地址存本机 pis_reim_api、快照存 pis_reim_cache（均不参与云端业务键同步）
   - 进入业务页时静默后台拉取，成功后派发 reim-pay-updated 触发非打断式重渲染
   - 首次渲染先读本机缓存，保证离线时仍能显示上次数据 */
const REIM_TOKEN = 'purchase-link-2026';
const REIM_TTL_MS = 30000; // 后台静默拉取节流：30 秒内不重复请求（手动刷新走 force）

/* ---------- 销售方 ↔ 供应商模糊匹配（与 invoice.html 发票录入同一口径） ----------
   归一化（去空白/标点/组织后缀）后：完全相等 > 双向包含 > 最长公共子串占比。
   common.js 不能依赖仅开票页加载的 PisPdf，故在此自带一份等价归一化。 */
function normOrgName(n) {
  return n ? String(n).replace(/[\s　()（）·、,，]/g, '').trim() : '';
}
function normSupplierKey(n) {
  return normOrgName(n).replace(/(有限责任公司|股份有限公司|有限公司|公司|厂|经营部|商行|店)$/, '');
}
function matchReimSupplier(sellerName, sups) {
  const target = normSupplierKey(sellerName);
  if (!target) return null;
  let best = null, bestScore = 0;
  (sups || DB.get('suppliers', [])).forEach(s => {
    const n = normSupplierKey(s && s.supplierName);
    if (!n) return;
    let score = 0;
    if (n === target) score = 1;
    else if (n.includes(target) || target.includes(n)) score = 0.8;
    else {
      /* 最长公共子串占比（至少 4 字，避免短词误配） */
      let max = 0;
      for (let i = 0; i < target.length; i++) {
        for (let j = i + 4; j <= target.length; j++) {
          const sub = target.slice(i, j);
          if (n.includes(sub) && sub.length > max) max = sub.length;
        }
      }
      if (max >= 4) score = Math.min(0.7, max / Math.max(target.length, n.length));
    }
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return bestScore >= 0.45 ? best : null;
}
/* 按报销侧购方名称推断本系统公司主体：全称相等 → 去标点包含 → 公司代号包含 → 首主体兜底 */
function companyOfReimBuyer(buyerName) {
  const comps = DB.get('companies', []);
  if (!comps.length) return (State.company && State.company !== ALL_COMPANIES) ? State.company : '';
  if (buyerName) {
    let hit = comps.find(c => c.name === buyerName);
    if (!hit) {
      const b = normOrgName(buyerName);
      hit = comps.find(c => {
        const cn = normOrgName(c.name);
        return cn === b || cn.includes(b) || b.includes(cn) || (c.code && b.includes(c.code));
      });
    }
    if (hit) return hit.code;
  }
  return comps[0].code;
}
function normReimInvoiceType(t) {
  t = t || '';
  if (/专用/.test(t)) return '增值税专用发票';
  if (/普通/.test(t)) return '增值税普通发票';
  return t || '其他发票';
}

const ReimPay = {
  data: null,
  inflight: null,
  lastOkAt: 0,
  source: null,   // 本次数据来源：'cloud'（报销系统云端）| 'local'（本机 Flask 服务）
  init() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem('pis_reim_cache') || 'null'); } catch (e) { this.data = null; }
    return this.data;
  },
  base() {
    return (localStorage.getItem('pis_reim_api') || 'http://127.0.0.1:8686').trim().replace(/\/+$/, '');
  },
  setBase(v) { localStorage.setItem('pis_reim_api', String(v || '').trim().replace(/\/+$/, '')); },
  raw() { return this.data; },
  invoices() { return (this.data && Array.isArray(this.data.invoices)) ? this.data.invoices : []; },
  records() { return (this.data && Array.isArray(this.data.records)) ? this.data.records : []; },
  submissions() { return (this.data && Array.isArray(this.data.submissions)) ? this.data.submissions : []; },
  // 无票付款记录（预付款/进度款/尾款/其他），来自报销系统云端 reim_payments
  payments() { return (this.data && Array.isArray(this.data.payments)) ? this.data.payments : []; },
  byNo(no) { return this.invoices().find(r => String(r.invoice_no) === String(no)) || null; },
  // 单张发票累计已付（与付款页统计口径一致：不超过票面金额）
  paidOfInvoice(no) {
    const r = this.byNo(no);
    return r ? Math.min(+(r.paid_amount) || 0, +(r.total_amount) || 0) : 0;
  },
  dateOfInvoice(no) { const r = this.byNo(no); return r ? (r.payment_date || '') : ''; },
  methodOfInvoice(no) { const r = this.byNo(no); return r ? (r.payment_method || '') : ''; },
  noteOfInvoice(no) { const r = this.byNo(no); return r ? (r.payment_note || '') : ''; },
  // 报销侧发票审核状态：待审核 / 已通过 / 已入账 / 已驳回（无记录返回 ''）
  auditStatusOfInvoice(no) {
    const s = this.submissions().find(x => String(x.invoice_no) === String(no));
    return s ? (s.status || '') : '';
  },
  // 合同已付：报销侧 project（合同号，支持一单多票分隔）或本地发票合同号命中
  paidOfContract(cno) {
    const localNo = new Map();
    Data.list('invoices').forEach(v => localNo.set(String(v.invoiceNumber), v.contractNumber || ''));
    let sum = this.invoices().reduce((s, r) => {
      const hit = splitMulti(r.project).includes(cno) ||
        splitMulti(localNo.get(String(r.invoice_no)) || '').includes(cno);
      return s + (hit ? Math.min(+(r.paid_amount) || 0, +(r.total_amount) || 0) : 0);
    }, 0);
    // 无票付款（预付款/进度款/尾款/其他）按 project（合同号）命中累加
    sum += this.payments().reduce((s, p) => {
      return splitMulti(p.project || '').includes(cno) ? s + (+(p.amount) || 0) : s;
    }, 0);
    return sum;
  },
  /* 已付款流水（采购侧旧 payments 记录形状）：以本地发票台账为基准关联，
     自动套用当前公司主体 / 供应商隔离；传 cno 时再追加报销侧 project 命中的票。
     报销侧每张票的 paid_amount 为累计已付，故一行 = 一张票的当前付款进度 */
  payRows(cno) {
    const out = [], seen = new Set();
    const push = (r, v) => {
      const no = r.invoice_no;
      if (seen.has(no)) return;
      seen.add(no);
      const paid = Math.min(+(r.paid_amount) || 0, +(r.total_amount) || 0);
      if (paid <= 0) return;
      out.push({
        supplier: (v && v.supplier) || r.seller_name || '',
        contractNumber: (v && v.contractNumber) || r.project || '',
        invoiceNumbers: no, paymentNumber: no,
        paymentDate: r.payment_date || '', method: r.payment_method || '',
        amount: paid, remark: r.payment_note || '',
        itemName: r.item_name || (v && v.itemName) || ''
      });
    };
    Data.list('invoices').forEach(v => {
      const r = this.byNo(v.invoiceNumber);
      if (!r) return;
      if (!cno || splitMulti(v.contractNumber).includes(cno) || splitMulti(r.project).includes(cno)) push(r, v);
    });
    if (cno) this.invoices().forEach(r => {
      if (!seen.has(r.invoice_no) && splitMulti(r.project).includes(cno)) push(r, null);
    });
    // 无票付款（预付款/进度款/尾款/其他）：按 project（合同号）命中
    if (cno) this.payments().forEach(p => {
      if (!splitMulti(p.project || '').includes(cno)) return;
      out.push({
        supplier: p.seller_name || '',
        contractNumber: p.project || '',
        invoiceNumbers: p.invoice_no || '',
        paymentNumber: '(无票)',
        paymentDate: p.payment_date || '', method: p.payment_method || '',
        amount: +(p.amount) || 0, remark: p.remark || '',
        itemName: p.stage || '无票付款', stage: p.stage || ''
      });
    });
    out.sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
    return out;
  },
  /* ===== 云端直连报销系统（首选数据源，任意电脑联网可查） =====
     报销前端（reimbursement-system/static）把发票 / 流转记录直接写在
     CloudBase app_data_store 的 reim_invoices / reim_review_log 行里。
     这里复用页面 cloudbase-sync.js 已引导好的共享账号登录态走 rdb REST，
     按行精确读取（store_key=eq.xxx），不把报销数据混入本应用同步缓存。 */
  async _cloudCtx(waitMs) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      if (typeof window.CloudbaseGetAccessToken === 'function' && window.CLOUDBASE_ENV) {
        if (typeof window.CloudbaseWhenReady === 'function') {
          await Promise.race([
            window.CloudbaseWhenReady(),
            new Promise(r => setTimeout(r, 15000))
          ]);
        }
        const token = await Promise.race([
          window.CloudbaseGetAccessToken(),
          new Promise(r => setTimeout(r, 15000, null))
        ]);
        if (token) return { env: window.CLOUDBASE_ENV, token: token };
      }
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error('云端登录态未就绪');
  },
  async _cloudRow(storeKey) {
    const ctx = await this._cloudCtx(20000);
    const url = 'https://' + ctx.env + '.api.tcloudbasegateway.com/v1/rdb/rest/app_data_store'
      + '?select=id,data&data-%3E%3Estore_key=eq.' + encodeURIComponent(storeKey);
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + ctx.token },
          signal: ctrl.signal,
          cache: 'no-store'
        });
        break;
      } catch (e) {
        if (attempt === 0 && /aborted|timeout/i.test(String(e && e.message || e))) continue;
        throw e;
      } finally { clearTimeout(timer); }
    }
    if (!res.ok) throw new Error('云端读取 HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    // 历史 upsert 可能留下同 store_key 多行：取 updated_at 最新者
    let best = null;
    rows.forEach(r => {
      const d = r && typeof r.data === 'object' ? r.data : null;
      if (!d) return;
      if (!best || String(d.updated_at || '') > String(best.updated_at || '')) best = d;
    });
    if (!best) return null;
    return best.payload !== undefined && best.payload !== null ? best.payload
      : (best.data !== undefined && best.data !== null ? best.data : null);
  },
  /* 云端行 → 与 Flask GET /api/payments/external 同构的 payload。
     口径与 reimbursement-system/app.py payments_external 完全一致：
       direction='进项' 且 total_amount 非空 且 settle='正常付款'
       且 status!='已驳回' 且 payee='销售方'
     records 额外要求 paid_amount 非空且 > 0。 */
  _buildCloudPayload(list, logs, pays) {
    const num = x => { const n = parseFloat(x); return isFinite(n) ? n : 0; };
    const hasNum = x => x !== null && x !== undefined && x !== '' && isFinite(parseFloat(x));
    const payInfo = (total, paid) => {
      const bal = Math.round((total - paid) * 100) / 100;
      if (paid <= 0.005) return { status: '未付款', balance: bal };
      if (bal > 0.005) return { status: '部分付款', balance: bal };
      return { status: '已付清', balance: 0 };
    };
    const all = Array.isArray(list) ? list : [];
    // 每张票最近一条非空审核意见（对应 SQL 子查询 last_comment）
    const commentMap = new Map();
    (Array.isArray(logs) ? logs : []).forEach(l => {
      if (!l || !l.invoice_id || !l.comment) return;
      const k = String(l.invoice_id);
      const prev = commentMap.get(k);
      if (!prev || String(l.created_at || '') > String(prev.created_at || '')) commentMap.set(k, l);
    });
    const base = all.filter(r => r && r.direction === '进项' && hasNum(r.total_amount) &&
      (r.settle || '正常付款') === '正常付款' && r.status !== '已驳回' &&
      (r.payee || '销售方') === '销售方');
    const decorate = r => {
      const d = Object.assign({}, r);
      ['amount', 'tax_amount', 'total_amount', 'paid_amount'].forEach(f => { d[f] = num(d[f]); });
      const pi = payInfo(d.total_amount, d.paid_amount);
      d.payment_status = pi.status;
      d.balance = pi.balance;
      return d;
    };
    const invRows = base
      .slice()
      .sort((a, b) => String(a.seller_name || '').localeCompare(String(b.seller_name || '')) ||
        String(b.invoice_date || '').localeCompare(String(a.invoice_date || '')) ||
        String(b.id || '').localeCompare(String(a.id || '')))
      .map(decorate);
    const recRows = base.filter(r => hasNum(r.paid_amount) && num(r.paid_amount) > 0)
      .slice()
      .sort((a, b) => String(b.payment_date || '').localeCompare(String(a.payment_date || '')) ||
        String(b.id || '').localeCompare(String(a.id || '')))
      .slice(0, 2000)
      .map(decorate);
    // 供应商分组（SQL GROUP BY seller_name ... ORDER BY t DESC）
    const gmap = {};
    base.forEach(r => {
      const name = r.seller_name || '';
      const g = gmap[name] || (gmap[name] = { seller_name: name, count: 0, total: 0, paid: 0, last_pay: '' });
      g.count++;
      g.total += num(r.total_amount);
      g.paid += num(r.paid_amount);
      if (String(r.payment_date || '') > String(g.last_pay || '')) g.last_pay = r.payment_date || '';
    });
    const groups = Object.values(gmap).map(g => ({
      seller_name: g.seller_name, count: g.count,
      total: Math.round(g.total * 100) / 100,
      paid: Math.round(g.paid * 100) / 100,
      owed: Math.round((g.total - g.paid) * 100) / 100,
      last_pay: g.last_pay || ''
    })).sort((a, b) => b.total - a.total);
    const totalN = groups.reduce((s, g) => s + g.count, 0);
    const totalT = groups.reduce((s, g) => s + g.total, 0);
    const totalP = groups.reduce((s, g) => s + g.paid, 0);
    // 审核状态回写源：云端每张票自带 status；驳回原因取最近一条非空意见
    const submissions = all.filter(r => r && r.id != null && r.invoice_no != null).map(r => {
      const l = commentMap.get(String(r.id));
      return {
        id: r.id, invoice_no: r.invoice_no, status: r.status || '',
        updated_at: r.updated_at || '', last_comment: l ? (l.comment || '') : ''
      };
    });
    const p2 = n => Math.round(n * 100) / 100;
    return {
      ok: true,
      generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      source: 'cloud',
      summary: { suppliers: groups.length, invoices: totalN, total: p2(totalT), paid: p2(totalP), owed: p2(totalT - totalP) },
      groups: groups,
      invoices: invRows,
      records: recRows,
      submissions: submissions,
      payments: (Array.isArray(pays) ? pays : []).map(p => ({
        id: p.id, stage: p.stage || '', amount: num(p.amount),
        payment_date: p.payment_date || '', payment_method: p.payment_method || '',
        seller_name: p.seller_name || '', project: p.project || '',
        invoice_no: p.invoice_no || '', payee: p.payee || '销售方',
        company_short: p.company_short || '', remark: p.remark || ''
      }))
    };
  },
  async loadFromCloud() {
    const [invs, logs, pays] = await Promise.all([
      this._cloudRow('reim_invoices'),
      this._cloudRow('reim_review_log'),
      this._cloudRow('reim_payments')
    ]);
    if (!Array.isArray(invs)) throw new Error('报销云端发票数据（reim_invoices）不可用');
    return this._buildCloudPayload(invs, Array.isArray(logs) ? logs : [], Array.isArray(pays) ? pays : []);
  },
  /* ===== 本机报销系统服务（兜底数据源） =====
     办公机启动 reimbursement-system/start.bat（Flask，默认 127.0.0.1:8686）时可用；
     8 秒快速失败，确保未启动服务的电脑立即转云端而不是长时间卡住。 */
  async loadFromHttp() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let resp;
    try {
      resp = await fetch(this.base() + '/api/payments/external', {
        headers: { 'X-Reim-Token': REIM_TOKEN }, cache: 'no-store', signal: ctrl.signal
      });
    } finally { clearTimeout(timer); }
    if (!resp.ok) throw new Error('报销系统接口 HTTP ' + resp.status);
    const j = await resp.json();
    if (!j || j.ok === false) throw new Error((j && j.msg) || '报销系统返回异常');
    return j;
  },
  /* ===== 发票提交：直接写入报销/付款系统云端（待审核） =====
     与本机 Flask POST /api/invoices/external 同规则，但写入点是公司审核端
     实际读取的云端 reim_invoices，保证供应商在任意电脑提交后，我司人员
     下拉云端即可在「待审核」清单看到（写入点 = 读取点，单一事实源）。
     - 发票号已存在且非「已驳回」→ 拒绝重复提交
     - 「已驳回」→ 覆盖更新为待审核（保留发票 id / 已付金额 / PDF 路径），记重新提交日志
     - 新发票 → 追加待审核记录 + 「采购系统提交」流转日志 */
  async _cloudSave(storeKey, payload) {
    await this._cloudCtx(20000);
    const sb = window.supabase;
    if (!sb || !sb.from) throw new Error('云端数据接口未就绪');
    const r = await sb.from('app_data_store').upsert({
      store_key: storeKey,
      payload: payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'store_key' });
    if (r && r.error) throw r.error;
    return true;
  },
  /* 与报销系统 static/store.js matchCompany 同规则：购方命中 → 进项，销方命中 → 销项 */
  _matchReimCompany(companies, buyer, seller) {
    const norm = s => String(s || '').replace(/\s+/g, '');
    const b = norm(buyer), s = norm(seller);
    if (!b && !s) return { company_id: null, direction: null, company_short: null };
    for (const c of companies) {
      if (!c.active) continue;
      const n = norm(c.name);
      if (n && b && (n.indexOf(b) >= 0 || b.indexOf(n) >= 0)) {
        return { company_id: c.id, direction: '进项', company_short: c.short_name || c.name };
      }
    }
    for (const c2 of companies) {
      if (!c2.active) continue;
      const n2 = norm(c2.name);
      if (n2 && s && (n2.indexOf(s) >= 0 || s.indexOf(n2) >= 0)) {
        return { company_id: c2.id, direction: '销项', company_short: c2.short_name || c2.name };
      }
    }
    return { company_id: null, direction: null, company_short: null };
  },
  async submitInvoice(p) {
    const no = String((p && p.invoice_no) == null ? '' : p.invoice_no).trim();
    if (!no) throw new Error('缺少发票号码');
    const [invsRaw, compsRaw, logsRaw] = await Promise.all([
      this._cloudRow('reim_invoices'),
      this._cloudRow('reim_companies'),
      this._cloudRow('reim_review_log')
    ]);
    const invs = Array.isArray(invsRaw) ? invsRaw.slice() : [];
    const comps = Array.isArray(compsRaw) ? compsRaw : [];
    const logs = Array.isArray(logsRaw) ? logsRaw.slice() : [];
    const exist = invs.find(x => String(x.invoice_no) === no);
    if (exist && exist.status !== '已驳回') {
      const e = new Error('发票 ' + no + ' 已在付款系统中（' + (exist.status || '') + '），不可重复提交');
      e.duplicate = true;
      throw e;
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const m = this._matchReimCompany(comps, p.buyer_name, p.seller_name);
    // 采购侧提交的发票购方即我司；公司档案未命中时按进项兜底，保证进入待审核与付款统计
    const direction = m.direction || '进项';
    const fields = {
      invoice_no: no,
      invoice_code: p.invoice_code || null,
      invoice_type: p.invoice_type || null,
      invoice_date: p.invoice_date || null,
      buyer_name: p.buyer_name || null,
      seller_name: p.seller_name || null,
      item_name: p.item_name || null,
      amount: (p.amount === undefined || p.amount === null || p.amount === '') ? null : +p.amount,
      tax_rate: p.tax_rate || null,
      tax_amount: (p.tax_amount === undefined || p.tax_amount === null || p.tax_amount === '') ? null : +p.tax_amount,
      total_amount: (p.total_amount === undefined || p.total_amount === null || p.total_amount === '') ? null : +p.total_amount,
      subject_code: p.subject_code || null,
      subject_name: p.subject_name || null,
      claimant: p.claimant || '采购系统',
      department: p.department || '',
      project: p.project || null,
      status: '待审核',
      remark: p.remark || null,
      check_code: p.check_code || null,
      settle: '正常付款',
      payee: '销售方',
      company_id: m.company_id,
      direction: direction,
      company_short: m.company_short,
      updated_at: now
    };
    // 云端 PDF 路径：仅在有值时传递，避免覆盖已有路径（驳回重提交时保留原 PDF）
    if (p.cloud_path) fields.cloud_path = p.cloud_path;
    let iid, resubmitted = false;
    if (exist) {
      // 驳回后重新提交：保留 id / 建档时间 / 已付与付款信息 / PDF 路径，仅刷新票面字段
      iid = exist.id;
      resubmitted = true;
      Object.assign(exist, fields);
    } else {
      // 云端前端（static/index.html saveInvoice）用 Date.now() 作数字 id；防同毫秒撞号
      iid = Date.now();
      while (invs.some(x => x.id === iid)) iid++;
      invs.push(Object.assign({
        id: iid,
        user_id: null,
        paid_amount: 0,
        payment_date: null,
        payment_method: null,
        payment_note: null,
        cloud_path: null,
        file_path: null,
        created_at: now
      }, fields));
    }
    logs.push({
      id: now.slice(0, 10).replace(/-/g, '') + iid + Math.random().toString(36).slice(2, 6),
      invoice_id: iid,
      reviewer_id: 0,
      reviewer_name: '采购系统',
      action: resubmitted ? '采购系统重新提交' : '采购系统提交',
      comment: null,
      created_at: now
    });
    // 发票与日志分两次写：发票落库是关键路径；日志失败不阻断（审核列表只认 status）
    await this._cloudSave('reim_invoices', invs);
    try { await this._cloudSave('reim_review_log', logs); }
    catch (e) { console.warn('[ReimPay] 流转日志写入失败（不影响待审核）:', e && e.message ? e.message : e); }
    // 立即刷新本应用付款缓存，让审核状态 / 付款数据近实时更新
    this.lastOkAt = 0;
    try { await this.load(true); } catch (e) {}
    return { ok: true, id: iid, invoice_no: no, status: '待审核', resubmitted: resubmitted };
  },
  async load(force) {
    if (this.inflight) return this.inflight;
    // TTL 内且已有数据：直接用缓存（防止 reim-pay-updated 重渲染后形成拉取循环）
    if (!force && this.data && this.lastOkAt && Date.now() - this.lastOkAt < REIM_TTL_MS) {
      return Promise.resolve(this.data);
    }
    const p = (async () => {
      let j = null;
      let cloudErr = null;
      // ① 云端优先：报销系统正式数据在云端，任意电脑联网可查，不依赖本机服务
      try {
        j = await this.loadFromCloud();
        this.source = 'cloud';
      } catch (e) {
        cloudErr = e;
        console.warn('[ReimPay] 云端读取失败，尝试本机报销服务:', e && e.message ? e.message : e);
      }
      // ② 兜底：本机 Flask 服务（办公机已启动时）
      if (!j) {
        try {
          j = await this.loadFromHttp();
          this.source = 'local';
        } catch (e2) {
          const msg = '云端与本机报销服务均不可用' +
            (cloudErr ? '（云端：' + (cloudErr.message || cloudErr) + '）' : '');
          const err = new Error(msg);
          err.cloudError = cloudErr;
          err.localError = e2;
          throw err;
        }
      }
      this.data = j;
      this.lastOkAt = Date.now();
      localStorage.setItem('pis_reim_cache', JSON.stringify(j));
      this.reconcile(j);
      // 报销台账中销售方匹配本系统供应商的进项票 → 自动同步进本地发票台账
      try { this.syncInvoices(j); } catch (e) { console.warn('报销发票同步失败', e); }
      window.dispatchEvent(new Event('reim-pay-updated'));
      return j;
    })();
    this.inflight = p;
    p.finally(() => { if (this.inflight === p) this.inflight = null; });
    return p;
  },
  /* 审核状态回写本地发票台账：提交后报销侧的通过 / 入账 / 驳回及驳回原因无需人工同步 */
  reconcile(j) {
    const subs = Array.isArray(j.submissions) ? j.submissions : [];
    if (!subs.length) return;
    const byNo = new Map(subs.map(s => [String(s.invoice_no), s]));
    const arr = Data.all('invoices');
    let dirty = false;
    arr.forEach(v => {
      const s = byNo.get(String(v.invoiceNumber));
      if (!s) return;
      const patch = {};
      if (s.status && s.status !== v.reimStatus) {
        patch.reimStatus = s.status;
        // 驳回原因仅在「已驳回」状态下展示，重新提交 / 通过后清掉旧反馈
        patch.reimComment = s.status === '已驳回' ? (s.last_comment || '') : '';
      } else if (s.status === '已驳回' && (s.last_comment || '') !== (v.reimComment || '')) {
        patch.reimComment = s.last_comment || '';
      }
      if (s.id && s.id !== v.reimId) patch.reimId = s.id;
      if (Object.keys(patch).length) { Object.assign(v, patch); dirty = true; }
    });
    if (dirty) DB.set('invoices', arr);
  },
  /* 报销台账 → 采购台账自动同步：报销侧进项票中销售方与本系统供应商模糊匹配命中的，
     自动落入本地「发票台账」（source='报销同步'），随每次拉取近实时更新。
     - 发票号已存在（任何来源）：不重复建档；仅对「报销同步」来源回写白名单字段，
       人工录入 / PDF 识别 / Excel 导入的记录绝不覆盖
     - 匹配不到供应商的票不入库（避免脏数据），供应商档案补全后下次拉取自动同步
     - 用户事后关联的合同号、备注等本地编辑内容保留，不回写
     返回新增条数。 */
  syncInvoices(j) {
    const invs = Array.isArray(j && j.invoices) ? j.invoices : [];
    if (!invs.length) return 0;
    const arr = DB.get('invoices', []);
    if (!Array.isArray(arr)) return 0;
    const sups = DB.get('suppliers', []);
    const orders = DB.get('orders', []);
    const byNo = new Map(arr.map(v => [String(v.invoiceNumber), v]));
    const num = x => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
    let added = 0, changed = false;
    invs.forEach(r => {
      const no = String(r.invoice_no == null ? '' : r.invoice_no);
      if (!no) return;
      const exist = byNo.get(no);
      if (exist) {
        if (!exist.syncedFromReim) return; // 非同步来源：交给 reconcile / 人工，不覆盖
        const patch = {};
        const set = (k, v) => { if (String(exist[k] == null ? '' : exist[k]) !== String(v == null ? '' : v)) patch[k] = v; };
        set('invoiceDate', r.invoice_date || '');
        set('invoiceType', normReimInvoiceType(r.invoice_type));
        set('amount', num(r.total_amount));
        if (r.amount != null) set('netAmount', num(r.amount));
        if (r.tax_amount != null) set('taxAmount', num(r.tax_amount));
        if (r.tax_rate != null) set('taxRate', r.tax_rate || '');
        set('itemName', r.item_name || '');
        set('buyerName', r.buyer_name || '');
        set('reimStatus', r.status || '');
        if (r.id != null) set('reimId', r.id);
        if (Object.keys(patch).length) { Object.assign(exist, patch); changed = true; }
        return;
      }
      const sup = matchReimSupplier(r.seller_name, sups);
      if (!sup) return; // 销售方匹配不到供应商：暂不入库
      /* 关联合同：仅当报销侧 project 中的合同号确属该供应商合同时挂上，避免污染合同开票额 */
      let contractNumber = '';
      splitMulti(r.project).some(cno => {
        if (orders.some(o => o.contractNumber === cno && o.supplier === sup.supplierName)) { contractNumber = cno; return true; }
        return false;
      });
      const rec = {
        id: uid(),
        company: companyOfReimBuyer(r.buyer_name),
        invoiceNumber: no,
        invoiceDate: r.invoice_date || '',
        invoiceType: normReimInvoiceType(r.invoice_type),
        contractNumber,
        supplier: sup.supplierName,
        amount: num(r.total_amount),
        remark: '',
        netAmount: r.amount != null ? num(r.amount) : 0,
        taxAmount: r.tax_amount != null ? num(r.tax_amount) : 0,
        taxRate: r.tax_rate || '',
        itemName: r.item_name || '',
        buyerName: r.buyer_name || '',
        subjectCode: '', subjectName: '',
        reimStatus: r.status || '',
        reimId: r.id != null ? r.id : '',
        reimComment: '',
        source: '报销同步',
        syncedFromReim: true,
        createdAt: new Date().toISOString()
      };
      arr.unshift(rec);
      byNo.set(no, rec);
      added++; changed = true;
    });
    if (changed) DB.set('invoices', arr);
    return added;
  },
  /* 销售方名 → 供应商档案（供发票录入等页面复用同一匹配口径） */
  matchSupplier(name) { return matchReimSupplier(name); }
};
ReimPay.init();

/* ---------- 业务统计 ---------- */
function contractByNo(cno) { return Data.list('orders').find(o => o.contractNumber === cno); }
function orderProducts(o) { return (o && o.products) || []; }
function sumQty(list, cno, pname, field, dateField, dateEnd) {
  return list.filter(r => r.contractNumber === cno && (!pname || r.product === pname))
    .filter(r => !dateEnd || !r[dateField] || r[dateField] <= dateEnd)
    .reduce((s, r) => s + (+r[field] || 0), 0);
}
const receivedQty = (cno, pn) => sumQty(Data.list('receipts'), cno, pn, 'quantity', 'receiptDate');
const returnedQty = (cno, pn) => sumQty(Data.list('returns'), cno, pn, 'quantity', 'returnDate');
const shippedQty = (cno, pn) => sumQty(Data.list('shipments'), cno, pn, 'quantity', 'shipDate');
function orderOrderedQty(o) { return orderProducts(o).reduce((s, p) => s + (+p.quantity || 0), 0); }
function orderReceivedTotal(o) { return orderProducts(o).reduce((s, p) => s + receivedQty(o.contractNumber, p.name), 0); }
function orderShippedTotal(o) { return orderProducts(o).reduce((s, p) => s + shippedQty(o.contractNumber, p.name), 0); }
function orderReturnTotal(o) { return orderProducts(o).reduce((s, p) => s + returnedQty(o.contractNumber, p.name), 0); }
function orderStatus(o) {
  const ordered = orderOrderedQty(o), recv = Math.max(0, orderReceivedTotal(o) - orderReturnTotal(o));
  if (ordered <= 0) return { t: '执行中', c: 'b-gray' };
  if (recv >= ordered) return { t: '已收齐', c: 'b-green' };
  if (recv > 0) return { t: '部分收货', c: 'b-amber' };
  return { t: '未收货', c: 'b-gray' };
}
/* ---------- 发货 / 收货管理状态机 ----------
   发货记录状态：待确认（供应商登记后）→ 已确认（采购员确认收货，同步生成收货记录）/ 部分确认（分批到货，剩余待收）
   收货记录状态：待确认 → 已确认（采购员核对无误）
   字段：status（状态）、seq（第几次到货）、shipQty（发货数量）、receiveQty（实收数量）、supplierReadAt（供应商已读回执时间）
*/
const SHIP_PENDING = '待确认', SHIP_PARTIAL = '部分确认', SHIP_CONFIRMED = '已确认';
const RECV_PENDING = '待确认', RECV_CONFIRMED = '已确认';
const shipStatus = r => r.status || SHIP_PENDING;                       // 兼容旧数据（无 status 视为待确认）
const shipBadge = r => {
  const t = shipStatus(r);
  const cls = t === SHIP_CONFIRMED ? 'b-green' : t === SHIP_PARTIAL ? 'b-amber' : 'b-gray';
  return '<span class="badge ' + cls + '">' + t + '</span>';
};
// 该发货单已确认收货的合计（按合同+产品归集到本条发货记录）
function confirmedQtyOfShip(rec) {
  return Data.list('receipts').filter(x => x.company === rec.company && x.contractNumber === rec.contractNumber && x.product === rec.product && x.shipNumber === rec.shipNumber)
    .reduce((s, x) => s + (+x.quantity || 0), 0);
}
// 派生的发货状态：以未删除的收货记录为准（避免状态字段与数据不一致）
function deriveShipStatus(rec) {
  const done = confirmedQtyOfShip(rec);
  if (done <= 0) return SHIP_PENDING;
  return done + 0.0001 >= (+rec.quantity || 0) ? SHIP_CONFIRMED : SHIP_PARTIAL;
}
function invoicedOfContract(cno) { return Data.list('invoices').filter(v => splitMulti(v.contractNumber).includes(cno)).reduce((s, v) => s + (+v.amount || 0), 0); }
// 付款数据源为报销系统（见上方 ReimPay 桥），本地 pis_payments 已停用、无写入点
function paidOfContract(cno) { return ReimPay.paidOfContract(cno); }
function paidOfInvoice(invNo) { return ReimPay.paidOfInvoice(invNo); }
function invoiceStatus(inv) {
  const paid = paidOfInvoice(inv.invoiceNumber);
  if (paid <= 0) return { t: '未付款', c: 'b-gray' };
  if (paid >= (+inv.amount || 0) - 0.005) return { t: '已付清', c: 'b-green' };
  return { t: '部分付款', c: 'b-amber' };
}
function supPriorityBadge(p) {
  const m = { high: ['紧急优先', 'prio-high'], medium: ['优先合作', 'prio-medium'], normal: ['正常', 'prio-normal'] };
  const x = m[p] || m.normal; return '<span class="badge ' + x[1] + '">' + x[0] + '</span>';
}

/* ---------- 导出 CSV ---------- */
function exportCSV(filename, headers, rows) {
  const head = headers.map(h => '"' + String(h).replace(/"/g, '""') + '"').join(',');
  const body = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

/* ==========================================================
   「更多」菜单通用件 + EXCEL 导入/导出/清空（各模块页共用）
   ========================================================== */
/* EXCEL 组件懒加载（SheetJS，多 CDN 回退） */
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => {
    const urls = ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdn.staticfile.net/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) { rej(new Error('EXCEL 组件加载失败，请检查网络后重试')); return; }
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = () => window.XLSX ? res() : tryNext();
      s.onerror = () => { s.remove(); tryNext(); };
      document.head.appendChild(s);
    };
    tryNext();
  });
}
/* 日期归一化（导入时兼容多种写法） */
function normDateStr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  let s = String(v).trim().replace(/[年月]/g, '-').replace(/日/g, ' ');
  let m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return y + '-' + String(+m[1]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0'); }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return String(v).trim();
}
/* 「更多」下拉菜单：HTML 生成 + 事件绑定（items: [{m, label, cls}]） */
function moreMenuHTML(btnId, items) {
  return '<div class="more-wrap"><button class="btn btn-outline" id="' + btnId + '">更多 ▾</button><div class="more-menu" id="' + btnId + 'Menu">' +
    items.map(i => '<button data-m="' + i.m + '"' + (i.cls ? ' class="' + i.cls + '"' : '') + '>' + i.label + '</button>').join('') + '</div></div>';
}
function bindMoreMenu(btnId, handlers) {
  const menu = $('#' + btnId + 'Menu'); if (!menu) return;
  $('#' + btnId).addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('show'); });
  menu.querySelectorAll('button[data-m]').forEach(b => b.addEventListener('click', () => {
    menu.classList.remove('show');
    const fn = handlers[b.dataset.m]; if (fn) fn();
  }));
}
/* 点击空白处关闭所有「更多」菜单（全局一次注册） */
if (!window.__moreDocClick) {
  window.__moreDocClick = true;
  document.addEventListener('click', e => {
    $$('.more-menu.show').forEach(m => { if (!e.target.closest || !e.target.closest('.more-wrap')) m.classList.remove('show'); });
  });
}
/* 导出 EXCEL（通用）：headers + rows → 单 sheet xlsx */
async function exportCollExcel(sheetName, fileName, headers, rows) {
  try {
    await ensureXLSX();
    const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = headers.map(h => ({ wch: Math.max(10, Math.min(40, String(h).length * 2 + 8)) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    toast('已导出 ' + rows.length + ' 条', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function todayFileTag() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
/* 导入 EXCEL（通用）：解析 → 表头列定位 → build 行 → 去重 → 确认 → 写入集合
   opt: { coll, label, cols:{key:表头名}, need:[key], build(r, C, num, dstr)->rec|null,
          dedup(rec)->签名|null（null 不查重） } */
async function importCollExcel(file, opt) {
  if (!file) return;
  toast('正在解析 ' + file.name + ' …', 'info');
  try {
    await ensureXLSX();
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const data = isCsv ? await file.text() : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(new Error('文件读取失败')); r.readAsArrayBuffer(file); });
    const wb = XLSX.read(data, { type: isCsv ? 'string' : 'array', cellDates: true });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    applyCollImport(aoa, opt);
  } catch (e) { toast('导入失败：' + e.message, 'err'); }
}
function applyCollImport(aoa, opt) {
  if (!aoa || aoa.length < 2) { toast('文件中没有可导入的数据', 'err'); return; }
  const head = aoa[0].map(h => String(h).trim());
  const col = n => head.findIndex(h => h.indexOf(n) > -1);
  const C = {}; Object.keys(opt.cols).forEach(k => { C[k] = col(opt.cols[k]); });
  const missing = (opt.need || []).filter(k => C[k] < 0);
  if (missing.length) { toast('表头缺少「' + missing.map(k => opt.cols[k]).join(' / ') + '」列', 'err'); return; }
  const num = v => +String(v == null ? '' : v).replace(/[¥￥,，\s]/g, '') || 0;
  const recs = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]; if (!r || !r.length) continue;
    let rec = null;
    try { rec = opt.build(r, C, num, normDateStr); } catch (e) { /* 单行异常跳过 */ }
    if (rec) recs.push(rec);
  }
  let fresh = recs, skipDup = 0;
  if (opt.dedup) {
    const sigs = new Set(Data.all(opt.coll).map(r => opt.dedup(r)));
    fresh = recs.filter(r => { const s = opt.dedup(r); return s == null || !sigs.has(s); });
    skipDup = recs.length - fresh.length;
  }
  if (!fresh.length) { toast('没有新数据可导入' + (skipDup ? '（' + skipDup + ' 行已存在，已跳过）' : ''), 'info'); return; }
  if (!confirm('解析到 ' + fresh.length + ' 条新' + opt.label + (skipDup ? '，跳过已存在 ' + skipDup + ' 行' : '') + '。\n确认导入到当前公司主体？')) return;
  fresh.forEach(r => Data.add(opt.coll, r));
  toast('已导入 ' + fresh.length + ' 条' + opt.label, 'ok');
  renderPage();
}
/* 清空（通用）：全部公司视图禁止（GLOBAL_COLS 集合除外）→ 确认 → 清当前主体 */
function clearCollConfirm(coll, label) {
  /* 清空会连带删除他人创建的记录（防推责）：仅管理员可执行 */
  if (!Session.isAdmin()) { toast('清空会删除他人创建的记录，仅管理员可执行', 'err'); return; }
  const isGlobal = Data.GLOBAL_COLS.indexOf(coll) > -1;
  if (!isGlobal && State.company === ALL_COMPANIES) { toast('「全部公司」视图下不可清空，请先在页首切换到具体公司主体', 'err'); return; }
  const list = Data.list(coll);
  if (!list.length) { toast('当前范围没有' + label, 'info'); return; }
  const scope = isGlobal ? '全部' : '当前公司主体的';
  if (!confirm('⚠ 确认清空' + scope + ' ' + list.length + ' 条' + label + '？此操作不可恢复！')) return;
  DB.set(coll, isGlobal ? [] : Data.all(coll).filter(r => r.company !== State.company));
  toast('已清空 ' + list.length + ' 条' + label, 'ok');
  renderPage();
}

/* ==========================================================
   渲染：框架（顶栏 + “菜单”下拉导航 + 当前模块页）
   ========================================================== */
/* 智能重渲染：记录每次 renderFrame 期间实际读取的 DB 键与值快照，
   云端/报销侧更新到来时只比对这组键，数据未变则跳过重渲染，避免无谓闪烁。 */
let __renderDeps = null;
function depsChanged(deps) {
  if (!deps) return true;
  for (const k in deps) {
    let cur;
    try { cur = JSON.stringify(DB.get(k)); } catch (e) { return true; }
    if (cur !== deps[k]) return true;
  }
  return false;
}
function renderFrame() {
  const u = Session.user; if (!u) return;
  if ($('#whoName')) $('#whoName').textContent = u.username;
  if (window.NC) window.NC.paintUserbox(); // 头像色标 + 铃铛未读角标（登录人标识）
  if ($('#companySelectWrap')) $('#companySelectWrap').style.display = Session.isSupplier() ? 'none' : 'flex';
  /* 供应商角色标记：CSS 据此隐藏页首工具条「备份到电脑 / 从电脑恢复」
     （供应商不得导出全量数据，更不能用本机 JSON 覆盖云端）。
     按钮由多应用共用的 cloudbase-admin.js 注入，故用角色 class 控制，不改共享件。 */
  document.documentElement.classList.toggle('pis-supplier', Session.isSupplier());
  /* 「从电脑恢复」仅管理员与 alonzhang 可用：其余账号隐藏该按钮 */
  document.documentElement.classList.toggle('pis-can-restore', Session.canRestore());
  const deps = {};
  const origGet = DB.get;
  DB.get = function (k, d) {
    const v = origGet.call(DB, k, d);
    try { deps[k] = JSON.stringify(v); } catch (e) {}
    return v;
  };
  try {
    if ($('#companySelect')) {
      const comps = DB.get('companies', []);
      $('#companySelect').innerHTML = '<option value="' + ALL_COMPANIES + '"' + (State.company === ALL_COMPANIES ? ' selected' : '') + '>全部公司</option>' +
        comps.map(c => '<option value="' + esc(c.code) + '"' + (c.code === State.company ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    }
    renderNav(); renderPage();
  } finally { DB.get = origGet; }
  __renderDeps = deps;
  /* 「主页」图标：有权限才显示，停留在工作台页时高亮 */
  const hb = $('#navHomeBtn');
  if (hb) {
    hb.style.display = Session.can('dashboard') ? '' : 'none';
    hb.classList.toggle('on', State.page === 'dashboard');
  }
}
function renderNav() {
  if (!$('#navMenu')) return;
  const groups = {};
  // 工作台（dashboard）已改为头部「主页」图标直达，不再出现在下拉中
  PAGES.filter(p => p.key !== 'dashboard' && (!p.adminOnly || Session.isAdmin())).forEach(p => {
    if (!Session.can(p.key)) return;
    (groups[p.group] = groups[p.group] || []).push(p);
  });
  let html = '';
  Object.keys(groups).forEach(g => {
    html += '<div class="mgroup">' + esc(g) + '</div>';
    groups[g].forEach(p => {
      html += '<div class="mitem' + (State.page === p.key ? ' active' : '') + '" data-page="' + p.key + '"><span class="ico">' + p.ico + '</span>' + esc(p.name) + '</div>';
    });
  });
  html += '<div class="mfoot">采购一体化系统 v2.0<br>多模块 · 云端数据自动同步</div>';
  $('#navMenu').innerHTML = html;
  $$('#navMenu .mitem').forEach(el => el.addEventListener('click', () => { cancelNavClose(); closeNavMenu(); goto(el.dataset.page); }));
}
let __navCloseTimer = null;
function closeNavMenu() {
  const m = $('#navMenu'); if (m) m.classList.remove('show');
  const b = $('#navMenuBtn'); if (b) b.classList.remove('on');
}
/* 供悬停开关共用：清除待执行的延迟收起（菜单项点击跳转前调用，防止跨页残留） */
function cancelNavClose() { if (__navCloseTimer) { clearTimeout(__navCloseTimer); __navCloseTimer = null; } }
function goto(page) {
  if (!Session.can(page)) { toast('当前角色无权访问该模块', 'err'); return; }
  location.href = page + '.html';
}
function renderPage() {
  const main = $('#main'); if (!main) return;
  const fn = window.__pageRender;
  main.innerHTML = '<section class="page show" id="page-' + State.page + '"></section>';
  if (fn) fn($('#page-' + State.page));
}

/* ---------- 模块页初始化（含权限守卫兜底） ---------- */
function initPage(pageKey, pageFn) {
  seed();
  loadSession();
  const u = Session.user;
  const cur = u ? DB.get('users', []).find(x => x.id === u.id) : null;
  if (!cur || cur.active === false) { // 会话无效（被删除/停用）
    sessionStorage.removeItem('pis_session');
    location.replace('login.html'); return;
  }
  Session.user = cur; // 以本地存储中的最新用户资料为准（角色可能被管理员调整）
  const allowed = pageKey === 'admin' ? !!Session.isAdmin() : Session.can(pageKey);
  if (!allowed) { // 越权访问 → 跳到首个有权模块
    const first = PAGES.find(p => Session.can(p.key));
    location.replace(first ? first.key + '.html' : 'login.html'); return;
  }
  window.__pageRender = pageFn;
  State.page = pageKey;
  State.company = DB.get('curCompany', ALL_COMPANIES); // 无记忆值时默认「全部公司」视图
  const comps = DB.get('companies', []);
  if (!comps.length) State.company = '普利美'; // 无公司档案时不允许停留在哨兵值
  else if (State.company !== ALL_COMPANIES && !comps.find(c => c.code === State.company)) State.company = ALL_COMPANIES; // 记忆的公司已删除：回落「全部公司」
  renderFrame();
  // 静默拉取报销侧付款/审核状态（失败不打扰：页面继续使用上次缓存）。
  // 报销台账 → 采购台账的销售方匹配同步也挂在同一次拉取上。
  ReimPay.load().catch(() => {});
  // 近实时：业务页打开期间每 30 秒静默拉取一次（load 内 TTL 同为 30 秒，手动刷新走 force）
  if (!window.__reimSyncTimer) {
    window.__reimSyncTimer = setInterval(() => { ReimPay.load().catch(() => {}); }, REIM_TTL_MS);
  }
  /* 通知中心：进入页面后若本人有未读通知，先弹出提示窗口 */
  if (window.NC) window.NC.entryCheck();
}

/* ==========================================================
   模态框
   ========================================================== */
function openModal(html, size) {
  const box = $('#modalBox'); if (!box) return;
  box.className = 'modal' + (size === 'wide' ? ' wide' : size === 'narrow' ? ' narrow' : '');
  box.innerHTML = html; $('#modalMask').classList.add('show');
}
function closeModal() { if (!$('#modalMask')) return; $('#modalMask').classList.remove('show'); if ($('#modalBox')) $('#modalBox').innerHTML = ''; }
// 注意：表单弹窗不绑定遮罩点击关闭（避免误点表单外部导致填写内容丢失），仅保留 Escape / 取消按钮关闭
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeNavMenu(); } });

/* ---------- 「主页」图标：注入到“菜单”旁，点击直达工作台（11 个页面共用，免逐页改 HTML） ---------- */
(function injectNavHome() {
  const wrap = document.querySelector('.nav-wrap');
  const menuBtn = $('#navMenuBtn');
  if (!wrap || !menuBtn || $('#navHomeBtn')) return;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'nav-home';
  home.id = 'navHomeBtn';
  home.title = '主页（工作台）';
  home.setAttribute('aria-label', '主页（工作台）');
  home.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';
  home.addEventListener('click', e => { e.stopPropagation(); goto('dashboard'); });
  wrap.insertBefore(home, menuBtn);
})();

/* ---------- “菜单”下拉开关：悬停即展开（鼠标设备）/ 点击切换（触屏兜底）/ 点击外部关闭 ---------- */
(function setupNavToggle() {
  const wrap = document.querySelector('.nav-wrap');
  const btn = $('#navMenuBtn'), m = $('#navMenu');
  if (!wrap || !btn || !m) return;
  const setOpen = open => {
    if (open) cancelNavClose();
    m.classList.toggle('show', open); btn.classList.toggle('on', open);
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(!m.classList.contains('show'));
  });
  /* 进入即开；离开延迟 250ms 再关（慢移/抖动穿过临界区时再进入会取消关闭），
     与 CSS 透明命中区 .nav-wrap::after 形成双保险 */
  wrap.addEventListener('mouseenter', () => setOpen(true));
  wrap.addEventListener('mouseleave', () => {
    cancelNavClose();
    __navCloseTimer = setTimeout(() => { __navCloseTimer = null; setOpen(false); }, 250);
  });
})();
if (!window.__navDocClick) {
  window.__navDocClick = true;
  document.addEventListener('click', e => {
    const m = $('#navMenu');
    if (m && m.classList.contains('show') && (!e.target.closest || !e.target.closest('.nav-wrap'))) closeNavMenu();
  });
}

/* ---------- 全局绑定（元素存在才绑定，兼容登录页） ---------- */
if ($('#logoutBtn')) $('#logoutBtn').addEventListener('click', () => {
  DB.set('curCompany', State.company);
  Session.user = null; sessionStorage.removeItem('pis_session');
  location.href = 'login.html';
});
if ($('#companySelect')) $('#companySelect').addEventListener('change', e => {
  State.company = e.target.value; DB.set('curCompany', State.company);
  renderFrame(); toast('已切换到：' + (State.company === ALL_COMPANIES ? '全部公司' : getCompany(State.company)), 'info');
});

/* ---------- 启动保障 ---------- */
seed();
/* ---------- 公司编码迁移：companyA/companyB → 简称（普利美/龙力），老数据一次性平滑升级（幂等） ---------- */
function migrateCompanyCodes() {
  const map = { companyA: '普利美', companyB: '龙力' };
  const cos = DB.get('companies', []);
  let hit = false;
  cos.forEach(c => { if (map[c.code]) { c.code = map[c.code]; hit = true; } });
  if (hit) DB.set('companies', cos);
  ['orders', 'receipts', 'returns', 'shipments', 'invoices', 'payments'].forEach(coll => {
    const arr = DB.get(coll, []);
    let dirty = false;
    arr.forEach(r => { if (map[r.company]) { r.company = map[r.company]; dirty = true; } });
    if (dirty) DB.set(coll, arr);
  });
  const cur = DB.get('curCompany', null);
  if (cur && map[cur]) DB.set('curCompany', map[cur]);
}
migrateCompanyCodes();

/* ==========================================================
   云端数据（cloudbase-sync.js / cloudbase-admin.js）接入桥接
   ========================================================== */
/* 顶部冻结工具条「📥 备份到电脑」入口：导出全量 pis_* 数据 JSON */
window.backupData = function () {
  if (Session.isSupplier()) { toast('供应商账号无权备份数据', 'err'); return; }
  try {
    const blob = new Blob([JSON.stringify(DB.snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '采购一体化系统备份_' + todayStr() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
    toast('备份已下载', 'ok');
  } catch (e) { toast('备份失败：' + e.message, 'err'); }
};
/* 顶部冻结工具条「📤 从电脑恢复」入口：选择 JSON → 覆盖本机 → 启动导入保护（防云端旧数据回灌）→ 刷新。
   恢复写入会经 cloudbase-sync 拦截器自动上传，保护期只屏蔽"云端→本地"拉取。 */
window.restoreData = function () {
  if (!Session.canRestore()) { toast('仅管理员和 alonzhang 可恢复数据', 'err'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const snap = JSON.parse(rd.result);
        if (!snap || typeof snap.data !== 'object' || snap.data === null) throw new Error('备份文件格式不正确');
        if (snap.app && snap.app !== 'purchase-integrated') {
          if (!confirm('该备份文件来自其它应用（' + String(snap.app) + '），强行恢复可能导致数据异常。仍要继续吗？')) return;
        }
        if (!confirm('恢复将用备份内容覆盖本机当前数据，确定继续？')) return;
        DB.restore(snap);
        if (window.CloudbaseSync && typeof window.CloudbaseSync.setImportProtection === 'function') {
          window.CloudbaseSync.setImportProtection(600000); // 10 分钟导入保护
        }
        toast('恢复成功，即将刷新', 'ok');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('恢复失败：' + err.message, 'err'); }
    };
    rd.readAsText(f);
  };
  input.click();
};
/* 云端数据到达（自动轮询/手动下载/其它设备更新）后，在不打断用户操作的前提下重渲染当前页 */
let __pisCloudRefreshTimer;
window.addEventListener('cloud-data-updated', () => {
  clearTimeout(__pisCloudRefreshTimer);
  __pisCloudRefreshTimer = setTimeout(() => {
    if (!Session.user || !State.page || !$('#main')) return;
    const mask = $('#modalMask');
    if (mask && mask.classList.contains('show')) return; // 弹窗录入中：不打断，下次更新再刷
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return; // 主区域筛选/输入中：不打断
    const cc = DB.get('curCompany', null);
    const comps = DB.get('companies', []);
    if (cc && (cc === ALL_COMPANIES || comps.some(c => c.code === cc))) State.company = cc;
    if (!depsChanged(__renderDeps)) return; // 数据未变：不重建 DOM，消除闪烁
    renderFrame();
  }, 500);
});
/* 报销侧付款 / 审核状态到达后，同样在不打断用户操作的前提下重渲染当前页 */
let __pisReimRefreshTimer;
window.addEventListener('reim-pay-updated', () => {
  clearTimeout(__pisReimRefreshTimer);
  __pisReimRefreshTimer = setTimeout(() => {
    if (!Session.user || !State.page || !$('#main')) return;
    const mask = $('#modalMask');
    if (mask && mask.classList.contains('show')) return;
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    if (!depsChanged(__renderDeps)) return; // 数据未变：不重建 DOM，消除闪烁
    renderFrame();
  }, 500);
});
/* cloudbase-admin 工具条消息走本应用 toast */
window.showToast = (msg, type) => toast(String(msg == null ? '' : msg), type === 'error' ? 'err' : type === 'success' ? 'ok' : 'info');

/* ==========================================================
   通知中心 NC（铃铛 + 未读弹窗 + 已读/未读）
   · 存储：pis_notifications（随云端同步，任何设备产生、所有设备可见）
   · 一条通知可定向：指定用户 toUsers / 指定角色 toRoles / 某供应商 toSupplier / 全体 toAll
   · 已读状态：readBy（用户 id 数组）随通知存储，各账号独立标记已读
   · 自动生成：供应商发货 → 通知采购员/仓管；需方确认收货 → 通知对应供应商；
               登记发票 → 通知财务/管理员；管理员公告在「系统管理 → 通知公告」发布
   ========================================================== */
(function ncStyle() {
  const st = document.createElement('style');
  st.id = 'pisNcStyle';
  st.textContent =
    '.nc-wrap{position:relative;display:flex;align-items:center}' +
    '.nc-bell{position:relative;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;color:var(--text);display:flex;align-items:center}' +
    '.nc-bell:hover{background:#f1f5f9}' +
    '.nc-badge{position:absolute;top:-1px;right:-3px;min-width:15px;height:15px;border-radius:8px;background:#e5484d;color:#fff;font-size:10px;line-height:15px;text-align:center;padding:0 4px;font-weight:700;display:none;font-style:normal}' +
    '.nc-panel{position:absolute;top:calc(100% + 10px);right:-6px;width:360px;max-height:min(480px,72vh);overflow-y:auto;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.18);z-index:90;padding:8px;display:none;color:var(--text);text-align:left}' +
    '.nc-head{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 8px;border-bottom:1px solid var(--border);font-weight:700;font-size:13px}' +
    '.nc-head .lk{font-size:12px;font-weight:400}' +
    '.nc-sec{font-size:11px;color:var(--muted);padding:8px 6px 4px;font-weight:600}' +
    '.nc-item{padding:8px 10px;border-radius:8px;cursor:pointer}' +
    '.nc-item:hover{background:#f1f5f9}' +
    '.nc-item.un{background:#eff6ff}' +
    '.nc-item.un:hover{background:#e0edff}' +
    '.nc-t{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '.nc-b{font-size:12px;color:#475569;margin:3px 0;line-height:1.5}' +
    '.nc-m{font-size:11px;color:#94a3b8}' +
    '.nc-empty{padding:22px 0;text-align:center;color:var(--muted);font-size:12.5px}' +
    '.nc-item .lk{font-size:11px;margin-left:auto;white-space:nowrap}' +
    /* 经办人标识（表格/弹窗） */
    '.op-badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text);white-space:nowrap}' +
    '.op-badge i{width:18px;height:18px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;font-style:normal;display:inline-flex;align-items:center;justify-content:center;flex:none}' +
    /* 页首登录人头像（冻结行右上角用户区内） */
    '.userbox .u-ava{width:26px;height:26px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none;letter-spacing:0}';
  document.head.appendChild(st);
})();

const NC = {
  list() { const a = DB.get('notifications', []); return Array.isArray(a) ? a : []; },
  save(arr) {
    arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    DB.set('notifications', arr.slice(0, 300)); // 只保留最近 300 条，防止无限膨胀
  },
  /* 接收匹配（自己发布的自己不弹） */
  match(n) {
    const u = Session.user; if (!u || !n) return false;
    if (n.by === u.id) return false;
    if (Array.isArray(n.toUsers) && n.toUsers.indexOf(u.id) > -1) return true;
    if (Array.isArray(n.toRoles) && n.toRoles.indexOf(u.role) > -1) return true;
    if (n.toSupplier && Session.isSupplier() && n.toSupplier === Session.mySupplier()) return true;
    return n.toAll === true;
  },
  mine() { return this.list().filter(n => this.match(n)); },
  unread() { return this.mine().filter(n => !(n.readBy || []).includes(Session.user.id)); },
  push(o) {
    const u = Session.user; if (!u || !o || !o.title) return;
    const arr = this.list();
    arr.unshift({
      id: uid(), title: String(o.title), body: o.body || '', kind: o.kind || 'sys',
      toUsers: Array.isArray(o.toUsers) && o.toUsers.length ? o.toUsers : null,
      toRoles: Array.isArray(o.toRoles) && o.toRoles.length ? o.toRoles : null,
      toSupplier: o.toSupplier || '', toAll: o.toAll === true,
      refPage: o.refPage || '', refShip: o.refShip || '',
      by: u.id, byName: u.name || u.username, createdAt: new Date().toISOString(), readBy: []
    });
    this.save(arr); this.refreshBadge();
  },
  markRead(id) {
    const u = Session.user; if (!u) return;
    const arr = this.list(); const n = arr.find(x => x.id === id); if (!n) return;
    n.readBy = n.readBy || [];
    if (n.readBy.indexOf(u.id) < 0) { n.readBy.push(u.id); this.save(arr); this.refreshBadge(); }
  },
  markAllRead() {
    const u = Session.user; if (!u) return;
    const arr = this.list(); let dirty = false;
    arr.forEach(n => {
      if (this.match(n) && (n.readBy || []).indexOf(u.id) < 0) { (n.readBy = n.readBy || []).push(u.id); dirty = true; }
    });
    if (dirty) { this.save(arr); this.refreshBadge(); }
  },
  /* 拥有某页面写权限的角色 key（自动通知的接收范围），管理员始终在内 */
  rolesWithPerm(page) {
    return ['admin'].concat(DB.get('roles', []).filter(r => {
      const v = (r.permissions || {})[page];
      return (v === 'rw' || v === true) && !r.supplierRole;
    }).map(r => r.key));
  },
  /* 业务动作 → 自动通知（挂接在 Data.add 之后，本机产生、随云端到其他设备） */
  onAdd(coll, rec) {
    try {
      if (!rec || !Session.user) return;
      if (coll === 'shipments') {
        this.push({ kind: 'ship', title: '供应商发货通知',
          body: (rec.supplier || '供应商') + ' 登记发货：合同 ' + (rec.contractNumber || '—') + ' · ' + (rec.product || '') + ' · 数量 ' + fmtNum(rec.quantity) + (rec.shipDate ? ' · 发货日 ' + rec.shipDate : ''),
          toRoles: this.rolesWithPerm('receive'), refPage: 'receive' });
      } else if (coll === 'receipts' && rec.source !== 'manual-import') {
        this.push({ kind: 'receive', title: '需方收货反馈',
          body: '您的发货单 ' + (rec.shipNumber || '') + ' 已确认收货：实收 ' + fmtNum(rec.quantity) + (rec.remark ? ' · 需方反馈：' + rec.remark : ''),
          toSupplier: rec.supplier || '', refPage: 'ship', refShip: rec.shipNumber || '' });
      } else if (coll === 'invoices') {
        this.push({ kind: 'invoice', title: '新发票登记',
          body: (rec.supplier || '') + ' 登记发票 ' + (rec.invoiceNumber || '') + ' · 价税合计 ' + fmtMoney(rec.amount) + (rec.contractNumber ? ' · 合同 ' + rec.contractNumber : ''),
          toRoles: this.rolesWithPerm('invoice'), refPage: 'invoice' });
      }
    } catch (e) { /* 通知失败不影响业务保存 */ }
  },
  /* ---------- 页首 UI：铃铛 + 未读角标 + 下拉面板（冻结行右上角用户区） ---------- */
  refreshBadge() {
    const b = $('#ncBadge'); if (!b) return;
    const n = Session.user ? this.unread().length : 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.style.display = n > 0 ? 'block' : 'none';
    if ($('#ncPanel') && $('#ncPanel').style.display !== 'none') this.renderPanel();
  },
  paintUserbox() {
    const u = Session.user; if (!u) return;
    const ava = $('#whoAva'); if (!ava) return;
    const nm = u.name || u.username || '?';
    ava.textContent = nm.charAt(0);
    ava.style.background = 'hsl(' + userHue(u.username || nm) + ',62%,44%)';
    ava.title = (u.name || u.username) + ' · ' + ((DB.get('roles', []).find(r => r.key === u.role) || {}).name || u.role);
    this.refreshBadge();
  },
  togglePanel(force) {
    const p = $('#ncPanel'); if (!p) return;
    const show = force !== undefined ? force : p.style.display === 'none';
    if (show) this.renderPanel();
    p.style.display = show ? 'block' : 'none';
  },
  itemHTML(n, isUn) {
    const kindMap = { ship: ['发货', 'b-blue'], receive: ['收货', 'b-green'], invoice: ['发票', 'b-purple'], sys: ['通知', 'b-gray'] };
    const k = kindMap[n.kind] || kindMap.sys;
    return '<div class="nc-item' + (isUn ? ' un' : '') + '" data-id="' + esc(n.id) + '">' +
      '<div class="nc-t">' + (isUn ? '<span class="badge b-red">未读</span>' : '') + '<span class="badge ' + k[1] + '">' + k[0] + '</span>' + esc(n.title) + '</div>' +
      (n.body ? '<div class="nc-b">' + esc(n.body) + '</div>' : '') +
      '<div class="nc-m">' + esc(n.byName || '') + ' · ' + ncTime(n.createdAt) + '</div></div>';
  },
  renderPanel() {
    const p = $('#ncPanel'); if (!p) return;
    const mine = this.mine();
    const un = mine.filter(n => !(n.readBy || []).includes(Session.user.id));
    const rd = mine.filter(n => (n.readBy || []).includes(Session.user.id)).slice(0, 30);
    p.innerHTML = '<div class="nc-head"><span>通知中心' + (un.length ? '（' + un.length + ' 条未读）' : '') + '</span>' +
      (un.length ? '<span class="lk link-op" id="ncReadAll">全部标为已读</span>' : '') + '</div>' +
      (un.length ? '<div class="nc-sec">未读</div>' + un.map(n => this.itemHTML(n, true)).join('') : '') +
      (rd.length ? '<div class="nc-sec">已读</div>' + rd.map(n => this.itemHTML(n, false)).join('') : '') +
      (!mine.length ? '<div class="nc-empty">暂无与您相关的通知</div>' : '');
    if ($('#ncReadAll')) $('#ncReadAll').addEventListener('click', e => { e.stopPropagation(); this.markAllRead(); });
    p.querySelectorAll('.nc-item').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); this.onItemClick(el.dataset.id); }));
  },
  /* 通知点击：收货反馈 → 打开需方消息详情；其余 → 跳转关联模块 */
  onItemClick(id) {
    const n = this.list().find(x => x.id === id); if (!n) return;
    this.markRead(id);
    this.togglePanel(false); closeModal();
    if (n.kind === 'receive' && n.refShip) {
      const s = Data.all('shipments').filter(x => x.shipNumber === n.refShip)
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
      if (s) { showSupplierMsg(s); return; }
    }
    if (n.refPage && Session.can(n.refPage)) {
      if (State.page !== n.refPage) location.href = n.refPage + '.html';
      else renderPage();
    }
  },
  /* ---------- 登录后弹出：本人有未读通知时先弹提示窗口 ---------- */
  entryCheck() {
    if (!Session.user) return;
    this.__lastUnread = this.unread().length;
    setTimeout(() => {
      if (!Session.user || !$('#modalMask')) return;
      const un = this.unread(); if (!un.length) return;
      if ($('#modalMask').classList.contains('show')) return; // 已有弹窗（如需方消息）：不打架，角标仍会提示
      this.openModalList(un);
    }, 700);
  },
  openModalList(list) {
    openModal('<h3>🔔 通知 · 您有 ' + list.length + ' 条未读</h3>' +
      '<div style="max-height:56vh;overflow-y:auto;margin:4px 0 10px">' +
      list.slice(0, 30).map(n => this.itemHTML(n, true)).join('') +
      (list.length > 30 ? '<div class="nc-empty">其余 ' + (list.length - 30) + ' 条可在页首铃铛中查看</div>' : '') + '</div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-outline" onclick="closeModal()">关闭</button>' +
      '<button type="button" class="btn btn-primary" id="ncModalReadAll">全部标为已读</button></div>');
    $('#ncModalReadAll').addEventListener('click', () => { this.markAllRead(); closeModal(); toast('已全部标为已读', 'ok'); });
    $$('#modalBox .nc-item').forEach(el => el.addEventListener('click', () => this.onItemClick(el.dataset.id)));
  }
};
window.NC = NC;
function ncTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' 天前';
  return fmtDate(iso);
}
/* ---------- 铃铛 + 头像注入页首用户区（所有业务页共用，免逐页改 HTML） ---------- */
(function ncInjectUI() {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    const box = document.querySelector('.userbox');
    if (!box || $('#ncBell')) return;
    /* 登录人头像（姓名首字 + 稳定取色）：多个采购员同角色也可一眼区分 */
    const ava = document.createElement('span');
    ava.className = 'u-ava'; ava.id = 'whoAva';
    box.insertBefore(ava, box.firstChild);
    /* 铃铛 + 下拉面板 */
    const wrap = document.createElement('div');
    wrap.className = 'nc-wrap'; wrap.id = 'ncWrap';
    wrap.innerHTML = '<button class="nc-bell" id="ncBell" type="button" title="通知中心（未读 / 已读）" aria-label="通知中心">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
      '<span class="nc-badge" id="ncBadge"></span></button>' +
      '<div class="nc-panel" id="ncPanel" style="display:none"></div>';
    box.insertBefore(wrap, box.firstChild);
    $('#ncBell').addEventListener('click', e => { e.stopPropagation(); NC.togglePanel(); });
    document.addEventListener('click', e => {
      const p = $('#ncPanel');
      if (p && p.style.display !== 'none' && !(e.target.closest && e.target.closest('#ncWrap'))) NC.togglePanel(false);
    });
    NC.paintUserbox();
  });
})();
/* ---------- 云端到达新通知：刷新角标 + 轻提示（不弹窗打断操作） ---------- */
window.addEventListener('cloud-data-updated', e => {
  if (!Session.user || !window.NC) return;
  const n = NC.unread().length;
  if (!e || !e.detail || !e.detail.initial) {
    if (typeof NC.__lastUnread === 'number' && n > NC.__lastUnread) {
      toast('🔔 您有 ' + (n - NC.__lastUnread) + ' 条新通知，点击页首铃铛查看', 'info');
    }
  }
  NC.__lastUnread = n;
  NC.refreshBadge();
});
