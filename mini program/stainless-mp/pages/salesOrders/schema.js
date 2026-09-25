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
    "product",
    "material",
    "specification",
    "contractNo"
  ],
  "titleFn": r => r.orderNo || r.id,
  "subFn": r => [r.customer, r.contractNo ? '合同:' + r.contractNo : ''].filter(Boolean).join(' · '),
  "kvFields": [
    "product",
    "material",
    "specification",
    "quantity",
    "weight",
    "weightAdjustment",
    "totalAmount",
    "deliveryDate"
  ],
  "autoSum": {
    "qtyField": "weight",
    "adjustField": "weightAdjustment",
    "priceField": "price",
    "target": "totalAmount",
    "money": true
  },
  "action": {
    "label": "生成销售合同",
    "url": "/pages/contract/contract",
    "query": "type=sales"
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
      "k": "contractNo",
      "label": "合同号",
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
      "k": "heatNo",
      "label": "炉号",
      "type": "text"
    },
    {
      "k": "warrantyNo",
      "label": "质保书号码",
      "type": "text"
    },
    {
      "k": "inventoryNo",
      "label": "坯料产地",
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
      "label": "订单重量",
      "type": "number"
    },
    {
      "k": "weightAdjustment",
      "label": "损/溢重量(±)",
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
      "label": "单价(元)",
      "type": "number",
      "money": true
    },
    {
      "k": "totalAmount",
      "label": "总金额(元)",
      "type": "number",
      "money": true
    },
    {
      "k": "paymentTerms",
      "label": "付款方式",
      "type": "text"
    },
    {
      "k": "otherRequirements",
      "label": "其它要求",
      "type": "textarea"
    },
    {
      "k": "description",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
