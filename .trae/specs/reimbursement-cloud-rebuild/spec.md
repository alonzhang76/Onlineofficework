# 发票与付款系统云端化重建 - Product Requirements Document

## Overview
- **Summary**: 将 `apps/reimbursement-system` 从本地 Flask + SQLite 服务重建为纯前端 + CloudBase 云端存储 + CloudBase 云函数（PDF 解析）的架构，部署到 www.lori.net.cn，使任何电脑通过浏览器即可用用户名密码登录访问，不再依赖本机 8686 端口。
- **Purpose**: 解决当前应用只能在运行 Flask 服务的本机访问、无法跨电脑共享的问题，使其与其他炉架业务应用（wage、wicketorders、purchase、orderschedule、incomeexpense）保持一致的访问方式。
- **Target Users**: 管理员（admin）、审核人（approver）、报销人（claimant），与现有角色体系一致。

## Goals
- 通过 www.lori.net.cn 在线门户点击"发票与付款系统"即可打开，任何联网电脑可用
- 使用 CloudBase 邮箱/密码登录（与 wage 应用一致的登录体验）
- 保留现有全部业务功能：发票录入（PDF 自动识别 + 手工录入）、台账审核流、付款管理、增值税统计、公司抬头管理、用户管理、数据导出
- 发票 PDF 自动归档到 CloudBase 云存储 `PDF/{公司}/{进项|销项发票}/` 目录
- 现有 2 条真实发票数据迁移到云端

## Non-Goals
- 不改变业务流程和角色权限模型（admin/approver/claimant 三级 + 草稿→待审核→已通过→已入账状态流）
- 不重新设计 UI（沿用现有 index.html 的布局和交互）
- 不实现扫描件 OCR（图片型 PDF 仍提示手工录入，与现有行为一致）
- 不实现多租户/多公司数据隔离（沿用现有 companies 表维护本公司抬头）

## Background & Context
- 当前架构：Flask（app.py 1686 行，50+ API）+ SQLite（reimbursement.db）+ pdfplumber（invoice_parser.py），绑定 127.0.0.1:8686，仅本机可访问
- apps.json 中该应用 URL 为 `http://127.0.0.1:8686/`，其他电脑点击无效
- 项目已有完整 CloudBase 基础设施：`apps/cloudbase/cloudbase.js`（提供 `window.supabase` 兼容层，支持 auth.signInWithPassword、rdb 数据库、callFunction 云函数、storage 云存储）
- 数据存储模式：`app_data_store` 表（`id` + `data` JSON），wage 等应用按 `store_key` 区分不同数据集合
- 云函数已有先例：`cloudfunctions/tcb-file-list`（Node.js，@cloudbase/manager-node），可新增 Python 云函数复用 invoice_parser.py
- PDF 解析逻辑（invoice_parser.py）是纯正则提取，与 Flask 解耦，可整体迁移到云函数

## Functional Requirements

### 登录与权限
- **FR-1**: 页面加载时检查 CloudBase 登录态，未登录显示登录页（邮箱+密码），已登录直接进入应用
- **FR-2**: 登录成功后从云端 `reim_users` 集合读取当前用户角色（admin/approver/claimant），按角色控制功能可见性（与现有逻辑一致）
- **FR-3**: 支持退出登录，清除本地登录态

### 发票录入
- **FR-4**: 上传 PDF 后调用 CloudBase 云函数解析发票（复用 invoice_parser.py 的 pdfplumber + 正则逻辑），返回结构化字段
- **FR-5**: 解析成功后自动填充表单，用户可编辑后保存
- **FR-6**: 支持手工录入（不解析 PDF，直接填表保存）
- **FR-7**: 发票保存时上传 PDF 到 CloudBase 云存储，路径为 `PDF/{公司短名}/{进项|销项发票}/{发票号}.pdf`，未匹配公司存 `PDF/未分类/待分类/`
- **FR-8**: 发票 PDF 归档路径回写到发票记录的 `cloud_path` 字段

### 台账管理
- **FR-9**: 按角色显示发票列表（admin 看全部、approver 看待审核、claimant 看本人）
- **FR-10**: 支持多条件筛选（日期范围、科目、状态、方向、购销方）
- **FR-11**: 状态流转：草稿→提交（待审核）→审核通过（已通过）→过账（已入账）；驳回回到已驳回可修改重提
- **FR-12**: 编辑发票后若购销方变化导致归属公司/方向变化，自动迁移云存储 PDF 到对应目录
- **FR-13**: 删除发票时同步删除云端 PDF 文件

