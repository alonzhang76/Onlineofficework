/* ============================================================
 * auto-scale.js — 窄窗口整页等比自动缩放（所有应用管理页面共用）
 * ------------------------------------------------------------
 * 现象：浏览器窗口变窄（分屏/小屏/拖动 DevTools）时，桌面布局不收缩，
 *       出现横向滚动、标签栏被截断、表格挤压。
 * 做法：视口物理宽度 < 设计基准 1280px 且 > 手机断点 820px 时，
 *       对 <html> 应用 CSS zoom = 物理宽度 / 1280，
 *       整页（含固定顶栏/侧栏/弹窗）等比缩小适应窗口，等同浏览器整页缩放；
 *       ≤820px 恢复 zoom:1，交给各页面已有的手机/平板 @media 响应式布局；
 *       ≥1280px 不缩放。
 * 打印：@media print 强制 zoom:1，不影响任何 A4/标签打印排版。
 * 版本：v=20260917a
 * ============================================================ */
(function () {
  var DESIGN_WIDTH = 1280; // 桌面设计基准宽度
  var MOBILE_BP = 820;     // 低于此宽度不再整页缩放，使用响应式布局
  var docEl = document.documentElement;
  var rafId = null;

  // 打印保护：屏幕上的整页缩放在打印时复位
  try {
    var printGuard = document.createElement('style');
    printGuard.textContent = '@media print{html{zoom:1!important;}}';
    docEl.appendChild(printGuard);
  } catch (e) {}

  // 读取当前已应用的 zoom（未设置时为 1）
  function currentZoom() {
    var z = parseFloat(docEl.style.zoom);
    return isFinite(z) && z > 0 ? z : 1;
  }

  function applyScale() {
    rafId = null;
    // window.innerWidth 是 CSS 像素视口，已被本脚本设置的 zoom 放大，
    // 必须除以当前 zoom 还原真实物理宽度，避免反复缩放的反馈循环
    var physical = window.innerWidth * currentZoom();
    var z = 1;
    if (physical > MOBILE_BP && physical < DESIGN_WIDTH) {
      z = physical / DESIGN_WIDTH;
    }
    var next = z >= 0.9999 ? '' : z.toFixed(4);
    if (docEl.style.zoom !== next) docEl.style.zoom = next;
  }

  function schedule() {
    if (rafId !== null) return;
    rafId = (window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })(applyScale);
  }

  // <head> 内立即执行一次，防止页面先按未缩放渲染再跳变
  applyScale();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('DOMContentLoaded', applyScale);
  window.addEventListener('load', applyScale);
})();
