// 右键放行回归测试（node --test tests/rightclick-native.test.mjs）。
// 背景：2026-10-27 之前，onContextMenu 只要 classify() 判定「归本插件管」就立刻
// preventDefault()，可随后的 decide() 还有「代际号失效 / 算菜单项抛异常 / 菜单项为空 /
// file-menu 已弹且我们没项 / 圆盘遮罩在场」五条路什么都不弹——原生菜单已经被吞掉，
// 用户看到的就是「右键点了没反应」。
// 现在改成：先同步算菜单项（buildItems），有项才 preventDefault；没项或算错就放行。
// 本文件锁住这个契约：该我们弹的照弹，不该我们吞的一律不吞。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const PLUGIN = new URL('../lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const tick = (ms) => new Promise((r) => setTimeout(r, ms))

// ── DOM 桩 ────────────────────────────────────────────────────────────
let menuRootNode = null
let fmRoot = null
let rrLayer = null
let selectionText = ''

function makeEl(tag, attrs) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    childNodes: [],
    isContentEditable: false,
    innerText: '',
    textContent: '',
    className: '',
    currentSrc: '',
    parentNode: null,
    parentElement: null,
    _ls: {},
    _attrs: Object.assign({}, attrs || {}),
    appendChild(child) {
      this.childNodes.push(child)
      child.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null } }
      return child
    },
    addEventListener(type, fn) { (el._ls[type] ||= []).push(fn) },
    removeEventListener() {},
    setAttribute(name, value) { el._attrs[name] = String(value) },
    getAttribute(name) { return el._attrs[name] ?? null },
    getBoundingClientRect() { return { left: 10, top: 10, right: 210, bottom: 210, width: 200, height: 200 } },
    closest(selector) { return closestOf(el, selector) },
    focus() {},
    fire(type, evt) { for (const fn of el._ls[type] ?? []) fn(evt) },
  }
  el.removeChild = (child) => {
    const i = el.childNodes.indexOf(child)
    if (i >= 0) el.childNodes.splice(i, 1)
  }
  return el
}

function closestOf(el, selector) {
  let node = el
  while (node !== null && node !== undefined && node.nodeType === 1) {
    for (const raw of String(selector).split(',')) {
      const sel = raw.trim()
      if (sel === '') continue
      if (sel.startsWith('[') && sel.endsWith(']')) {
        if (node.getAttribute(sel.slice(1, -1)) !== null) return node
      } else if (node.tagName === sel.toUpperCase()) {
        return node
      }
    }
    node = node.parentElement
  }
  return null
}

function attach(parent, tag, attrs) {
  const el = makeEl(tag, attrs)
  el.parentElement = parent
  el.parentNode = parent
  if (parent !== null && parent !== undefined) parent.childNodes.push(el)
  return el
}

global.window = {
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, Date,
  innerWidth: 1920, innerHeight: 1080,
  location: { href: 'http://localhost/' },
  getSelection() { return { toString: () => selectionText } },
  __ModuleLoader__: { load(mod) { global.__LOADED__ = mod } },
}
global.document = {
  createElement: (tag) => makeEl(tag),
  head: makeEl('head'),
  body: Object.assign(makeEl('body'), {
    appendChild(node) {
      if (node.id === 'dsh-agent-menu-root') {
        node.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null } }
        menuRootNode = node
      }
      if (node.id === 'dsh-file-menu-root') {
        node.parentNode = { removeChild(n) { if (n === fmRoot) fmRoot = null } }
        fmRoot = node
      }
      return node
    },
  }),
  getElementById(id) {
    if (id === 'dsh-agent-menu-root') return menuRootNode
    if (id === 'dsh-file-menu-root') return fmRoot
    return null
  },
  querySelectorAll(sel) { return sel === '#dsh-agent-menu-root' && menuRootNode ? [menuRootNode] : [] },
  querySelector(sel) { return sel === '[data-dsh-rr-layer]' ? rrLayer : null },
  addEventListener() {}, removeEventListener() {},
  elementFromPoint: () => null,
}
global.location = global.window.location
global.fetch = async () => { throw new Error('no network in test') }

new Function(readFileSync(PLUGIN, 'utf8'))()
const mod = global.__LOADED__
assert.ok(mod && typeof mod.factory === 'function', 'module loader 桩没接到模块')
const exports = mod.factory(() => { throw new Error('client 不应 require 任何包') })
assert.equal(typeof exports.apply, 'function', '缺少 apply 导出')

const pluginCtx = {
  get(name) {
    if (name === 'sessions') {
      return { list: { getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { cwd: 'C:\\w' } } }) } }
    }
    return undefined
  },
}

