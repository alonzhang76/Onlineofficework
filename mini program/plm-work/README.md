# 普利美工作 · 微信小程序

> 普利美（常州）环境工程科技有限公司 · 企业应用门户小程序
> PULIMEI (CHANGZHOU) ENVIRONMENTAL ENGINEERING TECHNOLOGY CO., LTD.

一个**门户型小程序**：首页为「普利美工作」工作台，点击图标进入各业务子系统。

---

## 一、应用结构

```
首页「普利美工作」 (pages/home/home)
├── 💰 计件工资管理  →  pages/wage/*
├── 🚢 外贸出口管理系统  →  pages/trade/*（密码保护 alon2601）
├── 📅 订单排程  →  pages/schedule/*（密码保护 anny2601）
├── 🛒 采购管理  →  pages/purchase/*（双公司隔离）
└── 💹 收支管理  →  pages/income/*（双公司隔离，密码保护 anny2601）
```

### 计件工资管理（11 个页面）

| 页面 | 路径 | 说明 |
|---|---|---|
| 登记 | `pages/wage/entry/entry` | 工序录入、当日记录 |
| 汇总 | `pages/wage/query/query` | 工资汇总表、筛选、导出 |
| 统计 | `pages/wage/stats/stats` | 按工序/员工统计、排行、趋势 |
| 订单 | `pages/wage/orders/orders` | 订单管理（月度产出/库存） |
| 更多 | `pages/wage/more/more` | 功能入口 |
| 月度汇总 | `pages/wage/monthly/monthly` | 按月工资明细与调整项 |
| 年度汇总 | `pages/wage/annual/annual` | 12 个月工资矩阵 |
| 员工管理 | `pages/wage/employees/employees` | 员工增删改 |
| 工序管理 | `pages/wage/processes/processes` | 工序单价/定额/超额价 |
| 日历记事 | `pages/wage/calendar/calendar` | 日历事件（订单自动同步） |
| 数据备份 | `pages/wage/backup/backup` | 备份 / 恢复 / 云同步 |

**登记页的订单与工序选择**

- **订单信息可从订单库点选**：公共订单信息与每行的订单信息旁都有「选订单」按钮，弹层只列出 **待生产 / 生产中** 的订单（判定：无投料日期=待生产，有投料无打箱=生产中），支持客户/订单号/图号/规格关键词过滤；候选卡片展示与订单页一致的完整信息（类型、图纸号、规格、订单量、产出、库存、投料、交期、电镀、下单日、备注），点选即填入"客户,订单号"，并同时把 **图纸号 / 规格** 存入记录（`drawingNo`、`spec` 字段）。手工改动订单信息会自动解除与所选订单的关联；「同步至所有空白行」也会带出图号/规格。
- **工序两种选法**：① 原生下拉 picker（原有方式不变）；② 点「🔍 筛选」打开弹层，输入关键字过滤工序列表（含单价/件），点选即填。

### 外贸出口管理系统（13 个页面，含密码验证页）

| 模块 | 路径 | 说明 |
|---|---|---|
| 系统首页 | `pages/trade/hub/hub` | 9 大模块宫格入口 |
| 备忘录 | `pages/trade/memo/memo` | 卡片网格、6 色标签、置顶、搜索 |
| 业务跟踪 | `pages/trade/business/business` | 状态徽章、跟进单号分组、联系记录、提醒筛选 |
| 账务管理 | `pages/trade/payment/payment` | 付款记录、按客户/类型筛选 |
| 发票管理 | `pages/trade/invoice/invoice` | 开票记录、代理费/运杂费 |
| 出口管理 | `pages/trade/export/export` | 出货/到港、运编号、船名航次、集装箱、提单 |
| 收汇管理 | `pages/trade/receipt/receipt` | 收汇金额/手续费/汇率、折人民币 |
| 订单管理 | `pages/trade/order/order` | **多产品行**、状态自动流转、20 项筛选 |
| 客户信息 | `pages/trade/customer/customer` | 卡片列表、客户/供应商分组、国家/年份/优先级筛选 |
| 报表统计 | `pages/trade/report/report` | 收汇/付款统计、订单动态提醒、欠款统计 |
| 更多 | `pages/trade/more/more` | 快捷入口、云同步状态 |
| 数据备份 | `pages/trade/backup/backup` | 备份 / 恢复 / 云同步 |

---

