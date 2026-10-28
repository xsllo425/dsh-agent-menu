// 0.7.0 共存冒烟测试（node tests/smoke.mjs）。
// 不调用 AI、不猜工作区根；覆盖 file-menu 接管、round-rightclick 让行与复制宿主路由。
import { readFileSync } from 'node:fs'

let failed = 0
let menuRoot = null
let fileMenu = null
let roundLayer = null
let selection = ''
const calls = []
const assert = (ok, message) => {
  if (ok) console.log('  ✓', message)
  else { failed += 1; console.error('  ✗', message) }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 15))
const attrs = { 'data-chat-turn': 'turn-1' }

function el(tag, options = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    textContent: options.text || '',
    innerText: options.text || '',
    dataset: {},
    style: {},
    className: '',
    childNodes: [],
    parentElement: options.parent || null,
    parentNode: options.parent || null,
    _attrs: { ...(options.attrs || {}) },
    _listeners: {},
    setAttribute(name, value) { this._attrs[name] = String(value) },
    getAttribute(name) { return this._attrs[name] ?? null },
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn) },
    removeEventListener() {},
    appendChild(child) { this.childNodes.push(child); child.parentElement = this; child.parentNode = this; return child },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((item) => item !== child)
      if (child === fileMenu) fileMenu = null
    },
    getBoundingClientRect() { return { left: 10, top: 10, right: 200, bottom: 150, width: 190, height: 140 } },
    focus() {},
    closest(selector) {
      if (selector === '[data-chat-turn],[data-chat-node-key]' && this._attrs['data-chat-turn'] !== undefined) return this
      if (selector === 'a' && this.tagName === 'A') return this
      return this.parentElement ? this.parentElement.closest(selector) : null
    },
    fire(type) { for (const fn of this._listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {} }) },
  }
  return node
}

global.window = {
  __ModuleLoader__: { load(mod) { global.loaded = mod } },
  addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
  location: { href: 'http://localhost/' }, innerWidth: 1280, innerHeight: 800,
  getSelection() { return { toString: () => selection, rangeCount: selection ? 1 : 0, isCollapsed: !selection, getRangeAt: () => ({ getClientRects: () => [{ left: 90, top: 90, right: 130, bottom: 110 }] }) } },
}
global.document = {
  createElement: (tag) => el(tag),
  head: el('head'),
  body: Object.assign(el('body'), { appendChild(node) {
    node.parentNode = this
    if (node.id === 'dsh-agent-menu-root') menuRoot = node
    return node
  } }),
  getElementById(id) { return id === 'dsh-agent-menu-root' ? menuRoot : id === 'dsh-file-menu-root' ? fileMenu : null },
  querySelector(selector) { return selector === '[data-dsh-rr-layer]' ? roundLayer : null },
  querySelectorAll() { return [] },
  addEventListener() {}, removeEventListener() {}, elementFromPoint() { return null },
}
global.location = window.location
global.fetch = async (url, init = {}) => {
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null })
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}
new Function(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))()
const exports = global.loaded.factory(() => { throw new Error('本测试不加载侧栏插槽依赖') })
const ctx = { get(name) { return name === 'sessions' ? { list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: 'E:\\Work\\project' } } }) } } : undefined } }
let fire
let latestContextMenuListener
{
  const listeners = []
  const original = window.addEventListener
  window.addEventListener = (type, fn) => { if (type === 'contextmenu') { listeners.push(fn); latestContextMenuListener = fn } }
  exports.apply(ctx)
  window.addEventListener = original
  fire = latestContextMenuListener
}
const labels = () => menuRoot ? menuRoot.childNodes.filter((node) => node.tagName === 'BUTTON').map((node) => node.childNodes[0].textContent) : []
async function rightClick(target) {
  menuRoot = null
  let prevented = false
  fire({ target, clientX: 100, clientY: 100, preventDefault() { prevented = true }, stopPropagation() {} })
  await tick()
  return prevented
}
const chat = el('div', { attrs })

console.log('■ file-menu 共存：链接目标接管旧菜单')
fileMenu = el('div')
fileMenu.id = 'dsh-file-menu-root'
fileMenu.parentNode = { removeChild() { fileMenu = null } }
assert(await rightClick(el('a', { parent: chat, text: '文档', attrs: { href: 'https://example.com/doc' } })), '链接菜单接管右键')
assert(fileMenu === null, '旧 file-menu 根被移除')
assert(JSON.stringify(labels()) === JSON.stringify(['复制链接地址', '复制为 Markdown 链接', '在浏览器中打开']), '链接菜单精确匹配')

console.log('■ 选区链接：复制后保留链接三项')
selection = '文档'
fileMenu = null
assert(await rightClick(el('a', { parent: chat, text: '文档', attrs: { href: 'https://example.com/doc' } })), '选区链接接管右键')
assert(JSON.stringify(labels()) === JSON.stringify(['复制', '复制链接地址', '复制为 Markdown 链接', '在浏览器中打开']), '选区链接菜单精确匹配')
menuRoot.childNodes.find((node) => node.tagName === 'BUTTON').fire('click')
await tick()
assert(calls.some((call) => call.url === '/agent-menu/clipboard' && call.body.text === '文档'), '复制选区走本插件宿主剪贴板')

console.log('■ round-rightclick：有自己的菜单项时仍让行')
selection = '文档'
roundLayer = el('div')
assert(await rightClick(el('p', { parent: chat, text: '文档' })), '先同步判定菜单项')
assert(menuRoot === null, '圆盘遮罩存在时不弹本插件菜单')
roundLayer = null

console.log('■ 无目录快照：相对路径不提供误导性文件操作')
selection = ''
const bareCtx = { get() { return undefined } }
exports.apply(bareCtx)
fire = latestContextMenuListener
assert(!(await rightClick(el('code', { parent: chat, text: 'src/main.ts' }))), '不猜工作区根，放行原生菜单')
assert(menuRoot === null, '无 cwd 不弹空文件菜单')
assert(calls.some((call) => call.url === '/agent-menu/hello'), '客户端向宿主报告版本')

console.log(failed === 0 ? '\n结果：✅ 全部通过' : `\n结果：❌ ${failed} 条失败`)
process.exit(failed === 0 ? 0 : 1)
