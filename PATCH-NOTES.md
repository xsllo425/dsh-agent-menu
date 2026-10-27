# dsh-agent-menu — 本地收编说明

- 版本：**0.6.0**（0.1.0 为 GLM 交付的初版；0.2.0 – 0.6.0 本机自行迭代，计划开源到 GitHub `xsllo425/dsh-agent-menu`）
- **来源：不是 npm。0.1.0 由 GLM 在本机生成**；此后同样只在本机迭代，仓库里没有第二份副本。
- 接入时间：2026-10-11 12:03（0.1.0）／ 下午（0.2.0）／ 晚间（0.3.0）
- 接入方式：profile `package.json` 里 `"dsh-agent-menu": "link:C:/Users/17416/.dsh/plugins/dsh-agent-menu"` + node_modules junction
- 备份：`C:\Users\17416\.dsh\profiles\desktop\package.json.bak-agentmenu前-2026101104034`
- git 仓库：本目录**已建 git**，基线段 commit `6b20ef7`（2026-10-27，0.6.0 现状）+ tag `v0.6.0`。0.1.0 – 0.5.x 的历史没有逐版提交，需要旧版从下面的备份/snapshot 取。改动前 `git status` 应保持干净
- 0.1.0 原版快照：`E:\DSH\am-v010-snapshot`（仍在，是 0.1.0 的唯一副本；0.2.0 – 0.5.x 无独立快照，靠 `lib/*.bak-*` 回溯）

## 客户端半帧：修「右键点图片没反应」（2026-10-27，用户报障）

**动机**：用户反馈「右键点图片，之前有能复制/另存的菜单，现在右键点了没反应」。

**根因**：`onContextMenu` 在捕获阶段只要 `classify()` 判定「归本插件管」就立刻
`event.preventDefault()`，浏览器原生菜单当场被杀；可随后的 `decide()`（在
`setTimeout(0)` 里）还有五条路**什么都不弹**：

| 什么都不弹的路 | 位置 |
|---|---|
| 代际号失效（`!activeGeneration()`，插件被重新 apply 过的旧闭包） | `decide()` 第一行 |
| 算菜单项时抛异常（`workspaceBase()` / `pathFromTarget()` / `itemsFor*` 任一炸） | 被 `onContextMenu` 的 try/catch 吞掉 |
| 菜单项为空 | `items.length === 0` |
| `dsh-file-menu` 已弹、且我们没项可接管 | `fmRoot !== null` 分支 |
| `dsh-round-rightclick` 全屏遮罩在场 | `ROUND_MENU_LAYER` 判定 |

0.4.1 只堵了其中「`block` 场景菜单为空」一条（见下文 0.4.1 那节），其余四条仍在——
原生菜单已经被吞、自己的菜单又不弹，用户看到的就是「右键点了没反应」。

**改法**：菜单项计算从 `decide()` 里拆成**同步**的 `buildItems(context)`（纯计算、无 DOM
副作用、自带 try/catch，返回 `null` 表示「不归我们管或算错」）；闸门改成「**先算项，有项才
`preventDefault()`**」。`decide(context, prebuilt)` 收下算好的项，只负责按现场决定谁弹。

| 改动 | 位置 | 说明 |
|---|---|---|
| 新增 `buildItems(context)` | `lib/client.js` | 原 `decide()` 的算项部分整体搬过来，外套 try/catch。**刻意不调用 `closeMenu()`**——它不许有 DOM 副作用，否则「算项」这一步本身就会改现场 |
| 闸门前移 | `onContextMenu` | `classify()` 判定 → `buildItems()` 算项 → 有项才 `preventDefault()`；没项或算错时先 `closeMenu()` 再放行，原生菜单（图片的「复制图片 / 图片另存为」）照常出现 |
| `decide(context, prebuilt)` | `lib/client.js` | 第二参数可选，缺省时自己算一遍（兼容测试与老调用方）。原有「file-menu 接管 / 圆盘让行 / 弹自己」逻辑一行未动 |
| 顺手修 | `onContextMenu` | `setTimeout` 那段原来缩进坏了（多两级 tab），这次改正 |

