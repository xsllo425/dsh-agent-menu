// 状态行随机文案（0.4.0 自 dsh-status-rotator 提取）测试：node --test tests/status-phrases.test.mjs
// 覆盖：词库包过滤与回退、洗牌袋不重复、阶段/时长解析、宿主路由合并，
// 以及用最小 DOM 桩跑一遍「接管运行行 → 换文案 → 整行移除后还原」。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = resolve(here, '../lib/client.js')
const hostPath = resolve(here, '../lib/index.js')
const lib = JSON.parse(readFileSync(resolve(here, '../lib/status-phrases.json'), 'utf8'))

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
let loaded = null
const fakeWindow = {
  __ModuleLoader__: { load(m) { loaded = m } },
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout,
  setInterval: (cb) => { intervalCb = cb; return 1 }, clearInterval: () => { intervalCb = null },
  location: { href: 'http://localhost/' }, innerWidth: 1920, innerHeight: 1080,
  getSelection: () => ({ toString: () => '' }),
}
const fetched = []
const sandbox = {
  window: fakeWindow, document: doc, console: { debug() {}, warn() {}, log() {} },
  navigator: { language: 'zh-CN' }, Date, Math, Map, Set, JSON, Object, Array, String, Number, Promise, setTimeout, clearTimeout,
  MutationObserver: class { constructor() {} observe() {} disconnect() {} },
  fetch: (url) => { fetched.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, library: lib }) }) },
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(clientPath, 'utf8'), sandbox, { filename: 'client.js' })
const exp = loaded.factory(() => ({}))
const T = exp.__statusPhrases
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

test('内置词库包数量与默认启用范围', () => {
  assert.equal(lib.packs.length, 14, '内置 14 个词库包')
  assert.equal(lib.enabledPacks.length, 10, '默认启用 10 个')
  assert.ok(!lib.enabledPacks.includes('ads'), '广告包默认关闭')
  assert.ok(!lib.enabledPacks.includes('community'), '社区包默认关闭')
})

test('三阶段词库都有句子，且不带需要实时引擎的占位符', () => {
  const bank = T.buildPhraseBank(lib, 'zh')
  assert.ok(bank.thinking.length > 100, 'thinking ' + bank.thinking.length)
  assert.ok(bank.running.length > 50, 'running ' + bank.running.length)
  assert.ok(bank.long.length > 10, 'long ' + bank.long.length)
  const dump = JSON.stringify(bank)
  assert.ok(!dump.includes('{tps}'), '不含 {tps}')
  assert.ok(!dump.includes('{model}'), '不含 {model}')
})

test('按 enabledPacks 过滤：只启用广告包时只剩它的句子', () => {
  const noAds = T.buildPhraseBank({ ...lib, enabledPacks: ['ads'] }, 'zh')
  assert.equal(noAds.running.length, 3)
  assert.equal(noAds.thinking.length, 0)
})

test('阶段缺组回退顺序', () => {
  assert.equal(T.pickGroup({ thinking: [], running: [{}], long: [] }, 'long'), 'running', 'long 缺组回退 running')
  assert.equal(T.pickGroup({ thinking: [{}], running: [], long: [] }, 'running'), 'thinking', 'running 缺组回退 thinking')
  assert.equal(T.pickGroup({ thinking: [], running: [], long: [] }, 'thinking'), null, '全空返回 null 保持宿主原文')
})

test('阶段阈值与时长解析', () => {
  assert.equal(T.phraseFor(0, lib), 'thinking')
  assert.equal(T.phraseFor(15000, lib), 'running')
  assert.equal(T.phraseFor(60000, lib), 'long')
  assert.equal(T.parseHostElapsed('Deep diving for 1m 02s'), 62000, '读宿主时长 1m 02s')
  assert.equal(T.parseHostElapsed('深度求索 1分02秒'), 62000, '读宿主时长 1分02秒')
  assert.equal(T.parseHostElapsed('Deep diving...'), -1, '读不到时长返回 -1')
  assert.equal(T.formatElapsed(62000, 'zh'), '1分02秒')
  assert.equal(T.formatElapsed(5000, 'en'), '5s')
  assert.equal(
    T.renderPhrase('已 {elapsed} · {phaseLabel}', { elapsedLabel: '9秒', phaseLabel: '运行中', phase: 'running', lang: 'zh', time: '' }),
    '已 9秒 · 运行中',
  )
})

test('洗牌袋：一袋不重复，跨袋接缝不撞最近三句', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => ({ text: t, weight: 1 }))
  const st = { bags: {}, recent: {} }
  const first = Array.from({ length: 6 }, () => T.drawPhrase(st, 'g', items, 3))
  assert.equal(new Set(first).size, 6, '一袋 6 句不重复')
  const second = Array.from({ length: 6 }, () => T.drawPhrase(st, 'g', items, 3))
  assert.ok(!first.slice(-3).includes(second[0]), '新袋第一句不是上袋最后 3 句之一')
})

test('宿主 /agent-menu/status-phrases 路由返回内置词库', async () => {
  const host = await import(pathToFileURL(hostPath).href)
  let handler = null
  host.apply({ effect: (fn) => fn(), webServer: { register: (r) => { handler = r.handler; return () => {} } } })
  const res = { status: 0, body: '', writeHead(s) { this.status = s }, end(b) { this.body = b } }
  await handler({ url: '/agent-menu/status-phrases', method: 'GET' }, res)
  assert.equal(res.status, 200)
  const parsed = JSON.parse(res.body)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.library.packs.length, 14)
})

test('引擎：接管运行行 → 轮换文案 → 整行移除后还原且不留残渣', async () => {
  const row = new El('div'); row.setAttribute('data-chat-running', '')
  const host1 = new El('span'); host1.className = 'runningText_abc shimmer'; host1.textContent = 'Deep diving for 3s'
  row.appendChild(host1); doc.body.appendChild(row)

  exp.apply({ get: () => null })
  await tick()
  assert.ok(fetched.some((u) => u.endsWith('/agent-menu/status-phrases')), '客户端请求了词库路由')
  assert.equal(typeof intervalCb, 'function', '引擎已启动定时器')

  const line = row.children.find((c) => String(c.className).includes('dsh-am-phrase'))
  assert.ok(!!line, '已在宿主文案旁插入自己的行')
  assert.equal(host1.style.display, 'none', '宿主那句已隐藏')
  assert.ok(line.className.includes('runningText_abc'), '沿用宿主 class（继承 shimmer 样式）')

  const shown = line.children[0].textContent
  assert.ok(shown.length > 0, '已显示一句随机文案：' + shown)
  assert.ok(/秒$/.test(line.children[1].textContent), '时钟读自宿主时长：' + line.children[1].textContent)

  row.remove()
  intervalCb()
  assert.equal(line.isConnected, false, '整行被宿主移除后自己的行已拆')
  assert.equal(host1.style.display, '', '宿主文案恢复显示')
  fakeWindow.__dshAgentMenuPhrases?.dispose?.()
})
