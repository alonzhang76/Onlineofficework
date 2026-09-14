/** 样衣管理 模块配置（构建脚本生成） */
module.exports = {
  "key": "samples",
  "title": "样衣管理",
  "icon": "👗",
  "color": "#EC4899",
  "idPrefix": "S",
  "stat": "count",
  "statLabel": "样衣记录",
  "statuses": [
    "头样",
    "尺码样",
    "产前样",
    "船样",
    "照片样",
    "已确认"
  ],
  "statusColors": {
    "头样": "tag-gray",
    "尺码样": "tag-blue",
    "产前样": "tag-teal",
    "船样": "tag-orange",
    "照片样": "tag-purple",
    "已确认": "tag-green"
  },
  "searchKeys": [
    "styleNo",
    "factory",
    "confirmedBy"
  ],
  "kvFields": [
    "size",
    "qty",
    "sampleDate",
    "arrangeDate",
    "confirmedBy"
  ],
  "fields": [
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text",
      "required": true
    },
    {
      "k": "stageKey",
      "label": "样衣阶段",
      "type": "select",
      "options": [
        "头样",
        "尺码样",
        "产前样",
        "船样",
        "照片样"
      ]
    },
    {
      "k": "size",
      "label": "尺码",
      "type": "text"
    },
    {
      "k": "qty",
      "label": "数量",
      "type": "number"
    },
    {
      "k": "factory",
      "label": "样衣工/工厂",
      "type": "text"
    },
    {
      "k": "arrangeDate",
      "label": "安排日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "sampleDate",
      "label": "完成日期",
      "type": "date"
    },
    {
      "k": "confirmedBy",
      "label": "确认人",
      "type": "text"
    },
    {
      "k": "techNotes",
      "label": "工艺说明",
      "type": "textarea"
    }
  ]
};
