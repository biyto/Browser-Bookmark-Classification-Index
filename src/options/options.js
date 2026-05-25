import {
  ANALYSIS_FIELD_OPTIONS,
  BOOKMARK_SYNC_MODES,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_REQUEST_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_AI_TASK_SETTINGS,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_BOOKMARK_SYNC_META,
  DEFAULT_BOOKMARK_SYNC_SETTINGS,
  DEFAULT_CATEGORY_TREE,
  DEFAULT_CLASSIFICATION_RULES,
  DEFAULT_LANGUAGE_SETTINGS,
  DEFAULT_POPUP_SETTINGS,
  STORAGE_KEYS,
  SYNC_STATUS_LABELS,
  THEME_PRESETS,
  buildCategoryNamesList,
  clampNumber,
  cloneValue,
  createCategoryIndexes,
  formatDateTime,
  getCategoryIdSet,
  getDescendantIds,
  getPathToCategory,
  sanitizeAiSettings,
  sanitizeAiRequestSettings,
  sanitizeAppearanceSettings,
  sanitizeBookmarkCategoryLinks,
  sanitizeBookmarkSnapshot,
  sanitizeBookmarkSyncMeta,
  sanitizeBookmarkSyncSettings,
  sanitizeCategoryTree,
  sanitizeClassificationRules,
  sanitizeLanguageSettings,
  sanitizePopupSettings,
  unique,
} from "../shared/storage.js";

const MAX_BOOKMARK_ROWS = 120;
const MIN_AI_RETRY_BATCH_SIZE = 1;
const AI_TAXONOMY_DRAFT_PROMPT = [
  "你是中文书签分类体系规划助手。请同时整理分类体系草案，并给出本批书签的临时归类建议。",
  "已生效分组是用户当前正在使用的本地分类，必须优先沿用，不要改名、合并或移动。",
  "候选分组是前面批次尚未应用的建议，可以合并、改名或上提到更宽泛的父级。",
  "一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。",
  "禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类；这类内容应放到更宽泛一级类下面。",
  "如果多个候选分组能被更宽泛的分组囊括，请返回 changes 记录，把旧候选路径合并或改名到新路径。",
  "每个新分类路径最多 3 层，路径层级使用 / 分隔。",
  "当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。",
  "assignments 必须使用已生效分组、候选分组或本次 newGroups / changes 后的新路径；后续本地会按 changes 自动修正旧路径。",
  "必须只返回 JSON 对象，顶层包含 newGroups、changes 和 assignments，不要返回 Markdown 或额外说明。",
  "每个 assignment 的 categories 是数组；若一个书签同时适合多个彼此独立的分类场景，应返回 2-3 个分类路径，不要为了省事只给单一分类。",
  "分类优先级必须是：优先使用多个已生效分组或候选分组组合归类，其次才考虑新增候选分组。",
  "不要为了让某个书签看起来有更精确的单一分类而创建新分类；如果多个现有分类标签组合后已经能表达它，就直接使用这些分类标签。",
  "只有当已生效分组和候选分组的多标签组合仍然无法覆盖一批书签的共同用途时，才允许在 newGroups 中提出新分组。",
  "多标签判断要主动执行：先分别判断书签的内容主题、使用目的、工具属性、所属平台/资源类型，只要命中两个互不包含的维度，就必须给多个分类路径。",
  "不要因为某一个分类已经足够描述书签就停止判断；例如开发文档同时属于 学习/技术 和 工具/开发，音乐软件同时属于 娱乐/音乐 和 工具/创作，设计素材站同时属于 创作/设计 和 资源/素材。",
  "只有当其它候选分类与主分类明显是父子包含关系或语义重复时，才返回 1 个分类路径；否则优先保留多个独立标签。",
  "例如同一书签既是开发资料又是设计资料时，可同时归入 工具/开发 和 创作/设计；同一音乐制作工具可同时归入 娱乐/音乐 和 工具/创作。",
].join("\n");
const AI_CLASSIFICATION_FIELD_GROUPS = [
  {
    title: "必要信息",
    description: "建议保留网页名。完整网址已经包含域名和路径，通常不需要再单独发送域名。",
    fieldIds: ["title", "url"],
  },
  {
    title: "补充上下文",
    description: "仅在需要参考原收藏夹路径或旧分类时开启，会增加请求内容长度。",
    fieldIds: ["folderPath", "categories"],
  },
  {
    title: "精简网址",
    description: "只想发送网站来源、不发送完整路径时使用。若同时选择完整网址，保存时会自动保留完整网址。",
    fieldIds: ["domain"],
  },
];
const RULE_FIELD_OPTIONS = [
  { id: "title", label: "网页名", help: "用复写内容去查书签标题，例如标题里包含“React”就命中" },
  { id: "url", label: "URL", help: "用复写内容去查完整网址，例如匹配 /docs/ 或某段链接路径" },
  { id: "domain", label: "域名", help: "用复写内容去查网站域名，例如 github.com、developer.chrome.com" },
  { id: "folderPath", label: "浏览器收藏夹路径", help: "用复写内容去查原收藏夹路径，例如 工具 / 文档" },
];
const RULE_TYPE_OPTIONS = [
  { id: "contains", label: "包含关键词", help: "填写普通词或域名片段，一行一个，例如 github.com" },
  { id: "equals", label: "完全等于", help: "填写完整字段值，必须一字不差才命中" },
  { id: "startsWith", label: "以前缀开头", help: "填写字段开头部分，例如 https://developer.chrome.com" },
  { id: "regex", label: "正则表达式", help: "填写正则表达式，例如 ^https://.*\\.mozilla\\.org" },
];
const RULE_GROUP_TYPES = {
  classify: {
    label: "归类规则组",
    actionLabel: "归入",
    emptyText: "把未分类书签归入指定分类",
  },
  remove: {
    label: "移出分类规则组",
    actionLabel: "移出",
    emptyText: "把已分类书签从指定分类移出",
  },
};

const state = {
  categoryTree: cloneValue(DEFAULT_CATEGORY_TREE),
  categoryById: new Map(),
  parentById: new Map(),
  bookmarks: [],
  bookmarkCategoryLinks: {},
  popupSettings: { ...DEFAULT_POPUP_SETTINGS },
  appearanceSettings: { ...DEFAULT_APPEARANCE_SETTINGS },
  syncSettings: { ...DEFAULT_BOOKMARK_SYNC_SETTINGS },
  syncMeta: { ...DEFAULT_BOOKMARK_SYNC_META },
  languageSettings: { ...DEFAULT_LANGUAGE_SETTINGS },
  aiSettings: sanitizeAiSettings(DEFAULT_AI_SETTINGS),
  classificationRules: cloneValue(DEFAULT_CLASSIFICATION_RULES),
  activeSection: "basic",
  expandedCategoryIds: new Set(),
  editingCategoryId: null,
  selectedCategoryId: null,
  showBookmarkPanel: false,
  batchManageEnabled: false,
  selectedCategoryIds: new Set(),
  selectedBookmarkIds: new Set(),
  bookmarkMenuOpenId: null,
  bookmarkDragMode: "move",
  pendingCategoryTree: null,
  pendingBookmarkLinks: null,
  isAiClassificationRunning: false,
  pendingAiClassificationTask: null,
  pendingAiClassificationPreview: null,
  pendingAiTaxonomyDraft: null,
  ruleFormExpanded: false,
  ruleFormType: "classify",
  editingRuleGroupId: null,
  editingRuleId: null,
  expandedRuleGroupId: null,
  rulePreviewMatches: [],
  dragCategoryId: null,
  dragCategoryIds: [],
  dragBookmarkId: null,
  dragBookmarkMode: null,
  faviconLoadState: new Map(),
  expandLevel: 0,
};

const elements = {};

init().catch((error) => {
  console.error(error);
  showStatus(error instanceof Error ? error.message : "后台控制页加载失败", true);
});

async function init() {
  collectElements();
  bindEvents();
  renderThemeOptions();
  renderAnalysisFieldOptions();
  setExtensionVersion();
  await loadState();
  renderAll();
  showStatus("已加载");
}

function collectElements() {
  const ids = [
    "sectionTitle",
    "sectionLead",
    "themeSelect",
    "showFavicons",
    "customAccentEnabled",
    "customAccentColor",
    "hoverDelayMs",
    "shellAnimationMs",
    "columnAnimationMs",
    "localeSelect",
    "saveBasicSettings",
    "syncMode",
    "syncInterval",
    "syncModeHint",
    "runManualSync",
    "lastSyncedAt",
    "syncedBookmarkCount",
    "syncStatus",
    "syncSource",
    "syncErrorPanel",
    "syncErrorText",
    "categoryTreeView",
    "bookmarkSummary",
    "bookmarkFilter",
    "bookmarkSearch",
    "bookmarksList",
    "rulesList",
    "ruleFormPanel",
    "ruleFormBody",
    "ruleFormTitle",
    "toggleRuleForm",
    "newClassifyRuleGroup",
    "newRemoveRuleGroup",
    "ruleGroupName",
    "ruleGroupTypeLabel",
    "ruleName",
    "ruleCategoryLabel",
    "ruleFieldList",
    "ruleTypeList",
    "ruleCategoryList",
    "ruleCategoryLevel",
    "rulePattern",
    "ruleNote",
    "saveRule",
    "resetRuleForm",
    "previewAllRules",
    "applyAllRules",
    "runAiClassifyUnprocessed",
    "aiClassificationStatus",
    "aiClassificationStatusTitle",
    "aiClassificationStatusDetail",
    "selectAllAiClassification",
    "clearAiClassificationSelection",
    "openAiSettingsFromRules",
    "aiClassifyProviderStatus",
    "aiClassifyBatchSizeLabel",
    "aiClassifyFieldList",
    "aiClassifyGroupState",
    "aiClassifyTargetCount",
    "aiClassifyResultShape",
    "aiClassificationPreviewPanel",
    "aiClassificationPreviewSummary",
    "aiClassificationPreviewList",
    "applyAiClassification",
    "discardAiClassification",
    "rulePreviewSummary",
    "rulePreviewList",
    "aiProviderName",
    "aiProviderOrder",
    "aiProviderType",
    "aiProviderUrl",
    "aiProviderKey",
    "aiProviderModel",
    "aiProviderApiMode",
    "aiProviderResponseFormat",
    "aiProviderTemperature",
    "aiProviderMaxTokens",
    "aiProviderTimeoutMs",
    "aiProviderStream",
    "aiProviderHeaders",
    "aiProviderBody",
    "aiProviderClassificationPrompt",
    "aiProviderIndexingPrompt",
    "addAiProvider",
    "testNewAiProvider",
    "testActiveAiProvider",
    "aiProvidersList",
    "aiProviderSummary",
    "analysisFieldList",
    "classificationBatchSize",
    "indexingBatchSize",
    "saveAiSettings",
    "extensionVersion",
    "showBookmarkPanel",
    "batchManageEnabled",
    "dragModeMove",
    "dragModeCopy",
    "addRootCategory",
    "expandLevel",
    "exportCategoryData",
    "importCategoryMode",
    "importCategoryData",
    "importCategoryFile",
    "confirmCategoryChanges",
    "discardCategoryChanges",
    "catSplit",
    "catTreePanel",
    "catBookmarkPanel",
    "selectedCategoryLabel",
    "selectedCategoryBookmarkCount",
    "catBookmarksList",
    "categoryPendingHint",
    "bookmarkPendingHint",
    "confirmBookmarkChanges",
    "discardBookmarkChanges",
    "exportBeforeClear",
    "clearExtensionData",
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  elements.saveBasicSettings.addEventListener("click", saveBasicSettings);
  elements.themeSelect.addEventListener("change", previewAppearance);
  elements.customAccentEnabled.addEventListener("change", previewAppearance);
  elements.customAccentColor.addEventListener("input", previewAppearance);

  elements.syncMode.addEventListener("change", updateSyncIntervalState);
  elements.runManualSync.addEventListener("click", runManualSync);

  elements.bookmarkFilter.addEventListener("change", renderBookmarksSection);
  elements.bookmarkSearch.addEventListener("input", renderBookmarksSection);

  elements.saveRule.addEventListener("click", saveRuleFromForm);
  elements.resetRuleForm.addEventListener("click", resetRuleForm);
  elements.toggleRuleForm.addEventListener("click", toggleRuleForm);
  elements.newClassifyRuleGroup.addEventListener("click", () => startRuleGroupForm("classify"));
  elements.newRemoveRuleGroup.addEventListener("click", () => startRuleGroupForm("remove"));
  elements.ruleCategoryLevel.addEventListener("change", renderRulesSection);
  elements.previewAllRules.addEventListener("click", previewAllRules);
  elements.applyAllRules.addEventListener("click", applyAllRules);
  elements.runAiClassifyUnprocessed.addEventListener("click", () =>
    runAiClassification({ reclassifyAll: false, source: "categories-unclassified" })
  );
  elements.selectAllAiClassification.addEventListener("click", () => setAiClassificationSelection(true));
  elements.clearAiClassificationSelection.addEventListener("click", () => setAiClassificationSelection(false));
  elements.applyAiClassification.addEventListener("click", applyAiClassificationPreview);
  elements.discardAiClassification.addEventListener("click", discardAiClassificationPreview);
  elements.openAiSettingsFromRules.addEventListener("click", () => showSection("ai"));
  elements.rulesList.addEventListener("click", handleRulesListClick);
  elements.rulePreviewList.addEventListener("change", handleRulePreviewChange);
  elements.aiClassificationPreviewList.addEventListener("change", handleAiClassificationPreviewChange);

  elements.addAiProvider.addEventListener("click", addAiProvider);
  elements.testNewAiProvider.addEventListener("click", testNewAiProvider);
  elements.testActiveAiProvider.addEventListener("click", testActiveAiProvider);
  elements.saveAiSettings.addEventListener("click", saveAiSettings);
  elements.aiProvidersList.addEventListener("click", handleProviderListClick);
  elements.aiProvidersList.addEventListener("toggle", handleProviderListToggle, true);

  elements.showBookmarkPanel.addEventListener("change", async () => {
    state.showBookmarkPanel = elements.showBookmarkPanel.checked;
    state.selectedCategoryId = null;
    state.selectedBookmarkIds.clear();
    await saveCategoryPanelState();
    renderCategoriesSection();
  });
  elements.batchManageEnabled.addEventListener("change", async () => {
    state.batchManageEnabled = elements.batchManageEnabled.checked;
    state.selectedCategoryIds.clear();
    state.selectedBookmarkIds.clear();
    await saveCategoryPanelState();
    renderCategoriesSection();
  });
  [elements.dragModeMove, elements.dragModeCopy].forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      state.bookmarkDragMode = input.value === "copy" ? "copy" : "move";
      await saveCategoryPanelState();
      renderCategoriesSection();
    });
  });
  elements.addRootCategory.addEventListener("click", () => addCategory("root"));
  elements.exportCategoryData.addEventListener("click", exportCategoryData);
  elements.importCategoryData.addEventListener("click", () => elements.importCategoryFile.click());
  elements.importCategoryFile.addEventListener("change", importCategoryDataFromFile);
  elements.confirmCategoryChanges.addEventListener("click", confirmCategoryChanges);
  elements.discardCategoryChanges.addEventListener("click", discardCategoryChanges);
  elements.confirmBookmarkChanges.addEventListener("click", confirmBookmarkChanges);
  elements.discardBookmarkChanges.addEventListener("click", discardBookmarkChanges);
  elements.categoryTreeView.addEventListener("click", handleTreeViewClick);
  elements.categoryTreeView.addEventListener("change", handleTreeViewChange);
  elements.categoryTreeView.addEventListener("dragstart", handleTreeDragStart);
  elements.categoryTreeView.addEventListener("dragover", handleTreeDragOver);
  elements.categoryTreeView.addEventListener("drop", handleTreeDrop);
  elements.categoryTreeView.addEventListener("dragend", handleTreeDragEnd);
  elements.catBookmarksList.addEventListener("change", handleBookmarkPanelChange);
  elements.catBookmarksList.addEventListener("click", handleBookmarkPanelClick);
  elements.catBookmarksList.addEventListener("dragstart", handleBookmarkPanelDragStart);
  elements.catBookmarksList.addEventListener("dragend", handleBookmarkPanelDragEnd);
  elements.expandLevel.addEventListener("change", () => {
    state.expandLevel = Number(elements.expandLevel.value) || 0;
    applyExpandLevel();
    renderCategoriesSection();
  });
  elements.exportBeforeClear.addEventListener("click", exportCategoryData);
  elements.clearExtensionData.addEventListener("click", clearExtensionLocalData);
}

async function loadState() {
  const stored = await chromeStorageGet([
    STORAGE_KEYS.categoryTree,
    STORAGE_KEYS.bookmarkSnapshot,
    STORAGE_KEYS.bookmarkCategoryLinks,
    STORAGE_KEYS.popupSettings,
    STORAGE_KEYS.appearanceSettings,
    STORAGE_KEYS.bookmarkSyncSettings,
    STORAGE_KEYS.bookmarkSyncMeta,
    STORAGE_KEYS.languageSettings,
    STORAGE_KEYS.aiSettings,
    STORAGE_KEYS.classificationRules,
    STORAGE_KEYS.categoryNamesList,
    STORAGE_KEYS.catPanelState,
  ]);

  state.categoryTree = sanitizeCategoryTree(stored[STORAGE_KEYS.categoryTree]) || cloneValue(DEFAULT_CATEGORY_TREE);
  migrateDefaultCategoryName(state.categoryTree);
  state.popupSettings = sanitizePopupSettings(stored[STORAGE_KEYS.popupSettings]);
  state.appearanceSettings = sanitizeAppearanceSettings(stored[STORAGE_KEYS.appearanceSettings]);
  state.syncSettings = sanitizeBookmarkSyncSettings(stored[STORAGE_KEYS.bookmarkSyncSettings]);
  state.syncMeta = sanitizeBookmarkSyncMeta(stored[STORAGE_KEYS.bookmarkSyncMeta]);
  state.languageSettings = sanitizeLanguageSettings(stored[STORAGE_KEYS.languageSettings]);
  state.aiSettings = sanitizeAiSettings(stored[STORAGE_KEYS.aiSettings]);
  state.classificationRules = sanitizeClassificationRules(stored[STORAGE_KEYS.classificationRules]);
  const shouldSaveMigratedRules =
    stored[STORAGE_KEYS.classificationRules] &&
    Number(stored[STORAGE_KEYS.classificationRules].version || 1) < DEFAULT_CLASSIFICATION_RULES.version;
  state.bookmarks = sanitizeBookmarkSnapshot(stored[STORAGE_KEYS.bookmarkSnapshot]);
  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(stored[STORAGE_KEYS.bookmarkCategoryLinks], state.categoryTree);
  rebuildCategoryIndexes();

  const panelState = stored[STORAGE_KEYS.catPanelState];
  if (panelState && typeof panelState === "object") {
    state.showBookmarkPanel = Boolean(panelState.showBookmarkPanel);
    state.batchManageEnabled = Boolean(panelState.batchManageEnabled);
    state.bookmarkDragMode = panelState.bookmarkDragMode === "copy" ? "copy" : "move";
  }

  const nextStorage = {};
  if (!stored[STORAGE_KEYS.categoryTree]) {
    nextStorage[STORAGE_KEYS.categoryTree] = state.categoryTree;
  }
  if (!stored[STORAGE_KEYS.popupSettings]) {
    nextStorage[STORAGE_KEYS.popupSettings] = state.popupSettings;
  }
  if (!stored[STORAGE_KEYS.appearanceSettings]) {
    nextStorage[STORAGE_KEYS.appearanceSettings] = state.appearanceSettings;
  }
  if (!stored[STORAGE_KEYS.bookmarkSyncSettings]) {
    nextStorage[STORAGE_KEYS.bookmarkSyncSettings] = state.syncSettings;
  }
  if (!stored[STORAGE_KEYS.bookmarkSyncMeta]) {
    nextStorage[STORAGE_KEYS.bookmarkSyncMeta] = state.syncMeta;
  }
  if (!stored[STORAGE_KEYS.languageSettings]) {
    nextStorage[STORAGE_KEYS.languageSettings] = state.languageSettings;
  }
  if (!stored[STORAGE_KEYS.aiSettings]) {
    nextStorage[STORAGE_KEYS.aiSettings] = state.aiSettings;
  }
  if (!stored[STORAGE_KEYS.classificationRules]) {
    nextStorage[STORAGE_KEYS.classificationRules] = state.classificationRules;
  } else if (shouldSaveMigratedRules) {
    nextStorage[STORAGE_KEYS.classificationRules] = state.classificationRules;
  }

  if (Object.keys(nextStorage).length) {
    await chromeStorageSet(nextStorage);
  }
}

