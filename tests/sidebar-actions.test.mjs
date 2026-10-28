// 侧栏真实操作契约（node --test tests/sidebar-actions.test.mjs）。
// 使用官方 sessions/workspaces 快照、session.menu.item 插槽与原生工作区菜单桩。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
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

test('两个会话目录操作分别注册到官方插槽', () => {
  assert.equal(injected.filter((name) => name === 'sidebar.workspaces.session.menu.item').length, 2)
})

test('恰好注册复制目录与打开位置，未伪造删除/固定/归档', () => {
  assert.equal(registrations.length, 2)
  assert.deepEqual(registrations.map((entry) => entry.options.id).sort(), ['dsh-agent-menu-copy-cwd', 'dsh-agent-menu-reveal-cwd'])
})

test('插件操作位于原生操作之后', () => {
  for (const entry of registrations) assert.ok(entry.options.order >= 460, entry.options.id + ' order=' + entry.options.order)
})

test('会话菜单项使用原生 MenuItemButton 且文案正确', () => {
  for (const entry of registrations) {
    const rendered = entry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
    assert.ok(rendered && rendered.type.name === 'MenuItemButton', entry.options.id + ' 使用原生 MenuItemButton')
    assert.equal(rendered.children[0], entry.options.order === 460 ? '复制工作目录' : '打开文件位置')
  }
})

test('复制目录与打开位置使用当前会话官方 cwd', async () => {
  for (const entry of registrations) {
    const rendered = entry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
    rendered.props.onSelect()
    await tick()
  }
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/clipboard' && call.body.text === 'E:\\Work\\session-project'), '复制目录走宿主剪贴板')
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/reveal' && call.body.path === 'E:\\Work\\session-project'), '打开位置走宿主路由')
})

test('会话没有可信 cwd 时不显示目录操作', () => {
  const missing = registrations[0].render({ sessionId: 'unknown', useMenuOpenState: () => [true, () => {}] })
  assert.equal(missing, null)
})

const workspace = element('div', { dataset: { rowKey: 'workspace:w1' }, rect: { left: 10, top: 10, right: 210, bottom: 40 } })
const menuButton = element('button', {
  attrs: { 'aria-label': '工作区“Demo”的操作' },
  onClick() {
    workspaceMenuClicks += 1
    nativeMenu = element('div', { rect: { left: 180, top: 20, right: 380, bottom: 100 } })
    nativeMenu.setAttribute('role', 'menu')
    nativeMenu.appendChild(element('button', { text: '重命名', attrs: { role: 'menuitem' } }))
    nativeMenu.appendChild(element('button', { text: '删除工作区', attrs: { role: 'menuitem' } }))
  },
})
const newButton = element('button', { attrs: { 'aria-label': '在工作区“Demo”中新建会话' }, onClick() { newSessionClicks += 1 } })
workspace.appendChild(menuButton)
workspace.appendChild(newButton)

// 工作区这条链是「右键 → 原生菜单弹出 → 我们追加」的时序，一个 test 里连着走完，
// 拆成多个 test 会变成互相依赖执行顺序的假通过。
test('工作区菜单：只触发原生菜单、保留原生项、追加恰好三项、新建会话走原生按钮', async () => {
  let prevented = false
  let stoppedImmediately = false
  fireContextMenu({
    target: workspace,
    preventDefault() { prevented = true },
    stopImmediatePropagation() { stoppedImmediately = true },
    stopPropagation() {},
  })
  await tick()
  assert.ok(prevented, 'preventDefault 已调用')
  assert.ok(stoppedImmediately, 'stopImmediatePropagation 已调用')
  assert.equal(workspaceMenuClicks, 1, '只唤起了一次原生菜单')

  assert.equal(nativeMenu.childNodes.length, 5, '原生两项 + 追加三项')
  const additions = nativeMenu.querySelectorAll('.dsh-am-workspace-item')
  assert.deepEqual(additions.map((item) => item.textContent), ['新建会话', '复制工作目录', '打开文件位置'])

  additions[0].click()
  assert.equal(newSessionClicks, 1, '新建会话调用同一行已有原生按钮')
})

test('非工作区原生菜单不会被误加目录操作', async () => {
  const unrelated = element('div')
  unrelated.setAttribute('role', 'menu')
  unrelated.appendChild(element('button', { text: '任意操作', attrs: { role: 'menuitem' } }))
  // 原生菜单弹出来但内容不是「重命名 / 删除工作区」：这时的菜单与工作区无关。
  menuButton.click = () => { nativeMenu = unrelated }
  fireContextMenu({ target: workspace, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await tick()
  assert.equal(unrelated.querySelectorAll('.dsh-am-workspace-item').length, 0)
})
