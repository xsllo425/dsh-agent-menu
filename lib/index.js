/**
 * dsh-agent-menu — 宿主（node）半幀。
 *
 * 為 Web 側的右鍵選單提供原生能力：系統剪貼板、圖片剪貼板、另存為、資源管理器定位、
 * 默認應用打開。這幾件事渲染進程做不到，必須由宿主經 webServer 路由下發。
 *
 * 路由（reveal / open 接受絕對路徑；相對路徑需帶 base = 當前會話工作區根）：
 *   GET  /agent-menu/ping                       可用性探測
 *   GET  /agent-menu/status                     運行統計 + 最近 40 條客戶端行為記錄
 *   POST /agent-menu/clipboard { text }         寫系統剪貼板（Electron 主進程 / PowerShell）
 *   POST /agent-menu/copy-image { path }        圖片寫進系統剪貼板（Electron nativeImage）
 *   POST /agent-menu/save-image { path }        另存為（Electron 存檔對話框，複製不移動）
 *   POST /agent-menu/reveal    { path, base }   在文件管理器中定位
 *   POST /agent-menu/open      { path, base }   用系統默認應用打開
 *   POST /agent-menu/session-delete { sessionId } 删除会话：删会话日志目录并取消归档
 *   POST /agent-menu/hello | menu | diag        客戶端自報（加載 / 彈菜單 / 行為明細）
 *
 * ⚠️ Windows 上 explorer 的 `/select,` 必須配 `windowsVerbatimArguments: true`，
 * 否則 Node 的默認加引號轉義會讓 Explorer 忽略開關、退回默認文件夾。見 revealInFileManager。
 */
import { spawn } from 'node:child_process'
import { existsSync, statSync, copyFileSync, readFileSync, writeFileSync, rmSync, readdirSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'

export const name = 'agent-menu'
export const inject = ['webServer']

/** 宿主半幀版本；客戶端半幀版本見 lib/client.js 的 CLIENT_VERSION。 */
export const version = '0.8.2'

const HOST_VERSION = '0.8.2'

/** 運行統計：沒有瀏覽器控制台時也能確認「客戶端到底跑沒跑、跑的哪個版本、點了什麼」。 */
const runtimeStats = {
  hello: 0,
  clientVersion: '',
  lastHelloAt: '',
  menuShown: 0,
  clipboard: 0,
  copyImage: 0,
  saveImage: 0,
  copyImageBytes: 0,
  saveImageBytes: 0,
  reveal: 0,
  open: 0,
  sessionDelete: 0,
  lastError: '',
  diag: 0,
}

/** 最近 200 條客戶端行為記錄，對外只給最近 40 條。 */
const diagLog = []

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** 讀取並解析請求體（默認上限 1 MiB，長文本複製也能過；圖片字節走大上限）。 */
function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        resolve(undefined)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}

/**
 * 取出並解析目標路徑，解析不出來返回空串。
 *
 * DSH 對工作區內的文件顯示的是**相對路徑**（工具列 fileLink 按鈕更是只有文本、沒有
 * title 屬性），所以客戶端上報的可能是相對路徑，必須能解析：
 *   1. 絕對路徑：直接用（歸一化）
 *   2. `~` / `~/...`：展開到家目錄
 *   3. 相對路徑 + base（客戶端上報的當前會話工作區根，絕對路徑）：按 base 拼接
 */
