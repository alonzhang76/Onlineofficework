/** 理算参数 模块配置（构建脚本生成） */
module.exports = {
  "key": "calculationParams",
  "title": "理算参数",
  "icon": "🧮",
  "color": "#DB2777",
  "idPrefix": "CP",
  "scoped": false,
  "stat": "count",
  "statLabel": "公式",
  "searchKeys": [
    "serial",
    "title"
  ],
  "titleFn": r => (r.serial ? r.serial + '. ' : '') + (r.title || r.id),
  "subFn": r => r.formula || '',
  "kvFields": [
    "serial",
    "title",
    "formula"
  ],
  "fields": [
    {
      "k": "serial",
      "label": "序号",
      "type": "text",
      "required": true
    },
    {
      "k": "title",
      "label": "标题",
      "type": "text",
      "required": true
    },
    {
      "k": "formula",
      "label": "计算公式",
      "type": "textarea"
    },
    {
      "k": "example",
      "label": "示例",
      "type": "textarea"
    }
  ]
};
