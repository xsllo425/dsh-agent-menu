// 状态行随机文案（0.4.0 自 dsh-status-rotator 提取）测试：node tests/status-phrases.mjs
// 覆盖：词库包过滤与回退、洗牌袋不重复、阶段/时长解析、宿主路由合并、
// 以及用最小 DOM 桩跑一遍「接管运行行 → 换文案 → 整行移除后还原」。
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = resolve(here, '../lib/client.js')
const hostPath = resolve(here, '../lib/index.js')
const lib = JSON.parse(readFileSync(resolve(here, '../lib/status-phrases.json'), 'utf8'))

let pass = 0
let fail = 0
function ok(cond, name) {
  if (cond) { pass += 1; console.log('  ✓ ' + name) } else { fail += 1; console.log('  ✗ ' + name) }
}

// ── 最小 DOM 桩 ──────────────────────────────────────────────
class El {
  constructor(tag) {
    this.tagName = tag; this.className = ''; this._text = ''; this.children = []; this.parentNode = null
    this.attrs = {}; this.style = {}; this.dataset = {}; this.dataset.plugin = ''
  }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.body }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text }
  set textContent(v) { this.children = []; this._text = String(v) }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c }
  insertBefore(c, ref) {
    c.parentNode = this
    const i = ref ? this.children.indexOf(ref) : -1
    if (i === -1) this.children.push(c); else this.children.splice(i, 0, c)
    return c
  }
  get nextSibling() { const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] ?? null }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null } }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return this.attrs[k] ?? null }
  removeAttribute(k) { delete this.attrs[k] }
  querySelector(sel) {
    const want = sel.includes('runningText') ? (n) => String(n.className).includes('runningText') : () => false
    const walk = (n) => { for (const c of n.children) { if (want(c)) return c; const r = walk(c); if (r) return r } return null }
    return walk(this)
  }
}
const doc = {
  body: new El('body'), head: new El('head'), documentElement: { lang: 'zh-CN' },
  createElement: (t) => new El(t),
  getElementById: () => null, addEventListener() {}, removeEventListener() {},
  querySelectorAll: (sel) => {
    const out = []
    const walk = (n) => { for (const c of n.children) { if (c.attrs['data-chat-running'] !== undefined) out.push(c); walk(c) } }
    if (sel === '[data-chat-running]') walk(doc.body)
    return out
  },
}
doc.body.parentNode = null

let intervalCb = null
let moCb = null
let loaded = null
const fakeWindow = {
  __ModuleLoader__: { load(m) { loaded = m } },
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout,
  setInterval: (cb) => { intervalCb = cb; return 1 }, clearInterval: () => { intervalCb = null },
  location: { href: 'http://localhost/' }, innerWidth: 1920, innerHeight: 1080,
  getSelection: () => ({ toString: () => '' }),
}
let fetched = []
const sandbox = {
  window: fakeWindow, document: doc, console: { debug() {}, warn: (...a) => console.log('WARN', ...a), log() {} },
  navigator: { language: 'zh-CN' }, Date, Math, Map, Set, JSON, Object, Array, String, Number, Promise, setTimeout, clearTimeout,
  MutationObserver: class { constructor(cb) { moCb = cb } observe() {} disconnect() { moCb = null } },
  fetch: (url) => { fetched.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, library: lib }) }) },
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(clientPath, 'utf8'), sandbox, { filename: 'client.js' })
const exp = loaded.factory(() => ({}))
const T = exp.__statusPhrases

