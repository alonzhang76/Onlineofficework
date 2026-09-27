# -*- coding: utf-8 -*-
"""生成模拟增值税发票 PDF，用于端到端测试解析功能"""
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4

pdfmetrics.registerFont(TTFont("msyh", r"C:\Windows\Fonts\msyh.ttc"))
pdfmetrics.registerFont(TTFont("simhei", r"C:\Windows\Fonts\simhei.ttf"))

W, H = A4


def make_invoice(path, no, date, seller, item, cat, amount, tax, total, title, rate_str, buyer="北京示例科技有限公司"):
    c = canvas.Canvas(path, pagesize=A4)
    y = H - 60
    c.setFont("simhei", 18)
    c.drawCentredString(W / 2, y, title)
    c.setFont("msyh", 10)
    y -= 30
    c.drawString(60, y, f"发票代码：{no[:10]}")
    c.drawRightString(W - 60, y, f"发票号码：{no}")
    y -= 20
    c.drawRightString(W - 60, y, f"开票日期：{date}")
    y -= 30
    c.drawString(60, y, "购买方")
    c.drawString(160, y, f"名称：{buyer}")
    y -= 16
    c.drawString(160, y, "统一社会信用代码：91110108MA01ABC23X")
    y -= 30
    c.drawString(60, y, "货物或应税劳务、服务名称")
    c.drawString(330, y, "规格型号  单位  数量  单价            金额            税率        税额")
    y -= 18
    c.setFont("msyh", 10)
    c.drawString(60, y, f"*{cat}*{item}")
    c.drawString(330, y, f"                1   {amount}        {amount:.2f}        {rate_str}      {tax:.2f}")
    y -= 30
    c.drawString(60, y, f"合  计                                                                    ￥{amount:.2f}  ￥{tax:.2f}")
    y -= 24
    c.drawString(60, y, f"价税合计（大写）壹佰元整          （小写）￥{total:.2f}")
    y -= 30
    c.drawString(60, y, "销售方")
    c.drawString(160, y, f"名称：{seller}")
    y -= 16
    c.drawString(160, y, "统一社会信用代码：91330100MA2XYZ789Q")
    y -= 16
    c.drawString(160, y, "开户行及账号：工行北京分行 020000123456789")
    c.save()


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
    os.makedirs(out, exist_ok=True)
    make_invoice(f"{out}/sample_zhuanpiao.pdf", "25012000000123456789", "2026年08月12日",
                 "中国铁路12306", "客运服务-高铁票 北京南→上海虹桥", "客运服务",
                 553.00, 49.77, 602.77, "电子发票（增值税专用发票）", "9%")
    make_invoice(f"{out}/sample_putong.pdf", "0440319001234567", "2026年08月20日",
                 "北京市办公用品有限公司", "办公用纸A4打印纸", "货物",
                 88.68, 11.53, 100.21, "增值税普通发票", "13%")
    make_invoice(f"{out}/sample_canyin.pdf", "0440319007654321", "2026年09月01日",
                 "上海锦江餐饮管理有限公司", "餐饮服务*商务宴请餐费", "餐饮服务",
                 1200.00, 72.00, 1272.00, "电子发票（普通发票）", "6%")
    print("samples generated:", out)
