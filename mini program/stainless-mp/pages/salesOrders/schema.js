/** 销售订单 模块配置（构建脚本生成） */
module.exports = {
  "key": "salesOrders",
  "title": "销售订单",
  "icon": "💼",
  "color": "#007AFF",
  "idPrefix": "SO",
  "stat": "sum",
  "sumField": "totalAmount",
  "statLabel": "销售总额(元)",
  "statuses": [
    "待发货",
    "已发货",
    "已完成"
  ],
  "statusDefault": "待发货",
  "statusColors": {
    "待发货": "tag-orange",
    "已发货": "tag-blue",
    "已完成": "tag-green"
  },
  "searchKeys": [
    "orderNo",
    "customer",
    "material",
    "specification"
  ],
  "kvFields": [
    "product",
    "material",
    "specification",
    "quantity",
    "weight",
    "totalAmount",
    "deliveryDate"
  ],
  "autoSum": {
    "qtyField": "weight",
    "priceField": "price",
    "target": "totalAmount",
    "money": true
  },
  "fields": [
    {
      "k": "orderNo",
      "label": "订单编号",
      "type": "text",
      "required": true
    },
    {
      "k": "orderDate",
      "label": "下单日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "deliveryDate",
      "label": "交货日期",
      "type": "date"
    },
    {
      "k": "customer",
      "label": "客户",
      "type": "text",
      "required": true
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
      "k": "materialCode",
      "label": "物料编码/图号",
      "type": "text"
    },
    {
      "k": "specification",
      "label": "规格",
      "type": "text"
    },
    {
      "k": "otherRequirements",
      "label": "其它要求",
      "type": "textarea"
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
      "label": "订单重量",
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
      "k": "price",
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
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待发货",
        "已发货",
        "已完成"
      ],
      "defaultValue": "待发货"
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