function renderAll() {
  applyAppearanceSettings(state.appearanceSettings);
  renderBasicSection();
  renderCategoriesSection();
  renderBookmarksSection();
  renderRulesSection();
  renderAiSection();
}

function showSection(sectionId) {
  if (!sectionId) {
    return;
  }

  state.activeSection = sectionId;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".section-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `section-${sectionId}`);
  });

  const activePanel = document.getElementById(`section-${sectionId}`);
  elements.sectionTitle.textContent = activePanel?.dataset.title || "后台控制";
  elements.sectionLead.textContent = activePanel?.dataset.lead || "";

  if (sectionId !== "categories") {
    rebuildCategoryIndexes();
  }
}

function renderThemeOptions() {
  elements.themeSelect.textContent = "";
  for (const [themeId, theme] of Object.entries(THEME_PRESETS)) {
    const option = document.createElement("option");
    option.value = themeId;
    option.textContent = theme.name;
    elements.themeSelect.append(option);
  }
}

function renderAnalysisFieldOptions() {
  elements.analysisFieldList.textContent = "";
  for (const groupInfo of AI_CLASSIFICATION_FIELD_GROUPS) {
    const group = document.createElement("section");
    group.className = "analysis-field-group";
    const title = document.createElement("strong");
    title.textContent = groupInfo.title;
    const description = document.createElement("small");
    description.textContent = groupInfo.description;
    const options = document.createElement("div");
    options.className = "analysis-field-options";

    for (const fieldId of groupInfo.fieldIds) {
      const field = ANALYSIS_FIELD_OPTIONS.find((option) => option.id === fieldId);
      if (!field) {
        continue;
      }
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = field.id;
      input.dataset.analysisField = field.id;
      const text = document.createElement("span");
      text.textContent = field.label;
      label.append(input, text);
      options.append(label);
    }

    group.append(title, description, options);
    elements.analysisFieldList.append(group);
  }
}

function renderBasicSection() {
  const accentColor = state.appearanceSettings.customAccentColor || getPresetAccent(state.appearanceSettings.themeId);
  elements.themeSelect.value = state.appearanceSettings.themeId;
  elements.showFavicons.checked = state.appearanceSettings.showFavicons;
  elements.customAccentEnabled.checked = Boolean(state.appearanceSettings.customAccentColor);
  elements.customAccentColor.value = accentColor;
  elements.customAccentColor.disabled = !elements.customAccentEnabled.checked;
  elements.hoverDelayMs.value = String(state.popupSettings.hoverDelayMs);
  elements.shellAnimationMs.value = String(state.popupSettings.shellAnimationMs);
  elements.columnAnimationMs.value = String(state.popupSettings.columnAnimationMs);
  elements.localeSelect.value = state.languageSettings.locale;

  elements.syncMode.value = state.syncSettings.mode;
  elements.syncInterval.value = String(state.syncSettings.intervalMinutes);
  elements.syncModeHint.textContent = `当前为${BOOKMARK_SYNC_MODES[state.syncSettings.mode] || BOOKMARK_SYNC_MODES.manual}`;
  elements.lastSyncedAt.textContent = formatDateTime(state.syncMeta.lastSyncedAt);
  elements.syncedBookmarkCount.textContent = String(state.syncMeta.bookmarkCount);
  elements.syncStatus.textContent = SYNC_STATUS_LABELS[state.syncMeta.status] || SYNC_STATUS_LABELS.idle;
  elements.syncSource.textContent = state.syncMeta.source || DEFAULT_BOOKMARK_SYNC_META.source;
  elements.syncErrorPanel.hidden = state.syncMeta.status !== "error" || !state.syncMeta.lastError;
  elements.syncErrorText.textContent = state.syncMeta.lastError;
  updateSyncIntervalState();
}

function renderCategoriesSection() {
  const tree = getWorkingTree();
  const isSplit = state.showBookmarkPanel;

  elements.showBookmarkPanel.checked = isSplit;
  elements.batchManageEnabled.checked = state.batchManageEnabled;
  elements.dragModeMove.checked = state.bookmarkDragMode === "move";
  elements.dragModeCopy.checked = state.bookmarkDragMode === "copy";
  elements.catSplit.classList.toggle("is-split", isSplit);
  elements.catBookmarkPanel.hidden = !isSplit;

  rebuildWorkingIndexes();

  populateExpandLevelSelect(tree);

  elements.categoryTreeView.textContent = "";
  if (state.batchManageEnabled) {
    elements.categoryTreeView.append(renderCategoryBatchToolbar(tree));
  } else {
    state.selectedCategoryIds.clear();
  }
  const treeList = document.createElement("ul");
  treeList.className = "tree-list";
  if (tree && tree.children) {
    for (const child of tree.children) {
      treeList.append(renderCategoryTreeNode(child, 0));
    }
  }
  elements.categoryTreeView.append(treeList);

  if (isSplit) {
    renderBookmarkPanel();
  }

  renderAiClassificationEntry();
  renderAiClassificationPreview();
  updatePendingHints();
}

function renderCategoryBatchToolbar(tree) {
  const toolbar = document.createElement("div");
  toolbar.className = "category-batch-toolbar";

  const movableIds = getMovableCategoryIds(tree);
  const selectedCount = movableIds.filter((id) => state.selectedCategoryIds.has(id)).length;

  const selectAllLabel = document.createElement("label");
  selectAllLabel.className = "batch-select-all";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.dataset.action = "toggleVisibleCategories";
  selectAll.checked = Boolean(movableIds.length) && selectedCount === movableIds.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < movableIds.length;
  const selectAllText = document.createElement("span");
  selectAllText.textContent = `已选 ${selectedCount} 个分类`;
  selectAllLabel.append(selectAll, selectAllText);

  toolbar.append(selectAllLabel, createBookmarkActionButton("clearCategorySelection", "", "清空选择", "ghost-button"));
  return toolbar;
}

async function saveCategoryPanelState() {
  await chromeStorageSet({
    [STORAGE_KEYS.catPanelState]: {
      showBookmarkPanel: state.showBookmarkPanel,
      batchManageEnabled: state.batchManageEnabled,
      bookmarkDragMode: state.bookmarkDragMode,
    },
  });
}

function populateExpandLevelSelect(tree) {
  const maxDepth = getTreeMaxDepth(tree);
  elements.expandLevel.textContent = "";
  for (let i = 0; i <= maxDepth; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i === 0 ? "收起全部" : `展开 ${i} 级`;
    elements.expandLevel.append(option);
  }
  elements.expandLevel.value = String(state.expandLevel);
}

function getTreeMaxDepth(node, currentDepth = 0) {
  if (!node.children || !node.children.length) return currentDepth;
  let max = currentDepth;
  for (const child of node.children) {
    const childMax = getTreeMaxDepth(child, currentDepth + 1);
    if (childMax > max) max = childMax;
  }
  return max;
}

function applyExpandLevel() {
  const tree = getWorkingTree();
  state.expandedCategoryIds = new Set();
  if (state.expandLevel <= 0) return;

  const collectAtDepth = (node, depth) => {
    if (depth >= state.expandLevel) return;
    if (node.children && node.children.length) {
      state.expandedCategoryIds.add(node.id);
      for (const child of node.children) {
        collectAtDepth(child, depth + 1);
      }
    }
  };
  collectAtDepth(tree, 0);
}

function renderBookmarksSection() {
  const query = normalizeText(elements.bookmarkSearch.value);
  const filter = elements.bookmarkFilter.value;
  const filteredBookmarks = state.bookmarks.filter((bookmark) => {
    const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
    const isUncategorized = linkedIds.includes("uncategorized");
    const matchesFilter = filter === "all" || isUncategorized;
    if (!matchesFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [bookmark.title, bookmark.domain, bookmark.url, getCategoryLabelsForBookmark(bookmark).join(" ")]
      .map(normalizeText)
      .some((text) => text.includes(query));
  });

  elements.bookmarkSummary.textContent = `${filteredBookmarks.length} / ${state.bookmarks.length} 个书签`;
  elements.bookmarksList.textContent = "";

  if (!state.bookmarks.length) {
    elements.bookmarksList.append(createEmptyNote("尚未同步书签，请先到同步管理中执行一次同步。"));
    return;
  }

  if (!filteredBookmarks.length) {
    elements.bookmarksList.append(createEmptyNote("没有匹配的书签。"));
    return;
  }

  for (const bookmark of filteredBookmarks.slice(0, MAX_BOOKMARK_ROWS)) {
    elements.bookmarksList.append(renderBookmarkItem(bookmark));
  }

  if (filteredBookmarks.length > MAX_BOOKMARK_ROWS) {
    elements.bookmarksList.append(createEmptyNote(`已显示前 ${MAX_BOOKMARK_ROWS} 个结果。`));
  }
}

function renderRulesSection() {
  renderRuleFormVisibility();
  renderRuleFormOptions();
  renderRulePreview();
  renderAiClassificationEntry();
  renderAiClassificationPreview();
  elements.rulesList.textContent = "";

  const groups = getSortedRuleGroups();
  if (!groups.length) {
    elements.rulesList.append(createEmptyNote("暂无规则组。先新建归类规则组或移出分类规则组，再预览匹配结果。"));
    return;
  }

  for (const group of groups) {
    elements.rulesList.append(renderRuleGroupItem(group));
  }
}

function renderAiClassificationEntry() {
  const provider = getActiveAiProvider();
  const taskSettings = getBookmarkClassificationTaskSettings();
  const fields = state.aiSettings.dataFields
    .map((field) => ANALYSIS_FIELD_OPTIONS.find((option) => option.id === field)?.label)
    .filter(Boolean);
  const leafCategories = getLeafCategoryPathEntries(state.categoryTree);
  const targetCount = getAiClassificationTargetBookmarks(false).length;

  elements.aiClassifyProviderStatus.textContent = provider ? provider.name : "未选择厂家";
  elements.aiClassifyProviderStatus.classList.toggle("is-warning", !provider);
  elements.aiClassifyBatchSizeLabel.textContent = `${taskSettings.batchSize} 条`;
  elements.aiClassifyFieldList.textContent = fields.join("、") || "未选择字段";
  elements.aiClassifyFieldList.classList.toggle("is-warning", !fields.length);
  elements.aiClassifyGroupState.textContent = leafCategories.length
    ? `${leafCategories.length} 个末端分组`
    : "暂无分组，先建议新增";
  elements.aiClassifyGroupState.classList.toggle("is-warning", !leafCategories.length);
  elements.aiClassifyTargetCount.textContent = `${targetCount} 个未分类书签`;
  elements.aiClassifyResultShape.textContent = "分类体系草案 -> 书签归类";
  elements.runAiClassifyUnprocessed.disabled = state.isAiClassificationRunning;
}

function setAiClassificationStatus(title, detail, options = {}) {
  elements.aiClassificationStatus.hidden = false;
  elements.aiClassificationStatus.classList.toggle("is-error", options.isError === true);
  elements.aiClassificationStatus.classList.toggle("is-done", options.isDone === true);
  elements.aiClassificationStatus.classList.toggle("is-running", options.isRunning === true);
  elements.aiClassificationStatusTitle.textContent = title;
  elements.aiClassificationStatusDetail.textContent = detail;
}

function clearAiClassificationStatus() {
  elements.aiClassificationStatus.hidden = true;
  elements.aiClassificationStatus.classList.remove("is-error", "is-done", "is-running");
  elements.aiClassificationStatusTitle.textContent = "等待开始";
  elements.aiClassificationStatusDetail.textContent = "点击开始分析后，这里会显示当前处理进度。";
}

function renderAiClassificationPreview() {
  const preview = state.pendingAiClassificationPreview;
  elements.aiClassificationPreviewPanel.hidden = !preview;
  elements.aiClassificationPreviewList.textContent = "";

  if (!preview) {
    elements.aiClassificationPreviewSummary.textContent = "尚未收到 AI 结果";
    elements.applyAiClassification.textContent = "应用勾选结果";
    return;
  }

  if (preview.phase === "taxonomy") {
    renderAiTaxonomyPreview(preview);
    return;
  }

  elements.applyAiClassification.textContent = "应用勾选结果";
  const selectedEntries = preview.entries.filter((entry) => entry.selected !== false);
  const assignmentCount = preview.entries.filter((entry) => entry.type === "assignment").length;
  const selectedAssignmentCount = selectedEntries.filter((entry) => entry.type === "assignment").length;
  elements.aiClassificationPreviewSummary.textContent =
    `收到 ${assignmentCount} 条书签归类建议；当前勾选 ${selectedAssignmentCount} 条书签归类。`;

  const assignmentEntries = preview.entries.filter((entry) => entry.type === "assignment");
  if (assignmentEntries.length) {
    elements.aiClassificationPreviewList.append(
      renderAiPreviewGroup("书签归类", `${assignmentEntries.length} 条建议`, assignmentEntries)
    );
  }
}

function renderAiTaxonomyPreview(preview) {
  elements.applyAiClassification.textContent = "确认分类体系并生成归类预览";
  const cachedAssignmentCount = Array.isArray(preview.cachedAssignments) ? preview.cachedAssignments.length : 0;
  const selectedCandidates = preview.entries.filter((entry) => entry.type === "candidateGroup" && entry.selected !== false);
  const changeCount = preview.entries.filter((entry) => entry.type === "taxonomyChange").length;
  elements.aiClassificationPreviewSummary.textContent =
    `分类体系草案包含 ${preview.appliedCategoryPaths.length} 个已生效分组、${selectedCandidates.length} 个候选分组、${changeCount} 条整理记录，并已缓存 ${cachedAssignmentCount} 条书签归类建议。`;
  elements.aiClassificationPreviewList.append(
    renderAiPreviewGroup("候选分组", `${selectedCandidates.length} 个将用于下一步归类`, preview.entries.filter((entry) => entry.type === "candidateGroup"))
  );
  const changeEntries = preview.entries.filter((entry) => entry.type === "taxonomyChange");
  if (changeEntries.length) {
    elements.aiClassificationPreviewList.append(
      renderAiPreviewGroup("分组整理记录", `${changeEntries.length} 条`, changeEntries)
    );
  }
}

function renderAiPreviewGroup(titleText, countText, entries) {
  const group = document.createElement("section");
  group.className = "ai-preview-group";

  const head = document.createElement("div");
  head.className = "ai-preview-group-head";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const count = document.createElement("span");
  count.textContent = countText;
  head.append(title, count);
  group.append(head);

  const grid = document.createElement("div");
  grid.className = "ai-preview-card-grid";

  for (const entry of entries.slice(0, MAX_BOOKMARK_ROWS)) {
    const item = document.createElement("article");
    item.className = `ai-preview-item ${entry.type === "assignment" ? "is-assignment" : "is-new-group"}`;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = entry.selected !== false;
    check.dataset.aiPreviewId = entry.id;
    check.disabled = entry.type === "taxonomyChange";

    const main = document.createElement("div");
    main.className = "ai-preview-main";
    const title = document.createElement("span");
    title.className = "ai-preview-title";
    title.textContent = getAiPreviewTitle(entry);
    const meta = document.createElement("div");
    meta.className = "ai-preview-tags";
    meta.append(createTag(getAiPreviewPrimaryTag(entry)));
    if (entry.type === "assignment") {
      meta.append(createTag(`当前：${entry.currentCategories.join("、") || "默认"}`, true));
    } else if (entry.type === "taxonomyChange") {
      meta.append(createTag(entry.changeTypeLabel, true));
    }
    const extra = document.createElement("span");
    extra.className = "ai-preview-extra";
    extra.textContent = getAiPreviewExtra(entry);
    main.append(title, meta, extra);
    item.append(check, main);
    grid.append(item);
  }

  if (entries.length > MAX_BOOKMARK_ROWS) {
    grid.append(createEmptyNote(`已显示前 ${MAX_BOOKMARK_ROWS} 条建议。`));
  }

  group.append(grid);
  return group;
}

function getAiPreviewTitle(entry) {
  if (entry.type === "assignment") {
    return `${entry.label} · ${entry.bookmarkTitle || "未命名书签"}`;
  }
  if (entry.type === "taxonomyChange") {
    return `${entry.fromPaths.join("、")} -> ${entry.toPath}`;
  }
  return entry.path;
}

function getAiPreviewPrimaryTag(entry) {
  if (entry.type === "assignment") {
    return entry.categories.join("、") || "未返回分类";
  }
  if (entry.type === "taxonomyChange") {
    return "候选分组整理";
  }
  return "候选分类路径";
}

function getAiPreviewExtra(entry) {
  if (entry.type === "assignment") {
    return entry.reason || "AI 建议将该书签写入上述分类";
  }
  if (entry.type === "taxonomyChange") {
    return entry.reason || "后续书签归类会使用整理后的新路径";
  }
  return entry.reason || "确认分类体系后会作为可选分类路径参与书签归类";
}

function renderRuleGroupItem(group) {
  const item = document.createElement("article");
  item.className = `rule-item rule-group-${group.type}`;
  item.classList.toggle("is-expanded", state.expandedRuleGroupId === group.id);
  item.dataset.groupId = group.id;

  const header = document.createElement("button");
  header.className = "rule-header";
  header.type = "button";
  header.dataset.action = "toggleGroup";
  header.dataset.groupId = group.id;

  const main = document.createElement("div");
  main.className = "rule-main";
  const title = document.createElement("span");
  title.className = "rule-title";
  title.textContent = group.name || RULE_GROUP_TYPES[group.type].label;
  const meta = document.createElement("span");
  meta.className = "rule-meta";
  meta.textContent = `${RULE_GROUP_TYPES[group.type].label} · ${group.rules.length} 条规则 · ${RULE_GROUP_TYPES[group.type].emptyText}`;
  main.append(title, meta);

  const target = document.createElement("span");
  target.className = "rule-target";
  target.textContent = getRuleGroupCategoryLabels(group).join("、") || "未选择分类";
  header.append(main, target);
  item.append(header);

  if (state.expandedRuleGroupId === group.id) {
    const detail = document.createElement("div");
    detail.className = "rule-detail";
    detail.append(renderRuleGroupSummary(group), renderRuleList(group), renderRuleGroupActions(group));
    item.append(detail);
  }

  return item;
}

function renderRuleGroupSummary(group) {
  const fixed = document.createElement("div");
  fixed.className = "rule-fixed-summary";
  const preview = getRuleGroupPreviewMatches(group);
  fixed.append(
    createRuleSummaryCell("规则组类型", RULE_GROUP_TYPES[group.type].label),
    createRuleSummaryCell("规则数量", `${group.rules.length} 条`),
    createRuleSummaryCell("预估命中", `${new Set(preview.map((match) => match.bookmark.id)).size} 个书签`),
    createRuleSummaryCell("变更建议", `${preview.length} 条`)
  );
  return fixed;
}

function renderRuleList(group) {
  const list = document.createElement("div");
  list.className = "rule-sub-list";
  if (!group.rules.length) {
    list.append(createEmptyNote("这个规则组还没有规则。"));
    return list;
  }

  for (const rule of group.rules) {
    const row = document.createElement("div");
    row.className = "rule-sub-item";
    const main = document.createElement("div");
    main.className = "rule-main";
    const title = document.createElement("span");
    title.className = "rule-title";
    title.textContent = rule.name || rule.pattern || "未命名规则";
    const meta = document.createElement("span");
    meta.className = "rule-meta";
    meta.textContent = `${getRuleFieldLabels(rule).join("、")} · ${getRuleTypeLabel(rule.type)} · ${getRuleCategoryLabels(rule).join("、") || "未选择分类"}`;
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "rule-actions compact";
    actions.append(
      createRuleButton("editRule", group.id, "编辑", "", rule.id),
      createRuleButton("deleteRule", group.id, "删除", "danger", rule.id)
    );
    row.append(main, actions);
    list.append(row);
  }
  return list;
}

function renderRuleGroupActions(group) {
  const actions = document.createElement("div");
  actions.className = "rule-actions";
  actions.append(
    createRuleButton("addRule", group.id, "添加规则"),
    createRuleButton("previewGroup", group.id, "预览规则组"),
    createRuleButton("deleteGroup", group.id, "删除规则组", "danger")
  );
  return actions;
}

function renderRuleFormVisibility() {
  const typeInfo = RULE_GROUP_TYPES[state.ruleFormType] || RULE_GROUP_TYPES.classify;
  elements.ruleFormPanel.classList.toggle("is-collapsed", !state.ruleFormExpanded);
  elements.ruleFormPanel.classList.toggle("is-remove-group", state.ruleFormType === "remove");
  elements.ruleFormBody.hidden = !state.ruleFormExpanded;
  elements.ruleFormTitle.textContent = state.editingRuleGroupId
    ? `编辑${typeInfo.label}`
    : `新增${typeInfo.label}`;
  elements.ruleGroupTypeLabel.value = typeInfo.label;
  elements.ruleCategoryLabel.textContent = state.ruleFormType === "remove" ? "移出分类范围" : "目标分类组";
  elements.toggleRuleForm.textContent = state.ruleFormExpanded ? "收起" : "展开";
}

function toggleRuleForm() {
  state.ruleFormExpanded = !state.ruleFormExpanded;
  renderRuleFormVisibility();
}

function startRuleGroupForm(type) {
  resetRuleForm({ keepStatus: true });
  state.ruleFormType = type === "remove" ? "remove" : "classify";
  state.ruleFormExpanded = true;
  renderRulesSection();
  showStatus(`已准备新建${RULE_GROUP_TYPES[state.ruleFormType].label}`);
}

function renderRuleFormOptions() {
  const selectedFields = getCheckedRuleValues("ruleField");
  const selectedType = getSelectedRuleType();
  const selectedCategoryLevel = elements.ruleCategoryLevel.value || "leaf";
  renderRuleCheckboxList(
    elements.ruleFieldList,
    RULE_FIELD_OPTIONS,
    "ruleField",
    selectedFields.length ? selectedFields : ["title"]
  );
  renderRuleRadioList(elements.ruleTypeList, RULE_TYPE_OPTIONS, "ruleType", selectedType || "contains");
  renderRuleCategoryLevelOptions(selectedCategoryLevel);
  renderRuleCheckboxList(
    elements.ruleCategoryList,
    getCategoryOptionsByLevel(state.categoryTree, elements.ruleCategoryLevel.value || selectedCategoryLevel).filter(
      (option) => option.id !== "uncategorized"
    ),
    "ruleCategory",
    getCheckedRuleValues("ruleCategory")
  );
}

function renderRuleCategoryLevelOptions(selectedLevel) {
  const levelOptions = getCategoryLevelOptions(state.categoryTree);
  const currentValue = levelOptions.some((option) => option.id === selectedLevel) ? selectedLevel : levelOptions[0]?.id || "";
  elements.ruleCategoryLevel.textContent = "";

  for (const option of levelOptions) {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = option.label;
    elements.ruleCategoryLevel.append(item);
  }

  elements.ruleCategoryLevel.value = currentValue;
}

function renderRuleCheckboxList(container, options, name, selectedValues) {
  const selected = new Set(selectedValues);
  renderRuleChoiceList(container, options, name, "checkbox", (option) => selected.has(option.id));
}

function renderRuleRadioList(container, options, name, selectedValue) {
  renderRuleChoiceList(container, options, name, "radio", (option) => option.id === selectedValue);
}

function renderRuleChoiceList(container, options, name, inputType, isSelected) {
  container.textContent = "";

  if (!options.length) {
    container.append(createEmptyNote("暂无可选项。"));
    return;
  }

  for (const option of options) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = inputType;
    input.name = name;
    input.value = option.id;
    input.dataset.ruleChoice = name;
    input.checked = isSelected(option);
    const body = document.createElement("span");
    body.className = "rule-choice-body";
    const text = document.createElement("strong");
    text.textContent = option.label || option.name;
    body.append(text);
    const helper = option.parentPath || option.help;
    if (helper) {
      const help = document.createElement("small");
      help.textContent = helper;
      body.append(help);
    }
    label.append(input, body);
    container.append(label);
  }
}

