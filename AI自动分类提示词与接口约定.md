# AI 自动分类提示词与接口约定

更新时间：2026-05-25

本文档描述当前已接入的 OpenAI 兼容 AI 任务约定。当前包含“书签 AI 自动分类”和“书签索引建立”两类任务。后续如果新增 AI 规则建议、摘要分析或其它能力，必须新增独立任务键和提示词模板，不要复用已有任务提示词。

## 任务标识

- 书签自动分类任务类型：`bookmarkClassification`
- 书签自动分类提示词键：`bookmarkClassification`
- 书签自动分类提示词存储位置：`aiSettings.providers[].promptTemplates.bookmarkClassification`
- 书签自动分类每批数量存储位置：`aiSettings.taskSettings.bookmarkClassification.batchSize`
- 书签索引建立任务类型：`bookmarkIndexing`
- 书签索引建立提示词键：`bookmarkIndexing`
- 书签索引建立提示词存储位置：`aiSettings.providers[].promptTemplates.bookmarkIndexing`
- 书签索引建立每批数量存储位置：`aiSettings.taskSettings.bookmarkIndexing.batchSize`
- 默认分析字段存储位置：`aiSettings.dataFields`

每个厂家只保留两套任务提示词：`bookmarkClassification` 和 `bookmarkIndexing`。不要新增厂家通用提示词，也不要把分类提示词用于索引任务。

## 厂家与请求配置

- 厂家类型当前仅保留 `openai-compatible`。
- 每个厂家可配置接口 URL、API Key、模型名、Chat Completions / Responses 接口类型、JSON Schema / JSON Object / Text 响应格式、temperature、max tokens、请求超时、流式开关、自定义 Header 和自定义 Body；默认请求超时为 90 秒。
- API Key 只用于真实请求，不应写入日志、预览列表、状态提示或任务请求展示。
- 真实请求统一由 `dispatchAiTaskRequest` 发起；局部按钮只能构造测试或任务请求，不应绕过统一分发。
- AI 请求使用 `optional_host_permissions`，在用户测试或执行任务时按接口域名请求授权。

## 入口约定

- 分类管理页的“AI 处理未分类书签”入口应调用统一任务接口；界面面向中文用户，不展示内部任务键。
- 当前链路为：`runAiClassification` -> 分类体系草案与归类缓存请求 -> 用户确认体系 -> 本地整理缓存归类结果 -> 预览应用。
- `dispatchAiTaskRequest` 是真实外部请求的统一接入口；不要在按钮事件、规则中心或分类管理局部直接写 AI `fetch`。
- 每批发送多少条由用户在 AI 配置页决定，默认 10。分类管理入口不要硬编码批量数量。
- 如果某批真实请求超时，应自动拆小该批次重试；只有拆到单条仍超时时，才把超时错误提示给用户。

## 数据边界

发送给 AI 的书签字段只能来自用户勾选的 `aiSettings.dataFields`：

- `title`：网页名
- `url`：完整网址，已包含网站域名和路径
- `domain`：仅网站域名；与完整网址同时选择时，本地保存应优先保留完整网址并去掉该字段，避免重复发送
- `folderPath`：浏览器收藏夹路径
- `categories`：已有本地分类

默认不发送网页正文、网页摘要或浏览器历史，也不申请 `history` 权限。

本地需要为每个待处理书签生成一次性编号，例如 `B0001`、`B0002`。发送给 AI 的内容只包含编号，不包含真实书签 ID。编号到真实书签 ID 的映射只保存在本地任务状态里，用于收到结果后回填预览和最终应用；本地只接受当前任务映射表内的临时编号，AI 返回真实书签 ID 或未知编号时必须忽略。

## 分类路径约定

发送给 AI 的已有分类应使用末端分类路径，而不是只发末端名称。路径分隔符使用 `/`。

示例：

```text
开发/Chrome 扩展
开发/前端
设计/素材
游戏/电脑游戏
```

AI 应先进入分类体系草案阶段，判断已有分类路径是否为空或明显不足：

- 如果已有分类路径可用，优先使用已有分类路径。
- 如果没有已有分类路径，或现有分类明显无法覆盖本批书签，应先建议候选分组。
- 已生效分组不可被改名、合并或移动；候选分组可以被合并、改名或上提父级。
- 一级分类必须宽泛，禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。
- 新分类路径最多 3 层，名称应符合中文用户的一般认知，不要为单个网站创建过细分类。
- 当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 `学习/课程/英语`、`娱乐/音乐/乐评`、`工具/开发/接口调试`；不要为了凑层级而硬拆。
- 用户确认分类体系后，本地只会从确认后的分类路径中整理缓存归类结果，不得再新增分组。

