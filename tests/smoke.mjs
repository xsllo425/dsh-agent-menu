// 注意：本文件测的是 0.4.x 的行为（不限范围的选区菜单、发送给 AI 等），0.5.0 已去掉这些功能，第一个场景起就会失败。0.5.0 的行为见 tests/scope.mjs。
// dsh-agent-menu 冒烟测试（node tests/smoke.mjs）。
// DOM/服务桩环境，覆盖菜单构建、共存分派（file-menu 接管/让位、圆盘让行、编辑框跳过）、
// setDraft→轮询→submit 发送链路与引用追加。

import { readFileSync } from 'node:fs'

const PLUGIN = new URL('../lib/client.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const calls = { setDraft: [], submit: [], removedFm: 0, toasts: [] }

let menuRootNode = null
let fmRoot = null
let rrLayer = null
let selectionText = ''

function makeEl(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    childNodes: [],
    isContentEditable: false,
    innerText: '',
    textContent: '',
    parentNode: { removeChild() {} },
    _ls: {},
    appendChild(child) { this.childNodes.push(child); child.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null; if (n === fmRoot) fmRoot = null } }; return child },
    addEventListener(type, fn) { (el._ls[type] ||= []).push(fn) },
    removeEventListener() {},
    setAttribute(name, value) { el['_attr_' + name] = String(value) },
    getAttribute(name) { return el['_attr_' + name] ?? null },
    getBoundingClientRect() { return { left: 10, top: 10, right: 210, bottom: 210, width: 200, height: 200 } },
    closest() { return null },
    focus() {},
    fire(type, evt) { for (const fn of el._ls[type] ?? []) fn(evt) },
  }
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
      if (node.id === 'dsh-agent-menu-root') { node.parentNode = { removeChild(n) { if (n === menuRootNode) menuRootNode = null } }; menuRootNode = node }
      if (node.id === 'dsh-file-menu-root') { node.parentNode = { removeChild(n) { if (n === fmRoot) fmRoot = null } }; fmRoot = node }
      if (node.id === 'dsh-agent-menu-toast') calls.toasts.push(node.textContent)
      return node
    },
  }),
  getElementById(id) { return id === 'dsh-agent-menu-root' ? menuRootNode : id === 'dsh-file-menu-root' ? fmRoot : null },
  querySelectorAll(sel) { return sel === '#dsh-agent-menu-root' && menuRootNode ? [menuRootNode] : [] },
  querySelector(sel) { return sel === '[data-dsh-rr-layer]' ? rrLayer : null },
  addEventListener() {}, removeEventListener() {},
  elementFromPoint: () => null,
}
// Node 24 自带只读 global navigator，够用（localCopy 里有 try/catch）
global.location = global.window.location // 客户端里 `new URL(src, location.href)` 是裸全局
global.fetch = async () => { throw new Error('no network in test') }

new Function(readFileSync(PLUGIN, 'utf8'))()
const mod = global.__LOADED__
if (!mod || typeof mod.factory !== 'function') throw new Error('module loader 桩没接到模块')
const exports = mod.factory(() => { throw new Error('client 不应 require 任何包') })
if (typeof exports.apply !== 'function') throw new Error('缺少 apply 导出')

const draftRef = { value: '' }
const pluginCtx = {
  get(name) {
    if (name === 'sessions') return { list: { getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { cwd: 'C:\\w' } } }) } }
    if (name === 'conversation') {
      return {
        input: {
          shell: (id) => id === 'sess-1'
            ? {
                actions: {
                  setDraft(text) { calls.setDraft.push(text); draftRef.value = text },
                  submit() { calls.submit.push(draftRef.value) },
                },
                state: { getSnapshot() { return { draft: draftRef.value } } },
                editor: { focus() {} },
              }
            : undefined,
        },
      }
    }
    return undefined
  },
}

let failed = 0
const assert = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failed += 1; console.error('  ✗', msg) } }
const tick = (ms) => new Promise((r) => setTimeout(r, ms))

