export const STORAGE_KEYS = {
  categoryTree: "categoryTree",
  categoryNamesList: "categoryNamesList",
  bookmarkSnapshot: "bookmarkSnapshot",
  bookmarkCategoryLinks: "bookmarkCategoryLinks",
  bookmarkSyncSettings: "bookmarkSyncSettings",
  bookmarkSyncMeta: "bookmarkSyncMeta",
  clickStats: "clickStats",
  searchSettings: "searchSettings",
  popupSettings: "popupSettings",
  appearanceSettings: "appearanceSettings",
  languageSettings: "languageSettings",
  aiSettings: "aiSettings",
  classificationRules: "classificationRules",
  catPanelState: "catPanelState",
};

export const DEFAULT_POPUP_SETTINGS = {
  hoverDelayMs: 360,
  shellAnimationMs: 320,
  columnAnimationMs: 260,
  expandDirection: "right-anchored",
  submenuDirection: "left",
};

export const DEFAULT_APPEARANCE_SETTINGS = {
  themeId: "forest",
  customAccentColor: "",
  showFavicons: true,
};

export const DEFAULT_BOOKMARK_SYNC_SETTINGS = {
  mode: "manual",
  controller: "popup",
  intervalMinutes: 60,
};

export const DEFAULT_BOOKMARK_SYNC_META = {
  lastSyncedAt: 0,
  bookmarkCount: 0,
  source: "browser-bookmarks",
  mode: "manual",
  status: "idle",
  lastError: "",
};

export const DEFAULT_LANGUAGE_SETTINGS = {
  locale: "zh-CN",
};

export const DEFAULT_CLASSIFICATION_RULES = {
  version: 3,
  groups: [
    {
      id: "group-example-classify",
      name: "示例：开发资料归类",
      type: "classify",
      order: 1,
      rules: [
        {
          id: "example-dev-docs",
          name: "开发资料关键词",
          fields: ["title", "url", "domain"],
          type: "contains",
          pattern: "github.com\nmdn\ndeveloper.chrome.com",
          categoryIds: ["tools-dev"],
          note: "只处理默认/无分类书签，命中后写入末端分类“工具 / 开发工具”。",
        },
      ],
    },
  ],
};

export const DEFAULT_AI_PROMPTS = {
  bookmarkClassification: [
    "你是中文书签分类助手。系统会按批发送书签，你需要在同一次响应中同时整理分类体系草案，并返回本批书签的临时归类建议。",
    "已生效本地分组稳定优先，必须优先沿用，不要改名、合并或移动；候选分组可以通过 changes 合并、改名或上提父级。",
    "一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。",
    "如果多个候选分组能被更宽泛的分组囊括，请用 changes 返回合并、改名或上提记录。新分类路径最多 3 层，路径层级使用 / 分隔。",
    "当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。",
    "响应必须只返回 JSON 对象，顶层包含 newGroups、changes、assignments。assignments 是本批书签的临时归类缓存，后续本地会按 changes 自动修正路径，不会再次请求 AI 归类。",
    "每个 assignment 使用当前任务的临时 id，并返回 categories 数组。若一个书签同时适合多个彼此独立的分类场景，应返回 2-3 个分类路径；不要为了省事只给单一分类。",
    "分类优先级必须是：优先使用多个已生效分组或候选分组组合归类，其次才考虑新增候选分组。",
    "不要为了让某个书签看起来有更精确的单一分类而创建新分类；如果多个现有分类标签组合后已经能表达它，就直接使用这些分类标签。",
    "只有当已生效分组和候选分组的多标签组合仍然无法覆盖一批书签的共同用途时，才允许在 newGroups 中提出新分组。",
    "多标签判断要主动执行：先分别判断书签的内容主题、使用目的、工具属性、所属平台/资源类型，只要命中两个互不包含的维度，就必须给多个分类路径。",
    "不要因为某一个分类已经足够描述书签就停止判断；例如开发文档同时属于 学习/技术 和 工具/开发，音乐软件同时属于 娱乐/音乐 和 工具/创作，设计素材站同时属于 创作/设计 和 资源/素材。",
    "只有当其它候选分类与主分类明显是父子包含关系或语义重复时，才返回 1 个分类路径；否则优先保留多个独立标签。",
    "categories 必须使用已生效分组、候选分组或本次 newGroups / changes 后的新路径。每个书签最多返回 3 个分类路径，路径层级使用 / 分隔。",
    "不要返回 Markdown、解释段落或额外说明。",
  ].join("\n"),
  ruleGeneration:
    "请根据所选书签样本建议本地分类匹配规则。规则只能基于标题、URL、域名或收藏夹路径。",
  bookmarkIndexing: [
    "你是书签索引建立助手。请根据输入的书签编号和字段，为每个书签生成用于本地模糊搜索的简短索引数据。",
    "索引只用于搜索，不用于分类。不要返回分类路径，不要引用分类任务的响应结构。",
    "必须只返回 JSON 对象，顶层包含 items。items 每项包含 id、keywords、aliases、summary。",
  ].join("\n"),
};

