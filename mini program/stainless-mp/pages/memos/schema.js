/** 备忘录 模块配置（构建脚本生成） */
module.exports = {
  "key": "memos",
  "title": "备忘录",
  "icon": "📝",
  "color": "#8B5CF6",
  "idPrefix": "MEMO",
  "scoped": false,
  "stat": "count",
  "statLabel": "备忘",
  "statuses": [
    "待办",
    "进行中",
    "已完成"
  ],
  "statusDefault": "进行中",
  "statusColors": {
    "待办": "tag-gray",
    "进行中": "tag-orange",
    "已完成": "tag-green"
  },
  "searchKeys": [
    "title",
    "content",
    "tags"
  ],
  "titleFn": r => r.title || (r.content || '').slice(0, 24) || r.id,
  "subFn": r => [r.priority, r.tags].filter(Boolean).join(' · '),
  "kvFields": [
    "priority",
    "tags",
    "status"
  ],
  "fields": [
    {
      "k": "title",
      "label": "标题",
      "type": "text",
      "required": true
    },
    {
      "k": "content",
      "label": "内容",
      "type": "textarea",
      "required": true
    },
    {
      "k": "priority",
      "label": "优先级",
      "type": "select",
      "options": [
        "高",
        "中",
        "低"
      ],
      "defaultValue": "中"
    },
    {
      "k": "tags",
      "label": "标签",
      "type": "text"
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待办",
        "进行中",
        "已完成"
      ],
      "defaultValue": "进行中"
    }
  ]
};