function resolveTarget(body) {
  if (body === null || typeof body !== 'object' || typeof body.path !== 'string') return ''
  let value = body.path.trim()
  if (value === '' || value.length > 4096 || /[\r\n]/.test(value)) return ''
  value = value
    .replace(/^[`'"]+/, '')
    .replace(/[`'"]+$/, '')
    .trim()
  if (value.startsWith('@')) value = value.slice(1).trim()
  if (value === '') return ''
  if (isAbsolute(value)) return normalize(value)
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return resolve(homedir(), value.slice(2))
  const base = typeof body.base === 'string' ? body.base.trim() : ''
  if (base !== '' && isAbsolute(base)) return resolve(base, value)
  return ''
}

/** 啟動一個分離的原生進程（explorer 的退出碼不可靠，只等 spawn）。 */
function spawnDetached(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      ...options,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

/**
 * 启动子进程时用的环境变量副本。
 *
 * DSH 宿主为了让 Electron 二进制当 node 跑 CLI，自己进程环境里带
 * `ELECTRON_RUN_AS_NODE=1`；spawn 的子进程会原样继承。默认应用是 Electron 程序时
 * （MarkText / VSCode / Typora…）它就会退化成纯 Node 启动——秒退、无窗口、退出码 0，
 * 而 spawn 本身是成功的，宿主只回 ok:true，用户看到的就是「点了没反应」。
 * 实测：同一条 `cmd /c start "" <file.md>`，干净环境下 MarkText 正常打开并驻留，
 * 带上该变量 0.6 秒内进程消失。宿主自己是不是 Electron 与要打开的外部应用无关，
 * 所以打开外部应用时把它摘掉（剪贴板那条链路仍走 process.env，不受影响）。
 */
function childEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/**
 * 在系統文件管理器中定位路徑。
 *   win32  資源管理器 /select 選中（目錄則在父目錄中選中）
 *   darwin Finder `open -R` 選中
 *   linux  xdg-open 沒有「選中」語義，退而打開所在目錄
 */
async function revealInFileManager(target, isDirectory) {
  if (process.platform === 'win32') {
    await spawnDetached('explorer.exe', [`/select,${target}`], { windowsVerbatimArguments: true })
    return
  }
  if (process.platform === 'darwin') {
    await spawnDetached('open', isDirectory ? [target] : ['-R', target])
    return
  }
  await spawnDetached('xdg-open', [isDirectory ? target : dirname(target)])
}

/** 用系統默認應用打開路徑。 */
async function openWithDefaultApp(target) {
  if (process.platform === 'win32') {
    await spawnDetached('cmd.exe', ['/c', 'start', '', target], { env: childEnv() })
    return
  }
  if (process.platform === 'darwin') {
    await spawnDetached('open', [target], { env: childEnv() })
    return
  }
  await spawnDetached('xdg-open', [target], { env: childEnv() })
}

/** 用 PowerShell 的 Set-Clipboard 寫系統剪貼板（文本經 base64 傳遞，避免編碼與引號問題）。 */
function clipboardViaPowerShell(text) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(text, 'utf8').toString('base64')
    const script = `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve('powershell')
      else reject(new Error(`Set-Clipboard 退出碼 ${String(code)}${stderr === '' ? '' : `: ${stderr.trim()}`}`))
    })
  })
}

/** 優先用 Electron 主進程的 clipboard，退回 PowerShell。 */
async function writeClipboard(text) {
  try {
    const electron = await import('electron')
    const clipboard = electron?.clipboard
    if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
      clipboard.writeText(text)
      return 'electron'
    }
  } catch {
    /* 非 Electron 環境（或 ELECTRON_RUN_AS_NODE），退回 PowerShell */
  }
  return await clipboardViaPowerShell(text)
}

/** 取得 Electron 主進程 API；非 Electron 環境回傳 null（ELECTRON_RUN_AS_NODE 時 electron 只是路徑字串）。 */
async function electronApi() {
  try {
    const mod = await import('electron')
    if (mod === null || typeof mod !== 'object') return null
    const api = mod.clipboard !== undefined || mod.nativeImage !== undefined ? mod : mod.default
    if (api === null || api === undefined || typeof api !== 'object') return null
    return api
  } catch {
    return null
  }
}

/**
 * 圖片進系統剪貼板。渲染進程做不到這件事：DSH 的媒體走 /api/file 認證路由，
 * 渲染層 fetch 拿不到 blob；而 ClipboardItem 又要求同源。所以只能主進程做。
 * Electron 不可用時（桌面版宿主就是這種情況）退回 PowerShell，見 copyImageBufferToClipboard。
 */
async function copyImageToClipboard(path) {
  const api = await electronApi()
  const nativeImage = api?.nativeImage
  const clipboard = api?.clipboard
  if (nativeImage !== undefined && typeof nativeImage.createFromPath === 'function' && clipboard !== undefined && typeof clipboard.writeImage === 'function') {
    const image = nativeImage.createFromPath(path)
    if (image !== null && image !== undefined && !(typeof image.isEmpty === 'function' && image.isEmpty())) {
      clipboard.writeImage(image)
      return { via: 'electron-nativeImage', size: typeof image.getSize === 'function' ? image.getSize() : null }
    }
  }
  if (process.platform === 'win32') {
    const size = await clipboardImageViaPowerShell(readFileSync(path))
    return { via: 'powershell-clipboard', size }
  }
  throw new Error('Electron nativeImage 不可用（非 Electron 主進程？）')
}

/** 另存為：走 Electron 存檔對話框，複製而不是移動（原檔必須留在會話裡）。 */
async function saveImageAs(path) {
  const api = await electronApi()
  const dialog = api?.dialog
  const filters =
    path.toLowerCase().endsWith('.png')
      ? [{ name: 'PNG 圖片', extensions: ['png'] }]
      : path.toLowerCase().endsWith('.webp')
        ? [{ name: 'WebP 圖片', extensions: ['webp'] }]
        : [{ name: '圖片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
  let result = null
  if (dialog !== undefined && typeof dialog.showSaveDialog === 'function') {
    result = await dialog.showSaveDialog({ defaultPath: basename(path), filters })
    if (result !== null && result !== undefined && result.canceled !== true && typeof result.filePath === 'string' && result.filePath !== '') {
      copyFileSync(path, result.filePath)
      return { saved: true, filePath: result.filePath }
    }
    if (result !== null && result !== undefined) return { saved: false, reason: 'canceled' }
  }
  // Electron 對話框不可用（ELECTRON_RUN_AS_NODE）：退回 PowerShell 的另存對話框。
  if (process.platform === 'win32') {
    const extension = path.slice(path.lastIndexOf('.') + 1) || 'png'
    return await saveBufferViaPowerShellDialog(readFileSync(path), basename(path), extension)
  }
  return { saved: false, reason: 'canceled' }
}

/**
 * 把渲染層送上來的圖片字節解成 Buffer。
 *
 * 對話區圖片（`blob:dsh-app://app/<uuid>`）和輸入框草稿縮略圖（`URL.createObjectURL(file)`）
 * **都沒有本地路徑**，src 裡解不出 `?path=`，0.3.0 那條「按路徑讀檔」的鏈路對它們必然失敗
 * ——用戶看到的就是「複製圖像 → 找不到地址」。渲染層能 fetch 自己的 blob，於是轉成 data URL
 * 上報，這裡解回字節再交給 Electron。
 */
function bufferOfDataUrl(value) {
  if (typeof value !== 'string' || value === '') return null
  const comma = value.indexOf(',')
  if (comma < 0) return null
  const head = value.slice(0, comma)
  if (!/^data:[^;,]*;base64$/i.test(head)) return null
  try {
    const buffer = Buffer.from(value.slice(comma + 1), 'base64')
    return buffer.length === 0 ? null : buffer
  } catch {
    return null
  }
}

/** mime → 默認檔名後綴。 */
function extensionOfMime(mime) {
  const table = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  }
  return table[typeof mime === 'string' ? mime.toLowerCase() : ''] ?? 'png'
}

/**
 * 圖片字節寫系統剪貼板：先試 Electron，不成再退回 PowerShell + System.Windows.Forms。
 *
 * 為什麼必須有第二條路：DSH 宿主是**用 Electron 二進制跑 node**（環境裡帶
 * `ELECTRON_RUN_AS_NODE=1`），這種進程裡 `import('electron')` 拿到的是二進制路徑字符串，
 * 沒有 `nativeImage` / `clipboard`，所以 0.5.1 那條純 Electron 的鏈路在桌面版上必然
 * 報「Electron nativeImage 不可用」，用戶看到的就是「複製圖像 → 找不到地址」沒修好。
 * 文本剪貼板早就走 PowerShell 兜底了（見 writeClipboard），圖片這裡補齊同一套兜底。
 */
async function copyImageBufferToClipboard(buffer) {
  const errors = []
  const api = await electronApi()
  const nativeImage = api?.nativeImage
  const clipboard = api?.clipboard
  if (nativeImage !== undefined && typeof nativeImage.createFromBuffer === 'function' && clipboard !== undefined && typeof clipboard.writeImage === 'function') {
    try {
      const image = nativeImage.createFromBuffer(buffer)
      if (image === null || image === undefined || (typeof image.isEmpty === 'function' && image.isEmpty())) {
        throw new Error('無法解碼圖片字節')
      }
      clipboard.writeImage(image)
      return { via: 'electron-buffer', size: typeof image.getSize === 'function' ? image.getSize() : null }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  } else {
    errors.push('Electron nativeImage 不可用（ELECTRON_RUN_AS_NODE 環境）')
  }
  if (process.platform === 'win32') {
    const size = await clipboardImageViaPowerShell(buffer)
    return { via: 'powershell-clipboard', size }
  }
  throw new Error(errors.join('；'))
}

/**
 * Windows 上把圖片字節塞進剪貼板：PowerShell + System.Drawing / System.Windows.Forms。
 *
 * 字節經**文件**傳遞而不是命令行 —— 4 MB 的圖 base64 後 5.4 MB，命令行參數上限
 * （Windows CreateProcess 約 32 KB）根本放不下，臨時文件是唯一穩的路子。
 * 讀回來校驗（GetImage 非空）才算成功，否則拋錯讓上層回 500，不做假成功。
 */
async function clipboardImageViaPowerShell(buffer) {
  const tempPath = join(tmpdir(), `dsh-agent-menu-${Date.now()}-${Math.random().toString(16).slice(2)}.img`)
  writeFileSync(tempPath, buffer)
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `$bytes = [System.IO.File]::ReadAllBytes('${tempPath.replace(/'/g, "''")}')`,
    '$ms = New-Object System.IO.MemoryStream(,$bytes)',
    '$img = [System.Drawing.Image]::FromStream($ms)',
    '[System.Windows.Forms.Clipboard]::SetImage($img)',
    '$back = [System.Windows.Forms.Clipboard]::GetImage()',
    'if ($back -eq $null) { throw "剪貼板讀回為空" }',
    'Write-Output ("OK:" + $back.Width + "x" + $back.Height)',
    '$back.Dispose(); $img.Dispose(); $ms.Dispose()',
  ].join('; ')
  try {
    const stdout = await runPowerShellCapture(script)
    const matched = /OK:(\d+)x(\d+)/.exec(stdout)
    if (matched === null) throw new Error(`剪貼板寫入未確認：${stdout.trim().slice(0, 200)}`)
    return { width: Number(matched[1]), height: Number(matched[2]) }
  } finally {
    try {
      rmSync(tempPath, { force: true })
    } catch {
      /* 臨時文件刪不掉不影響結果 */
    }
  }
}

/** 起一個 PowerShell（優先 pwsh，退回 powershell.exe）跑腳本並收集 stdout。 */
function runPowerShellCapture(script) {
  const probe = (exe) =>
    new Promise((resolve, reject) => {
      const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code === 0) resolve(stdout)
        else reject(new Error(`${exe} 退出碼 ${String(code)}${stderr === '' ? '' : `：${stderr.trim().slice(0, 300)}`}`))
      })
    })
  return probe('pwsh.exe').catch(() => probe('powershell.exe'))
}