const LEGACY_DEFAULT_AI_CLASSIFICATION_PROMPT =
  "请根据书签标题和 URL 判断适合的本地分类。仅返回建议分类名称和简短理由，不要修改浏览器书签。";
const LEGACY_JSON_ARRAY_AI_CLASSIFICATION_PROMPT = [
  "你是书签分类助手。请根据输入的书签编号和字段，为每个书签建议本地分类路径。",
  "优先使用已有分类路径；只有明显不适合时才建议新分类。新分类应符合中文用户的常识，最多 3 层，不要过细。",
  "每个书签最多返回 3 个分类路径。路径层级使用 / 分隔。",
  "必须只返回 JSON 数组，每项包含 id 和 categories，不要返回 Markdown 或额外说明。",
].join("\n");
const LEGACY_TWO_STAGE_AI_CLASSIFICATION_PROMPT = [
  "你是书签分类助手。请根据输入的书签编号和字段，为每个书签建议本地分类路径。",
  "先判断已有分类路径是否为空或明显不足；需要新建分组时，先在 newGroups 中写出新增分组路径。",
  "优先使用已有分类路径；只有明显不适合或没有已有分类时才建议新分类。新分类应符合中文用户的常识，最多 3 层，不要过细。",
  "每个书签最多返回 3 个分类路径。路径层级使用 / 分隔。assignments 可以引用已有分类路径，也可以引用 newGroups 中的新路径。",
  "必须只返回 JSON 对象，顶层包含 hasNewGroups、newGroups、assignments，不要返回 Markdown 或额外说明。",
].join("\n");
const LEGACY_SEPARATE_STAGE_AI_CLASSIFICATION_PROMPT = [
  "你是中文书签分类助手。系统会分两阶段调用你：先整理分类体系草案，再按确认后的分类体系归类书签。",
  "分类体系草案阶段：只返回 newGroups 和 changes，不要返回 assignments。已生效分组必须优先沿用，不要改名、合并或移动；候选分组可以合并、改名或上提父级。",
  "一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。",
  "如果多个候选分组能被更宽泛的分组囊括，请用 changes 返回合并、改名或上提记录。新分类路径最多 3 层，路径层级使用 / 分隔。",
  "当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。",
  "书签归类阶段：只返回 assignments，不要返回 newGroups 或 changes。每个书签只能从请求提供的 categoryPaths / allowedCategoryPaths 中选择分类路径。",
  "必须只返回合法 JSON 对象，不要返回 Markdown、解释段落或额外说明。",
].join("\n");
const LEGACY_COMBINED_STAGE_AI_CLASSIFICATION_PROMPT = [
  "你是中文书签分类助手。系统会按批发送书签，你需要在同一次响应中同时整理分类体系草案，并返回本批书签的临时归类建议。",
  "已生效本地分组稳定优先，必须优先沿用，不要改名、合并或移动；候选分组可以通过 changes 合并、改名或上提父级。",
  "一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。",
  "如果多个候选分组能被更宽泛的分组囊括，请用 changes 返回合并、改名或上提记录。新分类路径最多 3 层，路径层级使用 / 分隔。",
  "当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。",
  "响应必须只返回 JSON 对象，顶层包含 newGroups、changes、assignments。assignments 是本批书签的临时归类缓存，后续本地会按 changes 自动修正路径，不会再次请求 AI 归类。",
  "每个 assignment 使用当前任务的临时 id，并返回 categories 数组。若一个书签同时适合多个彼此独立的分类场景，应返回 2-3 个分类路径；不要为了省事只给单一分类。",
  "categories 必须使用已生效分组、候选分组或本次 newGroups / changes 后的新路径。每个书签最多返回 3 个分类路径，路径层级使用 / 分隔。",
  "不要返回 Markdown、解释段落或额外说明。",
].join("\n");
const LEGACY_MULTI_LABEL_AI_CLASSIFICATION_PROMPT = [
  "你是中文书签分类助手。系统会按批发送书签，你需要在同一次响应中同时整理分类体系草案，并返回本批书签的临时归类建议。",
  "已生效本地分组稳定优先，必须优先沿用，不要改名、合并或移动；候选分组可以通过 changes 合并、改名或上提父级。",
  "一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。",
  "如果多个候选分组能被更宽泛的分组囊括，请用 changes 返回合并、改名或上提记录。新分类路径最多 3 层，路径层级使用 / 分隔。",
  "当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。",
  "响应必须只返回 JSON 对象，顶层包含 newGroups、changes、assignments。assignments 是本批书签的临时归类缓存，后续本地会按 changes 自动修正路径，不会再次请求 AI 归类。",
  "每个 assignment 使用当前任务的临时 id，并返回 categories 数组。若一个书签同时适合多个彼此独立的分类场景，应返回 2-3 个分类路径；不要为了省事只给单一分类。",
  "多标签判断要主动执行：先分别判断书签的内容主题、使用目的、工具属性、所属平台/资源类型，只要命中两个互不包含的维度，就必须给多个分类路径。",
  "不要因为某一个分类已经足够描述书签就停止判断；例如开发文档同时属于 学习/技术 和 工具/开发，音乐软件同时属于 娱乐/音乐 和 工具/创作，设计素材站同时属于 创作/设计 和 资源/素材。",
  "只有当其它候选分类与主分类明显是父子包含关系或语义重复时，才返回 1 个分类路径；否则优先保留多个独立标签。",
  "categories 必须使用已生效分组、候选分组或本次 newGroups / changes 后的新路径。每个书签最多返回 3 个分类路径，路径层级使用 / 分隔。",
  "不要返回 Markdown、解释段落或额外说明。",
].join("\n");

