/** 采购收退货 模块配置（构建脚本生成） */
module.exports = {
  "key": "returnRecords",
  "title": "采购收退货",
  "icon": "📥",
  "color": "#10B981",
  "idPrefix": "RT",
  "stat": "count",
  "statLabel": "收退货记录",
  "searchKeys": [
    "returnDate",
    "orderNo",
    "supplier",
    "product",
    "logisticsNo"
  ],
  "titleFn": r => r.orderNo || r.id,
  "subFn": r => [r.supplier, r.product].filter(Boolean).join(' · '),
  "kvFields": [
    "returnDate",
    "receivedWeight",
    "returnedWeight",
    "logisticsCost",
    "otherCost",
    "logisticsNo"
  ],
  "fields": [
    {
      "k": "returnDate",
      "label": "收退货日期",
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
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "logisticsNo",
      "label": "物流单号",
      "type": "text"
    },
    {
      "k": "logistics",
      "label": "物流公司",
      "type": "text"
    },
    {
      "k": "carPlate",
      "label": "车牌号",
      "type": "text"
    },
    {
      "k": "driver",
      "label": "司机",
      "type": "text"
    },
    {
      "k": "driverPhone",
      "label": "司机电话",
      "type": "text"
    },
    {
      "k": "receivingAddress",
      "label": "收货地址",
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
      "k": "receivedWeight",
      "label": "收货重量",
      "type": "number"
    },
    {
      "k": "returnedWeight",
      "label": "退货重量",
      "type": "number"
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
      "k": "purchaseRemarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
