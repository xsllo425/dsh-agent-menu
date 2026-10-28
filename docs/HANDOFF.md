# 交接说明（dsh-agent-menu 改版）

> 面向下一位接手者（人或 AI）。读完这份即可开工，不依赖任何历史会话。
> 最近更新：2026-10-28

## 这个项目是什么

DSH（DeepSeek Harness）桌面/Web 端的右键菜单插件，**自行开发**（0.1.0 由 GLM 在本机生成，0.2.0–0.6.0 本机迭代），不是 npm 第三方包。计划开源到 GitHub `xsllo425/dsh-agent-menu`（Git 作者用 oxygenforce + noreply 邮箱）。

- 仓库：`E:\Work\dsh-agent-menu`（git main，基线 tag v0.6.0）
- 加载方式：profile `package.json` 里 `"dsh-agent-menu": "link:E:/Work/dsh-agent-menu"`，`node_modules/dsh-agent-menu` 是指向本仓库的 junction。**改这里 = 改线上加载的那份，没有第二份副本**。
- 旧目录 `C:\Users\17416\.dsh\plugins\dsh-agent-menu` 是迁移前的完整副本，留作备份，确认稳定后可删。

## 当前版本与行为（0.6.0）

**注意 README 顶部**：0.5.0 做过一次「本地精简」，现在实际行为与 README 正文的功能表不一致——以代码 `lib/client.js` 为准，不要以 README 功能表为准。发布前必须重写 README。

实际现状（以代码和 PATCH-NOTES 为准）：
- 只在对话消息（`[data-chat-turn]`）和输入框里接管右键，白名单外一律放行原生菜单。
- 菜单项生成是**同步**的 `buildItems(context)`：先算项、有项才 `preventDefault()`，修掉了「右键点图片没反应」那类吞菜单 bug。
- 左侧工作区/会话树**不出自己的菜单**，而是找到该行的 ⋮ 按钮 `click()` 触发 DSH 原生菜单（图标/快捷键/危险色全由官方渲染，不漂移）。
- 附带一个「等待状态行轮换短语」功能（`lib/status-phrases.json`），与右键无关，是从 dsh-status-rotator 收编来的。

## 现在的任务：仿 Claude 风格大改版 + 发布

用户的设计意图：**以仿 Claude Code 的右键菜单为主轴**，重设计后发布。

### 已完成的调研

`docs/CLAUDE-RIGHTCLICK-REFERENCE.md` —— 四平台实机截图梳理，24 种场景 + 对比表：
- Claude Code 12 种（对话区 6 / 输入框 3 / 侧栏 3）
- Codex 10 种、MiniMax Code 2 种、WorkBuddy 2 种

**Claude 风格的核心特征（改版要对齐的）**：
1. 菜单按右键目标类型动态组合（普通消息/选区/代码块/图片/文件路径/链接各不相同）。
2. 浅色圆角卡片、细分隔线分组、**纯文字无图标**。
3. 快捷键右对齐灰色：对话区 Ctrl 组合，侧栏单字母（P/U/R/F/A/D），子菜单数字键。
4. 危险/次级操作带灰色说明小字（如「从此处分叉」下的「开始新会话，保留当前会话」）。
5. 子菜单行尾 `›` 悬停展开，可有灰色分组标题。
6. 消息级操作：复制消息 / 复制为 Markdown / 附加为上下文 / 标记为章节 / 从此处分叉 / 回退到此处。
7. 选区还有独立的「回复 Claude」浮条 + 摘录卡片交互（可作为二期）。

### 尚未定案的设计问题（需要和用户对齐或自行提案）

- DSH 是否要有「标记为章节」「回退到此处」？Claude 有，DSH 宿主能力待查（fork 有 dsh-peer-sessions / 原生分叉，rewind 有 dsh-rewind-plugin）。
- 图标：Claude 无图标，其他三家有。跟主轴 = 无图标，但可考虑可选开关。
- 现有「引用到输入框 / 发送给 AI / 解释/翻译/总结模板」在 Claude 里没有对应物，是保留（作为 Agent 特色）还是精简？0.5.0 精简版已删过一轮，README 说删了但代码里 `itemsForSelection` 等仍在——需先核实代码现状再定。
- 等待短语功能与右键无关，发布时是否拆出去或默认关闭？

