/** 通讯录 模块配置（构建脚本生成） */
module.exports = {
  "key": "contacts",
  "title": "通讯录",
  "icon": "👥",
  "color": "#6366F1",
  "idPrefix": "CT",
  "scoped": false,
  "stat": "count",
  "statLabel": "联系人",
  "searchKeys": [
    "name",
    "businessType",
    "contactPerson",
    "phone"
  ],
  "titleFn": r => r.name || r.id,
  "subFn": r => [r.businessType, r.contactPerson].filter(Boolean).join(' · '),
  "kvFields": [
    "businessType",
    "contactPerson",
    "phone",
    "address"
  ],
  "fields": [
    {
      "k": "name",
      "label": "单位名称",
      "type": "text",
      "required": true
    },
    {
      "k": "businessType",
      "label": "类型",
      "type": "select",
      "options": [
        "供应商",
        "客户",
        "工厂",
        "物流",
        "其他"
      ],
      "defaultValue": "客户",
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
      "k": "website",
      "label": "网址",
      "type": "text"
    },
    {
      "k": "address",
      "label": "地址",
      "type": "text"
    },
    {
      "k": "bankAddress",
      "label": "开户行",
      "type": "text"
    },
    {
      "k": "bankCode",
      "label": "行号/SWIFT",
      "type": "text"
    },
    {
      "k": "bankAccount",
      "label": "银行账号",
      "type": "text"
    }
  ]
};
