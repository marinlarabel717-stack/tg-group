import type { AccountClientProxyOptions } from './telegram-client-manager'

interface TelethonProxyPayload {
  type: 'http' | 'socks5'
  host: string
  port: number
  username?: string | null
  password?: string | null
}

export function supportsTelethonProxy(proxy?: AccountClientProxyOptions | null) {
  return !proxy || proxy.type === 'http' || proxy.type === 'https' || proxy.type === 'socks5'
}

export function serializeTelethonProxy(proxy?: AccountClientProxyOptions | null) {
  if (!proxy) return ''
  if (!supportsTelethonProxy(proxy)) return ''

  const type = proxy.type === 'socks5' ? 'socks5' : 'http'

  const payload: TelethonProxyPayload = {
    type,
    host: proxy.ip,
    port: proxy.port,
    username: proxy.username ?? null,
    password: proxy.password ?? null
  }

  return JSON.stringify(payload)
}
