/* ===== 全应用数据迁移：Supabase → 腾讯云开发 CloudBase（PostgreSQL 模式）=====
 *
 * 覆盖表：
 *   - app_data_store       全部应用共享数据（store_key 原样保留）
 *       * saintysys 裸键（styles/orders/...，由 saintysys 迁移脚本先行迁入）
 *       * wage 裸 wage_* 键
 *       * 其余应用 <appId>__<key> 前缀键
 *   - app_submissions / submission_files（saintysys 表单）
 *   - user_app_permissions 门户权限（旧表 user_id+app_id+permission
 *       → 新表 id='perm::<email>', data.perms 文档；见下方限制说明）
 *   - Storage：app-photos 桶文件（可选，MIGRATE_STORAGE=false 关闭）
 *
 * CloudBase 写入方式：@cloudbase/manager-node 的 database.executePGSql，
 * 每行写成 PG 形态 { id text, data jsonb }，与前端兼容层读取格式一致。
 *
 * 用法：
 *   1) npm install @cloudbase/manager-node node-fetch@2
 *   2) 设置环境变量：
 *        SUPABASE_URL          默认指向旧项目，可覆盖
 *        SUPABASE_ANON_KEY     旧项目 anon key（默认内置只读 key）
 *        SUPABASE_SERVICE_KEY  可选；提供时优先使用（权限表/存储需要）
 *        TCB_ENV_ID            CloudBase 环境 ID
 *        TCB_SECRET_ID / TCB_SECRET_KEY
 *        MIGRATE_STORAGE       默认 true
 *   3) node scripts/migrate-supabase-to-cloudbase.mjs
 *
 * ⚠️ 门户权限限制：旧 user_app_permissions 只有 user_id（auth.users 的 UUID），
 *    anon key 拿不到 UUID→邮箱映射。脚本会把映射结果写入
 *    scripts/migration-report.json；无邮箱的记录需管理员在门户面板按邮箱重设。
 */

import fetch from "node-fetch";
import CloudBase from "@cloudbase/manager-node";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_FILE = path.join(__dirname, "migration-report.json");

const DEFAULT_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnb3lhY3VhZ3NscWhxZ3V4eXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI5NTUsImV4cCI6MjEwMjUwODk1NX0._GdWOGWblSpOYm3y8f_d3aVQszfn2YbRjHN0FqZiLtI";

const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL || "https://ugoyacuagslqhqguxyqe.supabase.co",
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_ANON,
  TCB_ENV_ID: process.env.TCB_ENV_ID || "onlineofficework-d4e93l98bdf879e",
  TCB_SECRET_ID: process.env.TCB_SECRET_ID || "",
  TCB_SECRET_KEY: process.env.TCB_SECRET_KEY || "",
  MIGRATE_STORAGE: process.env.MIGRATE_STORAGE !== "false",
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || "app-photos",
  BATCH: 50,
};

if (!CONFIG.TCB_SECRET_ID || !CONFIG.TCB_SECRET_KEY) {
  console.error("❌ 请设置 TCB_SECRET_ID / TCB_SECRET_KEY 环境变量");
  process.exit(1);
}

const tcb = new CloudBase({
  secretId: CONFIG.TCB_SECRET_ID,
  secretKey: CONFIG.TCB_SECRET_KEY,
  envId: CONFIG.TCB_ENV_ID,
});
const db = tcb.database();

const report = { migratedAt: new Date().toISOString(), tables: {}, skippedClothingKeys: [], permissionRowsWithoutEmail: [] };

