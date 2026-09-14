const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

const TYPE_OPTIONS = ['客户', '供应商'];
const PRIORITY_OPTIONS = ['全部', '仅重点客户', '仅普通客户'];
const AVATAR_COLORS = ['#007AFF', '#34C759', '#FF9500', '#5856D6', '#FF3B30', '#00C7BE', '#AF52DE', '#8E8E93'];

function emptyForm() {
  return {
    customerName: '', customerType: '客户', region: '', contactName: '', contactTitle: '',
    phone: '', email: '', address: '', website: '', tags: '',
    remark: '', createdAt: fmt.today(), priority: false
  };
}

Page({
  data: {
    kw: '',
    typeIdx: 0,
    regionOptions: ['全部地区'], regionIdx: 0,
    priorityOptions: PRIORITY_OPTIONS, priorityIdx: 0,
    yearOptions: ['全部年份'], yearIdx: 0,

    list: [], custCount: 0, supplierCount: 0, priorityCount: 0,

    modal: false, editId: '', form: emptyForm(),
    typeOptions: TYPE_OPTIONS, typeIdx2: 0
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const typeSel = this.data.typeIdx === 0 ? '' : (this.data.typeIdx === 1 ? '客户' : '供应商');
    const regionSel = this.data.regionIdx > 0 ? this.data.regionOptions[this.data.regionIdx] : '';
    const prioritySel = this.data.priorityIdx > 0 ? PRIORITY_OPTIONS[this.data.priorityIdx] : '';
    const yearSel = this.data.yearIdx > 0 ? this.data.yearOptions[this.data.yearIdx] : '';

    const list = db.data.customerRecords
      .filter(o => {
        if (typeSel && (o.customerType || '客户') !== typeSel) return false;
        if (regionSel && (o.region || '') !== regionSel) return false;
        if (prioritySel === '仅重点客户' && !o.priority) return false;
        if (prioritySel === '仅普通客户' && o.priority) return false;
        if (yearSel && String(o.createdAt || '').indexOf(yearSel) !== 0) return false;
        if (kw) {
          const hay = [o.customerName, o.contactName, o.phone, o.email, o.tags, o.remark, o.address].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!!a.priority !== !!b.priority) return a.priority ? -1 : 1;
        return String(a.customerName || '').localeCompare(String(b.customerName || ''), 'zh');
      })
      .map(o => {
        const name = String(o.customerName || '?');
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
        return {
          id: o.id,
          customerName: name,
          initial: name.slice(0, 1).toUpperCase(),
          avatarColor: AVATAR_COLORS[hash],
          customerType: o.customerType || '客户',
          typeClass: (o.customerType === '供应商') ? 'badge-blue' : 'badge-green',
          region: o.region, contactName: o.contactName, phone: o.phone,
          email: o.email, address: o.address, website: o.website,
          remark: o.remark, createdAt: fmt.fmtDate(o.createdAt),
          priority: !!o.priority,
          tagList: String(o.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
        };
      });

    const regionOptions = ['全部地区'].concat(
      Array.from(new Set(db.data.customerRecords.map(o => o.region).filter(Boolean))).sort()
    );
    let regionIdx = this.data.regionIdx;
    if (regionIdx >= regionOptions.length) regionIdx = 0;

    const years = Array.from(new Set(db.data.customerRecords.map(o => String(o.createdAt || '').slice(0, 4)).filter(Boolean))).sort().reverse();
    const yearOptions = ['全部年份'].concat(years);
    let yearIdx = this.data.yearIdx;
    if (yearIdx >= yearOptions.length) yearIdx = 0;

    this.setData({
      list, regionOptions, regionIdx, yearOptions, yearIdx,
      custCount: db.data.customerRecords.filter(o => (o.customerType || '客户') === '客户').length,
      supplierCount: db.data.customerRecords.filter(o => o.customerType === '供应商').length,
      priorityCount: db.data.customerRecords.filter(o => o.priority).length
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onTypeTab(e) { this.setData({ typeIdx: +e.currentTarget.dataset.i }); this.render(); },
  onRegion(e) { this.setData({ regionIdx: +e.detail.value }); this.render(); },
  onPriority(e) { this.setData({ priorityIdx: +e.detail.value }); this.render(); },
  onYear(e) { this.setData({ yearIdx: +e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', typeIdx: 0, regionIdx: 0, priorityIdx: 0, yearIdx: 0 });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm(), typeIdx2: 0 });
  },

  openEdit(e) {
    const o = db.data.customerRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customerName: o.customerName || '', customerType: o.customerType || '客户',
        region: o.region || '', contactName: o.contactName || '', contactTitle: o.contactTitle || '',
        phone: o.phone || '', email: o.email || '', address: o.address || '',
        website: o.website || '', tags: o.tags || '', remark: o.remark || '',
        createdAt: fmt.fmtDate(o.createdAt), priority: !!o.priority
      },
      typeIdx2: Math.max(0, TYPE_OPTIONS.indexOf(o.customerType || '客户'))
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.createdAt']: e.detail.value }); },
  onTypeForm(e) { const i = +e.detail.value; this.setData({ typeIdx2: i, 'form.customerType': TYPE_OPTIONS[i] }); },
  onPrioritySwitch(e) { this.setData({ 'form.priority': e.detail.value }); },

  togglePriority(e) {
    db.toggleCustomerPriority(e.currentTarget.dataset.id);
    this.render();
  },

  callCustomer(e) {
    const o = db.data.customerRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    const phone = String(o.phone || '').replace(/[^\d+]/g, '');
    if (!phone) { wx.showToast({ title: '该客户未填写电话', icon: 'none' }); return; }
    wx.showModal({
      title: '联系客户',
      content: o.customerName + '\n' + phone,
      confirmText: '拨号', cancelText: '复制',
      success: res => {
        if (res.confirm) {
          wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
        } else {
          wx.setClipboardData({ data: phone });
        }
      }
    });
  },

  save() {
    const f = this.data.form;
    if (!String(f.customerName || '').trim()) { wx.showToast({ title: '请填写客户名称', icon: 'none' }); return; }
    db.saveCustomer(Object.assign({}, f, { customerName: String(f.customerName).trim() }), this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '客户已更新' : '客户已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    const o = db.data.customerRecords.find(x => String(x.id) === String(id));
    wx.showModal({
      title: '确认删除',
      content: '确认删除客户「' + ((o && o.customerName) || '') + '」？',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteCustomer(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  exportCSV() {
    if (!db.data.customerRecords.length) { wx.showToast({ title: '暂无客户数据', icon: 'none' }); return; }
    const headers = ['客户名称', '类型', '地区', '联系人', '职务', '电话', '邮箱', '地址', '网站', '标签', '重点客户', '建档日期', '备注'];
    const rows = [headers];
    db.data.customerRecords.forEach(o => {
      rows.push([
        o.customerName || '', o.customerType || '客户', o.region || '', o.contactName || '',
        o.contactTitle || '', o.phone || '', o.email || '', o.address || '', o.website || '',
        o.tags || '', o.priority ? '是' : '否', fmt.fmtDate(o.createdAt), o.remark || ''
      ]);
    });
    csv.exportFile('客户信息_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
