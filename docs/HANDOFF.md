# dsh-agent-menu 改版交接

> 给下一位接手的人或 AI。先完整读完本文，再动代码；不需要翻历史会话。
> 本文以 **2026-10-28 的最新决定**为准。旧 README、旧开发记录与本文冲突时，以本文为准。

## 1. 一句话说明

这是 DSH（DeepSeek Harness）的自研右键菜单插件。当前版本 0.6.0；本轮要做的是**菜单视觉统一、现有操作精简，以及左侧工作区/会话菜单按参考补齐缺失操作**，然后开源发布。

## 2. 项目和运行位置

- 唯一开发仓库：`E:\Work\dsh-agent-menu`，分支 `main`，当前基线 tag `v0.6.0`。
- 当前通过 desktop profile 的 `link:E:/Work/dsh-agent-menu` 加载；**修改本仓库就是修改正在使用的插件**，不要再找另一份代码。
- 计划发布：GitHub `xsllo425/dsh-agent-menu`。
- Git 作者：`oxygenforce`，使用该账号的 noreply 邮箱。
- 0.1.0 由 GLM 在本机生成，0.2.0–0.6.0 在本机迭代；不是接手的 npm 第三方项目。

## 3. 本轮范围的准确边界

用户明确说过：**这是 UI 插件，不做对话 AI 功能拓展**。但这不等于侧栏只能改颜色——用户随后明确要求，**左侧工作区、项目、会话的菜单选项也应参考 Claude 增加**。

因此本轮有三件事：

1. 对话区、输入框：整理现有操作，统一外观，不新增 AI 操作。
2. 左侧栏：保留原生菜单机制，参考截图补齐 DSH 确有能力的管理操作；不能只写「统一原生菜单外观」。
3. 发布准备：让 README、包描述、测试与实际行为一致。

### 不做

- 不做对话区的复制整条消息、复制为 Markdown、附加为上下文、标记章节、分叉、回退、添加到聊天。
- 不恢复引用、发送给 AI、解释、翻译、总结、续写、优化、生成测试等 AI 项。
- 不做侧栏批量归档/删除、分区、分享、云端同步、环境另存。
- 不为了像 Claude 而强造子菜单或快捷键；功能真实接入后才显示对应快捷键。
- 不做「在独立窗口中打开会话」：用户已决定不再继续查证，按 DSH 没有此能力处理。
- 本轮不顺手拆分或重构等待状态短语功能；去留另行决定。

## 4. 菜单定案

### 4.1 对话区与输入框

| 右键目标 | 要保留/实现的操作 |
|---|---|
| 对话区选中文字 | 复制；若同时命中链接或文件，再追加相应的链接/文件操作 |
| 链接 | 复制链接地址、复制为 Markdown 链接、在浏览器中打开 |
| 文件路径/文件芯片 | 复制路径（绝对路径）、打开文件位置、用默认应用打开 |
| 代码块 | 恢复基础「复制代码」；不恢复任何 AI 项 |
| 对话区图片、输入框附件图片、图片放大层 | 复制图像、另存为；有本地路径时提供打开文件位置、用默认应用打开；输入框附件另有「从输入框移除」 |
| 输入框无选区 | 粘贴、撤销、重做、全选 |
| 输入框有选区 | 剪切、复制、粘贴、撤销、重做、全选 |
| 白名单外区域 | 不接管，保留原生右键菜单 |

明确删除：文件菜单的「复制相对路径 / 复制文件名 / 复制本地文件链接」；图片菜单的「复制图片地址」。「复制路径」只复制绝对路径。

### 4.2 左侧工作区/项目/会话

**这里不是只做美化。** 当前 0.6.0 只是点击行内 ⋮，弹出 DSH 原生菜单；要在此基础上按参考补齐缺失选项。

候选清单如下。开工时逐项对照原生菜单：已有项保留，不重复；只有确认 DSH 有真实、可调用能力时才新增，做不到就不放占位项。

**工作区/项目候选：**
- 新建会话
- 重命名
- 置顶/取消置顶
- 在文件夹中显示
- 复制工作目录
- 归档聊天
- 从列表中移除

**会话候选：**
- 置顶/取消置顶
- 标记未读/已读
- 重命名
- 分叉
- 在文件夹中显示
- 复制会话 ID
- 复制工作目录
- 归档
- 删除

参考中的单字母快捷键（P/U/R/F/A/D 等）不是装饰：只有真实接入快捷键才显示，否则不写。

**实现约束：**
- 优先继续使用 DSH 原生菜单及其 slot/操作能力，不凭空复刻一套状态管理。
- 先查官方 `@deepseek-ai/dsh-client-ui-workspace` 的现有 action 与 `sidebar.workspaces.*.menu.item` 扩展点，再决定每项怎样接入。
- 必须区分工作区行和会话行，不能把工作区操作错放到会话上。
- 保留右键触发原生 ⋮ 的现有交互；如果新增项通过原生 slot 注册，也应出现在同一个菜单中。
- 原生操作不可用时宁可缺项，不猜路径、不伪造成功。
- 「在独立窗口中打开」已经排除，不再列入候选。

## 5. 视觉定案

参考 [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) 及其 `docs/STYLE.md`，不是照搬 Anthropic 官方资产。

