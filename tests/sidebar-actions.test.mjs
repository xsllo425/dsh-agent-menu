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
    className: '',
    id: '',
    // textContent 按真 DOM 语义聚合子节点：有子节点时反映文本节点的 nodeValue 变化，
    // 否则回落到直接赋的字符串 / innerHTML 里的文字。
    get textContent() {
      if (this.childNodes.length > 0) {
        return this.childNodes.map((n) => (n.nodeType === 3 ? String(n.nodeValue) : n.textContent)).join('')
      }
      return this._text || ''
    },
    set textContent(value) { this._text = value == null ? '' : String(value) },
    // 桩不解析 HTML：innerHTML 只留标签外的文字（图标 svg 无文字，label span 的文字即 textContent）。
    set innerHTML(html) { this._html = String(html); this._text = String(html).replace(/<[^>]*>/g, '') },
    get innerText() { return this.textContent },
    set innerText(value) { this.textContent = value },
    _text: options.text || '',
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
    insertBefore(child, ref) {
      if (child.nodeType === 11) {
        for (const item of [...child.childNodes]) this.insertBefore(item, ref)
        return child
      }
      const index = this.childNodes.indexOf(ref)
      if (index === -1) return this.appendChild(child)
      this.childNodes.splice(index, 0, child)
      const refChildren = this.children.indexOf(ref)
      this.children.splice(refChildren === -1 ? this.children.length : refChildren, 0, child)
      child.parentElement = this
      child.parentNode = this
      return child
    },
    querySelectorAll(selector) {
      const result = []
      const visit = (node) => {
        for (const child of node.childNodes || []) {
          if (!child || child.nodeType !== 1) continue // 真 DOM 的 querySelectorAll 会跳过文本节点
          if (selector === 'button' && child.tagName === 'BUTTON') result.push(child)
          if (selector === '[role="menuitem"]' && child.getAttribute('role') === 'menuitem') result.push(child)
          if (selector === 'svg' && child.tagName === 'SVG') result.push(child)
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
let sessionRefreshes = 0

global.window = {
  __ModuleLoader__: { load(mod) { global.loaded = mod } },
  addEventListener(type, fn) { if (type === 'contextmenu') fireContextMenu = fn },
  removeEventListener() {},
  setTimeout,
  clearTimeout,
  location: { href: 'http://localhost/' },
  getSelection() { return { toString: () => '' } },
  getComputedStyle: (el) => el._computed || {},
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
  get(name) {
    if (name === 'sessions') return { list: { getSnapshot: () => snapshots.sessions }, refresh() { sessionRefreshes += 1 } }
    return snapshots[name] ? { list: { getSnapshot: () => snapshots[name] } } : undefined
  },
  slots: {
    inject(name, callback) { injected.push(name); const result = callback(); if (typeof result === 'function') effects.push(result) },
    register(options, render) { registrations.push({ options, render }); return () => {} },
  },
}
exports.apply(ctx)

test('三个会话操作分别注册到官方插槽', () => {
  assert.equal(injected.filter((name) => name === 'sidebar.workspaces.session.menu.item').length, 3)
})

test('注册复制目录、打开位置与删除会话三项', () => {
  assert.equal(registrations.length, 3)
  assert.deepEqual(
    registrations.map((entry) => entry.options.id).sort(),
    ['dsh-agent-menu-copy-cwd', 'dsh-agent-menu-delete-session', 'dsh-agent-menu-reveal-cwd'],
  )
})

test('插件操作位于原生操作之后', () => {
  for (const entry of registrations) assert.ok(entry.options.order >= 460, entry.options.id + ' order=' + entry.options.order)
})

test('会话菜单项使用原生 MenuItemButton 且文案正确', () => {
  const expected = {
    'dsh-agent-menu-copy-cwd': '复制工作目录',
    'dsh-agent-menu-reveal-cwd': '打开文件位置',
    'dsh-agent-menu-delete-session': '删除会话',
  }
  for (const entry of registrations) {
    const rendered = entry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
    assert.ok(rendered && rendered.type.name === 'MenuItemButton', entry.options.id + ' 使用原生 MenuItemButton')
    assert.equal(rendered.children[0], expected[entry.options.id])
  }
})

test('复制目录与打开位置使用当前会话官方 cwd', async () => {
  for (const entry of registrations.filter((e) => e.options.id !== 'dsh-agent-menu-delete-session')) {
    const rendered = entry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
    rendered.props.onSelect()
    await tick()
  }
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/clipboard' && call.body.text === 'E:\\Work\\session-project'), '复制目录走宿主剪贴板')
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/reveal' && call.body.path === 'E:\\Work\\session-project'), '打开位置走宿主路由')
})

test('会话没有可信 cwd 时不显示目录操作', () => {
  const copyEntry = registrations.find((e) => e.options.id === 'dsh-agent-menu-copy-cwd')
  const missing = copyEntry.render({ sessionId: 'unknown', useMenuOpenState: () => [true, () => {}] })
  assert.equal(missing, null)
})

test('删除会话不依赖 cwd，点击走宿主 session-delete 路由并刷新列表', async () => {
  const deleteEntry = registrations.find((e) => e.options.id === 'dsh-agent-menu-delete-session')
  const rendered = deleteEntry.render({ sessionId: 'unknown', useMenuOpenState: () => [true, () => {}] })
  assert.ok(rendered && rendered.type.name === 'MenuItemButton', '没有 cwd 也显示删除项')
  rendered.props.onSelect()
  await tick()
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/session-delete' && call.body.sessionId === 'unknown'), '删除走本插件宿主路由')
  assert.equal(sessionRefreshes, 1, '删除成功后刷新 sessions 快照')
})

test('会话菜单打开后「复制 Session ID」被替换为「复制会话 ID」', async () => {
  const menu = element('div', { rect: { left: 180, top: 20, right: 380, bottom: 100 } })
  menu.setAttribute('role', 'menu')
  const item = element('button', { text: '复制 Session ID', attrs: { role: 'menuitem' } })
  const textNode = { nodeType: 3, nodeValue: '复制 Session ID', textContent: '复制 Session ID' }
  item.childNodes.push(textNode)
  menu.appendChild(item)
  nativeMenu = menu
  const deleteEntry = registrations.find((e) => e.options.id === 'dsh-agent-menu-delete-session')
  deleteEntry.render({ sessionId: 's1', useMenuOpenState: () => [true, () => {}] })
  await tick()
  nativeMenu = null
  assert.equal(textNode.nodeValue, '复制会话 ID', '文本节点被就地替换（保留图标与结构）')
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
test('工作区菜单：新建会话置顶、三项插入锚定、删除工作区沉底', async () => {
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
  assert.deepEqual(
    nativeMenu.childNodes.map((item) => item.textContent),
    ['新建会话', '重命名', '复制工作目录', '打开文件位置', '删除工作区'],
    '用户要求的顺序：新建会话最上、删除工作区最下',
  )
  const additions = nativeMenu.querySelectorAll('.dsh-am-workspace-item')
  assert.deepEqual(additions.map((item) => item.textContent), ['新建会话', '复制工作目录', '打开文件位置'])
  for (const item of additions) {
    assert.ok(String(item._html || '').includes('<svg'), `追加项必须带图标：${item.textContent}`)
  }

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

// 真宿主把菜单项包在 group 容器里，直接 menu.insertBefore(node, 嵌套ref) 会抛
// NotFoundError——0.8.2 首版就栽在这，整条追加链失效。这个桩结构专门复刻该形态。
test('菜单项包在 group 容器里时仍按精确顺序插入', async () => {
  const originalClick = menuButton.click
  menuButton.click = () => {
    const nested = element('div', { rect: { left: 180, top: 20, right: 380, bottom: 100 } })
    nested.setAttribute('role', 'menu')
    const group = element('div')
    group.appendChild(element('button', { text: '重命名', attrs: { role: 'menuitem' } }))
    group.appendChild(element('button', { text: '删除工作区', attrs: { role: 'menuitem' } }))
    nested.appendChild(group)
    nativeMenu = nested
  }
  fireContextMenu({ target: workspace, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await tick()
  menuButton.click = originalClick
  assert.deepEqual(
    nativeMenu.querySelectorAll('[role="menuitem"]').map((item) => item.textContent),
    ['新建会话', '重命名', '复制工作目录', '打开文件位置', '删除工作区'],
  )
})

// ── 会话行右键：插槽项缺席时的 DOM 兜底（删除会话 + 汉化） ──
const sessionRow = element('div', { dataset: { rowKey: 'session:s1' }, rect: { left: 10, top: 50, right: 210, bottom: 80 } })
sessionRow.appendChild(element('button', {
  attrs: { 'aria-label': '会话“Demo”的操作' },
  onClick() {
    nativeMenu = element('div', { rect: { left: 180, top: 60, right: 380, bottom: 220 } })
    nativeMenu.setAttribute('role', 'menu')
    for (const label of ['置顶会话', '重命名', '分叉会话', '归档会话']) {
      nativeMenu.appendChild(element('button', { text: label, attrs: { role: 'menuitem' } }))
    }
    const copyId = element('button', { text: '复制 Session ID', attrs: { role: 'menuitem' } })
    copyId.childNodes.push({ nodeType: 3, nodeValue: '复制 Session ID', textContent: '复制 Session ID' })
    nativeMenu.appendChild(copyId)
  },
}))

test('会话菜单兜底：插槽项缺席时追加删除会话并汉化复制项', async () => {
  fireContextMenu({ target: sessionRow, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await tick()
  await tick()
  const labels = nativeMenu.querySelectorAll('[role="menuitem"]').map((item) => item.textContent)
  assert.deepEqual(labels, ['置顶会话', '重命名', '分叉会话', '归档会话', '复制会话 ID', '删除会话'])
  const deleteItem = nativeMenu.querySelectorAll('.dsh-am-workspace-item')[0]
  assert.ok(String(deleteItem._html || '').includes('<svg'), '兜底删除项带垃圾桶图标')
  assert.ok(String(deleteItem.className || '').includes('dsh-am-danger'), '兜底删除项标红')
  deleteItem.click()
  await tick()
  assert.ok(hostCalls.some((call) => call.url === '/agent-menu/session-delete' && call.body.sessionId === 's1'), '兜底删除项走宿主路由')
})

test('会话菜单第二次打开不叠加兜底项', async () => {
  fireContextMenu({ target: sessionRow, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await tick()
  await tick()
  assert.equal(nativeMenu.querySelectorAll('.dsh-am-workspace-item').length, 1, '删除项仍只有一条')
})

// ── 反闪烁契约：菜单同步挂载时补丁必须在右键返回前就位；晚挂载靠阶梯重试补上 ──
function makeSessionMenu() {
  const menu = element('div', { rect: { left: 180, top: 60, right: 380, bottom: 220 } })
  menu.setAttribute('role', 'menu')
  for (const label of ['置顶会话', '重命名', '分叉会话', '归档会话']) {
    menu.appendChild(element('button', { text: label, attrs: { role: 'menuitem' } }))
  }
  const copyId = element('button', { text: '复制 Session ID', attrs: { role: 'menuitem' } })
  copyId.childNodes.push({ nodeType: 3, nodeValue: '复制 Session ID', textContent: '复制 Session ID' })
  menu.appendChild(copyId)
  return menu
}

test('追加项照抄原生项的几何：内边距、字号、行高对齐', async () => {
  const originalClick = menuButton.click
  menuButton.click = () => {
    nativeMenu = element('div', { rect: { left: 200, top: 30, right: 400, bottom: 120 } })
    nativeMenu.setAttribute('role', 'menu')
    const rename = element('button', { attrs: { role: 'menuitem' } })
    rename.childNodes.push({ nodeType: 3, nodeValue: '重命名', textContent: '重命名' })
    rename.appendChild(element('svg', { rect: { left: 210, top: 36, right: 224, bottom: 50 } }))
    rename._computed = { padding: '6px 12px', fontSize: '13px', lineHeight: '20px', gap: '8px' }
    nativeMenu.appendChild(rename)
    const del = element('button', { attrs: { role: 'menuitem' } })
    del.childNodes.push({ nodeType: 3, nodeValue: '删除工作区', textContent: '删除工作区' })
    nativeMenu.appendChild(del)
  }
  fireContextMenu({ target: workspace, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await tick()
  menuButton.click = originalClick
  const additions = nativeMenu.querySelectorAll('.dsh-am-workspace-item')
  assert.equal(additions.length, 3)
  for (const item of additions) {
    assert.equal(item.style.padding, '6px 12px', '内边距必须与原生项一致')
    assert.equal(item.style.fontSize, '13px')
    assert.equal(item.style.lineHeight, '20px')
  }
})

test('同步挂载的菜单在右键返回前就已补好（不等下一帧）', () => {
  const row = element('div', { dataset: { rowKey: 'session:s1' }, rect: { left: 10, top: 50, right: 210, bottom: 80 } })
  row.appendChild(element('button', {
    attrs: { 'aria-label': '会话“Demo”的操作' },
    onClick() { nativeMenu = makeSessionMenu() },
  }))
  fireContextMenu({ target: row, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  const labels = nativeMenu.querySelectorAll('[role="menuitem"]').map((item) => item.textContent)
  assert.ok(labels.includes('删除会话'), '同步路径：click 返回时删除项已在菜单里')
  assert.equal(labels[4], '复制会话 ID', '同步路径：汉化同样不等下一帧')
})

test('菜单晚挂载时阶梯重试补上，不是一帧定生死', async () => {
  nativeMenu = null // 清掉上一个用例留下的菜单实例，模拟全新打开
  const row = element('div', { dataset: { rowKey: 'session:s1' }, rect: { left: 10, top: 50, right: 210, bottom: 80 } })
  row.appendChild(element('button', {
    attrs: { 'aria-label': '会话“Demo”的操作' },
    onClick() { setTimeout(() => { nativeMenu = makeSessionMenu() }, 40) },
  }))
  fireContextMenu({ target: row, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const labels = nativeMenu.querySelectorAll('[role="menuitem"]').map((item) => item.textContent)
  assert.ok(labels.includes('删除会话'), '重试阶梯在菜单出现后把项补上')
  assert.equal(nativeMenu.querySelectorAll('.dsh-am-workspace-item').length, 1, '重试不叠加')
})
