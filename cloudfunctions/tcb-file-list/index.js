/* ===== 云函数 tcb-file-list =====
 *
 * 功能：列出 CloudBase 云存储中【指定目录一层】下的文件和子目录。
 * 为什么需要：CloudBase 前端 JS SDK / @cloudbase/node-sdk 均无直接的
 *            "列目录" API，因此前端通过 callFunction 调用本函数获取文件列表，
 *            兼容层 apps/cloudbase/cloudbase.js 的 storage.from().list()
 *            在 SDK 列举失败时回退调用本函数。
 *
 * 实现：使用管理端 SDK @cloudbase/manager-node（node-sdk 只有上传/删除/下载，
 *      没有列举能力），底层走 COS getBucket + Delimiter='/'，只返回一层：
 *        - 子目录来自 CommonPrefixes
 *        - 文件来自 Contents（排除以 / 结尾的目录占位对象）
 *
 * 入参（event）：
 *   - bucket  {string}  桶名（当前固定使用环境默认桶，参数保留兼容）
 *   - prefix  {string}  目录前缀，如 "sample/" 或 ""（桶根）
 *   - limit   {number}  单次返回最大条数，默认 1000，最大 1000
 *
 * 返回：
 *   { data: [ { name, type: 'file'|'folder', path, size?, lastModified? } ... ],
 *     isTruncated, nextMarker }
 *   失败返回 { error: string, data: [] }
 */

const util = require("util");
const Manager = require("@cloudbase/manager-node");

// SCF 运行时自动注入临时密钥与环境信息，显式传入更稳妥
const manager = new Manager({
  envId:
    process.env.TCB_ENV ||
    process.env.TCB_ENVID ||
    process.env.SCF_NAMESPACE ||
    "",
  region: process.env.TENCENTCLOUD_REGION || process.env.SCF_REGION || "",
  secretId: process.env.TENCENTCLOUD_SECRETID,
  secretKey: process.env.TENCENTCLOUD_SECRETKEY,
  token: process.env.TENCENTCLOUD_SESSIONTOKEN,
});

exports.main = async function (event /*, context */) {
  try {
    const prefixRaw = (event && event.prefix) || "";
    const limit = Math.min(Math.max((event && event.limit) || 1000, 1), 1000);

    const storage = manager.storage;
    // 必须先拉取环境配置（Storages 信息），否则 getStorageConfig() 为空
    await manager.currentEnvironment().lazyInit();
    // 使用环境默认桶（CloudBase 个人版仅有一个环境桶）
    const { bucket, region } = storage.getStorageConfig();
    // 环境 ID：拼接 cloud://<env>.<bucket>/<path> 形态的 fileID 用
    let envId = "";
    try { envId = manager.currentEnvironment().getEnvId() || ""; } catch (e) {}
    if (!envId) {
      envId = process.env.TCB_ENV || process.env.TCB_ENVID ||
        process.env.SCF_NAMESPACE || "";
    }
    const cos = storage.getCos();
    const getBucket = util.promisify(cos.getBucket).bind(cos);

    // 规范化前缀：去掉开头的 /，非根目录保证以 / 结尾
    let prefix = String(prefixRaw).replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";

    const res = await getBucket({
      Bucket: bucket,
      Region: region,
      Prefix: prefix,
      Delimiter: "/",
      MaxKeys: limit,
    });

    const data = [];

    // 子目录：CommonPrefixes[].Prefix（形如 "photos/2026/"）
    const folders = res.CommonPrefixes || [];
    for (let i = 0; i < folders.length; i++) {
      const p = folders[i].Prefix || "";
      let name = p;
      if (prefix && name.startsWith(prefix)) name = name.slice(prefix.length);
      name = name.replace(/\/+$/, "");
      if (name) {
        data.push({ name: name, type: "folder", path: p });
      }
    }

    // 文件：Contents[]（排除目录占位对象，其 Key 以 / 结尾）
    const files = res.Contents || [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i] || {};
      const key = f.Key || "";
      if (!key || key.endsWith("/") || key === prefix) continue;
      let name = key;
      if (prefix && name.startsWith(prefix)) name = name.slice(prefix.length);
      if (!name || name.includes("/")) continue; // 只取当前层
      data.push({
        name: name,
        type: "file",
        path: key,
        size: Number(f.Size) || 0,
        lastModified: f.LastModified || "",
        etag: String(f.ETag || "").replace(/"/g, ""),
        // cloudObjectId（fileID）：小程序端用它换取下载链接
        //（get-objects-download-info 需要 cloud://<env>.<bucket>/<path> 形态）
        cloudObjectId: bucket
          ? "cloud://" + (envId || bucket) + "." + bucket + "/" + key
          : "",
      });
    }

    return {
      data: data,
      isTruncated: !!res.IsTruncated,
      nextMarker: res.NextMarker || "",
      // 桶名：调用方可自行拼接 cloud://<bucket>/<key>
      bucket: bucket || "",
    };
  } catch (err) {
    console.error("[tcb-file-list] 异常:", err);
    return {
      error: (err && err.message) || String(err || "unknown error"),
      data: [],
    };
  }
};