### 订单排程（8 个页面）

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/schedule/hub/hub` | KPI 看板、功能宫格、最近订单 |
| 订单管理 | `pages/schedule/order/order` | 约 40 字段订单（4 笔付款、两段产出），多条件筛选 |
| 生产跟踪 | `pages/schedule/production/production` | 产出进度、打箱、出货状态 |
| 财务收款 | `pages/schedule/finance/finance` | 开票/付款状态筛选，收款 KPI |
| 汇总统计 | `pages/schedule/summary/summary` | 按客户/月份/状态，欠款=已开票−已收款 |
| 日历记事 | `pages/schedule/calendar/calendar` | 月历 + 按日记事（可勾选完成） |
| 备忘录 | `pages/schedule/memo/memo` | 优先级、截止日、待办/完成 |
| 数据备份 | `pages/schedule/backup/backup` | JSON 导出/恢复/云端拉取 |

汇率表（网页版一致）：USD 7.2 / EUR 7.8 / GBP 9.1 / JPY 0.048 / CNY 1。

### 采购管理（8 个页面，双公司隔离）

数据按公司隔离：`companyA` 普利美（常州）环境工程科技有限公司、`companyB` 无锡龙力印铁设备制造有限公司，采购首页顶部切换，数据与云端键名互不干扰。

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/purchase/hub/hub` | 采购/发票/付款总额、应付净额 |
| 采购订单 | `pages/purchase/order/order` | 多产品行明细，总金额自动汇总 |
| 发票登记 | `pages/purchase/invoice/invoice` | 付款状态按发票号自动回写 |
| 付款管理 | `pages/purchase/payment/payment` | 凭合同/凭发票两种模式 |
| 供应商 | `pages/purchase/supplier/supplier` | 全局共享，含开户行信息、拨打电话 |
| 合同台账 | `pages/purchase/contract/contract` | 由采购订单派生（过滤木箱），收货/退货登记 |
| 报表统计 | `pages/purchase/report/report` | 按供应商汇总，应付=发票−付款 |
| 数据备份 | `pages/purchase/backup/backup` | 按公司导出/恢复 |

### 收支管理（5 个页面，双公司隔离）

数据按公司隔离：`company1` 普利美、`company2` 无锡龙力，首页顶部切换。

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/income/hub/hub` | 账户结余大字、总收入/支出/笔数、最近流水 |
| 流水明细 | `pages/income/list/list` | 收入/支出/分类/日期/关键词筛选，新增与编辑 |
| 待办事项 | `pages/income/todo/todo` | 优先级、完成勾选（全局共享，不分公司） |
| 统计汇总 | `pages/income/report/report` | 按分类（收入/支出占比）、按月（收支结余） |
| 数据备份 | `pages/income/backup/backup` | 两家公司流水 + 待办的 JSON 导出/恢复 |

分类表与网页版完全一致：收入 7 类、支出 26 类（原材料、电镀费、外协加工费、固定资产设备等）。
结余 = 总收入 − 总支出。

**「记一笔」表单约定**

| 字段 | 说明 |
|---|---|
| 当前抬头 | 只读展示，= 顶部所选公司的全称 |
| 金额 + 日期 | 一行两列 |
| 分类 + 支付方式 | 一行两列（分类为必选 picker） |
| 说明 | 单行 |
| 付款单位（收入）/ 收款单位（支出） | 输入即从历史往来单位中筛选提示，点选直接填入 |

- **「单位」字段不再手工填写**：一律由所属公司账本自动决定——`company1` 全部为「普利美（常州）环境工程科技有限公司」，`company2` 全部为「无锡龙力印铁设备制造有限公司」。历史数据（含旧版手填的计量单位）由 `normalizeUnits()` 在启动/云同步/导入备份时自动归一，仅在确有变化时写回并推云端。
- 往来单位候选由 `listCounterparties()` 汇总该公司流水中出现过的收/付款单位，按时间倒序去重；表单内最多提示 6 条，点击即填。


## 二、核心业务逻辑

数据层位于 `utils/trade-db.js`，与网页版 `apps/wicketorders` **完全同构**。

### 1. 订单状态自动流转

| 触发动作 | 状态变化 |
|---|---|
| 新建订单 | `待生产` |
| 保存收汇记录 | `待生产` → `生产中` |
| 保存出口记录 | → `已出货` |

### 2. 欠款统计算法（`generateDebtStatistics`）

1. 订单金额按**订单号聚合**（多产品行累加）
2. 收汇按 `(收汇金额 − 手续费) × 汇率` 折算
3. 外币订单用该订单**收汇平均汇率**折算
4. 已收 < 订单金额 → 列入欠款
5. 待生产/生产中且无收汇 → 欠款 = **全款**

**固定汇率表**：USD 7.2 ｜ EUR 8.0 ｜ GBP 9.2 ｜ JPY 0.048 ｜ CNY 1

### 3. 订单动态提醒（`generateOrderReminders`）

按订单号分组（订单/收汇/付款/出口/发票），检查：

| 图标 | 级别 | 触发条件 |
|---|---|---|
| ⚠️ | warning | 有流水无订单记录 / 状态为待生产·生产中 / 已出货或已收汇但无出口 |
| ℹ️ | info | 无收汇 / 有收汇无发票 / 有收汇无付款 |
| ✅ | success | 预付款订单且未出货 |

### 4. 报表统计（`getReportStatistics`）

- 收汇：`(amountReceived − fee) × exchangeRate`，按 `receiptDate` 归集本月/本年/累计
- 付款：`amount`，按 `paymentDate` 归集本月/本年/累计

### 5. 业务跟踪状态自动处理（`autoUpdateSameFollowupNoStatus`）

同一 `followupNo` 有 ≥2 条记录时，按 `contactDate` 降序排列，**仅最新一条保留自身状态**，其余自动置为「已回复」。

### 6. 备忘录排序（`queryMemos`）

置顶优先 → 再按 `updatedAt || createdAt` 倒序。

---

## 三、技术要点

### 文件结构

```
plm-work/
├── app.js                    启动加载两个子系统数据 + 云端拉取
├── app.json                  46 个页面注册
├── app.wxss                  iOS 风格全局样式（含 .brand 品牌栏）
├── sitemap.json
├── project.config.json
├── pages/
│   ├── home/                 「普利美工作」门户首页
│   ├── wage/                 计件工资（11 页）
│   └── trade/                外贸出口（13 页，含密码验证页）
├── components/
│   └── wage-tabbar/          工资模块底部立体标签栏（自定义组件）
└── utils/
    ├── wage-db.js            计件工资数据层（8 个存储键）
    ├── trade-db.js           外贸数据层（8 个存储键 + 4 大算法）
    ├── cloudbase.js          CloudBase 云同步适配器（数据同步 + 门户登录 + 权限）
    ├── cb-files.js           云存储文件中心（列目录/上传/下载/删除）
    ├── format.js             日期/金额格式化
    └── csv.js                CSV 导入导出（替代网页版 xlsx）
