# 云端数据管理按钮（清空 + 同步）

## Context

用户报告三个持续同步问题：
1. 跨设备同步失败：A 电脑修改后，B 电脑只显示自己的数据
2. 删除回滚：删除一条记录后刷新页面，被删记录又恢复
3. 小程序数据陈旧：反复同步仍是旧数据

根本原因复杂（可能涉及 LWW 时间戳、upsert onConflict 未生效、轮询未覆盖 UI 等），多轮修复未彻底解决。用户现要求添加两个务实按钮作为手动干预手段：

- **带密码的"彻底清空云端数据"按钮**：清空 `app_data_store` 表（结构化业务数据），**不清空**云存储文件（图片/PDF 等桶内文件）
- **"同步"按钮**：强制从云端拉取最新数据

按钮加在四个 Web 应用（orderschedule / wicketorders / wage / saintysys）的登录后主页面。

---

## 方案

### 1. 新建共享管理脚本 `_deploy/apps/cloudbase-admin.js`

暴露 `window.CloudAdmin`，两个方法：

#### `CloudAdmin.syncNow()`
- 调用 `sb.from('app_data_store').select(...)` 强制拉取全量云端数据
- 若 `window.CloudbaseSync` 存在（orderschedule/wicketorders）：调 `refresh()` + `flush()`，并 dispatch `cloud-data-updated` 事件
- 若 `window.CloudbaseStore` 存在（wage/saintysys）：重新 `init()`，并 dispatch 事件
- toast 提示"同步完成"

#### `CloudAdmin.clearCloudData()`
- 弹出密码输入弹窗（动态创建 modal，`<input type="password">`，非 `prompt()`）
- 密码校验：`window.CLOUD_ADMIN_PASSWORD || '2601'`（与 orderschedule 现有管理密码一致）
- 校验通过后：
  1. `sb.from('app_data_store').delete().neq('store_key', '___never_match___')` 删除全表所有行（不清空云存储文件桶）
  2. 清理 localStorage 中业务数据键 + `__cb_meta__` / `__wage_meta__`（LWW 时间戳），**保留** auth 会话键（`sb-*` / `tcb_*` / `isLoggedIn` / `username` 等，避免强制重新登录）
  3. toast 提示后 `location.reload()` 重载页面（重载后各应用从空云端重新初始化）

#### Toast 兼容
优先用各应用已有 toast：`window.showToast` → `window.App.toast` → `window.UI.toast` → `console.log`

---

### 2. 各应用 HTML 加载脚本 + 加按钮

每个应用在现有 sync 脚本之后加一行：
```html
<script src="../cloudbase-admin.js?v=20260914c"></script>
```

按钮放置位置：

| 应用 | 放置位置 | 现有模式参考 |
|------|----------|-------------|
| orderschedule | "⚙️ 数据管理" dropdown（[index.html:1404-1413](file:///Users/aurora/Documents/GitHub/Onlineofficework/_deploy/apps/orderschedule/index.html#L1404-L1413)）末尾加两个 `<a>` | 现有 `protectedClearAllData()` 用 `prompt()` + 密码 '2601' |
| wicketorders | "💾 数据管理" dropdown（[index.html:1199-1218](file:///Users/aurora/Documents/GitHub/Onlineofficework/_deploy/apps/wicketorders/index.html#L1199-L1218)）"退出登录"前加两个 `<button>` | 现有 `backupData()` / `restoreData()` |
| wage | topbar `.topbar-info`（[index.html:547](file:///Users/aurora/Documents/GitHub/Onlineofficework/_deploy/apps/wage/index.html#L547)）加两个按钮 | 现有 `.btn` 样式 |
| saintysys | `.header-actions`（[index.html:16-23](file:///Users/aurora/Documents/GitHub/Onlineofficework/_deploy/apps/saintysys/index.html#L16-L23)）加两个按钮 | 现有 `App.backupData()` 按钮 |

按钮文案：
- 同步：`🔄 立即同步云端`
- 清空：`🗑️ 清空云端数据`（红色样式）

---

### 3. 版本号

- 新脚本用 `?v=20260914c`
- 不动现有 `cloudbase-sync.js` / `cloudbase-store.js`（本次不改 sync 逻辑，只加管理工具）

---

## 影响范围

- **清空操作清空全表**：`app_data_store` 是 orderschedule / wicketorders / wage / saintysys 共享表，清空会清掉所有四个应用的结构化数据。小程序也读此表，清空后小程序同步会得到空数据。**云存储文件桶不受影响**（cfb.js / cloudbase 文件存储完全独立）。
- 清空后需在各应用重新录入数据，录入后正常推送云端，其他设备点"同步"或等 15s 轮询即可拉取。
- 保留 auth 会话，用户不会被强制重新登录（orderschedule/wicketorders 用密码登录；wage 用 `CLOUDBASE_SYNC` 共享账号静默登录；saintysys 用 auth-guard 邮箱会话）。

---

## 验证

1. **同步按钮**：在 A 电脑修改数据 → B 电脑点"同步" → B 应显示 A 的最新数据；控制台 `[CloudbaseSync] 拉取云端 N 行` 日志正常
2. **清空按钮**：点"清空云端数据" → 输入密码 `2601` → 确认 → toast "云端数据已清空" → 页面刷新 → 所有标签页数据为空 → 在 CloudBase 控制台查 `app_data_store` 表应为 0 行
3. **云存储不受影响**：清空后"☁️ 云存储"标签页的文件列表仍正常显示（文件桶独立）
4. **跨应用**：在 orderschedule 清空后，wage / wicketorders / saintysys 的数据也被清空（共享表）
5. **小程序**：清空云端后小程序冷启动 → 同步得到空数据（证明小程序同步链路本身是通的，之前陈旧是因为云端数据本身没更新）