function freshLoad() {
  // 每个场景重新 apply（代际号递增，模拟 HMR；监听器收集在局部）
  const ctxListeners = { win: [], doc: [] }
  const realWinAdd = global.window.addEventListener
  const realDocAdd = global.document.addEventListener
  global.window.addEventListener = (type, fn) => { if (type === 'contextmenu') ctxListeners.win.push(fn) }
  global.document.addEventListener = (type, fn) => { if (type === 'contextmenu') ctxListeners.doc.push(fn) }
  exports.apply(pluginCtx)
  global.window.addEventListener = realWinAdd
  global.document.addEventListener = realDocAdd
  return (evt) => ctxListeners.win[ctxListeners.win.length - 1](evt)
}
function makeFmRoot() {
  const el = makeEl('div')
  el.parentNode = { removeChild(n) { if (n === el) fmRoot = null } }
  return el
}
function makeTarget(tag, text, extra) {
  const el = makeEl(tag)
  if (text !== null) { el.innerText = text; el.textContent = text }
  return Object.assign(el, extra || {})
}
function menuLabels() {
  return menuRootNode.childNodes.filter((n) => n.tagName === 'BUTTON').map((b) => b.childNodes[0]._text ?? b.childNodes[0].textContent)
}
// label span 的文本：showMenu 用 label.textContent = item.label —— 桩的 textContent 是普通属性赋值，直接读
// （makeEl 没定义 textContent setter，赋值即普通属性）

