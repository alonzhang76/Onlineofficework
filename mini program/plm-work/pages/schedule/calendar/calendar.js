const db = require('../../../utils/schedule-db');

const WEEK_HEADS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function buildCells(year, month, selected) {
  const first = new Date(year, month - 1, 1);
  const startWeek = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const todayStr = (() => {
    const t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  })();
  const cells = [];
  for (let i = startWeek - 1; i >= 0; i--) {
    const d = prevDays - i;
    const date = (month === 1 ? year - 1 : year) + '-' + pad(month === 1 ? 12 : month - 1) + '-' + pad(d);
    cells.push({ key: 'p' + i, day: d, date, inMonth: false, today: date === todayStr, noteCount: 0 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = year + '-' + pad(month) + '-' + pad(d);
    cells.push({ key: 'd' + d, day: d, date, inMonth: true, today: date === todayStr, noteCount: (db.data.calendarNotes[date] || []).length });
  }
  let i2 = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const date = (month === 12 ? year + 1 : year) + '-' + pad(month === 12 ? 1 : month + 1) + '-' + pad(i2);
    cells.push({ key: 'n' + i2, day: i2, date, inMonth: false, today: date === todayStr, noteCount: 0 });
    i2++;
    if (cells.length >= 42) break;
  }
  return cells;
}

Page({
  data: {
    weekHeads: WEEK_HEADS,
    year: 2026, month: 1,
    cells: [],
    selected: '',
    notes: [],
    newContent: ''
  },

  onShow() {
    const t = new Date();
    const y = t.getFullYear(), m = t.getMonth() + 1;
    const selected = y + '-' + pad(m) + '-' + pad(t.getDate());
    this.setData({ year: y, month: m, selected });
    this.refresh();
  },

  refresh() {
    const { year, month, selected } = this.data;
    this.setData({
      cells: buildCells(year, month, selected),
      notes: (db.getNotes(selected) || []).slice()
    });
  },

  prevMonth() {
    let { year, month } = this.data;
    month--;
    if (month === 0) { month = 12; year--; }
    this.setData({ year, month });
    this.refresh();
  },

  nextMonth() {
    let { year, month } = this.data;
    month++;
    if (month === 13) { month = 1; year++; }
    this.setData({ year, month });
    this.refresh();
  },

  pickDay(e) {
    this.setData({ selected: e.currentTarget.dataset.date });
    this.refresh();
  },

  onContent(e) { this.setData({ newContent: e.detail.value }); },

  addNote() {
    const c = (this.data.newContent || '').trim();
    if (!c) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }
    db.addNote(this.data.selected, c);
    this.setData({ newContent: '' });
    this.refresh();
  },

  toggleNote(e) {
    db.toggleNote(this.data.selected, +e.currentTarget.dataset.idx);
    this.refresh();
  },

  deleteNote(e) {
    db.deleteNote(this.data.selected, +e.currentTarget.dataset.idx);
    this.refresh();
  }
});
