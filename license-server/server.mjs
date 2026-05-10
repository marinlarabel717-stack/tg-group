import http from 'node:http'
import { URL } from 'node:url'
import { LicenseServerService } from './service.mjs'
import { json, readJsonBody } from './utils.mjs'

const PORT = Number(process.env.LICENSE_SERVER_PORT || 8787)
const HOST = process.env.LICENSE_SERVER_HOST || '127.0.0.1'

const service = new LicenseServerService()

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, { ok: true, message: 'license server ok' })
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
})
