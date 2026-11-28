# Tasks — plating-cloud-save-fix

- [ ] T1. 修 `mini program/plm-work/utils/cloudbase.js` `takeCloud()` pending 分支：有待确认本地推送时一律保留本地（return false），删除 `cloudMs+30s>=pendingTs` 的丢弃逻辑。
- [ ] T2. `mini program/plm-work/utils/plating-db.js`：新增 `unionDeliveries(local, cloud)`；`syncFromCloud()` deliveries 分支改并集合并，内容变化时 safeSet + push 并集。
- [ ] T3. `apps/wage/plating.html` `uploadKeyToCloud()`：数组型上传前先取云端当前行做并集去重再 upsert，读取失败退化为原值上传。
- [ ] T4. `mini program/plm-work/pages/plating/delivery-note/delivery-note.js` `buildPDF()`：文件名最前面加 `收`/`发` 前缀。
- [ ] T5. 验证：连续录入不丢、断网补发、多端并发不互覆盖、PDF 前缀正确；curl 复核云端行数与时间戳无回退。
