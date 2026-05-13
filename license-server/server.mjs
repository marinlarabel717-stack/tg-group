import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { URL } from 'node:url'
import { LicenseServerService } from './service.mjs'
import { json, readJsonBody } from './utils.mjs'

const PORT = Number(process.env.LICENSE_SERVER_PORT || 8787)
const HOST = process.env.LICENSE_SERVER_HOST || '127.0.0.1'
const ADMIN_USERNAME = (process.env.LICENSE_ADMIN_USERNAME || 'adminTG').trim()
const ADMIN_PASSWORD = process.env.LICENSE_ADMIN_PASSWORD || '968574..'
const ADMIN_PAGE_PATH = path.resolve(process.cwd(), 'license-server', 'admin.html')
const RELEASES_ROOT_PATH = path.resolve(process.cwd(), 'license-server', 'releases')
const ADMIN_COOKIE_NAME = 'tgmatrix_admin_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

fs.mkdirSync(RELEASES_ROOT_PATH, { recursive: true })

const service = new LicenseServerService()
const sessions = new Map()

function parseCookies(req) {
  const raw = req.headers.cookie || ''
  const entries = raw.split(';').map((item) => item.trim()).filter(Boolean)
  const cookies = {}
  for (const entry of entries) {
    const index = entry.indexOf('=')
    if (index <= 0) continue
    const key = entry.slice(0, index).trim()
    const value = entry.slice(index + 1).trim()
    cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function setSessionCookie(res, token, expiresAt) {
  const cookie = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Expires=${new Date(expiresAt).toUTCString()}`
  ]
  res.setHeader('Set-Cookie', cookie.join('; '))
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function createSession(username) {
  const token = randomBytes(24).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, { username, expiresAt })
  return { token, expiresAt }
}

function readSession(req) {
  const cookies = parseCookies(req)
  const token = cookies[ADMIN_COOKIE_NAME]
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return { token, ...session }
}

function ensureAdminAuthorized(req, res) {
  const session = readSession(req)
  if (!session) {
    clearSessionCookie(res)
    json(res, 401, { ok: false, message: '请先登录管理后台。' })
    return null
  }
  return session
}

function sendHtml(res, filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(content)
}

function readMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.exe') return 'application/vnd.microsoft.portable-executable'
  if (ext === '.blockmap') return 'application/octet-stream'
  return 'application/octet-stream'
}

function sendReleaseFile(res, pathname) {
  const relativePath = pathname.replace(/^\/releases\//, '')
  if (!relativePath) {
    return json(res, 404, { ok: false, message: 'release file not found' })
  }

  const resolvedPath = path.resolve(RELEASES_ROOT_PATH, relativePath)
  if (!resolvedPath.startsWith(RELEASES_ROOT_PATH)) {
    return json(res, 403, { ok: false, message: 'forbidden' })
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return json(res, 404, { ok: false, message: 'release file not found' })
  }

  res.writeHead(200, {
    'content-type': readMimeType(resolvedPath),
    'content-length': String(fs.statSync(resolvedPath).size),
    'cache-control': 'no-cache'
  })
  fs.createReadStream(resolvedPath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {
        ok: true,
        message: 'license server ok',
        adminUsernameConfigured: Boolean(ADMIN_USERNAME),
        loginMode: 'username-password'
      })
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/admin')) {
      return sendHtml(res, ADMIN_PAGE_PATH)
    }

    if (req.method === 'GET' && pathname.startsWith('/releases/')) {
      return sendReleaseFile(res, pathname)
    }

    if (req.method === 'POST' && pathname === '/api/license/activate') {
      const body = await readJsonBody(req)
      const result = service.activate(body)
      return json(res, result.statusCode, result.body)
    }

    if (req.method === 'POST' && pathname === '/api/license/validate') {
      const body = await readJsonBody(req)
      const result = service.validate(body)
      return json(res, result.statusCode, result.body)
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const body = await readJsonBody(req)
      const username = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!safeEqualText(username, ADMIN_USERNAME) || !safeEqualText(password, ADMIN_PASSWORD)) {
        clearSessionCookie(res)
        return json(res, 401, { ok: false, message: '账号或密码不对。' })
      }
      const session = createSession(ADMIN_USERNAME)
      setSessionCookie(res, session.token, session.expiresAt)
      return json(res, 200, {
        ok: true,
        message: '登录成功。',
        username: ADMIN_USERNAME,
        expiresAt: new Date(session.expiresAt).toISOString()
      })
    }

    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      const session = readSession(req)
      if (session?.token) {
        sessions.delete(session.token)
      }
      clearSessionCookie(res)
      return json(res, 200, { ok: true, message: '已退出登录。' })
    }

    if (pathname.startsWith('/api/admin/')) {
      const session = ensureAdminAuthorized(req, res)
      if (!session) return

      if (req.method === 'GET' && pathname === '/api/admin/session') {
        return json(res, 200, {
          ok: true,
          message: '管理员认证通过。',
          username: session.username,
          expiresAt: new Date(session.expiresAt).toISOString()
        })
      }

      if (req.method === 'GET' && pathname === '/api/admin/cards') {
        return json(res, 200, { ok: true, items: service.listCards() })
      }

      if (req.method === 'GET' && pathname === '/api/admin/card') {
        const cardKey = url.searchParams.get('cardKey') || ''
        return json(res, 200, { ok: true, item: service.getCard(cardKey) })
      }

      if (req.method === 'GET' && pathname === '/api/admin/logs') {
        const cardKey = url.searchParams.get('cardKey') || ''
        const limit = Number(url.searchParams.get('limit') || '50')
        return json(res, 200, { ok: true, items: service.listLogs({ cardKey, limit }) })
      }

      if (req.method === 'POST' && pathname === '/api/admin/cards/create') {
        const body = await readJsonBody(req)
        const item = service.createCard(body)
        return json(res, 200, { ok: true, message: '卡密创建成功。', item })
      }

      if (req.method === 'POST' && pathname === '/api/admin/cards/batch-create') {
        const body = await readJsonBody(req)
        const items = service.createCardsBatch(body)
        return json(res, 200, { ok: true, message: `批量创建成功，共 ${items.length} 张卡密。`, items })
      }

      if (req.method === 'POST' && pathname === '/api/admin/cards/disable') {
        const body = await readJsonBody(req)
        const item = service.disableCard({
          cardKey: body.cardKey,
          disabled: body.disabled !== false,
          note: body.note || ''
        })
        return json(res, 200, { ok: true, message: body.disabled === false ? '卡密已启用。' : '卡密已禁用。', item })
      }

      if (req.method === 'POST' && pathname === '/api/admin/cards/extend') {
        const body = await readJsonBody(req)
        const item = service.extendCard({
          cardKey: body.cardKey,
          days: body.days,
          note: body.note || ''
        })
        return json(res, 200, { ok: true, message: '卡密已延期。', item })
      }

      if (req.method === 'POST' && pathname === '/api/admin/cards/reset-devices') {
        const body = await readJsonBody(req)
        const item = service.resetDevices({
          cardKey: body.cardKey,
          note: body.note || ''
        })
        return json(res, 200, { ok: true, message: `已重置 ${item.clearedDevices} 台设备。`, item })
      }
    }

    return json(res, 404, { ok: false, message: 'not found' })
  } catch (error) {
    return json(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : 'server error'
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[license-server] listening on http://${HOST}:${PORT}`)
  console.log(`[license-server] admin login: ${ADMIN_USERNAME}`)
})