### 付款管理
- **FR-14**: 登记付款日期、累计已付金额、付款方式、付款备注
- **FR-15**: 自动计算付款状态（未付款/部分付款/已付清）和未付差额
- **FR-16**: 支持批量付款和按收款对象筛选未付发票
- **FR-17**: 付款记录导出 Excel/CSV

### 增值税统计
- **FR-18**: 按进项/销项、税率维度统计金额、税额、价税合计
- **FR-19**: 支持按日期范围筛选统计
- **FR-20**: 统计结果导出

### 公司与用户管理（admin）
- **FR-21**: 维护公司抬头（名称、短名、税号），用于自动判定进项/销项方向
- **FR-22**: 公司抬头变更后自动重算全部发票的方向
- **FR-23**: 用户管理（增删改、角色分配、启用/禁用）

### 数据导出与备份
- **FR-24**: 发票数据导出 Excel/CSV
- **FR-25**: 保留"保存到云端"/"从云端下载"能力（数据本身就在云端，此功能可简化为数据导出/导入 JSON）

### 门户集成
- **FR-26**: apps.json 中该应用 URL 改为相对路径 `apps/reimbursement-system/index.html`
- **FR-27**: 应用可通过 www.lori.net.cn 在线门户正常打开

## Non-Functional Requirements
- **NFR-1**: 首屏加载时间 < 3 秒（网络正常情况下）
- **NFR-2**: PDF 解析云函数响应时间 < 10 秒（单页发票）
- **NFR-3**: 发票列表 500 条以内筛选响应 < 1 秒（前端过滤）
- **NFR-4**: 所有数据持久化到 CloudBase，刷新页面不丢失
- **NFR-5**: 登录态 7 天内有效（与现有 Flask session 生命周期一致）

## Constraints
- **Technical**:
  - 前端必须用项目已有的 `apps/cloudbase/cloudbase.js` 兼容层（提供 supabase 风格 API）
  - 数据存储沿用 `app_data_store` 表（`id` + `data` JSON），按 `store_key` 区分集合
  - PDF 解析用 CloudBase Python 云函数，复用现有 invoice_parser.py（pdfplumber）
  - 云存储桶为 `app-photos`，路径前缀 `PDF/`
  - CloudBase 环境：`onlineofficework-d4e93l98bdf879e`（ap-shanghai）
  - 前端纯静态，部署到 www.lori.net.cn/apps/reimbursement-system/
- **Business**:
  - 角色权限模型不变（admin/approver/claimant）
  - 发票状态流不变（草稿→待审核→已通过→已入账，含驳回）
  - 现有真实数据需迁移
- **Dependencies**:
  - CloudBase 控制台需创建 3 个登录邮箱（admin/approver/claimant 各一个）
  - CloudBase 需部署 Python 云函数（依赖 pdfplumber）

## Assumptions
- 用户可在 CloudBase 控制台创建邮箱账号并设置密码（用于登录）
- CloudBase 支持 Python 云函数并可安装 pdfplumber 依赖
- 发票数据量在数百条级别，前端过滤性能可接受
- 现有 2 条真实发票数据需从 SQLite 导出并导入云端
- apps.json 会随本次改动一起部署到 www.lori.net.cn

## Open Questions
- [ ] 登录账号：admin/approver/claimant 三个角色的登录邮箱分别是什么？（需用户在 CloudBase 控制台创建）
- [ ] 数据迁移：现有 2 条真实发票是否需要迁移到云端？（建议是）
- [ ] 原 Flask 服务（8686 端口）是否在迁移完成后停用？（建议是，但保留代码以备回退）

## Acceptance Criteria

### AC-1: 在线门户可访问
- **Type**: `rule`
- **Given**: 用户在浏览器打开 www.lori.net.cn 在线门户
- **When**: 点击"发票与付款系统"应用卡片
- **Then**: 跳转到 `apps/reimbursement-system/index.html` 并显示登录页
- **Pass Condition**: 页面正常加载，无 404/白屏
- **Evidence**: 浏览器访问在线门户点击应用，截图显示登录页