function renderRulePreview() {
  elements.rulePreviewList.textContent = "";
  const matches = state.rulePreviewMatches;
  if (!matches.length) {
    elements.rulePreviewSummary.textContent = "尚未预览规则组。";
    return;
  }

  const selectedMatches = matches.filter((match) => match.selected !== false);
  const affectedBookmarkIds = new Set(matches.map((match) => match.bookmark.id));
  const selectedBookmarkIds = new Set(selectedMatches.map((match) => match.bookmark.id));
  elements.rulePreviewSummary.textContent =
    `预览命中 ${affectedBookmarkIds.size} 个书签，产生 ${matches.length} 条变更建议；` +
    `当前勾选 ${selectedMatches.length} 条，涉及 ${selectedBookmarkIds.size} 个书签。`;

  for (const match of matches.slice(0, MAX_BOOKMARK_ROWS)) {
    const item = document.createElement("article");
    item.className = `rule-preview-item ${match.group.type === "remove" ? "is-remove" : "is-classify"}`;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = match.selected !== false;
    check.dataset.previewId = match.id;
    const main = document.createElement("div");
    main.className = "bookmark-main";
    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.textContent = match.bookmark.title || match.bookmark.url;
    const meta = document.createElement("span");
    meta.className = "bookmark-meta";
    meta.textContent = getPreviewMatchText(match);
    const current = document.createElement("span");
    current.className = "bookmark-meta";
    current.textContent = `当前分类：${getCategoryLabelsForBookmark(match.bookmark).join("、") || "默认"}`;
    main.append(title, meta, current);
    item.append(check, renderFaviconMark(match.bookmark, "favicon-mark"), main);
    elements.rulePreviewList.append(item);
  }

  if (matches.length > MAX_BOOKMARK_ROWS) {
    elements.rulePreviewList.append(createEmptyNote(`已显示前 ${MAX_BOOKMARK_ROWS} 条命中结果。`));
  }
}

async function saveRuleFromForm() {
  const fields = getCheckedRuleValues("ruleField");
  const type = getSelectedRuleType();
  const categoryIds = getCheckedRuleValues("ruleCategory");
  const pattern = elements.rulePattern.value.trim();

  if (!fields.length) {
    showStatus("请至少选择一个匹配字段", true);
    return;
  }

  if (!type) {
    showStatus("请选择一种匹配方式", true);
    return;
  }

  if (!categoryIds.length) {
    showStatus(state.ruleFormType === "remove" ? "请至少选择一个移出分类范围" : "请至少选择一个目标分类组", true);
    return;
  }

  if (!pattern) {
    showStatus("请填写复写匹配内容", true);
    elements.rulePattern.focus();
    return;
  }

  const rule = {
    id: state.editingRuleId || `rule-${Date.now()}`,
    name: elements.ruleName.value.trim() || pattern.split(/\r?\n/)[0] || "未命名规则",
    field: fields[0],
    type,
    fields,
    pattern,
    categoryIds,
    note: elements.ruleNote.value.trim(),
  };
  const groupId = state.editingRuleGroupId || `group-${Date.now()}`;
  const groupName =
    elements.ruleGroupName.value.trim() ||
    (state.ruleFormType === "remove" ? "未命名移出分类规则组" : "未命名归类规则组");

  const groups = getSortedRuleGroups();
  const existingGroup = groups.find((group) => group.id === groupId);
  const nextGroup = {
    id: groupId,
    name: groupName,
    type: state.ruleFormType,
    order: existingGroup?.order || groups.length + 1,
    rules: existingGroup ? existingGroup.rules.filter((item) => item.id !== rule.id).concat(rule) : [rule],
  };
  const nextGroups = groups.filter((group) => group.id !== groupId).concat(nextGroup);
  state.classificationRules = sanitizeClassificationRules({
    version: DEFAULT_CLASSIFICATION_RULES.version,
    groups: nextGroups,
  });
  await chromeStorageSet({ [STORAGE_KEYS.classificationRules]: state.classificationRules });
  state.expandedRuleGroupId = groupId;
  state.rulePreviewMatches = [];
  resetRuleForm({ keepStatus: true });
  renderRulesSection();
  showStatus("规则组已保存");
}

function resetRuleForm(options = {}) {
  state.editingRuleGroupId = null;
  state.editingRuleId = null;
  elements.ruleGroupName.value = "";
  elements.ruleName.value = "";
  elements.rulePattern.value = "";
  elements.ruleNote.value = "";
  elements.saveRule.textContent = "保存规则组";
  setCheckedRuleValues("ruleField", ["title"]);
  setSelectedRuleType("contains");
  setCheckedRuleValues("ruleCategory", []);
  if (!options.keepStatus) {
    showStatus("规则表单已清空");
  }
}

async function handleRulesListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const groupId = button.dataset.groupId;
  const ruleId = button.dataset.ruleId;
  const action = button.dataset.action;
  const group = findRuleGroup(groupId);
  if (!group) return;

  if (action === "toggleGroup") {
    state.expandedRuleGroupId = state.expandedRuleGroupId === groupId ? null : groupId;
    renderRulesSection();
    return;
  }

  if (action === "addRule") {
    fillRuleForm(group);
    return;
  }

  if (action === "editRule") {
    const rule = group.rules.find((item) => item.id === ruleId);
    if (rule) fillRuleForm(group, rule);
    return;
  }

  if (action === "previewGroup") {
    state.rulePreviewMatches = getRuleGroupPreviewMatches(group);
    renderRulesSection();
    showRulePreviewStatus();
    return;
  }

  if (action === "deleteRule") {
    await deleteRule(groupId, ruleId);
    return;
  }

  if (action === "deleteGroup") {
    await deleteRuleGroup(groupId);
  }
}

function fillRuleForm(group, rule = null) {
  state.editingRuleGroupId = group.id;
  state.editingRuleId = rule?.id || null;
  state.ruleFormType = group.type;
  state.ruleFormExpanded = true;
  elements.ruleGroupName.value = group.name || "";
  elements.ruleName.value = rule?.name || "";
  setCheckedRuleValues("ruleField", rule ? getRuleFields(rule) : ["title"]);
  setSelectedRuleType(rule?.type || "contains");
  setRuleCategoryLevelForRule(rule || group.rules[0]);
  renderRuleFormOptions();
  setCheckedRuleValues("ruleCategory", rule?.categoryIds || []);
  elements.rulePattern.value = rule?.pattern || "";
  elements.ruleNote.value = rule?.note || "";
  elements.saveRule.textContent = rule ? "保存规则" : "添加规则";
  showStatus(rule ? "规则已载入表单" : "规则组已载入表单，可添加新规则");
}

async function deleteRule(groupId, ruleId) {
  const group = findRuleGroup(groupId);
  const rule = group?.rules.find((item) => item.id === ruleId);
  if (!group || !rule) return;
  if (!window.confirm(`删除规则“${rule.name || rule.pattern}”？`)) return;

  const groups = getSortedRuleGroups().map((item) =>
    item.id === groupId ? { ...item, rules: item.rules.filter((candidate) => candidate.id !== ruleId) } : item
  );
  state.classificationRules = sanitizeClassificationRules({ version: DEFAULT_CLASSIFICATION_RULES.version, groups });
  await chromeStorageSet({ [STORAGE_KEYS.classificationRules]: state.classificationRules });
  if (state.editingRuleId === ruleId) resetRuleForm({ keepStatus: true });
  state.rulePreviewMatches = [];
  renderRulesSection();
  showStatus("规则已删除");
}

async function deleteRuleGroup(groupId) {
  const group = findRuleGroup(groupId);
  if (!group) return;
  if (!window.confirm(`删除规则组“${group.name}”？`)) return;

  state.classificationRules = sanitizeClassificationRules({
    version: DEFAULT_CLASSIFICATION_RULES.version,
    groups: getSortedRuleGroups().filter((item) => item.id !== groupId),
  });
  await chromeStorageSet({ [STORAGE_KEYS.classificationRules]: state.classificationRules });
  if (state.expandedRuleGroupId === groupId) state.expandedRuleGroupId = null;
  if (state.editingRuleGroupId === groupId) resetRuleForm({ keepStatus: true });
  state.rulePreviewMatches = [];
  renderRulesSection();
  showStatus("规则组已删除");
}

function previewAllRules() {
  state.rulePreviewMatches = getRuleGroupsPreviewMatches(getSortedRuleGroups());
  renderRulesSection();
  showRulePreviewStatus();
}

async function applyAllRules() {
  const selectedMatches = state.rulePreviewMatches.filter((match) => match.selected !== false);
  if (!selectedMatches.length) {
    showStatus("请先预览规则组，并至少保留一条勾选的变更建议", true);
    return;
  }

  const nextLinks = cloneValue(state.bookmarkCategoryLinks);
  for (const match of selectedMatches) {
    const currentIds = Array.isArray(nextLinks[match.bookmark.id]) ? nextLinks[match.bookmark.id] : [];
    if (match.group.type === "remove") {
      const removeIds = getRuleCategoryIds(match.rule);
      const scopeIds = new Set(removeIds.flatMap((categoryId) => Array.from(getDescendantIds(state.categoryTree, categoryId))));
      nextLinks[match.bookmark.id] = normalizeBookmarkCategoryIds(currentIds.filter((id) => !scopeIds.has(id)));
    } else {
      const merged = currentIds.filter((id) => id !== "uncategorized").concat(getRuleCategoryIds(match.rule));
      nextLinks[match.bookmark.id] = normalizeBookmarkCategoryIds(merged);
    }
  }

  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(nextLinks, state.categoryTree);
  await chromeStorageSet({ [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks });
  renderRulesSection();
  renderBookmarksSection();
  renderCategoriesSection();
  showStatus(`已应用 ${selectedMatches.length} 条规则组变更，涉及 ${new Set(selectedMatches.map((match) => match.bookmark.id)).size} 个书签`);
}

function handleRulePreviewChange(event) {
  const input = event.target.closest("input[data-preview-id]");
  if (!input) return;
  state.rulePreviewMatches = state.rulePreviewMatches.map((match) =>
    match.id === input.dataset.previewId ? { ...match, selected: input.checked } : match
  );
  renderRulePreview();
}

function handleAiClassificationPreviewChange(event) {
  const input = event.target.closest("input[data-ai-preview-id]");
  if (!input || !state.pendingAiClassificationPreview) return;
  state.pendingAiClassificationPreview.entries = state.pendingAiClassificationPreview.entries.map((entry) =>
    entry.id === input.dataset.aiPreviewId ? { ...entry, selected: input.checked } : entry
  );
  renderAiClassificationPreview();
}

function setAiClassificationSelection(selected) {
  if (!state.pendingAiClassificationPreview) {
    showStatus("当前没有可调整的 AI 结果");
    return;
  }
  state.pendingAiClassificationPreview.entries = state.pendingAiClassificationPreview.entries.map((entry) => ({
    ...entry,
    selected,
  }));
  renderAiClassificationPreview();
}

async function applyAiClassificationPreview() {
  const preview = state.pendingAiClassificationPreview;
  if (!preview) {
    showStatus("当前没有可应用的 AI 结果", true);
    return;
  }

  if (preview.phase === "taxonomy") {
    await confirmAiTaxonomyDraft();
    return;
  }

  const selectedEntries = preview.entries.filter((entry) => entry.selected !== false);
  const selectedAssignments = selectedEntries.filter((entry) => entry.type === "assignment");
  if (!selectedEntries.length || !selectedAssignments.length) {
    showStatus("请至少勾选一条书签归类建议", true);
    return;
  }

  const nextTree = cloneValue(state.categoryTree);
  let createdGroupCount = 0;

  for (const path of preview.confirmedCandidatePaths || []) {
    const result = ensureCategoryPath(nextTree, path);
    createdGroupCount += result.createdCount || 0;
  }

  const nextLinks = cloneValue(state.bookmarkCategoryLinks);
  let assignmentCount = 0;
  for (const assignment of selectedAssignments) {
    const categoryIds = [];
    for (const path of assignment.categories) {
      const result = ensureCategoryPath(nextTree, path);
      if (result.createdCount) {
        createdGroupCount += result.createdCount;
      }
      categoryIds.push(result.categoryId);
    }
    if (!categoryIds.length) {
      continue;
    }
    const currentIds = Array.isArray(nextLinks[assignment.bookmarkId]) ? nextLinks[assignment.bookmarkId] : [];
    const merged = currentIds.filter((id) => id !== "uncategorized").concat(categoryIds);
    nextLinks[assignment.bookmarkId] = normalizeBookmarkCategoryIds(merged);
    assignmentCount += 1;
  }

  state.categoryTree = sanitizeCategoryTree(nextTree) || state.categoryTree;
  rebuildCategoryIndexes();
  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(nextLinks, state.categoryTree);
  const namesList = buildCategoryNamesList(state.categoryTree);
  await chromeStorageSet({
    [STORAGE_KEYS.categoryTree]: state.categoryTree,
    [STORAGE_KEYS.categoryNamesList]: namesList,
    [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks,
  });

  clearAiClassificationCache();
  renderRulesSection();
  renderBookmarksSection();
  renderCategoriesSection();
  setAiClassificationStatus(
    "AI 分类已应用",
    `已写入 ${assignmentCount} 条书签归类建议，新增 ${createdGroupCount} 个本地分类。`,
    { isDone: true }
  );
  showStatus(`已应用 ${assignmentCount} 条 AI 归类建议，新增 ${createdGroupCount} 个本地分类`);
}

function discardAiClassificationPreview() {
  if (!state.pendingAiClassificationPreview && !state.pendingAiClassificationTask) {
    showStatus("当前没有可放弃的 AI 结果");
    return;
  }
  clearAiClassificationCache();
  renderRulesSection();
  clearAiClassificationStatus();
  showStatus("已放弃本次 AI 结果，未修改本地分类");
}

function clearAiClassificationCache() {
  state.pendingAiClassificationTask = null;
  state.pendingAiClassificationPreview = null;
  state.pendingAiTaxonomyDraft = null;
}

function buildCategoryBackupPayload() {
  return {
    schema: "bookmark-launcher-category-data",
    version: 1,
    exportedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    data: {
      categoryTree: state.categoryTree,
      bookmarkCategoryLinks: state.bookmarkCategoryLinks,
      categoryNamesList: buildCategoryNamesList(state.categoryTree),
    },
  };
}

function exportCategoryData() {
  const payload = buildCategoryBackupPayload();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadTextFile(`bookmark-categories-${timestamp}.json`, JSON.stringify(payload, null, 2));
  showStatus("已导出分类数据");
}

async function importCategoryDataFromFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const rawText = await readTextFile(file);
    const payload = JSON.parse(rawText);
    const importData = normalizeCategoryImportPayload(payload);
    const mode = elements.importCategoryMode.value || "overwrite";
    await applyCategoryImport(importData, mode);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "分类数据导入失败", true);
  }
}

function normalizeCategoryImportPayload(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const categoryTree = sanitizeCategoryTree(data?.categoryTree);
  if (!categoryTree) {
    throw new Error("导入文件中没有有效的分类树数据");
  }
  migrateDefaultCategoryName(categoryTree);
  const bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(data?.bookmarkCategoryLinks, categoryTree);
  return {
    categoryTree,
    bookmarkCategoryLinks,
  };
}