/**
 * 另存為的 PowerShell 兜底：System.Windows.Forms.SaveFileDialog 拿目標路徑再寫字節。
 * 同樣是 ELECTRON_RUN_AS_NODE 下的退路（Electron 的 dialog 在那裡也沒有）。
 * 用戶取消返回 saved:false reason:canceled，不回 500 —— 取消不是錯誤。
 * `extension` 不帶點（png / jpg…），只影響對話框的過濾器。
 */
async function saveBufferViaPowerShellDialog(buffer, name, extension) {
  const suggested = typeof name === 'string' && name.trim() !== '' ? name.trim() : `image.${extension}`
  const tempPath = join(tmpdir(), `dsh-agent-menu-${Date.now()}-${Math.random().toString(16).slice(2)}.img`)
  writeFileSync(tempPath, buffer)
  const safeName = suggested.replace(/'/g, "''")
  const filterExtensions = [extension, 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    .filter((item, index, all) => item !== '' && all.indexOf(item) === index)
    .map((item) => `*.${item}`)
    .join(';')
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dlg = New-Object System.Windows.Forms.SaveFileDialog',
    `$dlg.FileName = '${safeName}'`,
    `$dlg.Filter = '圖片|${filterExtensions}'`,
    'if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-Output "CANCEL"; exit 0 }',
    `Copy-Item -LiteralPath '${tempPath.replace(/'/g, "''")}' -Destination $dlg.FileName -Force`,
    'Write-Output ("SAVED:" + $dlg.FileName)',
  ].join('; ')
  try {
    const stdout = await runPowerShellCapture(script)
    if (stdout.includes('CANCEL')) return { saved: false, reason: 'canceled' }
    const matched = /SAVED:(.+)/.exec(stdout)
    if (matched === null) throw new Error(`另存為未確認：${stdout.trim().slice(0, 200)}`)
    return { saved: true, filePath: matched[1].trim() }
  } finally {
    try {
      rmSync(tempPath, { force: true })
    } catch {
      /* 臨時文件刪不掉不影響結果 */
    }
  }
}

/** 另存為：字節直接寫到用戶選的目標（同樣是副本，原圖留在會話裡）。 */
async function saveImageBufferAs(buffer, name, mime) {
  const api = await electronApi()
  const dialog = api?.dialog
  const extension = extensionOfMime(mime)
  const suggested = typeof name === 'string' && name.trim() !== '' ? name.trim() : `image.${extension}`
  if (dialog !== undefined && typeof dialog.showSaveDialog === 'function') {
    const result = await dialog.showSaveDialog({
      defaultPath: suggested,
      filters: [{ name: '圖片', extensions: [extension, 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    })
    if (result !== null && result !== undefined && result.canceled !== true && typeof result.filePath === 'string' && result.filePath !== '') {
      writeFileSync(result.filePath, buffer)
      return { saved: true, filePath: result.filePath }
    }
    if (result !== null && result !== undefined) return { saved: false, reason: 'canceled' }
  }
  // Electron 對話框不可用（桌面版宿主是 ELECTRON_RUN_AS_NODE）：退回 PowerShell。
  if (process.platform === 'win32') {
    return await saveBufferViaPowerShellDialog(buffer, suggested, extension)
  }
  return { saved: false, reason: 'canceled' }
}


// ── 会话删除（0.8.2）─────────────────────────────────────────────────────
// 宿主没有公开的会话删除接口；本路由复刻已验证的做法：
// 删 ~/.dsh/sessions/<工作区slug>/<编码后的会话id> 目录，再请 workspaceRegistry
// 取消归档（清掉 workspace.json 里的归档标记），最后由客户端 refresh 侧栏。
// 语义与 dsh-claude-style 的归档垃圾桶一致：占用中 409、目录已不在按 ghost 成功。

const SESSION_ID_RE = /^[A-Za-z0-9._\-:@]{1,200}$/

/** 会话 id → 磁盘目录名：非 [A-Za-z0-9._-] 字符编码为 ~XXXX（与宿主写目录的规则一致）。 */
function sessionDirectoryName(id) {
  if (id === '.') return '~002E'
  if (id === '..') return '~002E~002E'
  let out = ''
  for (const ch of id) {
    if (/[A-Za-z0-9._-]/.test(ch)) out += ch
    else out += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/** 会话日志根目录 ~/.dsh/sessions（优先用宿主给的 dshHomePath）。 */
function sessionsRoot(ctx) {
  try {
    if (typeof ctx.get === 'function') {
      const resolveHome = ctx.get('dshHomePath')
      if (typeof resolveHome === 'function') return resolveHome('sessions')
    }
  } catch {
    /* 拿不到就退回环境变量 */
  }
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'sessions')
}

/** 会话是否仍被打开（有运行实例）。查不到状态时保守视为打开。 */
function sessionIsLive(ctx, sessionId) {
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    if (sessions && typeof sessions.get === 'function') return sessions.get(sessionId) != null
    if (sessions && typeof sessions.list === 'function') {
      const items = sessions.list()
      return Array.isArray(items) && items.some((item) => item && item.sessionId === sessionId)
    }
  } catch {
    /* 出错按保守处理 */
  }
  return true
}

/** 清归档标记；会话本来没归档时宿主可能抛错，删除已完成，忽略即可。 */
async function unarchiveSessionQuietly(ctx, sessionId) {
  try {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined
    if (registry && typeof registry.unarchiveSession === 'function') await registry.unarchiveSession(sessionId)
  } catch {
    /* 见上 */
  }
}

async function deleteSessionById(ctx, res, sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) {
    sendJson(res, 400, { ok: false, error: 'invalid session id' })
    return
  }
  if (sessionIsLive(ctx, sessionId)) {
    sendJson(res, 409, { ok: false, error: 'session is open' })
    return
  }
  const root = sessionsRoot(ctx)
  const storedName = sessionDirectoryName(sessionId)
  try {
    const rootReal = realpathSync(root)
    let dir = ''
    for (const entry of readdirSync(root)) {
      const candidate = join(rootReal, entry, storedName)
      if (existsSync(candidate)) {
        dir = candidate
        break
      }
    }
    if (dir === '') {
      // 目录本就不在（ghost 会话）：清掉归档标记也算删干净。
      await unarchiveSessionQuietly(ctx, sessionId)
      sendJson(res, 200, { ok: true, ghost: true })
      return
    }
    const resolved = realpathSync(dir)
    if (!resolved.startsWith(rootReal + sep)) {
      sendJson(res, 403, { ok: false, error: '会话目录越出存储根' })
      return
    }
    if (sessionIsLive(ctx, sessionId)) {
      sendJson(res, 409, { ok: false, error: 'session is open' })
      return
    }
    rmSync(resolved, { recursive: true, force: true })
    await unarchiveSessionQuietly(ctx, sessionId)
    runtimeStats.sessionDelete += 1
    sendJson(res, 200, { ok: true, ghost: false })
  } catch (error) {
    runtimeStats.lastError = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { ok: false, error: runtimeStats.lastError })
  }
}


export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/agent-menu',
        handler: async (req, res) => {
          const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
          const action = pathname.slice('/agent-menu/'.length)
          if (action === 'ping') {
            sendJson(res, 200, { ok: true, platform: process.platform, hostVersion: HOST_VERSION })
            return
          }
          if (action === 'status' && (req.method === 'GET' || req.method === 'HEAD')) {
            sendJson(res, 200, {
              ok: true,
              hostVersion: HOST_VERSION,
              platform: process.platform,
              stats: runtimeStats,
              diag: diagLog.slice(-40),
            })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          // 圖片字節走 base64 上報，1 MiB 不夠（4 MB 的圖 base64 後約 5.4 MB），放寬到 32 MiB。
          const bodyLimit = action === 'copy-image-bytes' || action === 'save-image-bytes' ? 32 * 1024 * 1024 : 1024 * 1024
          const body = await readJsonBody(req, bodyLimit)

          // 会话删除：不解析路径，单独前置处理。
          if (action === 'session-delete') {
            const sessionId =
              body !== null && typeof body === 'object' && typeof body.sessionId === 'string' ? body.sessionId : ''
            await deleteSessionById(ctx, res, sessionId)
            return
          }

          // 客戶端自報：加載成功與彈菜單次數，用於在沒有瀏覽器控制台時確認狀態。
          if (action === 'hello') {
            runtimeStats.hello += 1
            runtimeStats.clientVersion =
              body !== null && typeof body === 'object' && typeof body.version === 'string' ? body.version : ''
            runtimeStats.lastHelloAt = new Date().toISOString()
            sendJson(res, 200, { ok: true, hostVersion: HOST_VERSION })
            return
          }
          if (action === 'menu') {
            runtimeStats.menuShown += 1
            sendJson(res, 200, { ok: true })
            return
          }
          // 客戶端行為明細：右鍵目標、識別路徑、菜單項、點擊項。
          if (action === 'diag') {
            runtimeStats.diag += 1
            diagLog.push(
              Object.assign(
                { at: new Date().toISOString(), seq: runtimeStats.diag },
                body !== null && typeof body === 'object' ? body : {},
              ),
            )
            if (diagLog.length > 200) diagLog.splice(0, diagLog.length - 200)
            sendJson(res, 200, { ok: true })
            return
          }

          if (action === 'clipboard') {
            const text = body !== null && typeof body === 'object' && typeof body.text === 'string' ? body.text : ''
            if (text === '') {
              sendJson(res, 400, { ok: false, error: '缺少 text' })
              return
            }
            try {
              const via = await writeClipboard(text)
              runtimeStats.clipboard += 1
              sendJson(res, 200, { ok: true, via, length: text.length })
            } catch (error) {
              runtimeStats.lastError = error instanceof Error ? error.message : String(error)
              sendJson(res, 500, { ok: false, error: runtimeStats.lastError })
            }
            return
          }

          // 圖片動作（0.5.1）：走字節。會話圖與草稿縮略圖都是 blob:，沒有本地路徑，
          // 只有渲染層能取到內容，所以由客戶端讀成 data URL 送來，這裡解回 Buffer。
          if (action === 'copy-image-bytes' || action === 'save-image-bytes') {
            const dataUrl =
              body !== null && typeof body === 'object' && typeof body.dataUrl === 'string' ? body.dataUrl : ''
            const buffer = bufferOfDataUrl(dataUrl)
            if (buffer === null) {
              sendJson(res, 400, { ok: false, error: '缺少或無法解析圖片字節（需要 base64 data URL）' })
              return
            }
            const name = body !== null && typeof body === 'object' && typeof body.name === 'string' ? body.name : ''
            const mime = body !== null && typeof body === 'object' && typeof body.mime === 'string' ? body.mime : ''
            try {
              const extra =
                action === 'copy-image-bytes'
                  ? await copyImageBufferToClipboard(buffer)
                  : await saveImageBufferAs(buffer, name, mime)
              if (action === 'copy-image-bytes') runtimeStats.copyImageBytes += 1
              else runtimeStats.saveImageBytes += 1
              sendJson(res, 200, { ok: true, action, bytes: buffer.length, ...extra })
            } catch (error) {
              runtimeStats.lastError = error instanceof Error ? error.message : String(error)
              sendJson(res, 500, { ok: false, error: runtimeStats.lastError })
            }
            return
          }

          // 圖片動作：copy-image / save-image（0.3.0 新增）。路徑由客戶端從
          // /api/file?path= 的 src 裡解出來後原樣傳回，宿主不再做相對解析。
          if (action === 'copy-image' || action === 'save-image') {
            const source =
              body !== null && typeof body === 'object' && typeof body.path === 'string' ? body.path : ''
            if (source === '') {
              sendJson(res, 400, { ok: false, error: '缺少 path' })
              return
            }
            if (!existsSync(source)) {
              sendJson(res, 404, { ok: false, error: '圖片不存在', path: source })
              return
            }
            try {
              const extra =
                action === 'copy-image' ? await copyImageToClipboard(source) : await saveImageAs(source)
              if (action === 'copy-image') runtimeStats.copyImage += 1
              else runtimeStats.saveImage += 1
              sendJson(res, 200, { ok: true, action, path: source, ...extra })
            } catch (error) {
              runtimeStats.lastError = error instanceof Error ? error.message : String(error)
              sendJson(res, 500, { ok: false, error: runtimeStats.lastError })
            }
            return
          }

          const target = resolveTarget(body)
          if (target === '') {
            sendJson(res, 400, { ok: false, error: '無法解析路徑（相對路徑需要 base）' })
            return
          }
          if (!existsSync(target)) {
            sendJson(res, 404, { ok: false, error: '路徑不存在', path: target })
            return
          }
          try {
            if (action === 'reveal') {
              await revealInFileManager(target, statSync(target).isDirectory())
              runtimeStats.reveal += 1
              sendJson(res, 200, { ok: true, action: 'reveal', path: target, platform: process.platform })
              return
            }
            if (action === 'open') {
              await openWithDefaultApp(target)
              runtimeStats.open += 1
              sendJson(res, 200, { ok: true, action: 'open', path: target })
              return
            }
            sendJson(res, 404, { ok: false, error: '未知操作' })
          } catch (error) {
            runtimeStats.lastError = error instanceof Error ? error.message : String(error)
            sendJson(res, 500, { ok: false, error: runtimeStats.lastError })
          }
        },
      }),
    'agent-menu: routes',
  )
}