function sanitizeBookmarkClassificationPrompt(value) {
  const prompt = String(value || "");
  return prompt === LEGACY_DEFAULT_AI_CLASSIFICATION_PROMPT ||
    prompt === LEGACY_JSON_ARRAY_AI_CLASSIFICATION_PROMPT ||
    prompt === LEGACY_TWO_STAGE_AI_CLASSIFICATION_PROMPT ||
    prompt === LEGACY_SEPARATE_STAGE_AI_CLASSIFICATION_PROMPT ||
    prompt === LEGACY_COMBINED_STAGE_AI_CLASSIFICATION_PROMPT ||
    prompt === LEGACY_MULTI_LABEL_AI_CLASSIFICATION_PROMPT
    ? DEFAULT_AI_PROMPTS.bookmarkClassification
    : prompt || DEFAULT_AI_PROMPTS.bookmarkClassification;
}

export const DEFAULT_AI_TASK_SETTINGS = {
  bookmarkClassification: {
    promptKey: "bookmarkClassification",
    batchSize: 10,
  },
  bookmarkIndexing: {
    promptKey: "bookmarkIndexing",
    batchSize: 50,
  },
};

export const DEFAULT_AI_REQUEST_SETTINGS = {
  apiMode: "chatCompletions",
  temperature: 0.2,
  maxTokens: 2048,
  timeoutMs: 90000,
  responseFormat: "json_schema",
  stream: false,
  customHeaders: "",
  customBody: "",
};

