# 电镀收发货单：云端间歇保存丢失 + PDF 文件名前缀

## 背景与现象
用户在 wage 应用的微信小程序里录入「电镀收货单 / 发货单」后，**有时**云端没有保存；同时希望生成的收货单 / 发货单 PDF 在**现有命名规则不变**的前提下，文件名最前面分别加上「收」「发」字样以区分。

工作目录：`/Users/alonzhang/Documents/GitHub/Onlineofficework`

## 已查证的根因

表结构（已用 REST 探针确认）：`app_data_store` 为 `{ id text PK, data jsonb }`，`data` 内含 `{ store_key, payload, updated_at }`。小程序用 REST 直接读写 `data`；桌面端经 `apps/cloudbase/cloudbase.js` 兼容层把虚拟列 `store_key/payload/updated_at` 映射进 `data`，**两端共用同一数据源**。云端当前 `deliveriesData` 为 1 行、64 条、`updated_at` 正常，说明不是持久损坏，而是**间歇丢失**。

### 根因 A：小程序 `takeCloud` 的 30 秒宽限把本机未确认写入丢弃（真实数据丢失）
文件：`mini program/plm-work/utils/cloudbase.js`，函数 `takeCloud()`（约 746–777 行）。

当某键存在「尚未确认成功的本地推送」（`pending[ck]`）时，原逻辑：
```js
if (!isNaN(cloudMs) && cloudMs + CLOCK_GRACE_MS >= pendingTs) {
  delete pending[ck];   // 丢弃本机刚保存、还没推上去的记录
  return true;          // 接受云端（不含这条新记录）覆盖本地
}
```
`CLOCK_GRACE_MS = 30000`。判定方向反了：**只要云端在过去 30 秒内被写过**（含本端上一条记录的成功推送），就会把当前这条尚未推送成功的记录从 pending 删除，并把本地 `data.deliveries` 覆盖成不含新记录的云端快照 → 新记录从本地和云端同时消失。

复现路径（极常见）：
1. 用户连续录入两条，第二条保存时 `pending.ts = T`，第一条的推送已把云端 `updated_at` 写成 `T-Δ`（Δ<30s）。
2. 第二条保存后 `_persistDelivery` 延迟 400ms `navigateBack` → 回到 hub → hub `onShow` → `app.cloudTick()` → `platingDb.syncFromCloud()` 拉取。
3. 若第二条推送尚未完成，拉取命中 `cloudMs + 30000 >= pendingTs` → 丢弃 pending + 覆盖本地 → 第二条记录永久丢失。
前台 15s 轮询、每页 `onShow` 节流拉取都会触发，因此「有时」出现。

### 根因 B：整数组 LWW，桌面端盲写旧快照覆盖手机端（多端互相覆盖）
`deliveriesData` 同步粒度是「整个数组 LWW」，无逐条合并。
- 桌面端 `apps/wage/plating.html` 的 `uploadKeyToCloud()`（约 90–103 行）保存时直接把内存里 `tableConfigs.deliveries.originalData` 整组 upsert 到云端。
- 桌面端 `cloud-data-updated` 事件只重算订单汇总（9730–9740 行），**不刷新内存数组**；`tableConfigs.deliveries.originalData` 在页面加载后就不再随云端更新。
- 因此桌面端一旦保存（或 500ms 防抖的 `scheduleKeyUpload` 触发），就会用不含手机端新增记录的旧数组覆盖云端。
- 反向：手机端 `takeCloud` 接受较新的桌面端数组时，也会丢掉手机端刚录入的记录（根因 A 的接受路径）。

## 目标 / 非目标
**目标**
1. 小程序录入的收 / 发货单绝不因拉取而丢失，最终一定落到云端。
2. 手机端与桌面端并发新增记录时互不覆盖（按记录并集收敛）。
3. 收货单 PDF 文件名以「收」开头，发货单以「发」开头，其余命名规则不变。

**非目标**
- 不改表结构、不重构通用同步层；根因 A 的修复对所有命名空间（wage / trade / 报销等）同样生效，但**并集合并只加在 deliveries**（结算单价、发票等维持原 LWW 行为，避免扩大风险）。
- 不动桌面端 `window.print()` 打印（浏览器按页面 `<title>` 命名，无自定义文件名规则，不在本次需求内）。
- 不引入逐条记录 id / 服务端合并（控制改动范围）。