```

### 模块访问密码

外贸出口、订单排程、收支管理三个模块受密码保护，点击门户卡片后进入验证页（`pages/trade/lock/lock`，通过 `?module=trade|schedule|incomeexpense` 区分），验证通过才可进入。

| 模块 | 密码字段 | 当前值 | 解锁状态字段 |
|---|---|---|---|
| 外贸出口 | `globalData.tradePassword` | `alon2601` | `globalData.tradeUnlocked` |
| 订单排程 | `globalData.schedulePassword` | `anny2601` | `globalData.scheduleUnlocked` |
| 收支管理 | `globalData.incomeExpensePassword` | `anny2601` | `globalData.incomeExpenseUnlocked` |

- 解锁状态**冷启动重置为 false**，同一次启动内再次进入无需重复输入
- 覆盖范围：模块首页 + 兜底校验（绕过门户直接进入也会被弹回验证页）；外贸的「云同步」入口同样先验证
- 外贸「更多」页 / 排程首页 / 收支首页提供「🔒 锁定模块」，可手动立即锁定
- 门户卡片右上角显示 🔒（未解锁）/ 🔓（已解锁）状态角标

### 表单与弹层规范（全模块通用）

所有表单控件与弹层都走 `app.wxss` 里的全局类，新增页面直接复用即可保持一致。

**输入控件统一高度**

| 控件 | 规则 |
|---|---|
| 文本输入 `input` | `height: 72rpx`，`line-height: 68rpx`，白底 + `2rpx #DCDCE0` 描边 + `12rpx` 圆角 |
| 日期/下拉 `picker` 展示值 | 同样 `height: 72rpx`，与输入框完全等高（覆盖 `form-item > picker` 与 `picker > .form-item` 两种嵌套） |
| 多行文本 `textarea` | 一律带 `auto-height`，`min-height: 176rpx`（约 4 行），内容多则自动向下增长 |
| 聚焦/按下 | 描边变主色 `#007AFF` 并带 4rpx 淡蓝光晕 |
| 多行文本所在行 | `form-item` 加 `ta` 类 → 标签顶对齐（`.form-item.ta`） |

