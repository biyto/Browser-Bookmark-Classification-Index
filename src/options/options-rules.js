/**
 * options-rules.js
 * Rule center rendering, rule form state, preview matching, and local rule application.
 */

import {
  DEFAULT_CLASSIFICATION_RULES,
  MAX_BOOKMARK_ROWS,
  STORAGE_KEYS,
  cloneValue,
  createEmptyNote,
  elements,
  getCategoryLabelsForBookmark,
  getCategoryPathLabel,
  getDescendantIds,
  normalizeBookmarkCategoryIds,
  normalizeText,
  renderFaviconMark,
  sanitizeBookmarkCategoryLinks,
  sanitizeClassificationRules,
  state,
  chromeStorageSet,
  showStatus,
} from "./options-common.js";
import { renderOptionSection } from "./options-render.js";

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

function renderRulesSection() {
  renderRuleFormVisibility();
  renderRuleFormOptions();
  renderRulePreview();
  renderOptionSection("aiClassificationEntry");
  renderOptionSection("aiClassificationPreview");
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
  renderOptionSection("bookmarks");
  renderOptionSection("categories");
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
export {
  renderRulesSection,
  toggleRuleForm,
  startRuleGroupForm,
  saveRuleFromForm,
  resetRuleForm,
  handleRulesListClick,
  previewAllRules,
  applyAllRules,
  handleRulePreviewChange,
};