## 改动清单

### 1. `mini program/plm-work/utils/cloudbase.js` — `takeCloud()` pending 分支
当 `pending[ck]` 存在时，**一律 `return false`**：保留本地、不删除 pending、不接受云端覆盖。
- 删除原 `cloudMs + CLOCK_GRACE_MS >= pendingTs` 的丢弃逻辑。
- 跨端并发由实际推送时间戳 LWW 裁决；deliveries 数据层额外做并集合并，保证本机录入绝不被拉取丢弃。
- non-pending 分支（`localMeta` 比较）保持不变，避免影响其他模块。

### 2. `mini program/plm-work/utils/plating-db.js` — deliveries 并集合并
- 新增 `unionDeliveries(localArr, cloudArr)`：按 `cells` 内容签名（`JSON.stringify(cells)`，兜底整对象）去重，顺序为「本地在前 → 仅云端存在的追加在后」，保证本地（含待推送新记录）永不丢失。
- `syncFromCloud()` 的 deliveries 分支改为：`merged = unionDeliveries(data.deliveries, r.value)`；若 `merged` 与当前 `data.deliveries` 内容不同，则 `data.deliveries = merged` + `safeSet` + `push`（`push` 在 `suppressPush` 期间只入队，拉取结束后统一补发）。
- 仍调用 `supa.takeCloud(...)` 让其更新 `localMeta` / 保护待推送时序，但不再用其返回值决定是否覆盖（覆盖由并集取代）。
- settlement / invoices / payments 分支维持原逻辑不变。

### 3. `apps/wage/plating.html` — `uploadKeyToCloud()` 上传前并集合并
数组型台账（`Array.isArray(value)`）上传前：
1. 先 `select('store_key,payload,updated_at').eq('id', key)` 取云端当前行（兼容层会映射为 `data` jsonb，可用）。
2. 若云端 `payload` 是数组，与本地上传值做并集去重（`JSON.stringify(item)` 签名），用并集作为最终 `payload`。
3. 再 upsert。
- 非数组（对象型，如 `orderSettlementData`）维持原覆盖行为。
- 读取失败（超时/异常）时退化为按原值上传，不阻断保存。

### 4. `mini program/plm-work/pages/plating/delivery-note/delivery-note.js` — PDF 文件名前缀
`buildPDF()`（约 140–151 行）：在现有文件名数组最前面插入前缀：
```js
const prefix = doc.docType === '发货' ? '发' : '收';
const fileName = [prefix, customer, doc.baseOrderNo || '无订单号', productNames.join('-') || '无产品', date, rand]
  .join('_')...
```
其余规则（客户_订单号_产品_日期_随机2位数、非法字符与空白清理）完全不变。

## 验证步骤
1. **小程序连续录入**：真机/开发者工具连续录入两条收货单（间隔 <30s）→ 保存第二条后立即返回 hub → 等待 ≥15s 轮询 → curl 查云端 `deliveriesData`，两条都应存在。
2. **断网补发**：断网录入一条 → 恢复网络 / 切后台再回前台 → 查云端应出现该记录，pending 队列清空。
3. **多端并发**：手机端新增一条，桌面端（plating.html）紧接着保存一条无关记录 → 查云端两条都应存在（互不覆盖）。
4. **PDF 命名**：分别生成收货单、发货单 PDF，文件名分别以「收_」「发_」开头，其后格式与原来一致。
5. **语法/目视**：修改的 JS 文件目视复查；桌面端 HTML 内联 JS 无法 `node --check`，目视确认括号/逗号闭合。
6. **云端复核**：curl 查 `deliveriesData` 行数、`updated_at`、最后几条记录，确认无回退、无重复行堆积。

## 风险与权衡
- 并集合并对「编辑 / 删除」记录：编辑会被当成新记录（旧版 + 新版并存），删除在对端未推送前可能被并集复活。收发货以新增为主，可接受；不影响现有列表去重展示。
- `takeCloud` pending 分支改为永不接受云端后，若某条推送永久失败（如 payload 过大被服务端拒绝），本端该键将不再接受云端更新；同步指示灯会持续 `error` 并 toast「上传失败，重试中」，用户可感知，不会静默丢数据。
- 改动集中在 4 处，均为增量逻辑，不改变数据结构与对外接口。
