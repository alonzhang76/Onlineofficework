/** 备忘录 模块配置（构建脚本生成） */
module.exports = {
  "key": "memoRecords",
  "title": "备忘录",
  "icon": "📝",
  "color": "#8B5CF6",
  "idPrefix": "MEMO",
  "stat": "count",
  "statLabel": "备忘",
  "statuses": [
    "进行中",
    "已完成"
  ],
  "statusColors": {
    "进行中": "tag-orange",
    "已完成": "tag-green"
  },
  "searchKeys": [
    "content"
  ],
  "kvFields": [],
  "fields": [
    {
      "k": "date",
      "label": "日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "content",
      "label": "内容",
      "type": "textarea",
      "required": true
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "进行中",
        "已完成"
      ],
      "defaultValue": "进行中"
    }
  ]
};
