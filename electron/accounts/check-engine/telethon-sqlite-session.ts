import { AuthKey } from 'telegram/crypto/AuthKey'
import { MemorySession } from 'telegram/sessions/Memory'

interface TelethonSqliteSessionParams {
  dcId: number
  serverAddress: string
  port: number
  authKey: Buffer
}

export class TelethonSqliteSession extends MemorySession {
  private readonly params: TelethonSqliteSessionParams

  constructor(params: TelethonSqliteSessionParams) {
    super()
    this.params = params
  }

  override async load() {
    this.setDC(this.params.dcId, this.params.serverAddress, this.params.port)
    const authKey = new AuthKey()
    await authKey.setKey(this.params.authKey)
    this.setAuthKey(authKey, this.params.dcId)
  }

  override save() {
    return undefined
  }
}