## 代码地图

| 文件 | 作用 |
|---|---|
| `lib/client.js`（~88KB） | 客户端：捕获阶段 `contextmenu` → `classify()` 分类 → `buildItems()` 同步算项 → `decide()` 延迟分派 → 纯 DOM `showMenu()`。文案集中在 `LANG` 对象。菜单样式在文件顶部 CSS 字符串（`MENU_ID = "dsh-agent-menu-root"`）。 |
| `lib/index.js`（~30KB） | 宿主：`/agent-menu` 路由，系统剪贴板/复制图像/另存为/资源管理器定位/默认应用打开 + `ping`/`status`/`diag` 诊断。 |
| `lib/status-phrases.json` | 等待短语词库（与右键无关）。 |
| `cordis.patch.yml` | bundle 补丁。 |

关键函数位置（行号会漂移，用函数名搜）：`classify` / `buildItems` / `decide` / `onContextMenu` / `itemsForSelection` / `itemsForFile` / `itemsForLink` / `itemsForImage` / `itemsForCodeBlock` / `itemsForComposerEmpty` / `itemsForComposerSelection` / `showMenu` / `sidebarRowOf` / `sidebarMenuButton`。

## 必须遵守的项目约束

- **共存**：dsh-file-menu（可接管）、dsh-round-rightclick（让行）、dsh-session-deck（侧栏需 `stopImmediatePropagation` 掐断，否则它的 Emoji 选择器会抢）。详见 DEVELOPMENT.md 的决策矩阵。
- **不吞原生菜单**：`classify` 返回 null 或算项失败 → 不 `preventDefault`。有回归测试 `tests/rightclick-native.mjs` 锁这条契约。
- **侧栏走原生**：不自己复刻，触发 ⋮ 按钮。分支必须在 `classify` 闸门之前。
- **路径绝不猜**：取不到工作区根就不出文件操作项；图片路径只从 `/api/file?path=` 解，blob:/data: 解不出就隐藏本地操作。
- **输入框不给 AI 项**（有测试断言守着）。
- **setDraft 后轮询**再 submit，否则发空草稿。
- 客户端改完刷新页面生效；宿主 `lib/index.js` 改完必须重启 DSH（不要自己杀 DSH 进程，让用户用重启按钮）。
- **任何插件改动都要记日志**：用 plugin-manager 脚本 `note 改动 dsh-agent-menu "<说明>"`（写进 `~/.dsh/plugin-changelog.md`，不写进别的记忆文件）。
- 改配置/清单前备份。本仓库内改动直接 git commit 即可（git 历史就是备份）。

## 验证

```sh
node --check lib/client.js
node tests/scope.mjs
node tests/rightclick-native.mjs   # 7 场景，锁原生菜单放行契约
node tests/status-phrases.mjs
node tests/image-bytes.mjs
# tests/smoke.mjs 已知失败：测的是 0.4.x 旧行为，0.5.0 之前就坏了，不是回归。
# 改版时应该重写 smoke 或替换为新的场景测试，别拿它当通过标准。
```

运行时诊断：`curl -s http://127.0.0.1:<端口>/agent-menu/status`（端口以当前 GUI 为准），`stats.hello > 0` 说明客户端已加载，`diag` 有最近 40 条右键现场。

## 发布前待办

1. 对齐设计（上面「尚未定案」清单）→ 写一份改版设计稿。
2. 重写菜单结构与样式（Claude 风：分组/快捷键/说明文字/子菜单 ›）。
3. 重写 README / README.zh（当前与代码不符），更新 package.json 的 description 和 dshLocal。
4. 修复/替换过期的 smoke.mjs，补新场景的测试。
5. 决定等待短语功能去留。
6. git 提交 → 打 tag → 推 GitHub `xsllo425/dsh-agent-menu`（作者 oxygenforce）。

## 参考文档索引

- `docs/CLAUDE-RIGHTCLICK-REFERENCE.md` — 四平台右键菜单实机梳理（设计基准）
- `docs/DEVELOPMENT.md` — 架构决策、共存矩阵、踩坑记录（改代码前必读）
- `PATCH-NOTES.md` — 逐版本变更史（0.1.0 初版快照在 `E:\DSH\am-v010-snapshot`）
