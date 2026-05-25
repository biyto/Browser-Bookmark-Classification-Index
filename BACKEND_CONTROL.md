# 后台管理开发说明

> 需要了解项目整体状态时，先读取 `PROJECT_STATUS.md`。
> 后续开发后台管理页、后台同步、规则中心、AI 配置时，以本文档为主要上下文。
> `POPUP_INTERACTION.md` 只用于 popup 交互细节，不作为后台管理页的设计依据。

## 文档边界

- `PRODUCT_REQUIREMENTS.md`：产品总原则、隐私边界和 popup 核心体验。
- `POPUP_INTERACTION.md`：只描述 popup 三列级联、面包屑、最近常用、顶部操作。
- `BACKEND_CONTROL.md`：后台管理页、options page、service worker、同步、规则、AI 配置和后台开发注意事项。
- `AI自动分类提示词与接口约定.md`：记录书签 AI 自动分类与书签索引任务的任务键、提示词模板、批量设置、OpenAI 兼容请求结构和响应结构；不同任务不要复用提示词。
- `后台管理页当前版本修改意见.md`：记录当前后台管理页 UI 和功能修改意见，后续改后台前优先查看。

## 当前实现进度

- Manifest 已注册 `options_ui`，后台管理页入口为 `src/options/options.html`，打开方式为新标签页。
- Manifest 已注册 MV3 module service worker：`src/background/background.js`。
- 当前新增权限：`alarms`，用于后台定时同步；AI 请求使用 `optional_host_permissions`，在用户测试或执行 AI 请求时按接口域名请求授权。
- popup 设置按钮已改为调用 `chrome.runtime.openOptionsPage()` 打开后台管理页。
- 后台管理页第一版包含 7 个一级层级：基础设置、同步管理、分类管理、书签归类、规则中心、AI 配置、关于。
- 共享存储字段、默认值和清洗逻辑集中在 `src/shared/storage.js`。

## 已实现能力

### 基础设置

- 外观设置：主题色、是否显示 favicon、自定义强调色。
- Popup 交互设置：悬停展开延迟、popup 宽度动画、列宽变化动画、展开方向。
- 语言设置：已新增 `languageSettings`，当前只保留 `zh-CN`。
- 数据与隐私、备份恢复：当前只做说明占位。

### 同步管理

- 支持手动同步、打开 popup 时同步、后台定时同步。
- 后台定时同步使用 `chrome.alarms`，默认间隔 60 分钟，可配置范围 15-1440 分钟。
- 后台同步只读取浏览器书签树，写入本地 `bookmarkSnapshot` 和 `bookmarkCategoryLinks`。
- 同步不移动、不删除、不重命名浏览器原始书签。
- `bookmarkSyncMeta` 已记录最近同步时间、数量、来源、方式、状态和最近错误。

### 分类管理、书签归类、规则中心

- 分类管理当前展示本地分类树和分类汇总书签数，已支持新增、重命名、删除、拖拽排序、展开层级控制和右侧分类书签栏。
- 左侧分类树已接入批量管理初版，勾选多个分类后可作为一组拖动调整位置。
- 右侧分类书签栏已使用同步快照中的 favicon 数据；书签可通过统一拖拽模式、悬停三点菜单或批量管理调整本地分类关联，移除操作 hover 时直接显示，修改需确认后写入。
- 分类管理已提供分类数据导入/导出：导出只包含插件本地分类树和书签分类标记；导入支持覆盖、保留原有分类和仅新增无冲突数据三种策略。
- 分类管理页包含“AI 处理未分类书签”任务卡，展示当前厂家、每批数量、发送字段、本地分组状态和待处理未分类书签数量；AI 流程先预览分类体系草案，用户确认后再预览书签归类结果，长任务期间必须显示当前阶段和批次进度状态。
- “批量管理”和“显示分类下书签”属于本地分类树操作，入口放在“本地分类树”面板标题栏，不放在分类管理顶部。
- 书签归类当前展示书签快照、未分类筛选、搜索和本地分类关联。
- 规则中心已重构为规则组：`classificationRules` 当前为 `version: 3`，包含归类规则组和移出分类规则组。
- 归类规则组用于把默认/无分类书签归入指定分类；移出分类规则组用于把已分类书签从指定分类范围移出，若无剩余分类则归入默认分类。
- 规则支持多匹配字段、单一匹配方式、多目标分类；匹配方式不再多选，避免包含、完全等于、前缀和正则之间出现语义覆盖。
- 目标分类通过真实分类树动态生成层级筛选，仅显示实际存在的层级，并支持三级、四级、五级等后续深度；分类选项优先显示当前分类名，父路径作为辅助信息。
- 规则组必须先预览再应用；预览结果可逐条勾选，应用只更新 `bookmarkCategoryLinks`，不修改浏览器原始书签。
- 卸载前清理入口位于关于页，会提醒先导出分类数据，再清空插件本地 storage/cache；该流程不得操作浏览器原始书签。

