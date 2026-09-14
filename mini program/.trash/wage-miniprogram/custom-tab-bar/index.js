Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/entry/entry', text: '登记', icon: '✏️' },
      { pagePath: '/pages/query/query', text: '汇总', icon: '📋' },
      { pagePath: '/pages/stats/stats', text: '统计', icon: '📊' },
      { pagePath: '/pages/orders/orders', text: '订单', icon: '📦' },
      { pagePath: '/pages/more/more', text: '更多', icon: '⚙️' }
    ]
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      const idx = e.currentTarget.dataset.idx;
      wx.switchTab({ url: path });
      this.setData({ selected: idx });
    }
  }
});
