const db = require('../../../utils/schedule-db');

const PRI_NAMES = { low: '低', medium: '中', high: '高' };
const PRI_CLASS = { low: 'badge-gray', medium: 'badge-orange', high: 'badge-red' };

Page({
  data: {
    priorityNames: ['低', '中', '高'],
    form: { title: '', content: '', priorityIdx: 0, deadline: '' },
    editingId: null,
    filter: 'all',
    list: []
  },

  onShow() { this.render(); },

  render() {
    let list = db.data.memos.slice();
    if (this.data.filter === 'pending') list = list.filter(m => m.status !== 'done');
    if (this.data.filter === 'done') list = list.filter(m => m.status === 'done');
    // 置顶排序：待办在前，截止日近的在前
    list.sort((a, b) => {
      const ad = a.deadline || '9999-99-99', bd = b.deadline || '9999-99-99';
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      return ad.localeCompare(bd);
    });
    list = list.map(m => Object.assign({}, m, {
      priorityName: PRI_NAMES[m.priority] || '低',
      priClass: PRI_CLASS[m.priority] || 'badge-gray'
    }));
    this.setData({ list });
  },

  onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onPriority(e) { this.setData({ 'form.priorityIdx': +e.detail.value }); },
  onDeadline(e) { this.setData({ 'form.deadline': e.detail.value }); },

  onFilter(e) { this.setData({ filter: e.currentTarget.dataset.f }); this.render(); },

  save() {
    const f = this.data.form;
    if (!f.title.trim()) { wx.showToast({ title: '请填写标题', icon: 'none' }); return; }
    const payload = {
      title: f.title.trim(), content: f.content.trim(),
      priority: db.PRIORITIES[f.priorityIdx], deadline: f.deadline
    };
    if (this.data.editingId) {
      payload.id = this.data.editingId;
      db.saveMemoEdit(payload);
      wx.showToast({ title: '备忘已更新', icon: 'success' });
    } else {
      db.addMemo(payload);
      wx.showToast({ title: '备忘已添加', icon: 'success' });
    }
    this.setData({ form: { title: '', content: '', priorityIdx: 0, deadline: '' }, editingId: null });
    this.render();
  },

  edit(e) {
    const m = db.data.memos.find(x => x.id === e.currentTarget.dataset.id);
    if (!m) return;
    this.setData({
      editingId: m.id,
      form: {
        title: m.title, content: m.content,
        priorityIdx: Math.max(0, db.PRIORITIES.indexOf(m.priority || 'low')),
        deadline: m.deadline || ''
      }
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  cancelEdit() {
    this.setData({ editingId: null, form: { title: '', content: '', priorityIdx: 0, deadline: '' } });
  },

  toggleStatus(e) {
    db.toggleMemoStatus(e.currentTarget.dataset.id);
    this.render();
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除备忘', content: '确定删除该备忘吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteMemo(id);
        this.render();
      }
    });
  }
});