async function applyCategoryImport(importData, mode) {
  if (hasPendingLocalCategoryChanges()) {
    const shouldContinue = window.confirm("当前有未保存的分类或书签更改。导入会先丢弃这些临时更改，是否继续？");
    if (!shouldContinue) {
      return;
    }
    state.pendingCategoryTree = null;
    state.pendingBookmarkLinks = null;
  }

  const result =
    mode === "overwrite"
      ? buildOverwriteCategoryImport(importData)
      : buildMergedCategoryImport(importData, mode === "append" ? "append" : "preserve");

  state.categoryTree = result.categoryTree;
  rebuildCategoryIndexes();
  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(result.bookmarkCategoryLinks, state.categoryTree);
  const categoryNamesList = buildCategoryNamesList(state.categoryTree);

  await chromeStorageSet({
    [STORAGE_KEYS.categoryTree]: state.categoryTree,
    [STORAGE_KEYS.categoryNamesList]: categoryNamesList,
    [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks,
  });

  state.selectedCategoryId = null;
  state.selectedCategoryIds.clear();
  state.selectedBookmarkIds.clear();
  renderCategoriesSection();
  renderBookmarksSection();
  renderRulesSection();
  showStatus(result.message);
}

function buildOverwriteCategoryImport(importData) {
  return {
    categoryTree: sanitizeCategoryTree(importData.categoryTree) || cloneValue(DEFAULT_CATEGORY_TREE),
    bookmarkCategoryLinks: importData.bookmarkCategoryLinks,
    message: "已覆盖导入分类树和书签分类标记",
  };
}

function buildMergedCategoryImport(importData, mode) {
  const categoryTree = cloneValue(state.categoryTree);
  const mergeResult = mergeMissingCategoryNodes(categoryTree, importData.categoryTree);
  const validCategoryIds = getCategoryIdSet(categoryTree);
  const bookmarkIds = new Set(state.bookmarks.map((bookmark) => bookmark.id));
  const bookmarkCategoryLinks = cloneValue(state.bookmarkCategoryLinks);
  let updatedBookmarks = 0;
  let skippedBookmarks = 0;

  for (const [bookmarkId, importedIds] of Object.entries(importData.bookmarkCategoryLinks)) {
    if (!bookmarkIds.has(bookmarkId)) {
      skippedBookmarks += 1;
      continue;
    }

    const importedCategoryIds = unique(
      importedIds.filter((id) => validCategoryIds.has(id) && id !== "root" && id !== "uncategorized")
    );
    if (!importedCategoryIds.length) {
      continue;
    }

    const currentIds = Array.isArray(bookmarkCategoryLinks[bookmarkId]) ? bookmarkCategoryLinks[bookmarkId] : [];
    const hasCurrentCategory = currentIds.some((id) => id !== "uncategorized");
    if (mode === "preserve") {
      if (hasCurrentCategory) {
        skippedBookmarks += 1;
        continue;
      }
      bookmarkCategoryLinks[bookmarkId] = normalizeBookmarkCategoryIds(importedCategoryIds);
      updatedBookmarks += 1;
      continue;
    }

    if (hasCurrentCategory) {
      skippedBookmarks += 1;
      continue;
    }
    bookmarkCategoryLinks[bookmarkId] = normalizeBookmarkCategoryIds(importedCategoryIds);
    updatedBookmarks += 1;
  }

  return {
    categoryTree,
    bookmarkCategoryLinks,
    message:
      mode === "preserve"
        ? `已保留原有分类，补齐 ${updatedBookmarks} 个未分类书签，新增 ${mergeResult.added} 个分类`
        : `已新增无冲突数据：${updatedBookmarks} 个书签、${mergeResult.added} 个分类，跳过 ${skippedBookmarks + mergeResult.conflicts} 条冲突`,
  };
}

function mergeMissingCategoryNodes(targetTree, sourceTree) {
  const targetIndexes = createCategoryIndexes(targetTree);
  let added = 0;
  let conflicts = 0;

  const mergeChildren = (targetParent, sourceParent) => {
    targetParent.children = Array.isArray(targetParent.children) ? targetParent.children : [];
    for (const sourceChild of sourceParent.children || []) {
      const existing = targetIndexes.categoryById.get(sourceChild.id);
      if (!existing) {
        const cloned = cloneValue(sourceChild);
        targetParent.children.push(cloned);
        const register = (node, parentId) => {
          targetIndexes.categoryById.set(node.id, node);
          targetIndexes.parentById.set(node.id, parentId);
          added += 1;
          for (const child of node.children || []) {
            register(child, node.id);
          }
        };
        register(cloned, targetParent.id);
        continue;
      }
      if (existing.name !== sourceChild.name) {
        conflicts += 1;
      }
      mergeChildren(existing, sourceChild);
    }
  };

  mergeChildren(targetTree, sourceTree);
  return { added, conflicts };
}

function hasPendingLocalCategoryChanges() {
  return Boolean(state.pendingCategoryTree || state.pendingBookmarkLinks);
}

async function clearExtensionLocalData() {
  const shouldExport = window.confirm("清空前是否先导出分类数据？选择“确定”会先下载分类数据，选择“取消”会继续询问是否清空。");
  if (shouldExport) {
    exportCategoryData();
  }

  const shouldClear = window.confirm(
    "确认清空插件本地数据？这只会删除本扩展的 storage 数据，不会操作浏览器原有书签。"
  );
  if (!shouldClear) {
    return;
  }

  await Promise.all([chromeStorageClear(), clearExtensionCaches()]);
  await loadState();
  renderAll();
  showStatus("已清空插件本地数据，浏览器原有书签未受影响");
}

async function clearExtensionCaches() {
  if (!("caches" in window)) {
    return;
  }
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("读取导入文件失败")));
    reader.readAsText(file, "utf-8");
  });
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ensureCategoryPath(tree, pathText) {
  const parts = normalizeCategoryPathText(pathText).split("/").filter(Boolean).slice(0, 3);
  let current = tree;
  let createdCount = 0;
  for (const part of parts) {
    current.children = Array.isArray(current.children) ? current.children : [];
    let child = current.children.find((item) => item.name === part);
    if (!child) {
      child = { id: createUniqueCategoryId(tree), name: part, children: [] };
      current.children.push(child);
      createdCount += 1;
    }
    current = child;
  }
  return { categoryId: current.id, createdCount };
}

function createUniqueCategoryId(tree) {
  const ids = getCategoryIdSet(tree);
  let id = "";
  do {
    id = `ai-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } while (ids.has(id));
  return id;
}

function getRuleGroupsPreviewMatches(groups) {
  return groups.flatMap((group) => getRuleGroupPreviewMatches(group));
}

function getRuleGroupPreviewMatches(group) {
  const matches = [];
  for (const rule of group.rules) {
    if (!getRuleCategoryIds(rule).length || !rule.pattern.trim()) continue;
    for (const bookmark of getRuleMatches(group, rule)) {
      matches.push({
        id: `${group.id}:${rule.id}:${bookmark.id}`,
        group,
        rule,
        bookmark,
        selected: true,
      });
    }
  }
  return matches;
}

function getRuleMatches(group, rule) {
  if (!getRuleCategoryIds(rule).length || !rule.pattern.trim()) return [];
  return state.bookmarks.filter((bookmark) => isRuleGroupTarget(bookmark, group, rule) && matchesRule(bookmark, rule));
}

function isRuleGroupTarget(bookmark, group, rule) {
  const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
  if (group.type === "remove") {
    const scopeIds = new Set(
      getRuleCategoryIds(rule).flatMap((categoryId) => Array.from(getDescendantIds(state.categoryTree, categoryId)))
    );
    return linkedIds.some((id) => scopeIds.has(id));
  }
  return linkedIds.length === 0 || (linkedIds.length === 1 && linkedIds[0] === "uncategorized");
}

function matchesRule(bookmark, rule) {
  const fields = getRuleFields(rule);
  const patterns = rule.pattern
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  if (!fields.length || !patterns.length) return false;

  return fields.some((field) => {
    const value = getRuleFieldValue(bookmark, field);
    return value && patterns.some((pattern) => matchesPattern(value, pattern, rule.type));
  });
}

function matchesPattern(value, pattern, type) {
  const source = normalizeText(value);
  const query = normalizeText(pattern);
  switch (getAllowedRuleType(type)) {
    case "equals":
      return source === query;
    case "startsWith":
      return source.startsWith(query);
    case "regex":
      try {
        return new RegExp(pattern, "i").test(value);
      } catch {
        return false;
      }
    case "contains":
    default:
      return source.includes(query);
  }
}

function getRuleFieldValue(bookmark, field) {
  switch (getAllowedRuleField(field)) {
    case "url":
      return bookmark.url || "";
    case "domain":
      return bookmark.domain || "";
    case "folderPath":
      return (bookmark.folderPath || []).join(" / ");
    case "title":
    default:
      return bookmark.title || "";
  }
}

function getSortedRuleGroups() {
  return [...(state.classificationRules.groups || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function findRuleGroup(groupId) {
  return getSortedRuleGroups().find((group) => group.id === groupId);
}

function getRuleGroupCategoryLabels(group) {
  return Array.from(new Set(group.rules.flatMap((rule) => getRuleCategoryLabels(rule))));
}

function getPreviewMatchText(match) {
  const action = RULE_GROUP_TYPES[match.group.type].actionLabel;
  return `${match.group.name || RULE_GROUP_TYPES[match.group.type].label} / ${match.rule.name || "未命名规则"}：${action} ${getRuleCategoryLabels(match.rule).join("、")}`;
}

function showRulePreviewStatus() {
  const bookmarkCount = new Set(state.rulePreviewMatches.map((match) => match.bookmark.id)).size;
  const hasClassify = state.rulePreviewMatches.some((match) => match.group.type === "classify");
  const hasRemove = state.rulePreviewMatches.some((match) => match.group.type === "remove");
  if (hasClassify && !hasRemove) {
    const remainingUnclassified = state.bookmarks.filter((bookmark) => isInitialRuleTarget(bookmark)).length - bookmarkCount;
    showStatus(`归类规则组预览命中 ${bookmarkCount} 个书签，产生 ${state.rulePreviewMatches.length} 条建议，剩余约 ${Math.max(0, remainingUnclassified)} 个未分组书签`);
    return;
  }
  if (hasRemove && !hasClassify) {
    showStatus(`移出分类规则组预览命中 ${bookmarkCount} 个书签，将产生 ${state.rulePreviewMatches.length} 条移出分类建议`);
    return;
  }
  showStatus(`规则组预览命中 ${bookmarkCount} 个书签，产生 ${state.rulePreviewMatches.length} 条变更建议`);
}

function isInitialRuleTarget(bookmark) {
  const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
  return linkedIds.length === 0 || (linkedIds.length === 1 && linkedIds[0] === "uncategorized");
}

function getRuleCategoryLabels(rule) {
  return getRuleCategoryIds(rule).map((categoryId) => getCategoryPathLabel(categoryId)).filter(Boolean);
}

function getRuleCategoryIds(rule) {
  const validIds = getRuleCategoryIdSet(state.categoryTree);
  return Array.from(new Set((rule.categoryIds || []).filter((categoryId) => validIds.has(categoryId))));
}

function getRuleFields(rule) {
  const fields = Array.isArray(rule.fields) ? rule.fields : [rule.field || "title"];
  const allowed = fields.map(getAllowedRuleField).filter(Boolean);
  return Array.from(new Set(allowed.length ? allowed : ["title"]));
}

function getCheckedRuleValues(choiceName) {
  return Array.from(document.querySelectorAll(`input[data-rule-choice="${choiceName}"]:checked`)).map(
    (input) => input.value
  );
}

function getSelectedRuleType() {
  return document.querySelector('input[data-rule-choice="ruleType"]:checked')?.value || "";
}

function setSelectedRuleType(value) {
  document.querySelectorAll('input[data-rule-choice="ruleType"]').forEach((input) => {
    input.checked = input.value === value;
  });
}

function setCheckedRuleValues(choiceName, values) {
  const selected = new Set(values);
  document.querySelectorAll(`input[data-rule-choice="${choiceName}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function getCategoryLevelOptions(tree) {
  const byDepth = new Map();
  const visit = (node, path) => {
    if (node.id !== "root") {
      const nextPath = [...path, node.name];
      const depth = nextPath.length;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth).push(createCategoryChoice(node, nextPath));
      for (const child of node.children || []) {
        visit(child, nextPath);
      }
      return;
    }

    for (const child of node.children || []) {
      visit(child, []);
    }
  };
  visit(tree, []);

  const options = Array.from(byDepth.keys())
    .sort((a, b) => a - b)
    .filter((depth) => byDepth.get(depth).length)
    .map((depth) => ({ id: `depth:${depth}`, label: `${formatDepthLabel(depth)}分组` }));
  if (getLeafCategoryOptions(tree).length) {
    options.push({ id: "leaf", label: "末端分组" });
  }
  return options;
}

function getCategoryOptionsByLevel(tree, levelId) {
  const byDepth = new Map();
  const visit = (node, path) => {
    if (node.id !== "root") {
      const nextPath = [...path, node.name];
      const depth = nextPath.length;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth).push(createCategoryChoice(node, nextPath));
      for (const child of node.children || []) {
        visit(child, nextPath);
      }
      return;
    }

    for (const child of node.children || []) {
      visit(child, []);
    }
  };
  visit(tree, []);

  if (levelId === "leaf") {
    return sortCategoryChoices(getLeafCategoryOptions(tree));
  }
  const depth = Number(String(levelId).replace("depth:", ""));
  return sortCategoryChoices(byDepth.get(depth) || []);
}

function getAllRuleCategoryOptions(tree) {
  const options = [];
  const visit = (node, path) => {
    if (node.id !== "root") {
      const nextPath = [...path, node.name];
      options.push(createCategoryChoice(node, nextPath));
      for (const child of node.children || []) {
        visit(child, nextPath);
      }
      return;
    }

    for (const child of node.children || []) {
      visit(child, []);
    }
  };
  visit(tree, []);
  return options;
}

function getLeafCategoryOptions(tree) {
  const options = [];
  const visit = (node, path) => {
    if (node.id !== "root") {
      const nextPath = [...path, node.name];
      if (!node.children || !node.children.length) {
        options.push(createCategoryChoice(node, nextPath));
      }
      for (const child of node.children || []) {
        visit(child, nextPath);
      }
      return;
    }
    for (const child of node.children || []) {
      visit(child, []);
    }
  };
  visit(tree, []);
  return options;
}

function createCategoryChoice(node, path) {
  const parentPath = path.slice(0, -1).join(" / ");
  return {
    id: node.id,
    name: node.name,
    label: node.name,
    path: path.join(" / "),
    parentPath,
  };
}

function sortCategoryChoices(options) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || a.parentPath.localeCompare(b.parentPath, "zh-CN"));
}

function getRuleCategoryIdSet(tree) {
  return new Set(getAllRuleCategoryOptions(tree).map((category) => category.id));
}

function formatDepthLabel(depth) {
  return ["一级", "二级", "三级", "四级", "五级", "六级"][depth - 1] || `${depth}级`;
}

function setRuleCategoryLevelForRule(rule) {
  if (!rule) return;
  const firstCategoryId = rule.categoryIds?.[0];
  if (!firstCategoryId) return;
  const option = findCategoryLevelOption(state.categoryTree, firstCategoryId);
  if (option) {
    elements.ruleCategoryLevel.value = option;
  }
}

function findCategoryLevelOption(tree, categoryId) {
  let found = "";
  const visit = (node, depth) => {
    if (node.id === categoryId) {
      found = `depth:${depth}`;
      return;
    }
    for (const child of node.children || []) {
      visit(child, node.id === "root" ? 1 : depth + 1);
    }
  };
  visit(tree, 0);
  return found;
}

function getAllowedRuleField(field) {
  return ["title", "url", "domain", "folderPath"].includes(field) ? field : "title";
}

function getAllowedRuleType(type) {
  return ["contains", "equals", "startsWith", "regex"].includes(type) ? type : "contains";
}

function getRuleFieldLabel(field) {
  return {
    title: "网页名",
    url: "URL",
    domain: "域名",
    folderPath: "浏览器收藏夹路径",
  }[getAllowedRuleField(field)];
}

function getRuleFieldLabels(rule) {
  return getRuleFields(rule).map(getRuleFieldLabel);
}

function getRuleTypeLabel(type) {
  return {
    contains: "包含关键词",
    equals: "完全等于",
    startsWith: "以前缀开头",
    regex: "正则表达式",
  }[getAllowedRuleType(type)];
}

function getRuleTypeLabels(rule) {
  return [getRuleTypeLabel(rule.type)];
}

function createRuleSummaryCell(label, value) {
  const cell = document.createElement("div");
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  cell.append(labelEl, valueEl);
  return cell;
}

function createRuleButton(action, groupId, text, tone = "", ruleId = "") {
  const button = document.createElement("button");
  button.className = tone === "danger" ? "ghost-button danger-button" : "ghost-button";
  button.type = "button";
  button.dataset.action = action;
  button.dataset.groupId = groupId;
  if (ruleId) {
    button.dataset.ruleId = ruleId;
  }
  button.textContent = text;
  return button;
}

function renderAiSection() {
  const activeProvider = getActiveAiProvider();
  elements.aiProviderSummary.textContent = activeProvider
    ? `${state.aiSettings.providers.length} 个，当前启用：${activeProvider.name}`
    : `${state.aiSettings.providers.length} 个，尚未启用`;
  elements.classificationBatchSize.value = String(getBookmarkClassificationTaskSettings().batchSize);
  elements.indexingBatchSize.value = String(getBookmarkIndexingTaskSettings().batchSize);
  elements.aiProviderClassificationPrompt.value = DEFAULT_AI_PROMPTS.bookmarkClassification;
  elements.aiProviderIndexingPrompt.value = DEFAULT_AI_PROMPTS.bookmarkIndexing;
  applyRequestSettingsToNewProviderForm(DEFAULT_AI_REQUEST_SETTINGS);

  elements.analysisFieldList.querySelectorAll("input[data-analysis-field]").forEach((input) => {
    input.checked = state.aiSettings.dataFields.includes(input.value);
  });

  renderProviderList();
}

function renderProviderList() {
  elements.aiProvidersList.textContent = "";

  if (!state.aiSettings.providers.length) {
    elements.aiProvidersList.append(createEmptyNote("尚未配置 AI 厂家。当前版本只保存配置，不会发起外部请求。"));
    return;
  }

  for (const provider of state.aiSettings.providers) {
    const item = document.createElement("details");
    item.className = "provider-item";
    item.dataset.providerId = provider.id;
    item.classList.toggle("is-active", provider.id === state.aiSettings.activeProviderId);

    const top = document.createElement("summary");
    top.className = "provider-top";
    const title = document.createElement("div");
    title.className = "provider-title";
    const name = document.createElement("strong");
    name.textContent = provider.name;
    const activeHint = document.createElement("span");
    activeHint.className = provider.id === state.aiSettings.activeProviderId ? "provider-active-badge" : "provider-muted-hint";
    activeHint.textContent = provider.id === state.aiSettings.activeProviderId ? "当前启用" : "未启用";
    title.append(name, activeHint);

    const topActions = document.createElement("div");
    topActions.className = "provider-top-actions";
    if (provider.id !== state.aiSettings.activeProviderId) {
      const activateButton = document.createElement("button");
      activateButton.className = "ghost-button";
      activateButton.type = "button";
      activateButton.dataset.action = "set-active-provider";
      activateButton.dataset.providerId = provider.id;
      activateButton.textContent = "设为当前启用";
      topActions.append(activateButton);
    }

    const removeButton = document.createElement("button");
    removeButton.className = "ghost-button";
    removeButton.type = "button";
    removeButton.dataset.action = "remove-provider";
    removeButton.dataset.providerId = provider.id;
    removeButton.textContent = "移除";
    topActions.append(removeButton);
    top.append(title, topActions);

    const grid = document.createElement("div");
    grid.className = "provider-grid";
    const requestSettings = sanitizeAiRequestSettings(provider.requestSettings);
    grid.append(
      createProviderField("厂家名称", "name", provider.name, "text"),
      createProviderField("排序权重", "order", provider.order, "number", { step: "1" }),
      createProviderSelect("厂家类型", "providerType", provider.providerType || "openai-compatible", [
        ["openai-compatible", "OpenAI 兼容格式"],
      ]),
      createProviderField("接口 URL", "baseUrl", provider.baseUrl, "url"),
      createProviderField("API Key", "apiKey", provider.apiKey, "password"),
      createProviderField("模型名", "model", provider.model, "text"),
      createProviderSelect("接口类型", "apiMode", requestSettings.apiMode, [
        ["chatCompletions", "Chat Completions"],
        ["responses", "Responses"],
      ]),
      createProviderSelect("响应格式", "responseFormat", requestSettings.responseFormat, [
        ["json_schema", "JSON Schema"],
        ["json_object", "JSON Object"],
        ["text", "Text"],
      ]),
      createProviderField("Temperature (0-2)", "temperature", requestSettings.temperature, "number", {
        min: "0",
        max: "2",
        step: "0.1",
      }),
      createProviderField("Max Tokens", "maxTokens", requestSettings.maxTokens, "number", {
        min: "1",
        max: "1000000",
        step: "1",
      }),
      createProviderField("请求超时 (ms)", "timeoutMs", requestSettings.timeoutMs, "number", {
        min: "1000",
        max: "600000",
        step: "1000",
      }),
      createProviderCheckbox("启用流式传输", "stream", requestSettings.stream)
    );

    const classificationPromptField = createProviderTextarea(
      "书签自动分类提示词",
      "bookmarkClassificationPrompt",
      provider.promptTemplates?.bookmarkClassification || DEFAULT_AI_PROMPTS.bookmarkClassification,
      6
    );
    const indexingPromptField = createProviderTextarea(
      "书签索引建立提示词",
      "bookmarkIndexingPrompt",
      provider.promptTemplates?.bookmarkIndexing || DEFAULT_AI_PROMPTS.bookmarkIndexing,
      5
    );
    const headersField = createProviderTextarea("自定义 Header 参数", "customHeaders", requestSettings.customHeaders);
    const bodyField = createProviderTextarea("自定义 Body 参数", "customBody", requestSettings.customBody);
    const actions = document.createElement("div");
    actions.className = "action-row";
    const testButton = document.createElement("button");
    testButton.className = "ghost-button";
    testButton.type = "button";
    testButton.dataset.action = "test-provider";
    testButton.dataset.providerId = provider.id;
    testButton.textContent = "测试连接";
    actions.append(testButton);
    const detailBody = document.createElement("div");
    detailBody.className = "provider-detail-body";
    detailBody.append(grid, headersField, bodyField, classificationPromptField, indexingPromptField, actions);
    item.append(top, detailBody);
    elements.aiProvidersList.append(item);
  }
}

/* ---- Category Tree Rendering ---- */

function getWorkingTree() {
  return state.pendingCategoryTree || state.categoryTree;
}

function getWorkingLinks() {
  return state.pendingBookmarkLinks || state.bookmarkCategoryLinks;
}

function hasPendingCategoryChanges() {
  return state.pendingCategoryTree !== null;
}

function hasPendingBookmarkChanges() {
  return state.pendingBookmarkLinks !== null;
}

