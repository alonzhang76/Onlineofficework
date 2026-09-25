/** 辅料管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "accessories",
  "title": "辅料管理",
  "icon": "🧷",
  "color": "#AF52DE",
  "idPrefix": "A",
  "stat": "count",
  "statLabel": "辅料记录",
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
    "accessoryName",
    "supplier",
    "accessoryCode"
  ],
  "titleFn": r => r.accessoryName || r.id,
  "subFn": r => [r.styleNo, r.supplier].filter(Boolean).join(' · '),
  "kvFields": [
    "accessoryCode",
    "spec",
    "color",
    "unitPrice",
    "qtyOrdered"
  ],
  "fields": [
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text"
    },
    {
      "k": "accessoryName",
      "label": "辅料名称",
      "type": "text",
      "required": true
    },
    {
      "k": "accessoryCode",
      "label": "辅料编号",
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
        "个",
        "粒",
        "米",
        "条",
        "套",
        "包"
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
