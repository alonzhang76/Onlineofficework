# 电镀管理完善计划（wage 集成版）

## Context
电镀管理已作为 iframe 页面 `plating.html` 集成进 wage 应用（左侧「电镀管理」）。当前存在四个问题：页面仍是旧版 Tailwind 蓝底风格，与 wage 其它页面不一致；各标签页按钮文案冗长；新建收发货单需手工重复录入订单信息；开票付款台账仍是电镀页本地独立数据，未与 reimbursement-system 的发票/付款台账打通。

本次目标：
1. 电镀页视觉与 wage 统一（#2563eb 主色、深色侧栏已由 wage 提供、浅灰底、Microsoft YaHei、8px 卡片、wage 式表格与按钮）。
2. 精简按钮与导航文案。
3. 新建收发货单时直接读取 wage「订单管理」数据，自动带出客户、产品名称、图纸号、蝴蝶结、电镀厂，减少人工输入。
4. 「开票付款管理」与 reimbursement-system 云端台账对接：电镀侧新增发票/付款写入 `reim_invoices` / `reim_payments`，并以「部门=电镀、项目=订单号」标记；同时展示报销云端中的电镀相关记录。

## 涉及文件
- `/Users/alonzhang/Documents/GitHub/Onlineofficework/apps/wage/plating.html`（主体改造）
- `/Users/alonzhang/Documents/GitHub/Onlineofficework/apps/wage/index.html`（暴露订单数据给同源 iframe）
- 不改动 reimbursement-system 后端；复用其既有 CloudBase 数据结构与 `apps/purchase-integrated/js/common.js` 的云端读写模式。

## 实施方案

### A. 页面风格对齐 wage（plating.html）
1. 在 `</head>` 前新增一段普通 `<style>` 覆盖层（放在 Tailwind 之后，保证优先级）：
   - `body`：背景 `#f1f5f9`，字体 `'Microsoft YaHei','微软雅黑',sans-serif`，字号 14px，颜色 `#1e293b`。
   - 主色覆盖：`--tw` 无法直接改，改为覆盖 `.bg-primary`→`#2563eb`、`.text-primary`→`#2563eb`、`.border-primary`→`#2563eb`；`.btn-primary` 改为 wage 风格（6px 16px、圆角 6px、13px、字重 500、`#2563eb`，hover `#1e40af`）。
   - `.btn-secondary/.btn-success/.btn-warning/.btn-danger` 同步为 wage 配色（浅色底+深色字或实色），尺寸统一。
   - 卡片：`.bg-white.rounded-lg.shadow`（及 rounded-xl）→ 圆角 8px、阴影 `0 1px 3px rgba(0,0,0,.06)`；标题字号 15px/600。
   - 表格：表头背景 `#f8fafc`、13px、下边框 `#cbd5e1`；单元格 6px 10px、`#e2e8f0` 分隔线、hover `#f8fafc`；去掉 Tailwind 的 `uppercase/tracking-wider` 大字表头。
   - 输入框：白底（去掉旧的淡黄底）、1px `#cbd5e1`、4px 圆角、focus 主色描边。
   - 顶部导航（当前蓝底横条）：改为白色卡片式标签栏，底部 1px 边框，未选中 `#64748b`，选中主色文字 + `#dbeafe` 底 + 主色下边框；删除 `plating.html` 内多余的空 header（原 L182-191）。
2. 保持 iframe 高度与 wage 嵌入方式不变；不改 wage 外层样式。

### B. 按钮与文案精简（plating.html）
- 导航：`收发货记录`→`收发货`，`订单汇总`→`订单汇总`，`开票付款管理`→`开票付款`（桌面+移动两处同步）。
- 各页按钮：
  - `新建收发货单`→`新增`
  - `删除所有记录`→`清空`
  - `导出EXCEL`→`导出`
  - `批量修改`→`批量编辑`
  - `生成对账单`→`对账单`
  - `新建发票`→`新增发票`，`新建付款`→`新增付款`
  - `搜索`→`查询`，`重置`保留
  - 弹窗内 `保存`/`取消` 保留（已是短文案）
- 隐藏页（orders/shipping/customers）按钮一并改短，避免后续复用时风格不一致。

### C. 收发货单读取 wage 订单（重点）
1. wage `index.html` 暴露只读 API（放在 DB 定义/加载后，约 L1330 附近）：
   ```js
   window.wageGetOrders = () => (DB.orders || []).map(o => ({
     customer:o.customer||'', orderNo:o.orderNo||'', type:o.type||'',
     spec:o.spec||'', drawingNo:o.drawingNo||'', bow:o.bow||'',
     qty:o.qty||0, plating:o.plating||''
   }));
   window.wageDataVersion = 0; // DB.save('orders') 后自增
   ```
   在 `DB.save('orders')` 调用处递增 `wageDataVersion`（或封装到 `save` 内按 key 判断）。
