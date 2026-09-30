# -*- coding: utf-8 -*-
"""
PDF 发票解析模块
支持：增值税专用发票、增值税普通发票、电子发票（普通发票/增值税专用发票/数电票）
从文本型 PDF 中提取：发票号码、开票日期、购买方、销售方、品名、金额、税额、价税合计、税率
扫描件（图片型 PDF）无法解析时抛出 ParseError，由前端提示手工录入。
"""
import re
import pdfplumber


class ParseError(Exception):
    pass


# 需要过滤掉的"非数据"行（表头/说明性文字）
NOISE_PATTERNS = [
    "发票监制章", "全国统一发票监制章", "国家税务总局", "增值税电子普通发票",
    "电子发票（普通发票）", "电子发票（增值税专用发票）", "增值税专用发票",
    "增值税普通发票", "发票联", "抵扣联", "记账联", "第一联", "第二联", "第三联",
    "无效发票", "作废",
]


def _clean_lines(text):
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if any(p in line for p in NOISE_PATTERNS) and len(line) < 40 and ":" not in line and "：" not in line:
            # 纯标题行跳过（避免吞掉带金额的行）
            continue
        lines.append(line)
    return lines


def _extract_invoice_no(text):
    # 数电票 20 位；老票 8 位发票号码 + 10/12 位发票代码
    m = re.search(r"发\s*票\s*号\s*码[:：\s]*([0-9]{8,20})", text)
    if m:
        return m.group(1)
    # 兜底：新版数电票（部分开票方版式）pdfplumber 抽取后标签与值不在同一行，
    # 号码（20 位）游离到监制章附近，按独立 20 位数字全局查找
    m = re.search(r"(?<![0-9])([0-9]{20})(?![0-9])", text)
    if m:
        return m.group(1)
    return None


def _extract_invoice_code(text):
    m = re.search(r"发\s*票\s*代\s*码[:：\s]*([0-9A-Z]{10,12})", text)
    return m.group(1) if m else None