export const DEFAULT_AI_SETTINGS = {
  activeProviderId: "",
  providers: [],
  dataFields: ["title", "url"],
  promptTemplates: { ...DEFAULT_AI_PROMPTS },
  taskSettings: {
    bookmarkClassification: { ...DEFAULT_AI_TASK_SETTINGS.bookmarkClassification },
    bookmarkIndexing: { ...DEFAULT_AI_TASK_SETTINGS.bookmarkIndexing },
  },
};

export const BOOKMARK_SYNC_MODES = {
  manual: "手动同步",
  "popup-open": "打开 popup 时同步",
  background: "后台定时同步",
};

export const SYNC_STATUS_LABELS = {
  idle: "待同步",
  syncing: "同步中",
  success: "同步成功",
  error: "同步失败",
};

export const THEME_PRESETS = {
  forest: {
    name: "松绿色",
    vars: {
      "--bg": "#f6f7f3",
      "--surface": "#ffffff",
      "--surface-soft": "#f1f5ee",
      "--ink": "#17201c",
      "--muted": "#68736f",
      "--faint": "#8b9691",
      "--line": "#dce3de",
      "--accent": "#207457",
      "--accent-strong": "#155b44",
      "--warm": "#b86f27",
    },
  },
  ocean: {
    name: "海蓝色",
    vars: {
      "--bg": "#f4f8fb",
      "--surface": "#ffffff",
      "--surface-soft": "#edf4f9",
      "--ink": "#17201c",
      "--muted": "#68736f",
      "--faint": "#8b9691",
      "--line": "#dce3de",
      "--accent": "#256f9f",
      "--accent-strong": "#17577e",
      "--warm": "#a66b2d",
    },
  },
  berry: {
    name: "莓红色",
    vars: {
      "--bg": "#faf6f7",
      "--surface": "#ffffff",
      "--surface-soft": "#f7eef1",
      "--ink": "#17201c",
      "--muted": "#68736f",
      "--faint": "#8b9691",
      "--line": "#dce3de",
      "--accent": "#a93f63",
      "--accent-strong": "#822d4a",
      "--warm": "#a87325",
    },
  },
  graphite: {
    name: "石墨色",
    vars: {
      "--bg": "#f6f6f4",
      "--surface": "#ffffff",
      "--surface-soft": "#eeeeeb",
      "--ink": "#17201c",
      "--muted": "#68736f",
      "--faint": "#8b9691",
      "--line": "#dce3de",
      "--accent": "#58615c",
      "--accent-strong": "#343c38",
      "--warm": "#9a6b32",
    },
  },
  dark: {
    name: "暗夜模式",
    vars: {
      "--bg": "#1a1d20",
      "--surface": "#252830",
      "--surface-soft": "#2f333a",
      "--ink": "#e2e4e3",
      "--muted": "#9ba09d",
      "--faint": "#6d7270",
      "--line": "#3d4245",
      "--accent": "#4da37a",
      "--accent-strong": "#6bc49a",
      "--warm": "#d4944a",
    },
  },
};

export const ANALYSIS_FIELD_OPTIONS = [
  { id: "title", label: "网页名" },
  { id: "url", label: "完整网址" },
  { id: "domain", label: "仅网站域名" },
  { id: "folderPath", label: "浏览器收藏夹路径" },
  { id: "categories", label: "已有分类" },
];

