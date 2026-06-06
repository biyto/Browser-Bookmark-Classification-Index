import {
  collectElements,
  loadState,
  renderBasicSection,
  renderBookmarksSection,
  renderThemeOptions,
  setExtensionVersion,
  showStatus,
} from "./options-common.js";
import { renderCategoriesSection } from "./options-categories.js";
import { bindEvents } from "./options-events.js";
import {
  renderAiClassificationEntry,
  renderAiClassificationPreview,
  renderAiSection,
  renderAnalysisFieldOptions,
} from "./options-ai.js";
import { renderRulesSection } from "./options-rules.js";
import { registerOptionsRenderers } from "./options-render.js";

registerOptionsRenderers({
  all: renderAll,
  basic: renderBasicSection,
  bookmarks: renderBookmarksSection,
  categories: renderCategoriesSection,
  rules: renderRulesSection,
  ai: renderAiSection,
  aiClassificationEntry: renderAiClassificationEntry,
  aiClassificationPreview: renderAiClassificationPreview,
});

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

function renderAll() {
  renderBasicSection();
  renderCategoriesSection();
  renderBookmarksSection();
  renderRulesSection();
  renderAiSection();
}
