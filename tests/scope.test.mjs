// dsh-agent-menu 生效范围测试（node --test tests/scope.test.mjs）。
// 只在对话消息和可编辑框里接管右键；选区、代码块、链接、文件和图片只提供
// 当前精简菜单，任何场景都不出现 AI 动作。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const PLUGIN = new URL('../lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

let menuRootNode = null
let selection = { text: '', rects: [] }

function makeEl(tag, opts = {}) {
  const el = {
    nodeType: 1, tagName: String(tag).toUpperCase(), style: {}, dataset: opts.dataset || {}, childNodes: [],
    isContentEditable: opts.editable === true, innerText: opts.text || '', textContent: opts.text || '',
    parentElement: opts.parent || null, parentNode: { removeChild() {} }, _attrs: { ...(opts.attrs || {}) }, _ls: {},
    appendChild(child) { this.childNodes.push(child); child.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null } }; return child },
    addEventListener(type, fn) { (el._ls[type] ||= []).push(fn) }, removeEventListener() {},
    setAttribute(name, value) { el._attrs[name] = String(value) }, getAttribute(name) { return el._attrs[name] ?? null },
    getBoundingClientRect() { return { left: 10, top: 10, right: 210, bottom: 210, width: 200, height: 200 } },
    focus() {}, fire(type, evt) { for (const fn of el._ls[type] ?? []) fn(evt) },
    // closest: walk up, matching tag names and the two chat-scope attributes
    closest(sel) {
      const parts = sel.split(',').map((s) => s.trim())
      for (let n = el; n; n = n.parentElement) {
        for (const p of parts) {
          const attr = /^\[([\w-]+)\]$/.exec(p)
          if (attr && n._attrs && attr[1] in n._attrs) return n
          if (!attr && n.tagName === p.toUpperCase()) return n
        }
      }
      return null
    },
  }
  return el
}

global.window = {
  addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, Date, innerWidth: 1920, innerHeight: 1080,
  location: { href: 'http://localhost/' }, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  getSelection() {
    return {
      toString: () => selection.text, rangeCount: selection.text ? 1 : 0, isCollapsed: !selection.text,
      getRangeAt: () => ({ getClientRects: () => selection.rects }),
    }
  },
  __ModuleLoader__: { load(mod) { global.__LOADED__ = mod } },
}
global.document = {
  createElement: (tag) => makeEl(tag), head: makeEl('head'),
  body: Object.assign(makeEl('body'), { appendChild(node) { if (node.id === 'dsh-agent-menu-root') { node.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null } }; menuRootNode = node } return node } }),
  getElementById(id) { return id === 'dsh-agent-menu-root' ? menuRootNode : null },
  querySelectorAll(sel) { return sel === '#dsh-agent-menu-root' && menuRootNode ? [menuRootNode] : [] },
  querySelector() { return null }, addEventListener() {}, removeEventListener() {}, elementFromPoint: () => null,
}
global.location = global.window.location
global.fetch = async () => { throw new Error('no network in test') }

new Function(readFileSync(PLUGIN, 'utf8'))()
const exports = global.__LOADED__.factory(() => { throw new Error('client 不应 require 任何包') })
const ctx = { get(name) { if (name === 'sessions') return { list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: 'C:\\w' } } }) } } } }
let fire
{
  const listeners = []
  const add = global.window.addEventListener
  global.window.addEventListener = (type, fn) => { if (type === 'contextmenu') listeners.push(fn) }
  exports.apply(ctx)
  global.window.addEventListener = add
  fire = listeners[listeners.length - 1]
}

const tick = () => new Promise((r) => setTimeout(r, 10))
const labels = () => (menuRootNode ? menuRootNode.childNodes.filter((n) => n.tagName === 'BUTTON').map((b) => b.childNodes[0].textContent) : null)

const chatRow = makeEl('div', { attrs: { 'data-chat-turn': '3' } })
const inChat = (tag, opts = {}) => makeEl(tag, { ...opts, parent: chatRow })
const outside = (tag, opts = {}) => makeEl(tag, { ...opts, parent: makeEl('div', { attrs: { 'data-settings': '' } }) })