async function main() {
  console.log('■ 场景1：选区 + 无 file-menu → Agent 菜单（含模板项）')
  menuRootNode = null
  selectionText = '你好世界 hello world'
  let fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: makeTarget('p', '段落文本'), preventDefault() {}, stopPropagation() {} })
  await tick(10)
  assert(menuRootNode !== null, '菜单已弹出')
  const labels1 = menuLabels()
  assert(labels1.length >= 7, '菜单项按钮 ≥ 7（引用/发送/解释/翻译/总结/续写/复制），实际 ' + labels1.length)
  assert(labels1[1] === '发送给 AI', '第 2 项是「发送给 AI」')

  console.log('■ 场景2：点击「发送给 AI」→ setDraft → 轮询落定 → submit')
  {
    const sendBtn = menuRootNode.childNodes.find((n) => n.tagName === 'BUTTON' && n['_attr_data-index'] === '1')
    assert(sendBtn !== undefined, '找到 data-index=1 的按钮')
    sendBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
    await tick(150) // 等 waitForDraft 轮询完成
    assert(calls.setDraft[calls.setDraft.length - 1] === selectionText, '草稿写入选区文本')
    assert(calls.submit.length === 1 && calls.submit[0] === selectionText, 'submit 发出选区文本')
    assert(menuRootNode === null, '激活后菜单关闭')
  }

  console.log('■ 场景3：「引用到输入框」追加不覆盖已有草稿')
  menuRootNode = null
  draftRef.value = '我自己打的话'
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: makeTarget('p', '段落'), preventDefault() {}, stopPropagation() {} })
  await tick(10)
  const quoteBtn = menuRootNode.childNodes.find((n) => n.tagName === 'BUTTON' && n['_attr_data-index'] === '0')
  quoteBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
  await tick(30)
  assert(draftRef.value === '我自己打的话\n\n' + selectionText, '引用追加在草稿之后（不覆盖）')
  draftRef.value = ''

  console.log('■ 场景4：代码块选区 → 出代码专属项')
  menuRootNode = null
  const codeEl = makeEl('code')
  codeEl.closest = (sel) => (sel === 'pre, code' ? codeEl : null)
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: codeEl, preventDefault() {}, stopPropagation() {} })
  await tick(10)
  const labels4 = menuLabels()
  assert(labels4.includes('优化这段代码') && labels4.includes('生成单元测试'), '代码选区出现 优化/单元测试 项')

  console.log('■ 场景5：接管 file-menu 菜单（有 Agent 项时）')
  menuRootNode = null
  selectionText = ''
  fmRoot = makeFmRoot()
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: makeTarget('p', '段落'), preventDefault() {}, stopPropagation() {} })
  await tick(10)
  assert(fmRoot === null, 'file-menu 菜单被摘除')
  assert(menuRootNode !== null, '本插件菜单接管弹出')

  console.log('■ 场景6：超链接 → 出链接菜单项（0.2.0 新增，0.1.0 这里是空的）')
  menuRootNode = null
  selectionText = ''
  fmRoot = makeFmRoot()
  const aEl = makeEl('a')
  aEl.getAttribute = (name) => (name === 'href' ? 'https://example.com' : null)
  aEl.innerText = '示例站点'
  aEl.textContent = '示例站点'
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: aEl, preventDefault() {}, stopPropagation() {} })
  await tick(10)
  const labels6 = menuLabels()
  assert(labels6.includes('复制链接地址'), '超链接出「复制链接地址」')
  assert(labels6.includes('在浏览器中打开'), '超链接出「在浏览器中打开」')
  assert(labels6.includes('复制为 Markdown 链接'), '超链接出「复制为 Markdown 链接」（0.3.0 新增）')
  assert(fmRoot === null, '本插件接管 file-menu 的位置（0.1.0 这里是让位）')
  assert(menuRootNode !== null, '本插件菜单接管弹出')

  console.log('■ 场景7：round-rightclick 遮罩在 → 让行')
  menuRootNode = null
  fmRoot = null
  selectionText = ''
  rrLayer = makeEl('div')
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: makeTarget('p', '段落'), preventDefault() {}, stopPropagation() {} })
  await tick(10)
  assert(menuRootNode === null, '圆盘在时本插件让行')
  rrLayer = null

  console.log('■ 场景8a：输入框无选区 → 编辑器基础菜单（0.3.0 三态之一）')
  menuRootNode = null
  selectionText = ''
  let prevented = 0
  const taEl = makeTarget('textarea', null)
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: taEl, preventDefault() { prevented += 1 }, stopPropagation() {} })
  await tick(10)
  const labels8a = menuLabels()
  assert(prevented === 1, '输入框 suppress 默认菜单（0.1.0 是 0）')
  assert(menuRootNode !== null, '输入框出本插件菜单')
  assert(
    labels8a.includes('粘贴') && labels8a.includes('撤销') && labels8a.includes('重做') && labels8a.includes('全选'),
    '无选区出 粘贴/撤销/重做/全选，实际 ' + JSON.stringify(labels8a),
  )
  assert(!labels8a.includes('剪切') && !labels8a.includes('复制'), '无选区不出 剪切/复制（没东西可切/可拷）')

  console.log('■ 场景8b：输入框有选区 → 标准编辑器菜单，且刻意不给 AI 项')
  menuRootNode = null
  selectionText = '选中的几个字'
  const taEl2 = makeTarget('textarea', null)
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: taEl2, preventDefault() {}, stopPropagation() {} })
  await tick(10)
  const labels8b = menuLabels()
  assert(
    labels8b.includes('剪切') && labels8b.includes('复制') && labels8b.includes('粘贴') && labels8b.includes('全选'),
    '有选区出 剪切/复制/粘贴/全选，实际 ' + JSON.stringify(labels8b),
  )
  assert(
    !labels8b.includes('让 AI 解释这段内容') && !labels8b.includes('总结选区'),
    '输入框内刻意不给 AI 项（还没发出去，作用意义不大）',
  )

  console.log('■ 场景8c：文件芯片（data-path 相对路径）→ 拼工作区根后出文件操作')
  menuRootNode = null
  selectionText = ''
  const chipEl = makeEl('button', 'src/main.ts')
  chipEl.getAttribute = (name) => (name === 'data-path' ? 'src/main.ts' : null)
  fire = freshLoad()
  fire({ clientX: 100, clientY: 100, target: chipEl, preventDefault() {}, stopPropagation() {} })
  await tick(10)
  const labels8c = menuLabels()
  assert(labels8c.includes('复制路径'), '文件芯片出「复制路径」')
  assert(labels8c.includes('打开文件位置'), '文件芯片出「打开文件位置」')
  assert(labels8c.includes('用默认应用打开'), '文件芯片出「用默认应用打开」')
  assert(
    labels8c.includes('复制相对路径') && labels8c.includes('复制本地文件链接') && labels8c.includes('复制文件名'),
    '文件芯片出 相对路径/file://链接/文件名（0.3.0 新增）',
  )
  {
    // 相对芯片的「复制相对路径」必须真的是 src/main.ts，而不是把 base 拼进去的绝对串
    const posts = []
    const realFetch = global.fetch
    global.fetch = async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true, via: 'electron' }) }
    }
    const relBtn = menuRootNode.childNodes.find(
      (n) => n.tagName === 'BUTTON' && n.childNodes[0] && n.childNodes[0].textContent === '复制相对路径',
    )
    relBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
    await tick(20)
    const rel = posts.find((p) => p.url === '/agent-menu/clipboard')
    // 分隔符跟工作区根一致（这里是 C:\w → 反斜杠），与「复制路径」那一项同风格
    assert(rel !== undefined && rel.body.text === 'src\\main.ts', '相对路径内容正确（不含 base、native 分隔符），实际 ' + JSON.stringify(rel && rel.body.text))
    global.fetch = realFetch
  }

  console.log('■ 场景11：代码块 → 代码专属项（0.3.0 新增，0.2.0 完全没有这一支）')
  {
    menuRootNode = null
    selectionText = ''
    const codeEl = makeEl('code')
    codeEl.className = 'language-ts'
    const preEl = makeEl('pre')
    preEl.innerText = 'const a = 1'
    preEl.textContent = 'const a = 1'
    preEl.querySelector = (sel) => (sel === 'code' ? codeEl : null)
    preEl.getAttribute = (name) => (name === 'data-lang' ? null : null)
    const spanEl = makeEl('span')
    spanEl.closest = (sel) => (sel === 'pre' ? preEl : null)
    fire = freshLoad()
    fire({ clientX: 100, clientY: 100, target: spanEl, preventDefault() {}, stopPropagation() {} })
    await tick(10)
    const labels11 = menuLabels()
    assert(labels11.includes('复制代码'), '代码块出「复制代码」')
    assert(labels11.includes('复制为代码块'), '代码块出「复制为代码块」')
    assert(labels11.includes('复制（不带语言标记）'), '有 lang 时出「复制（不带语言标记）」')
    assert(labels11.includes('让 AI 解释这段代码'), '代码块出代码向 AI 项')
    assert(
      labels11.includes('优化这段代码') && labels11.includes('生成单元测试'),
      '代码块出 优化/生成单元测试',
    )
    assert(!labels11.includes('总结选区'), '代码块走代码向而非通用选区向',
    )
  }

  console.log('■ 场景12：对话区图片 → 图片菜单')
  {
    menuRootNode = null
    selectionText = ''
    // DSH 的会话媒体一律走 /api/file?path=<encodeURIComponent(绝对路径)>
    const absPath = 'C:\\Users\\17416\\.dsh\\attachments\\v1\\file-objects\\ab\\ab12.png'
    const imgLocal = makeEl('img')
    imgLocal.getAttribute = (name) =>
      name === 'src' ? 'dsh-app://app/api/file?path=' + encodeURIComponent(absPath) : null
    fire = freshLoad()
    fire({ clientX: 100, clientY: 100, target: imgLocal, preventDefault() {}, stopPropagation() {} })
    await tick(10)
    const labels12 = menuLabels()
    assert(labels12.includes('复制图像'), '图片出「复制图像」')
    assert(!labels12.includes('在新标签页中打开图像'), '0.3.0 起图片不再出「在新标签页中打开图像」')
    assert(labels12.includes('复制图片地址'), '图片出「复制图片地址」')
    assert(labels12.includes('打开文件位置'), '解出本地路径时出「打开文件位置」')
    assert(labels12.includes('另存为…'), '解出本地路径时出「另存为…」')
    assert(!labels12.includes('从输入框移除'), '对话区图片不出「从输入框移除」')

    // 远端图（无本地路径）→ 只给不依赖路径的项，绝不误报本地操作
    menuRootNode = null
    const imgRemote = makeEl('img')
    imgRemote.getAttribute = (name) => (name === 'src' ? 'https://example.com/a.png' : null)
    fire = freshLoad()
    fire({ clientX: 100, clientY: 100, target: imgRemote, preventDefault() {}, stopPropagation() {} })
    await tick(10)
    const labels12b = menuLabels()
    assert(labels12b.includes('复制图像'), '远端图仍出「复制图像」（点了才提示路径解不出）')
    assert(
      !labels12b.includes('打开文件位置') && !labels12b.includes('另存为…'),
      '解不出本地路径时**隐藏**本地项，实际 ' + JSON.stringify(labels12b),
    )
  }

  console.log('■ 场景13：白名单外 → 完全不接管（0.3.0 防误触闸门）')
  {
    menuRootNode = null
    selectionText = ''
    let prevented13 = 0
    const blankEl = makeTarget('div', null)
    fire = freshLoad()
    fire({
      clientX: 100,
      clientY: 100,
      target: blankEl,
      preventDefault() { prevented13 += 1 },
      stopPropagation() {},
    })
    await tick(10)
    assert(menuRootNode === null, '白名单外不弹菜单')
    assert(prevented13 === 0, '白名单外不 preventDefault —— 浏览器原生菜单照常放行')
  }

  console.log('■ 场景13b：左侧工作区/会话树 → 不自己出菜单，改为触发 DSH 原生那个')
  {
    menuRootNode = null
    selectionText = ''
    let prevented13b = 0
    let nativeClicks = 0
    let stopped = 0
    // 官方侧边栏一行的真实形状：data-row-key + role="treeitem" + 行内一个 ⋮ 按钮
    const nativeBtn = makeEl('button')
    nativeBtn.getAttribute = (n) => (n === 'aria-label' ? '会话「Clarify task 1」的操作' : null)
    nativeBtn.click = () => { nativeClicks += 1 }
    const rowEl = makeEl('div')
    rowEl.dataset.rowKey = 'session:abc123'
    rowEl.getAttribute = (n) => (n === 'role' ? 'treeitem' : null)
    rowEl.querySelector = () => null
    rowEl.querySelectorAll = (sel) => (sel === 'button' ? [nativeBtn] : [])
    rowEl.closest = () => null
    const titleEl = makeEl('span', 'Clarify task 1')
    titleEl.parentElement = rowEl
    fire = freshLoad()
    fire({
      clientX: 100,
      clientY: 100,
      target: titleEl,
      preventDefault() { prevented13b += 1 },
      stopPropagation() { stopped += 1 },
      stopImmediatePropagation() { stopped += 1 },
    })
    await tick(10)
    assert(nativeClicks === 1, '侧边栏右键触发原生 ⋮ 按钮（点了 ' + nativeClicks + ' 次）')
    assert(prevented13b === 1, '触发原生菜单前拦掉浏览器原生菜单')
    assert(stopped >= 2, '掐断传播，别的插件（如 dsh-session-deck 的项目图标选择器）收不到这次右键，实际 ' + stopped)
    assert(menuRootNode === null, '侧边栏不出本插件菜单（内容交给官方渲染）')
  }

  console.log('■ 场景13c：侧边栏行内找不到 ⋮ 按钮 → 放行浏览器原生菜单兜底')
  {
    menuRootNode = null
    selectionText = ''
    let prevented13c = 0
    const rowEl = makeEl('div')
    rowEl.dataset.rowKey = 'workspace:项目'
    rowEl.getAttribute = (n) => (n === 'role' ? 'treeitem' : null)
    rowEl.querySelector = () => null
    rowEl.querySelectorAll = () => []
    rowEl.closest = () => null
    fire = freshLoad()
    fire({
      clientX: 100,
      clientY: 100,
      target: rowEl,
      preventDefault() { prevented13c += 1 },
      stopPropagation() {},
    })
    await tick(10)
    assert(prevented13c === 0, '点不到 ⋮ 按钮时不 preventDefault（浏览器原生菜单兜底）')
    assert(menuRootNode === null, '同时不出本插件菜单')
  }

  console.log('■ 场景9：无会话服务 → 段落放行原生菜单，行内代码仍出「复制代码」')
  menuRootNode = null
  const bareCtx = { get() { return undefined } }
  {
    const listeners = []
    const rw = global.window.addEventListener
    global.window.addEventListener = (type, fn) => { if (type === 'contextmenu') listeners.push(fn) }
    exports.apply(bareCtx)
    global.window.addEventListener = rw
    const fireBare = (evt) => listeners[listeners.length - 1](evt)

    // 9a：「复制此段」移除后，无会话 + 非代码段落一项都不剩 → 必须放行浏览器原生菜单
    selectionText = ''
    let prevented9a = 0
    fireBare({
      clientX: 100,
      clientY: 100,
      target: makeTarget('p', '段落'),
      preventDefault() { prevented9a += 1 },
      stopPropagation() {},
    })
    await tick(10)
    assert(menuRootNode === null, '无会话 + 段落：不出本插件菜单（「复制此段」已移除）')
    assert(prevented9a === 0, '无会话 + 段落：不 preventDefault，浏览器原生菜单兜底')

    // 9b：行内 <code>（不在 <pre> 里）→ 仍有「复制代码」，菜单不为空
    menuRootNode = null
    const inlineCode = makeEl('code')
    inlineCode.innerText = 'const a = 1'
    inlineCode.textContent = 'const a = 1'
    inlineCode.closest = (sel) =>
      sel === 'p,li,pre,blockquote,td,th,h1,h2,h3,h4,h5,h6,code,div' || sel === 'pre, code' ? inlineCode : null
    let prevented9b = 0
    fireBare({
      clientX: 100,
      clientY: 100,
      target: inlineCode,
      preventDefault() { prevented9b += 1 },
      stopPropagation() {},
    })
    await tick(10)
    const labels9 = menuLabels()
    assert(
      labels9.length === 1 && labels9[0] === '复制代码',
      '无会话 + 行内代码：只出「复制代码」（「复制此段」不再兜底），实际 ' + JSON.stringify(labels9),
    )
    assert(prevented9b === 1, '行内代码仍接管（preventDefault 1 次）')
  }

  console.log('■ 场景10：复制优先打自己的 /agent-menu 宿主路由')
  {
    const posts = []
    const realFetch = global.fetch
    global.fetch = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, via: 'electron' }) } }
    menuRootNode = null
    selectionText = '要被复制的文字'
    fire = freshLoad()
    fire({ clientX: 100, clientY: 100, target: makeTarget('p', '段落'), preventDefault() {}, stopPropagation() {} })
    await tick(10)
    const copyBtn = menuRootNode.childNodes.find((n) => n.tagName === 'BUTTON' && n.childNodes[0] && n.childNodes[0].textContent === '复制')
    assert(copyBtn !== undefined, '找到「复制」按钮')
    copyBtn.fire('click', { preventDefault() {}, stopPropagation() {} })
    await tick(20)
    const clip = posts.find((p) => p.url === '/agent-menu/clipboard')
    assert(clip !== undefined, '复制走 /agent-menu/clipboard（不是 /file-menu/clipboard）')
    assert(clip && clip.body.text === '要被复制的文字', '复制内容正确')
    assert(posts.some((p) => p.url === '/agent-menu/hello'), 'apply 后向宿主自报 hello')
    global.fetch = realFetch
  }

  console.log('\n结果：' + (failed === 0 ? '✅ 全部通过' : '❌ ' + failed + ' 项失败'))
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => { console.error(error); process.exit(1) })
