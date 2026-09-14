/** 销售退货 模块配置（构建脚本生成） */
module.exports = {
  "key": "salesReturnRecords",
  "title": "销售退货",
  "icon": "📤",
  "color": "#EF4444",
  "idPrefix": "SRT",
  "stat": "count",
  "statLabel": "退货记录",
  "searchKeys": [
    "orderNo",
    "customer",
    "material",
    "logisticsNo"
  ],
  "kvFields": [
    "returnDate",
    "deliveredWeight",
    "returnedWeight",
    "logisticsCost",
    "logisticsNo"
  ],
  "fields": [
    {
      "k": "returnDate",
      "label": "退货日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "orderNo",
      "label": "订单编号",
      "type": "text",
      "required": true
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
      "k": "deliveredWeight",
      "label": "发货重量",
      "type": "number"
    },
    {
      "k": "returnedWeight",
      "label": "退货重量",
      "type": "number"
    },
    {
      "k": "logisticsNo",
      "label": "物流单号",
      "type": "text"
    },
    {
      "k": "logisticsCost",
      "label": "物流费用",
      "type": "number",
      "money": true
    },
    {
      "k": "otherCost",
      "label": "其它费用",
      "type": "number",
      "money": true
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