/** 触发一次右键，返回弹出的菜单项（null = 放行原生菜单）。 */
async function rightClick(target, sel) {
  menuRootNode = null
  selection = sel
  let prevented = false
  fire({ clientX: 100, clientY: 100, target, preventDefault() { prevented = true }, stopPropagation() {} })
  await tick()
  const got = labels()
  if (got === null) assert.equal(prevented, false, '不接管时不能吞掉原生菜单')
  else assert.equal(prevented, true, '弹出本插件菜单时必须 preventDefault')
  return got
}

const AI = ['发送给 AI', '引用到输入框', '让 AI 解释这段内容', '总结选区', '引用此段到输入框', '让 AI 解释此段', '复制此段']
const hitRect = [{ left: 90, top: 90, right: 120, bottom: 110 }]
const missRect = [{ left: 400, top: 400, right: 500, bottom: 420 }]

test('消息里选中文字，点在选区上 → 只复制', async () => {
  const got = await rightClick(inChat('p', { text: '一段话' }), { text: '选中的字', rects: hitRect })
  assert.ok(got.includes('复制'), '含「复制」')
  for (const label of AI) assert.ok(!got.includes(label), '不含「' + label + '」')
})

test('消息里选中文字，但点在选区外的普通段落 → 放行原生菜单', async () => {
  assert.equal(await rightClick(inChat('p', { text: '另一段' }), { text: '选中的字', rects: missRect }), null)
})

test('消息里没选中文字的段落 → 放行原生菜单', async () => {
  assert.equal(await rightClick(inChat('p', { text: '普通段落' }), { text: '', rects: [] }), null)
})

test('消息里的表格单元格 → 放行原生菜单', async () => {
  assert.equal(await rightClick(inChat('td', { text: '表格内容' }), { text: '', rects: [] }), null)
})

test('消息里的代码块（没选中）→ 只复制代码', async () => {
  assert.deepEqual(await rightClick(inChat('pre', { text: 'const a = 1' }), { text: '', rects: [] }), ['复制代码'])
})

test('代码块里选中文字 → 复制', async () => {
  const got = await rightClick(inChat('pre', { text: 'const a = 1' }), { text: 'const', rects: hitRect })
  assert.ok(got.includes('复制'), '含「复制」')
  for (const label of AI) assert.ok(!got.includes(label), '不含「' + label + '」')
})

test('对话区外（设置页）有选中文字 → 放行原生菜单', async () => {
  assert.equal(await rightClick(outside('p', { text: '设置说明' }), { text: '设置说明', rects: hitRect }), null)
})

test('对话区外的普通文字 → 放行原生菜单', async () => {
  assert.equal(await rightClick(outside('span', { text: '工具栏' }), { text: '', rects: [] }), null)
})

test('消息里的链接 → 三项链接操作', async () => {
  const target = inChat('a', { text: '文档', attrs: { href: 'https://example.com/doc' } })
  assert.deepEqual(await rightClick(target, { text: '', rects: [] }), ['复制链接地址', '复制为 Markdown 链接', '在浏览器中打开'])
})

test('消息里的文件路径 → 三项文件操作，且不含已删除的冗余项', async () => {
  const got = await rightClick(inChat('code', { text: 'src/main.ts' }), { text: '', rects: [] })
  assert.deepEqual(got, ['复制路径', '打开文件位置', '用默认应用打开'])
  for (const label of ['复制相对路径', '复制本地文件链接', '复制文件名', ...AI]) assert.ok(!got.includes(label), '不含「' + label + '」')
})

test('输入框（不在对话区里）→ 粘贴与全选', async () => {
  const got = await rightClick(outside('div', { editable: true, text: '草稿' }), { text: '', rects: [] })
  assert.ok(got.includes('粘贴'), '含「粘贴」')
  assert.ok(got.includes('全选'), '含「全选」')
})

test('输入框里选中文字 → 剪切、复制、粘贴', async () => {
  const got = await rightClick(outside('textarea', { text: '草稿' }), { text: '草', rects: hitRect })
  for (const label of ['剪切', '复制', '粘贴']) assert.ok(got.includes(label), '含「' + label + '」')
  for (const label of AI) assert.ok(!got.includes(label), '不含「' + label + '」')
})
