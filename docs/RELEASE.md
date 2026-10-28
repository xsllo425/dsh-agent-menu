# 发版清单

照着做，每一步都能验证。命令在仓库根目录执行（`E:\Work\dsh-agent-menu`）。

## 1. 先确认代码是绿的

```sh
npm run verify
```

等价的手工命令：

```sh
node --check lib/client.js && node --check lib/index.js
node --test tests/*.test.mjs        # 全绿，条数与 README 写的一致（当前 43）
node scripts/check-manifest.mjs     # 清单 / 导出 / patch 行 / 图标 / 双语文案 / 文档一致性
npm pack --dry-run                  # 看包里有没有 README 引用的文件
```

这几步在 CI 里跑（`.github/workflows/ci.yml`，Node 24，ubuntu + windows 双平台）。

`check-manifest` 会顺带核对那些以前靠人记的事：README 里的测试数、安装命令、README 里出现的图片是否都进了 `files[]`、CHANGELOG 头部版本与 `package.json` 是否一致，以及 `lib/index.js` 与 `lib/client.js` 里的版本号是否都等于清单版本。数字对不上会直接报错，别把手改到它闭嘴，改成真实值。

## 2. 定版本号

- 只改显示、文案、内部实现、发布工程：补丁号（0.7.0 → 0.7.1）
- 加了用户能看见的菜单项或原生动作：次版本号（0.7.x → 0.8.0）
- 改了别人依赖的导出或插槽契约：主版本号，并在 CHANGELOG 写清怎么迁移

## 3. 改四处（版本号有三份，必须一起改）

1. `package.json` 的 `version`
2. `lib/index.js` 的 `export const version` 与 `HOST_VERSION`
3. `lib/client.js` 的 `CLIENT_VERSION`
4. `CHANGELOG.md`：把 `## 未发布` 改成 `## X.Y.Z — YYYY-MM-DD`；README 的测试数若变了也改

三份版本号不一致时 `npm run check` 会报出来，这是 0.7.1 之前真实发生过的问题。

## 4. 提交、推送、等 CI

```sh
git add -A && git commit -m "X.Y.Z：一句话说清这版改了什么"
git push origin main
```

CI 三个 step（语法、测试、清单）都要绿。提交身份必须是 `xsllo425 <66821010+xsllo425@users.noreply.github.com>`，推送前用 `git config --local --get user.email` 核一遍，错了就别推。

## 5. 打 tag

```sh
git tag vX.Y.Z && git push origin vX.Y.Z
```

tag 也会触发一次 CI，等它绿。

## 6. 建 Release

说明先写成文件（放 `docs/RELEASE-vX.Y.Z.md`，并加进 `package.json` 的 `files[]`，或者放仓库外），包含这版改了什么、安装命令（带 tag）、已知限制。

```sh
E:/Work/patch/gh.sh release create vX.Y.Z --title vX.Y.Z --notes-file docs/RELEASE-vX.Y.Z.md --verify-tag
```

`gh.sh` 从 `git credential` 现取 token，不在磁盘留凭据。建完确认 `draft=false`。网络抖动导致的失败要先只读复查（`gh.sh release view`）再重试，避免重复创建。

## 7. 发 npm（插件中心只认 npm 安装）

`package.json` 的 `publishConfig` 已固定成 `https://registry.npmjs.org/` + `access: public`，本机 registry 指到镜像是另一回事，不影响发布。

```sh
npm whoami --registry=https://registry.npmjs.org/   # 没登录先登录（浏览器授权一次即可）
npm publish
```

- 登录的是 npm 官方站，不是国内镜像（镜像那条链只能读、发不了包）。
- 包名一旦发布就永久占用；同一个版本号不能重发，发错了只能 `npm deprecate`。
- 发完核对：`npm view dsh-agent-menu version`。
- **发 npm 属于对外发布动作，需要用户明确同意后再做。**

## 8. 市场索引（不用手动更新，等一天）

市场是拉的模式：GitHub topic 扫描 + npm 版本查询。发版只需要「README 在 main 上 + npm 已发」。

- 收录 issue（`2BingLing/dsh-market` #294）是一次性入口，之后与日常更新无关。
- issue 正文只影响作者自述、中文简介、安装命令；改版本号、测试数写进正文没有作用。
- **安装命令必须放在 `sh` 或 `bash` 代码块里**（或以 `$` 开头的行），表格里的命令不会被解析。
- 本仓库 README 的安装命令现在写作 `dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu`，放在 `sh` 代码块内，符合要求。

## 9. 本机实际看一眼

插件通过软链接或 `file:` 装进 profile。改动客户端代码后刷新页面即可；改动 `lib/index.js`（宿主半帧）必须重启 DSH。

**重启 DSH 属于会影响用户当前会话的操作，未获明确同意时不要自行重启，也不要启停插件。** 声明界面验收通过前，必须真的在浏览器里看过；本机 `dsh web` 需要访问令牌，通用浏览器只得到 `dsh web authentication required` 时，如实写成「未完成界面验收」。

## 10. 仓库元数据（偶尔核对）

- `package.json`：`author: xsllo425`、`repository`（git+https://github.com/xsllo425/dsh-agent-menu.git）、`homepage`、`bugs`、`keywords`、`license: MIT`、`publishConfig`、`engines.dsh`
- `LICENSE`（MIT）与 `NOTICE`（源自 dsh-status-rotator 0.35.0 的词库）都在，且都在 `files[]` 里
- `icon.svg` 在根目录，`package.json.icon` 与 `exports["./icon"]` 都指向它
- GitHub topics：`dsh-plugin`、`deepseek-harness`、`dsh`、`plugin`、`context-menu`
- 三种装法（npm / GitHub / 本地目录或 tarball）都还能用

## 记录

发完在 CHANGELOG 顶部留日期段；这次踩到的坑补进本文。
