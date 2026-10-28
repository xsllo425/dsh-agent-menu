# v0.8.1 — 修正 NOTICE 的说法

插件行为与 0.8.0 相同，右键菜单没有任何变化。

## 为什么发这一版

0.8.0 的 NOTICE 写"不含任何第三方代码"，但发布前自检脚本 `scripts/check-manifest.mjs` 里还带着 dsh-agent-activity 0.9.0 的代码（它是当初照着 dsh-work-status 的脚本写的）。这句话因此不准确。本版把自检脚本整个重写，NOTICE 才名副其实。

## 改了什么

- 新的 `scripts/plugin-audit.mjs`：发布前自检的公共工具，与 dsh-work-status 共用同一份；`scripts/check-manifest.mjs` 只写本插件自己的检查项。
- 自检输出改成中文，不通过时逐项列出问题。
- README 加了致谢，列出参与过的 AI 助手。

## 安装

```bash
dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu#v0.8.1
```

## 验证

- `npm run verify`：语法检查、35 项测试、新的自检脚本全部通过。
- 插件运行代码只改了版本号，没有在 DSH 界面里重新验收。
