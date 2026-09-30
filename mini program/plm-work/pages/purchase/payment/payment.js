/**
 * 付款管理（只读）
 * 桌面端此页数据来自报销系统 HTTP 接口（收票付款统计 + 付款记录）。
 * 小程序无法访问电脑的 127.0.0.1，故改由 db.Pay 从云端 reim_invoices 派生，
 * 口径与桌面端 ReimPay 完全一致：paid_amount 封顶票面 / project 关联合同 / seller_name 为供应商。
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const reim = require('../../../utils/reim-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const PAY_FILTERS = ['全部', '已付清', '部分付款', '未付款'];

Page({
  data: {
    ready: false, denied: false, isSupplier: false,

    kw: '',
    payOptions: PAY_FILTERS, payIdx: 0,

    // KPI（全量口径，不随筛选变化）
    kpi: { supLabel: '涉及供应商', supValue: '0 家', total: '0.00', paid: '0.00', owed: '0.00', pct: 0, doneTxt: '已付清 0 / 0 张' },

    // 供应商付款总览
    groups: [], groupCount: 0,
    expanded: {},

    // 付款记录明细
    rows: [], rowCount: 0, rowPaid: '0.00',

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('payment')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true, isSupplier: db.Session.isSupplier() });
    this.render();
  },

  onShow() {
    if (!this.data.ready || this.data.denied) return;
    if (typeof supa.getSyncState === 'function') this.setData({ __syncState: supa.getSyncState() });
    // 付款数据来自报销台账，每次进入自动对账一次
    try { db.Pay.reconcile(); } catch (e) {}
    this.render();
  },

  onPullDownRefresh() {
    db.syncFromCloud(() => {
      reim.syncFromCloud(() => {
        try { db.Pay.reconcile(); } catch (e) {}
        this.render();
        wx.stopPullDownRefresh();
      });
    });
  },

  /** 从报销台账强制重拉（对应桌面端「⟳ 刷新」） */
  refresh() {
    wx.showLoading({ title: '同步报销数据…' });
    reim.syncFromCloud((ok) => {
      try { db.Pay.reconcile(); } catch (e) {}
      wx.hideLoading();
      this.render();
      wx.showToast({ title: ok ? '报销台账已同步' : '同步失败，请检查网络', icon: 'none' });
    });
  },

  render() {
    const isSup = this.data.isSupplier;
    const me = isSup ? db.Session.mySupplier() : '';
    const pays = db.Pay.payRows();

    // 参与统计的发票（供应商视角只算自己的）
    const allInv = db.reimInvoices().filter(v => {
      if (!v || v.direction === '销项') return false;
      if (!isSup) return true;
      return (db.matchReimSupplier(v.seller_name) || {}).supplierName === me || v.seller_name === me;
    });
    const sTotal = db.r2(allInv.reduce((s, v) => s + db.num(v.total_amount), 0));
    const sPaid = db.r2(allInv.reduce((s, v) => s + Math.min(db.num(v.paid_amount), db.num(v.total_amount)), 0));
    const sOwed = db.r2(Math.max(0, sTotal - sPaid));
    const doneCnt = allInv.filter(v => Math.min(db.num(v.paid_amount), db.num(v.total_amount)) >= db.num(v.total_amount) - 0.005 && db.num(v.total_amount) > 0).length;
    const supSet = {};
    allInv.forEach(v => {
      const n = (db.matchReimSupplier(v.seller_name) || {}).supplierName || v.seller_name || '';
      if (n) supSet[n] = 1;
    });

    const kpi = {
      supLabel: isSup ? '我的发票' : '涉及供应商',
      supValue: isSup ? (allInv.length + ' 张') : (Object.keys(supSet).length + ' 家'),
      total: fmt.fmtMoney(sTotal),
      paid: fmt.fmtMoney(sPaid),
      owed: fmt.fmtMoney(sOwed),
      pct: sTotal > 0.004 ? Math.round(sPaid / sTotal * 100) : 0,
      doneTxt: '已付清 ' + doneCnt + ' / ' + allInv.length + ' 张'
    };

    /* ---------- 付款记录明细：先按筛选过滤，再汇总 ---------- */
    const kw = String(this.data.kw || '').trim().toLowerCase();
    const paySel = this.data.payIdx > 0 ? this.data.payOptions[this.data.payIdx] : '';

    let rows = pays.map(p => {
      const inv = db.list('invoices').find(v => String(v.invoiceNumber) === String(p.paymentNumber)) || {};
      const rr = db.reimInvoices().find(x => String(x.invoice_no) === String(p.paymentNumber)) || {};
      // 收款对象：报销人 → 显示报销人姓名；供应商 → 显示收款单位全称（与桌面端 ReimPay 同口径）
      const payeeLabel = String(rr.payee || '').indexOf('报销人') >= 0 ? '报销人' : '供应商';
      const payee = payeeLabel === '报销人' ? (rr.claimant || '') : (rr.seller_name || p.supplier || '');
      const total = db.num(rr.total_amount) || db.num(inv.amount) || db.num(p.amount);
      const st = db.invoiceStatus({ invoiceNumber: p.paymentNumber, amount: total });
      const left = db.r2(Math.max(0, total - db.num(p.amount)));
      return {
        paymentNumber: p.paymentNumber,
        paymentDate: p.paymentDate || '',
        method: p.method || '',
        supplier: p.supplier || '',
        payeeLabel: payeeLabel,
        payee: payee || '',
        invoiceType: inv.invoiceType || rr.invoice_type || '',
        invoiceDate: inv.invoiceDate || rr.invoice_date || '',
        itemName: p.itemName || inv.itemName || rr.item_name || '',
        total: fmt.fmtMoney(total),
        amount: fmt.fmtMoney(p.amount),
        amountRaw: db.num(p.amount),
        left: left > 0.005 ? fmt.fmtMoney(left) : '',
        statusText: st.t, statusClass: st.c,
        contractNumber: p.contractNumber || '',
        remark: p.remark || ''
      };
    });

    if (paySel) rows = rows.filter(r => r.statusText === paySel);
    if (kw) {
      rows = rows.filter(r => {
        const hay = [r.paymentNumber, r.supplier, r.payee, r.itemName, r.method, r.remark,
          r.contractNumber, r.invoiceType, r.paymentDate].join(' ').toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    }
    rows.sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));

    /* ---------- 供应商付款总览：按筛选后的发票聚合 ---------- */
    const map = {};
    const bucket = k => { if (!map[k]) map[k] = { supplier: k, cnt: 0, total: 0, paid: 0, last: '', contracts: [] }; return map[k]; };
    allInv.forEach(v => {
      const name = (db.matchReimSupplier(v.seller_name) || {}).supplierName || v.seller_name || '—';
      const m = bucket(name);
      const paid = Math.min(db.num(v.paid_amount), db.num(v.total_amount));
      m.cnt++;
      m.total += db.num(v.total_amount);
      m.paid += paid;
      const d = v.payment_date || '';
      if (d && d > m.last) m.last = d;
      db.splitMulti(v.project).forEach(c => { if (c && m.contracts.indexOf(c) < 0) m.contracts.push(c); });
    });

    let groups = Object.keys(map).map(k => {
      const m = map[k];
      const total = db.r2(m.total), paid = db.r2(m.paid);
      const owed = db.r2(Math.max(0, total - paid));
      const st = paid <= 0 ? { t: '未付款', c: 'badge-gray' }
        : paid >= total - 0.005 ? { t: '已付清', c: 'badge-green' } : { t: '部分付款', c: 'badge-orange' };
      return {
        supplier: m.supplier, cnt: m.cnt,
        total: fmt.fmtMoney(total), paid: fmt.fmtMoney(paid), owed: fmt.fmtMoney(owed),
        pct: total > 0.004 ? Math.round(paid / total * 100) : 0,
        last: m.last || '',
        contractsText: m.contracts.length ? (m.contracts.slice(0, 3).join('、') + (m.contracts.length > 3 ? ' 等 ' + m.contracts.length + ' 个' : '')) : '',
        statusText: st.t, statusClass: st.c,
        children: pays.filter(p => p.supplier === m.supplier).map(p => {
          const inv = db.list('invoices').find(v => String(v.invoiceNumber) === String(p.paymentNumber)) || {};
          const t = db.num(inv.amount) || db.num(p.amount);
          const ist = db.invoiceStatus({ invoiceNumber: p.paymentNumber, amount: t });
          const lf = db.r2(Math.max(0, t - db.num(p.amount)));
          return {
            invoiceNumber: p.paymentNumber, invoiceType: inv.invoiceType || '',
            invoiceDate: inv.invoiceDate || '', itemName: p.itemName || inv.itemName || '',
            total: fmt.fmtMoney(t), paid: fmt.fmtMoney(p.amount),
            left: lf > 0.005 ? fmt.fmtMoney(lf) : '',
            statusText: ist.t, statusClass: ist.c,
            payDate: p.paymentDate || '', method: p.method || '',
            contractNumber: p.contractNumber || ''
          };
        })
      };
    });
    // 搜索/状态筛选落到供应商维度（任一子票命中即保留）
    if (kw || paySel) {
      groups = groups.filter(g => g.children.some(c => {
        if (paySel && c.statusText !== paySel) return false;
        if (!kw) return true;
        return [c.invoiceNumber, c.itemName, c.contractNumber, g.supplier, c.method].join(' ').toLowerCase().indexOf(kw) >= 0;
      }));
    }
    groups.sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')) || (db.num(b.total) - db.num(a.total)));

    const expanded = {};
    Object.keys(this.data.expanded).forEach(k => { if (this.data.expanded[k]) expanded[k] = true; });
    groups.forEach(g => { g.open = !!expanded[g.supplier]; });

    this.setData({
      kpi: kpi,
      groups: groups, groupCount: groups.length,
      rows: rows, rowCount: rows.length,
      rowPaid: fmt.fmtMoney(rows.reduce((s, r) => s + r.amountRaw, 0))
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onPay(e) { this.setData({ payIdx: +e.detail.value }); this.render(); },
  resetFilter() { this.setData({ kw: '', payIdx: 0 }); this.render(); },

  toggleGroup(e) {
    const name = e.currentTarget.dataset.name;
    const ex = Object.assign({}, this.data.expanded);
    ex[name] = !ex[name];
    this.setData({ expanded: ex });
    this.render();
  },

  /* ==================== 导出 ==================== */

  exportGroups() {
    const gs = this.data.groups;
    if (!gs.length) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }
    const out = [['供应商', '发票张数', '价税合计', '已付款', '未付欠款', '付款进度', '最近付款日期', '关联合同']];
    gs.forEach(g => out.push([g.supplier, g.cnt, g.total, g.paid, g.owed, g.pct + '%', g.last, g.contractsText]));
    csv.exportFile('供应商付款总览_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  exportRows() {
    const rs = this.data.rows;
    if (!rs.length) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }
    const out = [['付款日期', '付款方式', '收款对象', '收款单位/人', '发票号码', '发票类型', '开票日期',
      '品名', '价税合计', '已付金额', '未付差额', '付款状态', '关联合同', '备注']];
    rs.forEach(r => out.push([r.paymentDate, r.method, r.payeeLabel, r.payee, r.paymentNumber, r.invoiceType,
      r.invoiceDate, r.itemName, r.total, r.amount, r.left, r.statusText, r.contractNumber, r.remark]));
    csv.exportFile('付款记录明细_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  goRecon() { wx.navigateTo({ url: '/pages/purchase/recon/recon' }); },
  goInvoice() { wx.navigateTo({ url: '/pages/purchase/invoice/invoice' }); },
  noop() {}
});
