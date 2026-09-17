/**
 * pdf-builder.js — 纯 JS PDF 构造器（小程序环境）
 * 将 JPEG 图像数组嵌入 PDF 1.4 文件，每页一张图。
 * 参考 PDF 规范 ISO 3200-1，仅实现最小子集。
 */

// A4 尺寸（point, 1pt=1/72 inch）
// A4 = 595×842 pt (portrait) / 842×595 pt (landscape)
var A4 = {
  portrait: { w: 595, h: 842 },
  landscape: { w: 842, h: 595 }
};

/**
 * 构造 PDF ArrayBuffer
 * @param {Array<{data: Uint8Array, width: number, height: number}>} images - JPEG 图像数组
 * @param {{orientation: 'portrait'|'landscape'}} options
 * @returns {ArrayBuffer}
 */
function buildPDF(images, options) {
  options = options || {};
  var orient = options.orientation || 'portrait';
  var pageSize = A4[orient] || A4.portrait;

  // PDF 对象编号规划：
  // 1: Catalog
  // 2: Pages
  // 3..(2+3n): 每页三组对象 (Page + Image XObject + Content Stream)
  var n = images.length;
  var totalObjs = 2 + 3 * n;
  var offsets = new Array(totalObjs + 1);
  var pos = 0;

  function strToBytes(s) {
    var arr = [];
    for (var j = 0; j < s.length; j++) {
      var c = s.charCodeAt(j);
      if (c < 128) arr.push(c);
      else {
        if (c < 0x800) { arr.push(0xC0 | (c >> 6)); arr.push(0x80 | (c & 0x3F)); }
        else { arr.push(0xE0 | (c >> 12)); arr.push(0x80 | ((c >> 6) & 0x3F)); arr.push(0x80 | (c & 0x3F)); }
      }
    }
    return new Uint8Array(arr);
  }
  function concatBytes(arrays) {
    var total = 0;
    for (var j = 0; j < arrays.length; j++) total += arrays[j].length;
    var result = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < arrays.length; j++) {
      result.set(arrays[j], offset);
      offset += arrays[j].length;
    }
    return result;
  }

  var chunks = [];

  // Header
  chunks.push(strToBytes('%PDF-1.4\n'));
  chunks.push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  pos = chunks[0].length + chunks[1].length;

  // Object 1: Catalog
  offsets[1] = pos;
  var catBody = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  chunks.push(strToBytes(catBody));
  pos += catBody.length;

  // Object 2: Pages
  offsets[2] = pos;
  var kids = [];
  for (var j = 0; j < n; j++) kids.push((3 + j * 3) + ' 0 R');
  var pagesBody = '2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\nendobj\n';
  chunks.push(strToBytes(pagesBody));
  pos += pagesBody.length;

  for (var i = 0; i < n; i++) {
    var pageObjNum = 3 + i * 3;
    var imgObjNum = 4 + i * 3;
    var contentObjNum = 5 + i * 3;

    offsets[pageObjNum] = pos;
    var pageBody = pageObjNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      pageSize.w + ' ' + pageSize.h + '] /Resources << /XObject << /Img' + (i + 1) + ' ' +
      imgObjNum + ' 0 R >> >> /Contents ' + contentObjNum + ' 0 R >>\nendobj\n';
    chunks.push(strToBytes(pageBody));
    pos += pageBody.length;

    offsets[imgObjNum] = pos;
    var img = images[i];
    var imgHeader = imgObjNum + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' +
      img.width + ' /Height ' + img.height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      img.data.length + ' >>\nstream\n';
    var imgFooter = '\nendstream\nendobj\n';
    chunks.push(concatBytes([strToBytes(imgHeader), img.data, strToBytes(imgFooter)]));
    pos += imgHeader.length + img.data.length + imgFooter.length;

    offsets[contentObjNum] = pos;
    var csText = 'q\n' + pageSize.w + ' 0 0 ' + pageSize.h + ' 0 0 cm\n/Img' + (i + 1) + ' Do\nQ\n';
    var csHeader = contentObjNum + ' 0 obj\n<< /Length ' + csText.length + ' >>\nstream\n';
    var csFooter = '\nendstream\nendobj\n';
    chunks.push(strToBytes(csHeader + csText + csFooter));
    pos += csHeader.length + csText.length + csFooter.length;
  }

  // Cross-reference table
  var xrefStart = pos;
  var xrefHeader = 'xref\n0 ' + (totalObjs + 1) + '\n0000000000 65535 f \n';
  var xrefLines = [strToBytes(xrefHeader)];
  for (var i = 1; i <= totalObjs; i++) {
    var off = offsets[i] || 0;
    var offStr = String(off);
    while (offStr.length < 10) offStr = '0' + offStr;
    xrefLines.push(strToBytes(offStr + ' 00000 n \n'));
  }
  chunks.push(concatBytes(xrefLines));

  // Trailer
  var trailer = 'trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';
  chunks.push(strToBytes(trailer));

  return concatBytes(chunks).buffer;
}

module.exports = {
  A4: A4,
  buildPDF: buildPDF
};
