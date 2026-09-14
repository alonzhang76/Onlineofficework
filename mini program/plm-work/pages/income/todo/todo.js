const db = require('../../../utils/income-db');

const PRI_CLASS = { high: 'badge-red', medium: 'badge-orange', low: 'badge-gray' };

function priIdx(p) {
  const i = db.PRIORITIES.indexOf(p || 'medium');
  return i < 0 ? 1 : i;
}

Page({
  data: {
    priorityNames: ['高', '中', '低'],
    form: { text: '', priorityIdx: 1 },
    editingId: null,
    filter: 'all',
    list: []
  },

  onShow() { this.render(); },

  render() {
    let list = db.listTodos().slice();
    if (this.data.filter === 'pending') list = list.filter(t => !t.completed);
    if (this.data.filter === 'done') list = list.filter(t => t.completed);
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    list = list.map(t => Object.assign({}, t, {
      priorityName: db.PRIORITY_NAMES[t.priority] || '中',
      priClass: PRI_CLASS[t.priority] || 'badge-gray',
      dateText: (t.createdAt || '').substring(0, 10)
    }));
    this.setData({ list });
  },

  onInput(e) { this.setData({ 'form.text': e.detail.value }); },
  onPriority(e) { this.setData({ 'form.priorityIdx': +e.detail.value }); },
  onFilter(e) { this.setData({ filter: e.currentTarget.dataset.f }); this.render(); },

  save() {
    const f = this.data.form;
    if (!f.text.trim()) { wx.showToast({ title: '请输入待办内容', icon: 'none' }); return; }
    const payload = { text: f.text, priority: db.PRIORITIES[f.priorityIdx] };
    if (this.data.editingId) {
      payload.id = this.data.editingId;
      db.saveTodoEdit(payload);
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      db.addTodo(payload);
      wx.showToast({ title: '已添加', icon: 'success' });
    }
    this.setData({ form: { text: '', priorityIdx: 1 }, editingId: null });
    this.render();
  },

  edit(e) {
    const t = db.listTodos().find(x => x.id === e.currentTarget.dataset.id);
    if (!t) return;
    this.setData({ editingId: t.id, form: { text: t.text, priorityIdx: priIdx(t.priority) } });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  cancelEdit() { this.setData({ editingId: null, form: { text: '', priorityIdx: 1 } }); },

  toggle(e) { db.toggleTodo(e.currentTarget.dataset.id); this.render(); },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除待办', content: '确定删除该待办事项吗？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteTodo(id);
        this.render();
      }
    });
  }
});
