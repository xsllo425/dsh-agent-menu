/**
 * Pre-install self-check for this bundle.
 *
 * Verifies what the install and the Plugin Manager will actually read: the
 * manifest and its export map, the patch row, the translatable display
 * metadata, the icon's format/size, the browser artifact's registration id and
 * the host half's exports. It also keeps the docs honest: README's test count
 * and install command, and CHANGELOG's version head against package.json.
 *
 * Run with `node scripts/check-manifest.mjs` from the package root.
 *
 * Differences from dsh-work-status's checker, on purpose:
 *  - This plugin legitimately attaches its own menu root, toast node and a
 *    hidden textarea to document.body, so the "no document.body" assertion
 *    would be false. What actually matters here is narrower and is checked
 *    instead: nothing is rendered through a React portal, and every node the
 *    client adds to body is one it created and can remove again.
 *  - Test declarations are counted as `test(` at the start of a line. The
 *    suites here declare every case explicitly (no test-generating helpers),
 *    so this equals the count `node --test` reports.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));
const readText = (relative) => readFileSync(join(root, relative), "utf8");

const manifest = readJson("package.json");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

/* ---------------------------------------------------------------- manifest */

check(manifest.name === "dsh-agent-menu", "name must be dsh-agent-menu");
check(/^\d+\.\d+\.\d+/.test(manifest.version), "version must be semver");
check(manifest.type === "module", "type must be module");
check(manifest.license === "MIT", "license must be MIT");
check(manifest.dsh?.bundle?.patch === "./cordis.patch.yml", "dsh.bundle.patch must point at cordis.patch.yml");
check(manifest.dsh?.client?.platform === "web", "dsh.client.platform must be web");
check(Array.isArray(manifest.dsh?.client?.inject), "dsh.client.inject must be an array");
check(typeof manifest.icon === "string" && manifest.icon === "./icon.svg", "icon must point at ./icon.svg");
check(manifest.author === "xsllo425", "author must be xsllo425");
check(
  manifest.repository?.url === "git+https://github.com/xsllo425/dsh-agent-menu.git",
  "repository.url must point at the canonical repository",
);
check(typeof manifest.homepage === "string" && manifest.homepage.includes("xsllo425/dsh-agent-menu"), "homepage must point at the repository");
check(typeof manifest.bugs?.url === "string" && manifest.bugs.url.includes("xsllo425/dsh-agent-menu"), "bugs.url must point at the repository");
check(manifest.publishConfig?.registry === "https://registry.npmjs.org/", "publishConfig.registry must be the public npm registry");
check(manifest.publishConfig?.access === "public", "publishConfig.access must be public");
check(typeof manifest.scripts?.check === "string", "scripts.check must exist");
check(typeof manifest.scripts?.test === "string", "scripts.test must exist");

/* ----------------------------------------------------------------- exports */

for (const [key, target] of Object.entries(manifest.exports ?? {})) {
  check(typeof target === "string", `export ${key} must map to a single file`);
  if (typeof target !== "string") continue;
  if (key.includes("*")) {
    check(existsSync(join(root, target.replace("*", "en"))), `export ${key} does not resolve`);
    continue;
  }
  check(existsSync(join(root, target)), `export ${key} -> ${target} does not exist`);
}

/* ------------------------------------------------------------------- files */

