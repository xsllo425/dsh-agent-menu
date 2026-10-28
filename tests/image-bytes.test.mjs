// 圖片字節通道測試（node --test tests/image-bytes.test.mjs）
//
// 重點：桌面版宿主是 ELECTRON_RUN_AS_NODE 跑起來的，import('electron') 拿不到
// nativeImage / clipboard，所以 copy-image-bytes 必須有 PowerShell 兜底。
// 這個測試在不重啟應用的前提下，直接把 webServer 路由抓出來打一遍。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let handler = null
apply({
  effect: (fn) => fn(),
  webServer: {
    register: (options) => {
      handler = options.handler
      return () => {}
    },
  },
})

function call(action, payload, method = 'POST') {
  return new Promise((resolve) => {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    const req = {
      method,
      url: '/agent-menu/' + action,
      on(event, cb) {
        if (event === 'data' && body !== '') cb(Buffer.from(body))
        if (event === 'end') cb()
      },
      destroy() {},
    }
    let status = 0
    let text = ''
    const res = {
      writeHead(code) {
        status = code
      },
      end(chunk) {
        text += chunk === undefined ? '' : String(chunk)
        resolve({ status, body: text === '' ? null : JSON.parse(text) })
      },
    }
    handler(req, res)
  })
}

test('路由已注册，GET ping 返回 ok', async () => {
  assert.equal(typeof handler, 'function')
  const result = await call('ping', undefined, 'GET')
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})

test('copy-image-bytes 空 body 返回 400 且不是成功', async () => {
  const result = await call('copy-image-bytes', {})
  assert.equal(result.status, 400)
  assert.equal(result.body.ok, false)
})

test('copy-image-bytes 非法 dataUrl 返回 400', async () => {
  const result = await call('copy-image-bytes', { dataUrl: 'not-a-data-url' })
  assert.equal(result.status, 400)
})

// 剪貼板回讀只在 Windows 上成立：非 Electron 環境的兜底是 PowerShell +
// System.Windows.Forms，Linux/macOS 的 CI 上沒有這條路，跳過而不是假綠。
const CLIPBOARD_ROUNDTRIP = process.platform === 'win32' ? false : '需要 Windows 剪贴板通道'

test('1x1 PNG 走 PowerShell 兜底进剪贴板，并读回校验尺寸', { skip: CLIPBOARD_ROUNDTRIP }, async () => {
  const result = await call('copy-image-bytes', { dataUrl: PNG_1X1, name: 'probe.png', mime: 'image/png' })
  assert.equal(result.status, 200, 'copy-image-bytes 失败：' + JSON.stringify(result.body))
  assert.equal(result.body.ok, true)
  assert.ok(result.body.bytes > 0, '字节已送达宿主（' + result.body.bytes + ' 字节）')
  assert.ok(
    result.body.via === 'powershell-clipboard' || result.body.via === 'electron-buffer',
    '走了可用通道：' + result.body.via,
  )
  assert.ok(result.body.size !== null && result.body.size !== undefined, '剪贴板读回校验有尺寸：' + JSON.stringify(result.body.size))
})