### AC-2: 邮箱密码登录
- **Type**: `rule`
- **Given**: 用户已在 CloudBase 控制台创建账号
- **When**: 输入正确邮箱和密码并点击登录
- **Then**: 进入应用主界面，顶栏显示当前用户角色
- **Pass Condition**: 登录成功且角色正确
- **Evidence**: 登录操作截图，显示主界面和角色

### AC-3: 角色权限控制
- **Type**: `rule`
- **Given**: 分别用 admin/approver/claimant 账号登录
- **When**: 查看页面功能菜单
- **Then**: admin 可见用户管理/公司管理/全部发票；approver 只看待审核发票和审核操作；claimant 只看本人发票和录入/提交操作
- **Pass Condition**: 各角色可见功能与原 Flask 版本一致
- **Evidence**: 三个角色登录后的界面截图对比

### AC-4: PDF 发票自动识别
- **Type**: `rule`
- **Given**: 用户上传一张增值税电子普通发票 PDF
- **When**: 云函数解析完成
- **Then**: 表单自动填充发票号码、日期、购销方、金额、税额、价税合计、税率、品名
- **Pass Condition**: 解析字段与 PDF 内容一致（至少发票号、购销方、金额正确）
- **Evidence**: 上传测试 PDF，截图显示解析结果与原 PDF 内容对比

### AC-5: PDF 云端归档
- **Type**: `rule`
- **Given**: 用户保存一张购买方为"龙力"的进项发票
- **When**: 保存成功
- **Then**: PDF 出现在 CloudBase 云存储 `PDF/龙力/进项发票/{发票号}.pdf`，台账该发票显示"☁ 原件"
- **Pass Condition**: 云端文件存在且路径正确，点击"☁ 原件"可打开
- **Evidence**: CloudBase 云存储文件列表截图 + 台账原件按钮可打开

### AC-6: 发票状态流转
- **Type**: `rule`
- **Given**: claimant 录入一张发票（草稿状态）
- **When**: 提交→approver 审核通过→admin 过账
- **Then**: 发票状态依次变为 待审核→已通过→已入账
- **Pass Condition**: 状态流转正确，每步操作有审核日志
- **Evidence**: 状态流转操作截图和审核日志

### AC-7: 付款管理
- **Type**: `rule`
- **Given**: 一张未付款发票
- **When**: 登记部分付款金额
- **Then**: 付款状态变为"部分付款"，未付差额正确
- **Pass Condition**: 付款状态和差额计算正确
- **Evidence**: 付款登记截图，显示状态和差额

### AC-8: 增值税统计
- **Type**: `rule`
- **Given**: 存在若干进项和销项发票
- **When**: 打开增值税统计页面
- **Then**: 按税率维度显示进项/销项的金额、税额、价税合计
- **Pass Condition**: 统计数字与发票明细汇总一致
- **Evidence**: 统计页面截图 + 手动核对计算

### AC-9: 公司管理与方向重算
- **Type**: `rule`
- **Given**: admin 新增一个公司抬头"XX公司"
- **When**: 保存
- **Then**: 现有发票中购销方含"XX公司"的自动更新 direction 字段
- **Pass Condition**: 方向重算正确
- **Evidence**: 新增公司后相关发票 direction 更新

### AC-10: 数据持久化
- **Type**: `rule`
- **Given**: 用户录入并保存一张发票
- **When**: 刷新页面
- **Then**: 该发票仍在台账中
- **Pass Condition**: 刷新后数据不丢失
- **Evidence**: 保存后刷新页面截图

### AC-11: 门户 apps.json URL 修正
- **Type**: `rule`
- **Given**: apps.json 已更新
- **When**: 在线门户加载应用列表
- **Then**: "发票与付款系统"的 URL 为相对路径 `apps/reimbursement-system/index.html`
- **Pass Condition**: apps.json 中 reimbursement 的 url 字段不含 127.0.0.1
- **Evidence**: apps.json 文件内容

### AC-12: 原 Flask 版本功能对等
- **Type**: `rubric`
- **Dimension**: 功能完整度
- **Scale**: 1-5
- **Anchors**: 1 = 少于 50% 功能可用；3 = 核心功能可用但有缺失；5 = 全部功能与原版本一致
- **Pass Threshold**: >= 4
- **Evidence**: 逐项对比原 Flask 版本功能清单
