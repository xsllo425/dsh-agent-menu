/**
 * dsh-agent-menu 发布前自检：node scripts/check-manifest.mjs
 *
 * 公共部分（清单字段、exports、files[]、patch 行、双语简介、图标、CHANGELOG、README）在
 * plugin-audit.mjs；这里只写本插件自己的约定：
 *  - 菜单根节点、提示条和复制用的隐藏 textarea 确实挂在 document.body 上，所以不查"不碰 body"，
 *    而是查每个挂上去的节点都有拆掉的路径，并且不走 React portal；
 *  - 三处版本号（清单、宿主、客户端）必须一致；
 *  - README.md 是中文入口（GitHub 和 npm 都渲染它），英文在 README.en.md；市场徽章分中英文两张。
 */
import { openAudit } from "./plugin-audit.mjs";

const REPO = "xsllo425/dsh-agent-menu";
const audit = openAudit(import.meta.url);
const { pkg, expect, text, exists } = audit;

audit.packageBasics({
  name: "dsh-agent-menu",
  extra: [
    [pkg.license === "MIT", "license 应为 MIT"],
    [pkg.icon === "./icon.svg", "icon 应指向 ./icon.svg"],
    [pkg.author === "xsllo425", "author 应为 xsllo425"],
    [pkg.repository?.url === `git+https://github.com/${REPO}.git`, "repository.url 应指向本仓库"],
    [String(pkg.homepage ?? "").includes(REPO), "homepage 应指向本仓库"],
    [String(pkg.bugs?.url ?? "").includes(REPO), "bugs.url 应指向本仓库"],
    [pkg.publishConfig?.registry === "https://registry.npmjs.org/" && pkg.publishConfig?.access === "public", "publishConfig 应发到公共 npm 且 access 为 public"],
    [typeof pkg.scripts?.check === "string" && typeof pkg.scripts?.test === "string", "scripts 里要有 check 和 test"],
  ],
});
audit.exportsResolve();
audit.filesShip(["icon.svg", "NOTICE", "CHANGELOG.md"]);
audit.patchRow("agent-menu");
audit.localeMeta();
audit.iconOk();

// ── 客户端 ───────────────────────────────────────────────────────────────
const client = text("lib/client.js");
expect(client.includes('id: "dsh-agent-menu"'), "client.js 注册的 id 应与包名一致");
expect(client.includes("__ModuleLoader__.load"), "client.js 应通过 __ModuleLoader__.load 注册");
expect(/^\s*factory:\s*\(?require\)?\s*=>/m.test(client), "client.js 的 factory 应接收模块加载器给的 require");

// 只允许经模块加载器拿 react 和 UI 基础组件；宿主的其他包不能直接 require。
for (const [, spec] of client.matchAll(/require\(\s*["'](@deepseek-ai\/[^"']+)["']\s*\)/g)) {
  expect(spec === "@deepseek-ai/dsh-client-ui-primitives", `client.js 不能 require ${spec}`);
}
expect(!/createPortal\s*\(/.test(client), "client.js 不能用 React portal 画东西");

// 挂到 body 上的每个节点都要能拆掉：直接 remove / removeChild，或（菜单根、提示条）按 id 查出来再删。
const mounted = new Set([...client.matchAll(/document\.body\.appendChild\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((m) => m[1]));
expect(mounted.size > 0, "client.js 应自己在 document.body 上挂菜单节点");
const removedDirectly = (name) =>
  new RegExp(`(?:${name}\\.remove\\(\\)|${name}\\.parentNode\\.removeChild\\(|removeChild\\(\\s*${name}\\s*\\))`).test(client);
const removedById = (name, idConst) =>
  new RegExp(`${name}\\.id = ${idConst}`).test(client) &&
  new RegExp(`querySelectorAll\\(\\s*"#" \\+ ${idConst}`).test(client) &&
  /function closeMenu\(\)/.test(client);
for (const name of mounted) {
  const ok = removedDirectly(name) || ((name === "root" || name === "node") && (removedById(name, "MENU_ID") || removedById(name, "TOAST_ID")));
  expect(ok, `client.js 把 ${name} 挂到了 document.body，却找不到拆掉它的地方`);
}
expect(removedById("root", "MENU_ID"), "closeMenu 应按 id 拆掉菜单根节点");
expect(removedDirectly("area"), "复制用的隐藏 textarea 用完要拆掉");

expect(/slots\.inject\(\s*["']sidebar\.workspaces\.session\.menu\.item["']/.test(client), "会话菜单项应通过 slots.inject 注册到官方插槽");
expect(!/["'](?:发送给 ?AI|引用到输入框|让 ?AI ?解释)/.test(client), "client.js 不应再出现已删掉的 AI 菜单项");
expect(client.includes('scenario === "file" && path !== ""'), "文件类菜单项必须有非空路径才出现");

// ── 宿主端 ───────────────────────────────────────────────────────────────
const host = text("lib/index.js");
expect(/export function apply\(/.test(host), "lib/index.js 应导出 apply 函数");
expect(/export const inject = \[[^\]]*["']webServer["']/.test(host), "lib/index.js 应注入 webServer");
expect(!/export default/.test(host), "lib/index.js 不要混用 export default");
expect(!/\brequire\(/.test(host), "lib/index.js 只用 ESM import");

// ── 三处版本号 ───────────────────────────────────────────────────────────
const hostVersion = (/export const version = '([^']+)'/.exec(host) ?? [])[1];
const hostRoute = (/const HOST_VERSION = '([^']+)'/.exec(host) ?? [])[1];
const clientVersion = (/CLIENT_VERSION\s*=\s*"([^"]+)"/.exec(client) ?? [])[1];
for (const [where, value] of [["lib/index.js 的 version", hostVersion], ["lib/index.js 的 HOST_VERSION", hostRoute], ["lib/client.js 的 CLIENT_VERSION", clientVersion]]) {
  expect(value === pkg.version, `${where} 是 ${value ?? "（没写）"}，package.json 是 ${pkg.version}`);
}

// ── 文档 ─────────────────────────────────────────────────────────────────
audit.changelogHead();
const tests = audit.countTests();
audit.readmesHonest({ files: ["README.md", "README.en.md"], tests, repo: REPO });
for (const readme of ["README.md", "README.en.md"]) {
  expect(!/node tests\/[a-z-]+\.mjs/.test(text(readme)), `${readme} 还在写旧的 node tests/xxx.mjs 跑法`);
}

const readmeZh = text("README.md");
const readmeEn = text("README.en.md");
expect(/^## 功能$/m.test(readmeZh) && readmeZh.includes("简体中文"), "README.md 应保持为中文入口");
expect(/\*\*English\*\*/.test(readmeEn), "README.en.md 应是英文页");
expect(!exists("README.zh.md"), "README.zh.md 已停用，中文页就是 README.md");
// 市场徽章分中英文两张；不带语言后缀的 badge-listed.svg 在上游不存在（会 404）。
expect(readmeZh.includes("badge-listed-zh.svg"), "README.md 应使用中文市场徽章 badge-listed-zh.svg");
expect(readmeEn.includes("badge-listed-en.svg"), "README.en.md 应使用英文市场徽章 badge-listed-en.svg");
for (const [name, body] of [["README.md", readmeZh], ["README.en.md", readmeEn]]) {
  expect(!body.includes("badge-listed.svg"), `${name} 引用了不存在的 badge-listed.svg`);
}

audit.finish(`声明测试 ${tests} 项`);
