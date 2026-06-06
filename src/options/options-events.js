/**
 * options-events.js
 * Event binding for the options page. Handlers live in their feature modules.
 */

import {
  elements,
  state,
  clearExtensionLocalData,
  exportCategoryData,
  importCategoryDataFromFile,
  previewAppearance,
  runManualSync,
  saveBasicSettings,
  showSection,
  updateSyncIntervalState,
} from "./options-common.js";
import {
  addCategory,
  applyExpandLevel,
  confirmBookmarkChanges,
  confirmCategoryChanges,
  discardBookmarkChanges,
  discardCategoryChanges,
  handleBookmarkPanelChange,
  handleBookmarkPanelClick,
  handleBookmarkPanelDragEnd,
  handleBookmarkPanelDragStart,
  handleTreeDragEnd,
  handleTreeDragOver,
  handleTreeDragStart,
  handleTreeDrop,
  handleTreeViewChange,
  handleTreeViewClick,
  renderCategoriesSection,
  saveCategoryPanelState,
} from "./options-categories.js";
import {
  applyAllRules,
  handleRulePreviewChange,
  handleRulesListClick,
  previewAllRules,
  resetRuleForm,
  saveRuleFromForm,
  startRuleGroupForm,
  toggleRuleForm,
} from "./options-rules.js";
import {
  addAiProvider,
  applyAiClassificationPreview,
  discardAiClassificationPreview,
  handleAiClassificationPreviewChange,
  handleProviderListClick,
  handleProviderListToggle,
  runAiClassification,
  saveAiSettings,
  setAiClassificationSelection,
  testActiveAiProvider,
  testNewAiProvider,
} from "./options-ai.js";
import { renderOptionSection } from "./options-render.js";

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

  elements.bookmarkFilter.addEventListener("change", () => renderOptionSection("bookmarks"));
  elements.bookmarkSearch.addEventListener("input", () => renderOptionSection("bookmarks"));

  elements.saveRule.addEventListener("click", saveRuleFromForm);
  elements.resetRuleForm.addEventListener("click", resetRuleForm);
  elements.toggleRuleForm.addEventListener("click", toggleRuleForm);
  elements.newClassifyRuleGroup.addEventListener("click", () => startRuleGroupForm("classify"));
  elements.newRemoveRuleGroup.addEventListener("click", () => startRuleGroupForm("remove"));
  elements.ruleCategoryLevel.addEventListener("change", () => renderOptionSection("rules"));
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
    elements.showBookmarkPanel.disabled = true;
    state.showBookmarkPanel = elements.showBookmarkPanel.checked;
    state.selectedCategoryId = null;
    state.selectedBookmarkIds.clear();
    await saveCategoryPanelState();
    renderCategoriesSection();
    elements.showBookmarkPanel.disabled = false;
  });
  elements.batchManageEnabled.addEventListener("change", async () => {
    elements.batchManageEnabled.disabled = true;
    state.batchManageEnabled = elements.batchManageEnabled.checked;
    state.selectedCategoryIds.clear();
    state.selectedBookmarkIds.clear();
    await saveCategoryPanelState();
    renderCategoriesSection();
    elements.batchManageEnabled.disabled = false;
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

export { bindEvents };