// 每个场景重新 apply（代际号递增，监听器收在局部），返回「触发一次右键」的函数。
function freshLoad() {
  const ctxListeners = { win: [], doc: [] }
  const realWinAdd = global.window.addEventListener
  const realDocAdd = global.document.addEventListener
  global.window.addEventListener = (type, fn) => { if (type === 'contextmenu') ctxListeners.win.push(fn) }
  global.document.addEventListener = (type, fn) => { if (type === 'contextmenu') ctxListeners.doc.push(fn) }
  exports.apply(pluginCtx)
  global.window.addEventListener = realWinAdd
  global.document.addEventListener = realDocAdd
  return (target) => {
    const evt = {
      button: 2,
      clientX: 100,
      clientY: 100,
      target,
      defaultPrevented: false,
      preventDefault() { evt.defaultPrevented = true },
      stopPropagation() {},
    }
    // 真实顺序：window 捕获 → document 捕获。
    for (const fn of ctxListeners.win) fn(evt)
    if (evt.__dshAmSeen !== true) for (const fn of ctxListeners.doc) fn(evt)
    return evt
  }
}

const labels = () => menuRootNode === null
  ? []
  : menuRootNode.childNodes.filter((n) => n.tagName === 'BUTTON').map((b) => b.childNodes[0].textContent)

// 一棵最小对话树：chatTurn[data-chat-turn] > p > img
const chatTurn = attach(null, 'div', { 'data-chat-turn': 'turn-1' })
const chatP = attach(chatTurn, 'p')
const chatImg = attach(chatP, 'img', { src: '/api/file?path=C%3A%5Cw%5Ca.png' })
// 输入框：contentEditable 容器里一张图
const composer = attach(null, 'div')
composer.isContentEditable = true
const composerImg = attach(composer, 'img', { src: '/api/file?path=C%3A%5Cw%5Cb.png' })
// 对话范围外的普通段落
const outsideP = attach(null, 'p')
// 对话范围内、但没有图 / 选区 / 链接 / 路径的单元格
const chatTd = attach(chatTurn, 'td')

test('对话区里的图片 → 插件接管，菜单含复制图像与另存为', async () => {
  selectionText = ''
  menuRootNode = null
  const evt = freshLoad()(chatImg)
  await tick(10)
  assert.equal(evt.defaultPrevented, true, 'preventDefault 已调用（该我们管）')
  assert.ok(menuRootNode !== null, 'Agent 菜单已弹出')
  assert.ok(labels().includes('复制图像'), '含「复制图像」')
  assert.ok(labels().includes('另存为…'), '含「另存为…」')
})

test('输入框里的图片 → 插件接管，菜单含从输入框移除', async () => {
  selectionText = ''
  menuRootNode = null
  const evt = freshLoad()(composerImg)
  await tick(10)
  assert.equal(evt.defaultPrevented, true, 'preventDefault 已调用')
  assert.ok(menuRootNode !== null, 'Agent 菜单已弹出')
  assert.ok(labels().includes('从输入框移除'), '含「从输入框移除」')
})

test('对话范围外的普通段落 → 放行原生菜单', async () => {
  menuRootNode = null
  const evt = freshLoad()(outsideP)
  await tick(10)
  assert.equal(evt.defaultPrevented, false, '没有 preventDefault（原生菜单能出来）')
  assert.equal(menuRootNode, null, '没有弹 Agent 菜单')
})

test('对话区内的表格单元格（无图无选区无链接无路径）→ 放行原生菜单', async () => {
  menuRootNode = null
  const evt = freshLoad()(chatTd)
  await tick(10)
  assert.equal(evt.defaultPrevented, false, '没有 preventDefault（原生菜单能出来）')
  assert.equal(menuRootNode, null, '没有弹 Agent 菜单')
})

test('算菜单项时抛异常 → 放行原生菜单，不许吞掉又什么都不弹', async () => {
  menuRootNode = null
  const broken = attach(chatTurn, 'div')
  Object.defineProperty(broken, 'tagName', { get() { throw new Error('boom') } })
  const evt = freshLoad()(broken)
  await tick(10)
  assert.equal(evt.defaultPrevented, false, '没有 preventDefault（原生菜单能出来）')
  assert.equal(menuRootNode, null, '没有弹 Agent 菜单')
})

test('代际号失效（插件被重新 apply 过的旧闭包）→ 放行原生菜单', async () => {
  menuRootNode = null
  const fire = freshLoad()
  global.window.__dshAgentMenuGeneration = 99999 // 冒充一个不存在的代际号
  const evt = fire(chatImg)
  await tick(10)
  assert.equal(evt.defaultPrevented, false, '没有 preventDefault（原生菜单能出来）')
  assert.equal(menuRootNode, null, '没有弹 Agent 菜单')
  global.window.__dshAgentMenuGeneration = 1
})

test('输入框空白处 → 仍是插件接管（编辑器菜单）', async () => {
  menuRootNode = null
  const composerEmpty = attach(composer, 'div')
  const evt = freshLoad()(composerEmpty)
  await tick(10)
  assert.equal(evt.defaultPrevented, true, 'preventDefault 已调用')
  assert.ok(menuRootNode !== null, 'Agent 菜单已弹出')
  assert.ok(labels().includes('粘贴'), '含「粘贴」')
})
