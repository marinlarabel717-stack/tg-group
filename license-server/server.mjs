import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import { LicenseServerService } from './service.mjs'
import { json, readJsonBody } from './utils.mjs'

const PORT = Number(process.env.LICENSE_SERVER_PORT || 8787)
const HOST = process.env.LICENSE_SERVER_HOST || '127.0.0.1'
const ADMIN_TOKEN = (process.env.LICENSE_ADMIN_TOKEN || 'dev-admin-token').trim()
const USING_DEFAULT_ADMIN_TOKEN = !process.env.LICENSE_ADMIN_TOKEN?.trim()
const ADMIN_PAGE_PATH = path.resolve(process.cwd(), 'license-server', 'admin.html')

const service = new LicenseServerService()

function getAdminTokenFromRequest(req) {
  const authHeader = req.headers.authorization || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }
  const headerToken = req.headers['x-admin-token']
  return typeof headerToken === 'string' ? headerToken.trim() : ''
}

function ensureAdminAuthorized(req, res) {
  if (!ADMIN_TOKEN) {
    json(res, 503, { ok: false, message: '管理员令牌未配置。' })
    return false
  }

  const token = getAdminTokenFromRequest(req)
  if (token !== ADMIN_TOKEN) {
    json(res, 401, { ok: false, message: '管理员令牌无效。' })
    return false
  }

  return true
}

function sendHtml(res, filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(content)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {
        ok: true,
        message: 'license server ok',
        adminTokenConfigured: Boolean(ADMIN_TOKEN),
        usingDefaultAdminToken: USING_DEFAULT_ADMIN_TOKEN
      })
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/admin')) {
      return sendHtml(res, ADMIN_PAGE_PATH)
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

    if (pathname.startsWith('/api/admin/')) {
      if (!ensureAdminAuthorized(req, res)) return
    }

    if (req.method === 'GET' && pathname === '/api/admin/session') {
      return json(res, 200, {
        ok: true,
        message: '管理员认证通过。',
        usingDefaultAdminToken: USING_DEFAULT_ADMIN_TOKEN
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
  if (USING_DEFAULT_ADMIN_TOKEN) {
    console.log('[license-server] warning: using default admin token "dev-admin-token". Set LICENSE_ADMIN_TOKEN in production.')
  }
})
