const db = require('../../../utils/wage-db');
const fmt = require('../../../utils/format');

Page({
  data: {
    keyword: '', statusFilter: '',
    list: [],
    modal: false, editId: '',
    form: {}
  },

  onShow() { this.render(); },

  render() {
    const kw = this.data.keyword.toLowerCase().trim();
    const sf = this.data.statusFilter;
    const list = db.data.employees.filter(e => {
      const isLeave = !!(e.leaveDate && String(e.leaveDate).trim());
      if (sf && (sf === '离职') !== isLeave) return false;
      if (kw) {
        const hay = [e.name, e.phone, e.idCard, e.bankCard, e.notes].join(' ').toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).map((e, i) => ({
      id: e.id, name: e.name, idCard: e.idCard, phone: e.phone, bank: e.bank, bankCard: e.bankCard,
      hireDate: fmt.fmtDate(e.hireDate), leaveDate: e.leaveDate ? fmt.fmtDate(e.leaveDate) : '',
      notes: e.notes, isLeave: !!(e.leaveDate && String(e.leaveDate).trim()),
      initial: (e.name || '?').slice(0, 1)
    }));
    this.setData({ list });
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.render(); },
  onStatusFilter(e) { this.setData({ statusFilter: e.currentTarget.dataset.v }); this.render(); },

  openAdd() {
    this.setData({ modal: true, editId: '', form: { name: '', idCard: '', phone: '', bank: '', bankCard: '', hireDate: '', leaveDate: '', notes: '' } });
  },

  editEmployee(e) {
    const emp = db.data.employees.find(x => x.id === e.currentTarget.dataset.id);
    if (!emp) return;
    this.setData({
      modal: true, editId: emp.id,
      form: {
        name: emp.name || '', idCard: emp.idCard || '', phone: emp.phone || '',
        bank: emp.bank || '', bankCard: emp.bankCard || '',
        hireDate: fmt.fmtDate(emp.hireDate), leaveDate: emp.leaveDate ? fmt.fmtDate(emp.leaveDate) : '',
        notes: emp.notes || ''
      }
    });
  },

  onField(e) { this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value }); },
  onHireDate(e) { this.setData({ 'form.hireDate': e.detail.value }); },
  onLeaveDate(e) { this.setData({ 'form.leaveDate': e.detail.value }); },

  saveEmployee() {
    const f = this.data.form;
    if (!f.name.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    const data = {
      name: f.name.trim(), idCard: f.idCard.trim(), phone: f.phone.trim(),
      bank: f.bank.trim(), bankCard: f.bankCard.trim(),
      hireDate: f.hireDate, leaveDate: f.leaveDate,
      status: f.leaveDate ? '0' : '1', notes: f.notes.trim()
    };
    if (this.data.editId) { db.updateEmployee(this.data.editId, data); wx.showToast({ title: '员工已更新', icon: 'success' }); }
    else { db.addEmployee(data); wx.showToast({ title: '员工已添加', icon: 'success' }); }
    this.closeModal();
    this.render();
  },

  deleteEmployee(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '确认删除此员工？关联的工资记录不会删除。', confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        db.deleteEmployee(id);
        wx.showToast({ title: '员工已删除', icon: 'success' });
        this.render();
      }
    });
  },

  closeModal() { this.setData({ modal: false }); },
  noop() {}
});
