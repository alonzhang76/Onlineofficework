/** 发票管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "invoices",
  "title": "发票管理",
  "icon": "🧾",
  "color": "#F59E0B",
  "idPrefix": "IV",
  "stat": "count",
  "statLabel": "发票记录",
  "statuses": [
    "待开票",
    "已开票",
    "已寄出",
    "已认证"
  ],
  "statusDefault": "待开票",
  "statusColors": {
    "待开票": "tag-gray",
    "已开票": "tag-blue",
    "已寄出": "tag-orange",
    "已认证": "tag-green"
  },
  "searchKeys": [
    "invoiceNo",
    "orderNo",
    "styleNo"
  ],
  "kvFields": [
    "orderNo",
    "invoiceDate",
    "amount",
    "currency",
    "status"
  ],
  "fields": [
    {
      "k": "invoiceNo",
      "label": "发票号",
      "type": "text",
      "required": true
    },
    {
      "k": "orderNo",
      "label": "PO 订单号",
      "type": "text"
    },
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "invoiceDate",
      "label": "开票日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "amount",
      "label": "金额",
      "type": "number",
      "money": true,
      "required": true
    },
    {
      "k": "currency",
      "label": "币种",
      "type": "select",
      "options": [
        "USD",
        "EUR",
        "GBP",
        "JPY",
        "RMB"
      ],
      "defaultValue": "USD"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待开票",
        "已开票",
        "已寄出",
        "已认证"
      ],
      "defaultValue": "待开票"
    }
  ]
};
