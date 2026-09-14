/** 生产跟踪 模块配置（构建脚本生成） */
module.exports = {
  "key": "productions",
  "title": "生产跟踪",
  "icon": "🏭",
  "color": "#FF9500",
  "idPrefix": "P",
  "stat": "count",
  "statLabel": "生产单",
  "statuses": [
    "待生产",
    "生产中",
    "已完成",
    "暂停"
  ],
  "statusDefault": "待生产",
  "statusColors": {
    "待生产": "tag-gray",
    "生产中": "tag-orange",
    "已完成": "tag-green",
    "暂停": "tag-red"
  },
  "searchKeys": [
    "styleNo",
    "orderNo",
    "factoryName"
  ],
  "kvFields": [
    "orderNo",
    "factoryType",
    "qtyPlanned",
    "qtyCompleted",
    "expectedEnd",
    "qcResult"
  ],
  "fields": [
    {
      "k": "styleNo",
      "label": "款号",
      "type": "text",
      "required": true
    },
    {
      "k": "orderNo",
      "label": "PO 订单号",
      "type": "text"
    },
    {
      "k": "factoryType",
      "label": "工厂类型",
      "type": "select",
      "options": [
        "裁床",
        "车缝",
        "水洗",
        "后整",
        "包装",
        "外发"
      ]
    },
    {
      "k": "factoryName",
      "label": "工厂名称",
      "type": "text",
      "required": true
    },
    {
      "k": "contactPerson",
      "label": "联系人",
      "type": "text"
    },
    {
      "k": "contactPhone",
      "label": "联系电话",
      "type": "text"
    },
    {
      "k": "startDate",
      "label": "开工日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "expectedEnd",
      "label": "预计完工",
      "type": "date"
    },
    {
      "k": "actualEnd",
      "label": "实际完工",
      "type": "date"
    },
    {
      "k": "qtyPlanned",
      "label": "计划数量",
      "type": "number"
    },
    {
      "k": "qtyCompleted",
      "label": "完成数量",
      "type": "number"
    },
    {
      "k": "qcResult",
      "label": "QC 结果",
      "type": "select",
      "options": [
        "待检",
        "合格",
        "不合格"
      ]
    },
    {
      "k": "status",
      "label": "状态",
      "type": "select",
      "options": [
        "待生产",
        "生产中",
        "已完成",
        "暂停"
      ],
      "defaultValue": "待生产"
    }
  ]
};
