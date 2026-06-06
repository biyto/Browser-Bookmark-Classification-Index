/**
 * options-categories.js
 * Category tree, category bookmark panel, drag/drop, and local category link editing.
 */

import {
  STORAGE_KEYS,
  buildCategoryNamesList,
  cloneValue,
  createCategoryIndexes,
  elements,
  getBookmarkCountForCategory,
  getDescendantIds,
  getWorkingLinks,
  getWorkingTree,
  normalizeBookmarkCategoryIds,
  renderFaviconMark,
  sanitizeBookmarkCategoryLinks,
  sanitizeCategoryTree,
  state,
  chromeStorageSet,
  createEmptyNote,
  showStatus,
} from "./options-common.js";
import { renderOptionSection } from "./options-render.js";

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

  renderOptionSection("aiClassificationEntry");
  renderOptionSection("aiClassificationPreview");
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
export {
  renderCategoriesSection,
  saveCategoryPanelState,
  applyExpandLevel,
  getWorkingTree,
  getWorkingLinks,
  hasPendingCategoryChanges,
  hasPendingBookmarkChanges,
  rebuildWorkingIndexes,
  updatePendingHints,
  confirmCategoryChanges,
  discardCategoryChanges,
  confirmBookmarkChanges,
  discardBookmarkChanges,
  addCategory,
  handleTreeViewClick,
  handleTreeViewChange,
  handleTreeDragStart,
  handleTreeDragOver,
  handleTreeDrop,
  handleTreeDragEnd,
  handleBookmarkPanelChange,
  handleBookmarkPanelClick,
  handleBookmarkPanelDragStart,
  handleBookmarkPanelDragEnd,
};
