// 工资模块底部标签栏组件（门户型替代 custom-tab-bar）
// selected 由页面通过属性传入；页面间用 redirectTo 切换，避免页面栈堆叠
Component({
  properties: {
    selected: {
      type: Number,
      value: 0
    }
  },
  data: {
    list: [
      { pagePath: '/pages/wage/entry/entry', text: '登记' },
      { pagePath: '/pages/wage/query/query', text: '汇总' },
      { pagePath: '/pages/wage/stats/stats', text: '统计' },
      { pagePath: '/pages/wage/orders/orders', text: '订单' },
      { pagePath: '/pages/wage/more/more', text: '更多' }
    ]
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      wx.redirectTo({ url: path });
    }
  }
});
