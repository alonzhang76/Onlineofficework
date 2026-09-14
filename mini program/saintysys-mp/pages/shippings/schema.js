/** 出货管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "shippings",
  "title": "出货管理",
  "icon": "🚢",
  "color": "#0EA5E9",
  "idPrefix": "SH",
  "stat": "count",
  "statLabel": "出货单",
  "statuses": [
    "计划中",
    "已发运",
    "已到港",
    "已完成"
  ],
  "statusDefault": "计划中",
  "statusColors": {
    "计划中": "tag-gray",
    "已发运": "tag-orange",
    "已到港": "tag-blue",
    "已完成": "tag-green"
  },
  "searchKeys": [
    "shipNo",
    "orderNo",
    "styleNo",
    "buyer",
    "blNo"
  ],
  "kvFields": [
    "orderNo",
    "poNo",
    "quantity",
    "totalCtn",
    "etd",
    "eta",
    "blNo",
    "forwarder"
  ],
  "fields": [
    {
      "k": "shipNo",
      "label": "出货编号",
      "type": "text"
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
      "k": "buyer",
      "label": "买家",
      "type": "text"
    },
    {
      "k": "poNo",
      "label": "客户 PO",
      "type": "text"
    },
    {
      "k": "itemDesc",
      "label": "货品描述",
      "type": "text"
    },
    {
      "k": "packType",
      "label": "包装方式",
      "type": "text"
    },
    {
      "k": "quantity",
      "label": "数量",
      "type": "number"
    },
    {
      "k": "totalCtn",
      "label": "总箱数",
      "type": "number"
    },
    {
      "k": "volume",
      "label": "体积(m³)",
      "type": "number"
    },
    {
      "k": "etd",
      "label": "ETD 开船日",
      "type": "date"
    },
    {
      "k": "eta",
      "label": "ETA 到港日",
      "type": "date"
    },
    {
      "k": "blNo",
      "label": "提单号 B/L",
      "type": "text"
    },
    {
      "k": "forwarder",
      "label": "货代",
      "type": "text"
    },
    {
      "k": "customsNo",
      "label": "报关单号",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "计划中",
        "已发运",
        "已到港",
        "已完成"
      ],
      "defaultValue": "计划中"
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