export const DEFAULT_CATEGORY_TREE = {
  id: "root",
  name: "全部分类",
  children: [
    {
      id: "music",
      name: "音乐",
      children: [
        {
          id: "music-pop",
          name: "流行乐",
          children: [
            { id: "music-pop-cn", name: "华语流行" },
            { id: "music-pop-western", name: "欧美流行" },
          ],
        },
        { id: "music-classical", name: "古典" },
      ],
    },
    {
      id: "video",
      name: "视频",
      children: [
        { id: "video-long", name: "长视频" },
        { id: "video-short", name: "短视频" },
      ],
    },
    {
      id: "tools",
      name: "工具",
      children: [
        { id: "tools-dev", name: "开发工具" },
        { id: "tools-productivity", name: "效率工具" },
      ],
    },
    {
      id: "study",
      name: "学习",
      children: [
        { id: "study-docs", name: "文档资料" },
        { id: "study-courses", name: "课程" },
      ],
    },
    { id: "uncategorized", name: "默认" },
  ],
};

export function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

export function unique(items) {
  return Array.from(new Set(items));
}

export function sanitizeCategoryTree(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  const sanitize = (node) => ({
    id: String(node.id),
    name: String(node.name),
    children: Array.isArray(node.children) ? node.children.map(sanitize).filter(Boolean) : [],
  });

  return sanitize(value);
}

export function sanitizePopupSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    hoverDelayMs: clampNumber(input.hoverDelayMs, 120, 1200, DEFAULT_POPUP_SETTINGS.hoverDelayMs),
    shellAnimationMs: clampNumber(input.shellAnimationMs, 120, 900, DEFAULT_POPUP_SETTINGS.shellAnimationMs),
    columnAnimationMs: clampNumber(input.columnAnimationMs, 120, 900, DEFAULT_POPUP_SETTINGS.columnAnimationMs),
    expandDirection: input.expandDirection === "left-anchored" ? "left-anchored" : DEFAULT_POPUP_SETTINGS.expandDirection,
    submenuDirection: input.submenuDirection === "right" ? "right" : DEFAULT_POPUP_SETTINGS.submenuDirection,
  };
}

export function sanitizeAppearanceSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const themeId = THEME_PRESETS[input.themeId] ? input.themeId : DEFAULT_APPEARANCE_SETTINGS.themeId;
  return {
    themeId,
    customAccentColor: isHexColor(input.customAccentColor) ? input.customAccentColor : "",
    showFavicons: typeof input.showFavicons === "boolean" ? input.showFavicons : DEFAULT_APPEARANCE_SETTINGS.showFavicons,
  };
}

export function sanitizeBookmarkSyncSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const mode = Object.prototype.hasOwnProperty.call(BOOKMARK_SYNC_MODES, input.mode)
    ? input.mode
    : DEFAULT_BOOKMARK_SYNC_SETTINGS.mode;
  return {
    mode,
    controller: mode === "background" ? "background" : "popup",
    intervalMinutes: clampNumber(input.intervalMinutes, 15, 1440, DEFAULT_BOOKMARK_SYNC_SETTINGS.intervalMinutes),
  };
}

export function sanitizeBookmarkSyncMeta(value) {
  const input = value && typeof value === "object" ? value : {};
  const mode = Object.prototype.hasOwnProperty.call(BOOKMARK_SYNC_MODES, input.mode)
    ? input.mode
    : DEFAULT_BOOKMARK_SYNC_META.mode;
  const status = Object.prototype.hasOwnProperty.call(SYNC_STATUS_LABELS, input.status)
    ? input.status
    : DEFAULT_BOOKMARK_SYNC_META.status;
  return {
    lastSyncedAt: Number(input.lastSyncedAt) || 0,
    bookmarkCount: Number(input.bookmarkCount) || 0,
    source: typeof input.source === "string" ? input.source : DEFAULT_BOOKMARK_SYNC_META.source,
    mode,
    status,
    lastError: typeof input.lastError === "string" ? input.lastError : "",
  };
}

export function sanitizeLanguageSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    locale: input.locale === "zh-CN" ? "zh-CN" : DEFAULT_LANGUAGE_SETTINGS.locale,
  };
}