## 请求结构

真实调用前，本地先组装分类体系草案请求。草案阶段只整理分类路径，不返回书签归类：

```json
{
  "taskType": "bookmarkTaxonomyDraft",
  "promptKey": "bookmarkClassification",
  "prompt": "提示词正文",
  "provider": {
    "id": "provider-xxx",
    "name": "OpenAI",
    "baseUrl": "https://api.example.com/v1",
    "model": "model-name"
  },
  "dataFields": ["title", "url", "domain"],
  "categoryState": {
    "appliedCategoryPaths": ["开发/Chrome 扩展"],
    "candidateCategoryPaths": ["个人学习/学校网址"],
    "pathAliases": {},
    "taxonomyPolicy": "已生效分组稳定优先；候选分组可以合并、改名或上提。"
  },
  "categoryPaths": ["开发/Chrome 扩展", "设计/素材"],
  "batches": [
    {
      "batchNo": 1,
      "items": [
        {
          "id": "B0001",
          "title": "Chrome Extensions documentation",
          "url": "https://developer.chrome.com/docs/extensions",
          "domain": "developer.chrome.com"
        }
      ]
    }
  ],
  "responseFormat": {
    "type": "json-object",
    "shape": "{ newGroups: Array<{ path: string, reason?: string }>, changes: Array<{ type: string, fromPaths: string[], to: string, reason?: string }>, assignments: Array<{ id: string, categories: string[], confidence?: number, reason?: string }> }"
  }
}
```

API Key 只从本地 AI 厂家配置读取并用于真实请求，不应写入日志、预览列表或任务请求展示。

用户确认分类体系草案后，本地不再发起第二次书签归类请求；归类预览直接来自第一轮响应中缓存的 `assignments`，并会先按 `changes` / `pathAliases` 修正分类路径。

## OpenAI 兼容请求

Chat Completions 请求使用 `messages`，Responses 请求使用 `input`。结构化输出按厂家配置选择：

- Chat Completions：`response_format.type` 为 `json_schema`、`json_object` 或不传。
- Responses：`text.format.type` 为 `json_schema`、`json_object` 或不传。
- `bookmarkClassification` 使用分类响应 JSON Schema。
- `bookmarkIndexing` 使用索引响应 JSON Schema。
- 自定义 Body 参数会合并到最终请求体；自定义 Header 参数会合并到请求头。

## 响应结构

分类体系草案阶段，AI 必须只返回合法 JSON 对象，不要返回 Markdown、解释段落或代码块。顶层固定包含 `newGroups`、`changes` 和 `assignments`。

```json
{
  "newGroups": [
    {
      "path": "学习/学校网址",
      "reason": "本批书签包含学校相关入口，适合作为学习下的二级分组。"
    }
  ],
  "changes": [
    {
      "type": "upLevel",
      "fromPaths": ["个人学习/学校网址"],
      "to": "学习/学校网址",
      "reason": "个人学习作为一级过细，学习更适合作为宽泛一级分类。"
    }
  ]
}
```

`assignments` 是本批书签的临时归类缓存，每个书签可以返回多个分类路径：

```json
{
  "assignments": [
    {
      "id": "B0001",
      "categories": ["开发/Chrome 扩展"]
    }
  ]
}
```

本地只信任草案阶段的 `newGroups[].path`、`changes[].fromPaths`、`changes[].to`、`assignments[].id` 和 `assignments[].categories`。`confidence`、`reason` 只能作为预览辅助信息。收到草案后必须先让用户确认分类体系；应用最终结果时先创建确认后的缺失分类路径，再更新 `bookmarkCategoryLinks`。

## 书签索引响应结构

书签索引建立任务只用于后续本地模糊搜索，不用于分类。AI 必须只返回合法 JSON 对象，顶层固定包含 `items`。

```json
{
  "items": [
    {
      "id": "B0001",
      "keywords": ["chrome 扩展", "manifest v3", "浏览器插件"],
      "aliases": ["Chrome Extensions", "MV3"],
      "summary": "Chrome 扩展开发文档入口"
    }
  ]
}
```

索引任务不得返回分类路径，不得返回 `hasNewGroups`、`newGroups` 或 `assignments`。

## 当前默认提示词

