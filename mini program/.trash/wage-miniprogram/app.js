const db = require('./utils/db');

App({
  onLaunch() {
    db.loadAll();
    // 若已配置 Supabase，则启动时从云端拉取并覆盖本地缓存，实现多端同步
    db.syncFromCloud();
  },
  globalData: {
    // 公司名称（各页面页首统一展示）
    companyName: '普利美（常州）环境工程科技有限公司',
    companyNameEn: 'PULIMEI (CHANGZHOU) ENVIRONMENTAL ENGINEERING TECHNOLOGY CO., LTD.'
  }
});
