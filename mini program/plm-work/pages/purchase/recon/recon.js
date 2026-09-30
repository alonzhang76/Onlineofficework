/**
 * 对账管理 — 2 页签
 *  ① 合同对账总表：合同三流对账（货 / 票 / 款），严格区分未执行合同
 *  ② 供应商对账单（A4）：按供应商 + 起止日期生成流水，输出 A4 PDF
 * 业务口径全部来自 db.contractRecon / db.reconRows / db.reconStatement（与桌面端 recon.html 一致）。
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');
const pdfShare = require('../../../utils/pdf-share');

const TAB_LEDGER = 'ledger', TAB_STATEMENT = 'statement';
const STATE_FILTERS = ['全部执行状态', '已执行完', '执行中', '未执行'];
const STATE_MAP = { '已执行完': 'done', '执行中': 'running', '未执行': 'idle' };

Page({
  data: {
    ready: false, denied: false, isSupplier: false,

    tab: TAB_LEDGER, tabNames: ['合同对账总表', '供应商对账单（A4）'],

    /* ---- 总表 ---- */
    kw: '',
    stateOptions: STATE_FILTERS, stateIdx: 0,
    kpi: {},
    groups: [],      // [{ key, title, total, amount, rows:[] }]
    rowCount: 0,
    expanded: {},    // cno -> { detail }

    /* ---- 对账单 ---- */
    supOptions: ['请选择供应商'], supIdx: 0,
    dateFrom: '', dateTo: '',
    stmt: null,
    pdfReady: false, pdfPath: '', pdfName: '',

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('recon')) { this.setData({ denied: true, ready: true }); return; }
    const isSup = db.Session.isSupplier();
    this.setData({ ready: true, isSupplier: isSup });
    // 供应商登录：对账单供应商锁定为本人
    if (isSup) this.lockSupplier();
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => { this.render(); wx.stopPullDownRefresh(); });
  },

  /** 供应商名单 = 合同供应商 ∪ 供应商档案名（去重升序） */
  supplierPool() {
    const set = {};
    db.supplierNames().forEach(n => { if (n) set[n] = 1; });
    db.list('orders').forEach(o => { if (o.supplier) set[o.supplier] = 1; });
    return Object.keys(set).sort();
  },

  lockSupplier() {
    const me = db.Session.mySupplier();
    if (!me) return;
    this.setData({ supOptions: ['请选择供应商', me], supIdx: 1 });
  },

  onTab(e) {
    const i = +e.currentTarget.dataset.i;
    this.setData({ tab: i === 0 ? TAB_LEDGER : TAB_STATEMENT });
    if (i === 1 && !this.data.isSupplier) this.setData({ supOptions: ['请选择供应商'].concat(this.supplierPool()) });
    this.render();
  },

  /* ==================== 总表 ==================== */

  render() {
    const all = db.reconRows();
    const idleAll = all.filter(r => r.state === 'idle');
    const runAll = all.filter(r => r.state === 'running');
    const doneAll = all.filter(r => r.state === 'done');
    const sumOf = arr => db.r2(arr.reduce((s, r) => s + r.totalAmount, 0));

    const kpi = {
      total: all.length, totalAmt: fmt.fmtMoney(sumOf(all)),
      idle: idleAll.length, idleAmt: fmt.fmtMoney(sumOf(idleAll)),
      run: runAll.length, runAmt: fmt.fmtMoney(sumOf(runAll)),
      done: doneAll.length, doneAmt: fmt.fmtMoney(sumOf(doneAll)),
      waitInv: fmt.fmtMoney(db.r2(runAll.concat(doneAll).reduce((s, r) => s + r.waitInv, 0))),
      waitPay: fmt.fmtMoney(db.r2(runAll.concat(doneAll).reduce((s, r) => s + r.waitPay, 0)))
    };

    // 筛选
    const kw = String(this.data.kw || '').trim().toLowerCase();
    const state = this.data.stateIdx > 0 ? STATE_MAP[this.data.stateOptions[this.data.stateIdx]] : '';
    let rows = all.slice();
    if (state) rows = rows.filter(r => r.state === state);
    if (kw) rows = rows.filter(r => (r.contractNumber + ' ' + r.supplier).toLowerCase().indexOf(kw) >= 0);

    // 分组（与桌面端一致的顺序，未执行置底）
    const order = [
      { k: 'done', title: '已执行完（货清 · 票清 · 款清）' },
      { k: 'running', title: '执行中（已发生收货 / 开票 / 付款）' },
      { k: 'idle', title: '未执行（已签订合同，尚未送货、未开票、未付款——不参与应收应付对账）' }
    ];
    const groups = [];
    order.forEach(o => {
      const list = rows.filter(r => r.state === o.k).map(r => this.decorate(r));
      if (!list.length) return;
      groups.push({
        key: o.k, title: o.title, count: list.length,
        amount: fmt.fmtMoney(db.r2(list.reduce((s, r) => s + db.num(r.totalAmount), 0))),
        rows: list
      });
    });

    const expanded = {};
    Object.keys(this.data.expanded).forEach(k => { if (this.data.expanded[k]) expanded[k] = 1; });
    groups.forEach(g => g.rows.forEach(r => { r.open = !!expanded[r.contractNumber]; }));

    this.setData({ kpi: kpi, groups: groups, rowCount: rows.length });
  },

  /** 单行补上货流 / 票流 / 款流徽章与差异文案 */
  decorate(r) {
    const ordered = db.num(r.orderedQty), recv = db.num(r.receivedQty), shipped = db.num(r.shippedQty);
    let goods;
    if (recv >= ordered - 0.005 && ordered > 0) goods = { t: '已收齐 ' + recv + '/' + ordered, c: 'badge-green' };
    else if (recv > 0.005) goods = { t: '部分收货 ' + recv + '/' + ordered, c: 'badge-orange' };
    else if (shipped > 0.005) goods = { t: (shipped >= ordered - 0.005 ? '已发货 ' : '部分发货 ') + shipped + '/' + ordered, c: 'badge-blue' };
    else goods = { t: '未发货', c: 'badge-gray' };

    const inv = db.num(r.invoiced), recvAmt = db.num(r.recvAmount);
    let bill;
    if (inv <= 0.005) bill = { t: '未开票', c: 'badge-gray' };
    else if (inv >= recvAmt - 0.005) bill = { t: '票齐', c: 'badge-green' };
    else bill = { t: '部分开票', c: 'badge-orange' };

    const paid = db.num(r.paid);
    let money;
    if (paid <= 0.005) money = { t: '未付款', c: 'badge-gray' };
    else if (paid >= inv - 0.005) money = { t: '款清', c: 'badge-green' };
    else money = { t: '部分付款', c: 'badge-orange' };

    let diff;
    if (r.overPay > 0.005) diff = { t: '付款超票 ¥' + fmt.fmtMoney(r.overPay), c: 'diff-red' };
    else if (r.waitPay > 0.005) diff = { t: '待付款 ¥' + fmt.fmtMoney(r.waitPay), c: 'diff-orange' };
    else if (r.waitInv > 0.005) diff = { t: '待开票 ¥' + fmt.fmtMoney(r.waitInv), c: 'diff-blue' };
    else diff = { t: '三流一致', c: 'diff-green' };

    return Object.assign({}, r, {
      totalAmount: fmt.fmtMoney(r.totalAmount),
      goodsText: goods.t, goodsClass: goods.c,
      billText: bill.t, billClass: bill.c,
      moneyText: money.t, moneyClass: money.c,
      diffText: diff.t, diffClass: diff.c,
      billSub: '应收票 ¥' + fmt.fmtMoney(recvAmt) + ' / 已开 ¥' + fmt.fmtMoney(inv),
      moneySub: '已开 ¥' + fmt.fmtMoney(inv) + ' / 已付 ¥' + fmt.fmtMoney(paid),
      isIdle: r.state === 'idle'
    });
  },

  toggleDetail(e) {
    const cno = e.currentTarget.dataset.cno;
    const ex = Object.assign({}, this.data.expanded);
    ex[cno] = !ex[cno];
    this.setData({ expanded: ex });
    if (ex[cno]) this.buildDetail(cno);
    else this.render();
  },

  /** 展开明细：未执行 → 产品表；执行中/已执行完 → 发票清单 + 付款清单 */
  buildDetail(cno) {
    const r = db.reconRows().find(x => x.contractNumber === cno);
    if (!r) return;
    const o = db.orderByNo(cno);
    const products = o ? db.orderProducts(o) : [];
    const detail = { idle: r.state === 'idle', products: [], invoices: [], pays: [], overPay: r.overPay };

    if (detail.idle) {
      detail.products = products.map(p => ({
        product: p.name || '', ordered: db.num(p.quantity),
        unitPrice: fmt.fmtMoney(p.unitPrice), amount: fmt.fmtMoney(db.productAmount(p)),
        received: db.r2(db.receivedQty(cno, p.name)), shipStatus: '未发货'
      }));
    } else {
      detail.invoices = db.list('invoices').filter(v => db.splitMulti(v.contractNumber).indexOf(cno) >= 0)
        .map(v => ({ invoiceNumber: v.invoiceNumber, invoiceDate: v.invoiceDate || '', itemName: v.itemName || '', amount: fmt.fmtMoney(v.amount) }));
      db.Pay.payRows(cno).forEach(p => {
        detail.pays.push({
          paymentDate: p.paymentDate || '', paymentNumber: p.paymentNumber,
          invoiceNumbers: p.invoiceNumbers || p.paymentNumber,
          method: p.method || '', amount: fmt.fmtMoney(p.amount)
        });
      });
    }

    const groups = this.data.groups.map(g => Object.assign({}, g, {
      rows: g.rows.map(x => Object.assign({}, x, {
        open: x.contractNumber === cno,
        detail: x.contractNumber === cno ? detail : x.detail
      }))
    }));
    this.setData({ groups: groups });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onState(e) { this.setData({ stateIdx: +e.detail.value }); this.render(); },
  resetFilter() { this.setData({ kw: '', stateIdx: 0 }); this.render(); },

  exportLedger() {
    const all = db.reconRows();
    if (!all.length) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }
    const out = [['合同号', '供应商', '合同金额', '执行状态', '订购数量', '已收数量', '已发货数量', '已收货金额', '已开票金额', '已付款金额', '待开票', '待付款', '付款超票']];
    all.forEach(r => out.push([
      r.contractNumber, r.supplier, fmt.fmtMoney(r.totalAmount), r.stateText,
      r.orderedQty, r.receivedQty, r.shippedQty, fmt.fmtMoney(r.recvAmount),
      fmt.fmtMoney(r.invoiced), fmt.fmtMoney(r.paid), fmt.fmtMoney(r.waitInv), fmt.fmtMoney(r.waitPay), fmt.fmtMoney(r.overPay)
    ]));
    csv.exportFile('合同对账总表_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  /* ==================== 供应商对账单 ==================== */

  onSup(e) {
    const i = +e.detail.value;
    this.setData({ supIdx: i, stmt: null, pdfReady: false });
  },
  onFrom(e) { this.setData({ dateFrom: e.detail.value, stmt: null, pdfReady: false }); },
  onTo(e) { this.setData({ dateTo: e.detail.value, stmt: null, pdfReady: false }); },

  genStatement() {
    const sup = this.data.supOptions[this.data.supIdx];
    if (!sup || this.data.supIdx === 0) { wx.showToast({ title: '请选择供应商', icon: 'none' }); return; }
    const st = db.reconStatement(sup, this.data.dateFrom, this.data.dateTo);
    const docNo = db.reconDocNo(sup);
    this.setData({
      pdfReady: false,
      stmt: {
        supplier: sup, docNo: docNo,
        buyerName: db.buyerInfoOf(db.curCompany()).companyName,
        dateFrom: this.data.dateFrom || '起始',
        dateTo: this.data.dateTo || fmt.today(),
        rows: st.rows.map(r => ({
          seq: r.seq, date: r.date || '', type: r.type, docNo: r.docNo,
          contractNumber: r.contractNumber || '',
          invoice: r.invoice ? fmt.fmtMoney(r.invoice) : '',
          payment: r.payment ? fmt.fmtMoney(r.payment) : '',
          balance: fmt.fmtMoney(r.balance)
        })),
        totalInvoice: fmt.fmtMoney(st.totalInvoice),
        totalPayment: fmt.fmtMoney(st.totalPayment),
        balance: fmt.fmtMoney(st.balance),
        cnt: st.rows.length,
        payCnt: st.rows.filter(r => r.type === '付款').length
      }
    });
    if (!st.rows.length) wx.showToast({ title: '该期间内暂无开票 / 付款记录', icon: 'none' });
  },

  /** 第一步：渲染并生成对账单 PDF（可异步重活） */
  buildStatementPdf() {
    const s = this.data.stmt;
    if (!s) { wx.showToast({ title: '请先生成对账单', icon: 'none' }); return; }
    if (!s.rows.length) { wx.showToast({ title: '该期间内暂无流水，无需打印', icon: 'none' }); return; }
    const buyer = db.buyerInfoOf(db.curCompany());
    const payload = {
      docNo: s.docNo, supplier: s.supplier,
      buyerName: buyer.companyName,
      dateFrom: s.dateFrom, dateTo: s.dateTo,
      rows: s.rows.map(r => ({
        seq: r.seq, date: r.date, type: r.type, docNo: r.docNo, contractNumber: r.contractNumber,
        invoice: db.num(r.invoice), payment: db.num(r.payment), balance: db.num(r.balance)
      })),
      totalInvoice: db.num(s.totalInvoice), totalPayment: db.num(s.totalPayment), balance: db.num(s.balance)
    };
    pdfShare.buildFile(pdfShare.docRenderers.renderReconStatement, payload,
      '对账单_' + s.supplier, 'portrait', (ok, path) => {
        if (!ok) return;
        this.setData({ pdfReady: true, pdfPath: path, pdfName: '对账单_' + s.supplier + '.pdf' });
      });
  },

  /** 第二步：发送（必须 tap 同步栈内直呼） */
  sendPdf() { pdfShare.sharePrepared(this.data.pdfPath, () => {}); },

  exportStatement() {
    const s = this.data.stmt;
    if (!s || !s.rows.length) { wx.showToast({ title: '请先生成对账单', icon: 'none' }); return; }
    const out = [['序号', '日期', '类型', '单据号', '合同号', '开票金额', '付款金额', '累计余额']];
    s.rows.forEach(r => out.push([r.seq, r.date, r.type, r.docNo, r.contractNumber, r.invoice, r.payment, r.balance]));
    out.push(['', '', '', '', '开票合计', s.totalInvoice, '', '']);
    out.push(['', '', '', '', '付款合计', '', s.totalPayment, '']);
    out.push(['', '', '', '', '未付余额', '', '', s.balance]);
    csv.exportFile('对账单_' + s.supplier + '_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  noop() {}
});
