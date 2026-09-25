/** 报价单 模块配置（构建脚本生成） */
module.exports = {
  "key": "quotations",
  "title": "报价单",
  "icon": "💰",
  "color": "#10B981",
  "idPrefix": "QT",
  "stat": "count",
  "statLabel": "报价单",
  "statuses": [
    "待报价",
    "已报价",
    "已成交",
    "已关闭"
  ],
  "statusDefault": "待报价",
  "statusColors": {
    "待报价": "tag-gray",
    "已报价": "tag-blue",
    "已成交": "tag-green",
    "已关闭": "tag-gray"
  },
  "searchKeys": [
    "inquiryNo",
    "customer",
    "supplier",
    "product",
    "material"
  ],
  "titleFn": r => r.inquiryNo || r.id,
  "subFn": r => [r.customer, r.supplier].filter(Boolean).join(' · '),
  "kvFields": [
    "product",
    "specification",
    "quantity",
    "weight",
    "unitPrice",
    "purchasePrice",
    "profitMargin"
  ],
  "autoDiff": {
    "aField": "unitPrice",
    "bField": "purchasePrice",
    "target": "profitMargin",
    "money": true
  },
  "fields": [
    {
      "k": "inquiryNo",
      "label": "询价/报价单号",
      "type": "text",
      "required": true
    },
    {
      "k": "quotationDate",
      "label": "报价日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "validUntil",
      "label": "有效期至",
      "type": "date"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待报价",
        "已报价",
        "已成交",
        "已关闭"
      ],
      "defaultValue": "待报价"
    },
    {
      "k": "customer",
      "label": "客户",
      "type": "text"
    },
    {
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "product",
      "label": "产品",
      "type": "text"
    },
    {
      "k": "material",
      "label": "材质",
      "type": "text"
    },
    {
      "k": "specification",
      "label": "规格",
      "type": "text"
    },
    {
      "k": "quantity",
      "label": "数量",
      "type": "number"
    },
    {
      "k": "unit",
      "label": "单位",
      "type": "select",
      "options": [
        "公斤",
        "吨",
        "件",
        "支",
        "米"
      ]
    },
    {
      "k": "weight",
      "label": "重量",
      "type": "number"
    },
    {
      "k": "weightUnit",
      "label": "重量单位",
      "type": "select",
      "options": [
        "公斤",
        "吨"
      ],
      "defaultValue": "公斤"
    },
    {
      "k": "unitPrice",
      "label": "报价(元)",
      "type": "number",
      "money": true
    },
    {
      "k": "purchasePrice",
      "label": "采购价(元)",
      "type": "number",
      "money": true
    },
    {
      "k": "profitMargin",
      "label": "单位毛利(元)",
      "type": "number",
      "money": true
    },
    {
      "k": "description",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
