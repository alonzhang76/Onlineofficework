const db = require('../../utils/db');
const fmt = require('../../utils/format');

const PAGE_SIZE = 20;
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const STATUS_MAP = { pending: '待完成', completed: '已完成', overdue: '已逾期' };

Page({
  data: {
    stats: { today: 0, pending: 0, completed: 0, overdue: 0 },
    calYear: 0, calMonth: 0,
    weekDays: WEEK_DAYS,
    grid: [],
    selected: '',
    dayEvents: [],
    keyword: '',
    statusOptions: ['全部状态', '待完成', '已完成', '已逾期'], statusIdx: 0,
    filteredList: [], shown: PAGE_SIZE,
    typeOptions: [], typeIdx: 0,
    priorities: [{ v: 'high', label: '高' }, { v: 'medium', label: '中' }, { v: 'low', label: '低' }], priorityIdx: 1,
    evStatusOptions: [{ v: 'pending', label: '待完成' }, { v: 'completed', label: '已完成' }, { v: 'overdue', label: '已逾期' }], evStatusIdx: 0,
    modal: false, editId: '', form: {}
  },

  onShow() {
    db.syncOrdersToCalendar();
    const now = new Date();
    if (!this.data.calYear) {
      this.setData({ calYear: now.getFullYear(), calMonth: now.getMonth(), selected: fmt.today() });
    }
    this.render();
  },

  render() {
    this.renderStats();
    this.renderGrid();
    this.renderDayEvents();
    this.renderList();
    this.setData({ typeOptions: db.data.calendarEventTypes.slice() });
  },

  renderStats() {
    const todayStr = fmt.today();
    const evs = db.data.calendarEvents;
    this.setData({
      stats: {
        today: evs.filter(e => e.date === todayStr).length,
        pending: evs.filter(e => e.status === 'pending' && e.date >= todayStr).length,
        completed: evs.filter(e => e.status === 'completed').length,
        overdue: evs.filter(e => e.status === 'overdue' || (e.status === 'pending' && e.date < todayStr)).length
      }
    });
  },

  renderGrid() {
    const y = this.data.calYear, m = this.data.calMonth;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = fmt.today();
    const eventsByDate = {};
    db.data.calendarEvents.forEach(e => {
      if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
      eventsByDate[e.date].push(e);
    });
    const grid = [];
    let week = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = y + '-' + fmt.pad(m + 1) + '-' + fmt.pad(d);
      const dayEvents = eventsByDate[dateStr] || [];
      const hasOverdue = dayEvents.some(e => e.status !== 'completed' && e.date < todayStr);
      const hasHigh = dayEvents.some(e => e.priority === 'high');
      week.push({
        date: dateStr, day: d, inMonth: true,
        isToday: dateStr === todayStr,
        dot: dayEvents.length > 0,
        dotColor: hasOverdue ? '#ef4444' : hasHigh ? '#f59e0b' : '#10b981',
        events: dayEvents.slice(0, 2).map(e => (e.time ? e.time + ' ' : '') + e.title)
      });
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length) { grid.push(week); }
    this.setData({ grid });
  },

  renderDayEvents() {
    if (!this.data.selected) { this.setData({ dayEvents: [] }); return; }
    const evs = db.data.calendarEvents.filter(e => e.date === this.data.selected)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
      .map(e => Object.assign({}, e, { statusText: STATUS_MAP[e.status] || e.status }));
    this.setData({ dayEvents: evs });
  },

  renderList() {
    const kw = this.data.keyword.toLowerCase().trim();
    const sf = this.data.statusIdx;
    const todayStr = fmt.today();
    const list = db.data.calendarEvents.filter(e => {
      if (sf === 1 && !(e.status === 'pending' && e.date >= todayStr)) return false;
      if (sf === 2 && e.status !== 'completed') return false;
      if (sf === 3 && !(e.status === 'overdue' || (e.status === 'pending' && e.date < todayStr))) return false;
      if (kw && (e.title + ' ' + (e.description || '')).toLowerCase().indexOf(kw) === -1) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
      .map(e => Object.assign({}, e, { statusText: STATUS_MAP[e.status] || e.status }));
    this.setData({ filteredList: list });
  },

  prevMonth() {
    let y = this.data.calYear, m = this.data.calMonth - 1;
    if (m < 0) { m = 11; y--; }
    this.setData({ calYear: y, calMonth: m });
    this.renderGrid();
  },
  nextMonth() {
    let y = this.data.calYear, m = this.data.calMonth + 1;
    if (m > 11) { m = 0; y++; }
    this.setData({ calYear: y, calMonth: m });
    this.renderGrid();
  },
  goToday() {
    const now = new Date();
    this.setData({ calYear: now.getFullYear(), calMonth: now.getMonth(), selected: fmt.today() });
    this.renderGrid();
    this.renderDayEvents();
  },
  selectDate(e) {
    this.setData({ selected: e.currentTarget.dataset.date });
    this.renderGrid();
    this.renderDayEvents();
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.renderList(); },
  onStatusFilter(e) { this.setData({ statusIdx: +e.detail.value }); this.renderList(); },
  showMore() { this.setData({ shown: this.data.shown + PAGE_SIZE }); },

  openAdd() {
    this.setData({
      modal: true, editId: '',
      form: { title: '', date: this.data.selected || fmt.today(), time: '', description: '' },
      typeIdx: 0, priorityIdx: 1, evStatusIdx: 0
    });
  },

  editEvent(e) {
    const ev = db.data.calendarEvents.find(x => x.id === e.currentTarget.dataset.id);
    if (!ev) return;
    this.setData({
      modal: true, editId: ev.id,
      form: { title: ev.title || '', date: ev.date, time: ev.time || '', description: ev.description || '' },
      typeIdx: Math.max(0, this.data.typeOptions.indexOf(ev.type)),
      priorityIdx: Math.max(0, this.data.priorities.findIndex(p => p.v === (ev.priority || 'medium'))),
      evStatusIdx: Math.max(0, this.data.evStatusOptions.findIndex(s => s.v === (ev.status || 'pending')))
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onEvDate(e) { this.setData({ 'form.date': e.detail.value }); },
  onEvTime(e) { this.setData({ 'form.time': e.detail.value }); },
  onTypePick(e) { this.setData({ typeIdx: +e.detail.value }); },
  onPriorityPick(e) { this.setData({ priorityIdx: +e.detail.value }); },
  onEvStatusPick(e) { this.setData({ evStatusIdx: +e.detail.value }); },

  saveEvent() {
    const f = this.data.form;
    if (!f.title.trim() || !f.date) { wx.showToast({ title: '请填写标题和日期', icon: 'none' }); return; }
    const data = {
      title: f.title.trim(), date: f.date, time: f.time,
      type: this.data.typeOptions[this.data.typeIdx] || '其它',
      priority: this.data.priorities[this.data.priorityIdx].v,
      status: this.data.evStatusOptions[this.data.evStatusIdx].v,
      description: f.description.trim()
    };
    if (this.data.editId) {
      const idx = db.data.calendarEvents.findIndex(x => x.id === this.data.editId);
      if (idx >= 0) db.data.calendarEvents[idx] = Object.assign({}, db.data.calendarEvents[idx], data);
      db.save('calendarEvents');
      wx.showToast({ title: '事件已更新', icon: 'success' });
    } else {
      data.id = 'cal-' + db.uid();
      data.createTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      db.data.calendarEvents.push(data);
      db.save('calendarEvents');
      wx.showToast({ title: '事件已添加', icon: 'success' });
    }
    this.closeModal();
    this.render();
  },

  completeEvent(e) {
    const ev = db.data.calendarEvents.find(x => x.id === e.currentTarget.dataset.id);
    if (ev) { ev.status = 'completed'; db.save('calendarEvents'); wx.showToast({ title: '已标记为完成', icon: 'success' }); this.render(); }
  },

  deleteEvent(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此事件？', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.data.calendarEvents = db.data.calendarEvents.filter(x => x.id !== id);
        db.save('calendarEvents');
        wx.showToast({ title: '事件已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {}
});
