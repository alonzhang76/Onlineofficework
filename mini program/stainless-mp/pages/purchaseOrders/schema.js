/** 采购订单 模块配置（构建脚本生成） */
module.exports = {
  "key": "purchaseOrders",
  "title": "采购订单",
  "icon": "🛒",
  "color": "#5856D6",
  "idPrefix": "PO",
  "stat": "sum",
  "sumField": "totalAmount",
  "statLabel": "采购总额(元)",
  "statuses": [
    "待处理",
    "待发货",
    "执行中",
    "执行完毕"
  ],
  "statusDefault": "待处理",
  "statusColors": {
    "待处理": "tag-gray",
    "待发货": "tag-blue",
    "执行中": "tag-orange",
    "执行完毕": "tag-green"
  },
  "searchKeys": [
    "orderNo",
    "supplier",
    "customer",
    "product",
    "material",
    "specification"
  ],
  "titleFn": r => r.orderNo || r.id,
  "subFn": r => [r.supplier, r.customer].filter(Boolean).join(' · '),
  "kvFields": [
    "product",
    "material",
    "specification",
    "quantity",
    "weight",
    "totalAmount",
    "expectedDate"
  ],
  "autoSum": {
    "qtyField": "weight",
    "priceField": "price",
    "target": "totalAmount",
    "money": true
  },
  "action": {
    "label": "生成采购合同",
    "url": "/pages/contract/contract",
    "query": "type=purchase"
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
      "k": "expectedDate",
      "label": "交货日期",
      "type": "date"
    },
    {
      "k": "supplier",
      "label": "供应商",
      "type": "text",
      "required": true
    },
    {
      "k": "customer",
      "label": "客户",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待处理",
        "待发货",
        "执行中",
        "执行完毕"
      ],
      "defaultValue": "待处理"
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
      "k": "inventoryNo",
      "label": "坯料产地",
      "type": "text"
    },
    {
      "k": "warrantyNo",
      "label": "质保书号",
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
      "k": "logisticsNo",
      "label": "物流单号",
      "type": "text"
    },
    {
      "k": "otherRequirements",
      "label": "其它要求",
      "type": "textarea"
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
