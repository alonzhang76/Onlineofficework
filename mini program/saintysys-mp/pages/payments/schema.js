/** 付款管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "payments",
  "title": "付款管理",
  "icon": "💳",
  "color": "#EF4444",
  "idPrefix": "PAY",
  "stat": "sum",
  "sumField": "amount",
  "statLabel": "付款合计(元)",
  "statuses": [
    "待付款",
    "已付款"
  ],
  "statusDefault": "待付款",
  "statusColors": {
    "待付款": "tag-orange",
    "已付款": "tag-green"
  },
  "searchKeys": [
    "payee",
    "styleNo",
    "invoiceNo"
  ],
  "kvFields": [
    "amount",
    "paymentDate",
    "method",
    "source",
    "invoiceNo"
  ],
  "fields": [
    {
      "k": "payee",
      "label": "收款方",
      "type": "text",
      "required": true
    },
    {
      "k": "amount",
      "label": "金额",
      "type": "number",
      "money": true,
      "required": true
    },
    {
      "k": "paymentDate",
      "label": "付款日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "method",
      "label": "付款方式",
      "type": "select",
      "options": [
        "银行转账",
        "现金",
        "支付宝",
        "微信",
        "其他"
      ]
    },
    {
      "k": "source",
      "label": "款项来源",
      "type": "select",
      "options": [
        "订单",
        "快递",
        "面料",
        "辅料",
        "其他"
      ]
    },
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "invoiceNo",
      "label": "关联发票号",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待付款",
        "已付款"
      ],
      "defaultValue": "待付款"
    }
  ]
};