def _extract_date(text):
    m = re.search(r"开\s*票\s*日\s*期[:：\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"开\s*票\s*日\s*期[:：\s]*(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # 兜底：标签与日期值被拆散到不同行时（新版数电票），全文取第一个「YYYY年M月D日」
    m = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


_CJK = r"\u4e00-\u9fff\u3400-\u4dbf（）《》“”·、"


def _clean_party_name(name):
    """
    清洗购销方名称：
    - 去掉中文字符之间被 PDF 提取误加的空格/全角空格（如 "南 京保立隆" → "南京保立隆"）；
    - 保留英文字母/数字之间的空格（如 "IBM 中国" 中的英文部分不受影响）；
    - 去除首尾空白和标点。
    """
    if not name:
        return None
    s = name.replace("\u3000", " ").strip()
    # 相邻两个 CJK 字符之间的空白一律删除
    pattern = re.compile(rf"([{_CJK}])\s+(?=[{_CJK}])")
    prev = None
    while prev != s:
        prev = s
        s = pattern.sub(r"\1", s)
    s = s.strip(" :：、,，")
    return s or None


# 兜底识别企业名称用的组织后缀（长后缀在前，避免提前截断）
_ORG_SUFFIX = (
    r"(?:有限责任公司|股份有限公司|个人独资企业|个体工商户|农民专业合作社|"
    r"合伙企业|有限公司|分公司|合作社|研究所|研究院|事务所|经营部|经销部|"
    r"门市部|加工厂|制造厂|商行|门店|工厂|中心|工作室|宾馆|酒店|商店|医院)"
)
_ORG_NAME_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9（）()·]{2,40}?" + _ORG_SUFFIX)
# 行政/税务机关等非交易主体噪声（新数电票监制/税务局文字会被一起抽出）
_ORG_NOISE = ("税务总局", "税务局", "国务院", "财政部", "海关", "人民政府", "人民法院",
              "市场监督管理局", "公安局", "住建局", "教育局", "卫生局")


def _discover_orgs(text):
    """从全文按阅读顺序发现企业/经营主体名称（去重、去行政机关）。
    用于新版数电票"名称："标签与公司名被拆散到不同行的版式：
    左栏（购买方）先出现、右栏（销售方）后出现。"""
    out = []
    for raw in _ORG_NAME_RE.findall(text):
        name = _clean_party_name(raw)
        if not name or any(n in name for n in _ORG_NOISE):
            continue
        if name not in out:
            out.append(name)
    return out


def _extract_parties(text):
    """
    兼容多种版式提取购买方/销售方名称：
    1) 数电票两栏同行版式（"购/买/方"竖排被拆行，同行容纳双方）：
       "购 名称：无锡泰坦福新材料有限公司 销 名称：苏州尊迅新材料科技有限公司"
       "买 名称:普利美（常州）环境工程科技有限公司 售 名称:无锡惠山山姆零售有限公司"
    2) 传统版式：
       "购买方 名称：xxx" / "销售方 名称：yyy"
    3) 标签与值完全错位的新版式：名称行只剩"名称：  名称："，
       两个公司名另起一行（左购买方、右销售方）→ 按企业名发现兜底。
    """
    # 数电票两栏同行版式：购买方前缀为 购/买，销售方前缀为 销/售（竖排拆行导致不一致）
    m = re.search(r"[购买]\s*名\s*称\s*[:：]\s*(.+?)\s*[销售]\s*名\s*称\s*[:：]\s*([^\n]+)", text)
    if m:
        buyer = _clean_party_name(re.split(r"统一社会信用代码|纳税人识别号", m.group(1))[0])
        seller = _clean_party_name(re.split(r"统一社会信用代码|纳税人识别号", m.group(2))[0])
        if buyer and seller:
            return buyer, seller
    # 传统版式
    def _party(role):
        m = re.search(role + r"\s*名\s*称[:：\s]*([^\n]+)", text)
        if not m:
            return None
        name = re.split(r"统一社会信用代码|纳税人识别号|登记号", m.group(1))[0]
        return _clean_party_name(name)
    buyer = _party(r"购(?:买|货)方") or _party("购买方")
    seller = _party(r"销(?:售|货)方") or _party("销售方")
    # 兜底：标签行无值时，按阅读顺序发现企业名（左栏购方在前）
    if not buyer or not seller:
        orgs = _discover_orgs(text)
        if not buyer and orgs:
            buyer = orgs[0]
        if not seller:
            seller = next((n for n in orgs if n != buyer), None)
    return buyer, seller


def _extract_title(text):
    """判断发票类型"""
    head = text[:600]
    if "增值税专用发票" in head or "电子发票（增值税专用发票）" in head:
        return "增值税专用发票"
    if "增值税普通发票" in head or "电子发票（普通发票）" in head:
        return "增值税普通发票"
    if "增值税电子专用发票" in head:
        return "增值税专用发票"
    if "增值税电子普通发票" in head:
        return "增值税普通发票"
    if "发票" in head:
        return "其他发票"
    return None


def _extract_tax_rates(text):
    """从品名行提取税率（13% 9% 6% 5% 3% 1% 0% 免税 不征税），可能存在多个"""
    rates = re.findall(r"(?:^|[\s（(])((?:1[0-3]|9|6|5|3|1|0)(?:\.\d+)?%)(?=[\s）)*/\d¥￥]|$)", text)
    special = []
    if re.search(r"免\s*税", text):
        special.append("免税")
    if re.search(r"不\s*征\s*税", text):
        special.append("不征税")
    rates = sorted(set(rates), key=lambda r: -float(r.rstrip("%")))
    return rates + special


def _extract_amounts(text):
    """提取合计金额、税额、价税合计（小写）"""
    amount = tax = total = None

    # 合计行：＊合计＊ ￥xxx ￥yyy  或 "合  计 ￥124.34 ￥16.16"
    m = re.search(r"合\s*计[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})[^\d¥￥]*[¥￥]\s*([0-9,]+\.\d{2})", text)
    if m:
        amount = m.group(1)
        tax = m.group(2)

    # 价税合计（小写）¥188.00
    m = re.search(r"价税合计[（(]大写[）)][^\n]*?[（(]小写[）)]\s*[¥￥]?\s*([0-9,]+\.\d{2})", text)
    if not m:
        m = re.search(r"[（(]小写[）)]\s*[¥￥]\s*([0-9,]+\.\d{2})", text)
    if not m:
        m = re.search(r"价\s*税\s*合\s*计[^\n¥￥]*?[¥￥]\s*([0-9,]+\.\d{2})", text)
    if m:
        total = m.group(1)

    # 兜底：税额
    if tax is None:
        m = re.search(r"税\s*额[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})", text)
        if m:
            tax = m.group(1)
    if amount is None:
        m = re.search(r"金\s*额[^\n]*?[¥￥]\s*([0-9,]+\.\d{2})", text)
        if m:
            amount = m.group(1)

    return amount, tax, total


# 数字/单价/数量/单位等干扰 token
_NUM_TOKEN = re.compile(r"^[\d.,%¥￥+\-—:：/（）()()\[\]]+$")
_UNIT_TOKENS = {"吨", "个", "件", "台", "张", "次", "米", "千克", "公斤", "克", "升", "箱",
                "盒", "瓶", "桶", "卷", "包", "套", "只", "根", "块", "批", "kg", "L", "m"}


def _extract_items(text):
    """
    提取品名（货物或应税劳务名称）。兼容数电票品名换行：
      "*黑色金属冶炼压延品* Φ80 吨 8.066 14778.7610619469 119205.49 13% 15496.71"
      "14Cr11MoV圆钢"                      ← 品名换行延续
    过滤数量/单价/单位等 token，并拼接下一行的品名延续，得到：
      "黑色金属冶炼压延品 Φ80 14Cr11MoV圆钢"
    """
    lines = text.splitlines()
    items = []
    for i, line in enumerate(lines):
        m = re.search(r"\*([^*\n]+)\*(.*)", line)
        if not m:
            continue
        cat, rest = m.group(1).strip(), m.group(2).strip()
        toks = [t for t in rest.split()
                if not _NUM_TOKEN.fullmatch(t) and t not in _UNIT_TOKENS]
        name = " ".join(toks)
        # 品名换行延续：下一行是纯文字行（非新项目、非表尾/表头）
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if (nxt and not nxt.startswith("*")
                and not re.match(r"^(合\s*计|价税|备\s*注|开票人|项目名称|规格型号|销|购|购\s*名|销\s*名)", nxt)
                and re.search(r"[\u4e00-\u9fa5A-Za-z]", nxt)
                and not re.search(r"[¥￥]|\d{2,}%|\*\S+\*", nxt)):
            name = f"{name} {nxt}".strip() if name else nxt
        full = f"{cat} {name}".strip() if (name or cat) else ""
        if full and full not in items:
            items.append(full)
    return items[:6]


def _extract_check_code(text):
    """普票校验码（后6位常用于查验）"""
    m = re.search(r"校\s*验\s*码[:：\s]*([0-9 ]{6,24})", text)
    return m.group(1).replace(" ", "") if m else None


def parse_invoice_pdf(pdf_path):
    """主入口：返回结构化 dict；解析失败抛 ParseError"""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:3]:  # 发票一般 1 页，最多取 3 页
            t = page.extract_text() or ""
            text_parts.append(t)
    text = "\n".join(text_parts)

    if not text or len(text.strip()) < 20:
        raise ParseError("无法从 PDF 中提取文本，可能是扫描件/图片型发票，请改用手工录入。")

    invoice_no = _extract_invoice_no(text)
    if not invoice_no:
        raise ParseError("未找到发票号码，请确认这是否为增值税/普通发票 PDF，或改用手工录入。")

    amount, tax, total = _extract_amounts(text)
    rates = _extract_tax_rates(text)
    items = _extract_items(text)
    buyer, seller = _extract_parties(text)

    return {
        "invoice_no": invoice_no,
        "invoice_code": _extract_invoice_code(text),
        "invoice_type": _extract_title(text),
        "invoice_date": _extract_date(text),
        "buyer_name": buyer,
        "seller_name": seller,
        "item_name": "；".join(items) if items else None,
        "amount": amount,
        "tax_amount": tax,
        "total_amount": total,
        "tax_rate": rates[0] if rates else None,
        "all_tax_rates": rates,
        "check_code": _extract_check_code(text),
    }
