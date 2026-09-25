# 不锈钢业务管理（微信小程序）

不锈钢业务管理系统 · 独立小程序项目，与网页版（Onlineofficework）**共用同一个腾讯 CloudBase 后端**，手机/电脑双端数据自动同步。

## 功能模块

- 💼 **销售订单**（salesOrders）
- 🛒 **采购订单**（purchaseOrders）
- 📨 **询价单**（inquiries）
- 💰 **报价单**（quotations）
- 📥 **采购收退货**（returnRecords）
- 📤 **销售发退货**（salesReturnRecords）
- 🏬 **库存记录**（inventoryRecords）
- 🗄️ **仓库设置**（warehouses）
- 💴 **收付款**（transactions）
- 🧾 **发票登记**（invoices）
- 📅 **日历记事**（calendarEvents）
- 👥 **通讯录**（contacts）
- 📝 **备忘录**（memos）
- 🔩 **材质对照**（gradeComparisons）
- 🔤 **钢材英语**（vocabularies）
- 📚 **HS编码/标准**（hscodes）
- 🧮 **理算参数**（calculationParams）
- ☁️ **云存储**：文件上传/预览/下载（CloudBase 云存储，云端路径 `stainlessbusiness`）
- 💾 **数据备份**：导出 JSON / 导入恢复 / 手动云同步
- 🔐 **统一登录**：CloudBase 邮箱/用户名 + 密码（与网页版同一账号体系）

## 云端数据

- 后端：CloudBase PostgreSQL 模式，环境 `onlineofficework-d4e93l98bdf879e`（ap-shanghai）
- 表：`app_data_store`（PG 行形态 `{id, data:{store_key, payload, updated_at}}`，`id = store_key`）
- 键前缀：`stainlessbusiness__`
- 同步：启动/下拉/回前台自动拉取合并；每次保存自动推送（失败自动重试，绝不丢本地写入）

## 部署步骤

1. **注册小程序**：微信公众平台注册独立小程序，把 appid 填入 `project.config.json`
2. **配置合法域名**：公众平台 → 开发设置 → request 合法域名，添加：
   `https://onlineofficework-d4e93l98bdf879e.api.tcloudbasegateway.com`
   （每月可修改 50 次；开发期可在开发者工具勾选"不校验合法域名"）
3. **打开项目**：微信开发者工具导入本目录，编译预览
4. **登录**：使用网页版同款 CloudBase 账号登录（账号在 CloudBase 控制台 → 身份认证中管理）

## 目录结构

```
utils/cloudbase.js    CloudBase 适配器（鉴权 + 数据同步 + 登录）
utils/db.js           数据层（本地 storage + 云同步，LWW 冲突裁决）
utils/list-page.js    通用列表页工厂（schema 驱动：搜索/筛选/增删改）
utils/cb-files.js     云存储文件中心
pages/<module>/       各业务模块（schema.js + 通用页面模板）
pages/login/          统一登录
pages/home/           首页（统计 + 模块入口）
pages/cloudfiles/     云存储
pages/backup/         数据备份
```

## 新增/修改业务模块

编辑对应 `pages/<module>/schema.js` 即可：字段、类型、必填、状态选项、
自动计算（数量×单价）等全部由 schema 驱动，无需改动页面代码。
