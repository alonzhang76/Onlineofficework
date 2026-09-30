/**
 * 工具箱 — 包装材料计算
 * ① 木箱计算器（长宽高 m / 板厚 mm / 托盘高 / 数量 / 单价 元·㎡ → 表面积、内外体积、总价、集装箱装载参考）
 * ② 方底袋子计算器（长宽高 cm / 数量 / 克重 / 分级单价 → 表面积、重量、适用单价、总价、单袋单价）
 * ③ 计算记录（最多 200 条，与桌面端一致）
 * 「复制尺寸」写入 pis_plyPaste，供采购合同「规格型号」粘贴联动（spec + unit='只' + price）。
 * 公式与桌面端 tools.html / ply box.html 完全一致。
 */
const db = require('../../../utils/purchase-db');
const supa = require('../../../utils/cloudbase');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const CONTAINERS = [
  { name: '20GP', L: 5.898, W: 2.352, H: 2.385, vol: 28 },
  { name: '40GP', L: 12.032, W: 2.352, H: 2.385, vol: 67 },
  { name: '40HQ', L: 12.032, W: 2.352, H: 2.697, vol: 76 }
];
const GSM_OPTIONS = ['120', '150', '180', '200'];

function d4(v) { return (Math.round((+v || 0) * 10000) / 10000).toFixed(4); }

