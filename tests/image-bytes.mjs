// 圖片字節通道測試（node tests/image-bytes.mjs）
//
// 重點：桌面版宿主是 ELECTRON_RUN_AS_NODE 跑起來的，import('electron') 拿不到
// nativeImage / clipboard，所以 copy-image-bytes 必須有 PowerShell 兜底。
// 這個測試在不重啟應用的前提下，直接把 webServer 路由抓出來打一遍。
import { apply } from '../lib/index.js'

let failed = 0
const assert = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else {
    failed += 1
    console.error('  ✗', msg)
  }
}

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let handler = null
const ctx = {
  effect: (fn) => fn(),
  webServer: {
    register: (options) => {
      handler = options.handler
      return () => {}
    },
  },
}

apply(ctx)
assert(typeof handler === 'function', '路由已注册')

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

console.log('■ GET ping')
{
  const result = await call('ping', undefined, 'GET')
  assert(result.status === 200 && result.body.ok === true, 'ping 返回 ok')
}

console.log('■ POST copy-image-bytes：空 body 要 400，且不是成功')
{
  const result = await call('copy-image-bytes', {})
  assert(result.status === 400 && result.body.ok === false, '缺 dataUrl 返回 400')
}

console.log('■ POST copy-image-bytes：非法 dataUrl 要 400')
{
  const result = await call('copy-image-bytes', { dataUrl: 'not-a-data-url' })
  assert(result.status === 400, '非法 dataUrl 返回 400')
}

console.log('■ POST copy-image-bytes：1x1 PNG 走 PowerShell 兜底进剪贴板')
{
  const result = await call('copy-image-bytes', { dataUrl: PNG_1X1, name: 'probe.png', mime: 'image/png' })
  if (result.status === 200 && result.body.ok === true) {
    assert(result.body.bytes > 0, '字节已送达宿主（' + result.body.bytes + ' 字节）')
    assert(
      result.body.via === 'powershell-clipboard' || result.body.via === 'electron-buffer',
      '走了可用通道：' + result.body.via,
    )
    assert(result.body.size !== null && result.body.size !== undefined, '剪贴板读回校验有尺寸：' + JSON.stringify(result.body.size))
  } else {
    assert(false, 'copy-image-bytes 失败：' + JSON.stringify(result.body))
  }
}

console.log('\n结果：' + (failed === 0 ? '✅ 全部通过' : '❌ 失败 ' + failed + ' 项'))
process.exit(failed === 0 ? 0 : 1)