2. plating.html 新增 `getWageOrders()`：
   - 同源 iframe 时调用 `window.parent.wageGetOrders?.()`；异常/为空时回退到本地 `tableConfigs.orders.originalData`（兼容旧数据）。
   - 优先取 `plating`（电镀）字段非空的订单；若为空则回退全部订单。
3. 新建/编辑收发货弹窗：
   - 订单号输入改为 `input + datalist`（保留手工输入能力），datalist 列出 `订单号（客户）`。
   - 监听订单号 `change/input`：命中订单后自动填充 `客户`、`产品名称`（取 `spec || type`）、`图纸号`、`蝴蝶结`；字段已有值时仅在为空时填充，避免覆盖人工修改。
   - 发货类型下额外记录/展示电镀厂（取 `plating`），作为后续发票销售方来源；表单隐藏字段 `delivery-plating-vendor`。
   - 打开弹窗时刷新 datalist，保证 wage 新增订单立即可用。
4. 收发货记录已有 13 列结构保持不变（不新增列），电镀厂名称在开票/付款表单中按订单号实时从 wage 订单取，避免改存储结构。

### D. 开票付款与 reimbursement-system 对接
1. 数据源识别：复用 reimbursement 云端行 `reim_invoices`、`reim_payments`（`app_data_store`，`store_key` 过滤，读最新 `updated_at`），逻辑参考 `apps/purchase-integrated/js/common.js` 的 `_cloudRow/_cloudSave`（L633-805）。
2. 电镀侧记录映射（写入报销云端）：
   - 发票（进项，电镀厂开给我方）：
     `invoice_no=发票号`、`invoice_date=开票日期`、`seller_name=电镀厂`、`buyer_name=默认本公司（可在表单填）`、`item_name='电镀加工费'`、`total_amount=开票金额`、`project=订单号`、`department='电镀'`、`claimant='电镀管理'`、`status='待审核'`、`payee='销售方'`、`settle='正常付款'`、`direction='进项'`、`id=Date.now()`。
     发票号已存在且非「已驳回」→ 拒绝重复；「已驳回」→ 覆盖重提交并记 `reim_review_log`（参照 purchase-integrated `submitInvoice` L827-909）。
   - 付款：写入 `reim_payments`：`stage='电镀加工费'`、`amount`、`payment_date`、`payment_method`、`seller_name=电镀厂`、`project=订单号`、`payee='销售方'`、`settle='正常付款'`、`direction='进项'`、`remark`；同时可选回写对应发票 `paid_amount/payment_date/payment_method`（按发票号匹配）。
3. 表单字段扩展：
   - 发票弹窗新增「电镀厂（销售方）」「购方（我方公司）」「发票类型」；订单号选中后自动带出电镀厂并允许修改。
   - 付款弹窗新增「电镀厂」「关联发票号（可选）」。
   - 金额为空/0 时仍允许保存，但写入云端前校验必填（订单号、发票号、日期、金额）。
4. 页面展示：
   - `开票付款管理` 顶部增加「数据来源：报销系统云端」状态与「刷新」按钮；进入标签页时静默拉取云端。
   - 本地 `dyf_invoices`/`dyf_payments` 作为离线缓存与旧数据兼容；云端可用时以云端电镀标记记录为准，并合并显示本地未同步记录（标注「未同步」）。
   - 增加「同步到发票系统」批量按钮：把本地未同步记录按上述映射写入云端，成功后标记 `syncedAt`。
5. 容错：CloudBase 登录态未就绪时，页面仍可用本地台账，并提示「云端暂不可用，已保存本地」。不修改报销系统后端代码。

## 验证
1. 本地起静态服务：在 `/Users/alonzhang/Documents/GitHub/Onlineofficework` 执行 `python3 -m http.server 8125`，打开 `apps/wage/index.html`。
2. 视觉：电镀页背景、字体、主色、卡片、表头、按钮与 wage「订单管理」页对齐；标签栏为白底样式。
3. 文案：三个标签及所有操作按钮均为精简文案，无「删除所有记录/新建收发货单/导出EXCEL」等长文案残留。
4. 订单联动：在 wage 订单管理新增一条订单（填电镀、图纸号、蝴蝶结），切到电镀管理新建发货单，输入订单号应自动带出客户/产品名称/图纸号/蝴蝶结/电镀厂；修改 wage 订单后重新打开弹窗数据同步。
5. 开票付款：新增发票/付款后，报销系统云端 `reim_invoices`/`reim_payments` 出现对应记录（可用浏览器控制台查询 `supabase.from('app_data_store')` 或报销系统页面核对）；重复发票号被拒绝；云端不可用时本地保存并提示。
6. 回归：收发货保存、编辑、删除、排序、合计、Excel 导出、订单汇总对账单、发票/付款分页筛选均正常，控制台无报错。
