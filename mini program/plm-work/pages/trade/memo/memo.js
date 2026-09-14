const db = require('../../../utils/trade-db');

Page({
  data: {
    kw: '',
    list: [], pinnedCount: 0,
    modal: false, editId: '',
    form: { title: '', content: '', color: db.MEMO_COLORS[0].value },
    colors: db.MEMO_COLORS
  },

  onShow() { this.render(); },

  render() {
    const list = db.queryMemos(this.data.kw).map(m => ({
      id: m.id,
      title: m.title,
      content: m.content,
      color: m.color || db.MEMO_COLORS[0].value,
      border: (db.MEMO_COLORS.find(c => c.value === m.color) || db.MEMO_COLORS[0]).border,
      pinned: !!m.pinned,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }));
    this.setData({
      list: list,
      pinnedCount: list.filter(m => m.pinned).length
    });
  },

  onSearch(e) { this.setData({ kw: e.detail.value }); this.render(); },

  addMemo() {
    this.setData({
      modal: true, editId: '',
      form: { title: '', content: '', color: db.MEMO_COLORS[0].value }
    });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const m = db.data.memoRecords.find(x => String(x.id) === String(id));
    if (!m) return;
    this.setData({
      modal: true, editId: String(m.id),
      form: { title: m.title || '', content: m.content || '', color: m.color || db.MEMO_COLORS[0].value }
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  pickColor(e) { this.setData({ 'form.color': e.currentTarget.dataset.val }); },

  saveMemo() {
    const f = this.data.form;
    if (!String(f.title || '').trim() && !String(f.content || '').trim()) {
      wx.showToast({ title: '请输入标题或内容', icon: 'none' }); return;
    }
    if (this.data.editId) {
      db.saveMemoEdit(this.data.editId, String(f.title).trim(), String(f.content).trim(), f.color);
      wx.showToast({ title: '备忘录已更新', icon: 'success' });
    } else {
      const m = db.addMemo();
      db.saveMemoEdit(m.id, String(f.title).trim(), String(f.content).trim(), f.color);
      wx.showToast({ title: '备忘录已创建', icon: 'success' });
    }
    this.closeModal();
    this.render();
  },

  togglePin(e) {
    db.toggleMemoPin(e.currentTarget.dataset.id);
    this.render();
  },

  delMemo(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此备忘录？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteMemo(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {}
});
