/** 材质对照 模块配置（构建脚本生成） */
module.exports = {
  "key": "gradeComparisons",
  "title": "材质对照",
  "icon": "🔩",
  "color": "#0F766E",
  "idPrefix": "GR",
  "scoped": false,
  "stat": "count",
  "statLabel": "材质牌号",
  "searchKeys": [
    "grade",
    "gbOld",
    "gbNew",
    "uns",
    "astm",
    "jis",
    "din"
  ],
  "titleFn": r => r.grade || r.id,
  "subFn": r => [r.gbNew, r.astm].filter(Boolean).join(' / '),
  "kvFields": [
    "grade",
    "gbOld",
    "gbNew",
    "astm",
    "jis",
    "density"
  ],
  "fields": [
    {
      "k": "grade",
      "label": "牌号",
      "type": "text",
      "required": true
    },
    {
      "k": "gbOld",
      "label": "旧国标 GB",
      "type": "text"
    },
    {
      "k": "gbNew",
      "label": "新国标 GB",
      "type": "text"
    },
    {
      "k": "uns",
      "label": "UNS(美)",
      "type": "text"
    },
    {
      "k": "astm",
      "label": "ASTM(美)",
      "type": "text"
    },
    {
      "k": "sae",
      "label": "SAE(美)",
      "type": "text"
    },
    {
      "k": "jis",
      "label": "JIS(日)",
      "type": "text"
    },
    {
      "k": "ks",
      "label": "KS(韩)",
      "type": "text"
    },
    {
      "k": "din",
      "label": "DIN(德)",
      "type": "text"
    },
    {
      "k": "nf",
      "label": "NF(法)",
      "type": "text"
    },
    {
      "k": "bs",
      "label": "BS(英)",
      "type": "text"
    },
    {
      "k": "en",
      "label": "EN(欧)",
      "type": "text"
    },
    {
      "k": "iso",
      "label": "ISO",
      "type": "text"
    },
    {
      "k": "density",
      "label": "密度(g/cm³)",
      "type": "number"
    },
    {
      "k": "composition",
      "label": "化学成分",
      "type": "textarea"
    }
  ]
};