### AI 配置

- 已支持 OpenAI 兼容格式厂家配置，厂家类型当前仅保留 `openai-compatible`。
- 支持配置厂家名称、排序权重、接口 URL、API Key、模型名、Chat Completions / Responses 接口类型、JSON Schema / JSON Object / Text 响应格式、temperature、max tokens、超时、流式开关、自定义 Header 和自定义 Body。
- API Key 只保存在 `chrome.storage.local`，界面使用密码框遮罩，不应输出到日志、状态提示或任务预览。
- `新增厂家` 和 `已配置厂家` 默认折叠；已配置厂家先按三列展示厂家摘要，点击单个厂家后才展开详细配置，展开一个厂家时自动收拢其它厂家。
- 当前启用厂家通过 `aiSettings.activeProviderId` 保存；已配置厂家中有当前启用提示和“设为当前启用”按钮，也支持一键测试当前启用配置。
- 支持测试新建厂家、单个已配置厂家和当前启用厂家。测试发送一条简短消息验证 API 可用性，不需要保存新建厂家。
- 默认分析内容为网页名和完整网址。分析字段按“必要信息 / 补充上下文 / 精简网址”分组；完整网址已包含域名，若用户同时选择完整网址和仅网站域名，保存时保留完整网址并自动去掉仅网站域名，避免重复发送。
- AI 提示词模板按任务键区分，并随厂家保存到 `provider.promptTemplates`。当前仅两套：`bookmarkClassification` 用于书签自动分类，`bookmarkIndexing` 用于后续书签索引/模糊搜索；不要新增厂家通用提示词，也不要混用两套任务提示词。
- 书签自动分类每批发送数量由用户在 AI 配置页设置，存储于 `aiSettings.taskSettings.bookmarkClassification.batchSize`，默认 10；书签索引每批数量存储于 `aiSettings.taskSettings.bookmarkIndexing.batchSize`。分类管理入口不得硬编码批量数量。
- 书签自动分类采用单轮分批 AI 分析：每批同时返回分类体系草案和本批书签的临时归类缓存。用户确认体系后，本地按 `changes` / `pathAliases` 修正缓存路径并生成归类预览，不再第二次发送书签给 AI。
- 书签归类保持多标签模型，`assignments[].categories` 可以包含多个分类路径；应用时写入 `bookmarkCategoryLinks[bookmarkId]` 的多个分类 ID，不修改浏览器原始书签数据。
- 多标签提示词需要要求 AI 主动判断内容主题、使用目的、工具属性、平台/资源类型等维度；只要命中两个互不包含维度，应返回 2-3 个分类路径，避免模型默认只选一个最像的分类。
- AI 自动分类的优先级是先多归类、后新增分类：能用多个已生效分组或候选分组组合表达时，不应为了更精确的单一分类创建新分组。
- 真实 AI 请求统一从 `dispatchAiTaskRequest` 接入，页面按钮不得绕过统一任务分发；若某批请求超时，应自动拆小该批次重试，避免书签数量较多时整次任务直接失败。
- 本地只信任当前任务生成的 `B0001` 等临时编号，不接受真实书签 ID 作为 AI 回填标记。

