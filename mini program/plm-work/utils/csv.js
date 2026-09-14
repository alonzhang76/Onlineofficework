/**
 * CSV 工具 —— 小程序端替代 Web 版 xlsx 导入导出
 * 导出的 CSV 带 BOM，Excel 可直接打开；导入兼容 Excel 另存的 CSV。
 */
const fmt = require('./format');

function escapeField(v) {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** rows: 二维数组 → CSV 文本 */
function toCSV(rows) {
  return '\ufeff' + rows.map(r => r.map(escapeField).join(',')).join('\r\n');
}

/** 标准 CSV 解析（支持引号内逗号/换行） */
function parseCSV(text) {
  text = String(text || '').replace(/^\ufeff/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 导出文件：写入临时文件后分享，失败则退回复制到剪贴板 */
function exportFile(fileName, content, done) {
  const fs = wx.getFileSystemManager();
  const path = wx.env.USER_DATA_PATH + '/' + fileName;
  try {
    fs.writeFileSync(path, content, 'utf8');
    wx.shareFileMessage({
      filePath: path,
      success() { done && done(true); },
      fail() {
        // 用户取消或环境不支持 → 退回剪贴板
        wx.setClipboardData({ data: content, success() { wx.showToast({ title: '已复制到剪贴板', icon: 'none' }); } });
        done && done(false);
      }
    });
  } catch (e) {
    wx.setClipboardData({ data: content, success() { wx.showToast({ title: '已复制到剪贴板', icon: 'none' }); } });
    done && done(false);
  }
}

/** 选择会话中的 CSV 文件并解析，callback(rows 二维数组) */
function chooseCSV(callback) {
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['csv'],
    success(res) {
      const f = res.tempFiles && res.tempFiles[0];
      if (!f) return;
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath: f.path,
        encoding: 'utf8',
        success(r) { callback(parseCSV(r.data), f.name); },
        fail() { wx.showToast({ title: '文件读取失败', icon: 'none' }); }
      });
    },
    fail() { /* 用户取消 */ }
  });
}

/** Excel 风格日期单元格解析（兼容序列号与字符串） */
function parseCellDate(v) {
  if (typeof v === 'number') return fmt.excelDate(v);
  return fmt.fmtDate(v);
}

module.exports = { toCSV, parseCSV, exportFile, chooseCSV, parseCellDate };
