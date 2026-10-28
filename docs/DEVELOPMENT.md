# 开发与排查记录（dsh-agent-menu）

本文记录当前实现及仍然有效的历史约束。用户说明见 [README.zh.md](../README.zh.md)。

## 组成

| 文件 | 说明 |
| --- | --- |
| `lib/client.js` | 右键分类、纯 DOM 菜单、输入框操作、原生侧栏扩展、等待短语。侧栏 React 组件使用 DSH Module Loader 提供的 `react` 与 `@deepseek-ai/dsh-client-ui-primitives`。 |
| `lib/index.js` | 宿主 `/agent-menu` 路由：系统剪贴板、图像复制/另存、打开位置、默认应用打开、状态短语、诊断。 |
| `lib/status-phrases.json` | 等待短语词库；本轮没有改动。 |
| `cordis.patch.yml` | 宿主 bundle 注册。 |

## 右键判定与共存

- 侧栏分支必须在 `classify()` 前。右键找到原生行按钮后，调用 `preventDefault()`、`stopImmediatePropagation()` 和 `stopPropagation()`，再 `click()`。这样可阻止 dsh-session-deck 的项目图标选择器抢占原生菜单。
- 其他目标先同步 `buildItems(context)`，只有非空才 `preventDefault()`。空结果、异常和旧代际监听器均放行原生菜单。
- 对话范围是 `[data-chat-turn]` / `[data-chat-node-key]`，输入框另行处理。分类顺序：可编辑区 → 图片 → 选区 → 代码块 → 链接 → 文件；没有命中则放行。输入框图片的「移除」由 `inComposerArea` 决定，而非是否有文字选区。
- 选区菜单先复制，再追加链接/文件操作。代码块恢复仅「复制代码」，不再附带围栏复制、引用或 AI 操作。
- 延迟阶段如果 dsh-file-menu 已有菜单且本插件有项，就移除其根并显示本菜单；dsh-round-rightclick 的 `[data-dsh-rr-layer]` 存在时让行。不要手动移除 React 圆盘 DOM。
- 保留独立的 `__dshAmSeen` / `__dshAmPd` 标记及 HMR 代际，勿与其他插件共享标记。

## 侧栏：真实能力与边界

### 会话

DSH 官方包 `@deepseek-ai/dsh-client-ui-workspace` 提供 `sidebar.workspaces.session.menu.item`。官方项为置顶 100、重命名 200、分叉 300、归档 400、复制会话 ID 450。插件使用两次独立 `ctx.slots.inject(... => ctx.slots.register(...))`，以 460/470 添加复制目录和打开位置。

```js
const React = require('react')
const { MenuItemButton } = require('@deepseek-ai/dsh-client-ui-primitives')
ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register(
  { name: 'sidebar.workspaces.session.menu.item', id: 'dsh-agent-menu-copy-cwd', order: 460 },
  (props) => React.createElement(MenuItemButton, {
    separatorBefore: true,
    onSelect: () => { props.useMenuOpenState()[1](false); copyCwd(sessionCwd(props.sessionId)) },
  }, '复制目录'),
))
```

每项都有自己的 effect 生命周期。不要合并注册后只返回一个 disposer；也不要使用不存在的 `window.__DSH_REACT__`。

目录来自 `ctx.get('sessions').list.getSnapshot().byId[sessionId].cwd`。缺失时对应项返回 `null`。本轮检查官方代码确认没有会话删除接口，**不得把归档伪装为删除**，也不添加未读、独立窗口等不存在的操作。

### 工作区

工作区原生菜单目前**没有对应扩展插槽**，官方代码只提供重命名、删除；新建会话是同一行的另一个原生按钮。因此保留原生菜单 DOM，只在确认菜单恰好包含「重命名 / 删除工作区」（或英文对应项）且位置靠近目标行时，追加：

1. 新建会话：调用该工作区行的原生新建按钮；
2. 复制目录；
3. 打开位置。

目录来自 `workspaces.list.getSnapshot().items` 中匹配的 `workspaceId` 的 `path`。找不到可信映射或菜单不匹配时不追加。工作区删除保留官方对话框，其会话进入未分组；不添加置顶、批量归档等未验证能力。此 DOM 适配依赖官方文案和结构，官方改版时需重新验收。

## 文件、图片与宿主操作

- 文件候选从属性、dataset 路径键与有限元素文本提取。相对路径必须结合当前会话 `cwd`；**无 cwd 时不显示空文件菜单**，绝不猜工作区根。
- 文件菜单只保留复制路径、打开位置、默认应用打开；已移除相对路径、文件名和 `file:` URL 等冗余复制项。
- 会话图片可从 `/api/file?path=<absolute path>` 解出本地路径。`blob:` / `data:` 图片在渲染层读取字节，走 `copy-image-bytes` / `save-image-bytes`。
- 「另存为」复制而非移动原文件。Windows 打开文件位置需要 `explorer.exe /select,` 与 `windowsVerbatimArguments: true`；目录定位则由宿主选择适当打开方式。
- 系统剪贴板优先 Electron，非 Electron 环境使用 PowerShell 兜底。`image-bytes.mjs` 会真实覆盖并读回系统剪贴板，运行前应知悉这一点。

## 视觉与文案

自定义菜单使用宿主主题 token，卡片圆角 12px、项圆角 6px，弱分隔线与轻阴影，不加图标。侧栏会话项使用原生 `MenuItemButton`，原生侧栏的其他操作和快捷键保留原样，不伪造快捷键。工作区追加按钮沿用本插件轻量样式，实际界面需检查两种主题。

菜单文案仍集中在 `LANG`。旧版「引用到输入框 / 发送给 AI / 提示模板」已完全删除；若文档或测试再出现这些能力，应视为过期内容，而不是待恢复功能。

## 验证与调试

```sh
node --check lib/client.js
node tests/scope.mjs
node tests/sidebar-actions.mjs
node tests/rightclick-native.mjs
node tests/smoke.mjs
node tests/status-phrases.mjs
node tests/image-bytes.mjs
```

- `scope.mjs`：精确菜单范围与代码块。
- `sidebar-actions.mjs`：官方插槽、cwd、工作区菜单追加与原生新建按钮。
- `rightclick-native.mjs`：有项才接管、异常放行、代际失效、输入框图片。测试中的 `Error: boom` 是故意注入的异常，成功时仍会出现其日志。
- `smoke.mjs`：file-menu、round-rightclick 共存和复制宿主路由。
- `status-phrases.mjs` / `image-bytes.mjs`：等待短语与真实剪贴板宿主通道。

这些都是桩环境或宿主路由验证，**不能代替真实 DSH 页面验收**。当前通用浏览器打开本机 DSH URL 出现 `dsh web authentication required`，未完成页面实测；不得把离线通过写成界面已验收。

- 客户端正常加载日志：`[dsh-agent-menu] installed, version x.y.z, generation N`。
- 没有控制台时可查 `/agent-menu/status`；`hello` 表示客户端已自报，`menuShown` 与各操作计数可辅助定位。
- 宿主代码变化必须重启 DSH，不能仅靠客户端热更新；不要为验证客户端而擅自重启或启停插件。
