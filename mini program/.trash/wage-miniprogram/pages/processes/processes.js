const db = require('../../utils/db');

const fmt3 = v => (v === undefined || v === null || v === '') ? '' : (Math.round(v * 1000) / 1000).toFixed(3);

Page({
  data: {
    keyword: '', list: [],
    modal: false, editId: '', form: {}
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.keyword.toLowerCase().trim();
    const list = db.data.processes.filter(p => {
      if (kw && p.name.toLowerCase().indexOf(kw) === -1 && String(p.notes || '').toLowerCase().indexOf(kw) === -1) return false;
      return true;
    }).map(p => ({
      id: p.id, name: p.name,
      unitPrice: fmt3(p.unitPrice),
      dailyQuota: p.dailyQuota, overPrice: fmt3(p.overPrice), notes: p.notes
    }));
    this.setData({ list });
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.render(); },

  openAdd() {
    this.setData({ modal: true, editId: '', form: { name: '', unitPrice: '', dailyQuota: '', overPrice: '', notes: '' } });
  },

  editProcess(e) {
    const p = db.data.processes.find(x => x.id === e.currentTarget.dataset.id);
    if (!p) return;
    this.setData({
      modal: true, editId: p.id,
      form: { name: p.name || '', unitPrice: String(p.unitPrice || ''), dailyQuota: p.dailyQuota ? String(p.dailyQuota) : '', overPrice: p.overPrice ? String(p.overPrice) : '', notes: p.notes || '' }
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },

  saveProcess() {
    const f = this.data.form;
    const price = parseFloat(f.unitPrice);
    if (!f.name.trim() || isNaN(price)) { wx.showToast({ title: '请填写名称和单价', icon: 'none' }); return; }
    const data = {
      name: f.name.trim(), unitPrice: price,
      dailyQuota: parseInt(f.dailyQuota) || 0,
      overPrice: parseFloat(f.overPrice) || 0,
      notes: f.notes.trim()
    };
    if (this.data.editId) { db.updateProcess(this.data.editId, data); wx.showToast({ title: '工序已更新', icon: 'success' }); }
    else { db.addProcess(data); wx.showToast({ title: '工序已添加', icon: 'success' }); }
    this.closeModal();
    this.render();
  },

  deleteProcess(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此工序？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteProcess(id);
        wx.showToast({ title: '工序已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {}
});