> 坑点：小程序 `input` 不给显式高度时用的是组件默认高度，会出现「同一表单里高低不齐、文字上下被裁」。日期/下拉的 `picker` 展示值是普通 `view`，若不给同款高度会和输入框对不齐。

**弹层必须可滚动**

```html
<view class="mask" catchtouchmove="noop" bindtap="close">   <!-- 遮罩阻断背景滚动 -->
  <view class="sheet" catchtap="noop">                        <!-- flex 纵向容器 -->
    <view class="sheet-title">标题<text class="sheet-close">✕</text></view>  <!-- 固定不滚动 -->
    <scroll-view scroll-y class="sheet-body">                 <!-- 正文交给 scroll-view -->
      ...
    </scroll-view>
  </view>
</view>
```

> 坑点 1：小程序里 `<view style="overflow-y:auto">` **不响应触摸滚动**，手指滑动会穿透到背后页面（表现为「弹层固定不动、背景在动」）。正文必须用 `<scroll-view scroll-y>`，遮罩加 `catchtouchmove` 阻断背景滚动。
>
> 坑点 2：小程序的 `scroll-view` **必须拿到确定的物理高度才会滚动**。开发者工具里 `flex: 1 + min-height: 0` 看着正常，**真机上高度会解析成内容高度**，被弹层的 `overflow: hidden` 裁掉——看起来就是「字段被截断、滑不动」。所以 `.sheet-body` 上直接给 `max-height: calc(85vh - 110rpx)`（85vh 上限减去固定标题高度），内容少时按内容高、内容多时钳到上限并可滚动。`.check-project.js` 已加校验：弹层缺 `scroll-view`、遮罩缺 `catchtouchmove` 都会报错。

### 设计语言

- 背景 `#F2F2F7`、主色 `#007AFF`、卡片圆角 `24rpx`
- 毛玻璃 `backdrop-filter: blur()`
- 安全区适配 `env(safe-area-inset-bottom)`
- 立体图标：`translateY` + 多层 `box-shadow`（外投影 + 双向 inset 高光/暗边）+ 渐变
- 每个页面页首统一展示公司名品牌栏（`.brand`）

### CSV 替代 Excel

小程序不支持 xlsx 库，改为：

- **导出**：`csv.toCSV()` 生成带 UTF-8 BOM 的 CSV → `wx.shareFileMessage()` 发送
- **导入**：`wx.chooseMessageFile()` 选择 → `csv.parseCSV()` 解析 → 列名模糊匹配映射

### 云同步（腾讯 CloudBase）

五个子系统与网页版共用同一腾讯云开发 CloudBase 后端（PostgreSQL 模式，环境
`onlineofficework-d4e93l98bdf879e`，ap-shanghai）的 `app_data_store` 表，
通过**命名空间**隔离：

| 命名空间 | 数据键 |
|---|---|
| `wage` | `wage_records`、`wage_employees`、`wage_processes`、`wage_orders`、`wage_adjustments`、`wage_dropdown_options`、`wage_calendar_events`、`wage_calendar_event_types` |
| `trade` | `orderRecords`、`customerRecords`、`exportRecords`、`invoiceRecords`、`receiptRecords`、`indexPaymentRecords`、`memoRecords`、`businessRecords`、`orderLabelsData` |
| `schedule` | `production_orders_data`、`calendarNotes`、`memos` |
| `purchase` | `purchaseOrders_companyA/B`、`companyA-invoices`、`companyB-invoices`、`companyA-payments`、`companyB-payments`、`contracts_companyA/B`、`receipts_companyA/B`、`returns_companyA/B`、`suppliers`、`companyNames`、`units` |

> 云端键名：工资（wage 专用直连）用裸键；其余命名空间在键名前加网页版 APP_ID 前缀——`wicketorders__`、`orderschedule__`、`purchase__`、`incomeexpense__`（与网页版 `cloudbase-sync.js` 规则一致）。云端为 PG 行形态 `{id, data:{store_key, payload, updated_at}}`，`id = store_key`。

- 启动时 `syncFromCloud()` 拉取云端最新数据覆盖本地
- 每次 `save()` 自动 upsert 推送云端
- 鉴权：`sync@lori.app` 静默登录 CloudBase（`POST /auth/v1/token`，grant_type=password），
  access_token 2 小时 / refresh_token 31 天（用后轮换），缓存 + 过期自动续期 + 401/403 自动重登重试
- 数据接口：PostgREST 兼容 REST `GET/POST /v1/rdb/rest/app_data_store`（与网页版兼容层同源）

