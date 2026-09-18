/** 面料管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "fabrics",
  "title": "面料管理",
  "icon": "🧵",
  "color": "#0A84FF",
  "idPrefix": "F",
  "stat": "count",
  "statLabel": "面料记录",
  "statuses": [
    "寄样中",
    "已确认",
    "采购合同",
    "发货中",
    "已到货"
  ],
  "statusDefault": "寄样中",
  "statusColors": {
    "寄样中": "tag-blue",
    "已确认": "tag-teal",
    "采购合同": "tag-purple",
    "发货中": "tag-orange",
    "已到货": "tag-green"
  },
  "searchKeys": [
    "styleNo",
    "fabricName",
    "supplier",
    "fabricCode"
  ],
  "titleFn": r => r.fabricName || r.id,
  "subFn": r => [r.styleNo, r.supplier].filter(Boolean).join(' · '),
  "kvFields": [
    "fabricCode",
    "composition",
    "color",
    "weightGsm",
    "unitPrice",
    "qtyOrdered",
    "status2"
  ],
  "fields": [
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "fabricName",
      "label": "面里衬名称",
      "type": "text",
      "required": true
    },
    {
      "k": "fabricType",
      "label": "类型",
      "type": "select",
      "options": [
        "面料",
        "里料",
        "衬料"
      ]
    },
    {
      "k": "fabricCode",
      "label": "面料编号",
      "type": "text"
    },
    {
      "k": "usagePart",
      "label": "使用部位",
      "type": "text"
    },
    {
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "composition",
      "label": "成分",
      "type": "text"
    },
    {
      "k": "color",
      "label": "颜色",
      "type": "text"
    },
    {
      "k": "weightGsm",
      "label": "克重(g/m²)",
      "type": "number"
    },
    {
      "k": "width",
      "label": "门幅",
      "type": "text"
    },
    {
      "k": "unitPrice",
      "label": "单价",
      "type": "number",
      "money": true
    },
    {
      "k": "qtyOrdered",
      "label": "订购数量",
      "type": "number"
    },
    {
      "k": "unit",
      "label": "单位",
      "type": "select",
      "options": [
        "米",
        "码",
        "公斤"
      ]
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "寄样中",
        "已确认",
        "采购合同",
        "发货中",
        "已到货"
      ],
      "defaultValue": "寄样中"
    },
    {
      "k": "shipDate",
      "label": "发货日期",
      "type": "date"
    },
    {
      "k": "arrivalDate",
      "label": "到货日期",
      "type": "date"
    },
    {
      "k": "remark",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