export function sanitizeAiSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const providers = Array.isArray(input.providers)
    ? input.providers
        .map((provider) => {
          if (!provider || typeof provider !== "object") {
            return null;
          }
          const id = String(provider.id || "").trim();
          if (!id) {
            return null;
          }
          const promptTemplates =
            provider.promptTemplates && typeof provider.promptTemplates === "object" ? provider.promptTemplates : {};
          const rawProviderClassificationPrompt =
            promptTemplates.bookmarkClassification ||
            provider.prompt ||
            input.promptTemplates?.bookmarkClassification ||
            DEFAULT_AI_PROMPTS.bookmarkClassification;
          return {
            id,
            name: String(provider.name || "未命名厂家").trim() || "未命名厂家",
            order: clampNumber(provider.order, -1000000, 1000000, 0),
            providerType: "openai-compatible",
            baseUrl: String(provider.baseUrl || "").trim(),
            apiKey: String(provider.apiKey || ""),
            model: String(provider.model || "").trim(),
            prompt: String(provider.prompt || ""),
            promptTemplates: {
              bookmarkClassification: sanitizeBookmarkClassificationPrompt(rawProviderClassificationPrompt),
              bookmarkIndexing: String(
                promptTemplates.bookmarkIndexing ||
                  input.promptTemplates?.bookmarkIndexing ||
                  DEFAULT_AI_PROMPTS.bookmarkIndexing
              ),
            },
            requestSettings: sanitizeAiRequestSettings(provider.requestSettings),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN"))
    : [];
  const providerIds = new Set(providers.map((provider) => provider.id));
  const activeProviderId = providerIds.has(input.activeProviderId)
    ? String(input.activeProviderId)
    : providers[0]?.id || "";
  const allowedFields = new Set(ANALYSIS_FIELD_OPTIONS.map((field) => field.id));
  const dataFields = unique(
    (Array.isArray(input.dataFields) ? input.dataFields : DEFAULT_AI_SETTINGS.dataFields)
      .map(String)
      .filter((field) => allowedFields.has(field))
  );
  const promptTemplates = input.promptTemplates && typeof input.promptTemplates === "object" ? input.promptTemplates : {};
  const rawBookmarkClassificationPrompt = String(
    promptTemplates.bookmarkClassification || promptTemplates.classification || ""
  );
  const bookmarkClassificationPrompt = sanitizeBookmarkClassificationPrompt(rawBookmarkClassificationPrompt);
  const taskSettings = input.taskSettings && typeof input.taskSettings === "object" ? input.taskSettings : {};
  const bookmarkClassificationTask =
    taskSettings.bookmarkClassification && typeof taskSettings.bookmarkClassification === "object"
      ? taskSettings.bookmarkClassification
      : {};
  return {
    activeProviderId,
    providers,
    dataFields: dataFields.length ? dataFields : [...DEFAULT_AI_SETTINGS.dataFields],
    promptTemplates: {
      bookmarkClassification: bookmarkClassificationPrompt,
      ruleGeneration: String(promptTemplates.ruleGeneration || DEFAULT_AI_PROMPTS.ruleGeneration),
      bookmarkIndexing: String(promptTemplates.bookmarkIndexing || DEFAULT_AI_PROMPTS.bookmarkIndexing),
    },
    taskSettings: {
      bookmarkClassification: {
        promptKey: DEFAULT_AI_TASK_SETTINGS.bookmarkClassification.promptKey,
        batchSize: clampNumber(
          bookmarkClassificationTask.batchSize,
          1,
          500,
          DEFAULT_AI_TASK_SETTINGS.bookmarkClassification.batchSize
        ),
      },
      bookmarkIndexing: {
        promptKey: DEFAULT_AI_TASK_SETTINGS.bookmarkIndexing.promptKey,
        batchSize: clampNumber(
          taskSettings.bookmarkIndexing?.batchSize,
          1,
          500,
          DEFAULT_AI_TASK_SETTINGS.bookmarkIndexing.batchSize
        ),
      },
    },
  };
}

export function sanitizeAiRequestSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const apiMode = input.apiMode === "responses" ? "responses" : DEFAULT_AI_REQUEST_SETTINGS.apiMode;
  const responseFormat = ["text", "json_object", "json_schema"].includes(input.responseFormat)
    ? input.responseFormat
    : DEFAULT_AI_REQUEST_SETTINGS.responseFormat;

  return {
    apiMode,
    temperature: clampNumber(input.temperature, 0, 2, DEFAULT_AI_REQUEST_SETTINGS.temperature),
    maxTokens: clampNumber(input.maxTokens, 1, 1000000, DEFAULT_AI_REQUEST_SETTINGS.maxTokens),
    timeoutMs: clampNumber(input.timeoutMs, 1000, 600000, DEFAULT_AI_REQUEST_SETTINGS.timeoutMs),
    responseFormat,
    stream: input.stream === true,
    customHeaders: String(input.customHeaders || ""),
    customBody: String(input.customBody || ""),
  };
}

export function sanitizeClassificationRules(value) {
  if (!value || typeof value !== "object") {
    return cloneValue(DEFAULT_CLASSIFICATION_RULES);
  }

  const input = value;
  const allowedFields = new Set(["title", "url", "domain", "folderPath"]);
  const allowedTypes = new Set(["contains", "equals", "startsWith", "regex"]);

  const sanitizeRule = (rule) => {
    if (!rule || typeof rule !== "object") {
      return null;
    }
    const fields = unique(
      (Array.isArray(rule.fields) ? rule.fields : [rule.field || "title"])
        .map(String)
        .filter((field) => allowedFields.has(field))
    );
    const rawType = Array.isArray(rule.types) ? rule.types[0] : rule.type;
    const type = allowedTypes.has(String(rawType)) ? String(rawType) : "contains";
    return {
      id: String(rule.id || ""),
      name: String(rule.name || ""),
      field: fields[0] || "title",
      type,
      fields: fields.length ? fields : ["title"],
      pattern: String(rule.pattern || ""),
      categoryIds: Array.isArray(rule.categoryIds) ? unique(rule.categoryIds.map(String)) : [],
      note: String(rule.note || ""),
    };
  };

  const legacyRules = Array.isArray(input.rules)
    ? input.rules.map(sanitizeRule).filter((rule) => rule && rule.id)
    : [];
  const groups = Array.isArray(input.groups)
    ? input.groups
        .map((group, index) => {
          if (!group || typeof group !== "object") {
            return null;
          }
          const id = String(group.id || "");
          const rules = Array.isArray(group.rules)
            ? group.rules.map(sanitizeRule).filter((rule) => rule && rule.id)
            : [];
          return {
            id,
            name: String(group.name || ""),
            type: group.type === "remove" ? "remove" : "classify",
            order: Number(group.order) || index + 1,
            rules,
          };
        })
        .filter((group) => group && group.id)
    : [];

  if (!groups.length && legacyRules.length) {
    groups.push({
      id: "group-migrated-classify",
      name: "已迁移归类规则组",
      type: "classify",
      order: 1,
      rules: legacyRules,
    });
  }

  return {
    version: DEFAULT_CLASSIFICATION_RULES.version,
    groups,
  };
}

export function sanitizeBookmarkSnapshot(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((bookmark) => {
      if (!bookmark || typeof bookmark !== "object" || !bookmark.id || !bookmark.url) {
        return null;
      }
      const url = String(bookmark.url);
      return {
        id: String(bookmark.id),
        title: String(bookmark.title || url),
        url,
        domain: String(bookmark.domain || getDomain(url)),
        folderPath: Array.isArray(bookmark.folderPath) ? bookmark.folderPath.map(String) : [],
        faviconUrl: getFaviconUrl(url),
      };
    })
    .filter(Boolean);
}

export function sanitizeBookmarkCategoryLinks(value, categoryTree = DEFAULT_CATEGORY_TREE) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const validCategoryIds = getCategoryIdSet(categoryTree);
  const entries = Object.entries(value)
    .filter(([, categoryIds]) => Array.isArray(categoryIds))
    .map(([bookmarkId, categoryIds]) => [
      String(bookmarkId),
      unique(categoryIds.map(String).filter((id) => validCategoryIds.has(id) && id !== "root")),
    ])
    .filter(([, categoryIds]) => categoryIds.length);

  return Object.fromEntries(entries);
}