```text
你是中文书签分类助手。系统会按批发送书签，你需要在同一次响应中同时整理分类体系草案，并返回本批书签的临时归类建议。

已生效本地分组稳定优先，必须优先沿用，不要改名、合并或移动；候选分组可以通过 changes 合并、改名或上提父级。

一级分类必须宽泛，例如学习、教育、工作、生活、娱乐、工具、资讯、购物、创作等粒度。禁止把个人学习、学校网址、某个网站名或单一用途直接作为一级分类。

如果多个候选分组能被更宽泛的分组囊括，请用 changes 返回合并、改名或上提记录。新分类路径最多 3 层，路径层级使用 / 分隔。

当一级和二级仍不足以表达清楚用途时，应使用第三级，例如 学习/课程/英语、娱乐/音乐/乐评、工具/开发/接口调试；不要为了凑层级而硬拆。

响应必须只返回 JSON 对象，顶层包含 newGroups、changes、assignments。assignments 是本批书签的临时归类缓存，后续本地会按 changes 自动修正路径，不会再次请求 AI 归类。

每个 assignment 使用当前任务的临时 id，并返回 categories 数组。若一个书签同时适合多个彼此独立的分类场景，应返回 2-3 个分类路径；不要为了省事只给单一分类。

分类优先级必须是：优先使用多个已生效分组或候选分组组合归类，其次才考虑新增候选分组。

不要为了让某个书签看起来有更精确的单一分类而创建新分类；如果多个现有分类标签组合后已经能表达它，就直接使用这些分类标签。

只有当已生效分组和候选分组的多标签组合仍然无法覆盖一批书签的共同用途时，才允许在 newGroups 中提出新分组。

多标签判断要主动执行：先分别判断书签的内容主题、使用目的、工具属性、所属平台/资源类型，只要命中两个互不包含的维度，就必须给多个分类路径。

不要因为某一个分类已经足够描述书签就停止判断；例如开发文档同时属于 学习/技术 和 工具/开发，音乐软件同时属于 娱乐/音乐 和 工具/创作，设计素材站同时属于 创作/设计 和 资源/素材。

只有当其它候选分类与主分类明显是父子包含关系或语义重复时，才返回 1 个分类路径；否则优先保留多个独立标签。

categories 必须使用已生效分组、候选分组或本次 newGroups / changes 后的新路径。每个书签最多返回 3 个分类路径，路径层级使用 / 分隔。

不要返回 Markdown、解释段落或额外说明。
```

后续如果调整这段默认提示词，应同步更新 `src/shared/storage.js` 中的 `DEFAULT_AI_PROMPTS.bookmarkClassification`。

## 当前默认索引提示词

```text
你是书签索引建立助手。请根据输入的书签编号和字段，为每个书签生成用于本地模糊搜索的简短索引数据。
索引只用于搜索，不用于分类。不要返回分类路径，不要引用分类任务的响应结构。
必须只返回 JSON 对象，顶层包含 items。items 每项包含 id、keywords、aliases、summary。
```

后续如果调整这段默认提示词，应同步更新 `src/shared/storage.js` 中的 `DEFAULT_AI_PROMPTS.bookmarkIndexing`。

## 2026-05-25 当前归类流程补充

- 当前链路已调整为：`runAiClassification` -> 分类体系草案与本批书签临时归类缓存请求 -> 用户确认分类体系 -> 本地按 `changes` / `pathAliases` 修正缓存归类结果 -> 预览应用。
- 分类体系草案请求必须同时返回 `newGroups`、`changes`、`assignments`。`assignments` 不再等到第二次 AI 请求才生成，而是在第一轮分批分析时缓存下来。
- 用户确认分类体系后，本地不再重新发送书签给 AI；只从缓存的 `assignments` 中读取当前任务临时编号，例如 `B0001`，未知编号或真实书签 ID 必须忽略。
- 如果候选分组被合并、改名或上提父级，本地会把缓存归类结果中的旧路径映射到最终路径后再生成预览，避免多批次产生重复分组。
- `assignments[].categories` 是数组，一个书签可以同时写入多个分类标签。提示词应明确要求：先主动判断内容主题、使用目的、工具属性、平台/资源类型等维度；命中两个互不包含维度时，返回 2-3 个分类路径，不要把多标签能力退化成单分类。
- AI 应优先把书签归入多个已生效分组或候选分组；只有多标签组合仍无法覆盖一批书签的共同用途时，才允许提出 `newGroups`，避免优先创建新分类。
