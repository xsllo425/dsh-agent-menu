# v0.8.0 — 只做右键菜单

这一版移除了等待状态短句功能，右键菜单的行为不变。

## 为什么

- 右键菜单插件不该兼管状态行的文字，"agent 正在干什么"由 dsh-work-status 负责。
- 内置的 1210 句文案原样取自 dsh-status-rotator 0.35.0，其中还有其他项目的推广句和一批 GitHub 用户名。本插件只发布自己写的东西，所以整块移除。

## 改了什么

- 删掉状态行文案的客户端代码、宿主路由 `/agent-menu/status-phrases`、`lib/status-phrases.json` 和 8 项相关测试。
- 从旧版热重载时，会清掉旧版留在状态行上的节点，恢复宿主原文。
- `NOTICE` 改为声明不含第三方代码、文案和素材。

## 安装

```bash
dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu#v0.8.0
```

## 验证

- `npm run verify`：语法检查、35 项测试、清单自检。
- 已知限制：真实 DSH 页面的浏览器验收另行记录，见 CHANGELOG。
