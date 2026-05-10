import http from 'node:http'
import { LicenseServerService } from './service.mjs'
import { json, readJsonBody } from './utils.mjs'

const PORT = Number(process.env.LICENSE_SERVER_PORT || 8787)
const HOST = process.env.LICENSE_SERVER_HOST || '127.0.0.1'

const service = new LicenseServerService()

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, message: 'license server ok' })
    }

    if (req.method === 'POST' && req.url === '/api/license/activate') {
      const body = await readJsonBody(req)
      const result = service.activate(body)
      return json(res, result.statusCode, result.body)
    }

    if (req.method === 'POST' && req.url === '/api/license/validate') {
      const body = await readJsonBody(req)
      const result = service.validate(body)
      return json(res, result.statusCode, result.body)
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

