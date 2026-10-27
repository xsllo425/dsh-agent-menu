# 开发与排查记录（dsh-agent-menu）

本文是给维护者看的：设计决策为何如此、与同类插件怎么共存、踩了哪些坑。
面向用户的功能与安装说明见 [README.zh.md](../README.zh.md)。

## 组成

| 文件 | 说明 |
|---|---|
| `lib/index.js` | 宿主半幀：在 `webServer` 上注册 `/agent-menu` 前缀路由，提供系统剪贴板、**复制图像**、**另存为**、资源管理器定位、默认应用打开，以及 `ping` / `status` / `hello` / `menu` / `diag` 诊断端点。0.1.0 时是空体，0.2.0 才长出实现。 |
| `lib/client.js` | 客户端半幀：捕获阶段监听 `contextmenu`，**先看侧边栏、再 `classify()` 判场景、判不出就放行**，纯 DOM 菜单（不依赖 React），操作输入框走 `conversation` 服务，取工作区根走 `sessions` 服务。 |
| `cordis.patch.yml` | bundle 补丁：向宿主 loader 插入一行（`id: agent-menu` / `name: dsh-agent-menu`）。 |

## 设计决策

### 1. 为什么决策放在 setTimeout(0)，而不是在 contextmenu 回调里同步做

本机可能同时装着会碰 `contextmenu` 的插件，监听位置不同：

| 插件 | 监听位置 | 有菜单时 |
|---|---|---|
| dsh-file-menu | **window** + document 捕获 | 同步 `preventDefault` + `stopPropagation` |
| dsh-round-rightclick | document 捕获（仅会话表面） | 同步 `preventDefault` + `stopPropagation` |
| 本插件 | window + document 捕获 | —— |

`stopPropagation` 拦不住**同一节点**上的其他监听器（那需要 `stopImmediatePropagation`），
所以 file-menu 弹菜单后本插件的 window 监听器照样会跑。问题在于**两个 window 监听器的先后
取决于模块加载顺序**（cordis.yml 行序），不可靠。

解法：回调里只记上下文（target、坐标、选区、所在段落），`setTimeout(0)` 后再决策。
定时器回调执行时，本次事件的所有同步监听器都已跑完——file-menu 弹没弹菜单看
`#dsh-file-menu-root` 在不在 DOM 里就知道，与加载顺序无关。

同步阶段只做一件事：**能出菜单才 `preventDefault()`**。
顺序是：先看是不是左侧工作区/会话树（`sidebarRowOf`）——是就去点官方的 ⋮ 按钮、自己不出菜单；
不是再跑 `classify()`。

0.1.0 的规则是「一律 `preventDefault()`，可编辑目标除外」——问题在于「一律」：点对话区空白、
点工具栏、点状态栏，原生菜单也会被吞掉（本插件只是不弹自己的）。这是最像「劫持」的一处行为。
0.3.0 改成先跑一次 `classify(context)`，**返回 `null` 就直接 return，不 `preventDefault`**，
把浏览器原生菜单原样放行。0.2.0 取消了可编辑目标的例外，因为本插件自己出剪贴板菜单。

### 2. 菜单分类：七路互斥优先级 + null 放行

0.1.0 的分类是「选区 / 段落」二选一，且两个分支都带 `hasPath === false && link === null` 前置
条件。后果是 **link 分支永远进不来**——右键超链接时 `items` 为空，只能让给 file-menu；用户实测
「右键超链接只有一个复制代码」就是这个设计的直接后果。不是偶发 bug，是覆盖面太窄。

0.3.0 抽成独立的 `classify(context)`，返回场景 id 或 `null`（0.2.0 的五路是它的子集）：

```
可编辑区 →（其中含图片）→ 选区 → 对话区图片 → 代码块 → 超链接 → 文件芯片 → 所在段落
                                                     └────────── 都不命中 → null（放行）
```

`classify` 是**纯同步、纯 DOM 读取**，所以能在事件回调里先跑一遍决定放不放行，
`decide()` 里再跑一次分派。两次结果一致，因为 `decide()` 跑在 `setTimeout(0)` 之后、菜单打开之前，
而 `classify` 只依赖 `context` 里已经捕获好的字段。

选区那一支走完 `itemsForSelection` 后再用 `appendContextItems()` 追加链接 / 文件操作，
所以「框选一段文件路径」也能直接出「打开文件位置」。