- 菜单卡片圆角约 12px，菜单项圆角约 6px。
- 弱分隔线、轻阴影、清晰间距、纯文字无图标。
- 快捷键右对齐且弱化；危险操作延续 DSH 原生危险色。
- 颜色和字体优先读取 DSH 当前主题 token，适配 Claude/DeepSeek 配色和明暗主题，**不要写死浅色**。
- 只参考设计令牌和控件几何，不复制 Anthropic 字体、吉祥物等主题资产。

## 6. 0.6.0 真实现状

不要拿当前 README 的功能表当事实：它还描述旧版 AI 菜单。代码核实结论：

- `lib/client.js` 的 `classify()` 当前只会产生：选区、链接、文件、对话区图片、输入框图片/空/选区、其他允许区域的图片。
- `classify()` 不返回 `block` 或 `codeBlock`；因此 `itemsForBlock()` 和 `itemsForCodeBlock()` 目前不可达。本次恢复「复制代码」时要恢复分类路径，同时清理旧 AI 死代码，不能整段旧菜单原样接回。
- 文件、链接、选区、输入框的 AI 项已删；不要误恢复。
- 图片有路径/字节双通道：本地 `/api/file?path=` 图片走路径；`blob:`/`data:` 图片由客户端读为 base64，再经宿主 `copy-image-bytes` / `save-image-bytes` 完成操作。该通道不是死代码，保留。
- 左侧栏当前只触发原生 ⋮ 菜单，并没有完成上一轮提到的侧栏补项。
- 等待短语在 `lib/status-phrases.json`，与右键无关。

## 7. 代码入口

| 文件 | 用途 |
|---|---|
| `lib/client.js` | 右键捕获、场景分类、菜单项、DOM 菜单、侧栏入口；文案集中在 `LANG` |
| `lib/index.js` | 宿主 `/agent-menu` 路由：剪贴板、图片复制/另存、文件定位/打开、诊断 |
| `lib/status-phrases.json` | 等待短语词库，本轮不动 |
| `docs/DEVELOPMENT.md` | 架构、共存与历史踩坑；其中「侧栏不新增」等旧结论已被本文替代 |
| `docs/CLAUDE-RIGHTCLICK-REFERENCE.md` | Claude/Codex/MiniMax/WorkBuddy 实机截图整理，是菜单参考来源 |
| `PATCH-NOTES.md` | 逐版本变更历史；含旧路径和旧行为，阅读时区分历史与现状 |

关键函数用名字搜索，别依赖行号：`classify`、`buildItems`、`decide`、`onContextMenu`、`itemsForSelection`、`itemsForFile`、`itemsForLink`、`itemsForImage`、`itemsForCodeBlock`、`itemsForComposerEmpty`、`itemsForComposerSelection`、`showMenu`、`sidebarRowOf`、`sidebarMenuButton`。

## 8. 不能破坏的约束

- **不吞菜单**：先同步 `buildItems()`，有项才 `preventDefault()`；分类为 null、算项失败或无项时放行。
- **侧栏分支在 classify 之前**；认 `data-row-key` / `role="treeitem"`，不要依赖哈希 class。
- 触发侧栏原生菜单时保留 `stopImmediatePropagation()`，防止 `dsh-session-deck` 抢右键。
- 保留与 `dsh-file-menu` / `dsh-round-rightclick` 的共存规则，详见 `docs/DEVELOPMENT.md`。
- 文件路径无法可靠解析时隐藏对应操作，绝不猜工作区根。
- 输入框不加 AI 项。
- 客户端改动刷新页面验证；宿主 `lib/index.js` 改动需要重启 DSH，不要自行杀用户的 DSH 进程。
- 插件改动完成后，用 plugin-manager 的 `note 改动 dsh-agent-menu "<说明>"` 记录到 `~/.dsh/plugin-changelog.md`。
- 修改前看 git 状态，保护未提交改动；不要用 README 或旧文档覆盖用户的新决定。

## 9. 建议实施顺序

1. 先读原生工作区客户端的 action/slot，对照列出「已有 / 可补 / 无能力」三栏，再落实侧栏菜单；不要先做一轮纯 CSS 就声称侧栏完成。
2. 恢复代码块复制，删除确定不用的菜单项和 AI 死代码。
3. 统一自绘菜单与侧栏原生菜单的视觉；侧栏功能项仍走真实原生操作。
4. 更新测试，尤其覆盖：代码块复制、精简后的文件/图片项、白名单放行、侧栏两类行及新增项。
5. 重写 README / README.zh 和 package 描述，使其只描述实际功能。
6. 浏览器实测并记录截图/结果；命令通过不等于实际右键已验证。
7. 提交、打 tag、推送 GitHub；等待短语去留在发布说明里如实交代。

## 10. 验证命令

```sh
node --check lib/client.js
node tests/scope.mjs
node tests/rightclick-native.mjs
node tests/status-phrases.mjs
node tests/image-bytes.mjs
```

`tests/smoke.mjs` 测的是 0.4.x 旧行为，0.5.0 前已失效；本轮应重写或替换，不能把旧测试失败当作新回归，也不能把它忽略后宣称完整测试通过。

运行时诊断可用 `/agent-menu/status` 与 `/agent-menu/diag`；端口以当前 DSH GUI 为准。
