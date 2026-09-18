/** 收汇管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "collections",
  "title": "收汇管理",
  "icon": "💰",
  "color": "#10B981",
  "idPrefix": "COL",
  "stat": "sum",
  "sumField": "rmbAmount",
  "statLabel": "收汇合计(元)",
  "statuses": [
    "未收",
    "部分收汇",
    "已收汇"
  ],
  "statusDefault": "未收",
  "statusColors": {
    "未收": "tag-gray",
    "部分收汇": "tag-orange",
    "已收汇": "tag-green"
  },
  "searchKeys": [
    "orderNo",
    "styleNo"
  ],
  "titleFn": r => (r.orderNo || r.id) + (r.amount ? '  ' + r.amount : ''),
  "subFn": r => r.styleNo || '',
  "kvFields": [
    "styleNo",
    "amount",
    "currency",
    "exchangeRate",
    "rmbAmount",
    "type",
    "collectionDate"
  ],
  "autoSum": {
    "qtyField": "amount",
    "priceField": "exchangeRate",
    "target": "rmbAmount",
    "money": true
  },
  "fields": [
    {
      "k": "orderNo",
      "label": "PO 订单号",
      "type": "text",
      "required": true
    },
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "collectionDate",
      "label": "收汇日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "amount",
      "label": "收汇金额",
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
      "k": "exchangeRate",
      "label": "汇率",
      "type": "number"
    },
    {
      "k": "rmbAmount",
      "label": "人民币金额",
      "type": "number",
      "money": true
    },
    {
      "k": "type",
      "label": "款项类型",
      "type": "select",
      "options": [
        "定金",
        "尾款",
        "全款",
        "其他"
      ]
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "未收",
        "部分收汇",
        "已收汇"
      ],
      "defaultValue": "未收"
    }
  ]
};
