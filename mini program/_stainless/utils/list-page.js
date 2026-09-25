/**
 * 不锈钢业务通用列表页工厂（schema 驱动，分公司作用域版）
 *
 * 在通用版基础上增加：
 *   - 顶部抬头切换条（分公司作用域模块）
 *   - schema.action：记录卡片上方的主动作按钮（如销售/采购订单 → 生成合同）
 *   - autoSum 支持损/溢重量调整字段（adjustField）
 *   - autoTax 支持发票 不含税额 × 税率 → 税额 → 价税合计
 * 数据读写：db.get(key) / db.commit(key)（自动映射 <当前公司>__key）
 */
const db = require('./db');
const company = require('./company');
const fmt = require('./format');

const TAG_FALLBACK = 'tag-gray';

function makePage(schema) {
  const scoped = schema.scoped !== false; // 默认按分公司作用域
  return {
    data: {
      title: schema.title,
      icon: schema.icon || '',
      fields: schema.fields,
      statuses: schema.statuses || [],
      hasStatuses: !!(schema.statuses && schema.statuses.length),
      scoped: scoped,
      companyName: '',
      actionLabel: (schema.action && schema.action.label) || '',
      list: [],
      total: 0,
      q: '',
      statusFilter: '',
      modal: false,
      form: {},
      editingId: null,
      deleting: false,
      contactNames: [],
      contactIds: []
    },

    onShow() {
      const app = getApp();
      if (!app.globalData.user) {
        app.globalData.user = require('./cloudbase').getUser();
      }
      if (!app.globalData.user) {
        wx.reLaunch({ url: '/pages/login/login' });
        return;
      }
      this.setData({ companyName: scoped ? (company.getCurrent().nameCn || '当前抬头') : '' });
      this.refreshContacts();
      this.render();
    },

    onPullDownRefresh() {
      db.syncFromCloud((changed, applied) => {
        this.setData({ companyName: scoped ? (company.getCurrent().nameCn || '') : '' });
        this.render();
        wx.stopPullDownRefresh();
        if (changed === false && applied === 0) {
          wx.showToast({ title: '云端同步失败', icon: 'none' });
        } else {
          wx.showToast({ title: '已同步云端（' + applied + ' 项）', icon: 'none' });
        }
      });
    },

    onCloudUpdate() {
      this.setData({ companyName: scoped ? (company.getCurrent().nameCn || '') : '' });
      this.render();
    },

    /* 切换公司抬头 */
    switchCompany() {
      const list = company.getCompanies();
      wx.showActionSheet({
        itemList: list.map(c => c.nameCn || c.id),
        success: (res) => {
          const c = list[res.tapIndex];
          if (!c || c.id === company.getCurrentId()) return;
          company.switchCompany(c.id);
          this.setData({ companyName: c.nameCn || c.id, q: '', statusFilter: '' });
          this.render();
          wx.showToast({ title: '已切换：' + (c.nameCn || c.id), icon: 'none' });
        }
      });
    },

    /* 主动作（生成合同等） */
    onAction() {
      const a = schema.action;
      if (!a || !a.url) return;
      wx.navigateTo({ url: a.url + (a.query ? ('?' + a.query) : '') });
    },

    refreshContacts() {
      const hasContact = (schema.fields || []).some(f => f.type === 'contact');
      if (!hasContact) return;
      const contacts = db.get('contacts') || [];
      this.setData({
        contactNames: contacts.map(c => c.name || '(未命名)'),
        contactIds: contacts.map(c => c.id)
      });
    },

    render() {
      const records = db.get(schema.key) || [];
      const q = String(this.data.q || '').trim().toLowerCase();
      const sf = this.data.statusFilter || '';

      const filtered = records.filter(r => {
        if (sf && (r.status || '') !== sf) return false;
        if (!q) return true;
        const keys = schema.searchKeys && schema.searchKeys.length ? schema.searchKeys : Object.keys(r);
        return keys.some(k => String(r[k] === undefined || r[k] === null ? '' : r[k]).toLowerCase().indexOf(q) > -1);
      });
      const sorted = filtered.slice().reverse();

      const list = sorted.map(r => {
        const title = schema.titleFn ? schema.titleFn(r) : (r.name || r.orderNo || r.styleNo || r.id || '');
        const sub = schema.subFn ? schema.subFn(r) : '';
        const kvs = [];
        (schema.kvFields || []).forEach(fk => {
          const f = (schema.fields || []).find(x => x.k === fk) || {};
          let v = r[fk];
          if (v === undefined || v === null || v === '') return;
          if (f.type === 'contact') {
            const c = (db.get('contacts') || []).find(x => x.id === v);
            v = c ? c.name : v;
          } else if (f.money) {
            v = fmt.fmtMoney(v);
          } else if (f.type === 'number') {
            v = fmt.fmtNum(v);
          }
          kvs.push({ k: f.label || fk, v: String(v), wide: !!f.kvWide });
        });
        return {
          id: r.id,
          title: title,
          sub: sub,
          tag: r.status || '',
          tagClass: (schema.statusColors && schema.statusColors[r.status]) || TAG_FALLBACK,
          kvs: kvs
        };
      });

      this.setData({ list: list, total: records.length });
    },

    onSearch(e) { this.setData({ q: e.detail.value }, () => this.render()); },
    clearSearch() { this.setData({ q: '' }, () => this.render()); },
    filterByStatus(e) {
      const v = e.currentTarget.dataset.status || '';
      this.setData({ statusFilter: this.data.statusFilter === v ? '' : v }, () => this.render());
    },

    openAdd() {
      const form = {};
      (schema.fields || []).forEach(f => {
        if (f.type === 'date' && f.defaultToday) form[f.k] = fmt.today();
        if (f.defaultValue !== undefined) form[f.k] = f.defaultValue;
        if (f.type === 'number' && form[f.k] === undefined) form[f.k] = '';
      });
      if (schema.statuses && schema.statuses.length && schema.statusDefault && form.status === undefined) {
        form.status = schema.statusDefault;
      }
      this.setData({ modal: true, editingId: null, deleting: false, form: form });
    },

    openEdit(e) {
      const id = e.currentTarget.dataset.id;
      const rec = (db.get(schema.key) || []).find(r => r.id === id);
      if (!rec) return;
      const form = {};
      (schema.fields || []).forEach(f => {
        form[f.k] = rec[f.k] === undefined || rec[f.k] === null ? '' : rec[f.k];
      });
      this.setData({ modal: true, editingId: id, deleting: true, form: form });
    },

    closeModal() { this.setData({ modal: false, editingId: null, deleting: false, form: {} }); },
    noop() {},

    onFormInput(e) {
      const f = e.currentTarget.dataset.f;
      const form = Object.assign({}, this.data.form);
      form[f] = e.detail.value;
      this.autoCompute(form);
    },

    onFormDate(e) {
      const f = e.currentTarget.dataset.f;
      const form = Object.assign({}, this.data.form);
      form[f] = e.detail.value;
      this.autoCompute(form);
    },

    onFormPick(e) {
      const f = e.currentTarget.dataset.f;
      const idx = Number(e.detail.value);
      const field = (schema.fields || []).find(x => x.k === f) || {};
      const form = Object.assign({}, this.data.form);
      if (field.type === 'contact') {
        form[f] = this.data.contactIds[idx] || '';
        form[f + '__name'] = this.data.contactNames[idx] || '';
      } else {
        form[f] = (field.options || [])[idx] !== undefined ? (field.options || [])[idx] : e.detail.value;
      }
      this.autoCompute(form);
    },

    /** 自动计算：金额（含损溢调整）/ 发票税额 */
    autoCompute(form) {
      const a = schema.autoSum;
      if (a) {
        const qty = Number(form[a.qtyField]);
        const price = Number(form[a.priceField]);
        if (form[a.qtyField] !== '' && form[a.priceField] !== '' && !isNaN(qty) && !isNaN(price)) {
          const base = a.adjustField ? qty + (Number(form[a.adjustField]) || 0) : qty;
          const v = base * price;
          form[a.target] = a.money ? Math.round(v * 100) / 100 : Math.round(v);
        }
      }
      const d = schema.autoDiff;
      if (d) {
        const a = Number(form[d.aField]);
        const b = Number(form[d.bField]);
        if (form[d.aField] !== '' && form[d.bField] !== '' && !isNaN(a) && !isNaN(b)) {
          const v = a - b;
          form[d.target] = d.money ? Math.round(v * 100) / 100 : Math.round(v);
        }
      }
      const t = schema.autoTax;
      if (t) {
        const amount = Number(form[t.amountField]);
        const rate = Number(form[t.rateField]); // 百分数，如 13
        if (form[t.amountField] !== '' && !isNaN(amount)) {
          if (form[t.rateField] !== '' && !isNaN(rate)) {
            const tax = Math.round(amount * rate) / 100;
            form[t.taxTarget] = tax;
            form[t.totalTarget] = Math.round((amount + tax) * 100) / 100;
          } else {
            form[t.taxTarget] = '';
            form[t.totalTarget] = amount;
          }
        }
      }
      this.setData({ form: form });
    },

    saveForm() {
      const form = this.data.form;
      for (let i = 0; i < (schema.fields || []).length; i++) {
        const f = schema.fields[i];
        if (f.required && (form[f.k] === undefined || form[f.k] === null || String(form[f.k]).trim() === '')) {
          wx.showToast({ title: '请填写「' + (f.label || f.k) + '」', icon: 'none' });
          return;
        }
      }

      const list = db.get(schema.key) || [];
      let record;
      if (this.data.editingId) {
        const idx = list.findIndex(r => r.id === this.data.editingId);
        if (idx < 0) { this.closeModal(); return; }
        record = Object.assign({}, list[idx], form);
        list[idx] = record;
      } else {
        record = Object.assign({ id: db.genId(schema.idPrefix || 'R') }, form);
        list.push(record);
      }
      Object.keys(record).forEach(k => { if (k.indexOf('__name') > -1) delete record[k]; });

      db.commit(schema.key);
      this.closeModal();
      this.render();
      wx.showToast({ title: '已保存', icon: 'success' });
    },

    deleteRecord() {
      if (!this.data.editingId) return;
      wx.showModal({
        title: '删除记录',
        content: '确定删除这条记录吗？此操作不可恢复。',
        confirmText: '删除',
        confirmColor: '#e02020',
        success: res => {
          if (!res.confirm) return;
          const list = db.get(schema.key) || [];
          const idx = list.findIndex(r => r.id === this.data.editingId);
          if (idx > -1) {
            list.splice(idx, 1);
            db.commit(schema.key);
          }
          this.closeModal();
          this.render();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      });
    }
  };
}

module.exports = makePage;
