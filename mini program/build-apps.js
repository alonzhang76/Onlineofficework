/**
 * 构建脚本：从 _app-template 生成两个独立小程序项目
 *   - saintysys-mp   服装外贸小程序（云端裸键，与网页版 apps/saintysys 共用）
 *   - stainless-mp   不锈钢贸易小程序（stainlessbusiness__ 前缀，与网页版共用）
 *
 * stainless-mp 额外叠加 _stainless/ 覆盖层：
 *   三抬头作用域数据层、合同 PDF 渲染/分享、抬头切换、统计页等。
 *
 * 用法：node build-apps.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TPL = path.join(ROOT, '_app-template');

function read(p) { return fs.readFileSync(path.join(TPL, p), 'utf8'); }
function readIn(baseDir, p) { return fs.readFileSync(path.join(ROOT, baseDir, p), 'utf8'); }
function write(p, c) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c);
  console.log('  + ' + p);
}

/* ================================================================
 * 模块 schema 定义
 * field: {k, label, type: text|number|date|select|textarea|contact,
 *         required, options, defaultValue, defaultToday, money, kvWide}
 * ================================================================ */

const STATUS_FLOW_FABRIC = ['寄样中', '已确认', '采购合同', '发货中', '已到货'];

/* ---------- 服装外贸（saintysys） ---------- */
const SAINTY_MODULES = [
  {
    key: 'orders', title: '订单管理', icon: '📋', color: '#34C759', idPrefix: 'ORD',
    stat: 'sum', sumField: 'totalAmount', statLabel: '订单总额(元)',
    statuses: ['草稿', '已确认', '生产中', '已完成', '已出货'], statusDefault: '草稿',
    statusColors: { '草稿': 'tag-gray', '已确认': 'tag-blue', '生产中': 'tag-orange', '已完成': 'tag-teal', '已出货': 'tag-green' },
    searchKeys: ['orderNo', 'styleNo', 'remark'],
    titleFn: r => r.orderNo || r.id, subFn: r => [r.styleNo, r.customerId__name].filter(Boolean).join(' · '),
    kvFields: ['styleNo', 'quantity', 'unitPrice', 'totalAmount', 'etd', 'shipMethod'],
    autoSum: { qtyField: 'quantity', priceField: 'unitPrice', target: 'totalAmount', money: true },
    fields: [
      { k: 'orderNo', label: 'PO 订单号', type: 'text', required: true },
      { k: 'styleNo', label: 'Style No. 款号', type: 'text', required: true },
      { k: 'customerId', label: '客户', type: 'contact' },
      { k: 'orderDate', label: '下单日期', type: 'date', defaultToday: true },
      { k: 'season', label: '季节', type: 'select', options: ['春夏', '秋冬', '四季'] },
      { k: 'fabricComposition', label: '面料成分', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unitPrice', label: '单价', type: 'number', money: true },
      { k: 'totalAmount', label: '总金额', type: 'number', money: true },
      { k: 'shipMethod', label: '运输方式', type: 'select', options: ['海运', '空运', '快递', '陆运'] },
      { k: 'etd', label: 'ETD 预计出货', type: 'date' },
      { k: 'status', label: '状态', type: 'select', options: ['草稿', '已确认', '生产中', '已完成', '已出货'], defaultValue: '草稿' },
      { k: 'remark', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'productions', title: '生产跟踪', icon: '🏭', color: '#FF9500', idPrefix: 'P',
    stat: 'count', statLabel: '生产单',
    statuses: ['待生产', '生产中', '已完成', '暂停'], statusDefault: '待生产',
    statusColors: { '待生产': 'tag-gray', '生产中': 'tag-orange', '已完成': 'tag-green', '暂停': 'tag-red' },
    searchKeys: ['styleNo', 'orderNo', 'factoryName'],
    titleFn: r => (r.styleNo || '') + (r.factoryName ? ' @ ' + r.factoryName : ''), subFn: r => r.orderNo || '',
    kvFields: ['orderNo', 'factoryType', 'qtyPlanned', 'qtyCompleted', 'expectedEnd', 'qcResult'],
    fields: [
      { k: 'styleNo', label: '款号', type: 'text', required: true },
      { k: 'orderNo', label: 'PO 订单号', type: 'text' },
      { k: 'factoryType', label: '工厂类型', type: 'select', options: ['裁床', '车缝', '水洗', '后整', '包装', '外发'] },
      { k: 'factoryName', label: '工厂名称', type: 'text', required: true },
      { k: 'contactPerson', label: '联系人', type: 'text' },
      { k: 'contactPhone', label: '联系电话', type: 'text' },
      { k: 'startDate', label: '开工日期', type: 'date', defaultToday: true },
      { k: 'expectedEnd', label: '预计完工', type: 'date' },
      { k: 'actualEnd', label: '实际完工', type: 'date' },
      { k: 'qtyPlanned', label: '计划数量', type: 'number' },
      { k: 'qtyCompleted', label: '完成数量', type: 'number' },
      { k: 'qcResult', label: 'QC 结果', type: 'select', options: ['待检', '合格', '不合格'] },
      { k: 'status', label: '状态', type: 'select', options: ['待生产', '生产中', '已完成', '暂停'], defaultValue: '待生产' }
    ]
  },
  {
    key: 'fabrics', title: '面料管理', icon: '🧵', color: '#0A84FF', idPrefix: 'F',
    stat: 'count', statLabel: '面料记录',
    statuses: STATUS_FLOW_FABRIC, statusDefault: '寄样中',
    statusColors: { '寄样中': 'tag-blue', '已确认': 'tag-teal', '采购合同': 'tag-purple', '发货中': 'tag-orange', '已到货': 'tag-green' },
    searchKeys: ['styleNo', 'fabricName', 'supplier', 'fabricCode'],
    titleFn: r => r.fabricName || r.id, subFn: r => [r.styleNo, r.supplier].filter(Boolean).join(' · '),
    kvFields: ['fabricCode', 'composition', 'color', 'weightGsm', 'unitPrice', 'qtyOrdered', 'status2'],
    fields: [
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'fabricName', label: '面里衬名称', type: 'text', required: true },
      { k: 'fabricType', label: '类型', type: 'select', options: ['面料', '里料', '衬料'] },
      { k: 'fabricCode', label: '面料编号', type: 'text' },
      { k: 'usagePart', label: '使用部位', type: 'text' },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'composition', label: '成分', type: 'text' },
      { k: 'color', label: '颜色', type: 'text' },
      { k: 'weightGsm', label: '克重(g/m²)', type: 'number' },
      { k: 'width', label: '门幅', type: 'text' },
      { k: 'unitPrice', label: '单价', type: 'number', money: true },
      { k: 'qtyOrdered', label: '订购数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: ['米', '码', '公斤'] },
      { k: 'status', label: '状态', type: 'select', options: STATUS_FLOW_FABRIC, defaultValue: '寄样中' },
      { k: 'shipDate', label: '发货日期', type: 'date' },
      { k: 'arrivalDate', label: '到货日期', type: 'date' },
      { k: 'remark', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'accessories', title: '辅料管理', icon: '🧷', color: '#AF52DE', idPrefix: 'A',
    stat: 'count', statLabel: '辅料记录',
    statuses: STATUS_FLOW_FABRIC, statusDefault: '寄样中',
    statusColors: { '寄样中': 'tag-blue', '已确认': 'tag-teal', '采购合同': 'tag-purple', '发货中': 'tag-orange', '已到货': 'tag-green' },
    searchKeys: ['styleNo', 'accessoryName', 'supplier', 'accessoryCode'],
    titleFn: r => r.accessoryName || r.id, subFn: r => [r.styleNo, r.supplier].filter(Boolean).join(' · '),
    kvFields: ['accessoryCode', 'spec', 'color', 'unitPrice', 'qtyOrdered'],
    fields: [
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'accessoryName', label: '辅料名称', type: 'text', required: true },
      { k: 'accessoryCode', label: '辅料编号', type: 'text' },
      { k: 'usagePart', label: '使用部位', type: 'text' },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'composition', label: '成分', type: 'text' },
      { k: 'color', label: '颜色', type: 'text' },
      { k: 'unitPrice', label: '单价', type: 'number', money: true },
      { k: 'qtyOrdered', label: '订购数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: ['个', '粒', '米', '条', '套', '包'] },
      { k: 'status', label: '状态', type: 'select', options: STATUS_FLOW_FABRIC, defaultValue: '寄样中' },
      { k: 'shipDate', label: '发货日期', type: 'date' },
      { k: 'arrivalDate', label: '到货日期', type: 'date' },
      { k: 'remark', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'washes', title: '水洗管理', icon: '🫧', color: '#00C7BE', idPrefix: 'W',
    stat: 'count', statLabel: '水洗记录',
    statuses: ['未确认', '寄样中', '已确认'], statusDefault: '寄样中',
    statusColors: { '未确认': 'tag-gray', '寄样中': 'tag-blue', '已确认': 'tag-green' },
    searchKeys: ['styleNo', 'factory', 'washMethod'],
    titleFn: r => r.styleNo || r.id, subFn: r => [r.factory, r.washMethod].filter(Boolean).join(' · '),
    kvFields: ['round', 'washDate', 'factory', 'targetColor', 'washResult'],
    fields: [
      { k: 'styleNo', label: '款号', type: 'text', required: true },
      { k: 'round', label: '轮次', type: 'number' },
      { k: 'washDate', label: '水洗日期', type: 'date', defaultToday: true },
      { k: 'factory', label: '水洗厂', type: 'text' },
      { k: 'washMethod', label: '水洗方式', type: 'select', options: ['普通水洗', '石洗', '酵素洗', '漂洗', '砂洗', '其他'] },
      { k: 'targetColor', label: '目标颜色', type: 'text' },
      { k: 'washResult', label: '水洗结果', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['未确认', '寄样中', '已确认'], defaultValue: '寄样中' },
      { k: 'customerFeedback', label: '客户反馈', type: 'textarea' },
      { k: 'confirmedDate', label: '确认日期', type: 'date' }
    ]
  },
  {
    key: 'samples', title: '样衣管理', icon: '👗', color: '#EC4899', idPrefix: 'S',
    stat: 'count', statLabel: '样衣记录',
    statuses: ['头样', '尺码样', '产前样', '船样', '照片样', '已确认'],
    statusColors: { '头样': 'tag-gray', '尺码样': 'tag-blue', '产前样': 'tag-teal', '船样': 'tag-orange', '照片样': 'tag-purple', '已确认': 'tag-green' },
    searchKeys: ['styleNo', 'factory', 'confirmedBy'],
    titleFn: r => r.styleNo || r.id, subFn: r => [r.stageKey, r.factory].filter(Boolean).join(' · '),
    kvFields: ['size', 'qty', 'sampleDate', 'arrangeDate', 'confirmedBy'],
    fields: [
      { k: 'styleNo', label: '款号', type: 'text', required: true },
      { k: 'stageKey', label: '样衣阶段', type: 'select', options: ['头样', '尺码样', '产前样', '船样', '照片样'] },
      { k: 'size', label: '尺码', type: 'text' },
      { k: 'qty', label: '数量', type: 'number' },
      { k: 'factory', label: '样衣工/工厂', type: 'text' },
      { k: 'arrangeDate', label: '安排日期', type: 'date', defaultToday: true },
      { k: 'sampleDate', label: '完成日期', type: 'date' },
      { k: 'confirmedBy', label: '确认人', type: 'text' },
      { k: 'techNotes', label: '工艺说明', type: 'textarea' }
    ]
  },
  {
    key: 'shippings', title: '出货管理', icon: '🚢', color: '#0EA5E9', idPrefix: 'SH',
    stat: 'count', statLabel: '出货单',
    statuses: ['计划中', '已发运', '已到港', '已完成'], statusDefault: '计划中',
    statusColors: { '计划中': 'tag-gray', '已发运': 'tag-orange', '已到港': 'tag-blue', '已完成': 'tag-green' },
    searchKeys: ['shipNo', 'orderNo', 'styleNo', 'buyer', 'blNo'],
    titleFn: r => r.shipNo || r.orderNo || r.id, subFn: r => [r.styleNo, r.buyer].filter(Boolean).join(' · '),
    kvFields: ['orderNo', 'poNo', 'quantity', 'totalCtn', 'etd', 'eta', 'blNo', 'forwarder'],
    fields: [
      { k: 'shipNo', label: '出货编号', type: 'text' },
      { k: 'orderNo', label: 'PO 订单号', type: 'text' },
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'buyer', label: '买家', type: 'text' },
      { k: 'poNo', label: '客户 PO', type: 'text' },
      { k: 'itemDesc', label: '货品描述', type: 'text' },
      { k: 'packType', label: '包装方式', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'totalCtn', label: '总箱数', type: 'number' },
      { k: 'volume', label: '体积(m³)', type: 'number' },
      { k: 'etd', label: 'ETD 开船日', type: 'date' },
      { k: 'eta', label: 'ETA 到港日', type: 'date' },
      { k: 'blNo', label: '提单号 B/L', type: 'text' },
      { k: 'forwarder', label: '货代', type: 'text' },
      { k: 'customsNo', label: '报关单号', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['计划中', '已发运', '已到港', '已完成'], defaultValue: '计划中' },
      { k: 'remarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'collections', title: '收汇管理', icon: '💰', color: '#10B981', idPrefix: 'COL',
    stat: 'sum', sumField: 'rmbAmount', statLabel: '收汇合计(元)',
    statuses: ['未收', '部分收汇', '已收汇'], statusDefault: '未收',
    statusColors: { '未收': 'tag-gray', '部分收汇': 'tag-orange', '已收汇': 'tag-green' },
    searchKeys: ['orderNo', 'styleNo'],
    titleFn: r => (r.orderNo || r.id) + (r.amount ? '  ' + r.amount : ''), subFn: r => r.styleNo || '',
    kvFields: ['styleNo', 'amount', 'currency', 'exchangeRate', 'rmbAmount', 'type', 'collectionDate'],
    autoSum: { qtyField: 'amount', priceField: 'exchangeRate', target: 'rmbAmount', money: true },
    fields: [
      { k: 'orderNo', label: 'PO 订单号', type: 'text', required: true },
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'collectionDate', label: '收汇日期', type: 'date', defaultToday: true },
      { k: 'amount', label: '收汇金额', type: 'number', money: true, required: true },
      { k: 'currency', label: '币种', type: 'select', options: ['USD', 'EUR', 'GBP', 'JPY', 'RMB'], defaultValue: 'USD' },
      { k: 'exchangeRate', label: '汇率', type: 'number' },
      { k: 'rmbAmount', label: '人民币金额', type: 'number', money: true },
      { k: 'type', label: '款项类型', type: 'select', options: ['定金', '尾款', '全款', '其他'] },
      { k: 'status', label: '状态', type: 'select', options: ['未收', '部分收汇', '已收汇'], defaultValue: '未收' }
    ]
  },
  {
    key: 'invoices', title: '发票管理', icon: '🧾', color: '#F59E0B', idPrefix: 'IV',
    stat: 'count', statLabel: '发票记录',
    statuses: ['待开票', '已开票', '已寄出', '已认证'], statusDefault: '待开票',
    statusColors: { '待开票': 'tag-gray', '已开票': 'tag-blue', '已寄出': 'tag-orange', '已认证': 'tag-green' },
    searchKeys: ['invoiceNo', 'orderNo', 'styleNo'],
    titleFn: r => r.invoiceNo || r.id, subFn: r => [r.orderNo, r.styleNo].filter(Boolean).join(' · '),
    kvFields: ['orderNo', 'invoiceDate', 'amount', 'currency', 'status'],
    fields: [
      { k: 'invoiceNo', label: '发票号', type: 'text', required: true },
      { k: 'orderNo', label: 'PO 订单号', type: 'text' },
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'invoiceDate', label: '开票日期', type: 'date', defaultToday: true },
      { k: 'amount', label: '金额', type: 'number', money: true, required: true },
      { k: 'currency', label: '币种', type: 'select', options: ['USD', 'EUR', 'GBP', 'JPY', 'RMB'], defaultValue: 'USD' },
      { k: 'status', label: '状态', type: 'select', options: ['待开票', '已开票', '已寄出', '已认证'], defaultValue: '待开票' }
    ]
  },
  {
    key: 'payments', title: '付款管理', icon: '💳', color: '#EF4444', idPrefix: 'PAY',
    stat: 'sum', sumField: 'amount', statLabel: '付款合计(元)',
    statuses: ['待付款', '已付款'], statusDefault: '待付款',
    statusColors: { '待付款': 'tag-orange', '已付款': 'tag-green' },
    searchKeys: ['payee', 'styleNo', 'invoiceNo'],
    titleFn: r => r.payee || r.id, subFn: r => [r.invoiceNo, r.styleNo].filter(Boolean).join(' · '),
    kvFields: ['amount', 'paymentDate', 'method', 'source', 'invoiceNo'],
    fields: [
      { k: 'payee', label: '收款方', type: 'text', required: true },
      { k: 'amount', label: '金额', type: 'number', money: true, required: true },
      { k: 'paymentDate', label: '付款日期', type: 'date', defaultToday: true },
      { k: 'method', label: '付款方式', type: 'select', options: ['银行转账', '现金', '支付宝', '微信', '其他'] },
      { k: 'source', label: '款项来源', type: 'select', options: ['订单', '快递', '面料', '辅料', '其他'] },
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'invoiceNo', label: '关联发票号', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['待付款', '已付款'], defaultValue: '待付款' }
    ]
  },
  {
    key: 'contacts', title: '通讯录', icon: '👥', color: '#6366F1', idPrefix: 'CT',
    stat: 'count', statLabel: '联系人',
    searchKeys: ['name', 'contactPerson', 'phone', 'type'],
    titleFn: r => r.name || r.id, subFn: r => [r.type, r.contactPerson].filter(Boolean).join(' · '),
    kvFields: ['contactPerson', 'phone', 'email', 'address'],
    fields: [
      { k: 'name', label: '名称', type: 'text', required: true },
      { k: 'type', label: '类型', type: 'select', options: ['客户', '供应商', '工厂', '货代', '其他'], required: true },
      { k: 'contactPerson', label: '联系人', type: 'text' },
      { k: 'position', label: '职位', type: 'text' },
      { k: 'phone', label: '电话', type: 'text' },
      { k: 'email', label: '邮箱', type: 'text' },
      { k: 'address', label: '地址', type: 'text' },
      { k: 'bankAccount', label: '银行账号', type: 'text' },
      { k: 'bankCode', label: '银行代码/SWIFT', type: 'text' },
      { k: 'taxNo', label: '税号', type: 'text' },
      { k: 'description', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'express_delivery_data_v2', title: '快递物流', icon: '📦', color: '#F97316', idPrefix: 'EX',
    stat: 'sum', sumField: 'cost', statLabel: '快递费合计(元)',
    searchKeys: ['tracking', 'item', 'styleNo', 'company'],
    titleFn: r => (r.company || '') + (r.tracking ? ' ' + r.tracking : ''), subFn: r => [r.date, r.item].filter(Boolean).join(' · '),
    kvFields: ['tracking', 'date', 'weight', 'cost', 'toArea', 'payType', 'handler'],
    fields: [
      { k: 'date', label: '日期', type: 'date', defaultToday: true },
      { k: 'company', label: '快递公司', type: 'select', options: ['顺丰速运', 'DHL', 'FedEx', 'UPS', 'EMS', '申通', '圆通', '中通', '其他'], required: true },
      { k: 'tracking', label: '运单号', type: 'text' },
      { k: 'item', label: '物品', type: 'text' },
      { k: 'styleNo', label: '款号', type: 'text' },
      { k: 'weight', label: '重量(kg)', type: 'number' },
      { k: 'cost', label: '费用', type: 'number', money: true },
      { k: 'toArea', label: '目的地', type: 'text' },
      { k: 'fromArea', label: '发出地', type: 'text' },
      { k: 'payType', label: '付费方式', type: 'select', options: ['寄付', '到付', '月结'] },
      { k: 'handler', label: '经手人', type: 'text' },
      { k: 'remark', label: '备注', type: 'textarea' }
    ]
  }
];

/* ---------- 服装外贸：报价系统额外云键（与 apps/saintysys/quotation.html 互通） ---------- */
const SAINTY_EXTRA_KEYS = ['fashion_quotations', 'fashion_quotation_settings'];

/* 报价默认设置（与桌面端 defaultSettings 完全一致） */
const DEFAULT_QUOTE_SETTINGS = {
  companyName: 'JIANGSU SAINTY HANTANG TRADING CO LTD',
  companyAddress: '',
  companyPhone: '+86-510-82734291',
  companyEmail: 'adamstig@163.com',
  companyTaxId: '',
  userName: 'Adam',
  custCompany: 'Castro Model LTD.',
  custContact: 'Yaara Bar',
  custAddress: '31 Ort Israel St. Bat Yam 59590 Israel',
  custPhone: '052-8593287',
  custEmail: 'yaara.b@castro.co.il',
  defaultCurrency: 'USD',
  defaultPaymentTerms: '30% deposit, 70% before shipment',
  defaultDeliveryTerms: 'FOB Shanghai',
  defaultLeadTime: '45-60 days after order confirmation',
  defaultValidity: '30 days',
  defaultHangerCost: 1.10,
  defaultDiscount: 0,
  defaultNotes: '1. Sample lead time: 7-10 working days.\n2. All prices include standard poly bag and carton packing; hanger packing available upon request.\n3. Color matching is subject to fabric mill confirmation; slight variation may occur between lots.\n4. Size charts and tech packs available upon request.\n5. Prices are valid for 30 days from quotation date and subject to final confirmation.\n6. Compliance with REACH and OEKO-TEX standards; test reports available upon request.'
};

/* ---------- 不锈钢贸易（stainlessbusiness） ----------
 * 键名/字段与桌面端 apps/stainlessbusiness 完全一致：
 * 业务键按 <companyId>__<key> 分公司作用域存储，contacts/memos 等为全局键。
 */
const STAINLESS_GLOBAL_KEYS = [
  'memos', 'contacts', 'favoriteContacts',
  'industryTypes', 'industryApplications', 'gradeComparisons', 'vocabularies',
  'hscodes', 'hscodeData', 'calculationParams', 'plateCalcData',
  'certificateData', 'paymentTerms', 'customColumns',
  'products', 'productCategories',
  'companyList', 'currentCompanyId',
  'isLoggedIn', 'username', 'userPhone', 'dataCleared', 'contractTerms'
];
const STAINLESS_SCOPED_KEYS = [
  'inquiries', 'quotations',
  'purchaseOrders', 'returnRecords',
  'salesOrders', 'salesReturnRecords',
  'inventoryRecords', 'warehouses', 'warehouseHistory',
  'warehouseSales', 'warehouseSalePayments', 'warehouseSaleInvoices',
  'transactions', 'transactionCategories', 'initialBalanceData',
  'invoices',
  'purchaseContractTerms', 'salesContractTerms',
  'calendarEvents', 'companyName1', 'companyName2'
];
const STAINLESS_COMPANY_IDS = ['default-1', 'default-2', 'default-3'];

const UNIT_OPTS = ['公斤', '吨', '件', '支', '米'];
const WEIGHT_OPTS = ['公斤', '吨'];

const STAINLESS_MODULES = [
  {
    key: 'salesOrders', title: '销售订单', icon: '💼', color: '#007AFF', idPrefix: 'SO',
    stat: 'sum', sumField: 'totalAmount', statLabel: '销售总额(元)',
    statuses: ['待发货', '已发货', '已完成'], statusDefault: '待发货',
    statusColors: { '待发货': 'tag-orange', '已发货': 'tag-blue', '已完成': 'tag-green' },
    searchKeys: ['orderNo', 'customer', 'product', 'material', 'specification', 'contractNo'],
    titleFn: r => r.orderNo || r.id,
    subFn: r => [r.customer, r.contractNo ? '合同:' + r.contractNo : ''].filter(Boolean).join(' · '),
    kvFields: ['product', 'material', 'specification', 'quantity', 'weight', 'weightAdjustment', 'totalAmount', 'deliveryDate'],
    autoSum: { qtyField: 'weight', adjustField: 'weightAdjustment', priceField: 'price', target: 'totalAmount', money: true },
    action: { label: '生成销售合同', url: '/pages/contract/contract', query: 'type=sales' },
    fields: [
      { k: 'orderNo', label: '订单编号', type: 'text', required: true },
      { k: 'orderDate', label: '下单日期', type: 'date', defaultToday: true },
      { k: 'deliveryDate', label: '交货日期', type: 'date' },
      { k: 'customer', label: '客户', type: 'text', required: true },
      { k: 'status', label: '状态', type: 'select', options: ['待发货', '已发货', '已完成'], defaultValue: '待发货' },
      { k: 'contractNo', label: '合同号', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'materialCode', label: '物料编码/图号', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'heatNo', label: '炉号', type: 'text' },
      { k: 'warrantyNo', label: '质保书号码', type: 'text' },
      { k: 'inventoryNo', label: '坯料产地', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: UNIT_OPTS },
      { k: 'weight', label: '订单重量', type: 'number' },
      { k: 'weightAdjustment', label: '损/溢重量(±)', type: 'number' },
      { k: 'weightUnit', label: '重量单位', type: 'select', options: WEIGHT_OPTS, defaultValue: '公斤' },
      { k: 'price', label: '单价(元)', type: 'number', money: true },
      { k: 'totalAmount', label: '总金额(元)', type: 'number', money: true },
      { k: 'paymentTerms', label: '付款方式', type: 'text' },
      { k: 'otherRequirements', label: '其它要求', type: 'textarea' },
      { k: 'description', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'purchaseOrders', title: '采购订单', icon: '🛒', color: '#5856D6', idPrefix: 'PO',
    stat: 'sum', sumField: 'totalAmount', statLabel: '采购总额(元)',
    statuses: ['待处理', '待发货', '执行中', '执行完毕'], statusDefault: '待处理',
    statusColors: { '待处理': 'tag-gray', '待发货': 'tag-blue', '执行中': 'tag-orange', '执行完毕': 'tag-green' },
    searchKeys: ['orderNo', 'supplier', 'customer', 'product', 'material', 'specification'],
    titleFn: r => r.orderNo || r.id,
    subFn: r => [r.supplier, r.customer].filter(Boolean).join(' · '),
    kvFields: ['product', 'material', 'specification', 'quantity', 'weight', 'totalAmount', 'expectedDate'],
    autoSum: { qtyField: 'weight', priceField: 'price', target: 'totalAmount', money: true },
    action: { label: '生成采购合同', url: '/pages/contract/contract', query: 'type=purchase' },
    fields: [
      { k: 'orderNo', label: '订单编号', type: 'text', required: true },
      { k: 'orderDate', label: '下单日期', type: 'date', defaultToday: true },
      { k: 'expectedDate', label: '交货日期', type: 'date' },
      { k: 'supplier', label: '供应商', type: 'text', required: true },
      { k: 'customer', label: '客户', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['待处理', '待发货', '执行中', '执行完毕'], defaultValue: '待处理' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'materialCode', label: '物料编码/图号', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'heatNo', label: '炉号', type: 'text' },
      { k: 'inventoryNo', label: '坯料产地', type: 'text' },
      { k: 'warrantyNo', label: '质保书号', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: UNIT_OPTS },
      { k: 'weight', label: '订单重量', type: 'number' },
      { k: 'weightUnit', label: '重量单位', type: 'select', options: WEIGHT_OPTS, defaultValue: '公斤' },
      { k: 'price', label: '单价(元)', type: 'number', money: true },
      { k: 'totalAmount', label: '总金额(元)', type: 'number', money: true },
      { k: 'logisticsNo', label: '物流单号', type: 'text' },
      { k: 'otherRequirements', label: '其它要求', type: 'textarea' },
      { k: 'remarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'inquiries', title: '询价单', icon: '📨', color: '#F59E0B', idPrefix: 'INQ',
    stat: 'count', statLabel: '询价单',
    statuses: ['待回复', '已回复', '已成交', '已关闭'], statusDefault: '待回复',
    statusColors: { '待回复': 'tag-gray', '已回复': 'tag-blue', '已成交': 'tag-green', '已关闭': 'tag-gray' },
    searchKeys: ['inquiryNo', 'supplier', 'customer', 'product', 'material'],
    titleFn: r => r.inquiryNo || r.id,
    subFn: r => [r.supplier, r.customer].filter(Boolean).join(' · '),
    kvFields: ['product', 'material', 'specification', 'quantity', 'weight', 'expectedPrice', 'dueDate'],
    fields: [
      { k: 'inquiryNo', label: '询价单号', type: 'text', required: true },
      { k: 'inquiryDate', label: '询价日期', type: 'date', defaultToday: true },
      { k: 'dueDate', label: '回复期限', type: 'date' },
      { k: 'status', label: '状态', type: 'select', options: ['待回复', '已回复', '已成交', '已关闭'], defaultValue: '待回复' },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'supplierContact', label: '供应商联系人', type: 'text' },
      { k: 'supplierPhone', label: '供应商电话', type: 'text' },
      { k: 'customer', label: '客户', type: 'text' },
      { k: 'customerContact', label: '客户联系人', type: 'text' },
      { k: 'customerPhone', label: '客户电话', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'materialCode', label: '物料编码/图号', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: UNIT_OPTS },
      { k: 'weight', label: '重量', type: 'number' },
      { k: 'weightUnit', label: '重量单位', type: 'select', options: WEIGHT_OPTS, defaultValue: '公斤' },
      { k: 'expectedPrice', label: '期望价格', type: 'number', money: true },
      { k: 'outerDiameter', label: '外径', type: 'number' },
      { k: 'innerDiameter', label: '内径', type: 'number' },
      { k: 'wallThickness', label: '壁厚', type: 'number' },
      { k: 'width', label: '宽度', type: 'number' },
      { k: 'height', label: '高度', type: 'number' },
      { k: 'length', label: '长度', type: 'number' },
      { k: 'thickness', label: '厚度', type: 'number' },
      { k: 'sideLength', label: '边长', type: 'number' },
      { k: 'diameter', label: '直径', type: 'number' },
      { k: 'crossSectionArea', label: '截面积(mm²)', type: 'number' },
      { k: 'description', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'quotations', title: '报价单', icon: '💰', color: '#10B981', idPrefix: 'QT',
    stat: 'count', statLabel: '报价单',
    statuses: ['待报价', '已报价', '已成交', '已关闭'], statusDefault: '待报价',
    statusColors: { '待报价': 'tag-gray', '已报价': 'tag-blue', '已成交': 'tag-green', '已关闭': 'tag-gray' },
    searchKeys: ['inquiryNo', 'customer', 'supplier', 'product', 'material'],
    titleFn: r => r.inquiryNo || r.id,
    subFn: r => [r.customer, r.supplier].filter(Boolean).join(' · '),
    kvFields: ['product', 'specification', 'quantity', 'weight', 'unitPrice', 'purchasePrice', 'profitMargin'],
    autoDiff: { aField: 'unitPrice', bField: 'purchasePrice', target: 'profitMargin', money: true },
    fields: [
      { k: 'inquiryNo', label: '询价/报价单号', type: 'text', required: true },
      { k: 'quotationDate', label: '报价日期', type: 'date', defaultToday: true },
      { k: 'validUntil', label: '有效期至', type: 'date' },
      { k: 'status', label: '状态', type: 'select', options: ['待报价', '已报价', '已成交', '已关闭'], defaultValue: '待报价' },
      { k: 'customer', label: '客户', type: 'text' },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: UNIT_OPTS },
      { k: 'weight', label: '重量', type: 'number' },
      { k: 'weightUnit', label: '重量单位', type: 'select', options: WEIGHT_OPTS, defaultValue: '公斤' },
      { k: 'unitPrice', label: '报价(元)', type: 'number', money: true },
      { k: 'purchasePrice', label: '采购价(元)', type: 'number', money: true },
      { k: 'profitMargin', label: '单位毛利(元)', type: 'number', money: true },
      { k: 'description', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'returnRecords', title: '采购收退货', icon: '📥', color: '#10B981', idPrefix: 'RT',
    stat: 'count', statLabel: '收退货记录',
    searchKeys: ['returnDate', 'orderNo', 'supplier', 'product', 'logisticsNo'],
    titleFn: r => r.orderNo || r.id,
    subFn: r => [r.supplier, r.product].filter(Boolean).join(' · '),
    kvFields: ['returnDate', 'receivedWeight', 'returnedWeight', 'logisticsCost', 'otherCost', 'logisticsNo'],
    fields: [
      { k: 'returnDate', label: '收退货日期', type: 'date', defaultToday: true },
      { k: 'orderNo', label: '订单编号', type: 'text', required: true },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'logisticsNo', label: '物流单号', type: 'text' },
      { k: 'logistics', label: '物流公司', type: 'text' },
      { k: 'carPlate', label: '车牌号', type: 'text' },
      { k: 'driver', label: '司机', type: 'text' },
      { k: 'driverPhone', label: '司机电话', type: 'text' },
      { k: 'receivingAddress', label: '收货地址', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'receivedWeight', label: '收货重量', type: 'number' },
      { k: 'returnedWeight', label: '退货重量', type: 'number' },
      { k: 'logisticsCost', label: '物流费用', type: 'number', money: true },
      { k: 'otherCost', label: '其它费用', type: 'number', money: true },
      { k: 'purchaseRemarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'salesReturnRecords', title: '销售发退货', icon: '📤', color: '#EF4444', idPrefix: 'SRT',
    stat: 'count', statLabel: '发退货记录',
    searchKeys: ['returnDate', 'orderNo', 'customer', 'product', 'logisticsNo'],
    titleFn: r => r.orderNo || r.id,
    subFn: r => [r.customer, r.product].filter(Boolean).join(' · '),
    kvFields: ['returnDate', 'deliveredWeight', 'salesReturnedWeight', 'salesLogisticsCost', 'salesOtherCost', 'logisticsNo'],
    fields: [
      { k: 'returnDate', label: '发退货日期', type: 'date', defaultToday: true },
      { k: 'orderNo', label: '订单编号', type: 'text', required: true },
      { k: 'customer', label: '客户', type: 'text' },
      { k: 'logisticsNo', label: '物流单号', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'deliveredWeight', label: '发货重量', type: 'number' },
      { k: 'salesReturnedWeight', label: '退货重量', type: 'number' },
      { k: 'salesLogisticsCost', label: '物流费用', type: 'number', money: true },
      { k: 'salesOtherCost', label: '其它费用', type: 'number', money: true },
      { k: 'salesRemarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'inventoryRecords', title: '库存记录', icon: '🏬', color: '#0A84FF', idPrefix: 'INV',
    stat: 'count', statLabel: '库存记录',
    searchKeys: ['stockInDate', 'warehouseId', 'product', 'material', 'specification'],
    titleFn: r => [r.product, r.material].filter(Boolean).join(' ') || r.id,
    subFn: r => [r.warehouseId, r.locationId].filter(Boolean).join(' · '),
    kvFields: ['warehouseId', 'locationId', 'specification', 'quantity', 'weight', 'supplier'],
    fields: [
      { k: 'stockInDate', label: '入库日期', type: 'date', defaultToday: true },
      { k: 'warehouseId', label: '仓库', type: 'text' },
      { k: 'locationId', label: '库位', type: 'text' },
      { k: 'operator', label: '经手人', type: 'text' },
      { k: 'supplier', label: '供应商', type: 'text' },
      { k: 'product', label: '产品', type: 'text' },
      { k: 'material', label: '材质', type: 'text' },
      { k: 'specification', label: '规格', type: 'text' },
      { k: 'quantity', label: '数量', type: 'number' },
      { k: 'unit', label: '单位', type: 'select', options: UNIT_OPTS },
      { k: 'weight', label: '重量', type: 'number' },
      { k: 'weightUnit', label: '重量单位', type: 'select', options: WEIGHT_OPTS, defaultValue: '公斤' },
      { k: 'notes', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'warehouses', title: '仓库设置', icon: '🗄️', color: '#64748B', idPrefix: 'WH',
    stat: 'count', statLabel: '仓库',
    searchKeys: ['name', 'location', 'manager'],
    titleFn: r => r.name || r.id,
    subFn: r => [r.location, r.manager].filter(Boolean).join(' · '),
    kvFields: ['location', 'manager', 'phone'],
    fields: [
      { k: 'name', label: '仓库名称', type: 'text', required: true },
      { k: 'location', label: '仓库地址', type: 'text' },
      { k: 'manager', label: '管理员', type: 'text' },
      { k: 'phone', label: '联系电话', type: 'text' },
      { k: 'remark', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'transactions', title: '收付款', icon: '💴', color: '#F97316', idPrefix: 'TX',
    stat: 'sum', sumField: 'amount', statLabel: '收付款合计(元)',
    statuses: ['收款', '付款', '其他'], statusDefault: '收款',
    statusColors: { '收款': 'tag-green', '付款': 'tag-red', '其他': 'tag-gray' },
    searchKeys: ['date', 'category', 'payee', 'payer', 'handler', 'paymentMethod'],
    titleFn: r => (r.category || '收付款') + (r.amount != null && r.amount !== '' ? '  ¥' + r.amount : ''),
    subFn: r => [r.payee, r.payer].filter(Boolean).join(' → '),
    kvFields: ['date', 'paymentMethod', 'payee', 'payer', 'amount', 'handler'],
    fields: [
      { k: 'date', label: '收付款日期', type: 'date', defaultToday: true },
      { k: 'category', label: '交易类别', type: 'select', options: ['收款', '付款', '其他'], defaultValue: '收款', required: true },
      { k: 'paymentMethod', label: '结算方式', type: 'select', options: ['承兑汇票', '电汇', '现金', '微信', '支付宝'], defaultValue: '电汇' },
      { k: 'handler', label: '经手人', type: 'text', defaultValue: '周瑾' },
      { k: 'payee', label: '收款单位', type: 'text' },
      { k: 'payer', label: '付款单位', type: 'text' },
      { k: 'amount', label: '金额(元)', type: 'number', money: true, required: true },
      { k: 'remarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'invoices', title: '发票登记', icon: '🧾', color: '#F59E0B', idPrefix: 'IV',
    stat: 'sum', sumField: 'totalAmount', statLabel: '价税合计(元)',
    statuses: ['进项', '销项'], statusDefault: '销项',
    statusColors: { '进项': 'tag-blue', '销项': 'tag-orange' },
    searchKeys: ['invoiceDate', 'invoiceNo', 'seller', 'buyer', 'type'],
    titleFn: r => r.invoiceNo || r.id,
    subFn: r => [r.type, r.seller, r.buyer].filter(Boolean).join(' · '),
    kvFields: ['invoiceDate', 'type', 'seller', 'buyer', 'amount', 'taxRate', 'taxAmount', 'totalAmount'],
    autoTax: { amountField: 'amount', rateField: 'taxRate', taxTarget: 'taxAmount', totalTarget: 'totalAmount' },
    fields: [
      { k: 'invoiceDate', label: '登记日期', type: 'date', defaultToday: true },
      { k: 'type', label: '发票类型', type: 'select', options: ['进项', '销项'], defaultValue: '销项', required: true },
      { k: 'invoiceNo', label: '发票号码', type: 'text', required: true },
      { k: 'seller', label: '销售方', type: 'text' },
      { k: 'buyer', label: '购买方', type: 'text' },
      { k: 'amount', label: '不含税金额', type: 'number', money: true },
      { k: 'taxRate', label: '税率(%)', type: 'number' },
      { k: 'taxAmount', label: '税额', type: 'number', money: true },
      { k: 'totalAmount', label: '价税合计', type: 'number', money: true },
      { k: 'remarks', label: '备注', type: 'textarea' }
    ]
  },
  {
    key: 'calendarEvents', title: '日历记事', icon: '📅', color: '#AF52DE', idPrefix: 'EV',
    stat: 'count', statLabel: '记事',
    statuses: ['待办', '已完成'], statusDefault: '待办',
    statusColors: { '待办': 'tag-orange', '已完成': 'tag-green' },
    searchKeys: ['title', 'startDate', 'location'],
    titleFn: r => r.title || r.id,
    subFn: r => [r.startDate, r.time, r.location].filter(Boolean).join(' · '),
    kvFields: ['startDate', 'endDate', 'time', 'endTime', 'reminder', 'location'],
    fields: [
      { k: 'title', label: '事项', type: 'text', required: true },
      { k: 'startDate', label: '开始日期', type: 'date', defaultToday: true },
      { k: 'endDate', label: '结束日期', type: 'date' },
      { k: 'time', label: '开始时间', type: 'text', placeholder: '如 09:30' },
      { k: 'endTime', label: '结束时间', type: 'text' },
      { k: 'reminder', label: '提醒', type: 'select', options: ['不提醒', '准时', '15分钟前', '30分钟前', '1小时前', '1天前'], defaultValue: '不提醒' },
      { k: 'location', label: '地点', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['待办', '已完成'], defaultValue: '待办' },
      { k: 'notes', label: '备注', type: 'textarea' }
    ]
  },
  /* ===== 全局资料（不按公司隔离，scoped:false） ===== */
  {
    key: 'contacts', title: '通讯录', icon: '👥', color: '#6366F1', idPrefix: 'CT',
    scoped: false,
    stat: 'count', statLabel: '联系人',
    searchKeys: ['name', 'businessType', 'contactPerson', 'phone'],
    titleFn: r => r.name || r.id,
    subFn: r => [r.businessType, r.contactPerson].filter(Boolean).join(' · '),
    kvFields: ['businessType', 'contactPerson', 'phone', 'address'],
    fields: [
      { k: 'name', label: '单位名称', type: 'text', required: true },
      { k: 'businessType', label: '类型', type: 'select', options: ['供应商', '客户', '工厂', '物流', '其他'], defaultValue: '客户', required: true },
      { k: 'contactPerson', label: '联系人', type: 'text' },
      { k: 'position', label: '职位', type: 'text' },
      { k: 'phone', label: '电话', type: 'text' },
      { k: 'email', label: '邮箱', type: 'text' },
      { k: 'website', label: '网址', type: 'text' },
      { k: 'address', label: '地址', type: 'text' },
      { k: 'bankAddress', label: '开户行', type: 'text' },
      { k: 'bankCode', label: '行号/SWIFT', type: 'text' },
      { k: 'bankAccount', label: '银行账号', type: 'text' }
    ]
  },
  {
    key: 'memos', title: '备忘录', icon: '📝', color: '#8B5CF6', idPrefix: 'MEMO',
    scoped: false,
    stat: 'count', statLabel: '备忘',
    statuses: ['待办', '进行中', '已完成'], statusDefault: '进行中',
    statusColors: { '待办': 'tag-gray', '进行中': 'tag-orange', '已完成': 'tag-green' },
    searchKeys: ['title', 'content', 'tags'],
    titleFn: r => r.title || (r.content || '').slice(0, 24) || r.id,
    subFn: r => [r.priority, r.tags].filter(Boolean).join(' · '),
    kvFields: ['priority', 'tags', 'status'],
    fields: [
      { k: 'title', label: '标题', type: 'text', required: true },
      { k: 'content', label: '内容', type: 'textarea', required: true },
      { k: 'priority', label: '优先级', type: 'select', options: ['高', '中', '低'], defaultValue: '中' },
      { k: 'tags', label: '标签', type: 'text' },
      { k: 'status', label: '状态', type: 'select', options: ['待办', '进行中', '已完成'], defaultValue: '进行中' }
    ]
  },
  {
    key: 'gradeComparisons', title: '材质对照', icon: '🔩', color: '#0F766E', idPrefix: 'GR',
    scoped: false,
    stat: 'count', statLabel: '材质牌号',
    searchKeys: ['grade', 'gbOld', 'gbNew', 'uns', 'astm', 'jis', 'din'],
    titleFn: r => r.grade || r.id,
    subFn: r => [r.gbNew, r.astm].filter(Boolean).join(' / '),
    kvFields: ['grade', 'gbOld', 'gbNew', 'astm', 'jis', 'density'],
    fields: [
      { k: 'grade', label: '牌号', type: 'text', required: true },
      { k: 'gbOld', label: '旧国标 GB', type: 'text' },
      { k: 'gbNew', label: '新国标 GB', type: 'text' },
      { k: 'uns', label: 'UNS(美)', type: 'text' },
      { k: 'astm', label: 'ASTM(美)', type: 'text' },
      { k: 'sae', label: 'SAE(美)', type: 'text' },
      { k: 'jis', label: 'JIS(日)', type: 'text' },
      { k: 'ks', label: 'KS(韩)', type: 'text' },
      { k: 'din', label: 'DIN(德)', type: 'text' },
      { k: 'nf', label: 'NF(法)', type: 'text' },
      { k: 'bs', label: 'BS(英)', type: 'text' },
      { k: 'en', label: 'EN(欧)', type: 'text' },
      { k: 'iso', label: 'ISO', type: 'text' },
      { k: 'density', label: '密度(g/cm³)', type: 'number' },
      { k: 'composition', label: '化学成分', type: 'textarea' }
    ]
  },
  {
    key: 'vocabularies', title: '钢材英语', icon: '🔤', color: '#0284C7', idPrefix: 'VO',
    scoped: false,
    stat: 'count', statLabel: '词汇',
    searchKeys: ['english', 'chinese', 'phonetic', 'categoryEn'],
    titleFn: r => r.english || r.id,
    subFn: r => r.chinese || '',
    kvFields: ['phonetic', 'chinese', 'categoryEn'],
    fields: [
      { k: 'english', label: 'English', type: 'text', required: true },
      { k: 'phonetic', label: '音标', type: 'text' },
      { k: 'chinese', label: '中文', type: 'text', required: true },
      { k: 'categoryEn', label: '分类', type: 'text' }
    ]
  },
  {
    key: 'hscodes', title: 'HS编码/标准', icon: '📚', color: '#7C3AED', idPrefix: 'HS',
    scoped: false,
    stat: 'count', statLabel: '编码',
    searchKeys: ['productName', 'productNameEn', 'hscode', 'standard'],
    titleFn: r => r.productName || r.id,
    subFn: r => r.hscode || '',
    kvFields: ['hscode', 'standard', 'productNameEn'],
    fields: [
      { k: 'productName', label: '产品名称', type: 'text', required: true },
      { k: 'productNameEn', label: '英文名称', type: 'text' },
      { k: 'hscode', label: 'HS 编码', type: 'text', required: true },
      { k: 'standard', label: '国标', type: 'text' },
      { k: 'standardEn', label: '国际标准', type: 'text' },
      { k: 'techRequirements', label: '技术要求', type: 'textarea' },
      { k: 'techRequirementsEn', label: '英文技术要求', type: 'textarea' },
      { k: 'note', label: '备注', type: 'textarea' },
      { k: 'noteEn', label: '英文备注', type: 'textarea' },
      { k: 'descriptionEn', label: '英文描述', type: 'textarea' }
    ]
  },
  {
    key: 'calculationParams', title: '理算参数', icon: '🧮', color: '#DB2777', idPrefix: 'CP',
    scoped: false,
    stat: 'count', statLabel: '公式',
    searchKeys: ['serial', 'title'],
    titleFn: r => (r.serial ? r.serial + '. ' : '') + (r.title || r.id),
    subFn: r => r.formula || '',
    kvFields: ['serial', 'title', 'formula'],
    fields: [
      { k: 'serial', label: '序号', type: 'text', required: true },
      { k: 'title', label: '标题', type: 'text', required: true },
      { k: 'formula', label: '计算公式', type: 'textarea' },
      { k: 'example', label: '示例', type: 'textarea' }
    ]
  }
];

/* stainless 同步云键：全局 + 三家公司作用域 */
const STAINLESS_SYNC_KEYS = STAINLESS_GLOBAL_KEYS.slice()
  .concat(STAINLESS_COMPANY_IDS.reduce((acc, cid) =>
    acc.concat(STAINLESS_SCOPED_KEYS.map(k => cid + '__' + k)), []));

/* ================================================================
 * 项目定义
 * ================================================================ */
const PROJECTS = [
  {
    dir: 'saintysys-mp',
    appName: '服装外贸系统',
    appNameEn: 'SAINTY GARMENT EXPORT',
    projectName: 'saintysys-miniprogram',
    title: '服装外贸小程序（与网页版 apps/saintysys 共用 CloudBase 后端）',
    company: 'SAINTY 服装外贸',
    companyEn: 'SAINTY GARMENT EXPORT SYSTEM',
    appid: 'touristappid',
    keys: SAINTY_MODULES.map(m => m.key).concat(SAINTY_EXTRA_KEYS),
    cloudPrefix: '',
    fileRoot: '',
    brand: { a: '#EC4899', b: '#BE185D', shadow: 'rgba(236, 72, 153, 0.30)', bg: '#FDF2F8' },
    modules: SAINTY_MODULES,
    // 对象型键的默认值（数组型键默认 [] 由构建流程自动补）
    objectDefaults: { fashion_quotation_settings: DEFAULT_QUOTE_SETTINGS },
    overlay: '_sainty',
    pagesExtra: ['pages/quote-list/quote-list', 'pages/quote-edit/quote-edit'],
    // 首页宫格额外入口（非通用模块页）
    homeExtra: [
      { key: 'fashion_quotations', title: '报价系统', icon: '📑', color: '#004D6D',
        url: '/pages/quote-list/quote-list', stat: 'count', statLabel: '份报价' }
    ]
  },
  {
    dir: 'stainless-mp',
    appName: '不锈钢业务管理',
    appNameEn: 'STAINLESS STEEL BUSINESS',
    projectName: 'stainless-miniprogram',
    title: '不锈钢贸易小程序（与网页版 apps/stainlessbusiness 共用 CloudBase 后端）',
    company: '不锈钢业务管理系统',
    companyEn: 'STAINLESS STEEL BUSINESS SYSTEM',
    appid: 'touristappid',
    keys: STAINLESS_SYNC_KEYS,
    cloudPrefix: 'stainlessbusiness__',
    fileRoot: 'stainlessbusiness',
    brand: { a: '#0EA5E9', b: '#0369A1', shadow: 'rgba(14, 165, 233, 0.30)', bg: '#F0F9FF' },
    modules: STAINLESS_MODULES,
    overlay: '_stainless',
    cleanPages: true,
    pagesExtra: ['pages/contract/contract', 'pages/stats/stats']
  }
];

/* ================================================================
 * 覆盖层（_stainless）拷贝 + 占位符替换
 * ================================================================ */
function overlayTokens(P, c) {
  return c
    .replace('@APP_TITLE@', ' * ' + P.title)
    .replace('@@APP_NAME@@', P.appName)
    .replaceAll('@APP_NAME@', P.appName)
    .replaceAll('@APP_NAME_EN@', P.appNameEn)
    .replaceAll('@COMPANY@', P.company)
    .replaceAll('@COMPANY_EN@', P.companyEn)
    .replaceAll('@BRAND_A@', P.brand.a)
    .replaceAll('@BRAND_B@', P.brand.b)
    .replaceAll('@BRAND_SHADOW@', P.brand.shadow)
    .replaceAll('@BRAND_BG@', P.brand.bg);
}

/**
 * 模块 schema → JS 源码。
 * JSON.stringify 会丢弃 titleFn/subFn 等函数，这里用占位符保留函数体。
 */
function schemaSource(m) {
  const fns = [];
  const json = JSON.stringify(m, (k, v) => {
    if (typeof v === 'function') {
      fns.push(v.toString());
      return 'FNPLACEHOLDER' + (fns.length - 1) + '';
    }
    return v;
  }, 2);
  return json.replace(/"FNPLACEHOLDER(\d+)"/g, (_, i) => fns[Number(i)]);
}

function copyOverlay(P) {
  if (!P.overlay) return;
  const srcRoot = path.join(ROOT, P.overlay);
  const dstRoot = path.join(ROOT, P.dir);
  const TEXT_EXT = new Set(['.js', '.json', '.wxml', '.wxss', '.wxs', '.css', '.txt']);
  const modulesJson = (P.modules || []).map(m => ({
    key: m.key, title: m.title, icon: m.icon, color: m.color,
    url: '/pages/' + m.key + '/' + m.key,
    stat: m.stat || 'count', sumField: m.sumField || '', statLabel: m.statLabel || ''
  })).concat((P.homeExtra || []).map(m => ({
    key: m.key, title: m.title, icon: m.icon, color: m.color, url: m.url,
    stat: m.stat || 'count', sumField: m.sumField || '', statLabel: m.statLabel || ''
  })));
  function walk(dir, rel) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(ent => {
      const src = path.join(dir, ent.name);
      const relPath = rel ? rel + '/' + ent.name : ent.name;
      // 模块页模板只供构建时复制到各模块目录，不作为页面进入产物
      if (relPath === 'pages/_module' || relPath.indexOf('pages/_module/') === 0) return;
      if (ent.isDirectory()) { walk(src, relPath); return; }
      const dst = path.join(dstRoot, relPath);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const ext = path.extname(ent.name).toLowerCase();
      if (TEXT_EXT.has(ext)) {
        fs.writeFileSync(dst,
          overlayTokens(P, fs.readFileSync(src, 'utf8'))
            .replace('@@MODULES_JSON@@', JSON.stringify(modulesJson, null, 2))
        );
      } else {
        fs.copyFileSync(src, dst); // 图片等二进制资源
      }
      console.log('  ~ ' + P.dir + '/' + relPath);
    });
  }
  walk(srcRoot, '');
}

/* ================================================================
 * 构建
 * ================================================================ */
function buildProject(P) {
  console.log('\n========== 构建 ' + P.dir + ' ==========');
  const D = P.dir + '/';

  // 覆盖层项目：清理旧页面目录，避免已废弃模块残留被打包
  if (P.cleanPages) {
    const pagesDir = path.join(ROOT, D + 'pages');
    fs.rmSync(pagesDir, { recursive: true, force: true });
  }

  // ---- utils/cloudbase.js ----
  write(D + 'utils/cloudbase.js',
    read('utils/cloudbase.js')
      .replace('@APP_TITLE@', ' * ' + P.title)
      .replace('@NS_JSON@', JSON.stringify({ app: P.keys }))
      .replace('@PREFIX_JSON@', JSON.stringify({ app: P.cloudPrefix }))
  );

  // ---- utils/cb-files.js ----
  write(D + 'utils/cb-files.js',
    read('utils/cb-files.js')
      .replace(/const APP_ROOTS = \{[\s\S]*?\};/, 'const APP_ROOTS = ' + JSON.stringify({ main: P.fileRoot }) + ';')
      .replace('function rootOf(app) {\n  return APP_ROOTS[app] || String(app || \'files\');\n}',
               'function rootOf(app) {\n  return APP_ROOTS[app] !== undefined ? APP_ROOTS[app] : String(app || \'files\');\n}')
  );

  // ---- utils/db.js（若覆盖层提供 db.js，稍后会被覆盖） ----
  const defaults = {};
  P.keys.forEach(k => { defaults[k] = []; });
  Object.assign(defaults, P.objectDefaults || {});
  write(D + 'utils/db.js',
    read('utils/db.js').replace('@@DEFAULTS_JSON@@', JSON.stringify(defaults))
  );

  // ---- utils/format.js / list-page.js（覆盖层稍后可能覆盖） ----
  write(D + 'utils/format.js', read('utils/format.js'));
  write(D + 'utils/list-page.js', read('utils/list-page.js'));

  // ---- app.js ----（含首页额外入口 homeExtra，如报价系统） ----
  const modulesJson = P.modules.map(m => ({
    key: m.key, title: m.title, icon: m.icon, color: m.color,
    url: '/pages/' + m.key + '/' + m.key,
    stat: m.stat || 'count', sumField: m.sumField || '', statLabel: m.statLabel || ''
  })).concat((P.homeExtra || []).map(m => ({
    key: m.key, title: m.title, icon: m.icon, color: m.color, url: m.url,
    stat: m.stat || 'count', sumField: m.sumField || '', statLabel: m.statLabel || ''
  })));
  write(D + 'app.js',
    read('app.js')
      .replace('@APP_TITLE@', P.title)
      .replace('@@APP_NAME@@', P.appName) // 防止注释里占位
      .replace("@APP_NAME@", P.appName)
      .replace('@APP_NAME_EN@', P.appNameEn)
      .replace('@@MODULES_JSON@@', JSON.stringify(modulesJson, null, 2))
  );

  // ---- app.json ----
  const pages = [
    'pages/login/login', 'pages/home/home',
    ...(P.pagesExtra || []),
    'pages/backup/backup',
    'pages/cloudfiles/cloudfiles',
    ...P.modules.map(m => 'pages/' + m.key + '/' + m.key)
  ];
  write(D + 'app.json', JSON.stringify({
    pages: pages,
    window: {
      navigationBarBackgroundColor: '#F7F7F9',
      navigationBarTitleText: P.appName,
      navigationBarTextStyle: 'black',
      backgroundColor: '#F2F2F7',
      backgroundTextStyle: 'dark'
    },
    lazyCodeLoading: 'requiredComponents',
    style: 'v2',
    sitemapLocation: 'sitemap.json'
  }, null, 2));

  // ---- app.wxss（品牌色） ----
  write(D + 'app.wxss',
    read('app.wxss')
      .replaceAll('@APP_NAME@', P.appName)
      .replaceAll('@BRAND_A@', P.brand.a)
      .replaceAll('@BRAND_B@', P.brand.b)
      .replaceAll('@BRAND_SHADOW@', P.brand.shadow)
  );

  // ---- sitemap / project.config ----
  write(D + 'sitemap.json', read('sitemap.json'));
  write(D + 'project.config.json',
    read('project.config.json')
      .replace('@APP_NAME@', P.appName)
      .replace('@APPID@', P.appid)
      .replace('@PROJECT_NAME@', P.projectName)
  );

  // ---- 登录页 ----
  ['login.js', 'login.wxml', 'login.wxss', 'login.json'].forEach(f => {
    let c = read('pages/login/' + f);
    c = c.replaceAll('@APP_NAME@', P.appName)
         .replaceAll('@APP_NAME_EN@', P.appNameEn)
         .replaceAll('@BRAND_A@', P.brand.a)
         .replaceAll('@BRAND_B@', P.brand.b)
         .replaceAll('@BRAND_BG@', P.brand.bg);
    write(D + 'pages/login/' + f, c);
  });

  // ---- 首页（覆盖层稍后可能覆盖） ----
  ['home.js', 'home.wxml', 'home.json', 'home.wxss'].forEach(f => {
    let c = read('pages/home/' + f);
    c = c.replaceAll('@APP_NAME@', P.appName)
         .replaceAll('@APP_NAME_EN@', P.appNameEn)
         .replaceAll('@COMPANY@', P.company)
         .replaceAll('@COMPANY_EN@', P.companyEn);
    write(D + 'pages/home/' + f, c);
  });

  // ---- 备份页 ----
  ['backup.js', 'backup.wxml', 'backup.json', 'backup.wxss'].forEach(f => write(D + 'pages/backup/' + f, read('pages/backup/' + f)));

  // ---- 云存储文件中心 ----
  ['cloudfiles.js', 'cloudfiles.wxml', 'cloudfiles.wxss', 'cloudfiles.json'].forEach(f => {
    let c = read('pages/cloudfiles/' + f);
    if (f === 'cloudfiles.js') {
      c = c.replace(/const TITLES = \{[\s\S]*?\};/, 'const TITLES = ' + JSON.stringify({ main: P.appName + ' · 云存储' }) + ';');
    }
    write(D + 'pages/cloudfiles/' + f, c);
  });

  // ---- 业务模块页（覆盖层提供模块模板时优先使用） ----
  P.modules.forEach(m => {
    const md = D + 'pages/' + m.key + '/';
    write(md + 'schema.js',
      '/** ' + m.title + ' 模块配置（构建脚本生成） */\nmodule.exports = ' + schemaSource(m) + ';\n');
    write(md + m.key + '.js',
      "Page(require('../../utils/list-page')(require('./schema')));\n");
    const overlayMWxml = P.overlay && fs.existsSync(path.join(ROOT, P.overlay, 'pages/_module/m.wxml'));
    if (overlayMWxml) {
      write(md + m.key + '.wxml', readIn(P.overlay, 'pages/_module/m.wxml'));
      write(md + m.key + '.wxss', readIn(P.overlay, 'pages/_module/m.wxss'));
    } else {
      write(md + m.key + '.wxml', read('pages/_module/m.wxml'));
      write(md + m.key + '.wxss', read('pages/_module/m.wxss'));
    }
    write(md + m.key + '.json', read('pages/_module/m.json').replace('@MODULE_TITLE@', m.title));
  });

  // ---- 覆盖层（最后执行，覆盖 db.js / app.js / 首页 / 工具与新页面、图片） ----
  copyOverlay(P);

  // ---- README ----
  write(D + 'README.md', readme(P));
}

function readme(P) {
  return `# ${P.appName}（微信小程序）

${P.company} · 独立小程序项目，与网页版（Onlineofficework）**共用同一个腾讯 CloudBase 后端**，手机/电脑双端数据自动同步。

## 功能模块

${P.modules.map(m => '- ' + m.icon + ' **' + m.title + '**（' + m.key + '）').join('\n')}
- ☁️ **云存储**：文件上传/预览/下载（CloudBase 云存储，云端路径 \`${P.fileRoot || '桶根目录'}\`）
- 💾 **数据备份**：导出 JSON / 导入恢复 / 手动云同步
- 🔐 **统一登录**：CloudBase 邮箱/用户名 + 密码（与网页版同一账号体系）

## 云端数据

- 后端：CloudBase PostgreSQL 模式，环境 \`onlineofficework-d4e93l98bdf879e\`（ap-shanghai）
- 表：\`app_data_store\`（PG 行形态 \`{id, data:{store_key, payload, updated_at}}\`，\`id = store_key\`）
- 键前缀：\`${P.cloudPrefix || '（无前缀，裸键）'}\`
- 同步：启动/下拉/回前台自动拉取合并；每次保存自动推送（失败自动重试，绝不丢本地写入）

## 部署步骤

1. **注册小程序**：微信公众平台注册独立小程序，把 appid 填入 \`project.config.json\`
2. **配置合法域名**：公众平台 → 开发设置 → request 合法域名，添加：
   \`https://onlineofficework-d4e93l98bdf879e.api.tcloudbasegateway.com\`
   （每月可修改 50 次；开发期可在开发者工具勾选"不校验合法域名"）
3. **打开项目**：微信开发者工具导入本目录，编译预览
4. **登录**：使用网页版同款 CloudBase 账号登录（账号在 CloudBase 控制台 → 身份认证中管理）

## 目录结构

\`\`\`
utils/cloudbase.js    CloudBase 适配器（鉴权 + 数据同步 + 登录）
utils/db.js           数据层（本地 storage + 云同步，LWW 冲突裁决）
utils/list-page.js    通用列表页工厂（schema 驱动：搜索/筛选/增删改）
utils/cb-files.js     云存储文件中心
pages/<module>/       各业务模块（schema.js + 通用页面模板）
pages/login/          统一登录
pages/home/           首页（统计 + 模块入口）
pages/cloudfiles/     云存储
pages/backup/         数据备份
\`\`\`

## 新增/修改业务模块

编辑对应 \`pages/<module>/schema.js\` 即可：字段、类型、必填、状态选项、
自动计算（数量×单价）等全部由 schema 驱动，无需改动页面代码。
`;
}

PROJECTS.forEach(buildProject);
console.log('\n✅ 全部构建完成');