console.log('■ 词库与纯逻辑')
ok(lib.packs.length === 14, '内置 14 个词库包')
ok(lib.enabledPacks.length === 10 && !lib.enabledPacks.includes('ads') && !lib.enabledPacks.includes('community'), '默认启用 10 个，广告/社区/求star/星标者路由关闭')
const bank = T.buildPhraseBank(lib, 'zh')
ok(bank.thinking.length > 100 && bank.running.length > 50 && bank.long.length > 10, `zh 词库三阶段都有句子（${bank.thinking.length}/${bank.running.length}/${bank.long.length}）`)
ok(!JSON.stringify(bank).includes('{tps}') && !JSON.stringify(bank).includes('{model}'), '不含需要实时引擎的占位符')
const noAds = T.buildPhraseBank({ ...lib, enabledPacks: ['ads'] }, 'zh')
ok(noAds.running.length === 3 && noAds.thinking.length === 0, '只启用广告包时按包过滤')
ok(T.pickGroup({ thinking: [], running: [{}], long: [] }, 'long') === 'running', 'long 缺组回退到 running')
ok(T.pickGroup({ thinking: [{}], running: [], long: [] }, 'running') === 'thinking', 'running 缺组回退到 thinking')
ok(T.pickGroup({ thinking: [], running: [], long: [] }, 'thinking') === null, '全空返回 null（保持宿主原文）')
ok(T.phraseFor(0, lib) === 'thinking' && T.phraseFor(15000, lib) === 'running' && T.phraseFor(60000, lib) === 'long', '阶段阈值 0/15s/60s')
ok(T.parseHostElapsed('Deep diving for 1m 02s') === 62000, '读宿主时长：1m 02s')
ok(T.parseHostElapsed('深度求索 1分02秒') === 62000, '读宿主时长：1分02秒')
ok(T.parseHostElapsed('Deep diving...') === -1, '读不到时长返回 -1')
ok(T.formatElapsed(62000, 'zh') === '1分02秒' && T.formatElapsed(5000, 'en') === '5s', '时长格式化')
ok(T.renderPhrase('已 {elapsed} · {phaseLabel}', { elapsedLabel: '9秒', phaseLabel: '运行中', phase: 'running', lang: 'zh', time: '' }) === '已 9秒 · 运行中', '占位符渲染')

const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => ({ text: t, weight: 1 }))
const st = { bags: {}, recent: {} }
const first = Array.from({ length: 6 }, () => T.drawPhrase(st, 'g', items, 3))
ok(new Set(first).size === 6, '洗牌袋：一袋 6 句不重复')
const second = Array.from({ length: 6 }, () => T.drawPhrase(st, 'g', items, 3))
const seam = first.slice(-3)
ok(!seam.includes(second[0]), '跨袋接缝：新袋第一句不是上袋最后 3 句之一')

console.log('■ 宿主路由 /agent-menu/status-phrases')
const host = await import(pathToFileURL(hostPath).href)
let handler = null
host.apply({ effect: (fn) => fn(), webServer: { register: (r) => { handler = r.handler; return () => {} } } })
const res = { status: 0, body: '', writeHead(s) { this.status = s }, end(b) { this.body = b } }
await handler({ url: '/agent-menu/status-phrases', method: 'GET' }, res)
const parsed = JSON.parse(res.body)
ok(res.status === 200 && parsed.ok === true && parsed.library.packs.length === 14, '返回内置词库')

console.log('■ 引擎：接管 → 轮换 → 还原')
const row = new El('div'); row.setAttribute('data-chat-running', '')
const host1 = new El('span'); host1.className = 'runningText_abc shimmer'; host1.textContent = 'Deep diving for 3s'
row.appendChild(host1); doc.body.appendChild(row)
exp.apply({ get: () => null })
await new Promise((r) => setTimeout(r, 30))
ok(fetched.some((u) => u.endsWith('/agent-menu/status-phrases')), '客户端请求了词库路由')
ok(typeof intervalCb === 'function', '引擎已启动定时器')
const line = row.children.find((c) => String(c.className).includes('dsh-am-phrase'))
ok(!!line, '已在宿主文案旁插入自己的行')
ok(host1.style.display === 'none' && line.className.includes('runningText_abc'), '宿主那句已隐藏，且沿用宿主 class（继承 shimmer 样式）')
const shown1 = line.children[0].textContent
ok(shown1.length > 0, '已显示一句随机文案：' + shown1)
ok(line.children[1].textContent === '3秒' || /秒$/.test(line.children[1].textContent), '时钟读自宿主时长')
row.remove()
intervalCb()
ok(!line.isConnected && host1.style.display === '', '整行被宿主移除后：自己的行已拆，宿主文案恢复显示（不留残渣）')
fakeWindow.__dshAgentMenuPhrases?.dispose?.()

console.log(`\n结果：${fail === 0 ? '✅ 全部通过' : '❌ 有失败'}（${pass} 通过 / ${fail} 失败）`)
process.exit(fail === 0 ? 0 : 1)
