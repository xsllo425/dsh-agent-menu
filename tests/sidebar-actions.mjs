// 侧栏真实操作契约（node tests/sidebar-actions.mjs）。
// 使用官方 sessions/workspaces 快照、session.menu.item 插槽与原生工作区菜单桩。
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let failed = 0
const assert = (ok, message) => {
  if (ok) console.log('  ✓', message)
  else { failed += 1; console.error('  ✗', message) }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 15))

function element(tag, options = {}) {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    dataset: options.dataset || {},
    childNodes: [],
    children: [],
    parentElement: options.parent || null,
    parentNode: options.parent || null,
    style: {},
    textContent: options.text || '',
    innerText: options.text || '',
    className: '',
    id: '',
    _attrs: { ...(options.attrs || {}) },
    _listeners: {},
    setAttribute(name, value) { this._attrs[name] = String(value) },
    getAttribute(name) { return this._attrs[name] ?? null },
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn) },
    removeEventListener() {},
    appendChild(child) {
      if (child.nodeType === 11) {
        for (const item of [...child.childNodes]) this.appendChild(item)
        return child
      }
      this.childNodes.push(child)
      this.children.push(child)
      child.parentElement = this
      child.parentNode = this
      return child
    },
    querySelectorAll(selector) {
      const result = []
      const visit = (node) => {
        for (const child of node.childNodes || []) {
          if (selector === 'button' && child.tagName === 'BUTTON') result.push(child)
          if (selector === '[role="menuitem"]' && child.getAttribute('role') === 'menuitem') result.push(child)
          if (selector === '.dsh-am-workspace-item' && child.className.includes('dsh-am-workspace-item')) result.push(child)
          visit(child)
        }
      }
      visit(this)
      return result
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null },
    getBoundingClientRect() { return options.rect || { left: 10, top: 10, right: 210, bottom: 40 } },
    closest() { return null },
    click() {
      if (options.onClick) options.onClick()
      for (const fn of this._listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} })
    },
  }
  return el
}

let fireContextMenu
let nativeMenu = null
let newSessionClicks = 0
let workspaceMenuClicks = 0
const registrations = []
const effects = []
const injected = []
const hostCalls = []

global.window = {
  __ModuleLoader__: { load(mod) { global.loaded = mod } },
  addEventListener(type, fn) { if (type === 'contextmenu') fireContextMenu = fn },
  removeEventListener() {},
  setTimeout,
  clearTimeout,
  location: { href: 'http://localhost/' },
  getSelection() { return { toString: () => '' } },
}
global.document = {
  head: element('head'),
  body: element('body'),
  createElement: (tag) => element(tag),
  createDocumentFragment: () => Object.assign(element('fragment'), { nodeType: 11 }),
  getElementById() { return null },
  querySelector() { return null },
  querySelectorAll(selector) { return selector === '[role="menu"]' && nativeMenu ? [nativeMenu] : [] },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
}
global.location = window.location
global.KeyboardEvent = class { constructor(type, options) { Object.assign(this, options, { type }) } }
global.fetch = async (url, init = {}) => {
  hostCalls.push({ url, body: init.body ? JSON.parse(init.body) : null })
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}
new Function(source)()
const exports = global.loaded.factory((name) => {
  if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props, children }) }
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MenuItemButton: function MenuItemButton() {} }
  throw new Error('unexpected require: ' + name)
})
const snapshots = {
  sessions: { current: 's1', byId: { s1: { cwd: 'E:\\Work\\session-project' }, unknown: {} } },
  workspaces: { items: [{ workspaceId: 'w1', path: 'E:\\Work\\workspace-project', sessionIds: ['s1'] }] },
}
const ctx = {
  get(name) { return snapshots[name] ? { list: { getSnapshot: () => snapshots[name] } } : undefined },
  slots: {
    inject(name, callback) { injected.push(name); const result = callback(); if (typeof result === 'function') effects.push(result) },
    register(options, render) { registrations.push({ options, render }); return () => {} },
  },
}
exports.apply(ctx)

assert(injected.filter((name) => name === 'sidebar.workspaces.session.menu.item').length === 2, '两个会话目录操作分别注册到官方插槽')
assert(registrations.length === 2, '恰好注册复制目录与打开位置，未伪造删除/固定/归档')
assert(registrations.every((entry) => entry.options.order >= 460), '插件操作位于原生操作之后')
for (const entry of registrations) {
  const rendered = entry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
  assert(rendered && rendered.type.name === 'MenuItemButton', entry.options.id + ' 使用原生 MenuItemButton')
  assert(rendered.children[0] === (entry.options.order === 460 ? '复制工作目录' : '打开文件位置'), '会话菜单文案正确')
  rendered.props.onSelect()
  await tick()
}
assert(hostCalls.some((call) => call.url === '/agent-menu/clipboard' && call.body.text === 'E:\\Work\\session-project'), '复制目录使用当前会话官方 cwd')
assert(hostCalls.some((call) => call.url === '/agent-menu/reveal' && call.body.path === 'E:\\Work\\session-project'), '打开位置使用当前会话官方 cwd')
const missing = registrations[0].render({ sessionId: 'unknown', useMenuOpenState: () => [true, () => {}] })
assert(missing === null, '会话没有可信 cwd 时不显示目录操作')

const workspace = element('div', { dataset: { rowKey: 'workspace:w1' }, rect: { left: 10, top: 10, right: 210, bottom: 40 } })
const menuButton = element('button', { attrs: { 'aria-label': '工作区“Demo”的操作' }, onClick() {
  workspaceMenuClicks += 1
  nativeMenu = element('div', { rect: { left: 180, top: 20, right: 380, bottom: 100 } })
  nativeMenu.setAttribute('role', 'menu')
  nativeMenu.appendChild(element('button', { text: '重命名', attrs: { role: 'menuitem' } }))
  nativeMenu.appendChild(element('button', { text: '删除工作区', attrs: { role: 'menuitem' } }))
} })
const newButton = element('button', { attrs: { 'aria-label': '在工作区“Demo”中新建会话' }, onClick() { newSessionClicks += 1 } })
workspace.appendChild(menuButton)
workspace.appendChild(newButton)
let prevented = false
let stoppedImmediately = false
fireContextMenu({
  target: workspace,
  preventDefault() { prevented = true },
  stopImmediatePropagation() { stoppedImmediately = true },
  stopPropagation() {},
})
await tick()
assert(prevented && stoppedImmediately && workspaceMenuClicks === 1, '工作区右键只触发原生菜单，且阻止其他插件抢占')
const additions = nativeMenu.querySelectorAll('.dsh-am-workspace-item')
assert(nativeMenu.childNodes.length === 5, '保留原生重命名/删除，追加恰好三个工作区操作')
assert(additions.map((item) => item.textContent).join('|') === '新建会话|复制工作目录|打开文件位置', '工作区追加项精确匹配')
additions[0].click()
assert(newSessionClicks === 1, '新建会话调用同一行已有原生按钮')

const unrelated = element('div')
nativeMenu = unrelated
unrelated.setAttribute('role', 'menu')
unrelated.appendChild(element('button', { text: '任意操作', attrs: { role: 'menuitem' } }))
menuButton.click = () => {}
fireContextMenu({ target: workspace, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
await tick()
assert(unrelated.querySelectorAll('.dsh-am-workspace-item').length === 0, '非工作区原生菜单不会被误加目录操作')

console.log(failed === 0 ? '\n结果：✅ 全部通过' : `\n结果：❌ ${failed} 条失败`)
process.exit(failed === 0 ? 0 : 1)
