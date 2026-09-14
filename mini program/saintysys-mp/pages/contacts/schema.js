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
    "email",
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
        "客户",
        "供应商",
        "工厂",
        "货代",
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
      "k": "bankAccount",
      "label": "银行账号",
      "type": "text"
    },
    {
      "k": "bankCode",
      "label": "银行代码/SWIFT",
      "type": "text"
    },
    {
      "k": "taxNo",
      "label": "税号",
      "type": "text"
    },
    {
      "k": "description",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