/* ============ Supabase 读取 ============ */
async function sbQuery(table, select = "*") {
  // 分页拉取（上限 1000/页）
  const all = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${page}&offset=${from}`;
    const resp = await fetch(url, {
      headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_KEY}` },
    });
    if (!resp.ok) {
      throw new Error(`Supabase ${table} 查询失败: HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    }
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error(`${table} 返回非数组`);
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

/* ============ PG 写入（executePGSql + dollar quoting） ============ */
function quoteLiteral(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function quoteJsonb(obj) {
  const text = JSON.stringify(obj ?? null);
  let tag;
  do { tag = "$cb" + crypto.randomBytes(6).toString("hex") + "$"; } while (text.includes(tag));
  return tag + text + tag + "::jsonb";
}

async function executeSql(sql) {
  // manager-node 参数为 { Sql }（不同版本大小写/字段兼容处理）
  if (typeof db.executePGSql === "function") {
    try { return await db.executePGSql({ Sql: sql }); }
    catch (e) { return await db.executePGSql(sql); }
  }
  throw new Error("当前 @cloudbase/manager-node 不支持 executePGSql，请升级到 v5.4+");
}

async function pgUpsertRows(table, rows, { idField, dataMapper, skip } = {}) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += CONFIG.BATCH) {
    const chunk = rows.slice(i, i + CONFIG.BATCH);
    const values = chunk.map((row) => {
      const id = String(row[idField]);
      const data = dataMapper ? dataMapper(row) : row;
      return `(${quoteLiteral(id)}, ${quoteJsonb(data)})`;
    });
    const sql =
      `INSERT INTO public.${table} (id, data) VALUES\n` +
      values.join(",\n") +
      `\nON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;`;
    await executeSql(sql);
    ok += chunk.length;
    console.log(`  ${table}: ${ok}/${rows.length}`);
  }
  return ok;
}

/* ============ 迁移 app_data_store ============ */
async function migrateDataStore() {
  console.log("\n📦 app_data_store");
  const rows = await sbQuery("app_data_store", "*");
  console.log(`  旧库共 ${rows.length} 行`);

  const kept = [];
  for (const row of rows) {
    const key = String(row.store_key || "");
    // clothing 应用已废弃（由 saintysys 取代），其旧数据不再迁移
    if (key === "clothing" || key.startsWith("clothing__") || key.startsWith("clothing-")) {
      report.skippedClothingKeys.push(key);
      continue;
    }
    kept.push(row);
  }

  // data 内保留 store_key 字段（兼容层按 store_key 做客户端过滤/upsert）
  const count = await pgUpsertRows("app_data_store", kept, {
    idField: "store_key",
    dataMapper: (row) => ({ ...row }),
  });
  report.tables.app_data_store = { source: rows.length, migrated: count, skippedClothing: report.skippedClothingKeys.length };
  console.log(`  ✅ 写入 ${count} 行（跳过 clothing ${report.skippedClothingKeys.length} 行）`);
}

/* ============ 迁移 saintysys 表单表 ============ */
async function migrateGenericTable(table) {
  console.log(`\n📦 ${table}`);
  let rows = [];
  try {
    rows = await sbQuery(table, "*");
  } catch (e) {
    console.warn(`  ⚠️ 跳过（${e.message}）`);
    report.tables[table] = { skipped: e.message };
    return;
  }
  console.log(`  旧库共 ${rows.length} 行`);
  const valid = rows.filter((r) => r.id !== undefined && r.id !== null);
  const count = await pgUpsertRows(table, valid, {
    idField: "id",
    dataMapper: (row) => ({ ...row, id: String(row.id) }),
  });
  report.tables[table] = { source: rows.length, migrated: count };
  console.log(`  ✅ 写入 ${count} 行`);
}

/* ============ 迁移门户权限 ============ */
async function migratePortalPermissions() {
  console.log("\n📦 user_app_permissions（门户权限）");
  let rows = [];
  try {
    rows = await sbQuery("user_app_permissions", "*");
  } catch (e) {
    console.warn(`  ⚠️ 无法读取旧权限表（${e.message}），请在门户管理员面板按邮箱重设权限`);
    report.tables.user_app_permissions = { skipped: e.message };
    return;
  }
  console.log(`  旧库共 ${rows.length} 行`);

  // 旧行：{user_id(uuid), app_id, permission}；新版按邮箱聚合
  // clothing → saintysys 应用替换
  const byEmail = new Map();
  const noEmail = [];
  for (const r of rows) {
    const appId = r.app_id === "clothing" ? "saintysys" : r.app_id;
    const perm = r.permission === "read" || r.permission === "write" ? r.permission : null;
    if (!perm) continue;
    const email = (r.user_email || r.email || "").toString().trim().toLowerCase();
    if (!email) {
      noEmail.push({ user_id: r.user_id, app_id: appId, permission: perm });
      continue;
    }
    if (!byEmail.has(email)) byEmail.set(email, {});
    byEmail.get(email)[appId] = perm;
  }
  report.permissionRowsWithoutEmail = noEmail;

  const docs = [...byEmail.entries()].map(([email, perms]) => ({
    id: "perm::" + email,
    data: {
      id: "perm::" + email,
      user_email: email,
      perms,
      updated_at: new Date().toISOString(),
      migrated_from: "supabase",
    },
  }));

  let ok = 0;
  for (const doc of docs) {
    await executeSql(
      `INSERT INTO public.user_app_permissions (id, data) VALUES (${quoteLiteral(doc.id)}, ${quoteJsonb(doc.data)})
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;`
    );
    ok++;
  }
  report.tables.user_app_permissions = { sourceRows: rows.length, docsWritten: ok, rowsWithoutEmail: noEmail.length };
  console.log(`  ✅ 写入 ${ok} 个用户权限文档；${noEmail.length} 行因无邮箱映射需手动重设（见 migration-report.json）`);
}

/* ============ 迁移云存储 ============ */
async function migrateStorage() {
  if (!CONFIG.MIGRATE_STORAGE) {
    console.log("\n⏭️  跳过存储迁移");
    return;
  }
  console.log(`\n📁 Storage 桶 ${CONFIG.SUPABASE_BUCKET}`);
  const listResp = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/list/${CONFIG.SUPABASE_BUCKET}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
    },
    body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
  });
  if (!listResp.ok) {
    console.warn(`  ⚠️ 列文件失败 HTTP ${listResp.status}（anon key 无存储权限，设置 SUPABASE_SERVICE_KEY 后重试）`);
    report.storage = { skipped: `HTTP ${listResp.status}` };
    return;
  }
  const files = await listResp.json();
  if (!Array.isArray(files)) {
    console.warn("  ⚠️ 文件列表非数组，跳过");
    return;
  }
  let ok = 0, fail = 0;
  for (const item of files) {
    if (!item || item.type === "folder") continue;
    const cloudPath = item.name;
    try {
      const dl = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${CONFIG.SUPABASE_BUCKET}/${cloudPath.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_KEY}` },
      });
      if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      if (tcb.storage && typeof tcb.storage.uploadFile === "function") {
        await tcb.storage.uploadFile({ cloudPath, fileContent: buf });
      } else {
        throw new Error("manager-node storage.uploadFile 不可用");
      }
      ok++;
      if (ok % 20 === 0) console.log(`  ... ${ok}/${files.length}`);
    } catch (e) {
      fail++;
      console.warn(`  ⚠️ ${cloudPath}: ${e.message}`);
    }
  }
  report.storage = { listed: files.length, uploaded: ok, failed: fail };
  console.log(`  ✅ 存储迁移完成：成功 ${ok}，失败 ${fail}`);
}

/* ============ 主流程 ============ */
async function main() {
  console.log("========================================");
  console.log("Supabase → CloudBase（PG）整站迁移");
  console.log(`源：${CONFIG.SUPABASE_URL}`);
  console.log(`目标环境：${CONFIG.TCB_ENV_ID}`);
  console.log("========================================");
  try {
    await migrateDataStore();
    await migrateGenericTable("app_submissions");
    await migrateGenericTable("submission_files");
    await migratePortalPermissions();
    await migrateStorage();
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log("\n🎉 迁移完成。报告：" + REPORT_FILE);
  } catch (e) {
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.error("\n❌ 迁移出错:", e);
    process.exit(1);
  }
}

main();
