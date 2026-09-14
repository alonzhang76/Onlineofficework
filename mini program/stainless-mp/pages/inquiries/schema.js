/** 询价单 模块配置（构建脚本生成） */
module.exports = {
  "key": "inquiries",
  "title": "询价单",
  "icon": "📨",
  "color": "#F59E0B",
  "idPrefix": "INQ",
  "stat": "count",
  "statLabel": "询价单",
  "statuses": [
    "待回复",
    "已回复",
    "已成交",
    "已关闭"
  ],
  "statusDefault": "待回复",
  "statusColors": {
    "待回复": "tag-gray",
    "已回复": "tag-blue",
    "已成交": "tag-green",
    "已关闭": "tag-gray"
  },
  "searchKeys": [
    "inquiryNo",
    "supplier",
    "customer",
    "material"
  ],
  "kvFields": [
    "product",
    "material",
    "specification",
    "quantity",
    "targetPrice",
    "dueDate",
    "status"
  ],
  "fields": [
    {
      "k": "inquiryNo",
      "label": "询价单号",
      "type": "text",
      "required": true
    },
    {
      "k": "inquiryDate",
      "label": "询价日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "dueDate",
      "label": "回复期限",
      "type": "date"
    },
    {
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "customer",
      "label": "客户",
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
      "k": "targetPrice",
      "label": "目标价",
      "type": "number",
      "money": true
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待回复",
        "已回复",
        "已成交",
        "已关闭"
      ],
      "defaultValue": "待回复"
    },
    {
      "k": "description",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
