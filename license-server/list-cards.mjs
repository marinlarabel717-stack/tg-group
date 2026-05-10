import { LicenseServerService } from './service.mjs'

const service = new LicenseServerService()
console.log(JSON.stringify(service.listCards(), null, 2))