顺序是有讲究的：**图片 → 选区**在前面，因为图片经常被包在带 alt 文本的 `<figure>` 里，
文本启发式会把它误判成段落；**代码块 → 超链接 → 文件芯片**在段落之前，
因为段落是兜底分支，任何有意义的标记都该先被更专门的分支吃掉。

### 3. 路径检测为什么这么写

DSH 对工作区内的文件只显示**相对路径**；工具行的 fileLink 按钮更是既没有 `title` 也没有
`data-path`——路径只写在元素的**文本**里。所以检测必须多路：

1. 六个属性：`data-path` / `data-file-path` / `data-filepath` / `data-file` / `title` / `aria-label`
2. `dataset` 里**键名含 `path`** 的任意属性
3. `CODE` / `SPAN` / `A` / `BUTTON` 的文本（`fromText=true` 时判据更严：必须带扩展名，
   避免把「复制/粘贴」这种带斜杠的词或整句话当成路径）

拿到候选后拼当前会话的工作区根（`sessions.list.getSnapshot().current → byId[id].cwd`）还原成
绝对路径。**取不到工作区根就不显示文件操作项**——宁可少一项，绝不猜路径。

「复制相对路径」和「复制本地文件链接」这两项依赖**绝对路径**才能算出来，
所以 `itemsForFile` 里先把相对芯片补全一次：`looksAbsolutePath(rawPath) ? rawPath : joinPath(base, rawPath)`，
补不出来就不给这两项。相对路径的分隔符跟工作区根一致（Windows 上是 `\`），与「复制路径」同风格。

### 3b. 图片路径为什么能直接解出来

DSH 的所有会话媒体（图片、附件）挂在**同一条**认证路由上。宿主文档原文
（`SessionMediaReferences`）：`GET /api/file?path=<absolute path>`，经 `ctx.fs` 读，
「including temporary paths outside registered workspaces」and files in remote providers。
`fileMediaUrl(base, path)` 拼出来的就是 `new URL('api/file?path=' + encodeURIComponent(path), base)`。

所以 `mediaPathOf(img)` 直接 `/[?&]path=([^&#]*)/` 抠参数再 `decodeURIComponent`，
**不用猜、不用扫元素文本**——这和路径检测那边要靠多路启发式形成鲜明对比。
解不出来（远端图 / `data:` URL）→ **隐藏**「打开文件位置 / 用默认应用打开 / 另存为」，
只留不依赖本地路径的项。宁可少一项，绝不误报。

`imageOf` 只认 `IMG` 标签，**不认 `role="img"`**——后者在对话区大量用于装饰性图标，
认了会在一堆图标上弹出图片菜单。向上最多 8 层。

### 4. 共存规则（decision matrix）

延迟决策时按现场分派：

| 现场 | 本插件行为 |
|---|---|
| file-menu 弹了菜单 + 本插件有项 | **接管**：摘掉它的根节点，弹自己的（0.3.0 的菜单是它的超集） |
| file-menu 弹了菜单 + 本插件无项 | 让它的菜单留着 |
| file-menu 没弹 + round-rightclick 遮罩在 | 让行（圆盘的地盘） |
| file-menu 没弹 + 无遮罩 + 本插件有项 | 弹自己的 |
| 都没有 | 什么都不发生 |

0.1.0 时第二行的「本插件无项」实际覆盖了链接 / 文件芯片 / 输入框三大类；0.2.0 起这些都有项了，
第二行只在极端边界（file-menu 认得但本插件认不得的表面）才出现。

⚠️ 0.3.0 之后这条矩阵的前提变了：**本插件先跑 `classify()`，`null` 就直接放行**，
根本走不到共存分派。所以「本插件无项」这一格在 0.3.0 实际只可能来自
「`classify` 判出场景、但那个场景的 `itemsFor*` 拼出来是空数组」这种极窄情况。

接管 file-menu 的菜单是**安全的**，原因：

- 它的菜单项激活走「window 捕获 pointerdown + 自己闭包里的 `menuItems[data-index]`」。
  摘掉 DOM 后，它的 pointerdown 命中测试会落在我的按钮上，`closest('.dsh-fm-item')` 为 null，
  走 miss 分支只调它自己的 `closeMenu()`（对我不起作用），不会误激活它的残留项。
- 它随后吞掉的 mouseup/click 只影响它的矩形窗口；我的激活监听器在同节点（window）捕获，
  照常收到事件。

round-rightclick 不接管：它的遮罩是 React 渲染的，手动摘 DOM 会让 React 对账出错；
而且它的圆盘只覆盖会话表面，冲突面本来就小。

### 5. 原生能力为什么必须挂在宿主

系统剪贴板、资源管理器定位、默认应用打开，渲染进程都做不了（或极不可靠）。走 `webServer`
前缀路由，宿主 `apply(ctx)` 里注册。0.1.0 这块是空的，只能借 file-menu 的路由——
这也是 0.2.0 必须把 `lib/index.js` 长出来的直接原因。

0.3.0 加的两条同理，而且理由更硬：

- **复制图像**必须 `nativeImage.createFromPath(path)` + `clipboard.writeImage(image)`。
  渲染层想走 `navigator.clipboard.write([new ClipboardItem(...)])` 也不行——
  `ClipboardItem` 的 blob 构造要求**同源**，而 `blob:` URL 又被 DSH 的 CSP 挡着。
- **另存为**走 `dialog.showSaveDialog`，**复制而不是移动**：原档必须留在会话里，
  下次翻回这条消息还得看得到图。

`electronApi()` 兼容 `mod.clipboard` 与 `mod.default.clipboard` 两种形状（打包形态不稳定），
非 Electron 环境（或 `ELECTRON_RUN_AS_NODE`）返回 `null` 而不是抛错——调用方据此给明确提示。

`callHost(action, payload)` 的降级链：**自己的 `/agent-menu` → `/file-menu`（老版本兼容）→ 调用方降级**。
这样 0.1.x 与 0.2.x 任意组合都能工作，也方便把 file-menu 卸掉。

### 6. 发消息/写草稿为什么必须轮询

`conversation.input.shell(sessionId).actions.setDraft(text)` 走 Lexical 的**异步**更新，
而 `submit()` 读的是编辑器投影。同一 tick 里连着调，提交上去的还是空草稿。
这是 dsh-suggest-actions 明文记录过的坑：setDraft 后按 25ms 间隔轮询
`shell.state.getSnapshot().draft` 是否等于期望值（上限 12 次），落定后再 submit。

「引用到输入框」同理是全量 `setDraft`：先读当前草稿，追加 `\n\n` + 文本再写回，
避免覆盖用户已输入的内容；写完顺手 `shell.editor.focus()`（失败不影响引用）。

### 7. 服务全部走可选查找，inject 留空

`apply(ctx)` 拿到的是**动态插件守卫门面**：`ctx.sessions` 直接取属性会被拦（未在 `inject`
声明），但 `ctx.get("sessions")` / `ctx.get("conversation")` 是**可选查找**，不声明也能读。
故意不把服务写进 `inject`——写进去会变成硬依赖，服务缺失时整个插件被 park。
本插件在任何服务缺失时只降级：取不到会话/输入框就不出 Agent 项（只剩复制 / 文件 / 链接这类
纯本地操作），取不到工作区根就不出文件操作。

⚠️ 唯一写进 `inject` 的是**宿主半幀**的 `inject = ['webServer']`——那是 node 侧的 cordis 硬依赖，
和客户端这套客户端服务不是一回事。

## 踩坑与已知取舍

1. **Windows explorer 定位必须 `windowsVerbatimArguments: true`**。Node 默认对参数做加引号转义，
   `/select,"<path>"` 被拼成 `"/select,\"<path>\""`，Explorer 的非标准命令行解析会忽略这个开关
   并退回默认文件夹（实测落到「文档」）。即便把开关与路径拆成两个参数，含空格的路径也只打开目录、
   不选中文件。DSH 自带实现用 `['/select,', <file URL>]` 同样落到错误目录。
2. **剪贴板优先 Electron 主进程**：`await import('electron')` 取 `clipboard.writeText`；
   非 Electron 环境（或 `ELECTRON_RUN_AS_NODE`）退回 PowerShell
   `Set-Clipboard`（文本经 base64 传参，避开编码与引号问题）。
3. **监听器去重标记用自己的 key**（`__dshAmSeen` / `__dshAmPd`），不能碰 file-menu 的
   `__dshFmSeen` / `__dshFmPd`——两边 window+document 双注册，共用标记会把对方的处理吞掉。
4. **HMR 幂等**沿用 file-menu 的两层保护：监听表存 `window.__dshAgentMenuListeners`
   （新实例按引用逐个 remove），`window.__dshAgentMenuGeneration` 代际号让残留旧监听器自我禁用。
5. **选区在同步阶段捕获**，不放到延迟决策里读——个别表面会在事件后清选区，晚一拍就读空了。
6. **菜单打开时再右键菜单外部**：延迟决策开头先 `closeMenu()` 再分派，避免旧菜单滞留；
   右键点在菜单自身上则提前 return（菜单保持）。
7. **file-menu 的 180ms pointerup 兜底菜单**（contextmenu 事件被吞时补弹）发生在我的延迟决策
   之后。file-menu 卸载后这个兜底自然消失。
8. **`submit()` 固定走 queue 模式**（官方 actions 入口如此）。会话忙时消息进入队列而不是插话
   （steering）；这与 dsh-suggest-actions 行为一致。
9. **粘贴用 Clipboard API 而非 `execCommand('paste')`**：后者在渲染进程几乎必然被拒（无用户手势）。
   读不到内容时提示用户用 Ctrl+V，不假装成功。
10. **文案集中**在 `lib/client.js` 的 `LANG` 对象里，以后接 `locale` 服务做多语言只改这一处。
11. **输入框里刻意不给 AI 项**。用户还没把这段话发出去，「让 AI 解释这段」此时的语义是空的
    （要么等它发出去，要么是解释别人写的字）。给剪贴板菜单就够了。
    场景 8b 有断言守着这条，改回去会被测试拦住。
12. **`codeBlockOf` 用 `closest("pre")` 而不是 `closest("pre, code")`**：
    命中 `<pre>` 本身和命中它里面的 `<code>` 都要能拿到同一个 pre，否则从代码内部
    `elementFromPoint` 打中的是 `<code>`，会漏掉整支。
13. **测试桩要补 `global.location`**。客户端里 `new URL(src, location.href)` 用的是**裸全局**
    `location`（不是 `window.location`）。Node 环境下不补上，图片菜单里
    「新标签页中打开」「复制图片地址」会被 `try/catch` 静默吞成空串——测试能发现，
    但记住这件事比记 bug 省事。

## 侧边栏：不自己出菜单，改为触发原生那一个

用户要求「左侧工作区，右键交互应该和点击原生展开菜单显示一致」。原生菜单来自官方包
`@deepseek-ai/dsh-client-ui-workspace`，定位方式：在 app.asar 里搜「置顶会话」「分叉会话」，
命中 `dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js`（200124 字节）。
**注意别走弯路**：主前端 bundle `dsh-web-frontend/dist/assets/index-*.js` 里的 5 个
`contextmenu` 全是 React 内部事件系统（`t9="mousedown mouseup …contextmenu…".split(" ")`），
`dsh-client-ui-sidebar/lib/client.js` 则 0 命中——都不是菜单。

它给每一行打 `data-row-key`（工作区 `workspace:<组键>`、会话 `session:<会话 id>`）和
`role="treeitem"`；菜单是 React state 控制的：

```js
const [menuOpen, setMenuOpen] = (0, react.useState)(false);
// …行内按钮：
onClick: () => { setMenuOpen((v) => !v) }
"aria-label": t("actions.session.aria", { name: title })   // 会话"X"的操作
// 渲染：
jsx(primitives.Menu, { open: menuOpen, onClose: …, portal: true, closeOnPointerLeave: true, anchor: … })
```

所以「让右键弹出原生菜单」= **找到那个 ⋮ 按钮、`click()` 它**：

```js
var sidebarRow = sidebarRowOf(target);            // data-row-key 或 role="treeitem"，向上 24 层
if (sidebarRow !== null) {
    var nativeButton = sidebarMenuButton(sidebarRow);   // aria-label 结尾 === "的操作"
    if (nativeButton !== null) { event.preventDefault(); nativeButton.click(); }
    return;                                        // 绝不出本插件菜单
}
```

这么写的好处：置顶（Ctrl+Alt+G）/ 重命名 / 分叉（Ctrl+Alt+F）/ 归档（Ctrl+Shift+A）/ 删除的
红色危险色、图标、快捷键全由官方 React 组件渲染，**一个字都不用抄，官方改版也不漂移**。
代价：菜单位置跟随按钮而不是鼠标。菜单项本身还是 slot 注册的
（`ctx.slots.register({ name: "sidebar.workspaces.session.menu.item", id: "pin", order: 100, … })`），
所以第三方也能往原生菜单里加项——我们只要触发它，那些项也会跟着出来。

四个坑：

1. **分支必须放在 `classify()` 闸门之前**。否则 `classify(context) === null` 先 return 放行，
   侧边栏右键永远走不到这里。自检脚本里专门有一条断言这个顺序。
2. **认行用 `dataset.rowKey` / `role`，不用 class 名**——官方的 class 是 CSS Module 哈希
   （`_9lTDKa_sessionRow`）。
3. **必须掐断传播**。`dsh-session-deck` 0.2.1 在 **document 捕获阶段**也挂了 contextmenu
   监听（`lib/client.js:2187`），命中 `[data-row-key^="workspace:"]` 就 `stop(event)` +
   打开它自己的「项目图标」Emoji 选择器。它只调 `stopPropagation()` 不调
   `stopImmediatePropagation()`，所以**不掐断的话两个都会触发**，它的选择器会盖在原生命盘
   上面——用户看到的就是「右键被别的插件占了」。本插件挂在 window 捕获阶段
   （capture 顺序 window → document），在这里调 `stopImmediatePropagation()` 拦得住。
4. **测试桩要补 `querySelector`**。`sidebarMenuButton` 第一行是
   `if (row === null || row.querySelector === undefined) return null;`，而桩 `makeEl()` 只定义了
   `querySelectorAll`，漏 `querySelector` 会让它**静默走兜底分支**，外层 try/catch 又不报错，
   表现为「按钮明明有却没被点」。给桩补 `rowEl.querySelector = () => null` 才对。

## 不接管的区域（有意为之）

- **灯箱**（点开的图片预览层）。它是官方独立包 `@deepseek-ai/dsh-client-ui-attachment`
  渲染的，DOM 结构会随官方版本变。而且 127.0.0.1:19387 用普通浏览器打开会返回
  `dsh web authentication required`，**没法用 browser-skill 查真实 DOM**，
  只能等本机重启后实测。宁可先不接管。
- **白名单外的一切**（空白区、工具栏、状态栏……）：`classify()` 返回 `null` 就放行，
  不 `preventDefault`。见第 1 节。
- **侧边栏里点不到 ⋮ 按钮时**：不 `preventDefault`，浏览器原生菜单兜底——绝不拦了之后什么都不给。

## 调试

- 客户端加载成功：console 有一条 `[dsh-agent-menu] installed, version x.y.z, generation N`；
  每次热更新 generation 递增。**没有控制台也能查**：
  ```sh
  curl -s http://127.0.0.1:19387/agent-menu/status
  ```
  `stats.hello > 0` 说明客户端已下发并自报过；`menuShown` / `clipboard` / `copyImage` /
  `saveImage` / `reveal` / `open` 是累计动作数；`diag` 里有最近 40 条右键现场记录。
- 菜单没弹：先看 `classify()` 返回了什么——是 `null`（白名单外，放行了）还是某个场景但
  `decide()` 没分派出项。再看 `#dsh-file-menu-root` 是否在（file-menu 抢了）、
  `[data-dsh-rr-layer]` 是否在（圆盘在）。
- 发送没反应：确认 `ctx.get("conversation")` 与 `conversation.input.shell(sessionId)` 都能取到，
  `shell.state.getSnapshot().draft` 是否轮询到位（提交前应有值）。
- 「打开文件位置」落错目录：检查 `revealInFileManager` 的 `windowsVerbatimArguments` 有没有被改掉（见坑 1）。
- 客户端改完**刷新页面**即生效（HMR 会自动推）；宿主半幀改完必须重启 DSH。
  桌面版吞掉 Ctrl+R，只能完全退出重开。
- 冒烟测试：`node tests/smoke.mjs`（**15 个场景**，DOM/服务桩环境，不联网）。
  覆盖：AI 菜单 / 发送链路 / 引用追加 / 代码选区 / file-menu 接管 / 圆盘让行 / 超链接 /
  输入框三态 / 文件芯片（含相对路径内容校验）/ 代码块 / 图片（本地图 vs 远端图）/
  **白名单外不接管** / 无会话降级 / 复制走自己的宿主路由。
