/** 日历记事 模块配置（构建脚本生成） */
module.exports = {
  "key": "calendarEvents",
  "title": "日历记事",
  "icon": "📅",
  "color": "#AF52DE",
  "idPrefix": "EV",
  "stat": "count",
  "statLabel": "记事",
  "statuses": [
    "待办",
    "已完成"
  ],
  "statusDefault": "待办",
  "statusColors": {
    "待办": "tag-orange",
    "已完成": "tag-green"
  },
  "searchKeys": [
    "title",
    "startDate",
    "location"
  ],
  "titleFn": r => r.title || r.id,
  "subFn": r => [r.startDate, r.time, r.location].filter(Boolean).join(' · '),
  "kvFields": [
    "startDate",
    "endDate",
    "time",
    "endTime",
    "reminder",
    "location"
  ],
  "fields": [
    {
      "k": "title",
      "label": "事项",
      "type": "text",
      "required": true
    },
    {
      "k": "startDate",
      "label": "开始日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "endDate",
      "label": "结束日期",
      "type": "date"
    },
    {
      "k": "time",
      "label": "开始时间",
      "type": "text",
      "placeholder": "如 09:30"
    },
    {
      "k": "endTime",
      "label": "结束时间",
      "type": "text"
    },
    {
      "k": "reminder",
      "label": "提醒",
      "type": "select",
      "options": [
        "不提醒",
        "准时",
        "15分钟前",
        "30分钟前",
        "1小时前",
        "1天前"
      ],
      "defaultValue": "不提醒"
    },
    {
      "k": "location",
      "label": "地点",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待办",
        "已完成"
      ],
      "defaultValue": "待办"
    },
    {
      "k": "notes",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