function rebuildWorkingIndexes() {
  const tree = getWorkingTree();
  const indexes = createCategoryIndexes(tree);
  state.categoryById = indexes.categoryById;
  state.parentById = indexes.parentById;
}

function updatePendingHints() {
  const hasCat = hasPendingCategoryChanges();
  elements.categoryPendingHint.hidden = !hasCat;
  elements.confirmCategoryChanges.hidden = !hasCat;
  elements.discardCategoryChanges.hidden = !hasCat;

  const hasBm = hasPendingBookmarkChanges();
  elements.bookmarkPendingHint.hidden = !hasBm;
  elements.confirmBookmarkChanges.hidden = !hasBm;
  elements.discardBookmarkChanges.hidden = !hasBm;
}

function renderCategoryTreeNode(category, depth) {
  const li = document.createElement("li");
  li.className = "tree-item";
  li.dataset.categoryId = category.id;
  li.draggable = true;

  const row = document.createElement("div");
  row.className = "tree-row";
  if (state.selectedCategoryId === category.id) {
    row.classList.add("is-selected");
  }
  if (state.selectedCategoryIds.has(category.id)) {
    row.classList.add("is-batch-selected");
  }
  if (state.editingCategoryId === category.id) {
    row.classList.add("is-editing");
  }

  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = state.expandedCategoryIds.has(category.id);

  if (state.editingCategoryId === category.id) {
    const nameInput = document.createElement("input");
    nameInput.className = "tree-name-input";
    nameInput.type = "text";
    nameInput.value = category.name;
    nameInput.dataset.renameInput = category.id;

    const editActions = document.createElement("span");
    editActions.className = "tree-row-edit-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "confirm-edit";
    confirmBtn.type = "button";
    confirmBtn.dataset.action = "confirmRename";
    confirmBtn.dataset.categoryId = category.id;
    confirmBtn.textContent = "✓";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel-edit";
    cancelBtn.type = "button";
    cancelBtn.dataset.action = "cancelRename";
    cancelBtn.textContent = "✕";
    editActions.append(confirmBtn, cancelBtn);

    row.append(nameInput, editActions);
  } else {
    if (state.batchManageEnabled) {
      const check = document.createElement("input");
      check.className = "tree-check";
      check.type = "checkbox";
      check.dataset.action = "toggleCategorySelection";
      check.dataset.categoryId = category.id;
      check.checked = state.selectedCategoryIds.has(category.id);
      check.disabled = !isCategoryBatchSelectable(category.id);
      check.title = check.disabled ? "默认分类不可批量移动" : "选择分类";
      row.append(check);
    }

    const expandIndicator = document.createElement("span");
    expandIndicator.className = "expand-indicator";
    if (hasChildren) {
      expandIndicator.textContent = isExpanded ? "▾" : "▸";
    }

    const nameEl = document.createElement("span");
    nameEl.className = "tree-name";
    nameEl.textContent = category.name;

    const childCount = category.children?.length || 0;
    const bookmarkCount = getBookmarkCountForCategory(category.id);
    const meta = document.createElement("span");
    meta.className = "tree-meta";
    const parts = [];
    if (childCount) parts.push(`${childCount} 子`);
    parts.push(`${bookmarkCount} 书签`);
    meta.textContent = parts.join(" · ");

    const actions = document.createElement("span");
    actions.className = "tree-actions";
    const addBtn = document.createElement("button");
    addBtn.className = "tree-action-btn";
    addBtn.type = "button";
    addBtn.dataset.action = "addChild";
    addBtn.dataset.categoryId = category.id;
    addBtn.title = "添加子分类";
    addBtn.textContent = "+";
    const renameBtnDisabled = category.id === "uncategorized";
    const renameBtn = document.createElement("button");
    renameBtn.className = "tree-action-btn";
    renameBtn.type = "button";
    renameBtn.dataset.action = "rename";
    renameBtn.dataset.categoryId = category.id;
    renameBtn.title = renameBtnDisabled ? "默认分类不可重命名" : "重命名";
    renameBtn.textContent = "✎";
    if (renameBtnDisabled) renameBtn.disabled = true;
    const deleteBtnDisabled = category.id === "uncategorized";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "tree-action-btn is-danger";
    deleteBtn.type = "button";
    deleteBtn.dataset.action = "delete";
    deleteBtn.dataset.categoryId = category.id;
    deleteBtn.title = deleteBtnDisabled ? "默认分类不可删除" : "删除";
    deleteBtn.textContent = "✕";
    if (deleteBtnDisabled) deleteBtn.disabled = true;
    actions.append(addBtn, renameBtn, deleteBtn);

    row.append(expandIndicator, nameEl, meta, actions);
  }

  li.append(row);

  if (hasChildren && isExpanded) {
    const childrenList = document.createElement("ul");
    childrenList.className = "tree-children";
    for (const child of category.children) {
      childrenList.append(renderCategoryTreeNode(child, depth + 1));
    }
    li.append(childrenList);
  }

  return li;
}

/* ---- Bookmark Panel ---- */

function renderBookmarkPanel() {
  elements.catBookmarksList.textContent = "";
  elements.selectedCategoryBookmarkCount.textContent = "";

  if (!state.selectedCategoryId) {
    elements.selectedCategoryLabel.textContent = "选择分类查看书签";
    elements.catBookmarksList.append(createEmptyNote("请先在左侧分类树中点击一个分类来查看其下书签。"));
    return;
  }

  const selectedCategory = state.categoryById.get(state.selectedCategoryId);
  if (!selectedCategory) {
    elements.selectedCategoryLabel.textContent = "分类不存在";
    return;
  }

  elements.selectedCategoryLabel.textContent = selectedCategory.name;

  const bookmarks = getBookmarksForSelectedCategory();
  elements.selectedCategoryBookmarkCount.textContent = `${bookmarks.length} 个书签`;

  if (!bookmarks.length) {
    elements.catBookmarksList.append(createEmptyNote("此分类下暂无书签。"));
    return;
  }

  const hint = document.createElement("div");
  hint.className = "bookmark-drag-hint";
  hint.textContent = `当前拖拽模式：${state.bookmarkDragMode === "copy" ? "复制" : "移动"}。拖动书签到左侧目标分类后，点击保存才会生效。`;
  elements.catBookmarksList.append(hint);

  const allCategories = collectCategoryOptions();
  if (state.batchManageEnabled) {
    elements.catBookmarksList.append(renderBatchToolbar(bookmarks, allCategories));
  } else {
    state.selectedBookmarkIds.clear();
  }

  for (const bookmark of bookmarks) {
    const item = document.createElement("article");
    item.className = "cat-bookmark-item";
    item.classList.toggle("has-batch", state.batchManageEnabled);
    item.dataset.bookmarkId = bookmark.id;
    item.draggable = true;
    item.title = state.bookmarkDragMode === "copy" ? "拖动复制到目标分类" : "拖动移动到目标分类";

    if (state.batchManageEnabled) {
      const check = document.createElement("input");
      check.className = "cat-bookmark-check";
      check.type = "checkbox";
      check.dataset.action = "toggleBookmarkSelection";
      check.dataset.bookmarkId = bookmark.id;
      check.checked = state.selectedBookmarkIds.has(bookmark.id);
      item.append(check);
    }

    const faviconMark = renderFaviconMark(bookmark, "cat-bookmark-favicon");

    const main = document.createElement("div");
    main.className = "cat-bookmark-main";
    const title = document.createElement("span");
    title.className = "cat-bookmark-title";
    title.textContent = bookmark.title || bookmark.url;
    const url = document.createElement("span");
    url.className = "cat-bookmark-url";
    url.textContent = bookmark.url;
    main.append(title, url);

    const actions = document.createElement("div");
    actions.className = "cat-bookmark-actions";

    const removeButton = document.createElement("button");
    removeButton.className = "bookmark-remove-button";
    removeButton.type = "button";
    removeButton.dataset.action = "removeBookmark";
    removeButton.dataset.bookmarkId = bookmark.id;
    removeButton.title = "从此分类移除";
    removeButton.textContent = "×";

    const menuButton = document.createElement("button");
    menuButton.className = "bookmark-menu-button";
    menuButton.type = "button";
    menuButton.dataset.action = "toggleBookmarkMenu";
    menuButton.dataset.bookmarkId = bookmark.id;
    menuButton.title = "更多操作";
    menuButton.textContent = "⋮";
    actions.append(removeButton, menuButton);

    if (state.bookmarkMenuOpenId === bookmark.id) {
      actions.append(renderBookmarkMenu(bookmark, allCategories));
    }

    item.append(faviconMark, main, actions);
    elements.catBookmarksList.append(item);
  }
}

function renderBatchToolbar(bookmarks, allCategories) {
  const toolbar = document.createElement("div");
  toolbar.className = "bookmark-batch-toolbar";

  const visibleIds = bookmarks.map((bookmark) => bookmark.id);
  const selectedCount = visibleIds.filter((id) => state.selectedBookmarkIds.has(id)).length;

  const selectAllLabel = document.createElement("label");
  selectAllLabel.className = "batch-select-all";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.dataset.action = "toggleVisibleBookmarks";
  selectAll.checked = Boolean(visibleIds.length) && selectedCount === visibleIds.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
  const selectAllText = document.createElement("span");
  selectAllText.textContent = `已选 ${selectedCount} 个`;
  selectAllLabel.append(selectAll, selectAllText);

  toolbar.append(
    selectAllLabel,
    createCategoryActionSelect("batchMoveBookmarks", "", "批量移动到...", allCategories),
    createCategoryActionSelect("batchCopyBookmarks", "", "批量复制到...", allCategories),
    createBookmarkActionButton("batchRemoveBookmarks", "", "从此分类移除", "ghost-button"),
    createBookmarkActionButton("clearBookmarkSelection", "", "清空选择", "ghost-button")
  );

  return toolbar;
}

function renderBookmarkMenu(bookmark, allCategories) {
  const menu = document.createElement("div");
  menu.className = "bookmark-menu";
  menu.append(
    createCategoryActionSelect("moveBookmark", bookmark.id, "移动到...", allCategories),
    createCategoryActionSelect("copyBookmark", bookmark.id, "复制到...", allCategories)
  );
  return menu;
}