export function reconcileBookmarkLinks(storedLinks, bookmarks, categoryTree = DEFAULT_CATEGORY_TREE) {
  const validCategoryIds = getCategoryIdSet(categoryTree);
  const bookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));
  const input = storedLinks && typeof storedLinks === "object" ? storedLinks : {};
  const links = {};
  let changed = !storedLinks;

  for (const bookmark of bookmarks) {
    const storedIds = Array.isArray(input[bookmark.id]) ? input[bookmark.id] : [];
    const cleaned = unique(storedIds.filter((id) => validCategoryIds.has(id) && id !== "root"));
    links[bookmark.id] = cleaned.length ? cleaned : ["uncategorized"];

    if (!arraysEqual(storedIds, links[bookmark.id])) {
      changed = true;
    }
  }

  for (const storedId of Object.keys(input)) {
    if (!bookmarkIds.has(storedId)) {
      changed = true;
    }
  }

  return { links, changed };
}

export function flattenBookmarks(nodes) {
  const bookmarks = [];

  const visit = (node, folderPath) => {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        domain: getDomain(node.url),
        folderPath,
        faviconUrl: getFaviconUrl(node.url),
      });
      return;
    }

    const nextPath = node.title ? [...folderPath, node.title] : folderPath;
    for (const child of node.children || []) {
      visit(child, nextPath);
    }
  };

  for (const node of nodes || []) {
    visit(node, []);
  }

  return bookmarks;
}

