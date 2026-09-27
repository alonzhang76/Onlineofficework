# 发票与付款系统云端化重建 - Implementation Plan

## Task 1: CloudBase Python 云函数 - PDF 发票解析
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 `cloudfunctions/` 下创建 `reim-parse-invoice` Python 云函数
  - 复用 `apps/reimbursement-system/invoice_parser.py` 的全部解析逻辑（pdfplumber + 正则）
  - 入参：PDF 文件（通过云存储 fileID 或 base64）
  - 返回：结构化发票字段 JSON（invoice_no, invoice_code, invoice_type, invoice_date, buyer_name, seller_name, item_name, amount, tax_amount, total_amount, tax_rate, check_code）
  - 解析失败返回 error 信息
  - 配置 requirements.txt（pdfplumber）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-1.1: 上传测试发票 PDF，云函数返回的 invoice_no/buyer_name/seller_name/total_amount 与 PDF 内容一致
  - `rule` TR-1.2: 上传扫描件/图片型 PDF，返回明确的 ParseError 提示
- **Notes**: 云函数部署到 CloudBase 环境 onlineofficework-d4e93l98bdf879e

## Task 2: 前端基础设施 - 登录与 CloudBase 初始化
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 新建 `apps/reimbursement-system/index.html`（纯静态，移除 Flask 模板语法）
  - 引入 `apps/cloudbase/cloudbase.js`（supabase 兼容层）和 `cloudbase.full.js`
  - 实现登录页（邮箱+密码，调用 supabase.auth.signInWithPassword）
  - 登录态检查与自动跳转
  - 退出登录功能
  - 顶栏显示当前用户和角色
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-10
- **Test Requirements**:
  - `rule` TR-2.1: 未登录访问显示登录页，登录成功进入主界面
  - `rule` TR-2.2: 刷新页面保持登录态
  - `rule` TR-2.3: 退出登录后返回登录页

## Task 3: 数据访问层 - CloudBase 数据库封装
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 封装 `app_data_store` 表的 CRUD（沿用 supabase 风格 API）
  - 定义 store_key：`reim_invoices`、`reim_users`、`reim_companies`、`reim_review_log`
  - 每个集合的 payload 为 JSON 数组
  - 实现查询（按字段过滤、排序、分页）、增、改、删
  - 实现 direction 计算（公司抬头匹配逻辑从 app.py 迁移到前端）
- **Acceptance Criteria Addressed**: AC-3, AC-10
- **Test Requirements**:
  - `rule` TR-3.1: 能正确读写 invoices/users/companies/review_log 四个集合
  - `rule` TR-3.2: 按 company_id 匹配 buyer/seller 正确判定进项/销项方向

## Task 4: 发票录入 - PDF 上传解析与保存
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 3
- **Description**:
  - 上传 PDF 到云存储临时路径，调用云函数解析
  - 解析结果回填表单
  - 手工录入表单支持
  - 保存发票到 reim_invoices 集合
  - PDF 归档到 `PDF/{公司短名}/{进项|销项发票}/{发票号}.pdf`
  - cloud_path 回写
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-4.1: 上传 PDF 后表单自动填充且字段正确
  - `rule` TR-4.2: 保存后云存储出现对应路径的 PDF，台账显示"☁ 原件"

## Task 5: 台账管理 - 列表/筛选/状态流转/编辑/删除
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 按角色加载发票列表（admin 全部、approver 待审核、claimant 本人）
  - 多条件筛选（日期、科目、状态、方向、购销方）
  - 状态流转：提交/撤回/审核通过/驳回/过账
  - 编辑发票（含购销方变化时 PDF 迁移）
  - 删除发票（含云端 PDF 清理）
  - 原件查看（云端签名 URL）
  - 审核日志
- **Acceptance Criteria Addressed**: AC-3, AC-6, AC-10
- **Test Requirements**:
  - `rule` TR-5.1: 各角色看到的发票范围正确
  - `rule` TR-5.2: 状态流转每步正确且有日志
  - `rule` TR-5.3: 编辑改购销方后 PDF 迁移到新目录
  - `rule` TR-5.4: 删除发票后云端 PDF 被删除

## Task 6: 付款管理
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 付款登记（日期、金额、方式、备注）
  - 付款状态计算（未付款/部分付款/已付清）
  - 未付差额计算
  - 批量付款
  - 按收款对象（销售方/报销人）筛选未付发票
  - 付款记录导出
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-6.1: 登记部分付款后状态为"部分付款"，差额正确
  - `rule` TR-6.2: 付清后状态为"已付清"

## Task 7: 增值税统计
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 按进项/销项 + 税率维度统计金额、税额、价税合计
  - 日期范围筛选
  - 导出
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-7.1: 统计数字与发票明细汇总一致

## Task 8: 公司管理与用户管理（admin）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 公司抬头 CRUD（名称、短名、税号、启用状态）
  - 公司变更后重算全部发票 direction
  - 用户管理（增删改、角色分配、启用/禁用）- 用户数据存 reim_users，邮箱关联 CloudBase 账号
- **Acceptance Criteria Addressed**: AC-9, AC-3
- **Test Requirements**:
  - `rule` TR-8.1: 新增公司后相关发票 direction 更新
  - `rule` TR-8.2: 用户角色变更后重新登录权限生效

## Task 9: 数据导出
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 发票数据导出 Excel/CSV（前端生成，可用 SheetJS 或纯 CSV）
  - 付款记录导出
- **Acceptance Criteria Addressed**: AC-7（导出部分）
- **Test Requirements**:
  - `rule` TR-9.1: 导出文件内容与台账数据一致

## Task 10: 门户集成与 apps.json 修正
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - apps.json 中 reimbursement 的 url 改为 `apps/reimbursement-system/index.html`
  - 确保 index.html 引用的静态资源路径正确（相对路径）
  - 部署到 www.lori.net.cn 后验证门户跳转
- **Acceptance Criteria Addressed**: AC-1, AC-11
- **Test Requirements**:
  - `rule` TR-10.1: apps.json 中 url 不含 127.0.0.1
  - `rule` TR-10.2: 在线门户点击应用卡片正常打开

## Task 11: 现有数据迁移
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - 从 reimbursement.db 导出 invoices/users/companies/review_log
  - 转换为 CloudBase app_data_store 格式
  - 导入云端对应 store_key
  - 上传现有 uploads/ 中的 PDF 到云存储对应路径
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-11.1: 迁移后云端数据与原 SQLite 数据一致
  - `rule` TR-11.2: 现有 2 条真实发票的 PDF 出现在云存储对应目录

## Task 12: 端到端验证与部署
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1-11
- **Description**:
  - 全部功能在 www.lori.net.cn 环境验证
  - 三角色登录验证
  - 完整业务流验证（录入→审核→过账→付款）
  - 性能检查（列表加载、筛选）
  - 部署文件上传到 www.lori.net.cn
- **Acceptance Criteria Addressed**: AC-1 至 AC-12
- **Test Requirements**:
  - `rule` TR-12.1: 在线环境完整业务流跑通
  - `rubric` TR-12.2: 功能完整度；scale 1-5；anchors 1=缺失多/3=核心可用/5=全功能；threshold >=4；evidence: 逐项验收
