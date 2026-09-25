/** 库存记录 模块配置（构建脚本生成） */
module.exports = {
  "key": "inventoryRecords",
  "title": "库存记录",
  "icon": "🏬",
  "color": "#0A84FF",
  "idPrefix": "INV",
  "stat": "count",
  "statLabel": "库存记录",
  "searchKeys": [
    "stockInDate",
    "warehouseId",
    "product",
    "material",
    "specification"
  ],
  "titleFn": r => [r.product, r.material].filter(Boolean).join(' ') || r.id,
  "subFn": r => [r.warehouseId, r.locationId].filter(Boolean).join(' · '),
  "kvFields": [
    "warehouseId",
    "locationId",
    "specification",
    "quantity",
    "weight",
    "supplier"
  ],
  "fields": [
    {
      "k": "stockInDate",
      "label": "入库日期",
      "type": "date",
      "defaultToday": true
    },
    {
      "k": "warehouseId",
      "label": "仓库",
      "type": "text"
    },
    {
      "k": "locationId",
      "label": "库位",
      "type": "text"
    },
    {
      "k": "operator",
      "label": "经手人",
      "type": "text"
    },
    {
      "k": "supplier",
      "label": "供应商",
      "type": "text"
    },
    {
      "k": "product",
      "label": "产品",
      "type": "text"
    },
    {
      "k": "material",
      "label": "材质",
      "type": "text"
    },
    {
      "k": "specification",
      "label": "规格",
      "type": "text"
    },
    {
      "k": "quantity",
      "label": "数量",
      "type": "number"
    },
    {
      "k": "unit",
      "label": "单位",
      "type": "select",
      "options": [
        "公斤",
        "吨",
        "件",
        "支",
        "米"
      ]
    },
    {
      "k": "weight",
      "label": "重量",
      "type": "number"
    },
    {
      "k": "weightUnit",
      "label": "重量单位",
      "type": "select",
      "options": [
        "公斤",
        "吨"
      ],
      "defaultValue": "公斤"
    },
    {
      "k": "notes",
      "label": "备注",
      "type": "textarea"
    }
  ]
};
