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
    "product",
    "material"
  ],
  "titleFn": r => r.inquiryNo || r.id,
  "subFn": r => [r.supplier, r.customer].filter(Boolean).join(' · '),
  "kvFields": [
    "product",
    "material",
    "specification",
    "quantity",
    "weight",
    "expectedPrice",
    "dueDate"
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
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "supplierContact",
      "label": "供应商联系人",
      "type": "text"
    },
    {
      "k": "supplierPhone",
      "label": "供应商电话",
      "type": "text"
    },
    {
      "k": "customer",
      "label": "客户",
      "type": "text"
    },
    {
      "k": "customerContact",
      "label": "客户联系人",
      "type": "text"
    },
    {
      "k": "customerPhone",
      "label": "客户电话",
      "type": "text"
    },
    {
      "k": "product",
      "label": "产品",
      "type": "text"
    },
    {
      "k": "materialCode",
      "label": "物料编码/图号",
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
      "k": "expectedPrice",
      "label": "期望价格",
      "type": "number",
      "money": true
    },
    {
      "k": "outerDiameter",
      "label": "外径",
      "type": "number"
    },
    {
      "k": "innerDiameter",
      "label": "内径",
      "type": "number"
    },
    {
      "k": "wallThickness",
      "label": "壁厚",
      "type": "number"
    },
    {
      "k": "width",
      "label": "宽度",
      "type": "number"
    },
    {
      "k": "height",
      "label": "高度",
      "type": "number"
    },
    {
      "k": "length",
      "label": "长度",
      "type": "number"
    },
    {
      "k": "thickness",
      "label": "厚度",
      "type": "number"
    },
    {
      "k": "sideLength",
      "label": "边长",
      "type": "number"
    },
    {
      "k": "diameter",
      "label": "直径",
      "type": "number"
    },
    {
      "k": "crossSectionArea",
      "label": "截面积(mm²)",
      "type": "number"
    },
    {
      "k": "description",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
