# 小程序外贸出口 — 生产通知单/箱唛/出货报关 生成 PDF 并分享

## Context

当前小程序版三个页面（生产通知单、制作箱唛、出货与报关）只能"复制单据内容"到剪贴板。用户需要像网页版一样生成 A4 排版的 PDF 文件，通过微信发给好友。微信小程序无法使用 `window.print()`，用户已确认采用 **Canvas 绘图→PDF** 方案：用 Canvas 2D 逐页绘制单据（与网页版排版一致），嵌入 PDF 文件，通过 `wx.shareFileMessage` 发给微信好友。

## 技术方案

### 核心：Canvas→JPEG→PDF 管线

1. **离屏 Canvas 绘制**：使用 `wx.createOffscreenCanvas({type:'2d', width, height})` 按页绘制
2. **导出 JPEG**：`canvas.toDataURL('image/jpeg', 0.92)` 或 `wx.canvasToTempFilePath()`
3. **构造 PDF**：纯 JS 构造最小 PDF 文件（每页一张 JPEG 图像嵌入 XObject），写入临时文件
4. **分享**：`wx.shareFileMessage({filePath})` 发给微信好友

### A4 尺寸（96 DPI）
- 横向：1190×842px（生产通知单）
- 纵向：842×1190px（箱唛、发票、装箱单、报关明细）

## 新增文件

### 1. `utils/pdf-builder.js` — 纯 JS PDF 构造器
- `buildPDF(images: Array<Uint8Array>, {width, height, orientation}) → ArrayBuffer`
- 构造 PDF 1.4 二进制：Header → Catalog → Pages → Page objects → Image XObjects → xref → trailer
- 每个 image 为 JPEG 二进制，嵌入为 DCTDecode XObject

### 2. `utils/qrcode-matrix.js` — 二维码矩阵生成
- `generateQRMatrix(text, errorCorrectLevel) → boolean[][]`
- 纯算法实现（无 DOM 依赖），输出二维布尔矩阵供 canvas 绘制黑白方块
- 参考 qrcodejs 核心算法，适配小程序环境

### 3. `utils/canvas-renderer.js` — 通用 Canvas 绘图工具
- `createPage(orientation) → {canvas, ctx}` 创建离屏画布
- `drawTable(ctx, x, y, columns, rows, options)` 绘制表格
- `drawText(ctx, text, x, y, options)` 绘制文本（支持字体/大小/颜色/对齐）
- `drawQRCode(ctx, matrix, x, y, size)` 绘制二维码
- `drawImage...` 等

### 4. `utils/doc-renderers.js` — 单据渲染器（调用 canvas-renderer）
参照网页版 CSS 布局，每页返回一个 canvas：
- `renderProductionNotice(data) → canvas[]` — 横向 A4，公司信息+订单信息+产品表格+签字栏
- `renderBoxMark(form, pageNo, totalPages) → canvas` — 纵向 A4，公司/PO/ArtNo/机器号/数量+Package No.+二维码
- `renderInvoice(doc) → canvas[]` — 商业发票
- `renderPackingList(doc) → canvas[]` — 装箱单
- `renderCustoms(doc) → canvas[]` — 报关明细

### 5. `utils/pdf-share.js` — PDF 分享入口
- `generateAndShare(renderFn, data, fileName)` — 通用流程：渲染→导图→构造PDF→写文件→分享
- 复用 `csv.js` 的 `exportFile` 模式（`wx.getFileSystemManager().writeFileSync` + `wx.shareFileMessage`）
- 失败回退到 `wx.setClipboardData`

## 修改文件

### 6. `pages/trade/notice/notice.js` + `.wxml`
- 保留选择订单逻辑（已自动填充）
- 将"复制单据内容"按钮改为"生成PDF并发送"
- 调用 `renderProductionNotice(doc)` → `generateAndShare(...)`
- WXML 添加 canvas 占位元素（`<canvas type="2d" id="pdfCanvas" hidden>...</canvas>`）

### 7. `pages/trade/mark/mark.js` + `.wxml`
- 保留表单录入 + 从订单自动填充（已实现 `onLoad` 带入）
- 将"复制唛头内容"按钮改为"生成PDF并发送"
- 循环每箱调用 `renderBoxMark(form, i, total)` → `generateAndShare(...)`
- WXML 添加 hidden canvas

### 8. `pages/trade/shipment/shipment.js` + `.wxml`
- 保留表单录入 + 从订单自动填充（已实现 `onPickOrder`）
- 将"复制单据内容"按钮改为三个：发票PDF / 装箱单PDF / 报关明细PDF
- 分别调用 `renderInvoice/renderPackingList/renderCustoms` → `generateAndShare(...)`
- WXML 添加 hidden canvas

## 关键复用
- `utils/csv.js#exportFile()` — 文件写入+分享模式参考
- `utils/format.js` — fmtDate/fmtMoney 等格式化函数
- `utils/trade-db.js` — groupOrdersByNo() / saveCustoms() 等数据层
- 各页面已有表单与数据流不变，仅替换输出方式

## 验证
1. 生产通知单：选订单→点"生成PDF"→微信弹出分享→好友收到 .pdf 文件→打开为横向 A4 排版
2. 箱唛：填入信息→点"生成PDF"→多箱生成多页 PDF→每页含二维码
3. 出货与报关：选订单带入→填补充字段→分别生成发票/装箱单/报关 PDF
4. `wx.shareFileMessage` 失败时回退到保存图片到相册（`wx.saveImageToPhotosAlbum`）
