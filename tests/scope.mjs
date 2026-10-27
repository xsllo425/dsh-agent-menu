// dsh-agent-menu 0.5.0 生效范围测试（node tests/scope.mjs）。
// 只在对话消息（[data-chat-turn]）和可编辑框里接管右键；消息里只认图片、点在选区上的选中文字、
// 链接、文件路径；选区菜单只有「复制」，任何地方都不出 AI 动作。

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

let failed = 0
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failed += 1; console.error('  ✗', msg) } }
const tick = () => new Promise((r) => setTimeout(r, 10))
const labels = () => (menuRootNode ? menuRootNode.childNodes.filter((n) => n.tagName === 'BUTTON').map((b) => b.childNodes[0].textContent) : null)

const chatRow = makeEl('div', { attrs: { 'data-chat-turn': '3' } })
const inChat = (tag, opts = {}) => makeEl(tag, { ...opts, parent: chatRow })
const outside = (tag, opts = {}) => makeEl(tag, { ...opts, parent: makeEl('div', { attrs: { 'data-settings': '' } }) })

async function rightClick(name, target, sel, expect) {
  menuRootNode = null
  selection = sel
  let prevented = false
  fire({ clientX: 100, clientY: 100, target, preventDefault() { prevented = true }, stopPropagation() {} })
  await tick()
  const got = labels()
  console.log('■ ' + name + ' → ' + (got ? got.join(' / ') : '不接管'))
  if (expect === null) {
    check(got === null && prevented === false, '不接管，也不拦原生菜单')
  } else {
    check(got !== null && prevented === true, '弹出本插件菜单')
    for (const label of expect.has || []) check(got !== null && got.includes(label), '含「' + label + '」')
    for (const label of expect.not || []) check(got === null || !got.includes(label), '不含「' + label + '」')
  }
}

const AI = ['发送给 AI', '引用到输入框', '让 AI 解释这段内容', '总结选区', '引用此段到输入框', '让 AI 解释此段', '复制此段', '复制代码']
const hitRect = [{ left: 90, top: 90, right: 120, bottom: 110 }]
const missRect = [{ left: 400, top: 400, right: 500, bottom: 420 }]

await rightClick('消息里选中文字，点在选区上', inChat('p', { text: '一段话' }), { text: '选中的字', rects: hitRect }, { has: ['复制'], not: AI })
await rightClick('消息里选中文字，但点在选区外的普通段落', inChat('p', { text: '另一段' }), { text: '选中的字', rects: missRect }, null)
await rightClick('消息里没选中文字的段落', inChat('p', { text: '普通段落' }), { text: '', rects: [] }, null)
await rightClick('消息里的表格单元格', inChat('td', { text: '表格内容' }), { text: '', rects: [] }, null)
await rightClick('消息里的代码块（没选中）', inChat('pre', { text: 'const a = 1' }), { text: '', rects: [] }, null)
await rightClick('代码块里选中文字', inChat('pre', { text: 'const a = 1' }), { text: 'const', rects: hitRect }, { has: ['复制'], not: AI })
await rightClick('对话区外（设置页）有选中文字', outside('p', { text: '设置说明' }), { text: '设置说明', rects: hitRect }, null)
await rightClick('对话区外的普通文字', outside('span', { text: '工具栏' }), { text: '', rects: [] }, null)
await rightClick('消息里的链接', inChat('a', { text: '文档', attrs: { href: 'https://example.com/doc' } }), { text: '', rects: [] }, { has: ['复制链接地址', '在浏览器中打开'], not: AI })
await rightClick('消息里的文件路径', inChat('code', { text: 'src/main.ts' }), { text: '', rects: [] }, { has: ['复制路径', '打开文件位置', '用默认应用打开'], not: AI })
await rightClick('输入框（不在对话区里）', outside('div', { editable: true, text: '草稿' }), { text: '', rects: [] }, { has: ['粘贴', '全选'], not: AI })
await rightClick('输入框里选中文字', outside('textarea', { text: '草稿' }), { text: '草', rects: hitRect }, { has: ['剪切', '复制', '粘贴'], not: AI })

console.log(failed === 0 ? '\n结果：✅ 全部通过' : '\n结果：❌ 失败 ' + failed + ' 项')
process.exitCode = failed === 0 ? 0 : 1
