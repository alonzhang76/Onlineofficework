const db = require('../../../utils/trade-db');
const fmt = require('../../../utils/format');
const csv = require('../../../utils/csv');

/** 状态徽章样式 —— 与网页版 loadBusinessList 一致 */
const STATUS_CLASS = {
  '跟进中/已发邮件': 'badge-blue',
  '已回复': 'badge-green',
  '已下单': 'badge-purple',
  '已终止': 'badge-red'
};

/** 反馈徽章样式 —— 与网页版 renderBusinessContactRecords 一致 */
const FB_CLASS = { '积极': 'badge-green', '中性': 'badge-gray', '消极': 'badge-red', '待回复': 'badge-orange' };

const REMINDER_OPTIONS = ['全部', '需要提醒', '已过期'];

function emptyForm() {
  return {
    customerName: '', contact: '', phone: '', email: '', address: '', industry: '',
    status: db.BUSINESS_STATUS[0], contactDate: fmt.today(),
    followupNo: '', quoteNo: '', nextFollowup: '', needs: ''
  };
}

Page({
  data: {
    kw: '',
    statusOptions: ['全部状态'].concat(db.BUSINESS_STATUS), statusIdx: 0,
    reminderOptions: REMINDER_OPTIONS, reminderIdx: 0,

    list: [], pendingCount: 0,

    modal: false, editId: '', form: emptyForm(),
    statusList: db.BUSINESS_STATUS, statusIdx2: 0,

    contactModal: false, contactTargetId: '',
    contactForm: { date: fmt.today(), feedback: '待回复', content: '' },
    feedbacks: db.FEEDBACK_TYPES
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.kw.toLowerCase().trim();
    const statusSel = this.data.statusIdx > 0 ? this.data.statusOptions[this.data.statusIdx] : '';
    const reminderSel = this.data.reminderIdx > 0 ? REMINDER_OPTIONS[this.data.reminderIdx] : '';
    const today = fmt.today();

    const list = db.data.businessRecords
      .filter(o => {
        if (statusSel && o.status !== statusSel) return false;
        if (kw) {
          const hay = [o.customerName, o.contact].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        if (reminderSel) {
          const isLast = db.isBusinessLastOfGroup(o);
          const nf = String(o.nextFollowup || '');
          if (reminderSel === '需要提醒') {
            if (!(isLast && nf && nf >= today)) return false;
          } else if (reminderSel === '已过期') {
            if (!(nf && nf < today)) return false;
          }
        }
        return true;
      })
      .sort(fmt.cmpDateDesc('contactDate'))
      .map(o => {
        const isLast = db.isBusinessLastOfGroup(o);
        const nf = String(o.nextFollowup || '');
        // 下次跟进样式：同跟进单号 ≥2 条时最后一条 已下单/已终止=绿底白字，否则红底白字；非最后一条=浅绿
        let nextClass = '';
        if (nf) {
          const groupSize = db.data.businessRecords.filter(r => String(r.followupNo || '').trim() === String(o.followupNo || '').trim()).length;
          if (groupSize >= 2) {
            if (isLast) nextClass = (o.status === '已下单' || o.status === '已终止') ? 'nf-green' : 'nf-red';
            else nextClass = 'nf-light';
          }
        }
        const records = (o.contactRecords || []).map((r, ri) => ({
          idx: ri,
          date: fmt.fmtDate(r.date),
          feedback: r.feedback || '待回复',
          fbClass: FB_CLASS[r.feedback || '待回复'] || 'badge-gray',
          content: r.content || ''
        }));
        return {
          id: o.id,
          customerName: o.customerName, contact: o.contact, phone: o.phone,
          contactDate: fmt.fmtDate(o.contactDate),
          nextFollowup: fmt.fmtDate(o.nextFollowup),
          nextClass: nextClass,
          followupNo: o.followupNo, quoteNo: o.quoteNo,
          industry: o.industry, needs: o.needs,
          status: o.status || db.BUSINESS_STATUS[0],
          statusClass: STATUS_CLASS[o.status || db.BUSINESS_STATUS[0]] || 'badge-gray',
          contactRecords: records
        };
      });

    this.setData({
      list: list,
      pendingCount: list.filter(o => o.nextFollowup).length
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },
  onStatus(e) { this.setData({ statusIdx: +e.detail.value }); this.render(); },
  onReminder(e) { this.setData({ reminderIdx: +e.detail.value }); this.render(); },

  resetFilter() {
    this.setData({ kw: '', statusIdx: 0, reminderIdx: 0 });
    this.render();
  },

  openAdd() {
    this.setData({ modal: true, editId: '', form: emptyForm(), statusIdx2: 0 });
  },

  editItem(e) {
    const o = db.data.businessRecords.find(x => String(x.id) === String(e.currentTarget.dataset.id));
    if (!o) return;
    this.setData({
      modal: true, editId: String(o.id),
      form: {
        customerName: o.customerName || '', contact: o.contact || '',
        phone: o.phone || '', email: o.email || '', address: o.address || '',
        industry: o.industry || '', status: o.status || db.BUSINESS_STATUS[0],
        contactDate: fmt.fmtDate(o.contactDate), followupNo: o.followupNo || '',
        quoteNo: o.quoteNo || '', nextFollowup: fmt.fmtDate(o.nextFollowup),
        needs: o.needs || ''
      },
      statusIdx2: Math.max(0, db.BUSINESS_STATUS.indexOf(o.status || db.BUSINESS_STATUS[0]))
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onStatusForm(e) {
    const i = +e.detail.value;
    this.setData({ statusIdx2: i, 'form.status': db.BUSINESS_STATUS[i] });
  },

  save() {
    const f = this.data.form;
    if (!String(f.customerName || '').trim()) { wx.showToast({ title: '请填写客户名称', icon: 'none' }); return; }
    const existing = db.data.businessRecords.find(x => String(x.id) === String(this.data.editId));
    db.saveBusiness(Object.assign({}, f, {
      customerName: String(f.customerName).trim(),
      contactRecords: existing ? (existing.contactRecords || []) : []
    }), this.data.editId || null);
    wx.showToast({ title: this.data.editId ? '记录已更新' : '记录已添加', icon: 'success' });
    this.closeModal();
    this.render();
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此业务跟踪记录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteBusiness(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  /* ===== 联系记录 ===== */
  openContact(e) {
    this.setData({
      contactModal: true,
      contactTargetId: String(e.currentTarget.dataset.id),
      contactForm: { date: fmt.today(), feedback: '待回复', content: '' }
    });
  },

  onContactDate(e) { this.setData({ 'contactForm.date': e.detail.value }); },
  pickFeedback(e) { this.setData({ 'contactForm.feedback': e.currentTarget.dataset.val }); },
  onContactContent(e) { this.setData({ 'contactForm.content': e.detail.value }); },

  saveContact() {
    const o = db.data.businessRecords.find(x => String(x.id) === String(this.data.contactTargetId));
    if (!o) { this.closeContact(); return; }
    if (!String(this.data.contactForm.content || '').trim()) {
      wx.showToast({ title: '请填写联系内容', icon: 'none' }); return;
    }
    const records = (o.contactRecords || []).concat([{
      date: this.data.contactForm.date,
      feedback: this.data.contactForm.feedback,
      content: String(this.data.contactForm.content).trim()
    }]);
    o.contactRecords = records;
    o.lastContactDate = this.data.contactForm.date;
    db.save('businessRecords');
    wx.showToast({ title: '联系记录已添加', icon: 'success' });
    this.closeContact();
    this.render();
  },

  closeContact() { this.setData({ contactModal: false }); },

  closeModal() { this.setData({ modal: false }); },
  noop() {},

  exportCSV() {
    if (!db.data.businessRecords.length) { wx.showToast({ title: '暂无业务跟踪数据', icon: 'none' }); return; }
    const headers = ['客户名称', '联系人', '电话', '邮箱', '地址', '行业·产品', '当前状态', '联系日期', '跟进单号', '报价单号', '下次跟进', '需求简述', '联系记录数'];
    const rows = [headers];
    db.data.businessRecords.forEach(o => {
      rows.push([
        o.customerName || '', o.contact || '', o.phone || '', o.email || '', o.address || '',
        o.industry || '', o.status || '', fmt.fmtDate(o.contactDate),
        o.followupNo || '', o.quoteNo || '', fmt.fmtDate(o.nextFollowup),
        o.needs || '', (o.contactRecords || []).length
      ]);
    });
    csv.exportFile('业务跟踪_' + fmt.today() + '.csv', csv.toCSV(rows));
  }
});
