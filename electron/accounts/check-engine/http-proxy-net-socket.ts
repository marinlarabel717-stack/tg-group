import net from 'node:net'
import tls from 'node:tls'

type ProxyProtocol = 'http' | 'https'

interface HttpProxyOptions {
  ip: string
  port: number
  username?: string
  password?: string
  timeout?: number
  protocol?: ProxyProtocol
}

const closeError = new Error('NetSocket was closed')

function readHttpStatusCode(buffer: string) {
  const firstLine = buffer.split(/\r?\n/, 1)[0] || ''
  const match = firstLine.match(/\s(\d{3})\s/)
  return match ? Number(match[1]) : null
}

function createAuthHeader(proxy?: HttpProxyOptions) {
  if (!proxy?.username) return null
  return Buffer.from(`${proxy.username}:${proxy.password ?? ''}`, 'utf8').toString('base64')
}

export class HttpProxyPromisedNetSockets {
  client?: net.Socket | tls.TLSSocket
  closed = true
  stream = Buffer.alloc(0)
  private resolveRead?: (value: boolean) => void
  private canRead: Promise<boolean>
  private readonly proxy?: HttpProxyOptions

  constructor(proxy?: HttpProxyOptions) {
    this.proxy = proxy
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve
    })
  }

  async readExactly(number: number) {
    let readData = Buffer.alloc(0)
    while (true) {
      const thisTime = await this.read(number)
      readData = Buffer.concat([readData, thisTime])
      number -= thisTime.length
      if (!number || number === -437) {
        return readData
      }
    }
  }

  async read(number: number) {
    if (this.closed) throw closeError
    await this.canRead
    if (this.closed) throw closeError
    const toReturn = this.stream.slice(0, number)
    this.stream = this.stream.slice(number)
    if (this.stream.length === 0) {
      this.canRead = new Promise((resolve) => {
        this.resolveRead = resolve
      })
    }
    return toReturn
  }

  async readAll() {
    if (this.closed || !(await this.canRead)) {
      throw closeError
    }
    const toReturn = this.stream
    this.stream = Buffer.alloc(0)
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve
    })
    return toReturn
  }

  async connect(port: number, ip: string) {
    this.stream = Buffer.alloc(0)
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve
    })
    this.closed = false

    if (!this.proxy) {
      this.client = new net.Socket()
      return new Promise((resolve, reject) => {
        if (!this.client) return reject(new Error('Socket 初始化失败'))
        this.client.connect(port, ip, () => {
          this.receive()
          resolve(this)
        })
        this.client.on('error', reject)
        this.client.on('close', () => {
          if (this.resolveRead) this.resolveRead(false)
          this.closed = true
        })
      })
    }

    const authHeader = createAuthHeader(this.proxy)
    const proxySocket = this.proxy.protocol === 'https'
      ? tls.connect({
          host: this.proxy.ip,
          port: this.proxy.port,
          servername: this.proxy.ip,
          rejectUnauthorized: false
        })
      : net.connect({ host: this.proxy.ip, port: this.proxy.port })

    this.client = proxySocket
    const timeoutMs = (this.proxy.timeout || 8) * 1000

    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('代理 Socket 初始化失败'))

      let settled = false
      let responseBuffer = ''

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        this.client?.destroy()
        reject(error)
      }

      const finalizeConnect = () => {
        if (settled) return
        settled = true
        this.receive()
        resolve(this)
      }

      this.client.setTimeout(timeoutMs)
      this.client.on('timeout', () => fail(new Error('HTTP 代理连接超时')))
      this.client.on('error', (error) => fail(error instanceof Error ? error : new Error(String(error))))
      this.client.on('close', () => {
        if (this.resolveRead) this.resolveRead(false)
        this.closed = true
      })
      this.client.on('data', (chunk) => {
        if (settled) return
        responseBuffer += chunk.toString('utf8')
        if (!responseBuffer.includes('\r\n\r\n')) return
        const statusCode = readHttpStatusCode(responseBuffer)
        if (statusCode !== 200) {
          fail(new Error(statusCode ? `HTTP 代理 CONNECT 失败：${statusCode}` : 'HTTP 代理响应异常'))
          return
        }
        this.client?.removeAllListeners('data')
        finalizeConnect()
      })

      const onReady = () => {
        const requestLines = [
          `CONNECT ${ip}:${port} HTTP/1.1`,
          `Host: ${ip}:${port}`,
          'Proxy-Connection: Keep-Alive'
        ]
        if (authHeader) {
          requestLines.push(`Proxy-Authorization: Basic ${authHeader}`)
        }
        requestLines.push('', '')
        this.client?.write(requestLines.join('\r\n'))
      }

      if (this.proxy?.protocol === 'https') {
        ;(this.client as tls.TLSSocket).once('secureConnect', onReady)
      } else {
        this.client.once('connect', onReady)
      }
    })
  }

  write(data: Buffer) {
    if (this.closed) throw closeError
    this.client?.write(data)
  }

  async close() {
    if (this.client) {
      this.client.destroy()
      this.client.unref?.()
    }
    this.closed = true
  }

  async receive() {
    this.client?.on('data', async (message) => {
      this.stream = Buffer.concat([this.stream, message])
      if (this.resolveRead) {
        this.resolveRead(true)
      }
    })
  }

  toString() {
    return 'HttpProxyPromisedNetSocket'
  }
}
