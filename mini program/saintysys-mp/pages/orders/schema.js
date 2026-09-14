/** 订单管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "orders",
  "title": "订单管理",
  "icon": "📋",
  "color": "#34C759",
  "idPrefix": "ORD",
  "stat": "sum",
  "sumField": "totalAmount",
  "statLabel": "订单总额(元)",
  "statuses": [
    "草稿",
    "已确认",
    "生产中",
    "已完成",
    "已出货"
  ],
  "statusDefault": "草稿",
  "statusColors": {
    "草稿": "tag-gray",
    "已确认": "tag-blue",
    "生产中": "tag-orange",
    "已完成": "tag-teal",
    "已出货": "tag-green"
  },
  "searchKeys": [
    "orderNo",
    "styleNo",
    "remark"
  ],
  "kvFields": [
    "styleNo",
    "quantity",
    "unitPrice",
    "totalAmount",
    "etd",
    "shipMethod"
  ],
  "autoSum": {
    "qtyField": "quantity",
    "priceField": "unitPrice",
    "target": "totalAmount",
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
      "label": "Style No. 款号",
      "type": "text",
      "required": true
    },
    {
      "k": "customerId",
      "label": "客户",
      "type": "contact"
    },
    {
      "k": "orderDate",
      "label": "下单日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "season",
      "label": "季节",
      "type": "select",
      "options": [
        "春夏",
        "秋冬",
        "四季"
      ]
    },
    {
      "k": "fabricComposition",
      "label": "面料成分",
      "type": "text"
    },
    {
      "k": "quantity",
      "label": "数量",
      "type": "number"
    },
    {
      "k": "unitPrice",
      "label": "单价",
      "type": "number",
      "money": true
    },
    {
      "k": "totalAmount",
      "label": "总金额",
      "type": "number",
      "money": true
    },
    {
      "k": "shipMethod",
      "label": "运输方式",
      "type": "select",
      "options": [
        "海运",
        "空运",
        "快递",
        "陆运"
      ]
    },
    {
      "k": "etd",
      "label": "ETD 预计出货",
      "type": "date"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "草稿",
        "已确认",
        "生产中",
        "已完成",
        "已出货"
      ],
      "defaultValue": "草稿"
    },
    {
      "k": "remark",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
