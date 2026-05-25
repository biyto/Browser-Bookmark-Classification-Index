# AGENTS.md

## 项目方向

本项目是一个同时适用于 Microsoft Edge 和 Google Chrome 的浏览器插件，当前主要面向中文用户。

产品核心是 popup 书签分类启动器


## 开发要求

- 需要了解当前项目进度时，先读取 `PROJECT_STATUS.md`。
- `PRODUCT_REQUIREMENTS.md`：产品需求。
- `POPUP_INTERACTION.md`：popup 交互细节。
- `BACKEND_CONTROL.md`：后台管理开发说明。开发 options page、后台同步、规则中心、AI 配置时优先读取此文件。
- `后台管理页当前版本修改意见.md`：后台管理页当前版本的修改意见记录。
- 后续开发后台管理时，不要把 `POPUP_INTERACTION.md` 当作主要上下文；只有改 popup 交互时再读取。

## 隐私与权限

- 权限保持最小化。
- 当前基础权限为 `bookmarks`、`storage`、`favicon`、`alarms`。
- 第一版为展示浏览器 favicon，已额外使用 `favicon` 权限。
- 后台定时同步使用 `alarms` 权限。
- 第一阶段不申请 `history`。
- 默认不把书签数据、网页正文或网页摘要发送给外部 API。
- 不硬编码任何 API Key 或密钥。