**验证**（都跑过）：`node --check lib/client.js` 通过；`node tests/scope.mjs`、
`node tests/status-phrases.mjs` 全绿；新增 `node tests/rightclick-native.mjs`（7 场景全绿）
锁住新契约——对话区图片、输入框图片仍由插件接管（含「复制图像」「另存为…」「从输入框移除」），
而对话范围外段落、表格单元格、算项抛异常、代际号失效四类**一律不 `preventDefault`**。
`tests/smoke.mjs` 仍失败，但那是 0.5.0 之前就有的（文件头已注明它测的是 0.4.x 行为），
拿改前文件跑同样失败，**不是本次回归**。

**未动**：宿主半帧 `lib/index.js`、`classify()`、`showMenu()`、菜单项生成、与
`dsh-file-menu` / `dsh-round-rightclick` 的共存逻辑全部未改；版本号仍 0.5.0（纯行为修复，
未发版）。`mediaPathOf()` 也没动——对话区图片如果用的是 `blob:` / `data:` 地址而不是
`/api/file?path=`，照样解不出本地路径，「复制图像 / 另存为」会提示解析失败，这是另一件事。

**生效条件**：改的是客户端半帧，**刷新 GUI 页面**即生效，不必重启 DSH。
profile 的 `node_modules/dsh-agent-menu` 是指向 `~/.dsh/plugins/dsh-agent-menu` 的
junction（`lrwxrwxrwx`，实测确认），只有一份代码，不存在两份不同步。

**备份**：`lib\client.js.bak-before-rightclick-fix-20261027`（改前完整文件，想还原直接覆盖回 `lib/client.js`）。

## 宿主半帧：修「用默认应用打开」打不开 Electron 应用（2026-10-22）

**动机**：用户点文件芯片的「用默认应用打开」完全没反应（.md 默认程序是 MarkText）。排查后确认不是菜单、不是文件关联、不是 MarkText 本身坏，而是**启动环境被污染**。

**根因**：DSH 宿主进程为了让 Electron 二进制当 node 跑 CLI，自己进程环境里带 `ELECTRON_RUN_AS_NODE=1`；`spawn` 的子进程原样继承。默认应用是 Electron 程序（MarkText / VSCode / Typora…）时它就退化成纯 Node 启动——秒退、无窗口、退出码 0。而 `spawnDetached` 本身是成功的，宿主只回 `ok:true`，`callFileAction` 成功时又静默无 toast，用户看到的就是「点了没反应」。

**实测证据**（三条都跑过）：
- 让插件去"打开"一个 `.bat`（内容 `set > file`），落盘的子进程环境里明确有 `ELECTRON_RUN_AS_NODE=1` → 污染确认。
- 同一条 `cmd /c start "" <file.md>`：干净环境下 MarkText 正常打开并驻留；带上该变量 0.6 秒内进程消失。
- 污染环境下分别用**改前**和**改后**的真实插件代码各跑一次：改前 HTTP 200 但 MarkText 从未出现；改后 1 秒内起来、窗口标题正确、16 秒仍驻留。

| 改动 | 位置 | 说明 |
|---|---|---|
| 新增 `childEnv()` | `lib/index.js`（`spawnDetached` 之后） | 返回 `{...process.env}` 并 `delete env.ELECTRON_RUN_AS_NODE`。宿主自己是不是 Electron 与要打开的外部应用无关，所以打开外部应用时摘掉它；剪贴板那条链路仍走 `process.env`，不受影响 |
| `openWithDefaultApp` 三处传 env | `lib/index.js` | win32 `cmd.exe /c start ''`、darwin `open`、linux `xdg-open` 都改成 `{ env: childEnv() }`。`revealInFileManager`（explorer / open / xdg-open 都不是 Electron）**刻意不改** |

**未动到的**：菜单项生成、`resolveTarget`、剪贴板 / 图片 / 另存为、`revealInFileManager`、客户端 `lib/client.js` 全部未改；`node --check` 通过。

**生效条件**：改的是宿主半帧，**必须重启 DSH**（或重载插件）才生效；重启后点任一 `.md` 芯片的「用默认应用打开」即验证。

**备份**：`E:\Backups\agent-menu-20261022\index.js`（改前完整文件，想还原直接覆盖回 `lib/index.js`）。

## 0.4.0 → 0.4.1 改了什么（用户点名单改一处）

**用户要求：「取消他在所有页面的右角（右键）交互中的【复制此段】功能。仅此一个，不影响其他。」**

