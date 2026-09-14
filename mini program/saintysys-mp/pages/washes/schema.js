/** 水洗管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "washes",
  "title": "水洗管理",
  "icon": "🫧",
  "color": "#00C7BE",
  "idPrefix": "W",
  "stat": "count",
  "statLabel": "水洗记录",
  "statuses": [
    "未确认",
    "寄样中",
    "已确认"
  ],
  "statusDefault": "寄样中",
  "statusColors": {
    "未确认": "tag-gray",
    "寄样中": "tag-blue",
    "已确认": "tag-green"
  },
  "searchKeys": [
    "styleNo",
    "factory",
    "washMethod"
  ],
  "kvFields": [
    "round",
    "washDate",
    "factory",
    "targetColor",
    "washResult"
  ],
  "fields": [
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text",
      "required": true
    },
    {
      "k": "round",
      "label": "轮次",
      "type": "number"
    },
    {
      "k": "washDate",
      "label": "水洗日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "factory",
      "label": "水洗厂",
      "type": "text"
    },
    {
      "k": "washMethod",
      "label": "水洗方式",
      "type": "select",
      "options": [
        "普通水洗",
        "石洗",
        "酵素洗",
        "漂洗",
        "砂洗",
        "其他"
      ]
    },
    {
      "k": "targetColor",
      "label": "目标颜色",
      "type": "text"
    },
    {
      "k": "washResult",
      "label": "水洗结果",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "未确认",
        "寄样中",
        "已确认"
      ],
      "defaultValue": "寄样中"
    },
    {
      "k": "customerFeedback",
      "label": "客户反馈",
      "type": "textarea"
    },
    {
      "k": "confirmedDate",
      "label": "确认日期",
      "type": "date"
    },
    {
      "k": "remark",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
