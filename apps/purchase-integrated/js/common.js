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

/* ---------- 数据层（CloudBase 预留适配） ---------- */
/* 说明：后期迁移腾讯 CloudBase（TCB）时：
   1) 在页面引入 TCB JS SDK 并在【系统管理→数据与云】填入环境 ID；
   2) CloudBase.push()/pull() 提供全量快照上传/下载（与现有 cloudbase-sync 模式一致）；
   3) DB.driver 可替换为云数据库逐集合读写，业务代码无需改动（全部经 DB/Data 层）。 */
const DB = {
  prefix: 'pis_',
  get(k, d) { try { const v = localStorage.getItem(this.prefix + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(this.prefix + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(this.prefix + k); },
  snapshot() {
    const out = {}; const p = this.prefix;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) out[k.slice(p.length)] = localStorage.getItem(k);
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
const CloudBase = {
  env() { return DB.get('cb_env', ''); },
  setEnv(v) { DB.set('cb_env', String(v || '').trim()); },
  ready() { return !!this.env() && typeof window.cloudbase !== 'undefined'; },
  async push() {
    if (!this.ready()) throw new Error('CloudBase 未就绪：请配置环境 ID 并引入 TCB JS SDK');
    const app = window.cloudbase.init({ env: this.env() });
    const db = app.database();
    const snap = DB.snapshot();
    const res = await db.collection('pis_snapshots').where({ app: 'purchase-integrated' }).get();
    if (res.data.length) await db.collection('pis_snapshots').doc(res.data[0]._id).update({ payload: snap, updatedAt: new Date().toISOString() });
    else await db.collection('pis_snapshots').add({ app: 'purchase-integrated', payload: snap, updatedAt: new Date().toISOString() });
    return true;
  },
  async pull() {
    if (!this.ready()) throw new Error('CloudBase 未就绪：请配置环境 ID 并引入 TCB JS SDK');
    const app = window.cloudbase.init({ env: this.env() });
    const db = app.database();
    const res = await db.collection('pis_snapshots').where({ app: 'purchase-integrated' }).get();
    if (!res.data.length) throw new Error('云端暂无快照');
    DB.restore(res.data[0].payload);
    return true;
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

function seed() {
  if (!DB.get('companies', null)) DB.set('companies', DEFAULT_COMPANIES);
  if (!DB.get('units', null)) DB.set('units', DEFAULT_UNITS);
  if (!DB.get('terms', null)) DB.set('terms', DEFAULT_TERMS);
  if (!DB.get('roles', null)) DB.set('roles', DEFAULT_ROLES);
  if (!DB.get('users', null)) {
    DB.set('users', [{ id: uid(), username: 'admin', pwd: 'seed:admin123', name: '系统管理员', role: 'admin', supplierName: '', active: true, createdAt: new Date().toISOString() }]);
  }
  if (!DB.get('suppliers', null)) DB.set('suppliers', []);
}

/* ---------- 密码 ---------- */
async function hashPwd(pwd) {
  const salted = 'pis::' + pwd;
  try {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return 's1:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* 回退 */ }
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < salted.length; i++) { const c = salted.charCodeAt(i); h1 = ((h1 << 5) + h1 + c) >>> 0; h2 = ((h2 << 5) + h2 ^ c) >>> 0; }
  return 'f1:' + h1.toString(16) + '-' + h2.toString(16);
}
async function ensureAdminHash() { // 把种子密码升级为哈希
  const users = DB.get('users', []);
  const admin = users.find(u => u.username === 'admin');
  if (admin && admin.pwd === 'seed:admin123') { admin.pwd = await hashPwd('admin123'); DB.set('users', users); }
}

/* ---------- 会话与权限（三态：rw 读写 / r 只读 / none 不显示） ---------- */
const Session = {
  user: null,
  role() { return (DB.get('roles', []).find(r => r.key === (this.user && this.user.role)) || {}); },
  isSupplier() { const r = this.role(); return !!(r && r.supplierRole); },
  isAdmin() { return this.user && this.user.role === 'admin'; },
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
    if (this.isSupplier()) return page === 'ship';      // 供应商仅发货管理可写
    return true;
  },
  mySupplier() { return this.isSupplier() ? this.user.supplierName : ''; }
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
  add(coll, rec) { const arr = DB.get(coll, []); arr.unshift(rec); DB.set(coll, arr); },
  update(coll, id, patch) { const arr = DB.get(coll, []); const i = arr.findIndex(r => r.id === id); if (i > -1) { Object.assign(arr[i], patch, { updatedAt: new Date().toISOString() }); DB.set(coll, arr); } },
  remove(coll, id) { DB.set(coll, DB.get(coll, []).filter(r => r.id !== id)); }
};
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
function paidOfContract(cno) { return Data.list('payments').filter(p => splitMulti(p.contractNumber).includes(cno)).reduce((s, p) => s + (+p.amount || 0), 0); }
function paidOfInvoice(invNo) { return Data.list('payments').filter(p => splitMulti(p.invoiceNumbers).includes(invNo)).reduce((s, p) => s + (+p.amount || 0), 0); }
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
function renderFrame() {
  const u = Session.user; if (!u) return;
  if ($('#whoName')) $('#whoName').textContent = u.username;
  if ($('#companySelectWrap')) $('#companySelectWrap').style.display = Session.isSupplier() ? 'none' : 'flex';
  if ($('#companySelect')) {
    const comps = DB.get('companies', []);
    $('#companySelect').innerHTML = '<option value="' + ALL_COMPANIES + '"' + (State.company === ALL_COMPANIES ? ' selected' : '') + '>全部公司</option>' +
      comps.map(c => '<option value="' + esc(c.code) + '"' + (c.code === State.company ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  }
  renderNav(); renderPage();
}
function renderNav() {
  if (!$('#navMenu')) return;
  const groups = {};
  PAGES.filter(p => !p.adminOnly || Session.isAdmin()).forEach(p => {
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
  html += '<div class="mfoot">采购一体化系统 v2.0<br>多模块 · 本地存储 · CloudBase 就绪</div>';
  $('#navMenu').innerHTML = html;
  $$('#navMenu .mitem').forEach(el => el.addEventListener('click', () => { closeNavMenu(); goto(el.dataset.page); }));
}
function closeNavMenu() {
  const m = $('#navMenu'); if (m) m.classList.remove('show');
  const b = $('#navMenuBtn'); if (b) b.classList.remove('on');
}
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
  State.company = DB.get('curCompany', '普利美');
  const comps = DB.get('companies', []);
  if (!comps.length) State.company = '普利美'; // 无公司档案时不允许停留在哨兵值
  else if (State.company !== ALL_COMPANIES && !comps.find(c => c.code === State.company)) State.company = comps[0].code;
  renderFrame();
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

/* ---------- “菜单”下拉开关（点击外部关闭） ---------- */
if ($('#navMenuBtn')) $('#navMenuBtn').addEventListener('click', e => {
  e.stopPropagation();
  const m = $('#navMenu'), btn = $('#navMenuBtn');
  const show = !m.classList.contains('show');
  m.classList.toggle('show', show); btn.classList.toggle('on', show);
});
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
