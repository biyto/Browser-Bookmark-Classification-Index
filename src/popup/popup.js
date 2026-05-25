const STORAGE_KEYS = {
  categoryTree: "categoryTree",
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
};

const SPECIAL_RECENT_ID = "__recent__";
const MAX_COLUMNS = 3;

const DEFAULT_POPUP_SETTINGS = {
  hoverDelayMs: 360,
  shellAnimationMs: 320,
  columnAnimationMs: 260,
  expandDirection: "right-anchored",
  submenuDirection: "left",
};

const DEFAULT_APPEARANCE_SETTINGS = {
  themeId: "forest",
  customAccentColor: "",
  showFavicons: true,
};

const DEFAULT_BOOKMARK_SYNC_SETTINGS = {
  mode: "manual",
  controller: "popup",
  intervalMinutes: 60,
};

const DEFAULT_BOOKMARK_SYNC_META = {
  lastSyncedAt: 0,
  bookmarkCount: 0,
  source: "browser-bookmarks",
  mode: "manual",
  status: "idle",
  lastError: "",
};

const THEME_SEQUENCE = ["forest", "ocean", "berry", "graphite", "dark"];

const BOOKMARK_SYNC_MODES = {
  manual: "手动同步",
  "popup-open": "打开 popup 时同步",
  background: "后台定时同步",
};

const THEME_PRESETS = {
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

/** @typedef {{id: string, name: string, children?: CategoryNode[]}} CategoryNode */
/** @typedef {{id: string, title: string, url: string, domain: string, folderPath: string[], faviconUrl: string}} BookmarkItem */
/** @typedef {{count: number, lastClickedAt: number}} ClickStat */

/** @type {CategoryNode} */
const DEFAULT_CATEGORY_TREE = {
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

const app = document.querySelector("#app");
const columnsEl = document.querySelector("#columns");
const breadcrumbEl = document.querySelector("#breadcrumb");
const statusEl = document.querySelector("#status");
const searchInput = document.querySelector("#searchInput");
const settingsButton = document.querySelector("#settingsButton");
const themeButton = document.querySelector("#themeButton");
const syncButton = document.querySelector("#syncButton");

/** @type {{categoryTree: CategoryNode, categoryById: Map<string, CategoryNode>, parentById: Map<string, string>, bookmarks: BookmarkItem[], bookmarksById: Map<string, BookmarkItem>, bookmarkCategoryLinks: Record<string, string[]>, clickStats: Record<string, ClickStat>, popupSettings: typeof DEFAULT_POPUP_SETTINGS, appearanceSettings: typeof DEFAULT_APPEARANCE_SETTINGS, syncSettings: typeof DEFAULT_BOOKMARK_SYNC_SETTINGS, syncMeta: typeof DEFAULT_BOOKMARK_SYNC_META, path: string[], focusedColumnId: string, mode: "browse" | "recent" | "search", searchQuery: string, hoverTimer: number | null, toastTimer: number | null, isSyncing: boolean, hasRenderedColumns: boolean, faviconLoadState: Map<string, "loaded" | "failed">}} */
const state = {
  categoryTree: DEFAULT_CATEGORY_TREE,
  categoryById: new Map(),
  parentById: new Map(),
  bookmarks: [],
  bookmarksById: new Map(),
  bookmarkCategoryLinks: {},
  clickStats: {},
  popupSettings: { ...DEFAULT_POPUP_SETTINGS },
  appearanceSettings: { ...DEFAULT_APPEARANCE_SETTINGS },
  syncSettings: { ...DEFAULT_BOOKMARK_SYNC_SETTINGS },
  syncMeta: { ...DEFAULT_BOOKMARK_SYNC_META },
  path: [],
  focusedColumnId: "root",
  mode: "browse",
  searchQuery: "",
  hoverTimer: null,
  toastTimer: null,
  isSyncing: false,
  hasRenderedColumns: false,
  faviconLoadState: new Map(),
};

init();
addStorageListener();

async function init() {
  try {
    showStatus("加载中...");
    bindEvents();
    await loadState();
    render();
    updateSyncStatus();
  } catch (error) {
    console.error(error);
    showStatus(error instanceof Error ? error.message : "加载失败", true);
  }
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    const value = searchInput.value.trim();
    state.searchQuery = value;
    state.mode = value ? "search" : "browse";
    render();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchInput.value = "";
      state.searchQuery = "";
      state.mode = "browse";
      render();
    }
  });

  settingsButton.addEventListener("click", async () => {
    try {
      await chromeOpenOptionsPage();
    } catch (error) {
      console.error(error);
      showToast("后台设置页打开失败");
    }
  });

  syncButton.addEventListener("click", async () => {
    await syncBookmarks();
  });

  themeButton.addEventListener("click", async () => {
    try {
      const nextThemeId = getNextThemeId(state.appearanceSettings.themeId);
      state.appearanceSettings = {
        ...state.appearanceSettings,
        themeId: nextThemeId,
      };
      applyAppearanceSettings();
      await chromeStorageSet({ [STORAGE_KEYS.appearanceSettings]: state.appearanceSettings });
      showToast(`已切换为${THEME_PRESETS[nextThemeId].name}`);
    } catch (error) {
      console.error(error);
      showToast("主题设置保存失败");
    }
  });
}

