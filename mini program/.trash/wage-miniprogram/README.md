# 计件工资管理系统 - 微信小程序版

基于 Web 版（apps/wage/index.html）1:1 功能移植，iOS 清新风格界面。

## 功能清单（与 Web 版一致）

| 模块 | 说明 |
|---|---|
| 工序登记 | 批量录入（日期+员工+多行工序）、订单信息同步、超额计价自动计算、当日记录编辑/删除 |
| 工资汇总表 | 日期/员工/工序/客户/订单号筛选、加载更多分页、CSV 导入导出、批量清空 |
| 月度汇总 | 出勤天数、基本工资 + 8 项调整（绩效奖/房贴/其它补贴/年终奖/代扣社保/代扣公积金/扣借款/代扣个税）内联编辑、下拉选项管理（长按字段）、员工工序明细 |
| 年度汇总 | 年份/员工/月份筛选、12 个月分布展开、明细导出 |
| 统计分析 | 经营总览、员工排名、订单分析、订单统计（年度产出）、月度趋势、员工×工序矩阵 |
| 员工管理 | 卡片式列表、搜索、在职/离职筛选、增删改 |
| 工序管理 | 单件计价/每日定额/超额计价、搜索、增删改 |
| 订单管理 | 全字段（类型/图纸号/规格/数量/产出/库存/电镀/蝴蝶结/投料/包装/出货/交期）、月度产出 m1-m12、状态自动判定、多条件筛选、CSV 导入导出 |
| 日历记事 | 月历视图、当日事件、待办/逾期统计、事件类型（交货/订货/出差/其它）、订单交期自动生成事件 |
| 数据备份 | JSON 全量备份/恢复、数据概览、Supabase 云同步状态 |

## 使用方法

1. 打开**微信开发者工具** → 导入项目 → 选择本目录（`wage-miniprogram`）
2. AppID 填你自己的小程序 AppID（测试可先用"测试号"）
3. 编译即可运行。数据先存本地（wx storage），键名与 Web 版一致

## Excel 说明

微信小程序无法像浏览器那样直接解析 .xlsx，本项目改用 **CSV**（Excel 可直接另存为 CSV，导出的 CSV 也带 BOM 可被 Excel 直接打开）。列名与 Web 版 Excel 模板相同（日期/员工/工序/单价/数量/合计/客户/订单号/备注等），导入时自动识别表头。

## 连接 Supabase 实现云同步

### 1. 建表（在 Supabase SQL Editor 执行）

```sql
create table if not exists app_data (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
alter table app_data enable row level security;

-- 简单起步：允许匿名读写（生产环境建议加 auth 策略）
create policy "allow read" on app_data for select using (true);
create policy "allow insert/update" on app_data for insert with check (true);
create policy "allow update" on app_data for update using (true);
```

### 2. 填写配置

编辑 `utils/supabase.js`：

```js
const CONFIG = {
  url: 'https://xxxxxxxx.supabase.co',   // Project URL
  anonKey: 'eyJhbGciOi...',              // anon public key
  table: 'app_data'
};
```

### 3. 同步机制

- 每次保存（增删改）自动异步上推送 Supabase（upsert，不影响本地响应速度）
- 小程序启动时自动拉取云端全部数据覆盖本地，实现**手机/网页多端同步**
- 已配置云同步后，"数据备份"页显示"已连接"

## 项目结构

```
wage-miniprogram/
├── app.json / app.js / app.wxss   # 全局配置（tabBar: 登记/汇总/统计/订单/更多）
├── utils/
│   ├── db.js          # 数据层：与 Web 版同构的数据模型与业务逻辑
│   ├── supabase.js    # Supabase REST 适配器（填配置即用）
│   ├── format.js      # 金额/日期格式化
│   └── csv.js         # CSV 导入导出（替代 Web 版 xlsx）
└── pages/
    ├── entry/      工序登记（tab）
    ├── query/      工资汇总表（tab）
    ├── stats/      统计分析（tab，6 个子视图）
    ├── orders/     订单管理（tab）
    ├── more/       更多入口（tab → 月度/年度/日历/员工/工序/备份）
    ├── monthly/    月度汇总
    ├── annual/     年度汇总
    ├── employees/  员工管理
    ├── processes/  工序管理
    ├── calendar/   日历记事
    └── backup/     数据备份
```
