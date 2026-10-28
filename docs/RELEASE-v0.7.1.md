# v0.7.1 — 发布工程对齐

这一版不改菜单行为，只把发布工程补到与 dsh-work-status 同等标准，并修掉两个真实的不一致。

## 修了什么

- **版本号三处不一致**：`lib/index.js` 的 `version` 与 `HOST_VERSION` 还停在 0.6.0，而清单与客户端已是 0.7.0。宿主路由 `/agent-menu/status` 会报错版本。现已统一，并由清单自检锁死三者相等。
- **`dshLocal.files` 指向已不存在的 `tests/scope.mjs`**：改为当前六个测试文件。

## 补了什么

- `CHANGELOG.md`、`NOTICE`、`icon.svg`（插件页现在能读到图标；词库派生自 dsh-status-rotator 0.35.0，MIT）。
- `scripts/check-manifest.mjs`：安装前自检，覆盖清单字段、导出可解析、`files[]` 存在、patch 行、双语元数据、图标格式与体积、客户端注册 id 与模块加载器用法、宿主侧导出，并核对 README 测试数 / 安装命令与 CHANGELOG 版本头。
- `.github/workflows/ci.yml`：Node 24，Ubuntu + Windows，三关（语法、43 项测试、清单自检）。
- `docs/RELEASE.md`：发版清单。
- 测试从手写计数器迁移到 `node --test`，共 43 项。
- `package.json` 补齐 `author`/`repository`/`homepage`/`bugs`/`publishConfig`/`engines.dsh`/`scripts`，`exports` 增加 `./icon`。

## 安装

```bash
dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu#v0.7.1
```

## 已知限制

- 真实 DSH 页面的浏览器验收仍未完成：本机 `dsh web` 需要访问令牌，通用浏览器只得到 `dsh web authentication required`。上文所有验证均为离线桩测试与宿主路由测试。
- 未发布到 npm。
