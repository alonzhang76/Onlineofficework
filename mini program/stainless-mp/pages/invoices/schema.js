/** 发票登记 模块配置（构建脚本生成） */
module.exports = {
  "key": "invoices",
  "title": "发票登记",
  "icon": "🧾",
  "color": "#F59E0B",
  "idPrefix": "IV",
  "stat": "sum",
  "sumField": "totalAmount",
  "statLabel": "价税合计(元)",
  "statuses": [
    "进项",
    "销项"
  ],
  "statusDefault": "销项",
  "statusColors": {
    "进项": "tag-blue",
    "销项": "tag-orange"
  },
  "searchKeys": [
    "invoiceDate",
    "invoiceNo",
    "seller",
    "buyer",
    "type"
  ],
  "titleFn": r => r.invoiceNo || r.id,
  "subFn": r => [r.type, r.seller, r.buyer].filter(Boolean).join(' · '),
  "kvFields": [
    "invoiceDate",
    "type",
    "seller",
    "buyer",
    "amount",
    "taxRate",
    "taxAmount",
    "totalAmount"
  ],
  "autoTax": {
    "amountField": "amount",
    "rateField": "taxRate",
    "taxTarget": "taxAmount",
    "totalTarget": "totalAmount"
  },
  "fields": [
    {
      "k": "invoiceDate",
      "label": "登记日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "type",
      "label": "发票类型",
      "type": "select",
      "options": [
        "进项",
        "销项"
      ],
      "defaultValue": "销项",
      "required": true
    },
    {
      "k": "invoiceNo",
      "label": "发票号码",
      "type": "text",
      "required": true
    },
    {
      "k": "seller",
      "label": "销售方",
      "type": "text"
    },
    {
      "k": "buyer",
      "label": "购买方",
      "type": "text"
    },
    {
      "k": "amount",
      "label": "不含税金额",
      "type": "number",
      "money": true
    },
    {
      "k": "taxRate",
      "label": "税率(%)",
      "type": "number"
    },
    {
      "k": "taxAmount",
      "label": "税额",
      "type": "number",
      "money": true
    },
    {
      "k": "totalAmount",
      "label": "价税合计",
      "type": "number",
      "money": true
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
