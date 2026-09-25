/** 钢材英语 模块配置（构建脚本生成） */
module.exports = {
  "key": "vocabularies",
  "title": "钢材英语",
  "icon": "🔤",
  "color": "#0284C7",
  "idPrefix": "VO",
  "scoped": false,
  "stat": "count",
  "statLabel": "词汇",
  "searchKeys": [
    "english",
    "chinese",
    "phonetic",
    "categoryEn"
  ],
  "titleFn": r => r.english || r.id,
  "subFn": r => r.chinese || '',
  "kvFields": [
    "phonetic",
    "chinese",
    "categoryEn"
  ],
  "fields": [
    {
      "k": "english",
      "label": "English",
      "type": "text",
      "required": true
    },
    {
      "k": "phonetic",
      "label": "音标",
      "type": "text"
    },
    {
      "k": "chinese",
      "label": "中文",
      "type": "text",
      "required": true
    },
    {
      "k": "categoryEn",
      "label": "分类",
      "type": "text"
    }
  ]
};
