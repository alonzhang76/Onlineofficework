/* ===== wage 应用 CloudBase 接入入口 =====
 * 统一复用门户共享兼容层 apps/cloudbase/cloudbase.js，
 * 本文件仅做再导出，保持各应用目录结构一致（js/cloudbase.js）。
 * 环境 ID、CDN 加载、匿名登录策略均在共享层维护。
 */
export * from "../../cloudbase/cloudbase.js";
