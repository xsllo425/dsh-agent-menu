# 更新日志

本文件记录每个发布版本的可观察变化。版本号遵循语义化版本：菜单项增删、原生插槽行为变化属于次版本，纯修复与文档属于补丁版本。

## 0.8.0 — 2026-10-28

移除等待状态短句功能，插件只做右键菜单。

### 移除

- 状态行随机文案：不再改写 DSH「运行中」那一行的文字。右键菜单插件不该兼管状态行，状态行归 dsh-work-status。
- 内置词库 `lib/status-phrases.json`（原样取自 dsh-status-rotator 0.35.0，含其他项目的推广句和 GitHub 用户名）、宿主路由 `/agent-menu/status-phrases`、覆盖文件 `~/.dsh/agent-menu/status-phrases.json` 的读取，以及对应的 8 项测试。
- `NOTICE` 不再有第三方声明：插件现在不含任何第三方代码、文案或素材。

### 兼容

- 从旧版热重载到 0.8.0 时，会拆掉旧版留在状态行上的文案节点，恢复宿主原文。
- 测试 43 → 35 项，全部通过。

## 0.7.1 — 2026-10-28

发布工程对齐 dsh-work-status 的标准，插件行为与 0.7.0 一致。

### 修复

- 宿主半帧版本号与客户端、清单不一致：`lib/index.js` 的 `version` 与 `HOST_VERSION` 仍停在 0.6.0，导致 `/agent-menu/status` 与路由响应报错版本。现统一为清单版本，并由清单自检锁死三者相等。
- `package.json` 的 `dshLocal.files` 仍指向 0.6.0 时期的 `tests/scope.mjs`，现改为当前六个测试文件。

### 新增

- `CHANGELOG.md`、`NOTICE`、`icon.svg`：插件页现在能读到图标；通知文件写明等待短语词库派生自 `dsh-status-rotator 0.35.0`（MIT）。
- `scripts/check-manifest.mjs`：安装前自检。检查清单字段、导出映射可解析、`files[]` 全部存在、patch 行、双语元数据、图标格式与体积、客户端注册 id 与模块加载器用法、宿主侧导出，并强制 README 的测试数、安装命令和 CHANGELOG 版本头跟代码一致。
- `.github/workflows/ci.yml`：Node 24，Ubuntu + Windows 双平台，三关（语法、测试、清单自检）。
- `docs/RELEASE.md`：本仓库的发版清单。
- `package.json` 补齐 `author` / `repository` / `homepage` / `bugs` / `publishConfig` / `engines.dsh` / `scripts.check` / `scripts.test` / `scripts.verify`，`exports` 增加 `./icon`。
- 六个测试从手写计数器迁移到 `node --test`：`tests/*.test.mjs`，共 43 项，无一失败；原先靠辅助函数间接声明的用例改为显式 `test(...)`，使 README 的条数可由清单自检核对。

### 已知限制

- 未完成真实 DSH 页面的浏览器验收：本机 `dsh web` 需要访问令牌，通用浏览器打开只得到 `dsh web authentication required`。离线桩测试通过不等于界面已验收。
- 未发布到 npm；`package.json` 已备好 `publishConfig`，发版流程见 `docs/RELEASE.md`。

## 0.7.0 — 2026-10-28

菜单精简与侧栏原生动作。

### 变化

- 删除全部 AI 类菜单项与相关死代码：不再引用到输入框、不发送消息、不应用提示词模板。
- 对话区选中文字只剩「复制」，命中链接或文件时再追加对应操作；代码块（未选中）只保留「复制代码」。
- 文件菜单收敛为复制路径 / 打开文件位置 / 用默认应用打开，移除相对路径、文件名与 `file:` URL 等冗余复制项。
- 视觉统一为宿主主题色：卡片圆角 12px、菜单项圆角 6px、弱分隔线、轻阴影、无图标。
- 侧栏补真实动作：会话行通过官方 `sidebar.workspaces.session.menu.item` 插槽注册「复制目录」「打开位置」；工作区行原生菜单追加「新建会话」「复制目录」「打开位置」。路径一律来自官方快照，不猜。
- 明确不提供会话删除：DSH 没有公开的会话删除接口，归档不等于删除。

### 修复

- `lib/client.js` 文件场景在路径为空时仍会生成菜单项，导致出现没有目标的文件操作；现在要求路径非空。
- `workspaceBase()` 引用了已删除的 `currentSessionId()`，改用 `sessions.list.getSnapshot().current`。

## 0.6.0 — 2026-10-19

- 建立 git 基线，记录 0.6.0 的现状与改版方向（见 `docs/HANDOFF.md`）。