for (const entry of manifest.files ?? []) {
  if (entry.startsWith("!")) continue;
  if (entry.includes("*")) {
    const directory = dirname(entry);
    const base = entry.slice(entry.lastIndexOf("/") + 1);
    const pattern = new RegExp("^" + base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
    const present = existsSync(join(root, directory)) && readdirSync(join(root, directory)).some((name) => pattern.test(name));
    check(present, `files entry ${entry} has no match`);
    continue;
  }
  check(existsSync(join(root, entry)), `files entry ${entry} does not exist`);
}

for (const required of ["icon.svg", "NOTICE", "CHANGELOG.md"]) {
  check((manifest.files ?? []).includes(required), `files[] must ship ${required}`);
}

/* ------------------------------------------------------------------- patch */

const patch = readText("cordis.patch.yml");
check(patch.includes("- id: agent-menu"), "patch must insert the agent-menu row");
check(patch.includes("name: dsh-agent-menu"), "patch row must name the package");

/* ----------------------------------------------------------------- locales */

for (const locale of ["en", "zh"]) {
  const dictionary = readJson(`locale/${locale}.json`);
  check(typeof dictionary.meta?.title === "string" && dictionary.meta.title.length > 0, `locale/${locale}.json meta.title missing`);
  check(
    typeof dictionary.meta?.description === "string" && dictionary.meta.description.length > 20,
    `locale/${locale}.json meta.description missing`,
  );
}

/* -------------------------------------------------------------------- icon */

const iconPath = join(root, "icon.svg");
check(existsSync(iconPath), "icon.svg is missing");
if (existsSync(iconPath)) {
  const icon = readFileSync(iconPath);
  const size = statSync(iconPath).size;
  const text = icon.toString("utf8");
  check(size <= 256 * 1024, `icon is ${size} bytes, over the 256 KiB limit`);
  check(text.trimStart().startsWith("<svg") || text.includes("<svg"), "icon.svg does not contain an <svg> element");
  check(!/<image|<script|href="(?:https?:)?\/\//i.test(text), "icon.svg must not embed raster images, scripts or remote URLs");
}

/* ------------------------------------------------------------------ client */

const client = readText("lib/client.js");
check(client.includes('id: "dsh-agent-menu"'), "client.js must register the factory under the package name");
check(client.includes("__ModuleLoader__.load"), "client.js must use the module loader");
check(/^\s*factory:\s*\(?require\)?\s*=>/m.test(client), "client.js factory must receive the module loader's require");
check(/CLIENT_VERSION\s*=\s*"\d+\.\d+\.\d+"/.test(client), "client.js must declare CLIENT_VERSION");

// Host packages may not be imported here; only `react` and the UI primitives
// may come through the module loader (see app.asar's loader documentation).
const hostRequires = [...client.matchAll(/require\(\s*["'](@deepseek-ai\/[^"']+)["']\s*\)/g)].map((match) => match[1]);
const allowedRequires = new Set(["@deepseek-ai/dsh-client-ui-primitives"]);
for (const specifier of hostRequires) {
  check(allowedRequires.has(specifier), `client.js must not require ${specifier}`);
}

// No React portals: everything the client draws is a DOM subtree it owns.
check(!/createPortal\s*\(/.test(client), "client.js must not render through a React portal");

// It does append to document.body (menu root, toast, offscreen textarea), so
// instead assert that each appended node has a real removal path.
const bodySites = [...client.matchAll(/document\.body\.appendChild\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((match) => match[1]);
const appended = new Set(bodySites);
check(appended.size > 0, "client.js is expected to mount its own nodes on document.body");
const removesDirectly = (variable) =>
  new RegExp(`${variable}\\.parentNode\\.removeChild\\(`).test(client) ||
  new RegExp(`removeChild\\(\\s*${variable}\\s*\\)`).test(client) ||
  new RegExp(`${variable}\\.remove\\(\\)`).test(client);
const removedByQuery = (variable, idConstant) =>
  new RegExp(`${variable}\\.id = ${idConstant}`).test(client) &&
  new RegExp(`querySelectorAll\\(\\s*"#" \\+ ${idConstant}`).test(client) &&
  /function closeMenu\(\)/.test(client);
for (const variable of appended) {
  const byId = /^node$|^root$/.test(variable);
  check(
    removesDirectly(variable) || (byId && (removedByQuery(variable, "MENU_ID") || removedByQuery(variable, "TOAST_ID"))),
    `client.js appends ${variable} to document.body without a matching removal`,
  );
}
check(removedByQuery("root", "MENU_ID"), "closeMenu must remove the menu root by id");
check(removesDirectly("area"), "the offscreen clipboard textarea must be detached again after copying");

check(
  client.includes("sidebar.workspaces.session.menu.item"),
  "client.js must target the official session-menu slot",
);
check(/slots\.inject\(\s*["']sidebar\.workspaces\.session\.menu\.item["']/.test(client), "client.js must register the session slot via slots.inject");
check(!/["'](?:发送给 ?AI|引用到输入框|让 ?AI ?解释)/.test(client), "client.js must not reintroduce AI prompt actions");
check(client.includes('scenario === "file" && path !== ""'), "file actions must require a non-empty path");

/* -------------------------------------------------------------------- host */

const host = readText("lib/index.js");
check(/export function apply\(/.test(host), "host half must export an apply function");
check(/export const inject = \[[^\]]*["']webServer["']/.test(host), "host half must inject webServer");
check(!/export default/.test(host), "host half must not mix export forms");
check(!/require\(/.test(host), "host half must use ESM imports only");
check(/export const version = '(\d+\.\d+\.\d+)'/.test(host), "host half must declare its version");

const hostVersion = host.match(/export const version = '(\d+\.\d+\.\d+)'/)[1];
const clientVersion = client.match(/CLIENT_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)[1];
check(hostVersion === manifest.version, `host version ${hostVersion} does not match package version ${manifest.version}`);
check(clientVersion === manifest.version, `client version ${clientVersion} does not match package version ${manifest.version}`);

/* -------------------------------------------------------------------- docs */

const changelog = readText("CHANGELOG.md");
const head = (changelog.split("\n").find((line) => line.startsWith("## ")) ?? "").trim();
if (!head.startsWith("## 未发布")) {
  const released = head.split(/\s+/)[1];
  check(released === manifest.version, `CHANGELOG head "${head}" does not match package version ${manifest.version}`);
}

const declaredTests = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .reduce((sum, name) => sum + (readText(join("tests", name)).match(/^test\(/gm) ?? []).length, 0);

const covers = (target) =>
  (manifest.files ?? []).some((entry) => {
    if (entry.startsWith("!")) return false;
    if (!entry.includes("*")) return entry === target;
    const pattern = new RegExp(
      "^" + entry.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*/g, "[^/]*") + "$",
    );
    return pattern.test(target);
  });

for (const readme of ["README.md", "README.zh.md"]) {
  const text = readText(readme);
  const stated = text.match(/#\s*(\d+)\s*(?:项，无任何依赖|tests, no dependencies)/);
  check(stated !== null, `${readme} must state the dependency-free test count next to the test command`);
  if (stated) check(Number(stated[1]) === declaredTests, `${readme} says ${stated[1]} tests but ${declaredTests} are declared in tests/`);
  check(
    text.includes("dsh plugin --profile") && text.includes("github:xsllo425/dsh-agent-menu"),
    `${readme} lost the install command`,
  );
  check(!/node tests\/[a-z-]+\.mjs/.test(text), `${readme} still documents the retired counter-style test scripts`);
  for (const match of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].replace(/^\.\//, "");
    if (/^(?:https?:|data:|\/)/.test(target)) continue;
    check(existsSync(join(root, target)), `${readme} shows ${target}, which does not exist`);
    check(covers(target), `${readme} shows ${target}, which package.json files[] does not ship`);
  }
}

if (failures.length > 0) {
  console.error(`manifest check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`manifest check passed (${declaredTests} tests declared)`);
assert.ok(declaredTests > 0);
