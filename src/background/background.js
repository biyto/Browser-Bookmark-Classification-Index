import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_BOOKMARK_SYNC_META,
  DEFAULT_BOOKMARK_SYNC_SETTINGS,
  DEFAULT_CATEGORY_TREE,
  DEFAULT_CLASSIFICATION_RULES,
  DEFAULT_LANGUAGE_SETTINGS,
  DEFAULT_POPUP_SETTINGS,
  STORAGE_KEYS,
  cloneValue,
  flattenBookmarks,
  reconcileBookmarkLinks,
  sanitizeAiSettings,
  sanitizeAppearanceSettings,
  sanitizeBookmarkCategoryLinks,
  sanitizeBookmarkSyncMeta,
  sanitizeBookmarkSyncSettings,
  sanitizeCategoryTree,
  sanitizeClassificationRules,
  sanitizeLanguageSettings,
  sanitizePopupSettings,
} from "../shared/storage.js";

const BOOKMARK_SYNC_ALARM = "bookmark-sync";

chrome.runtime.onInstalled.addListener(() => {
  initializeBackground().catch(reportBackgroundError);
});

chrome.runtime.onStartup.addListener(() => {
  initializeBackground().catch(reportBackgroundError);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEYS.bookmarkSyncSettings]) {
    return;
  }

  const settings = sanitizeBookmarkSyncSettings(changes[STORAGE_KEYS.bookmarkSyncSettings].newValue);
  configureBookmarkSyncAlarm(settings).catch(reportBackgroundError);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== BOOKMARK_SYNC_ALARM) {
    return;
  }

  syncBookmarks("background-alarm").catch(reportBackgroundError);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "syncBookmarks") {
    syncBookmarks(message.source || "options-manual")
      .then((meta) => sendResponse({ ok: true, meta }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.type === "syncSettingsChanged") {
    refreshBookmarkSyncAlarm()
      .then((alarm) => sendResponse({ ok: true, alarm }))
      .catch((error) => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  return false;
});

async function initializeBackground() {
  const stored = await chromeStorageGet([
    STORAGE_KEYS.categoryTree,
    STORAGE_KEYS.popupSettings,
    STORAGE_KEYS.appearanceSettings,
    STORAGE_KEYS.bookmarkSyncSettings,
    STORAGE_KEYS.bookmarkSyncMeta,
    STORAGE_KEYS.languageSettings,
    STORAGE_KEYS.aiSettings,
    STORAGE_KEYS.classificationRules,
  ]);
  const nextStorage = {};

  if (!sanitizeCategoryTree(stored[STORAGE_KEYS.categoryTree])) {
    nextStorage[STORAGE_KEYS.categoryTree] = cloneValue(DEFAULT_CATEGORY_TREE);
  }
  if (!stored[STORAGE_KEYS.popupSettings]) {
    nextStorage[STORAGE_KEYS.popupSettings] = sanitizePopupSettings(DEFAULT_POPUP_SETTINGS);
  }
  if (!stored[STORAGE_KEYS.appearanceSettings]) {
    nextStorage[STORAGE_KEYS.appearanceSettings] = sanitizeAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);
  }
  if (!stored[STORAGE_KEYS.bookmarkSyncSettings]) {
    nextStorage[STORAGE_KEYS.bookmarkSyncSettings] = sanitizeBookmarkSyncSettings(DEFAULT_BOOKMARK_SYNC_SETTINGS);
  }
  if (!stored[STORAGE_KEYS.bookmarkSyncMeta]) {
    nextStorage[STORAGE_KEYS.bookmarkSyncMeta] = sanitizeBookmarkSyncMeta(DEFAULT_BOOKMARK_SYNC_META);
  }
  if (!stored[STORAGE_KEYS.languageSettings]) {
    nextStorage[STORAGE_KEYS.languageSettings] = sanitizeLanguageSettings(DEFAULT_LANGUAGE_SETTINGS);
  }
  if (!stored[STORAGE_KEYS.aiSettings]) {
    nextStorage[STORAGE_KEYS.aiSettings] = sanitizeAiSettings(DEFAULT_AI_SETTINGS);
  }
  if (!stored[STORAGE_KEYS.classificationRules]) {
    nextStorage[STORAGE_KEYS.classificationRules] = sanitizeClassificationRules(DEFAULT_CLASSIFICATION_RULES);
  }

  if (Object.keys(nextStorage).length) {
    await chromeStorageSet(nextStorage);
  }

  const settings = sanitizeBookmarkSyncSettings(
    nextStorage[STORAGE_KEYS.bookmarkSyncSettings] || stored[STORAGE_KEYS.bookmarkSyncSettings]
  );
  await configureBookmarkSyncAlarm(settings);
}

async function refreshBookmarkSyncAlarm() {
  const stored = await chromeStorageGet([STORAGE_KEYS.bookmarkSyncSettings]);
  const settings = sanitizeBookmarkSyncSettings(stored[STORAGE_KEYS.bookmarkSyncSettings]);
  return configureBookmarkSyncAlarm(settings);
}

async function configureBookmarkSyncAlarm(settings) {
  await chrome.alarms.clear(BOOKMARK_SYNC_ALARM);

  if (settings.mode !== "background") {
    return { enabled: false, intervalMinutes: settings.intervalMinutes };
  }

  await chrome.alarms.create(BOOKMARK_SYNC_ALARM, {
    delayInMinutes: settings.intervalMinutes,
    periodInMinutes: settings.intervalMinutes,
  });

  return { enabled: true, intervalMinutes: settings.intervalMinutes };
}

async function syncBookmarks(source) {
  const stored = await chromeStorageGet([
    STORAGE_KEYS.categoryTree,
    STORAGE_KEYS.bookmarkCategoryLinks,
    STORAGE_KEYS.bookmarkSyncSettings,
    STORAGE_KEYS.bookmarkSyncMeta,
  ]);
  const settings = sanitizeBookmarkSyncSettings(stored[STORAGE_KEYS.bookmarkSyncSettings]);
  const previousMeta = sanitizeBookmarkSyncMeta(stored[STORAGE_KEYS.bookmarkSyncMeta]);

  await chromeStorageSet({
    [STORAGE_KEYS.bookmarkSyncMeta]: {
      ...previousMeta,
      source,
      mode: settings.mode,
      status: "syncing",
      lastError: "",
    },
  });

  try {
    const categoryTree = sanitizeCategoryTree(stored[STORAGE_KEYS.categoryTree]) || cloneValue(DEFAULT_CATEGORY_TREE);
    const bookmarkTree = await chromeGetBookmarkTree();
    const bookmarks = flattenBookmarks(bookmarkTree);
    const storedLinks = sanitizeBookmarkCategoryLinks(stored[STORAGE_KEYS.bookmarkCategoryLinks], categoryTree);
    const { links } = reconcileBookmarkLinks(storedLinks, bookmarks, categoryTree);
    const meta = {
      lastSyncedAt: Date.now(),
      bookmarkCount: bookmarks.length,
      source,
      mode: settings.mode,
      status: "success",
      lastError: "",
    };

    await chromeStorageSet({
      [STORAGE_KEYS.bookmarkSnapshot]: bookmarks,
      [STORAGE_KEYS.bookmarkCategoryLinks]: links,
      [STORAGE_KEYS.bookmarkSyncMeta]: meta,
    });

    return meta;
  } catch (error) {
    const meta = {
      ...previousMeta,
      source,
      mode: settings.mode,
      status: "error",
      lastError: getErrorMessage(error),
    };
    await chromeStorageSet({ [STORAGE_KEYS.bookmarkSyncMeta]: meta });
    throw error;
  }
}

function chromeGetBookmarkTree() {
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

function reportBackgroundError(error) {
  console.error("[Bookmark Launcher Background]", error);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "未知错误";
}
