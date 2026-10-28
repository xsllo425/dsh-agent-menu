// 0.7.0 共存冒烟测试（node --test tests/smoke.test.mjs）。
// 不调用 AI、不猜工作区根；覆盖 file-menu 接管、round-rightclick 让行与复制宿主路由。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let menuRoot = null
let fileMenu = null
let roundLayer = null
let selection = ''
const calls = []
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
  getSelection() {
    return {
      toString: () => selection,
      rangeCount: selection ? 1 : 0,
      isCollapsed: !selection,
      getRangeAt: () => ({ getClientRects: () => [{ left: 90, top: 90, right: 130, bottom: 110 }] }),
    }
  },
}
global.document = {
  createElement: (tag) => el(tag),
  head: el('head'),
  body: Object.assign(el('body'), {
    appendChild(node) {
      node.parentNode = this
      if (node.id === 'dsh-agent-menu-root') menuRoot = node
      return node
    },
  }),
  getElementById(id) {
    if (id === 'dsh-agent-menu-root') return menuRoot
    if (id === 'dsh-file-menu-root') return fileMenu
    return null
  },
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

let fire
function install(ctx) {
  const original = window.addEventListener
  window.addEventListener = (type, fn) => { if (type === 'contextmenu') fire = fn }
  exports.apply(ctx)
  window.addEventListener = original
}

const sessionsCtx = {
  get(name) {
    return name === 'sessions'
      ? { list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: 'E:\\Work\\project' } } }) } }
      : undefined
  },
}
install(sessionsCtx)

const labels = () => menuRoot
  ? menuRoot.childNodes.filter((node) => node.tagName === 'BUTTON').map((node) => node.childNodes[0].textContent)
  : []

async function rightClick(target) {
  menuRoot = null
  let prevented = false
  fire({ target, clientX: 100, clientY: 100, preventDefault() { prevented = true }, stopPropagation() {} })
  await tick()
  return prevented
}

const chat = el('div', { attrs })
const linkNode = () => el('a', { parent: chat, text: '文档', attrs: { href: 'https://example.com/doc' } })

test('链接目标：接管并移除旧 file-menu 根，菜单精确三项', async () => {
  selection = ''
  fileMenu = el('div')
  fileMenu.id = 'dsh-file-menu-root'
  fileMenu.parentNode = { removeChild() { fileMenu = null } }
  assert.equal(await rightClick(linkNode()), true, '链接菜单接管右键')
  assert.equal(fileMenu, null, '旧 file-menu 根被移除')
  assert.deepEqual(labels(), ['复制链接地址', '复制为 Markdown 链接', '在浏览器中打开'])
})

test('选区命中链接：复制在最前，后接链接三项，走宿主剪贴板', async () => {
  selection = '文档'
  fileMenu = null
  assert.equal(await rightClick(linkNode()), true, '选区链接接管右键')
  assert.deepEqual(labels(), ['复制', '复制链接地址', '复制为 Markdown 链接', '在浏览器中打开'])
  menuRoot.childNodes.find((node) => node.tagName === 'BUTTON').fire('click')
  await tick()
  assert.ok(calls.some((call) => call.url === '/agent-menu/clipboard' && call.body.text === '文档'), '复制选区走本插件宿主剪贴板')
})

test('round-rightclick 圆盘在场时让行，不弹本插件菜单', async () => {
  selection = '文档'
  roundLayer = el('div')
  await rightClick(el('p', { parent: chat, text: '文档' }))
  assert.equal(menuRoot, null, '圆盘遮罩存在时不弹本插件菜单')
  roundLayer = null
})

test('无目录快照：不猜工作区根，放行原生菜单，仍向宿主报版本', async () => {
  selection = ''
  install({ get() { return undefined } })
  assert.equal(await rightClick(el('code', { parent: chat, text: 'src/main.ts' })), false, '不猜工作区根，放行原生菜单')
  assert.equal(menuRoot, null, '无 cwd 不弹空文件菜单')
  assert.ok(calls.some((call) => call.url === '/agent-menu/hello'), '客户端向宿主报告版本')
})