> **部署前**：需在微信公众平台把 `https://onlineofficework-d4e93l98bdf879e.api.tcloudbasegateway.com` 加入 **request 合法域名**。
> 开发期可在开发者工具「详情 → 本地设置」勾选 **不校验合法域名**。

---

## 四、使用说明

1. 用微信开发者工具打开 `plm-work` 目录
2. 填入自己的 AppID（当前配置 `wx884f5bd3d8176903`）
3. 编译预览 → 首页即「普利美工作」工作台
4. 点击「计件工资」或「外贸出口」图标进入子系统
5. 各子系统「更多」页有「🏠 返回普利美工作」入口

---

## 五、与网页版的数据互通

数据键名与网页版 `localStorage` **完全一致**，因此：

- 网页版导出的 `外贸数据备份_YYYY-MM-DD.json` 可在小程序「数据备份」页直接恢复
- 网页版导出的各模块 CSV 可在小程序对应模块「导入」
- 云同步开启后，网页版与小程序**自动双向同步**（同一 CloudBase 后端）

---

## 五·五、统一登录与应用权限

小程序新增统一登录页（`pages/login/login`），与网页版门户同一账号体系：

- **邮箱 + 密码登录**（CloudBase 身份认证，与网页版一致）
- 登录后从 `user_app_permissions` 表（`id = 'perm::<小写邮箱>'`，`data.perms = {appId: 'read'|'write'|'none'}`）
  读取该用户的应用可见性，**不同用户登录后首页显示不同的应用**
- 管理员（`alonzhang76@outlook.com`）登录可见全部应用；普通用户需管理员在网页版门户
  「管理面板」中分配权限后才能看到对应应用
- 权限为空的用户登录后首页显示"尚未分配应用权限"提示
- 登录态持久化本地（`plm_user_v1`），冷启动自动恢复；首页右上角用户徽章可退出登录
- 数据云同步使用独立的共享同步账号，与登录用户互不影响

> 注意：云端 `user_app_permissions` 当前为空表——普通用户需先在网页版门户
> 管理面板按邮箱配置权限；管理员直接可见全部应用。

---

## 五·六、云存储（文件中心）

计件工资 / 外贸出口 / 订单排程 三个应用内置「☁️ 云存储」页（共用
`pages/cloudfiles/cloudfiles`，按 `?app=` 参数区分根目录）：

- 应用间云端路径隔离：`wage/`、`wicketorders/`、`orderschedule/`（与网页版一致）
- 分区上传：图片 / PDF / Excel / Word / PPT / 其他（自动归类到同名子文件夹）
- 文件管理：目录层级浏览、图片预览、文档打开（wx.openDocument）、复制下载链接、删除
- 底层：列目录走已部署的云函数 `tcb-file-list`；上传走
  `POST /v1/storages/get-objects-upload-info` + COS PUT 直传；下载链接走
  `POST /v1/storages/get-objects-download-info`；删除走 `POST /v1/storages/delete-objects`
- 单文件上限 10MB（网页版一致）
- 手机端与网页版上传的文件在同一目录，**双端互通**

---

## 六、页面清单（app.json）

```
pages/login/login                    统一登录（邮箱/用户名 + 密码，按权限显示应用）
pages/home/home                      普利美工作（门户）
pages/cloudfiles/cloudfiles          云存储文件中心（?app=wage|trade|schedule）
pages/wage/entry/entry               计件工资 · 登记
pages/wage/query/query               计件工资 · 汇总
pages/wage/stats/stats               计件工资 · 统计
pages/wage/orders/orders             计件工资 · 订单
pages/wage/more/more                 计件工资 · 更多
pages/wage/monthly/monthly           月度汇总
pages/wage/annual/annual             年度汇总
pages/wage/employees/employees       员工管理
pages/wage/processes/processes       工序管理
pages/wage/calendar/calendar         日历记事
pages/wage/backup/backup             工资数据备份
pages/trade/hub/hub                  外贸系统首页
pages/trade/order/order              订单管理
pages/trade/customer/customer        客户信息
pages/trade/export/export            出口管理
pages/trade/receipt/receipt          收汇管理
pages/trade/invoice/invoice          发票管理
pages/trade/payment/payment          账务管理
pages/trade/memo/memo                备忘录
pages/trade/business/business        业务跟踪
pages/trade/report/report            报表统计
pages/trade/more/more                外贸更多
pages/trade/backup/backup            外贸数据备份
```

---

Designed By AlonZhang ｜ Contact 136 6511 9291