| 改动 | 位置 | 说明 |
|---|---|---|
| 删掉段落菜单的「复制此段」 | `itemsForBlock` | 原来是 `label: code ? LANG.copyCode : LANG.copyBlock` 的**无条件** push。现在改成 `if (code)` 才 push → 非代码段落不再出现「复制此段」，**代码块的「复制代码」原样保留** |
| 删掉文件芯片菜单的「复制此段」 | `itemsForFile` | 原来是 `blockText !== ""` 时补一条分隔线 +「复制此段」。**连分隔线一起删**，不留悬空横线 |
| 分隔线改成有条件补 | `itemsForBlock` | 原来 AI 三项之后无条件 push 一条 separator（是为了分隔下面的复制项）。现在只在 `code` 为真（下一条真的是「复制代码」）时才补，否则段落菜单末尾会多一条横线 |
| **新增防漏闸门** | `onContextMenu` | 「复制此段」是段落菜单在**没有活动会话**时唯一的兜底项。删掉它以后，`无会话 + 非代码段落` 的菜单会一项都不剩——而 `classify` 已经返回 `block`，`preventDefault` 又已经执行，结果是「原生菜单被吞掉、自己的菜单也不弹」。所以在闸门后补一条：`scenario === "block" && !agentActionsAvailable() && !inCodeOf(target)` → 直接 return 放行。判定条件与 `itemsForBlock` 逐字对应（菜单为空 ⟺ `!agentOk && !code`） |
| `LANG.copyBlock` **键保留** | 文案表 | 只是不再被引用，注释里写了恢复办法（一句改回）。不删键，避免以后想还原时找不到原文案 |
| 版本号 0.4.0 → **0.4.1** | `package.json` + `CLIENT_VERSION` | 改完可用 `GET /agent-menu/status` 里的 `version` 确认新代码真的下发了（页面上按 Ctrl+F5 硬刷新；host 半帧没动，不必重启 DSH）|

**已验证没动到的**：`itemsForCodeBlock`（`<pre>` 代码块）整段未改；`itemsForSelection` / `appendContextItems` /
`itemsForLink` / `itemsForImage` / `itemsForComposerEmpty` / `itemsForComposerSelection` / 侧边栏原生菜单触发 /
状态行随机文案（0.4.0）全部未改。所有 24+17 条冒烟断言仍全绿。

**测试改动**：场景 9 从「无会话 → 只剩『复制』」改写为两条——9a 无会话 + 段落 → **不出菜单且不 preventDefault**（放行浏览器原生菜单）；9b 无会话 + 行内 `<code>` → 仍出且只出「复制代码」。

**备份**：`lib/client.js.bak-去复制此段前-20261014-164445`（改动前的完整文件，想还原直接覆盖回去）。

## 0.2.0 → 0.3.0 改了什么

动机：用户给了 7 张其它 Agent 的右键菜单参考图，要求「**按被点击的目标分**」，
并明确「白名单外一律不接管以防误触」。0.2.0 的五路分类是子集，缺的分支一次补齐。

### 1. 新增防误触闸门（最重要的一条）

`classify(context)` 抽成独立函数，**返回 `null` 就代表这个点击不归本插件管**。
`onContextMenu` 改成：

```js
if (classify(context) === null) return   // 放行，浏览器原生菜单照常
event.preventDefault()                   // 只有真能出菜单才拦
```

0.2.0 是**无条件 `preventDefault()`**——点对话区空白、点工具栏、点状态栏，
本插件也会把原生菜单吞掉（只是不弹自己的）。这是最像「劫持」的一处行为。

### 2. `classify()` 七路互斥优先级

`可编辑区 → 图片（输入框内）→ 选区 → 图片（对话区）→ 代码块 → 超链接 → 文件芯片 → 段落`，
都不命中就 `return null`。

### 3. `lib/client.js` 新增菜单函数

