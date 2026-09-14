/** 快递物流 模块配置（构建脚本生成） */
module.exports = {
  "key": "express_delivery_data_v2",
  "title": "快递物流",
  "icon": "📦",
  "color": "#F97316",
  "idPrefix": "EX",
  "stat": "sum",
  "sumField": "cost",
  "statLabel": "快递费合计(元)",
  "searchKeys": [
    "tracking",
    "item",
    "styleNo",
    "company"
  ],
  "kvFields": [
    "tracking",
    "date",
    "weight",
    "cost",
    "toArea",
    "payType",
    "handler"
  ],
  "fields": [
    {
      "k": "date",
      "label": "日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "company",
      "label": "快递公司",
      "type": "select",
      "options": [
        "顺丰速运",
        "DHL",
        "FedEx",
        "UPS",
        "EMS",
        "申通",
        "圆通",
        "中通",
        "其他"
      ],
      "required": true
    },
    {
      "k": "tracking",
      "label": "运单号",
      "type": "text"
    },
    {
      "k": "item",
      "label": "物品",
      "type": "text"
    },
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "weight",
      "label": "重量(kg)",
      "type": "number"
    },
    {
      "k": "cost",
      "label": "费用",
      "type": "number",
      "money": true
    },
    {
      "k": "toArea",
      "label": "目的地",
      "type": "text"
    },
    {
      "k": "fromArea",
      "label": "发出地",
      "type": "text"
    },
    {
      "k": "payType",
      "label": "付费方式",
      "type": "select",
      "options": [
        "寄付",
        "到付",
        "月结"
      ]
    },
    {
      "k": "handler",
      "label": "经手人",
      "type": "text"
    },
    {
      "k": "remark",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
