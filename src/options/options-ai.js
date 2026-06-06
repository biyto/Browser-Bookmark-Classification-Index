/**
 * options-ai.js
 * AI provider settings, AI task requests, taxonomy draft preview, and classification application.
 */

import {
  ANALYSIS_FIELD_OPTIONS,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_REQUEST_SETTINGS,
  DEFAULT_AI_TASK_SETTINGS,
  MAX_BOOKMARK_ROWS,
  STORAGE_KEYS,
  buildCategoryNamesList,
  chunkItems,
  clampNumber,
  cloneValue,
  createEmptyNote,
  createTag,
  elements,
  ensureCategoryPath,
  getCategoryLabelsForBookmark,
  normalizeCategoryPathText,
  normalizeBookmarkCategoryIds,
  parseJsonConfig,
  sanitizeAiRequestSettings,
  sanitizeAiSettings,
  sanitizeBookmarkCategoryLinks,
  sanitizeCategoryTree,
  state,
  unique,
  chromeStorageSet,
  showStatus,
  rebuildCategoryIndexes,
} from "./options-common.js";
import { renderOptionSection } from "./options-render.js";

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
  renderOptionSection("rules");
  renderOptionSection("bookmarks");
  renderOptionSection("categories");
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
  renderOptionSection("rules");
  clearAiClassificationStatus();
  showStatus("已放弃本次 AI 结果，未修改本地分类");
}

function clearAiClassificationCache() {
  state.pendingAiClassificationTask = null;
  state.pendingAiClassificationPreview = null;
  state.pendingAiTaxonomyDraft = null;
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
    renderOptionSection("rules");
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
    renderOptionSection("rules");
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
    renderOptionSection("rules");
    setAiClassificationStatus(
      "书签归类结果已生成",
      "请检查预览并应用勾选结果。本次归类结果来自前一阶段已缓存的 AI 分析结果。",
      { isDone: true }
    );
    showStatus("分类体系已确认，已根据缓存结果生成书签归类预览");
  } catch (error) {
    renderOptionSection("rules");
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
export {
  renderAnalysisFieldOptions,
  renderAiClassificationEntry,
  renderAiClassificationPreview,
  renderAiSection,
  setAiClassificationStatus,
  clearAiClassificationStatus,
  runAiClassification,
  handleAiClassificationPreviewChange,
  setAiClassificationSelection,
  applyAiClassificationPreview,
  discardAiClassificationPreview,
  addAiProvider,
  testNewAiProvider,
  testActiveAiProvider,
  saveAiSettings,
  handleProviderListClick,
  handleProviderListToggle,
  getBookmarkClassificationTaskSettings,
  getBookmarkIndexingTaskSettings,
  getActiveAiProvider,
};
