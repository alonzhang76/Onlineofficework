/** 通讯录 模块配置（构建脚本生成） */
module.exports = {
  "key": "contacts",
  "title": "通讯录",
  "icon": "👥",
  "color": "#6366F1",
  "idPrefix": "CT",
  "stat": "count",
  "statLabel": "联系人",
  "searchKeys": [
    "name",
    "contactPerson",
    "phone",
    "type"
  ],
  "kvFields": [
    "contactPerson",
    "phone",
    "address"
  ],
  "fields": [
    {
      "k": "name",
      "label": "名称",
      "type": "text",
      "required": true
    },
    {
      "k": "type",
      "label": "类型",
      "type": "select",
      "options": [
        "供应商",
        "客户",
        "工厂",
        "物流",
        "其他"
      ],
      "required": true
    },
    {
      "k": "contactPerson",
      "label": "联系人",
      "type": "text"
    },
    {
      "k": "position",
      "label": "职位",
      "type": "text"
    },
    {
      "k": "phone",
      "label": "电话",
      "type": "text"
    },
    {
      "k": "email",
      "label": "邮箱",
      "type": "text"
    },
    {
      "k": "address",
      "label": "地址",
      "type": "text"
    },
    {
      "k": "remarks",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
