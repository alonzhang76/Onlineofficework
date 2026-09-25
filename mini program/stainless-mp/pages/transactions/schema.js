/** 收付款 模块配置（构建脚本生成） */
module.exports = {
  "key": "transactions",
  "title": "收付款",
  "icon": "💴",
  "color": "#F97316",
  "idPrefix": "TX",
  "stat": "sum",
  "sumField": "amount",
  "statLabel": "收付款合计(元)",
  "statuses": [
    "收款",
    "付款",
    "其他"
  ],
  "statusDefault": "收款",
  "statusColors": {
    "收款": "tag-green",
    "付款": "tag-red",
    "其他": "tag-gray"
  },
  "searchKeys": [
    "date",
    "category",
    "payee",
    "payer",
    "handler",
    "paymentMethod"
  ],
  "titleFn": r => (r.category || '收付款') + (r.amount != null && r.amount !== '' ? '  ¥' + r.amount : ''),
  "subFn": r => [r.payee, r.payer].filter(Boolean).join(' → '),
  "kvFields": [
    "date",
    "paymentMethod",
    "payee",
    "payer",
    "amount",
    "handler"
  ],
  "fields": [
    {
      "k": "date",
      "label": "收付款日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "category",
      "label": "交易类别",
      "type": "select",
      "options": [
        "收款",
        "付款",
        "其他"
      ],
      "defaultValue": "收款",
      "required": true
    },
    {
      "k": "paymentMethod",
      "label": "结算方式",
      "type": "select",
      "options": [
        "承兑汇票",
        "电汇",
        "现金",
        "微信",
        "支付宝"
      ],
      "defaultValue": "电汇"
    },
    {
      "k": "handler",
      "label": "经手人",
      "type": "text",
      "defaultValue": "周瑾"
    },
    {
      "k": "payee",
      "label": "收款单位",
      "type": "text"
    },
    {
      "k": "payer",
      "label": "付款单位",
      "type": "text"
    },
    {
      "k": "amount",
      "label": "金额(元)",
      "type": "number",
      "money": true,
      "required": true
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
