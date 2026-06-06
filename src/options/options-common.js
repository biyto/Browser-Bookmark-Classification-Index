/**
 * options-common.js
 * Shared state, DOM lookup, base settings, bookmark snapshot rendering, backup/import, and browser API helpers.
 */

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
import { renderOptionSection } from "./options-render.js";

const MAX_BOOKMARK_ROWS = 120;

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
  renderOptionSection("categories");
  renderBookmarksSection();
  renderOptionSection("rules");
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
  renderOptionSection("all");
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
    renderOptionSection("categories");
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

function getWorkingTree() {
  return state.pendingCategoryTree || state.categoryTree;
}

function getWorkingLinks() {
  return state.pendingBookmarkLinks || state.bookmarkCategoryLinks;
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

function normalizeBookmarkCategoryIds(ids) {
  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds.length ? uniqueIds : ["uncategorized"];
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

function normalizeCategoryPathText(value) {
  return String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
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
export {
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
  MAX_BOOKMARK_ROWS,
  state,
  elements,
  collectElements,
  loadState,
  showSection,
  renderThemeOptions,
  renderBasicSection,
  renderBookmarksSection,
  buildCategoryBackupPayload,
  exportCategoryData,
  importCategoryDataFromFile,
  normalizeCategoryImportPayload,
  applyCategoryImport,
  buildOverwriteCategoryImport,
  buildMergedCategoryImport,
  mergeMissingCategoryNodes,
  hasPendingLocalCategoryChanges,
  clearExtensionLocalData,
  clearExtensionCaches,
  readTextFile,
  downloadTextFile,
  ensureCategoryPath,
  createUniqueCategoryId,
  chunkItems,
  renderBookmarkItem,
  renderFaviconMark,
  saveBasicSettings,
  runManualSync,
  previewAppearance,
  updateSyncIntervalState,
  applyAppearanceSettings,
  migrateDefaultCategoryName,
  rebuildCategoryIndexes,
  getWorkingTree,
  getWorkingLinks,
  getBookmarkCountForCategory,
  getCategoryLabelsForBookmark,
  getCategoryPathLabel,
  normalizeBookmarkCategoryIds,
  createTag,
  createEmptyNote,
  notifyBackgroundSettingsChanged,
  sendRuntimeMessage,
  chromeStorageGet,
  chromeStorageSet,
  chromeStorageClear,
  setExtensionVersion,
  getPresetAccent,
  getInitial,
  normalizeText,
  normalizeCategoryPathText,
  showStatus,
  parseJsonConfig,
};