## 存储字段

- `popupSettings`：悬停延迟、popup 宽度动画、列宽动画、展开方向。
- `appearanceSettings`：主题色、自定义强调色、是否显示 favicon。
- `bookmarkSyncSettings`：同步方式、同步控制器、后台同步间隔。
- `bookmarkSyncMeta`：最近同步时间、同步书签数、同步来源、同步方式、状态、最近错误。
- `languageSettings`：语言接口，当前仅 `zh-CN`。
- `aiSettings`：AI 厂家列表、当前启用厂家、默认分析字段、按厂家区分的任务提示词模板、OpenAI 兼容请求参数和任务参数；书签自动分类任务键为 `bookmarkClassification`，书签索引任务键为 `bookmarkIndexing`。
- `classificationRules`：分类匹配规则组容器，当前为 `version: 3`，顶层为 `groups`；规则组包含 `id`、`name`、`type`、`order` 和 `rules`，规则项包含 `fields`、`type`、`pattern`、`categoryIds` 和 `note`；清洗逻辑会兼容旧版 `rules`、`field`、`types` 数据并迁移为归类规则组。
- `categoryTree`：插件本地分类树。
- `bookmarkSnapshot`：浏览器书签本地快照。
- `bookmarkCategoryLinks`：书签到本地分类的多关联关系。
- `clickStats`：插件内点击统计。
- 分类导入/导出不新增独立存储字段，导出文件包含 `categoryTree`、`bookmarkCategoryLinks` 和派生的 `categoryNamesList`。

## 后续开发注意事项

- 后台管理页不要从 popup 前端代码复制业务逻辑；共享逻辑优先放到 `src/shared/storage.js` 或后续共享模块。
- popup 只消费本地设置和本地数据，不负责分类规则匹配、批量整理或 AI 分析。
- 规则批量应用只能更新插件本地分类关联，不能修改浏览器原始收藏夹。
- 当前规则中心已改为规则组和预览确认流；后续继续扩展时应优先保持“先预览、可勾选、再应用”的轻量任务流。
- 分类删除、移动、重命名在第一阶段只影响本地分类树；不能操作浏览器原始书签目录。
- AI 真实调用必须由用户显式触发；默认不发送网页正文、摘要或浏览器历史。
- AI 自动分类入口应统一调用 `runAiClassification` -> `buildBookmarkClassificationTask` -> `dispatchAiTaskRequest`；不要在规则中心或分类管理局部直接写请求。
- AI 自动分类和书签索引提示词及接口约定以 `AI自动分类提示词与接口约定.md` 为准。后续新增 AI 规则建议等能力时，必须新增独立提示词键，避免复用 `bookmarkClassification` 或 `bookmarkIndexing`。
- 不申请 `history` 权限；新增权限前必须先确认真实必要性并更新本文档。
- 直接打开 `src/options/options.html` 只能检查静态布局；真实 storage、bookmarks、alarms 行为必须在 Chrome / Edge 扩展管理页重新加载插件后测试。
- 调试 service worker 时，需要在扩展管理页查看背景页控制台和 `chrome.alarms` 行为。

## 下一步后台任务

- 根据 `后台管理页当前版本修改意见.md` 修正后台页面 UI 和文案问题。
- 在 Chrome / Edge 中实测 options page、service worker、手动同步、打开 popup 同步、后台定时同步。
- 继续实测规则中心规则组体验，重点检查大量书签下的预览性能和勾选应用流程。
- 继续完善分类管理：优化右侧书签展示排版、操作图标和批量管理。
- 继续评估书签归类是否并入分类管理；若保留，则补齐未分类处理和本地关联维护。
- 实现备份恢复：导出/导入本地分类树、关联、规则、设置和 AI 配置。
- 完善 AI 自动分类结果预览、用户逐条确认、创建缺失分类和最终应用流程。