| 函数 | 场景 | 菜单 |
|---|---|---|
| `itemsForComposerEmpty` | 输入框无选区 | 粘贴 / 撤销 / 重做 / 全选（**不给剪切复制**，没东西可切） |
| `itemsForComposerSelection` | 输入框有选区 | 剪切 / 复制 / 粘贴 / 撤销 / 重做 / 全选（**刻意不给 AI 项**——还没发出去） |
| `itemsForCodeBlock` | `<pre>` 内 | 复制代码 / 复制为代码块（带 ```lang 围栏）/ 复制（不带语言标记）/ 引用 / 解释 / 优化 / 生成单元测试 |
| `itemsForImage` | 输入框图片 + 对话区图片 | 新标签页打开 / 复制图像 / 复制图片地址 / 打开文件位置 / 用默认应用打开 / 另存为…（输入框内另有 从输入框移除） |

`itemsForEditable` 整个函数删除（被上面三态取代）。

### 4. 图片路径怎么解出来的

DSH 的所有会话媒体都挂在同一条路由上（宿主文档原文 `SessionMediaReferences`）：
`GET /api/file?path=<encodeURIComponent(绝对路径)>`，经 `ctx.fs` 读，
「including temporary paths outside registered workspaces」。

所以 `mediaPathOf(img)` 直接从 `<img>` 的 src 里正则抠 `path=` 参数再 `decodeURIComponent`，
**不用猜、不用扫元素文本**。解不出来（远端图 / data: URL）→ **隐藏**「打开文件位置 / 另存为」，
只留不依赖本地路径的项。宁可少一项，绝不误报。

### 5. `lib/index.js` 新增两条路由

| 路由 | 为什么渲染层做不到 |
|---|---|
| `POST /agent-menu/copy-image { path }` | 走 `nativeImage.createFromPath` + `clipboard.writeImage`。DSH 的 `/api/file` 是认证路由，渲染层 fetch 拿不到 blob；而 `ClipboardItem` 要求同源 |
| `POST /agent-menu/save-image { path }` | 走 Electron `dialog.showSaveDialog` + `copyFileSync`（**复制不是移动**，原档必须留在会话里） |

`runtimeStats` 加 `copyImage` / `saveImage` 计数。新增 `electronApi()` 兼容
`mod.clipboard` / `mod.default.clipboard` 两种形状，非 Electron 环境返回 null。
宿主仍然**只 import node 内置模块**，不需要 `.dsh\plugins\node_modules` 那条 junction。

### 6. 其它

- `itemsForLink` 加「复制为 Markdown 链接」（`[文本](url)`，无锚文本时用 URL）
- `itemsForFile` 加「复制相对路径 / 复制本地文件链接 / 复制文件名」。
  芯片常给相对路径（`src/main.ts`），要出相对/本地文件链接 得先补全成绝对路径，
  补不出来就不给这两项。相对路径的分隔符跟工作区根一致（Windows 上是反斜杠）。
- `codeBlockOf` 的 lang 从 class `language-xxx` / `lang-xxx` 或 `data-lang` / `data-language` 取

### 7. 左侧工作区 / 会话树：右键触发 DSH 原生菜单，不自己出菜单

用户要求「左侧工作区，右键交互应该和点击原生展开菜单显示一致」。

原生菜单来自官方包 `@deepseek-ai/dsh-client-ui-workspace`（在 app.asar 的
`dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` 里）。它给每一行打
`data-row-key`（工作区 `workspace:<组键>`、会话 `session:<会话 id>`）和 `role="treeitem"`，
菜单是 React state 控制的（`const [menuOpen, setMenuOpen] = useState(false)`），入口是行内
那个 ⋮ 按钮，`aria-label` 取自 `actions.workspace.aria` / `actions.session.aria`，即
`工作区"X"的操作` / `会话"X"的操作`。

所以做法是**真的去 click 那个按钮**，而不是复刻菜单：

```js
var sidebarRow = sidebarRowOf(target);          // data-row-key 或 role="treeitem"
if (sidebarRow !== null) {
    var nativeButton = sidebarMenuButton(sidebarRow);   // aria-label 结尾 === "的操作"
    if (nativeButton !== null) { event.preventDefault(); nativeButton.click(); }
    return;                                      // 绝不出本插件菜单
}
```

这么写的理由：菜单项（置顶 Ctrl+Alt+G / 重命名 / 分叉 Ctrl+Alt+F / 归档 Ctrl+Shift+A / 删除）、
图标、快捷键、删除项的红色危险色全部由官方 React 组件渲染，我们一个字都不用抄，官方改版也不会
漂移。**点不到按钮就放行浏览器原生菜单兜底**，绝不 `preventDefault` 之后什么都不给。

三个实现要点：

1. **分支必须放在 `classify` 闸门之前**。否则 `classify(context) === null` 会先 return 放行，
   侧边栏右键就永远走不到这里。
2. 认行用 `dataset.rowKey` / `role`，**不用 class 名**——官方的 class 是 CSS Module 哈希
   （`_9lTDKa_sessionRow` 这种）。
3. `sidebarMenuButton` 第一行有 `row.querySelector === undefined` 守卫；测试桩 `makeEl()`
   只定义了 `querySelectorAll`，漏了 `querySelector` 会让它静默走 `return null`，
   外层 try/catch 又不报错。**给桩补 `querySelector = () => null` 才对**。

### 8. `tests/smoke.mjs`：10 → 17 个场景

- 场景 8 拆成 **8a**（无选区）/ **8b**（有选区，断言刻意不给 AI 项）/ **8c**（文件芯片）
- 新增 **场景 11**（代码块，含「走代码向而非通用选区向」的回归断言）
- 新增 **场景 12**（图片：有本地路径出全部项；远端图**隐藏**本地项）
- 新增 **场景 13**（白名单外：不弹菜单 **且不 `preventDefault`**）
- 新增 **场景 13b**（侧边栏：断言点了原生 ⋮ 按钮 1 次、`preventDefault` 1 次、**不出本插件菜单**）
- 新增 **场景 13c**（侧边栏行内找不到 ⋮ 按钮：**不** `preventDefault`，浏览器原生菜单兜底）
- 场景 6 / 8c 补「复制为 Markdown 链接」与三个文件项的断言，并校验相对路径内容真的不含 base
- 测试桩补 `global.location`（客户端里 `new URL(src, location.href)` 是裸全局，
  少了它图片地址两项会被 try/catch 静默吞掉）

`node tests/smoke.mjs` → **15 个场景全绿**。

## 0.1.0 → 0.2.0 改了什么（首次动包本体）

0.1.0 接入时包本体一个字没改。0.2.0 是**首次改包本体**，动机是用户实测发现
**「右键超链接只有复制代码」**——不是偶发 bug，是覆盖面太窄 + 强依赖 dsh-file-menu。

### 1. `lib/index.js`：从空体长成真正的宿主半幀（0 行 → 299 行）

0.1.0 是 `export function apply() {}`，**不注册任何 HTTP 路由**，所以系统剪贴板、
「打开文件位置」、「用默认应用打开」这三件原生能力全都做不了，只能借 file-menu 的路由。
0.2.0 在 `webServer` 上注册 `/agent-menu` 前缀路由，提供
`ping` / `status` / `hello` / `menu` / `diag` / `clipboard` / `reveal` / `open`，
实现从 `dsh-file-menu` 移植（`name` 改成 `agent-menu`，前缀改成 `/agent-menu`）。

移植时**原样保留** file-menu 那条实测绕坑注释：Windows 上 explorer 的 `/select,`
必须配 `windowsVerbatimArguments: true`，否则 Node 默认的加引号转义会让 Explorer
忽略开关、退回默认文件夹（实测落到「文档」）。

### 2. `lib/client.js`：路径检测 + 三类新菜单 + 分类重写

| 改动 | 位置 | 为什么 |
|---|---|---|
| 移植 `looksAbsolutePath` / `pathCandidate` / `pathFromTarget` / `workspaceBase` / `joinPath` / `displayPathOf` | 新增块 | 0.1.0 只有 `hasPathAttribute`，认 4 个属性、depth<12；DSH 对工作区文件只显示相对路径、工具行 fileLink 按钮既无 `title` 也无 `data-path`，路径只在文本里 → 必须认 6 个属性 + dataset 扫 `/path/i` + CODE/SPAN/A/BUTTON 文本 |
| 新增 `itemsForLink` / `itemsForFile` / `itemsForEditable` / `appendContextItems` | 菜单构建段 | 0.1.0 的 `decide()` 对 link 分支**完全留空**，对 hasPath/file-menu 场景也让位 → 右键超链接只剩「复制代码」 |
| `decide()` 从「选区 / 段落」二选一改成五路互斥优先级：可编辑区 → 选区 → 超链接 → 文件芯片 → 段落 | `decide()` | 0.1.0 的两个分支都带 `hasPath === false && link === null` 前置条件，link 永远进不来 |
| `copyText` 改走 `callHost()`（自己的 `/agent-menu` 优先，失败退 `/file-menu`，再退本地复制） | 复制段 | 0.1.0 直接 `postJson("/file-menu/clipboard")`，file-menu 卸载即失效 |
| `onContextMenu` 对可编辑区也 `preventDefault()` | 事件段 | 0.1.0 对输入框完全不弹菜单、不 suppress |
| `apply()` 末尾向宿主 `hello` 自报版本 | 事件段 | 新增。没有浏览器控制台时用 `GET /agent-menu/status` 就能确认跑没跑 |
| `CLIENT_VERSION` 0.1.0 → 0.2.0 | 头部 | — |

**保留没动的**：`itemsForSelection` / `itemsForBlock`（原 AI 项一个没删）、HMR 代际号幂等、
`setTimeout(0)` 延迟决策、file-menu / round-rightclick 的共存规则。

### 3. `package.json`：版本 0.2.0 + description/keywords 补新能力

`dsh` 字段、`exports`、peerDependencies（本来就是 0 项）全部未动。0.3.0 又补了
`image` / `code-block` / `markdown` / `undo` 四个 keyword 并把能力写进 description。
`repository` / `homepage` / `bugs` 字段等 GitHub 仓库真的建好后再补。

### 4. `tests/smoke.mjs`：两条断言按新行为改写，另加 3 个场景

- 场景6「链接 → 让位给 file-menu」**改**为「链接 → 出链接项并接管」（0.1.0 行为已废弃）
- 场景8「编辑框不弹菜单不 preventDefault」**改**为「编辑框出 剪切/粘贴/全选」（同上）
- 新增场景 8b（文件芯片）、场景 10（复制走自己的宿主路由 + apply 后 hello 自报）

`node tests/smoke.mjs` → 10 个场景全绿（0.3.0 时已扩到 15 个，见上）。

## 0.1.0 接入时的体检结论（仍然成立）

| 检查项 | 结果 |
|---|---|
| 客户端注册 id | `"dsh-agent-menu"` == 包名 ✅ |
| peerDependencies | **0 项** —— 无从触发 DSH 的 peer 兼容门 |
| 宿主半幅 | 只 import `node:child_process` / `node:fs` / `node:os` / `node:path` 四个**内置**模块（0.3.0 加了 `copyFileSync`），不 import 任何宿主包 → 不需要 `.dsh\plugins\node_modules` 那条 junction |
| 客户端 `require()` | 0 处 —— 完全不依赖宿主包 |
| 源码形态 | 手写，非构建产物 |

`@z1995418/dsh-file-menu` 当初让整个 DSH 打不开，就是因为 `lib/client.js:2` 的
`id: "dsh-file-menu"` 不等于包名 `@z1995418/dsh-file-menu`，loader 判定「这条 row
加载了却没注册」→ 单独再拉一次 → 同一脚本执行两次 → `duplicate factory registration`
→ web boot 一票否决拒绝启动。本插件的 id 是对的，**不会有这个风险**。

## 验证方式

```sh
curl -s http://127.0.0.1:19387/agent-menu/ping
curl -s http://127.0.0.1:19387/agent-menu/status
ls "C:/Users/17416/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/" | grep crash | tail -3
```

`status` 里的 `stats.hello` > 0 说明客户端半幀已下发并自报过；`menuShown` / `clipboard` /
`copyImage` / `saveImage` / `reveal` / `open` 是累计动作数；`diag` 里有最近 40 条右键现场记录。
崩溃日志无新增 = web boot 没被这个插件搞崩。

## 与其它右键菜单插件的共存

- `dsh-file-menu` 挂 window 捕获，有菜单时同步 `preventDefault + stopPropagation`
- 本插件**不在事件回调里同步决策**，而是记下上下文后 `setTimeout(0)` 再决定 ——
  因为 `stopPropagation` 拦不住同一节点上的其他监听器，两个 window 监听器的先后取决于
  cordis.yml 行序，不可靠。延到下一 tick，file-menu 的同步处理必然已经结束。
- 本插件有项 → 接管菜单（0.3.0 的菜单是 file-menu 的超集，不丢功能）；没项 → 让 file-menu 留着
- `dsh-round-rightclick` 的全屏遮罩出现 → 一律让行

## 以后改动这个插件时

本目录已有 git。基线是 2026-10-27 的 commit `6b20ef7` / tag `v0.6.0`（0.6.0 当时现状）。
**改之前先 `git status` 确认干净，改完提交并把版本号一起 bump。**
没有「升级覆盖」的问题，也没有第二份 npm 副本可回滚——git 就是回滚点。
0.6.0 之前的版本没有逐版提交：0.1.0 的原版在 `E:\DSH\am-v010-snapshot`，
0.2.0 – 0.5.x 只能从 `lib/*.bak-*` 回溯，不要凭记忆重写。
