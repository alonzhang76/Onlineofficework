/** HS编码/标准 模块配置（构建脚本生成） */
module.exports = {
  "key": "hscodes",
  "title": "HS编码/标准",
  "icon": "📚",
  "color": "#7C3AED",
  "idPrefix": "HS",
  "scoped": false,
  "stat": "count",
  "statLabel": "编码",
  "searchKeys": [
    "productName",
    "productNameEn",
    "hscode",
    "standard"
  ],
  "titleFn": r => r.productName || r.id,
  "subFn": r => r.hscode || '',
  "kvFields": [
    "hscode",
    "standard",
    "productNameEn"
  ],
  "fields": [
    {
      "k": "productName",
      "label": "产品名称",
      "type": "text",
      "required": true
    },
    {
      "k": "productNameEn",
      "label": "英文名称",
      "type": "text"
    },
    {
      "k": "hscode",
      "label": "HS 编码",
      "type": "text",
      "required": true
    },
    {
      "k": "standard",
      "label": "国标",
      "type": "text"
    },
    {
      "k": "standardEn",
      "label": "国际标准",
      "type": "text"
    },
    {
      "k": "techRequirements",
      "label": "技术要求",
      "type": "textarea"
    },
    {
      "k": "techRequirementsEn",
      "label": "英文技术要求",
      "type": "textarea"
    },
    {
      "k": "note",
      "label": "备注",
      "type": "textarea"
    },
    {
      "k": "noteEn",
      "label": "英文备注",
      "type": "textarea"
    },
    {
      "k": "descriptionEn",
      "label": "英文描述",
      "type": "textarea"
    }
  ]
};
