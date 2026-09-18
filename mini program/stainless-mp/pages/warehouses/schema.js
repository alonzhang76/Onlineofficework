/** 仓库设置 模块配置（构建脚本生成） */
module.exports = {
  "key": "warehouses",
  "title": "仓库设置",
  "icon": "🗄️",
  "color": "#64748B",
  "idPrefix": "WH",
  "stat": "count",
  "statLabel": "仓库",
  "searchKeys": [
    "name",
    "location",
    "manager"
  ],
  "titleFn": r => r.name || r.id,
  "subFn": r => [r.location, r.manager].filter(Boolean).join(' · '),
  "kvFields": [
    "location",
    "manager",
    "phone"
  ],
  "fields": [
    {
      "k": "name",
      "label": "仓库名称",
      "type": "text",
      "required": true
    },
    {
      "k": "location",
      "label": "仓库地址",
      "type": "text"
    },
    {
      "k": "manager",
      "label": "管理员",
      "type": "text"
    },
    {
      "k": "phone",
      "label": "联系电话",
      "type": "text"
    },
    {
      "k": "remark",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
