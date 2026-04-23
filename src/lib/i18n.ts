// i18n central dictionary.
//
// Every translatable UI string has a dotted key (e.g. "nav.home") and
// an English + Chinese entry below. Components tag DOM nodes with
// `data-i18n="<key>"`; the bootstrap script in Base.astro walks every
// such node on load and when the user toggles, replacing textContent
// from the dict.
//
// For Chinese: prefer idiomatic phrasing matched to how Chinese tech
// press actually writes about AI. Avoid machine-translated stiffness.
// Terminology references:
//   - 模型 (model), 参数 (parameters), 上下文 (context window)
//   - 代理 / Agent (Agent), 多模态 (multimodal), 推理 (reasoning)
//   - 开源 / 闭源 (open/closed source), 开放权重 (open weights)
//   - 节点 (node), 节点类型 (node types), 公司 (company), 许可 (license)

export type Lang = "en" | "zh";

export const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.graph": "Graph",
    "nav.timeline": "Timeline",
    "nav.about": "About",
    "nav.github": "GitHub",

    "footer.license": "Code: MIT · Content: CC-BY-SA 4.0 · A community-curated tree of AI advancements.",

    "lang.en": "EN",
    "lang.zh": "中",
    "lang.toggle.title": "Switch language",

    "landing.bullet1": "Observe AI's evolution in a tree structure",
    "landing.bullet2": "Understand AI's ancestry and descendants",
    "landing.bullet3": "Branch, iterate, and compare model-to-model",
    "landing.cta": "Explore the tree",
    "landing.meta.how": "How this works",
    "landing.meta.timeline": "Timeline",

    "tree.brandSub": "Tech tree of ML/AI breakthroughs. Time → right.",
    "tree.search.placeholder": "Search a model…",
    "tree.orient.horizontal": "▶ Horizontal",
    "tree.orient.vertical": "▼ Vertical",
    "tree.compact.on": "Compact view",
    "tree.compact.off": "Tree view",
    "tree.compact.title": "Pack visible cards into a compact grid",

    "filter.edgeTypes": "Edge types",
    "filter.nodeTypes": "Node types",
    "filter.company": "Company",
    "filter.license": "License",
    "filter.showAll": "Show all",
    "filter.hideAll": "Hide all",
    "filter.mode.or": "OR",
    "filter.mode.and": "AND",
    "filter.mode.or.title": "Show nodes matching ANY enabled type",
    "filter.mode.and.title": "Show nodes matching ALL enabled types (intersection)",

    "nodeType.agents": "Agent",
    "nodeType.multimodal": "Multimodal",
    "nodeType.reasoning": "Reasoning",
    "nodeType.generative": "Generative",
    "nodeType.code": "Code",
    "nodeType.cv": "Vision",
    "nodeType.audio": "Audio",
    "nodeType.nlp": "Text / NLP",
    "nodeType.paper": "Paper",

    "license.open": "Open source",
    "license.closed": "Closed source",

    "help.hover": "Hover a card → ancestor lineage.",
    "help.zoom": "zoom",
    "help.zoomSuffix": " → 1-hop modal.",
    "help.pin": "highlight this path",
    "help.pinSuffix": " → pin it.",

    "status.foundational": "Foundational",
    "status.active": "Active",
    "status.superseded": "Superseded",
    "status.archived": "Archived",

    "release.open_weights": "Open weights",
    "release.api": "API",
    "release.product": "Product",
    "release.paper": "Paper",
    "release.demo": "Demo",

    "era.foundations": "Foundations era",
    "era.classical-ml": "Classical ML era",
    "era.deep-learning-revival": "Deep-learning revival",
    "era.architectures": "Architectures era",
    "era.transformer": "Transformer era",
    "era.scale-era": "Scale era",
    "era.alignment": "Alignment era",
    "era.multimodal": "Multimodal era",
    "era.reasoning": "Reasoning era",
    "era.agents": "Agents era",
    "era.frontier": "Frontier",

    "detail.official": "Official ↗",
    "detail.github": "GitHub ↗",
    "detail.officialSite": "Official site ↗",
    "detail.modelSpec": "Model spec",
    "detail.benchmarks": "Benchmarks",
    "detail.references": "References",
    "detail.relationships": "Relationships",
    "detail.view.tech": "Tech",
    "detail.view.public": "Public",
    "detail.body.englishNotice": "Technical body is currently available in English only.",

    "spec.parameters": "Parameters",
    "spec.architecture": "Architecture",
    "spec.context_window": "Context window",
    "spec.training_tokens": "Training tokens",
    "spec.training_compute": "Training compute",
    "spec.release_type": "Release type",
  },
  zh: {
    "nav.home": "首页",
    "nav.graph": "树图",
    "nav.timeline": "时间轴",
    "nav.about": "关于",
    "nav.github": "GitHub",

    "footer.license": "代码: MIT · 内容: CC-BY-SA 4.0 · 社区共建的 AI 进化树",

    "lang.en": "EN",
    "lang.zh": "中",
    "lang.toggle.title": "切换语言",

    "landing.bullet1": "以树状结构俯瞰 AI 的演化",
    "landing.bullet2": "追溯每个模型的祖先与后裔",
    "landing.bullet3": "分支、迭代、模型对模型的横向比较",
    "landing.cta": "进入 AI 进化树",
    "landing.meta.how": "工作原理",
    "landing.meta.timeline": "时间轴",

    "tree.brandSub": "机器学习 / AI 突破的技术树。时间 → 向右",
    "tree.search.placeholder": "搜索模型…",
    "tree.orient.horizontal": "▶ 横向",
    "tree.orient.vertical": "▼ 纵向",
    "tree.compact.on": "紧凑视图",
    "tree.compact.off": "树状视图",
    "tree.compact.title": "将可见卡片收拢为紧凑网格",

    "filter.edgeTypes": "关系类型",
    "filter.nodeTypes": "节点类型",
    "filter.company": "所属公司",
    "filter.license": "开源状态",
    "filter.showAll": "全部显示",
    "filter.hideAll": "全部隐藏",
    "filter.mode.or": "任一",
    "filter.mode.and": "同时",
    "filter.mode.or.title": "显示至少命中一个类型的节点",
    "filter.mode.and.title": "显示同时命中所有选中类型的节点（交集）",

    "nodeType.agents": "智能体",
    "nodeType.multimodal": "多模态",
    "nodeType.reasoning": "推理",
    "nodeType.generative": "生成",
    "nodeType.code": "代码",
    "nodeType.cv": "视觉",
    "nodeType.audio": "语音",
    "nodeType.nlp": "文本 / NLP",
    "nodeType.paper": "论文",

    "license.open": "开源",
    "license.closed": "闭源",

    "help.hover": "悬停卡片 → 看祖先链路",
    "help.zoom": "zoom",
    "help.zoomSuffix": " → 局部放大浮窗",
    "help.pin": "highlight this path",
    "help.pinSuffix": " → 固定该链路",

    "status.foundational": "奠基",
    "status.active": "在用",
    "status.superseded": "已被超越",
    "status.archived": "归档",

    "release.open_weights": "开放权重",
    "release.api": "API",
    "release.product": "产品",
    "release.paper": "论文",
    "release.demo": "演示",

    "era.foundations": "奠基期",
    "era.classical-ml": "经典 ML 时期",
    "era.deep-learning-revival": "深度学习复兴",
    "era.architectures": "架构探索期",
    "era.transformer": "Transformer 时代",
    "era.scale-era": "规模化时代",
    "era.alignment": "对齐时代",
    "era.multimodal": "多模态时代",
    "era.reasoning": "推理时代",
    "era.agents": "智能体时代",
    "era.frontier": "前沿",

    "detail.official": "官网 ↗",
    "detail.github": "GitHub ↗",
    "detail.officialSite": "官网 ↗",
    "detail.modelSpec": "模型参数",
    "detail.benchmarks": "基准测试",
    "detail.references": "参考资料",
    "detail.relationships": "上下游关系",
    "detail.view.tech": "技术",
    "detail.view.public": "通俗",
    "detail.body.englishNotice": "技术正文暂只有英文版本。",

    "spec.parameters": "参数规模",
    "spec.architecture": "架构",
    "spec.context_window": "上下文窗口",
    "spec.training_tokens": "训练 token",
    "spec.training_compute": "训练算力",
    "spec.release_type": "发布方式",
  },
};