Page({
  data: {
    ready: false, denied: false, canWrite: false,

    // 木箱
    bx: { L: '1.2', W: '1', H: '1', T: '15', P: '0.1', Q: '1', price: '55' },
    bxResult: null,
    bxFits: [],

    // 方底袋
    bg: { L: '60', W: '40', H: '15', Q: '1000', p1: '9', p2: '7' },
    gsmOptions: GSM_OPTIONS, gsmIdx: 1,
    bgResult: null,

    // 记录
    recs: [], recCount: 0,

    __syncState: 'idle'
  },

  onLoad() {
    db.loadSession();
    if (!db.Session.user) { wx.redirectTo({ url: '/pages/purchase/login/login' }); return; }
    if (!db.Session.can('tools')) { this.setData({ denied: true, ready: true }); return; }
    this.setData({ ready: true, canWrite: db.Session.canWrite('tools') });
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

  render() {
    const rows = db.toolRecords().map(r => ({
      id: r.id,
      at: String(r.at || '').replace('T', ' ').slice(0, 16),
      type: r.type,
      size: r.type === '木箱' ? (r.L + '×' + r.W + '×' + r.H + 'm') : (r.L + '×' + r.W + '×' + r.H + 'cm'),
      qty: r.Q,
      area: d2(r.totalArea || r.area),
      total: fmt.fmtMoney(r.total)
    }));
    this.setData({ recs: rows, recCount: rows.length });
  },

  /* ==================== 木箱 ==================== */

  onBx(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['bx.' + k]: e.detail.value });
  },

  calcBox() {
    const b = this.data.bx;
    const L = db.num(b.L), W = db.num(b.W), H = db.num(b.H);
    if (!(L > 0 && W > 0 && H > 0)) { wx.showToast({ title: '请填写长宽高', icon: 'none' }); return; }
    const T = db.num(b.T) / 1000, P = db.num(b.P), Q = Math.max(1, db.num(b.Q) || 1), price = db.num(b.price);

    const innerV = L * W * H;
    const oL = L + 2 * T, oW = W + 2 * T, oH = H + T + P;
    const outerV = oL * oW * oH, totalV = outerV * Q;
    const area = 2 * (L * W + L * H + W * H);
    const total = area * price * Q;

    // 集装箱装载参考
    const fits = CONTAINERS.map(c => {
      const use = Math.floor(c.L / oL) * Math.floor(c.W / oW) * Math.floor(c.H / oH);
      const useSwap = Math.floor(c.L / oW) * Math.floor(c.W / oL) * Math.floor(c.H / oH);
      const best = Math.max(use, useSwap);
      return {
        name: c.name, per: best,
        util: c.vol ? Math.min(100, Math.round(best * outerV / c.vol * 100)) : 0,
        need: best ? Math.ceil(Q / best) : '—'
      };
    }).filter(c => c.per > 0).sort((a, b2) => b2.util - a.util);

    this.__lastBox = {
      type: '木箱', L: L, W: W, H: H, T: db.num(b.T), P: P, Q: Q, price: price,
      innerV: innerV, outerV: outerV, totalV: totalV, area: area, total: total,
      at: new Date().toISOString()
    };

    this.setData({
      bxFits: fits,
      bxResult: {
        area: d4(area), innerV: d4(innerV), outerV: d4(outerV), totalV: d4(totalV),
        Q: Q, total: fmt.fmtMoney(total),
        fitTop: fits.length ? fits[0].per : 0
      }
    });
  },

  saveBox() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法保存', icon: 'none' }); return; }
    if (!this.__lastBox) { wx.showToast({ title: '请先完成一次计算', icon: 'none' }); return; }
    db.saveToolRecord(this.__lastBox);
    wx.showToast({ title: '已保存计算记录', icon: 'success' });
    this.render();
  },

  /** 复制尺寸 → 采购合同「规格型号」粘贴联动（与桌面端 pis_plyPaste 同一形状） */
  copyBoxSpec() {
    const b = this.data.bx;
    const L = db.num(b.L), W = db.num(b.W), H = db.num(b.H);
    if (!(L > 0 && W > 0 && H > 0)) { wx.showToast({ title: '请先填写尺寸并计算', icon: 'none' }); return; }
    const spec = L + '×' + W + '×' + H + 'm';
    const price = Math.round(2 * (L * W + L * H + W * H) * db.num(b.price));
    db.setPlyPaste({ spec: spec, unit: '只', price: price });
    wx.showToast({ title: '已复制尺寸，可在采购合同「规格型号」点「贴」带入', icon: 'none' });
  },

  /* ==================== 方底袋 ==================== */

  onBg(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ['bg.' + k]: e.detail.value });
  },
  onGsm(e) { this.setData({ gsmIdx: +e.detail.value }); },

  calcBag() {
    const b = this.data.bg;
    const L = db.num(b.L), W = db.num(b.W), H = db.num(b.H);
    if (!(L > 0 && W > 0 && H > 0)) { wx.showToast({ title: '请填写长宽高', icon: 'none' }); return; }
    const Q = Math.max(1, db.num(b.Q) || 1);
    const gsm = db.num(this.data.gsmOptions[this.data.gsmIdx]) || 150;
    const p1 = db.num(b.p1), p2 = db.num(b.p2);

    const area = (L * W + 2 * L * H + 2 * W * H) / 10000;
    const totalArea = area * Q;
    const w1 = area * gsm / 1000, tw = w1 * Q;
    const up = totalArea < 6 ? p1 : p2;
    const total = totalArea * up, unit = total / Q;

    this.__lastBag = {
      type: '方底袋', L: L, W: W, H: H, Q: Q, gsm: gsm,
      area: area, totalArea: totalArea, w1: w1, tw: tw, unit: unit, total: total,
      at: new Date().toISOString()
    };

    this.setData({
      bgResult: {
        area: d4(area), totalArea: d4(totalArea), w1: d4(w1), tw: d4(tw),
        Q: Q, up: fmt.fmtMoney(up), upNote: totalArea < 6 ? '<6㎡' : '≥6㎡',
        total: fmt.fmtMoney(total), unit: fmt.fmtMoney(unit)
      }
    });
  },

  saveBag() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法保存', icon: 'none' }); return; }
    if (!this.__lastBag) { wx.showToast({ title: '请先完成一次计算', icon: 'none' }); return; }
    db.saveToolRecord(this.__lastBag);
    wx.showToast({ title: '已保存计算记录', icon: 'success' });
    this.render();
  },

  copyBagSpec() {
    const b = this.data.bg;
    const L = db.num(b.L), W = db.num(b.W), H = db.num(b.H);
    if (!(L > 0 && W > 0 && H > 0)) { wx.showToast({ title: '请先填写尺寸并计算', icon: 'none' }); return; }
    const spec = L + '×' + W + '×' + H + 'cm';
    const bagArea = (L * W + 2 * L * H + 2 * W * H) / 10000;
    const Q = Math.max(1, db.num(b.Q) || 1);
    const up = (bagArea * Q) < 6 ? db.num(b.p1) : db.num(b.p2);
    db.setPlyPaste({ spec: spec, unit: '只', price: Math.round(bagArea * up) });
    wx.showToast({ title: '已复制尺寸，可在采购合同「规格型号」点「贴」带入', icon: 'none' });
  },

  /* ==================== 记录 ==================== */

  delRec(e) {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法删除', icon: 'none' }); return; }
    db.deleteToolRecord(e.currentTarget.dataset.id);
    wx.showToast({ title: '已删除', icon: 'success' });
    this.render();
  },

  exportRecs() {
    const rs = db.toolRecords();
    if (!rs.length) { wx.showToast({ title: '暂无计算记录', icon: 'none' }); return; }
    const out = [['时间', '类型', '长', '宽', '高', '数量', '表面积(㎡)', '总价(元)']];
    rs.forEach(r => out.push([
      String(r.at || '').replace('T', ' ').slice(0, 16), r.type, r.L, r.W, r.H, r.Q,
      d2(r.totalArea || r.area), fmt.fmtMoney(r.total)
    ]));
    csv.exportFile('计算记录_' + fmt.today() + '.csv', csv.toCSV(out));
  },

  clearRecs() {
    if (!this.data.canWrite) { wx.showToast({ title: '当前角色为只读，无法清空', icon: 'none' }); return; }
    const n = db.toolRecords().length;
    if (!n) { wx.showToast({ title: '暂无计算记录', icon: 'none' }); return; }
    wx.showModal({
      title: '⚠ 确认清空',
      content: '清空全部 ' + n + ' 条计算记录？此操作不可恢复！',
      confirmText: '清空', confirmColor: '#FF3B30',
      success: r => {
        if (!r.confirm) return;
        db.clearToolRecords();
        wx.showToast({ title: '已清空', icon: 'none' });
        this.render();
      }
    });
  },

  goContract() { wx.navigateTo({ url: '/pages/purchase/contract/contract' }); },
  noop() {}
});

function d2(v) { return (Math.round((+v || 0) * 100) / 100).toFixed(2); }
