# 线上办公门户（CloudBase 版）

统一应用门户 + 多业务子应用，全部部署在腾讯云开发 CloudBase 上：
门户邮箱登录 + 应用级权限（只读/读写），子应用数据统一存放在 CloudBase
PostgreSQL 数据库与云存储中。

| 应用 | 目录 | 认证/数据方式 |
|------|------|---------------|
| 门户首页 | `index.html` | 邮箱登录，权限表 `user_app_permissions` |
| AA服装外贸系统 | `apps/saintysys/` | 邮箱登录 + `app_data_store` |
| 计件工资管理 | `apps/wage/` | 邮箱登录（auth-guard 强制）+ `app_data_store`（裸 `wage_*` 键） |
| 炉架订单管理 | `apps/wicketorders/` | 共享账号静默登录，`wicketorders__*` 键 |
| 采购管理 | `apps/purchase/` | 共享账号静默登录，`purchase__*` 键 |
| 订单统计 | `apps/orderschedule/` | 共享账号静默登录，`orderschedule__*` 键 |
| 收支表 | `apps/incomeexpense/` | 共享账号静默登录，`incomeexpense__*` 键 |
| 不锈钢贸易管理 | `apps/stainlessbusiness/` | 共享账号静默登录，`stainlessbusiness__*` 键 |

## 目录结构

```
├── index.html                     门户首页（登录/Dashboard/管理员面板）
├── apps.json                      应用清单（增减应用改这里）
├── cloudbase-pg-setup.sql         数据库/存储初始化脚本（PG）
├── .github/workflows/deploy.yml   GitHub Actions：整站部署到 CloudBase 静态托管
├── cloudfunctions/tcb-file-list/  云存储列目录云函数（可选增强）
├── scripts/migrate-supabase-to-cloudbase.mjs   旧 Supabase 数据一次性迁移
└── apps/
    ├── cloudbase/cloudbase.js     所有应用共用的 CloudBase 接入层
    │                                （Supabase 兼容 API，挂到 window.supabase）
    ├── cloudbase-sync.js          无登录表单应用的 localStorage 云端同步层
    ├── saintysys/                 AA服装外贸系统（自带 cloudbase.js 副本）
    ├── wage/                      计件工资（js/cloudbase.js 再导出共享层）
    └── ...
```

## 首次部署步骤

### 1. 创建/确认 CloudBase 环境

- 环境 ID：`onlineofficework-d4e93l98bdf879e`（上海 `ap-shanghai`）
- 已在 [apps/cloudbase/cloudbase.js](apps/cloudbase/cloudbase.js) 中配置；换环境时改 `CLOUDBASE_ENV`。

### 2. 开启登录方式

云开发控制台 → **身份认证 → 登录方式**：

- 开启 **邮箱登录**（门户、wage、saintysys 使用）
- 开启 **匿名登录**（未登录兜底只读；共享账号登录失败时降级只读）

### 3. 初始化数据库与云存储

控制台 → **数据库（SQL 型）→ SQL 执行**，整段执行 [cloudbase-pg-setup.sql](cloudbase-pg-setup.sql)：

- 建表：`app_data_store`、`user_roles`、`module_permissions`、
  `app_submissions`、`submission_files`、`user_app_permissions`（均为 `id text + data jsonb`）
- GRANT：`authenticated` 可读写、`anon` 只读（门户权限表不对匿名开放）
- RLS 策略 + 云存储桶 `app-photos` 及存储 RLS

### 4. 创建账号

控制台 → **身份认证 → 用户管理**：

- 管理员：`alonzhang76@outlook.com`（与 `apps.json` 的 `admin_email` 一致）
- 各业务真实用户邮箱
- **数据同步共享账号**：`sync@lori.app`，密码 `LoriSync2026!`
  （供无登录表单的 5 个应用静默登录写入；如修改密码，同步改
  [apps/cloudbase-sync.js](apps/cloudbase-sync.js) 顶部 `SYNC_ACCOUNT`，
  或在页面内用 `window.CLOUDBASE_SYNC_ACCOUNT` 覆盖）

### 5. 部署静态托管

**方式 A：GitHub Actions（推荐）**

仓库 Settings → Secrets 添加：

| Secret | 说明 |
|--------|------|
| `TCB_ENV_ID` | 云开发环境 ID |
| `TCB_SECRET_ID` | 腾讯云 API SecretId |
| `TCB_SECRET_KEY` | 腾讯云 API SecretKey |

推送到 `main` 即自动整站部署到静态托管根目录，并尝试部署 `tcb-file-list` 云函数。

**方式 B：手动**

```bash
npm i -g @cloudbase/cli
tcb login
tcb hosting deploy . / -e onlineofficework-d4e93l98bdf879e --force
cd cloudfunctions/tcb-file-list && npm i --production
tcb fn deploy tcb-file-list -e onlineofficework-d4e93l98bdf879e --force
```

### 6. 迁移旧 Supabase 数据（仅首次）

```bash
npm install @cloudbase/manager-node node-fetch@2
export TCB_ENV_ID=onlineofficework-d4e93l98bdf879e
export TCB_SECRET_ID=xxx TCB_SECRET_KEY=xxx
# 迁移存储文件需要 Supabase service_role key；仅迁数据库可只用内置 anon key
export SUPABASE_SERVICE_KEY=xxx   # 可选
node scripts/migrate-supabase-to-cloudbase.mjs
```

- `app_data_store` 的 store_key 原样保留（前缀/`wage_*`/saintysys 裸键）；
  旧 `clothing` 应用数据自动跳过（已由 saintysys 取代）。
- 门户权限聚合为 `perm::<邮箱>` 文档；旧表只有 UUID 无邮箱的行无法自动映射，
  会列在 `scripts/migration-report.json`，由管理员在门户面板按邮箱重设。

## 权限使用说明

- 登录门户 → 管理员点「⚙ 权限管理」→ 输入用户邮箱 → 逐应用设置
  不显示/只读/读写 → 保存。
- 用户登录后仅看到已授权应用；只读应用卡片带「只读」标签并附 `?perm=read`。
- 新增应用只需改 `apps.json`，无需动数据库。

## 安全说明

- 浏览器端只暴露环境 ID（Publishable Key 可空）；SecretId/SecretKey 仅用于
  CI 和迁移脚本，**不要**放进前端。
- 数据库写入依赖 JWT 中 `authenticated` 角色；匿名 `anon` 仅 SELECT。
- 同步共享账号密码硬编码于前端仅用于全员共享的业务数据写入，
  与旧版 `supabase-sync.js` 的安全模型一致。

## 常见问题

**Q: 控制台写接口 401 permission denied？**
A: 重新整段执行 `cloudbase-pg-setup.sql` 第 4 节（GRANT/RLS 兜底），
并确认当前登录不是匿名（浏览器控制台执行 `__cbDiag()` 查看 JWT role）。

**Q: 同步应用左下角一直显示「云端未连接」？**
A: 检查控制台是否已开启邮箱/匿名登录、是否已创建 `sync@lori.app` 账号，
点击徽标可刷新重试。

**Q: 如何修改管理员邮箱？**
A: 改 `apps.json` 的 `admin_email`，并在 CloudBase 用户管理中创建该邮箱。