export function createCategoryIndexes(categoryTree) {
  const categoryById = new Map();
  const parentById = new Map();

  const visit = (node, parentId = "") => {
    categoryById.set(node.id, node);
    if (parentId) {
      parentById.set(node.id, parentId);
    }
    for (const child of node.children || []) {
      visit(child, node.id);
    }
  };

  visit(categoryTree);
  return { categoryById, parentById };
}

export function getPathToCategory(categoryId, parentById) {
  if (!categoryId || categoryId === "root") {
    return [];
  }
  const path = [];
  let currentId = categoryId;
  while (currentId && currentId !== "root") {
    path.unshift(currentId);
    currentId = parentById.get(currentId);
  }
  return path;
}

export function getCategoryIdSet(categoryTree) {
  const ids = new Set();
  const visit = (node) => {
    ids.add(node.id);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  visit(categoryTree);
  return ids;
}

export function getDescendantIds(categoryTree, categoryId) {
  const { categoryById } = createCategoryIndexes(categoryTree);
  const ids = new Set();
  const visit = (node) => {
    ids.add(node.id);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  const category = categoryById.get(categoryId);
  if (category) {
    visit(category);
  }
  return ids;
}

export function formatDateTime(timestamp) {
  if (!timestamp) {
    return "尚未同步";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getFaviconUrl(pageUrl) {
  try {
    const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
    faviconUrl.searchParams.set("pageUrl", pageUrl);
    faviconUrl.searchParams.set("size", "32");
    return faviconUrl.toString();
  } catch {
    return "";
  }
}

export function buildCategoryNamesList(categoryTree) {
  const entries = [];

  const visit = (node, path) => {
    if (node.id !== "root") {
      const fullPath = [...path, node.name];
      entries.push({
        id: node.id,
        name: node.name,
        path: fullPath.join(" / "),
        depth: fullPath.length,
      });
    }
    for (const child of node.children || []) {
      visit(child, node.id === "root" ? [] : [...path, node.name]);
    }
  };

  visit(categoryTree, []);
  return entries;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => item === b[index]);
}