function createCategoryActionSelect(action, bookmarkId, label, categories) {
  const select = document.createElement("select");
  select.className = "bookmark-action-select";
  select.dataset.action = action;
  if (bookmarkId) {
    select.dataset.bookmarkId = bookmarkId;
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = label;
  select.append(defaultOption);

  for (const cat of categories) {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.path;
    select.append(option);
  }

  return select;
}

function createBookmarkActionButton(action, bookmarkId, label, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.action = action;
  if (bookmarkId) {
    button.dataset.bookmarkId = bookmarkId;
  }
  button.textContent = label;
  return button;
}

function getBookmarksForSelectedCategory() {
  if (!state.selectedCategoryId) return [];

  const descendantIds = state.selectedCategoryId === "root"
    ? new Set(state.categoryById.keys())
    : getDescendantIds(getWorkingTree(), state.selectedCategoryId);

  const links = getWorkingLinks();

  return state.bookmarks.filter((bookmark) => {
    const linkedIds = links[bookmark.id] || [];
    return linkedIds.some((id) => descendantIds.has(id));
  });
}

function collectCategoryOptions() {
  const tree = getWorkingTree();
  const options = [];

  const visit = (node, path) => {
    if (node.id !== "root") {
      const fullPath = [...path, node.name];
      options.push({ id: node.id, name: node.name, path: fullPath.join(" / "), depth: fullPath.length });
    }
    for (const child of node.children || []) {
      visit(child, node.id === "root" ? [] : [...path, node.name]);
    }
  };

  visit(tree, []);
  return options;
}

/* ---- Category Operations ---- */

function beginCategoryEdit() {
  if (!state.pendingCategoryTree) {
    state.pendingCategoryTree = cloneValue(state.categoryTree);
    rebuildWorkingIndexes();
    updatePendingHints();
  }
}

function beginBookmarkEdit() {
  if (!state.pendingBookmarkLinks) {
    state.pendingBookmarkLinks = cloneValue(state.bookmarkCategoryLinks);
    updatePendingHints();
  }
}

async function confirmCategoryChanges() {
  if (!state.pendingCategoryTree) return;

  const sanitized = sanitizeCategoryTree(state.pendingCategoryTree);
  if (!sanitized) {
    showStatus("分类树数据异常，已放弃更改", true);
    discardCategoryChanges();
    return;
  }

  state.categoryTree = sanitized;
  state.pendingCategoryTree = null;

  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(state.bookmarkCategoryLinks, state.categoryTree);

  const namesList = buildCategoryNamesList(state.categoryTree);
  await chromeStorageSet({
    [STORAGE_KEYS.categoryTree]: state.categoryTree,
    [STORAGE_KEYS.categoryNamesList]: namesList,
    [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks,
  });

  rebuildWorkingIndexes();
  renderCategoriesSection();
  showStatus("分类更改已保存");
}

function discardCategoryChanges() {
  state.pendingCategoryTree = null;
  state.editingCategoryId = null;
  rebuildWorkingIndexes();
  renderCategoriesSection();
  showStatus("分类更改已放弃");
}

async function confirmBookmarkChanges() {
  if (!state.pendingBookmarkLinks) return;

  const sanitized = sanitizeBookmarkCategoryLinks(state.pendingBookmarkLinks, state.categoryTree);
  state.bookmarkCategoryLinks = sanitized;
  state.pendingBookmarkLinks = null;

  await chromeStorageSet({
    [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks,
  });

  renderCategoriesSection();
  showStatus("书签更改已保存");
}

function discardBookmarkChanges() {
  state.pendingBookmarkLinks = null;
  renderCategoriesSection();
  showStatus("书签更改已放弃");
}

function addCategory(parentId) {
  beginCategoryEdit();
  const tree = getWorkingTree();
  const indexes = createCategoryIndexes(tree);
  const parent = indexes.categoryById.get(parentId);

  if (!parent) return;

  const nextNumber = getNextDefaultGroupNumber(tree);
  const newId = `cat-${Date.now()}`;
  const newCategory = { id: newId, name: `未命名分组${nextNumber}`, children: [] };
  parent.children = [newCategory, ...(parent.children || [])];

  rebuildWorkingIndexes();
  if (parentId !== "root") {
    state.expandedCategoryIds.add(parentId);
  }
  renderCategoriesSection();
  startRename(newId);
}

function getNextDefaultGroupNumber(tree) {
  let maxNum = 0;
  const visit = (node) => {
    const match = node.name.match(/^未命名分组(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  visit(tree);
  return maxNum + 1;
}

function deleteCategory(categoryId) {
  if (categoryId === "root" || categoryId === "uncategorized") {
    showStatus("无法删除根分类和默认分类", true);
    return;
  }

  beginCategoryEdit();
  const tree = getWorkingTree();

  const removeFromNode = (node) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => child.id !== categoryId);
    for (const child of node.children) {
      removeFromNode(child);
    }
  };
  removeFromNode(tree);

  if (state.selectedCategoryId === categoryId) {
    state.selectedCategoryId = null;
    state.selectedBookmarkIds.clear();
    state.bookmarkMenuOpenId = null;
  }
  state.expandedCategoryIds.delete(categoryId);
  if (state.editingCategoryId === categoryId) {
    state.editingCategoryId = null;
  }

  rebuildWorkingIndexes();
  renderCategoriesSection();
}

function startRename(categoryId) {
  if (categoryId === "uncategorized") {
    showStatus("默认分类不可重命名", true);
    return;
  }
  beginCategoryEdit();
  state.editingCategoryId = categoryId;
  state.expandedCategoryIds.add(categoryId);
  renderCategoriesSection();

  requestAnimationFrame(() => {
    const input = elements.categoryTreeView.querySelector(`[data-rename-input="${categoryId}"]`);
    if (input) {
      input.focus();
      input.select();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commitRename(categoryId);
        if (e.key === "Escape") cancelRename();
      });
      input.addEventListener("blur", () => commitRename(categoryId));
    }
  });
}

function commitRename(categoryId) {
  const input = elements.categoryTreeView.querySelector(`[data-rename-input="${categoryId}"]`);
  const newName = input ? input.value.trim() : "";
  state.editingCategoryId = null;

  if (newName && state.pendingCategoryTree) {
    const renameInNode = (node) => {
      if (node.id === categoryId) {
        node.name = newName;
        return;
      }
      for (const child of node.children || []) {
        renameInNode(child);
      }
    };
    renameInNode(state.pendingCategoryTree);
    rebuildWorkingIndexes();
  }

  renderCategoriesSection();
}

function cancelRename() {
  state.editingCategoryId = null;
  renderCategoriesSection();
}

function selectCategory(categoryId) {
  state.selectedCategoryId = categoryId;
  state.selectedBookmarkIds.clear();
  state.bookmarkMenuOpenId = null;
  renderCategoriesSection();
}

/* ---- Tree Drag and Drop ---- */

function handleTreeDragStart(event) {
  const item = event.target.closest(".tree-item");
  if (!item || state.editingCategoryId || isTreeInteractiveTarget(event.target)) {
    event.preventDefault();
    return;
  }

  const categoryId = item.dataset.categoryId;
  if (!categoryId || categoryId === "root" || categoryId === "uncategorized") {
    event.preventDefault();
    return;
  }

  beginCategoryEdit();
  state.dragCategoryId = categoryId;
  state.dragCategoryIds = getDraggedCategoryIds(categoryId);
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-category-id", state.dragCategoryIds.join(","));
}

function handleTreeDragOver(event) {
  event.preventDefault();

  const draggingCategory = state.dragCategoryId !== null;
  const draggingBookmark = state.dragBookmarkId !== null;
  if (!draggingCategory && !draggingBookmark) return;

  const item = event.target.closest(".tree-item");
  if (!item) return;

  const targetId = item.dataset.categoryId;
  if (!targetId) return;

  clearDragClasses();

  if (draggingCategory) {
    if (state.dragCategoryIds.includes(targetId)) return;
    event.dataTransfer.dropEffect = "move";

    const rect = item.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < rect.height * 0.25) {
      item.classList.add("is-drop-before");
    } else if (y > rect.height * 0.75) {
      item.classList.add("is-drop-after");
    } else {
      item.classList.add("is-drop-target");
    }
  } else if (draggingBookmark) {
    const mode = state.dragBookmarkMode || "move";
    event.dataTransfer.dropEffect = mode === "copy" ? "copy" : "move";
    const row = item.querySelector(".tree-row");
    if (row) row.classList.add("is-bookmark-drop");
  }
}

function handleTreeDrop(event) {
  event.preventDefault();
  clearDragClasses();

  const item = event.target.closest(".tree-item");
  if (!item) return;

  const targetId = item.dataset.categoryId;
  if (!targetId || targetId === "root") return;

  if (state.dragCategoryId !== null) {
    handleCategoryDropOnTree(item, targetId, event);
  } else if (state.dragBookmarkId !== null) {
    handleBookmarkDropOnTree(targetId);
  }
}

function handleCategoryDropOnTree(item, targetId, event) {
  if (!state.pendingCategoryTree) return;
  if (state.dragCategoryIds.includes(targetId)) return;

  const draggedIds = getTopLevelDraggedCategoryIds(state.pendingCategoryTree, state.dragCategoryIds);
  const rect = item.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const tree = state.pendingCategoryTree;

  const isDescendantOf = (ancestorId, childId) => {
    const descendantIds = getDescendantIds(tree, ancestorId);
    return descendantIds.has(childId);
  };
  if (draggedIds.some((draggedId) => isDescendantOf(draggedId, targetId))) return;

  const draggedNodes = removeNodesFromTree(tree, draggedIds);
  if (!draggedNodes.length) return;

  if (y < rect.height * 0.25) {
    insertNodesBefore(tree, targetId, draggedNodes);
  } else if (y > rect.height * 0.75) {
    insertNodesAfter(tree, targetId, draggedNodes);
  } else {
    insertNodesAsChild(tree, targetId, draggedNodes);
  }

  rebuildWorkingIndexes();
  renderCategoriesSection();
}

function handleBookmarkDropOnTree(targetId) {
  beginBookmarkEdit();
  const links = getWorkingLinks();
  const bookmarkId = state.dragBookmarkId;
  const mode = state.dragBookmarkMode;
  const currentIds = [...(links[bookmarkId] || ["uncategorized"])];
  const selectedIds = getSelectedCategoryScopeIds();

  let newIds;
  if (mode === "copy") {
    newIds = [...currentIds.filter((id) => id !== "uncategorized"), targetId];
  } else {
    newIds = currentIds
      .filter((id) => !selectedIds.has(id) && id !== "uncategorized")
      .concat(targetId === "uncategorized" ? [] : [targetId]);
  }

  state.pendingBookmarkLinks = {
    ...state.pendingBookmarkLinks,
    [bookmarkId]: normalizeBookmarkCategoryIds(newIds),
  };

  state.dragBookmarkId = null;
  state.dragBookmarkMode = null;
  renderCategoriesSection();
}

function handleTreeDragEnd(event) {
  clearDragClasses();
  const item = event.target.closest(".tree-item");
  if (item) item.classList.remove("is-dragging");
  state.dragCategoryId = null;
  state.dragCategoryIds = [];
}

function removeNodeFromTree(node, targetId) {
  if (!node.children) return null;
  const index = node.children.findIndex((child) => child.id === targetId);
  if (index !== -1) {
    const [removed] = node.children.splice(index, 1);
    return removed;
  }
  for (const child of node.children) {
    const result = removeNodeFromTree(child, targetId);
    if (result) return result;
  }
  return null;
}

function removeNodesFromTree(tree, targetIds) {
  const targetSet = new Set(targetIds);
  const removed = [];

  const visit = (node) => {
    if (!node.children) return;
    const nextChildren = [];
    for (const child of node.children) {
      if (targetSet.has(child.id)) {
        removed.push(child);
      } else {
        visit(child);
        nextChildren.push(child);
      }
    }
    node.children = nextChildren;
  };

  visit(tree);
  return removed;
}

function insertNodeBefore(tree, targetId, node) {
  const insertInChildren = (parent) => {
    if (!parent.children) return false;
    const index = parent.children.findIndex((child) => child.id === targetId);
    if (index !== -1) {
      parent.children.splice(index, 0, node);
      return true;
    }
    for (const child of parent.children) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function insertNodesBefore(tree, targetId, nodes) {
  const insertInChildren = (parent) => {
    if (!parent.children) return false;
    const index = parent.children.findIndex((child) => child.id === targetId);
    if (index !== -1) {
      parent.children.splice(index, 0, ...nodes);
      return true;
    }
    for (const child of parent.children) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function insertNodeAfter(tree, targetId, node) {
  const insertInChildren = (parent) => {
    if (!parent.children) return false;
    const index = parent.children.findIndex((child) => child.id === targetId);
    if (index !== -1) {
      parent.children.splice(index + 1, 0, node);
      return true;
    }
    for (const child of parent.children) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function insertNodesAfter(tree, targetId, nodes) {
  const insertInChildren = (parent) => {
    if (!parent.children) return false;
    const index = parent.children.findIndex((child) => child.id === targetId);
    if (index !== -1) {
      parent.children.splice(index + 1, 0, ...nodes);
      return true;
    }
    for (const child of parent.children) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function insertNodeAsChild(tree, targetId, node) {
  const insertInChildren = (parent) => {
    if (parent.id === targetId) {
      parent.children = [...(parent.children || []), node];
      state.expandedCategoryIds.add(targetId);
      return true;
    }
    for (const child of parent.children || []) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function insertNodesAsChild(tree, targetId, nodes) {
  const insertInChildren = (parent) => {
    if (parent.id === targetId) {
      parent.children = [...(parent.children || []), ...nodes];
      state.expandedCategoryIds.add(targetId);
      return true;
    }
    for (const child of parent.children || []) {
      if (insertInChildren(child)) return true;
    }
    return false;
  };
  insertInChildren(tree);
}

function clearDragClasses() {
  elements.categoryTreeView.querySelectorAll(".is-drop-target, .is-drop-before, .is-drop-after").forEach((el) => {
    el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
  });
  elements.categoryTreeView.querySelectorAll(".tree-row.is-bookmark-drop").forEach((el) => {
    el.classList.remove("is-bookmark-drop");
  });
}

/* ---- Tree Click Handler ---- */

function handleTreeViewClick(event) {
  const clearButton = event.target.closest("button[data-action='clearCategorySelection']");
  if (clearButton) {
    state.selectedCategoryIds.clear();
    renderCategoriesSection();
    return;
  }

  if (event.target.closest("input[data-action='toggleCategorySelection'], input[data-action='toggleVisibleCategories']")) {
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) {
    const row = event.target.closest(".tree-row");
    if (row && !state.editingCategoryId) {
      const item = row.closest(".tree-item");
      if (item) {
        const categoryId = item.dataset.categoryId;
        if (state.showBookmarkPanel) {
          selectCategory(categoryId);
        }
        toggleCategoryExpand(categoryId);
      }
    }
    return;
  }

  const categoryId = button.dataset.categoryId;
  const action = button.dataset.action;

  switch (action) {
    case "addChild":
      addCategory(categoryId);
      break;
    case "rename":
      startRename(categoryId);
      break;
    case "delete":
      deleteCategory(categoryId);
      break;
    case "confirmRename":
      commitRename(categoryId);
      break;
    case "cancelRename":
      cancelRename();
      break;
  }
}

function toggleCategoryExpand(categoryId) {
  const tree = getWorkingTree();
  const hasChildren = (node, id) => {
    if (node.id === id) return (node.children || []).length > 0;
    for (const child of node.children || []) {
      if (hasChildren(child, id)) return true;
    }
    return false;
  };
  if (!hasChildren(tree, categoryId)) return;

  if (state.expandedCategoryIds.has(categoryId)) {
    state.expandedCategoryIds.delete(categoryId);
  } else {
    state.expandedCategoryIds.add(categoryId);
  }
  renderCategoriesSection();
}

/* ---- Bookmark Panel Handlers ---- */

function handleBookmarkPanelChange(event) {
  const checkbox = event.target.closest("input[data-action='toggleBookmarkSelection']");
  if (checkbox) {
    const bookmarkId = checkbox.dataset.bookmarkId;
    if (checkbox.checked) {
      state.selectedBookmarkIds.add(bookmarkId);
    } else {
      state.selectedBookmarkIds.delete(bookmarkId);
    }
    renderCategoriesSection();
    return;
  }

  const selectAll = event.target.closest("input[data-action='toggleVisibleBookmarks']");
  if (selectAll) {
    const visibleIds = getBookmarksForSelectedCategory().map((bookmark) => bookmark.id);
    if (selectAll.checked) {
      visibleIds.forEach((id) => state.selectedBookmarkIds.add(id));
    } else {
      visibleIds.forEach((id) => state.selectedBookmarkIds.delete(id));
    }
    renderCategoriesSection();
    return;
  }

  const select = event.target.closest("select[data-action]");
  if (!select || !select.value) return;

  const action = select.dataset.action;
  const targetId = select.value;
  select.value = "";

  if (action === "moveBookmark" || action === "copyBookmark") {
    applyBookmarkCategoryChange(select.dataset.bookmarkId, targetId, action === "copyBookmark" ? "copy" : "move");
    return;
  }

  if (action === "batchMoveBookmarks" || action === "batchCopyBookmarks") {
    const mode = action === "batchCopyBookmarks" ? "copy" : "move";
    const bookmarkIds = getSelectedVisibleBookmarkIds();
    if (!bookmarkIds.length) {
      showStatus("请先选择要批量处理的书签", true);
      return;
    }
    bookmarkIds.forEach((bookmarkId) => applyBookmarkCategoryChange(bookmarkId, targetId, mode, { skipRender: true }));
    state.bookmarkMenuOpenId = null;
    renderCategoriesSection();
  }
}

function handleTreeViewChange(event) {
  const checkbox = event.target.closest("input[data-action='toggleCategorySelection']");
  if (checkbox) {
    const categoryId = checkbox.dataset.categoryId;
    if (!isCategoryBatchSelectable(categoryId)) return;
    if (checkbox.checked) {
      state.selectedCategoryIds.add(categoryId);
    } else {
      state.selectedCategoryIds.delete(categoryId);
    }
    renderCategoriesSection();
    return;
  }

  const selectAll = event.target.closest("input[data-action='toggleVisibleCategories']");
  if (!selectAll) return;

  const movableIds = getMovableCategoryIds(getWorkingTree());
  if (selectAll.checked) {
    movableIds.forEach((id) => state.selectedCategoryIds.add(id));
  } else {
    movableIds.forEach((id) => state.selectedCategoryIds.delete(id));
  }
  renderCategoriesSection();
}

function handleBookmarkPanelDragStart(event) {
  const item = event.target.closest(".cat-bookmark-item");
  if (!item || isBookmarkInteractiveTarget(event.target)) {
    event.preventDefault();
    return;
  }

  const bookmarkId = item.dataset.bookmarkId;
  if (!bookmarkId) {
    event.preventDefault();
    return;
  }

  state.dragBookmarkId = bookmarkId;
  state.dragBookmarkMode = state.bookmarkDragMode;
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = state.bookmarkDragMode === "copy" ? "copy" : "move";
  event.dataTransfer.setData(`application/x-bookmark-${state.bookmarkDragMode}`, bookmarkId);
}

function handleBookmarkPanelDragEnd(event) {
  const item = event.target.closest(".cat-bookmark-item");
  if (item) item.classList.remove("is-dragging");
  state.dragBookmarkId = null;
  state.dragBookmarkMode = null;
}

function handleBookmarkPanelClick(event) {
  const menuButton = event.target.closest("button[data-action='toggleBookmarkMenu']");
  if (menuButton) {
    const bookmarkId = menuButton.dataset.bookmarkId;
    state.bookmarkMenuOpenId = state.bookmarkMenuOpenId === bookmarkId ? null : bookmarkId;
    renderCategoriesSection();
    return;
  }

  const clearButton = event.target.closest("button[data-action='clearBookmarkSelection']");
  if (clearButton) {
    state.selectedBookmarkIds.clear();
    renderCategoriesSection();
    return;
  }

  const batchRemoveButton = event.target.closest("button[data-action='batchRemoveBookmarks']");
  if (batchRemoveButton) {
    const bookmarkIds = getSelectedVisibleBookmarkIds();
    if (!bookmarkIds.length) {
      showStatus("请先选择要批量处理的书签", true);
      return;
    }
    bookmarkIds.forEach((bookmarkId) => removeBookmarkFromSelectedScope(bookmarkId, { skipRender: true }));
    state.bookmarkMenuOpenId = null;
    renderCategoriesSection();
    return;
  }

  const button = event.target.closest("button[data-action='removeBookmark']");
  if (!button) return;

  const bookmarkId = button.dataset.bookmarkId;
  removeBookmarkFromSelectedScope(bookmarkId);
}

function applyBookmarkCategoryChange(bookmarkId, targetId, mode, options = {}) {
  if (!bookmarkId || !targetId) return;
  beginBookmarkEdit();
  const links = getWorkingLinks();
  const currentIds = links[bookmarkId] || ["uncategorized"];
  const selectedIds = getSelectedCategoryScopeIds();
  const newIds =
    mode === "copy"
      ? currentIds.filter((id) => id !== "uncategorized").concat(targetId)
      : currentIds
          .filter((id) => !selectedIds.has(id) && id !== "uncategorized")
          .concat(targetId === "uncategorized" ? [] : [targetId]);

  state.pendingBookmarkLinks = {
    ...state.pendingBookmarkLinks,
    [bookmarkId]: normalizeBookmarkCategoryIds(newIds),
  };

  if (!options.skipRender) {
    state.bookmarkMenuOpenId = null;
    renderCategoriesSection();
  }
}

function removeBookmarkFromSelectedScope(bookmarkId, options = {}) {
  if (!bookmarkId) return;
  beginBookmarkEdit();
  const links = getWorkingLinks();
  const selectedIds = getSelectedCategoryScopeIds();
  const currentIds = links[bookmarkId] || ["uncategorized"];
  const newIds = currentIds.filter((id) => !selectedIds.has(id));

  state.pendingBookmarkLinks = {
    ...state.pendingBookmarkLinks,
    [bookmarkId]: normalizeBookmarkCategoryIds(newIds),
  };
  state.selectedBookmarkIds.delete(bookmarkId);

  if (!options.skipRender) {
    state.bookmarkMenuOpenId = null;
    renderCategoriesSection();
  }
}

function getSelectedVisibleBookmarkIds() {
  const visibleIds = new Set(getBookmarksForSelectedCategory().map((bookmark) => bookmark.id));
  return Array.from(state.selectedBookmarkIds).filter((id) => visibleIds.has(id));
}

function isBookmarkInteractiveTarget(target) {
  return Boolean(target.closest("button, input, select, textarea, a"));
}

function isTreeInteractiveTarget(target) {
  return Boolean(target.closest("button, input, select, textarea, a"));
}

/* ---- AI Classification ---- */

async function runAiClassification({ reclassifyAll = false, source = "categories-unclassified" } = {}) {
  if (state.isAiClassificationRunning) {
    showStatus("AI 正在处理，请等待当前任务完成");
    return;
  }
  const provider = getActiveAiProvider();
  if (!provider) {
    showStatus("请先在 AI 配置中添加并选择一个 AI 厂家", true);
    return;
  }

  const targetBookmarks = getAiClassificationTargetBookmarks(reclassifyAll);
  if (!targetBookmarks.length) {
    showStatus(reclassifyAll ? "当前没有可重新分析的书签" : "当前没有未分类书签需要 AI 处理");
    return;
  }

  clearAiClassificationCache();
  state.isAiClassificationRunning = true;
  renderAiClassificationEntry();
  setAiClassificationStatus(
    "正在准备 AI 分类任务",
    `将处理 ${targetBookmarks.length} 个书签，AI 会同时生成分类体系草案和临时归类缓存。`,
    { isRunning: true }
  );
  try {
    const namesList = buildCategoryNamesList(state.categoryTree);
    const task = buildBookmarkClassificationTask({
      provider,
      bookmarks: targetBookmarks,
      reclassifyAll,
      source,
    });

    state.pendingAiClassificationTask = task.local;
    await chromeStorageSet({ [STORAGE_KEYS.categoryNamesList]: namesList });
    setAiClassificationStatus(
      "正在生成分类体系草案和归类缓存",
      `正在分批分析 ${targetBookmarks.length} 个书签，AI 可能需要一些时间。`,
      { isRunning: true }
    );
    const taxonomyResult = await runAiTaxonomyDraft(task);
    state.pendingAiTaxonomyDraft = taxonomyResult.draft;
    state.pendingAiClassificationPreview = buildAiTaxonomyPreview(taxonomyResult.draft, task.local);

    const actionText = reclassifyAll ? "重新分析全部书签" : "处理未分类书签";
    renderRulesSection();
    setAiClassificationStatus(
      "分类体系草案和归类缓存已生成",
      `请确认候选分组后生成本地归类预览。${taxonomyResult.statusLabel}。`,
      { isDone: true }
    );
    showStatus(
      `${actionText}已生成分类体系草案和归类缓存，请先确认体系后生成本地归类预览（${taxonomyResult.statusLabel}）`
    );
  } catch (error) {
    clearAiClassificationCache();
    renderRulesSection();
    setAiClassificationStatus(
      "AI 分类任务失败",
      error instanceof Error ? error.message : "AI 自动分类请求准备失败",
      { isError: true }
    );
    showStatus(error instanceof Error ? error.message : "AI 自动分类请求准备失败", true);
  } finally {
    state.isAiClassificationRunning = false;
    renderAiClassificationEntry();
  }
}

function getActiveAiProvider() {
  return state.aiSettings.providers.find((provider) => provider.id === state.aiSettings.activeProviderId) || null;
}

function getAiClassificationTargetBookmarks(reclassifyAll) {
  if (reclassifyAll) {
    return [...state.bookmarks];
  }

  return state.bookmarks.filter((bookmark) => {
    const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
    return linkedIds.length === 0 || (linkedIds.length === 1 && linkedIds[0] === "uncategorized");
  });
}

function buildBookmarkClassificationTask({ provider, bookmarks, reclassifyAll, source }) {
  const taskSettings = getBookmarkClassificationTaskSettings();
  const prompt = getAiPromptTemplate(taskSettings.promptKey, provider);
  const categoryPaths = getLeafCategoryPathEntries(state.categoryTree);
  const bookmarkIdByLabel = {};
  const items = bookmarks.map((bookmark, index) => {
    const label = `B${String(index + 1).padStart(4, "0")}`;
    bookmarkIdByLabel[label] = bookmark.id;
    return buildBookmarkClassificationItem(label, bookmark);
  });
  const batches = chunkItems(items, taskSettings.batchSize).map((batchItems, index) => ({
    batchNo: index + 1,
    items: batchItems,
  }));
  const taskId = `bookmark-classification-${Date.now()}`;

  const request = {
    taskId,
    taskType: "bookmarkClassification",
    promptKey: taskSettings.promptKey,
    prompt,
    source,
    provider: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
    },
    dataFields: [...state.aiSettings.dataFields],
    reclassifyAll,
    categoryState: {
      hasExistingGroups: categoryPaths.length > 0,
      newGroupPolicy: "先判断是否需要新增分组；若需要，先返回 newGroups，再在 assignments 中引用对应路径。",
    },
    categoryPaths: categoryPaths.map((category) => category.path),
    batches,
    responseFormat: {
      type: "json-object",
      shape:
        "{ hasNewGroups: boolean, newGroups: Array<{ path: string, reason?: string }>, assignments: Array<{ id: string, categories: string[] }> }",
    },
  };

  return {
    request,
    local: {
      taskId,
      createdAt: Date.now(),
      promptKey: taskSettings.promptKey,
      batchSize: taskSettings.batchSize,
      bookmarkIdByLabel,
      totalBookmarks: bookmarks.length,
      basePrompt: prompt,
      request,
    },
  };
}

async function confirmAiTaxonomyDraft() {
  if (state.isAiClassificationRunning) {
    showStatus("AI 正在处理，请等待当前任务完成");
    return;
  }
  const preview = state.pendingAiClassificationPreview;
  const task = state.pendingAiClassificationTask;
  if (!preview || preview.phase !== "taxonomy" || !task) {
    showStatus("当前没有可确认的分类体系草案", true);
    return;
  }

  const confirmedCandidatePaths = preview.entries
    .filter((entry) => entry.type === "candidateGroup" && entry.selected !== false)
    .map((entry) => entry.path);
  if (!confirmedCandidatePaths.length && !preview.appliedCategoryPaths.length) {
    showStatus("请至少保留一个候选分组或先创建本地分类", true);
    return;
  }

  try {
    setAiClassificationStatus(
      "正在整理缓存的书签归类",
      `将 ${task.totalBookmarks} 个书签按确认后的 ${confirmedCandidatePaths.length + preview.appliedCategoryPaths.length} 个分类路径生成预览。`,
      { isRunning: true }
    );
    state.pendingAiClassificationPreview = buildAiClassificationPreviewFromCachedAssignments({
      ...task,
      confirmedCandidatePaths,
      allowedCategoryPaths: unique([...preview.appliedCategoryPaths, ...confirmedCandidatePaths]),
      cachedAssignments: preview.cachedAssignments || [],
      pathAliases: preview.pathAliases || {},
    });
    renderRulesSection();
    setAiClassificationStatus(
      "书签归类结果已生成",
      "请检查预览并应用勾选结果。本次归类结果来自前一阶段已缓存的 AI 分析结果。",
      { isDone: true }
    );
    showStatus("分类体系已确认，已根据缓存结果生成书签归类预览");
  } catch (error) {
    renderRulesSection();
    setAiClassificationStatus(
      "书签归类失败",
      error instanceof Error ? error.message : "缓存归类结果整理失败",
      { isError: true }
    );
    showStatus(error instanceof Error ? error.message : "缓存归类结果整理失败", true);
  }
}

function buildBookmarkClassificationItem(label, bookmark) {
  const item = { id: label };
  const fields = new Set(state.aiSettings.dataFields);

  if (fields.has("title")) {
    item.title = bookmark.title || "";
  }
  if (fields.has("url")) {
    item.url = bookmark.url || "";
  }
  if (fields.has("domain")) {
    item.domain = bookmark.domain || "";
  }
  if (fields.has("folderPath")) {
    item.folderPath = Array.isArray(bookmark.folderPath) ? bookmark.folderPath.join(" / ") : "";
  }
  if (fields.has("categories")) {
    item.categories = getCategoryLabelsForBookmark(bookmark);
  }

  return item;
}

async function runAiTaxonomyDraft(task) {
  const provider = getProviderWithSecret(task.request.provider.id);
  validateAiProviderForRequest(provider);

  const appliedCategoryPaths = task.request.categoryPaths;
  const draft = {
    appliedCategoryPaths,
    candidatePaths: [],
    pathAliases: {},
    changeLog: [],
    cachedAssignments: [],
  };
  const results = [];
  let sentBatchCount = 0;
  let retrySplitCount = 0;

  for (const batch of task.request.batches) {
    setAiClassificationStatus(
      "正在生成分类体系草案和归类缓存",
      `正在处理第 ${batch.batchNo} / ${task.request.batches.length} 批，已收集 ${draft.candidatePaths.length} 个候选分组，已缓存 ${draft.cachedAssignments.length} 条书签归类建议。`,
      { isRunning: true }
    );
    const request = buildTaxonomyDraftRequest(task.request, draft, batch);
    const batchResults = await sendAiBatchWithTimeoutRetry(provider, request, batch);
    sentBatchCount += batchResults.length;
    retrySplitCount += Math.max(0, batchResults.length - 1);
    results.push(...batchResults);

    for (const result of batchResults) {
      const payload = normalizeAiTaxonomyPayload(parseAiJsonContent(result.content));
      applyAiTaxonomyPayloadToDraft(draft, payload, task.local);
    }
  }

  return {
    draft,
    results,
    statusLabel: retrySplitCount
      ? `已发送 ${sentBatchCount} 批体系草案与归类缓存请求，自动拆分 ${retrySplitCount} 次超时批次`
      : `已发送 ${sentBatchCount} 批体系草案与归类缓存请求`,
  };
}

function buildTaxonomyDraftRequest(baseRequest, draft, batch) {
  return {
    ...baseRequest,
    taskType: "bookmarkTaxonomyDraft",
    prompt: AI_TAXONOMY_DRAFT_PROMPT,
    categoryState: {
      appliedCategoryPaths: draft.appliedCategoryPaths,
      candidateCategoryPaths: draft.candidatePaths,
      pathAliases: draft.pathAliases,
      assignmentPolicy:
        "categories 是数组。必须主动判断内容主题、使用目的、工具属性、平台/资源类型等维度；命中两个互不包含维度时返回 2-3 个分类路径，不要把多标签能力退化成单分类。",
      priorityPolicy:
        "优先用多个已生效分组或候选分组组合归类；只有多标签组合仍无法覆盖一批书签共同用途时，才允许提出 newGroups。不要为了单个书签创建更精确的新分类。",
      multiLabelExamples: [
        "开发文档 -> 学习/技术 + 工具/开发",
        "音乐制作工具 -> 娱乐/音乐 + 工具/创作",
        "设计素材站 -> 创作/设计 + 资源/素材",
      ],
      taxonomyPolicy:
        "已生效分组稳定优先；候选分组可以合并、改名或上提。一级分类必须宽泛，禁止单一用途作为一级分类。新增分组不是优先目标，必须先尝试多标签归类。",
    },
    categoryPaths: draft.appliedCategoryPaths,
    responseFormat: {
      type: "json-object",
      shape:
        "{ newGroups: Array<{ path: string, reason?: string }>, changes: Array<{ type: string, from?: string, fromPaths?: string[], to: string, reason?: string }>, assignments: Array<{ id: string, categories: string[], confidence?: number, reason?: string }> }",
    },
    batches: [batch],
  };
}

function normalizeAiTaxonomyPayload(parsed) {
  const payload = parsed?.result && typeof parsed.result === "object"
    ? parsed.result
    : parsed?.data && typeof parsed.data === "object"
      ? parsed.data
      : parsed;
  const newGroups = Array.isArray(payload?.newGroups)
    ? payload.newGroups
    : Array.isArray(payload?.candidateGroups)
      ? payload.candidateGroups
      : [];
  const changes = Array.isArray(payload?.changes)
    ? payload.changes
    : Array.isArray(payload?.taxonomyChanges)
      ? payload.taxonomyChanges
      : [];
  const assignments = Array.isArray(payload?.assignments)
    ? payload.assignments
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  return { newGroups, changes, assignments };
}

function applyAiTaxonomyPayloadToDraft(draft, payload, localTask) {
  const appliedSet = new Set(draft.appliedCategoryPaths);
  const candidateSet = new Set(draft.candidatePaths.map((path) => resolveTaxonomyPathAlias(draft, path)));

  for (const group of payload.newGroups) {
    const path = normalizeCategoryPathText(group?.path || group?.categoryPath || group?.name);
    if (!path || appliedSet.has(path)) {
      continue;
    }
    candidateSet.add(resolveTaxonomyPathAlias(draft, path));
  }

  for (const change of payload.changes) {
    const toPath = normalizeCategoryPathText(change?.to || change?.toPath || change?.path);
    const fromPaths = normalizeTaxonomyChangeFromPaths(change);
    if (!toPath || !fromPaths.length) {
      continue;
    }

    const canonicalTo = resolveTaxonomyPathAlias(draft, toPath);
    if (!appliedSet.has(canonicalTo)) {
      candidateSet.add(canonicalTo);
    }
    for (const fromPath of fromPaths) {
      if (appliedSet.has(fromPath)) {
        continue;
      }
      const canonicalFrom = resolveTaxonomyPathAlias(draft, fromPath);
      draft.pathAliases[canonicalFrom] = canonicalTo;
      draft.pathAliases[fromPath] = canonicalTo;
      candidateSet.delete(canonicalFrom);
      candidateSet.delete(fromPath);
    }
    draft.changeLog.push({
      id: `taxonomy-change:${draft.changeLog.length + 1}:${canonicalTo}`,
      type: String(change?.type || "merge"),
      fromPaths,
      toPath: canonicalTo,
      reason: String(change?.reason || ""),
    });
  }

  draft.candidatePaths = Array.from(candidateSet)
    .map((path) => resolveTaxonomyPathAlias(draft, path))
    .filter((path) => path && !appliedSet.has(path))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  draft.cachedAssignments = remapCachedTaxonomyAssignments(draft, draft.cachedAssignments || []);

  for (const assignment of payload.assignments || []) {
    const normalizedAssignment = normalizeTaxonomyDraftAssignment(draft, assignment, localTask);
    if (!normalizedAssignment) {
      continue;
    }
    for (const categoryPath of normalizedAssignment.categories) {
      if (!appliedSet.has(categoryPath)) {
        candidateSet.add(categoryPath);
      }
    }
    const existingIndex = draft.cachedAssignments.findIndex((item) => item.label === normalizedAssignment.label);
    if (existingIndex >= 0) {
      draft.cachedAssignments[existingIndex] = normalizedAssignment;
    } else {
      draft.cachedAssignments.push(normalizedAssignment);
    }
  }

  draft.candidatePaths = Array.from(candidateSet)
    .map((path) => resolveTaxonomyPathAlias(draft, path))
    .filter((path) => path && !appliedSet.has(path))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeTaxonomyChangeFromPaths(change) {
  const rawPaths = Array.isArray(change?.fromPaths)
    ? change.fromPaths
    : Array.isArray(change?.from)
      ? change.from
      : [change?.from || change?.fromPath || change?.oldPath || change?.source];
  return rawPaths.map(normalizeCategoryPathText).filter(Boolean);
}

function normalizeTaxonomyDraftAssignment(draft, assignment, localTask) {
  const label = String(assignment?.id || assignment?.label || "").trim();
  const bookmarkId = localTask?.bookmarkIdByLabel?.[label] || "";
  if (!label || !bookmarkId) {
    return null;
  }

  const rawCategories = Array.isArray(assignment?.categories)
    ? assignment.categories
    : Array.isArray(assignment?.categoryPaths)
      ? assignment.categoryPaths
      : typeof assignment?.category === "string" || typeof assignment?.path === "string"
        ? [assignment.category || assignment.path]
        : [];
  const categories = unique(
    rawCategories
      .map((path) => resolveTaxonomyPathAlias(draft, path))
      .filter(Boolean)
  );
  if (!categories.length) {
    return null;
  }

  return {
    label,
    bookmarkId,
    categories,
    confidence: Number(assignment?.confidence) || 0,
    reason: String(assignment?.reason || ""),
  };
}

function remapCachedTaxonomyAssignments(draft, cachedAssignments) {
  return (cachedAssignments || [])
    .map((assignment) => ({
      ...assignment,
      categories: unique(
        (assignment.categories || [])
          .map((path) => resolveTaxonomyPathAlias(draft, path))
          .filter(Boolean)
      ),
    }))
    .filter((assignment) => assignment.categories.length);
}

function resolveTaxonomyPathAlias(draft, path) {
  let current = normalizeCategoryPathText(path);
  const visited = new Set();
  while (current && draft.pathAliases[current] && !visited.has(current)) {
    visited.add(current);
    current = normalizeCategoryPathText(draft.pathAliases[current]);
  }
  return current;
}

function buildAiTaxonomyPreview(draft, localTask) {
  const candidateEntries = draft.candidatePaths.map((path) => ({
    id: `candidate-group:${path}`,
    type: "candidateGroup",
    path,
    reason: "",
    selected: true,
  }));
  const changeEntries = draft.changeLog.map((change) => ({
    id: change.id,
    type: "taxonomyChange",
    fromPaths: change.fromPaths,
    toPath: change.toPath,
    changeTypeLabel: getTaxonomyChangeTypeLabel(change.type),
    reason: change.reason,
    selected: true,
  }));

  if (!candidateEntries.length && !draft.appliedCategoryPaths.length) {
    throw new Error("AI 没有生成可用的分类体系草案");
  }

  return {
    phase: "taxonomy",
    taskId: localTask.taskId,
    createdAt: Date.now(),
    appliedCategoryPaths: draft.appliedCategoryPaths,
    pathAliases: { ...draft.pathAliases },
    cachedAssignments: remapCachedTaxonomyAssignments(draft, draft.cachedAssignments || []),
    entries: [...candidateEntries, ...changeEntries],
  };
}

function getTaxonomyChangeTypeLabel(type) {
  return {
    merge: "合并",
    rename: "改名",
    upLevel: "上提父级",
    move: "移动",
  }[type] || "整理";
}

function buildAiClassificationPreviewFromCachedAssignments(localTask) {
  const entries = [];
  const aliasDraft = { pathAliases: localTask.pathAliases || {} };
  const allowedPaths = new Set(localTask.allowedCategoryPaths || []);

  for (const assignment of localTask.cachedAssignments || []) {
    const label = String(assignment?.label || assignment?.id || "").trim();
    const bookmarkId = localTask.bookmarkIdByLabel?.[label] || "";
    const bookmark = state.bookmarks.find((item) => item.id === bookmarkId);
    const categories = unique(
      (assignment.categories || [])
        .map((path) => resolveTaxonomyPathAlias(aliasDraft, path))
        .filter((path) => path && (!allowedPaths.size || allowedPaths.has(path)))
    );
    if (!label || !bookmarkId || !bookmark || !categories.length) {
      continue;
    }
    entries.push({
      id: `assignment:${label}`,
      type: "assignment",
      label,
      bookmarkId,
      bookmarkTitle: bookmark.title || bookmark.url,
      categories,
      currentCategories: getCategoryLabelsForBookmark(bookmark),
      confidence: Number(assignment?.confidence) || 0,
      reason: String(assignment?.reason || ""),
      selected: true,
    });
  }

  if (!entries.length) {
    throw new Error("AI 已返回响应，但缓存归类结果中没有可预览的书签");
  }

  return {
    phase: "assignment",
    taskId: localTask.taskId,
    createdAt: Date.now(),
    confirmedCandidatePaths: localTask.confirmedCandidatePaths || [],
    entries,
  };
}

function parseAiJsonContent(content) {
  const text = String(content || "").trim();
  if (!text) {
    throw new Error("AI 响应内容为空");
  }
  try {
    return JSON.parse(stripMarkdownJsonFence(text));
  } catch {
    throw new Error("AI 响应不是合法 JSON，无法生成预览");
  }
}

function stripMarkdownJsonFence(text) {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function normalizeCategoryPathText(value) {
  return String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function getBookmarkClassificationTaskSettings() {
  const settings = state.aiSettings.taskSettings?.bookmarkClassification || {};
  return {
    promptKey: DEFAULT_AI_TASK_SETTINGS.bookmarkClassification.promptKey,
    batchSize: clampNumber(
      settings.batchSize,
      1,
      500,
      DEFAULT_AI_TASK_SETTINGS.bookmarkClassification.batchSize
    ),
  };
}

function getBookmarkIndexingTaskSettings() {
  const settings = state.aiSettings.taskSettings?.bookmarkIndexing || {};
  return {
    promptKey: DEFAULT_AI_TASK_SETTINGS.bookmarkIndexing.promptKey,
    batchSize: clampNumber(
      settings.batchSize,
      1,
      500,
      DEFAULT_AI_TASK_SETTINGS.bookmarkIndexing.batchSize
    ),
  };
}

function getAiPromptTemplate(promptKey, provider = getActiveAiProvider()) {
  return String(
    provider?.promptTemplates?.[promptKey] ||
      state.aiSettings.promptTemplates?.[promptKey] ||
      DEFAULT_AI_PROMPTS[promptKey] ||
      ""
  ).trim();
}

function getLeafCategoryPathEntries(tree) {
  const entries = [];

  const visit = (node, path) => {
    const nextPath = node.id === "root" ? [] : [...path, node.name];
    const classifiableChildren = (node.children || []).filter((child) => child.id !== "uncategorized");

    if (node.id !== "root" && node.id !== "uncategorized" && !classifiableChildren.length) {
      entries.push({
        id: node.id,
        path: nextPath.join("/"),
      });
    }

    for (const child of node.children || []) {
      visit(child, nextPath);
    }
  };

  visit(tree, []);
  return entries;
}

async function dispatchAiTaskRequest(request) {
  const provider = getProviderWithSecret(request.provider.id);
  validateAiProviderForRequest(provider);
  const results = [];
  let sentBatchCount = 0;
  let retrySplitCount = 0;

  for (const batch of request.batches) {
    const batchResults = await sendAiBatchWithTimeoutRetry(provider, request, batch);
    sentBatchCount += batchResults.length;
    retrySplitCount += Math.max(0, batchResults.length - 1);
    results.push(...batchResults);
  }

  return {
    status: "sent",
    statusLabel: retrySplitCount
      ? `已发送 ${sentBatchCount} 批真实 API 请求，自动拆分 ${retrySplitCount} 次超时批次`
      : `已发送 ${sentBatchCount} 批真实 API 请求`,
    results,
  };
}

async function sendAiBatchWithTimeoutRetry(provider, request, batch) {
  try {
    const body = buildAiProviderRequestBody(provider, request, batch);
    const response = await sendAiProviderRequest(provider, body);
    return [
      {
        batchNo: batch.batchNo,
        content: extractAiResponseText(provider, response),
        raw: response,
      },
    ];
  } catch (error) {
    if (!isAiTimeoutError(error) || batch.items.length <= MIN_AI_RETRY_BATCH_SIZE) {
      throw error;
    }

    const middle = Math.ceil(batch.items.length / 2);
    const left = {
      ...batch,
      batchNo: `${batch.batchNo}.1`,
      items: batch.items.slice(0, middle),
    };
    const right = {
      ...batch,
      batchNo: `${batch.batchNo}.2`,
      items: batch.items.slice(middle),
    };
    const leftResults = await sendAiBatchWithTimeoutRetry(provider, request, left);
    const rightResults = await sendAiBatchWithTimeoutRetry(provider, request, right);
    return [...leftResults, ...rightResults];
  }
}

function isAiTimeoutError(error) {
  return error?.name === "AiRequestTimeoutError";
}

async function testNewAiProvider() {
  const button = elements.testNewAiProvider;
  const rawProvider = buildProviderFromNewProviderForm("provider-test-new");
  if (!rawProvider.name) {
    showStatus("请先填写厂家名称", true);
    elements.aiProviderName.focus();
    return;
  }
  const provider = sanitizeAiSettings({
    providers: [rawProvider],
  }).providers[0];
  await testAiProviderConnection(provider, button);
}

async function testActiveAiProvider() {
  const provider = getProvidersFromForm()
    .map((formProvider) =>
      sanitizeAiSettings({
        providers: [formProvider],
      }).providers[0]
    )
    .find((formProvider) => formProvider?.id === state.aiSettings.activeProviderId);
  await testAiProviderConnection(provider || getActiveAiProvider(), elements.testActiveAiProvider);
}

async function testSavedAiProvider(providerId, button) {
  const provider = getProvidersFromForm()
    .map((formProvider) =>
      sanitizeAiSettings({
        providers: [formProvider],
      }).providers[0]
    )
    .find((formProvider) => formProvider?.id === providerId);
  await testAiProviderConnection(provider, button);
}

async function testAiProviderConnection(provider, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "测试中...";

  try {
    validateAiProviderForRequest(provider);
    const body = buildAiProviderTestBody(provider);
    const response = await sendAiProviderRequest(provider, body);
    const text = extractAiResponseText(provider, response);
    showStatus(`AI 测试成功：${String(text || "已收到响应").slice(0, 80)}`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "AI 测试失败", true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function getProviderWithSecret(providerId) {
  return state.aiSettings.providers.find((provider) => provider.id === providerId) || null;
}

function validateAiProviderForRequest(provider) {
  if (!provider) {
    throw new Error("请先选择一个 AI 厂家");
  }
  if (!provider.baseUrl) {
    throw new Error("请先填写 AI 厂家的接口 URL");
  }
  if (!provider.apiKey) {
    throw new Error("请先填写 AI 厂家的 API Key");
  }
  if (!provider.model) {
    throw new Error("请先填写 AI 厂家的模型名");
  }
}

function buildAiProviderTestBody(provider) {
  const settings = sanitizeAiRequestSettings(provider.requestSettings);
  if (settings.apiMode === "responses") {
    return {
      model: provider.model,
      input: [
        { role: "system", content: "You are a concise API connectivity tester." },
        { role: "user", content: "请只回复 OK，用于测试 API 是否可用。" },
      ],
      temperature: 0,
      max_output_tokens: 16,
      stream: false,
    };
  }

  return {
    model: provider.model,
    messages: [
      { role: "system", content: "You are a concise API connectivity tester." },
      { role: "user", content: "请只回复 OK，用于测试 API 是否可用。" },
    ],
    temperature: 0,
    max_tokens: 16,
    stream: false,
  };
}

function buildAiProviderRequestBody(provider, request, batch) {
  const settings = sanitizeAiRequestSettings(provider.requestSettings);
  const userPayload = {
    taskType: request.taskType,
    promptKey: request.promptKey,
    dataFields: request.dataFields,
    categoryState: request.categoryState,
    categoryPaths: request.categoryPaths,
    responseFormat: request.responseFormat,
    batch,
  };
  const baseBody =
    settings.apiMode === "responses"
      ? {
          model: provider.model,
          input: [
            { role: "system", content: request.prompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          temperature: settings.temperature,
          max_output_tokens: settings.maxTokens,
          stream: settings.stream,
        }
      : {
          model: provider.model,
          messages: [
            { role: "system", content: request.prompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          stream: settings.stream,
        };

  return {
    ...parseJsonConfig(settings.customBody, "自定义 Body 参数"),
    ...baseBody,
    ...getResponseFormatBody(settings, request.taskType),
  };
}

function getResponseFormatBody(settings, taskType) {
  if (settings.responseFormat === "text") {
    return {};
  }
  const schema =
    taskType === "bookmarkIndexing"
      ? getBookmarkIndexingSchema()
      : taskType === "bookmarkTaxonomyDraft"
        ? getBookmarkTaxonomySchema()
        : getBookmarkClassificationSchema();
  if (settings.apiMode === "responses") {
    return {
      text: {
        format:
          settings.responseFormat === "json_schema"
            ? { type: "json_schema", name: schema.name, schema: schema.schema, strict: false }
            : { type: "json_object" },
      },
    };
  }
  return {
    response_format:
      settings.responseFormat === "json_schema"
        ? { type: "json_schema", json_schema: { name: schema.name, strict: false, schema: schema.schema } }
        : { type: "json_object" },
  };
}

async function sendAiProviderRequest(provider, body) {
  const settings = sanitizeAiRequestSettings(provider.requestSettings);
  const url = resolveAiEndpoint(provider.baseUrl, settings.apiMode);
  await ensureAiHostPermission(url);
  const controller = new AbortController();
  const timeoutMs = Math.max(settings.timeoutMs, DEFAULT_AI_REQUEST_SETTINGS.timeoutMs);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
    ...parseJsonConfig(settings.customHeaders, "自定义 Header 参数"),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (settings.stream && response.ok) {
      return parseAiStreamResponse(provider, text);
    }
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(getAiErrorMessage(data, response.status));
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("AI 请求超时，已尝试缩小批次；如果仍失败，请降低每批数量或调大超时时间");
      timeoutError.name = "AiRequestTimeoutError";
      throw timeoutError;
    }
    if (error instanceof SyntaxError) {
      throw new Error("AI 接口返回的不是合法 JSON 响应");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseAiStreamResponse(provider, text) {
  const settings = sanitizeAiRequestSettings(provider.requestSettings);
  const chunks = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const data = JSON.parse(payload);
      const chatDelta = data.choices?.[0]?.delta?.content;
      const responseDelta = data.delta || data.output_text || data.item?.content?.[0]?.text;
      const textDelta = settings.apiMode === "responses" ? responseDelta : chatDelta;
      if (typeof textDelta === "string") {
        chunks.push(textDelta);
      }
    } catch {
      // Ignore malformed stream fragments; final validation happens on accumulated text.
    }
  }
  const content = chunks.join("");
  return settings.apiMode === "responses"
    ? { output_text: content }
    : { choices: [{ message: { content } }] };
}

async function ensureAiHostPermission(url) {
  const originPattern = getOriginPermissionPattern(url);
  if (!originPattern || !chrome.permissions?.contains) {
    return;
  }
  const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
  if (hasPermission) {
    return;
  }
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) {
    throw new Error("未授予该 AI 接口域名的请求权限");
  }
}

function getOriginPermissionPattern(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return "";
  }
}

function resolveAiEndpoint(baseUrl, apiMode) {
  const url = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!url) {
    return "";
  }
  if (/\/(chat\/completions|responses)$/.test(url)) {
    return url;
  }
  return apiMode === "responses" ? `${url}/responses` : `${url}/chat/completions`;
}

function extractAiResponseText(provider, response) {
  const settings = sanitizeAiRequestSettings(provider.requestSettings);
  if (settings.apiMode === "responses") {
    if (typeof response.output_text === "string") {
      return response.output_text;
    }
    const content = response.output?.flatMap((item) => item.content || []) || [];
    return content.map((item) => item.text || "").filter(Boolean).join("\n");
  }
  return response.choices?.[0]?.message?.content || "";
}

function getAiErrorMessage(data, status) {
  return data?.error?.message ? `AI 请求失败（${status}）：${data.error.message}` : `AI 请求失败（${status}）`;
}

function parseJsonConfig(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(`${label}必须是 JSON 对象`);
  }
}

function getBookmarkTaxonomySchema() {
  return {
    name: "bookmark_taxonomy_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["newGroups", "changes", "assignments"],
      properties: {
        newGroups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path"],
            properties: {
              path: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "fromPaths", "to"],
            properties: {
              type: { type: "string" },
              fromPaths: { type: "array", items: { type: "string" } },
              to: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "categories"],
            properties: {
              id: { type: "string" },
              categories: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function getBookmarkClassificationSchema() {
  return {
    name: "bookmark_classification",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["hasNewGroups", "newGroups", "assignments"],
      properties: {
        hasNewGroups: { type: "boolean" },
        newGroups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path"],
            properties: {
              path: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "categories"],
            properties: {
              id: { type: "string" },
              categories: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function getBookmarkIndexingSchema() {
  return {
    name: "bookmark_indexing",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "keywords", "aliases", "summary"],
            properties: {
              id: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              aliases: { type: "array", items: { type: "string" } },
              summary: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function renderBookmarkItem(bookmark) {
  const item = document.createElement("article");
  item.className = "bookmark-item";

  const mark = renderFaviconMark(bookmark, "favicon-mark");

  const main = document.createElement("div");
  main.className = "bookmark-main";
  const title = document.createElement("span");
  title.className = "bookmark-title";
  title.textContent = bookmark.title || bookmark.url;
  const meta = document.createElement("span");
  meta.className = "bookmark-meta";
  meta.textContent = bookmark.domain || bookmark.url;
  const tags = document.createElement("div");
  tags.className = "tag-row";

  const categoryLabels = getCategoryLabelsForBookmark(bookmark);
  if (!categoryLabels.length) {
    tags.append(createTag("默认", true));
  } else {
    for (const label of categoryLabels) {
      tags.append(createTag(label, label === "默认"));
    }
  }

  main.append(title, meta, tags);
  item.append(mark, main);
  return item;
}

function renderFaviconMark(bookmark, className) {
  const mark = document.createElement("span");
  mark.className = className;

  const initial = document.createElement("span");
  initial.className = "site-initial";
  initial.textContent = getInitial(bookmark.domain || bookmark.title);
  mark.append(initial);

  if (
    state.appearanceSettings.showFavicons &&
    bookmark.faviconUrl &&
    state.faviconLoadState.get(bookmark.faviconUrl) !== "failed"
  ) {
    if (state.faviconLoadState.get(bookmark.faviconUrl) === "loaded") {
      mark.classList.add("has-favicon");
    }

    const favicon = document.createElement("img");
    favicon.className = "site-favicon";
    favicon.alt = "";
    favicon.decoding = "async";
    favicon.src = bookmark.faviconUrl;
    favicon.addEventListener("load", () => {
      state.faviconLoadState.set(bookmark.faviconUrl, "loaded");
      mark.classList.add("has-favicon");
    });
    favicon.addEventListener("error", () => {
      state.faviconLoadState.set(bookmark.faviconUrl, "failed");
      favicon.remove();
    });
    mark.append(favicon);
  }

  return mark;
}

async function saveBasicSettings() {
  const popupSettings = sanitizePopupSettings({
    hoverDelayMs: elements.hoverDelayMs.value,
    shellAnimationMs: elements.shellAnimationMs.value,
    columnAnimationMs: elements.columnAnimationMs.value,
  });
  const appearanceSettings = sanitizeAppearanceSettings({
    themeId: elements.themeSelect.value,
    customAccentColor: elements.customAccentEnabled.checked ? elements.customAccentColor.value : "",
    showFavicons: elements.showFavicons.checked,
  });
  const languageSettings = sanitizeLanguageSettings({
    locale: elements.localeSelect.value,
  });
  const syncSettings = sanitizeBookmarkSyncSettings({
    mode: elements.syncMode.value,
    intervalMinutes: elements.syncInterval.value,
  });

  await chromeStorageSet({
    [STORAGE_KEYS.popupSettings]: popupSettings,
    [STORAGE_KEYS.appearanceSettings]: appearanceSettings,
    [STORAGE_KEYS.languageSettings]: languageSettings,
    [STORAGE_KEYS.bookmarkSyncSettings]: syncSettings,
  });

  state.popupSettings = popupSettings;
  state.appearanceSettings = appearanceSettings;
  state.languageSettings = languageSettings;
  state.syncSettings = syncSettings;
  await notifyBackgroundSettingsChanged();
  renderBasicSection();
  applyAppearanceSettings(appearanceSettings);
  showStatus("基础设置已保存");
}

async function runManualSync() {
  const originalText = elements.runManualSync.textContent;
  elements.runManualSync.disabled = true;
  elements.runManualSync.textContent = "同步中...";
  showStatus("正在同步浏览器书签");

  try {
    await sendRuntimeMessage({ type: "syncBookmarks", source: "options-manual" });
    await loadState();
    renderBasicSection();
    renderCategoriesSection();
    renderBookmarksSection();
    showStatus("书签同步完成");
  } catch (error) {
    await loadState();
    renderBasicSection();
    showStatus(error instanceof Error ? error.message : "书签同步失败", true);
  } finally {
    elements.runManualSync.disabled = false;
    elements.runManualSync.textContent = originalText;
  }
}

async function addAiProvider() {
  const provider = buildProviderFromNewProviderForm(`provider-${Date.now()}`);

  if (!provider.name) {
    showStatus("请先填写厂家名称", true);
    elements.aiProviderName.focus();
    return;
  }

  const aiSettings = sanitizeAiSettings({
    ...state.aiSettings,
    activeProviderId: state.aiSettings.activeProviderId || provider.id,
    providers: [...state.aiSettings.providers, provider],
  });

  await chromeStorageSet({ [STORAGE_KEYS.aiSettings]: aiSettings });
  state.aiSettings = aiSettings;
  clearNewProviderForm();
  renderAiSection();
  showStatus("AI 厂家已保存到本地");
}

function buildProviderFromNewProviderForm(id) {
  return {
    id,
    name: elements.aiProviderName.value.trim(),
    order: elements.aiProviderOrder.value,
    providerType: elements.aiProviderType.value,
    baseUrl: elements.aiProviderUrl.value.trim(),
    apiKey: elements.aiProviderKey.value,
    model: elements.aiProviderModel.value.trim(),
    promptTemplates: {
      bookmarkClassification:
        elements.aiProviderClassificationPrompt.value.trim() || DEFAULT_AI_PROMPTS.bookmarkClassification,
      bookmarkIndexing: elements.aiProviderIndexingPrompt.value.trim() || DEFAULT_AI_PROMPTS.bookmarkIndexing,
    },
    requestSettings: getRequestSettingsFromNewProviderForm(),
  };
}

async function saveAiSettings() {
  const providers = getProvidersFromForm();
  const activeProviderId = state.aiSettings.activeProviderId || providers[0]?.id || "";
  const dataFields = normalizeAiAnalysisFields(
    Array.from(elements.analysisFieldList.querySelectorAll("input[data-analysis-field]:checked")).map(
      (input) => input.value
    )
  );
  const aiSettings = sanitizeAiSettings({
    activeProviderId,
    providers,
    dataFields,
    promptTemplates: state.aiSettings.promptTemplates,
    taskSettings: {
      bookmarkClassification: {
        batchSize: elements.classificationBatchSize.value,
      },
      bookmarkIndexing: {
        batchSize: elements.indexingBatchSize.value,
      },
    },
  });

  await chromeStorageSet({ [STORAGE_KEYS.aiSettings]: aiSettings });
  state.aiSettings = aiSettings;
  renderAiSection();
  showStatus("AI 配置已保存");
}

function normalizeAiAnalysisFields(fields) {
  const normalized = unique(fields.map(String));
  if (normalized.includes("url") && normalized.includes("domain")) {
    return normalized.filter((field) => field !== "domain");
  }
  return normalized;
}

async function handleProviderListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  if (button.dataset.action === "test-provider") {
    await testSavedAiProvider(button.dataset.providerId, button);
    return;
  }

  if (button.dataset.action === "set-active-provider") {
    const providers = getProvidersFromForm();
    const aiSettings = sanitizeAiSettings({
      ...state.aiSettings,
      activeProviderId: button.dataset.providerId,
      providers,
    });
    await chromeStorageSet({ [STORAGE_KEYS.aiSettings]: aiSettings });
    state.aiSettings = aiSettings;
    renderAiSection();
    showStatus("当前启用 API 配置已更新");
    return;
  }

  if (button.dataset.action !== "remove-provider") {
    return;
  }

  const providerId = button.dataset.providerId;
  const providers = getProvidersFromForm().filter((provider) => provider.id !== providerId);
  const activeProvider = state.aiSettings.activeProviderId === providerId ? providers[0]?.id || "" : state.aiSettings.activeProviderId;
  const aiSettings = sanitizeAiSettings({
    ...state.aiSettings,
    activeProviderId: activeProvider,
    providers,
  });
  await chromeStorageSet({ [STORAGE_KEYS.aiSettings]: aiSettings });
  state.aiSettings = aiSettings;
  renderAiSection();
  showStatus("AI 厂家已移除");
}

function handleProviderListToggle(event) {
  const current = event.target;
  if (!current.classList?.contains("provider-item") || !current.open) {
    return;
  }

  elements.aiProvidersList.querySelectorAll(".provider-item[open]").forEach((item) => {
    if (item !== current) {
      item.open = false;
    }
  });
}

function previewAppearance() {
  elements.customAccentColor.disabled = !elements.customAccentEnabled.checked;
  const appearanceSettings = sanitizeAppearanceSettings({
    themeId: elements.themeSelect.value,
    customAccentColor: elements.customAccentEnabled.checked ? elements.customAccentColor.value : "",
    showFavicons: elements.showFavicons.checked,
  });
  if (!elements.customAccentEnabled.checked) {
    elements.customAccentColor.value = getPresetAccent(appearanceSettings.themeId);
  }
  applyAppearanceSettings(appearanceSettings);
}

function updateSyncIntervalState() {
  const isBackground = elements.syncMode.value === "background";
  elements.syncInterval.disabled = !isBackground;
  elements.syncModeHint.textContent = `当前为${BOOKMARK_SYNC_MODES[elements.syncMode.value] || BOOKMARK_SYNC_MODES.manual}`;
}

function applyAppearanceSettings(appearanceSettings) {
  const preset = THEME_PRESETS[appearanceSettings.themeId] || THEME_PRESETS[DEFAULT_APPEARANCE_SETTINGS.themeId];
  const root = document.documentElement;
  for (const [name, value] of Object.entries(preset.vars)) {
    root.style.setProperty(name, value);
  }
  if (appearanceSettings.customAccentColor) {
    root.style.setProperty("--accent", appearanceSettings.customAccentColor);
  }
  root.style.setProperty("color-scheme", appearanceSettings.themeId === "dark" ? "dark" : "light");
}

function migrateDefaultCategoryName(tree) {
  if (!tree) return;
  const visit = (node) => {
    if (node.id === "uncategorized" && node.name === "未分类") {
      node.name = "默认";
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  visit(tree);
}

function rebuildCategoryIndexes() {
  const indexes = createCategoryIndexes(state.categoryTree);
  state.categoryById = indexes.categoryById;
  state.parentById = indexes.parentById;
}

function getBookmarkCountForCategory(categoryId) {
  const tree = getWorkingTree();
  const ids = categoryId === "root" ? new Set(state.categoryById.keys()) : getDescendantIds(tree, categoryId);
  const links = getWorkingLinks();
  return state.bookmarks.filter((bookmark) => {
    const linkedIds = links[bookmark.id] || [];
    return linkedIds.some((linkedId) => ids.has(linkedId));
  }).length;
}

function getCategoryLabelsForBookmark(bookmark) {
  const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
  return linkedIds
    .map((categoryId) => getCategoryPathLabel(categoryId))
    .filter(Boolean);
}

function getCategoryPathLabel(categoryId) {
  const path = getPathToCategory(categoryId, state.parentById);
  const ids = path.length ? path : [categoryId];
  return ids
    .map((id) => state.categoryById.get(id)?.name)
    .filter(Boolean)
    .join(" / ");
}

function getDraggedCategoryIds(categoryId) {
  if (!state.batchManageEnabled || !state.selectedCategoryIds.has(categoryId)) {
    return [categoryId];
  }
  const orderedIds = getMovableCategoryIds(getWorkingTree()).filter((id) => state.selectedCategoryIds.has(id));
  return orderedIds.length ? orderedIds : [categoryId];
}

function getTopLevelDraggedCategoryIds(tree, categoryIds) {
  const selected = new Set(categoryIds);
  return getMovableCategoryIds(tree).filter((id) => {
    if (!selected.has(id)) return false;
    let parentId = state.parentById.get(id);
    while (parentId && parentId !== "root") {
      if (selected.has(parentId)) return false;
      parentId = state.parentById.get(parentId);
    }
    return true;
  });
}

function getMovableCategoryIds(tree) {
  const ids = [];
  const visit = (node) => {
    if (isCategoryBatchSelectable(node.id)) {
      ids.push(node.id);
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  for (const child of tree.children || []) {
    visit(child);
  }
  return ids;
}

function isCategoryBatchSelectable(categoryId) {
  return Boolean(categoryId && categoryId !== "root" && categoryId !== "uncategorized");
}

function getSelectedCategoryScopeIds() {
  if (!state.selectedCategoryId) {
    return new Set();
  }
  return state.selectedCategoryId === "root"
    ? new Set(state.categoryById.keys())
    : getDescendantIds(getWorkingTree(), state.selectedCategoryId);
}

function normalizeBookmarkCategoryIds(ids) {
  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds.length ? uniqueIds : ["uncategorized"];
}

function createProviderField(labelText, fieldName, value, type, attributes = {}) {
  const label = document.createElement("label");
  label.className = "field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  input.dataset.providerField = fieldName;
  for (const [name, attributeValue] of Object.entries(attributes)) {
    input.setAttribute(name, attributeValue);
  }
  if (type === "password") {
    input.autocomplete = "new-password";
  }
  label.append(labelSpan, input);
  return label;
}

function createProviderSelect(labelText, fieldName, value, options) {
  const label = document.createElement("label");
  label.className = "field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  const select = document.createElement("select");
  select.dataset.providerField = fieldName;
  for (const [optionValue, optionText] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionText;
    option.selected = optionValue === value;
    select.append(option);
  }
  label.append(labelSpan, select);
  return label;
}

function createProviderCheckbox(labelText, fieldName, checked) {
  const label = document.createElement("label");
  label.className = "check-line";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked === true;
  input.dataset.providerField = fieldName;
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  label.append(input, labelSpan);
  return label;
}

function createProviderTextarea(labelText, fieldName, value, rows = 3) {
  const label = document.createElement("label");
  label.className = "field full-field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.rows = rows;
  textarea.value = value || "";
  textarea.dataset.providerField = fieldName;
  label.append(labelSpan, textarea);
  return label;
}

function getProvidersFromForm() {
  return Array.from(elements.aiProvidersList.querySelectorAll(".provider-item")).map((item) => ({
    id: item.dataset.providerId,
    name: getProviderFieldValue(item, "name"),
    order: getProviderFieldValue(item, "order"),
    providerType: getProviderFieldValue(item, "providerType"),
    baseUrl: getProviderFieldValue(item, "baseUrl"),
    apiKey: getProviderFieldValue(item, "apiKey"),
    model: getProviderFieldValue(item, "model"),
    promptTemplates: {
      bookmarkClassification: getProviderFieldValue(item, "bookmarkClassificationPrompt"),
      bookmarkIndexing: getProviderFieldValue(item, "bookmarkIndexingPrompt"),
    },
    requestSettings: {
      apiMode: getProviderFieldValue(item, "apiMode"),
      responseFormat: getProviderFieldValue(item, "responseFormat"),
      temperature: getProviderFieldValue(item, "temperature"),
      maxTokens: getProviderFieldValue(item, "maxTokens"),
      timeoutMs: getProviderFieldValue(item, "timeoutMs"),
      stream: getProviderFieldChecked(item, "stream"),
      customHeaders: getProviderFieldValue(item, "customHeaders"),
      customBody: getProviderFieldValue(item, "customBody"),
    },
  }));
}

function getProviderFieldValue(item, fieldName) {
  return item.querySelector(`[data-provider-field="${fieldName}"]`)?.value || "";
}

function getProviderFieldChecked(item, fieldName) {
  return item.querySelector(`[data-provider-field="${fieldName}"]`)?.checked === true;
}

function getRequestSettingsFromNewProviderForm() {
  return sanitizeAiRequestSettings({
    apiMode: elements.aiProviderApiMode.value,
    responseFormat: elements.aiProviderResponseFormat.value,
    temperature: elements.aiProviderTemperature.value,
    maxTokens: elements.aiProviderMaxTokens.value,
    timeoutMs: elements.aiProviderTimeoutMs.value,
    stream: elements.aiProviderStream.checked,
    customHeaders: elements.aiProviderHeaders.value,
    customBody: elements.aiProviderBody.value,
  });
}

function applyRequestSettingsToNewProviderForm(settings) {
  const sanitized = sanitizeAiRequestSettings(settings);
  elements.aiProviderType.value = "openai-compatible";
  elements.aiProviderApiMode.value = sanitized.apiMode;
  elements.aiProviderResponseFormat.value = sanitized.responseFormat;
  elements.aiProviderTemperature.value = String(sanitized.temperature);
  elements.aiProviderMaxTokens.value = String(sanitized.maxTokens);
  elements.aiProviderTimeoutMs.value = String(sanitized.timeoutMs);
  elements.aiProviderStream.checked = sanitized.stream;
  elements.aiProviderHeaders.value = sanitized.customHeaders;
  elements.aiProviderBody.value = sanitized.customBody;
}

function clearNewProviderForm() {
  elements.aiProviderName.value = "";
  elements.aiProviderOrder.value = "";
  elements.aiProviderUrl.value = "";
  elements.aiProviderKey.value = "";
  elements.aiProviderModel.value = "";
  applyRequestSettingsToNewProviderForm(DEFAULT_AI_REQUEST_SETTINGS);
  elements.aiProviderClassificationPrompt.value = DEFAULT_AI_PROMPTS.bookmarkClassification;
  elements.aiProviderIndexingPrompt.value = DEFAULT_AI_PROMPTS.bookmarkIndexing;
}

function createTag(text, isMuted = false) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.classList.toggle("is-muted", isMuted);
  tag.textContent = text;
  return tag;
}

function createEmptyNote(text) {
  const note = document.createElement("div");
  note.className = "empty-note";
  note.textContent = text;
  return note;
}

async function notifyBackgroundSettingsChanged() {
  try {
    await sendRuntimeMessage({ type: "syncSettingsChanged" });
  } catch (error) {
    console.warn("后台同步闹钟将在 service worker 下次唤醒时刷新", error);
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "后台任务执行失败"));
        return;
      }
      resolve(response);
    });
  });
}

function chromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function chromeStorageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function chromeStorageClear() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function setExtensionVersion() {
  const manifest = chrome.runtime.getManifest();
  elements.extensionVersion.textContent = `v${manifest.version}`;
}

function getPresetAccent(themeId) {
  return THEME_PRESETS[themeId]?.vars["--accent"] || THEME_PRESETS.forest.vars["--accent"];
}

function getInitial(text) {
  const cleaned = String(text || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "#";
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase();
}

function showStatus(message, isError = false) {
  const existing = document.querySelector(".toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.classList.toggle("is-error", isError);
  toast.textContent = message;
  document.body.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 1500);
}
