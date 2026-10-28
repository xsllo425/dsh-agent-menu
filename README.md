# dsh-agent-menu

**简体中文** · [English](./README.en.md)

> 右键只给该有的那几项：复制、打开位置、用默认应用打开。

[![ci](https://github.com/xsllo425/dsh-agent-menu/actions/workflows/ci.yml/badge.svg)](https://github.com/xsllo425/dsh-agent-menu/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4d6bfe.svg)](https://github.com/topics/dsh-plugin)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供精简、克制的右键菜单。菜单只做复制、文件与系统操作，不插入 AI 提示词、不发送消息。

## 功能

| 右键位置 | 菜单项 |
| --- | --- |
| 对话中的选中文字 | 复制；若点中链接或文件，再显示对应操作 |
| 超链接 | 复制链接地址 / 复制为 Markdown 链接 / 在浏览器中打开 |
| 文件路径 | 复制路径 / 打开文件位置 / 用默认应用打开 |
| 代码块（未选中文字） | 复制代码 |
| 对话图片 | 复制图像 / 另存为…；本地图片另有打开位置、默认应用打开 |
| 输入框 | 剪切、复制、粘贴、撤销、重做、全选（按是否有选区显示） |
| 输入框图片 | 图片操作，以及从输入框移除 |
| 工作区行 | 保留原生重命名、删除；新建会话插在最上，复制目录、打开位置插在删除之前（删除工作区沉底） |
| 会话行 | 保留原生置顶、重命名、分叉、归档、复制会话 ID（就地汉化）；追加复制目录、打开位置、删除会话 |
| 其他位置 | 放行系统原生菜单 |

- **工作区目录**来自官方 `workspaces.list` 快照；**会话目录**来自对应会话的 `cwd`，不会猜测路径。
- **删除会话**由本插件宿主路由 `POST /agent-menu/session-delete` 实现：删除 `~/.dsh/sessions` 下该会话的日志目录并清除归档标记。DSH 没有公开的会话删除接口，这是插件侧的等价做法；正在本应用打开的会话会被拒绝（409），等会话关闭或重启后再删。工作区删除仍使用官方对话框，会话会移到未分组。
- 工作区「新建会话」调用同一行已有的原生按钮；会话目录操作注册到官方 `sidebar.workspaces.session.menu.item` 插槽，若该插槽在当前环境不渲染插件项，右键会话行时会就地 DOM 兜底追加「删除会话」并汉化复制项（两条路径不叠加）。工作区原生菜单目前没有对应插槽，追加项仅在确认是工作区原生菜单时出现。
- 相对文件路径必须能取得当前会话目录才会显示文件操作。图片的 `blob:` / `data:` 地址通过宿主字节路由复制或另存，不伪造本地路径。
- 菜单使用宿主主题色，卡片圆角 12px、菜单项圆角 6px，无图标、弱分隔线与轻阴影。工作区和会话的原生菜单保留 DSH 自身样式。

## 安装与更新

```bash
dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu
```

从本地目录或 tarball 安装：`dsh plugin --profile desktop add <本目录或 tarball 路径>`。请替换为实际使用的 profile。安装或宿主代码更新后需要重启 DSH；不要仅为刷新客户端而反复重启。

## 与其他右键插件共存

- **dsh-file-menu**：本插件有对应菜单项时接管其已打开的菜单；没有菜单项时保留对方的菜单。
- **dsh-round-rightclick**：圆盘遮罩存在时让行。
- **dsh-session-deck**：侧栏右键在 window 捕获阶段阻止后续抢占，再触发原生按钮。
- 在判定菜单项和调用 `preventDefault()` 时发生异常，均放行原生菜单，避免出现「右键无反应」。

## 维护与验证

```bash
node --test tests/*.test.mjs          # 42 项，无任何依赖
node scripts/check-manifest.mjs       # 清单、导出、图标、文档一致性
```

`npm run verify` 一次跑完语法检查、全部测试和清单自检。

这些测试覆盖 DOM/服务桩、原生插槽注册和宿主路由；`tests/image-bytes.test.mjs` 会实际写入并读取系统剪贴板（仅 Windows，其他平台跳过）。它们不能代替真实 DSH 界面的浏览器验收。开发与边界记录见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。发版流程见 [docs/RELEASE.md](docs/RELEASE.md)。

## 致谢

这个插件是在多个 AI 助手的协助下写成的。名单按本机会话记录整理（DSH、Claude Code、Codex 的会话里，实际改过本仓库文件的模型），按参与先后与多少排列：

- GLM（0.1.0 初版）
- MiniMax M3.1 Flash Preview
- StepFun Step-5 Preview
- Claude Sonnet 5.5
- Gemini 3.8 Flash
- DeepSeek V4.1 Flash
- Claude Opus 5.5
- DeepSeek Flash
- SCNet-Max
- Kimi K3.1 Pro

## 许可

MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
