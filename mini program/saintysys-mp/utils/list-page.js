/**
 * 通用业务模块列表页工厂（schema 驱动）
 *
 * 每个业务模块目录只需一个 schema.js 配置 + 一行 Page 包装调用
 * 提供能力：搜索 / 状态筛选 / 卡片列表 / 新增编辑弹层（真机可滚动）/ 删除
 * 数据读写走 utils/db.js（本地 + CloudBase 云同步）
 */
const db = require('./db');
const fmt = require('./format');

const TAG_FALLBACK = 'tag-gray';

function makePage(schema) {
  return {
    data: {
      title: schema.title,
      icon: schema.icon || '',
      fields: schema.fields,
      statuses: schema.statuses || [],
      hasStatuses: !!(schema.statuses && schema.statuses.length),
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
      // 登录门禁兜底
      const app = getApp();
      if (!app.globalData.user) {
        app.globalData.user = require('./cloudbase').getUser();
      }
      if (!app.globalData.user) {
        wx.reLaunch({ url: '/pages/login/login' });
        return;
      }
      this.refreshContacts();
      this.render();
    },

    onPullDownRefresh() {
      db.syncFromCloud((changed, applied) => {
        this.render();
        wx.stopPullDownRefresh();
        if (changed === false && applied === 0) {
          wx.showToast({ title: '云端同步失败', icon: 'none' });
        } else {
          wx.showToast({ title: '已同步云端（' + applied + ' 项）', icon: 'none' });
        }
      });
    },

    /** 云端数据变化回调（app.js 注入） */
    onCloudUpdate() { this.render(); },

    refreshContacts() {
      // 通讯录选择字段的数据源（contacts 键）
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

      // 按创建时间倒序（id 含时间戳的用 id 排，否则按数组倒序）
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
          tagClass: schema.statusColors && schema.statusColors[r.status] || TAG_FALLBACK,
          kvs: kvs
        };
      });

      this.setData({ list: list, total: records.length });
    },

    /* ===== 搜索 / 筛选 ===== */
    onSearch(e) { this.setData({ q: e.detail.value }, () => this.render()); },
    clearSearch() { this.setData({ q: '' }, () => this.render()); },
    filterByStatus(e) {
      const v = e.currentTarget.dataset.status || '';
      this.setData({ statusFilter: this.data.statusFilter === v ? '' : v }, () => this.render());
    },

    /* ===== 新增 / 编辑 ===== */
    openAdd() {
      const form = {};
      const today = fmt.today();
      (schema.fields || []).forEach(f => {
        if (f.type === 'date' && f.defaultToday) form[f.k] = today;
        if (f.type === 'select' && f.defaultValue !== undefined) form[f.k] = f.defaultValue;
        if (f.type === 'number') form[f.k] = form[f.k] !== undefined ? form[f.k] : '';
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

    /* ===== 表单输入（统一处理） ===== */
    onFormInput(e) {
      const f = e.currentTarget.dataset.f;
      const form = Object.assign({}, this.data.form);
      form[f] = e.detail.value;
      this.autoSum(form);
    },

    onFormDate(e) {
      const f = e.currentTarget.dataset.f;
      const form = Object.assign({}, this.data.form);
      form[f] = e.detail.value;
      this.autoSum(form);
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
      this.autoSum(form);
    },

    /** 自动计算（如 金额 = 数量 × 单价） */
    autoSum(form) {
      const a = schema.autoSum;
      if (!a) { this.setData({ form: form }); return; }
      const qty = Number(form[a.qtyField]);
      const price = Number(form[a.priceField]);
      if (!isNaN(qty) && !isNaN(price) && form[a.qtyField] !== '' && form[a.priceField] !== '') {
        const v = qty * price;
        form[a.target] = a.money ? Math.round(v * 100) / 100 : Math.round(v);
      }
      this.setData({ form: form });
    },

    /* ===== 保存 / 删除 ===== */
    saveForm() {
      const form = this.data.form;
      // 必填校验
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

      // 清理内部展示字段（contact__name 不入库）
      Object.keys(record).forEach(k => { if (k.indexOf('__name') > -1) delete record[k]; });

      db.save(schema.key);
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
            db.save(schema.key);
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