async function loadState() {
  const stored = await chromeStorageGet([
    STORAGE_KEYS.categoryTree,
    STORAGE_KEYS.bookmarkSnapshot,
    STORAGE_KEYS.bookmarkCategoryLinks,
    STORAGE_KEYS.bookmarkSyncSettings,
    STORAGE_KEYS.bookmarkSyncMeta,
    STORAGE_KEYS.clickStats,
    STORAGE_KEYS.searchSettings,
    STORAGE_KEYS.popupSettings,
    STORAGE_KEYS.appearanceSettings,
  ]);

  state.categoryTree = sanitizeCategoryTree(stored[STORAGE_KEYS.categoryTree]) || cloneTree(DEFAULT_CATEGORY_TREE);
  migrateDefaultCategoryName(state.categoryTree);
  state.popupSettings = sanitizePopupSettings(stored[STORAGE_KEYS.popupSettings]);
  state.appearanceSettings = sanitizeAppearanceSettings(stored[STORAGE_KEYS.appearanceSettings]);
  state.syncSettings = sanitizeBookmarkSyncSettings(stored[STORAGE_KEYS.bookmarkSyncSettings]);
  state.syncMeta = sanitizeBookmarkSyncMeta(stored[STORAGE_KEYS.bookmarkSyncMeta]);
  applyPopupSettings();
  applyAppearanceSettings();
  rebuildCategoryIndexes();
  state.bookmarks = sanitizeBookmarkSnapshot(stored[STORAGE_KEYS.bookmarkSnapshot]);
  state.bookmarksById = new Map(state.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  state.clickStats = sanitizeClickStats(stored[STORAGE_KEYS.clickStats]);
  state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(stored[STORAGE_KEYS.bookmarkCategoryLinks]);

  const nextStorage = {};
  if (state.bookmarks.length) {
    const { links, changed } = reconcileBookmarkLinks(state.bookmarkCategoryLinks);
    state.bookmarkCategoryLinks = links;
    if (changed) {
      nextStorage[STORAGE_KEYS.bookmarkCategoryLinks] = state.bookmarkCategoryLinks;
    }
  }
  if (!stored[STORAGE_KEYS.categoryTree]) {
    nextStorage[STORAGE_KEYS.categoryTree] = state.categoryTree;
  }
  if (!stored[STORAGE_KEYS.searchSettings]) {
    Object.assign(nextStorage, {
      [STORAGE_KEYS.searchSettings]: stored[STORAGE_KEYS.searchSettings] || {
        searchFields: ["title", "url", "domain", "category"],
      },
    });
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
  if (Object.keys(nextStorage).length) {
    await chromeStorageSet(nextStorage);
  }
  updateSyncButton();

  if (state.syncSettings.mode === "popup-open") {
    await syncBookmarks({ silent: true });
  }
}

async function syncBookmarks(options = {}) {
  if (state.isSyncing) {
    return;
  }

  state.isSyncing = true;
  updateSyncButton();
  updateSyncStatus();

  try {
    const bookmarkTree = await chromeGetTree();
    state.bookmarks = flattenBookmarks(bookmarkTree);
    state.bookmarksById = new Map(state.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
    const { links } = reconcileBookmarkLinks(state.bookmarkCategoryLinks);
    state.bookmarkCategoryLinks = links;
    state.syncMeta = {
      lastSyncedAt: Date.now(),
      bookmarkCount: state.bookmarks.length,
      source: "browser-bookmarks",
      mode: state.syncSettings.mode,
      status: "success",
      lastError: "",
    };

    await chromeStorageSet({
      [STORAGE_KEYS.bookmarkSnapshot]: state.bookmarks,
      [STORAGE_KEYS.bookmarkCategoryLinks]: state.bookmarkCategoryLinks,
      [STORAGE_KEYS.bookmarkSyncMeta]: state.syncMeta,
    });

    render();
    if (!options.silent) {
      showToast(`已同步 ${state.bookmarks.length} 个书签`);
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "同步失败";
    state.syncMeta = {
      ...state.syncMeta,
      source: "browser-bookmarks",
      mode: state.syncSettings.mode,
      status: "error",
      lastError: message,
    };
    await chromeStorageSet({ [STORAGE_KEYS.bookmarkSyncMeta]: state.syncMeta });
    showStatus(message, true);
    if (!options.silent) {
      showToast("书签同步失败");
    }
  } finally {
    state.isSyncing = false;
    updateSyncButton();
    updateSyncStatus();
  }
}

function applyPopupSettings() {
  document.documentElement.style.setProperty("--popup-width-duration", `${state.popupSettings.shellAnimationMs}ms`);
  document.documentElement.style.setProperty("--column-reflow-duration", `${state.popupSettings.columnAnimationMs}ms`);
  app.dataset.expandDirection = state.popupSettings.expandDirection;
  app.dataset.submenuDirection = state.popupSettings.submenuDirection;
}

function applyAppearanceSettings() {
  const preset = THEME_PRESETS[state.appearanceSettings.themeId] || THEME_PRESETS[DEFAULT_APPEARANCE_SETTINGS.themeId];
  const root = document.documentElement;
  for (const [name, value] of Object.entries(preset.vars)) {
    root.style.setProperty(name, value);
  }
  if (state.appearanceSettings.customAccentColor) {
    root.style.setProperty("--accent", state.appearanceSettings.customAccentColor);
  }
  root.style.setProperty("color-scheme", state.appearanceSettings.themeId === "dark" ? "dark" : "light");
  themeButton.title = `切换主题色（当前：${preset.name}）`;
  themeButton.setAttribute("aria-label", `切换主题色（当前：${preset.name}）`);
}

function updateSyncButton() {
  const modeName = BOOKMARK_SYNC_MODES[state.syncSettings.mode] || BOOKMARK_SYNC_MODES.manual;
  const title = state.isSyncing ? "正在同步浏览器书签" : `同步浏览器书签（当前：${modeName}）`;
  syncButton.disabled = state.isSyncing;
  syncButton.title = title;
  syncButton.setAttribute("aria-label", title);
  syncButton.classList.toggle("is-syncing", state.isSyncing);
}

function updateSyncStatus() {
  if (state.isSyncing) {
    showStatus("正在同步浏览器书签...");
    return;
  }
  if (!state.syncMeta.lastSyncedAt) {
    showStatus("尚未同步书签，点击同步按钮导入浏览器书签");
    return;
  }
  if (state.syncMeta.status === "error" && state.syncMeta.lastError) {
    showStatus(state.syncMeta.lastError, true);
    return;
  }
  hideStatus();
}

function getNextThemeId(currentThemeId) {
  const currentIndex = THEME_SEQUENCE.indexOf(currentThemeId);
  return THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length] || DEFAULT_APPEARANCE_SETTINGS.themeId;
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
  state.categoryById = new Map();
  state.parentById = new Map();

  const visit = (node, parentId = "") => {
    state.categoryById.set(node.id, node);
    if (parentId) {
      state.parentById.set(node.id, parentId);
    }
    for (const child of node.children || []) {
      visit(child, node.id);
    }
  };

  visit(state.categoryTree);
}

function render() {
  const previousSourceIds = new Set(
    Array.from(columnsEl.querySelectorAll(".column")).map((column) => column.dataset.sourceId)
  );
  columnsEl.textContent = "";

  if (state.mode === "search") {
    renderSearch(previousSourceIds);
    state.hasRenderedColumns = true;
    return;
  }

  renderBreadcrumb();
  const sources = getVisibleColumnSources();
  const visualSources = getVisualColumnSources(sources);
  updateShellLayout(sources.length);

  for (const source of visualSources) {
    const column = renderCategoryColumn(source);
    if (state.hasRenderedColumns && !previousSourceIds.has(source.id)) {
      column.classList.add("is-new-column");
    }
    columnsEl.append(column);
  }
  syncFocusedColumnLayout();
  state.hasRenderedColumns = true;
}

function renderSearch(previousSourceIds = new Set()) {
  updateShellLayout(1, "search");
  state.focusedColumnId = "search";
  renderSearchBreadcrumb();
  const results = getSearchResults(state.searchQuery);
  const column = createColumn("搜索结果", `${results.length} 个`, "search");
  const list = column.querySelector(".column-list");

  if (!results.length) {
    list.append(renderEmptyState("没有匹配结果", "换个标题、域名或分类试试"));
  } else {
    for (const bookmark of results) {
      list.append(renderBookmarkRow(bookmark));
    }
  }

  if (state.hasRenderedColumns && !previousSourceIds.has("search")) {
    column.classList.add("is-new-column");
  }
  columnsEl.append(column);
  syncFocusedColumnLayout();
}

function renderBreadcrumb() {
  breadcrumbEl.textContent = "";
  const rootButton = createCrumb("全部分类", () => {
    state.path = [];
    state.focusedColumnId = "root";
    state.mode = "browse";
    render();
  });
  breadcrumbEl.append(rootButton);

  if (state.mode === "recent") {
    breadcrumbEl.append(createSeparator());
    breadcrumbEl.append(createCrumb("最近常用", () => {
      state.focusedColumnId = SPECIAL_RECENT_ID;
      state.mode = "recent";
      render();
    }));
    return;
  }

  state.path.forEach((categoryId, index) => {
    const category = state.categoryById.get(categoryId);
    if (!category) {
      return;
    }
    breadcrumbEl.append(createSeparator());
    breadcrumbEl.append(createCrumb(category.name, () => {
      state.path = state.path.slice(0, index + 1);
      state.focusedColumnId = category.id;
      state.mode = "browse";
      render();
    }));
  });
}

function renderSearchBreadcrumb() {
  breadcrumbEl.textContent = "";
  breadcrumbEl.append(createCrumb("搜索", () => {
    searchInput.focus();
  }));
  breadcrumbEl.append(createSeparator());
  breadcrumbEl.append(createCrumb(state.searchQuery, () => {
    searchInput.focus();
    searchInput.select();
  }));
}

function createCrumb(label, onClick) {
  const button = document.createElement("button");
  button.className = "crumb-button";
  button.type = "button";
  button.textContent = label;
  button.title = label;
  button.addEventListener("click", onClick);
  return button;
}

function createSeparator() {
  const separator = document.createElement("span");
  separator.className = "crumb-separator";
  separator.textContent = "/";
  return separator;
}

function updateShellLayout(columnCount, mode = state.mode) {
  const safeCount = Math.max(1, Math.min(MAX_COLUMNS, columnCount));
  app.dataset.columnCount = String(safeCount);
  app.dataset.depth = String(state.path.length);
  app.dataset.mode = mode;
  app.dataset.expandDirection = state.popupSettings.expandDirection;
  app.dataset.submenuDirection = state.popupSettings.submenuDirection;
  app.dataset.focusColumn = safeCount === 1 ? "only" : "right";
}

function syncFocusedColumnLayout() {
  const columns = Array.from(columnsEl.querySelectorAll(".column"));
  const focusedIndex = columns.findIndex((column) => column.dataset.sourceId === state.focusedColumnId);
  const safeIndex = focusedIndex >= 0 ? focusedIndex : columns.length - 1;
  const positions = columns.length === 3 ? ["left", "middle", "right"] : ["left", "right"];
  app.dataset.focusColumn = columns.length === 1 ? "only" : positions[safeIndex] || "right";
}

function getVisibleColumnSources() {
  const categoryPath = state.path
    .map((categoryId) => state.categoryById.get(categoryId))
    .filter(Boolean);
  const sources = [state.categoryTree, ...categoryPath];

  if (state.mode === "recent") {
    return [state.categoryTree, { id: SPECIAL_RECENT_ID, name: "最近常用" }];
  }

  return sources.slice(-MAX_COLUMNS);
}

function getVisualColumnSources(sources) {
  if (state.popupSettings.submenuDirection === "left") {
    return [...sources].reverse();
  }
  return sources;
}

function renderCategoryColumn(category) {
  if (category.id === SPECIAL_RECENT_ID) {
    return renderRecentColumn();
  }

  const childCategories = category.children || [];
  const bookmarks = getBookmarksForCategory(category.id);
  const column = createColumn(category.name, `${bookmarks.length} 个`, category.id);
  if (category.id === "root") {
    column.classList.add("root-column");
  }

  const list = column.querySelector(".column-list");

  if (childCategories.length) {
    list.append(renderSectionLabel("分类"));
    for (const child of childCategories) {
      list.append(renderCategoryRow(child, category.id));
    }
  }

  if (bookmarks.length) {
    list.append(renderSectionLabel(category.id === "root" ? "全部书签" : "书签"));
    for (const bookmark of bookmarks) {
      list.append(renderBookmarkRow(bookmark));
    }
  }

  if (!childCategories.length && !bookmarks.length) {
    list.append(renderEmptyState("这里还没有书签", "后续可在后台管理中维护分类"));
  }

  if (category.id === "root") {
    column.append(renderRecentEntry());
  }

  return column;
}

function renderRecentColumn() {
  const bookmarks = getRecentBookmarks();
  const column = createColumn("最近常用", `${bookmarks.length} 个`, SPECIAL_RECENT_ID);
  const list = column.querySelector(".column-list");

  if (!bookmarks.length) {
    list.append(renderEmptyState("暂无记录", "从 popup 打开书签后会出现在这里"));
  } else {
    for (const bookmark of bookmarks) {
      list.append(renderBookmarkRow(bookmark));
    }
  }

  return column;
}

function createColumn(title, countText, sourceId) {
  const column = document.createElement("article");
  column.className = "column";
  column.dataset.sourceId = sourceId;
  column.addEventListener("mouseenter", () => {
    state.focusedColumnId = sourceId;
    syncFocusedColumnLayout();
  });

  const head = document.createElement("header");
  head.className = "column-head";

  const titleEl = document.createElement("div");
  titleEl.className = "column-title";
  titleEl.textContent = title;
  titleEl.title = title;

  const countEl = document.createElement("div");
  countEl.className = "column-count";
  countEl.textContent = countText;

  const list = document.createElement("div");
  list.className = "column-list";

  head.append(titleEl, countEl);
  column.append(head, list);
  return column;
}

function renderSectionLabel(label) {
  const section = document.createElement("div");
  section.className = "section-label";
  section.textContent = label;
  return section;
}

function renderCategoryRow(category, parentId) {
  const button = document.createElement("button");
  button.className = "menu-row";
  button.type = "button";
  button.dataset.categoryId = category.id;
  button.title = category.name;
  if (state.path.includes(category.id)) {
    button.classList.add("is-active");
  }

  const mark = document.createElement("span");
  mark.className = "category-mark";
  mark.textContent = getInitial(category.name);

  const main = document.createElement("span");
  main.className = "row-main";

  const title = document.createElement("span");
  title.className = "row-title";
  title.textContent = category.name;

  const meta = document.createElement("span");
  meta.className = "row-meta";
  meta.textContent = formatCategoryMeta(category);

  const chevron = document.createElement("span");
  chevron.className = "row-chevron";
  chevron.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8.8 5.8a1 1 0 0 1 1.4 0l5.5 5.5a1 1 0 0 1 0 1.4l-5.5 5.5a1 1 0 0 1-1.4-1.4l4.8-4.8-4.8-4.8a1 1 0 0 1 0-1.4Z"/></svg>';

  main.append(title, meta);
  button.append(mark, main, chevron);

  const activate = () => setPathFromCategory(category.id, parentId);
  button.addEventListener("mouseenter", () => scheduleHover(activate));
  button.addEventListener("focus", () => scheduleHover(activate));
  button.addEventListener("mouseleave", clearHoverTimer);
  button.addEventListener("click", () => {
    clearHoverTimer();
    activate();
  });

  return button;
}

function renderBookmarkRow(bookmark) {
  const button = document.createElement("button");
  button.className = "bookmark-row";
  button.type = "button";
  button.title = `${bookmark.title}\n${bookmark.url}`;

  const mark = document.createElement("span");
  mark.className = "site-mark";

  const initial = document.createElement("span");
  initial.className = "site-initial";
  initial.textContent = getInitial(bookmark.domain || bookmark.title);
  mark.append(initial);

  if (state.appearanceSettings.showFavicons && bookmark.faviconUrl) {
    const faviconState = state.faviconLoadState.get(bookmark.faviconUrl);
    if (faviconState === "loaded") {
      mark.classList.add("has-favicon");
    }
  }

  if (
    state.appearanceSettings.showFavicons &&
    bookmark.faviconUrl &&
    state.faviconLoadState.get(bookmark.faviconUrl) !== "failed"
  ) {
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

  const main = document.createElement("span");
  main.className = "row-main";

  const title = document.createElement("span");
  title.className = "bookmark-title";
  title.textContent = bookmark.title || bookmark.domain || bookmark.url;

  const meta = document.createElement("span");
  meta.className = "bookmark-meta";
  meta.textContent = bookmark.domain || bookmark.url;

  main.append(title, meta);
  button.append(mark, main);
  button.addEventListener("click", () => openBookmark(bookmark));
  return button;
}

function renderRecentEntry() {
  const wrap = document.createElement("div");
  wrap.className = "recent-wrap";

  const button = document.createElement("button");
  button.className = "recent-button";
  button.type = "button";
  button.title = "最近常用";
  if (state.mode === "recent") {
    button.classList.add("is-active");
  }

  const mark = document.createElement("span");
  mark.className = "recent-mark";
  mark.textContent = "近";

  const main = document.createElement("span");
  main.className = "row-main";

  const title = document.createElement("span");
  title.className = "row-title";
  title.textContent = "最近常用";

  const meta = document.createElement("span");
  meta.className = "row-meta";
  meta.textContent = `${getRecentBookmarks().length} 个`;

  const chevron = document.createElement("span");
  chevron.className = "row-chevron";
  chevron.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8.8 5.8a1 1 0 0 1 1.4 0l5.5 5.5a1 1 0 0 1 0 1.4l-5.5 5.5a1 1 0 0 1-1.4-1.4l4.8-4.8-4.8-4.8a1 1 0 0 1 0-1.4Z"/></svg>';

  main.append(title, meta);
  button.append(mark, main, chevron);

  const activate = () => {
    state.focusedColumnId = "root";
    state.mode = "recent";
    render();
  };
  button.addEventListener("mouseenter", () => scheduleHover(activate));
  button.addEventListener("focus", () => scheduleHover(activate));
  button.addEventListener("mouseleave", clearHoverTimer);
  button.addEventListener("click", () => {
    clearHoverTimer();
    activate();
  });

  wrap.append(button);
  return wrap;
}

function renderEmptyState(title, copy) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <div>
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M6 4h10.5A2.5 2.5 0 0 1 19 6.5v13a.7.7 0 0 1-1.08.59L12 16.34l-5.92 3.75A.7.7 0 0 1 5 19.5v-14A1.5 1.5 0 0 1 6.5 4Zm.5 2v11.69l5.12-3.25a.7.7 0 0 1 .76 0l5.12 3.25V6.5a.5.5 0 0 0-.5-.5Z"/></svg>
      </div>
      <div class="empty-title"></div>
      <div class="empty-copy"></div>
    </div>
  `;
  empty.querySelector(".empty-title").textContent = title;
  empty.querySelector(".empty-copy").textContent = copy;
  return empty;
}

function scheduleHover(callback) {
  clearHoverTimer();
  state.hoverTimer = window.setTimeout(() => {
    state.hoverTimer = null;
    callback();
  }, state.popupSettings.hoverDelayMs);
}

function clearHoverTimer() {
  if (state.hoverTimer) {
    window.clearTimeout(state.hoverTimer);
    state.hoverTimer = null;
  }
}

function setPathFromCategory(categoryId, parentId) {
  const parentPath = getPathToCategory(parentId).filter((id) => id !== "root");
  const nextPath = [...parentPath, categoryId];
  if (state.mode === "browse" && arraysEqual(state.path, nextPath)) {
    state.focusedColumnId = parentId || "root";
    syncFocusedColumnLayout();
    return;
  }
  state.path = nextPath;
  state.focusedColumnId = parentId || "root";
  state.mode = "browse";
  render();
}

function getPathToCategory(categoryId) {
  if (!categoryId || categoryId === "root") {
    return [];
  }
  const path = [];
  let currentId = categoryId;
  while (currentId && currentId !== "root") {
    path.unshift(currentId);
    currentId = state.parentById.get(currentId);
  }
  return path;
}

function getBookmarksForCategory(categoryId) {
  const ids = categoryId === "root" ? new Set(state.categoryById.keys()) : getDescendantIds(categoryId);
  const bookmarks = state.bookmarks.filter((bookmark) => {
    const linkedIds = state.bookmarkCategoryLinks[bookmark.id] || [];
    return linkedIds.some((linkedId) => ids.has(linkedId));
  });
  return sortBookmarks(bookmarks);
}

function getDescendantIds(categoryId) {
  const ids = new Set();
  const visit = (node) => {
    ids.add(node.id);
    for (const child of node.children || []) {
      visit(child);
    }
  };

  const category = state.categoryById.get(categoryId);
  if (category) {
    visit(category);
  }
  return ids;
}

function getRecentBookmarks() {
  return state.bookmarks
    .filter((bookmark) => Boolean(state.clickStats[bookmark.id]))
    .sort((a, b) => compareStats(a.id, b.id))
    .slice(0, 24);
}

function getSearchResults(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  return state.bookmarks
    .map((bookmark) => ({ bookmark, score: getSearchScore(bookmark, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || compareStats(a.bookmark.id, b.bookmark.id) || a.bookmark.title.localeCompare(b.bookmark.title, "zh-CN"))
    .slice(0, 80)
    .map((item) => item.bookmark);
}

function getSearchScore(bookmark, query) {
  const title = normalizeText(bookmark.title);
  const url = normalizeText(bookmark.url);
  const domain = normalizeText(bookmark.domain);
  const categoryText = normalizeText(getCategoryNamesForBookmark(bookmark.id).join(" "));
  let score = 0;

  if (title.startsWith(query)) score += 80;
  if (title.includes(query)) score += 50;
  if (domain.includes(query)) score += 36;
  if (url.includes(query)) score += 24;
  if (categoryText.includes(query)) score += 28;

  const stat = state.clickStats[bookmark.id];
  if (stat) {
    score += Math.min(stat.count, 20);
    score += getRecencyBoost(stat.lastClickedAt);
  }

  return score;
}

function getCategoryNamesForBookmark(bookmarkId) {
  const linkedIds = state.bookmarkCategoryLinks[bookmarkId] || [];
  const names = new Set();

  for (const categoryId of linkedIds) {
    const path = getPathToCategory(categoryId);
    for (const pathId of path) {
      const category = state.categoryById.get(pathId);
      if (category) {
        names.add(category.name);
      }
    }
  }

  return Array.from(names);
}

function sortBookmarks(bookmarks) {
  return [...bookmarks].sort((a, b) => {
    const statResult = compareStats(a.id, b.id);
    if (statResult !== 0) {
      return statResult;
    }
    return (a.title || a.domain).localeCompare(b.title || b.domain, "zh-CN");
  });
}

function compareStats(aId, bId) {
  const a = state.clickStats[aId];
  const b = state.clickStats[bId];
  const aCount = a?.count || 0;
  const bCount = b?.count || 0;
  if (aCount !== bCount) {
    return bCount - aCount;
  }
  return (b?.lastClickedAt || 0) - (a?.lastClickedAt || 0);
}

function getRecencyBoost(lastClickedAt) {
  const elapsed = Date.now() - lastClickedAt;
  const day = 24 * 60 * 60 * 1000;
  if (elapsed < day) return 16;
  if (elapsed < day * 7) return 10;
  if (elapsed < day * 30) return 4;
  return 0;
}

async function openBookmark(bookmark) {
  const currentStat = state.clickStats[bookmark.id] || { count: 0, lastClickedAt: 0 };
  state.clickStats[bookmark.id] = {
    count: currentStat.count + 1,
    lastClickedAt: Date.now(),
  };
  await chromeStorageSet({ [STORAGE_KEYS.clickStats]: state.clickStats });
  await chromeCreateTab(bookmark.url);
  window.close();
}

function reconcileBookmarkLinks(storedLinks) {
  const validCategoryIds = new Set(state.categoryById.keys());
  const bookmarkIds = new Set(state.bookmarks.map((bookmark) => bookmark.id));
  const input = storedLinks && typeof storedLinks === "object" ? storedLinks : {};
  /** @type {Record<string, string[]>} */
  const links = {};
  let changed = !storedLinks;

  for (const bookmark of state.bookmarks) {
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

function flattenBookmarks(nodes) {
  /** @type {BookmarkItem[]} */
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

  for (const node of nodes) {
    visit(node, []);
  }

  return bookmarks;
}

function formatCategoryMeta(category) {
  const childCount = category.children?.length || 0;
  const bookmarkCount = getBookmarksForCategory(category.id).length;
  if (childCount && bookmarkCount) {
    return `${childCount} 类 / ${bookmarkCount} 个`;
  }
  if (childCount) {
    return `${childCount} 类`;
  }
  return `${bookmarkCount} 个`;
}

function sanitizeCategoryTree(value) {
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

function sanitizeClickStats(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, stat]) => stat && typeof stat === "object")
      .map(([bookmarkId, stat]) => [
        bookmarkId,
        {
          count: Number(stat.count) || 0,
          lastClickedAt: Number(stat.lastClickedAt) || 0,
        },
      ])
  );
}

function sanitizeBookmarkSnapshot(value) {
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

function sanitizeBookmarkCategoryLinks(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const validCategoryIds = new Set(state.categoryById.keys());
  const entries = Object.entries(value)
    .filter(([, categoryIds]) => Array.isArray(categoryIds))
    .map(([bookmarkId, categoryIds]) => [
      String(bookmarkId),
      unique(categoryIds.map(String).filter((id) => validCategoryIds.has(id) && id !== "root")),
    ])
    .filter(([, categoryIds]) => categoryIds.length);

  return Object.fromEntries(entries);
}

function sanitizeBookmarkSyncSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const mode = Object.prototype.hasOwnProperty.call(BOOKMARK_SYNC_MODES, input.mode)
    ? input.mode
    : DEFAULT_BOOKMARK_SYNC_SETTINGS.mode;
  const controller = mode === "background" ? "background" : DEFAULT_BOOKMARK_SYNC_SETTINGS.controller;
  const intervalMinutes = clampNumber(input.intervalMinutes, 15, 1440, DEFAULT_BOOKMARK_SYNC_SETTINGS.intervalMinutes);
  return { mode, controller, intervalMinutes };
}

function sanitizeBookmarkSyncMeta(value) {
  const input = value && typeof value === "object" ? value : {};
  const mode = Object.prototype.hasOwnProperty.call(BOOKMARK_SYNC_MODES, input.mode)
    ? input.mode
    : DEFAULT_BOOKMARK_SYNC_META.mode;
  const status = ["idle", "syncing", "success", "error"].includes(input.status)
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

function sanitizePopupSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    hoverDelayMs: clampNumber(input.hoverDelayMs, 120, 1200, DEFAULT_POPUP_SETTINGS.hoverDelayMs),
    shellAnimationMs: clampNumber(input.shellAnimationMs, 120, 900, DEFAULT_POPUP_SETTINGS.shellAnimationMs),
    columnAnimationMs: clampNumber(input.columnAnimationMs, 120, 900, DEFAULT_POPUP_SETTINGS.columnAnimationMs),
    expandDirection: input.expandDirection === "left-anchored" ? "left-anchored" : DEFAULT_POPUP_SETTINGS.expandDirection,
    submenuDirection: input.submenuDirection === "right" ? "right" : DEFAULT_POPUP_SETTINGS.submenuDirection,
  };
}

function sanitizeAppearanceSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const themeId = THEME_PRESETS[input.themeId] ? input.themeId : DEFAULT_APPEARANCE_SETTINGS.themeId;
  return {
    themeId,
    customAccentColor: typeof input.customAccentColor === "string" ? input.customAccentColor : "",
    showFavicons: typeof input.showFavicons === "boolean" ? input.showFavicons : DEFAULT_APPEARANCE_SETTINGS.showFavicons,
  };
}

function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getFaviconUrl(pageUrl) {
  try {
    const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
    faviconUrl.searchParams.set("pageUrl", pageUrl);
    faviconUrl.searchParams.set("size", "32");
    return faviconUrl.toString();
  } catch {
    return "";
  }
}

function getInitial(text) {
  const cleaned = String(text || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "#";
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase();
}

function unique(items) {
  return Array.from(new Set(items));
}

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => item === b[index]);
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.add("is-visible");
  statusEl.classList.toggle("is-error", isError);
}

function hideStatus() {
  statusEl.classList.remove("is-visible", "is-error");
  statusEl.textContent = "";
}

function addStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[STORAGE_KEYS.appearanceSettings]) {
      const newValue = changes[STORAGE_KEYS.appearanceSettings].newValue;
      if (newValue && typeof newValue === "object") {
        state.appearanceSettings = sanitizeAppearanceSettings(newValue);
        applyAppearanceSettings();
      }
    }
    if (changes[STORAGE_KEYS.popupSettings]) {
      const newValue = changes[STORAGE_KEYS.popupSettings].newValue;
      if (newValue && typeof newValue === "object") {
        state.popupSettings = sanitizePopupSettings(newValue);
        applyPopupSettings();
      }
    }
    if (changes[STORAGE_KEYS.categoryTree]) {
      const newValue = changes[STORAGE_KEYS.categoryTree].newValue;
      if (newValue && typeof newValue === "object") {
        state.categoryTree = sanitizeCategoryTree(newValue) || cloneTree(DEFAULT_CATEGORY_TREE);
        rebuildCategoryIndexes();
        render();
      }
    }
    if (changes[STORAGE_KEYS.bookmarkCategoryLinks]) {
      const newValue = changes[STORAGE_KEYS.bookmarkCategoryLinks].newValue;
      if (newValue && typeof newValue === "object") {
        state.bookmarkCategoryLinks = sanitizeBookmarkCategoryLinks(newValue);
        render();
      }
    }
  });
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) {
    existing.remove();
  }
  if (state.toastTimer) {
    window.clearTimeout(state.toastTimer);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);

  state.toastTimer = window.setTimeout(() => {
    toast.remove();
    state.toastTimer = null;
  }, 1800);
}

function chromeGetTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tree || []);
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

function chromeCreateTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function chromeOpenOptionsPage() {
  return new Promise((resolve, reject) => {
    chrome.runtime.openOptionsPage(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}
