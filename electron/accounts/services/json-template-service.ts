import fs from 'node:fs/promises'
import path from 'node:path'
import type { AccountJsonProfile } from '../types'

const DEFAULT_JSON_TEMPLATE: AccountJsonProfile = {
  phone: '',
  username: '',
  userId: '',
  country: '',
  sessionName: '',
  sessionFile: '',
  importedAt: '',
  note: 'waiting-for-standard-template',
  tags: []
}

function inferPhoneFromBaseName(baseName: string) {
  return /^\d{5,}$/.test(baseName) ? baseName : ''
}

function normalizeProfile(value: unknown): AccountJsonProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_JSON_TEMPLATE }
  }

  return {
    ...DEFAULT_JSON_TEMPLATE,
    ...(value as AccountJsonProfile)
  }
}

export class JsonTemplateService {
  async readProfile(jsonPath: string) {
    const raw = await fs.readFile(jsonPath, 'utf8')
    return normalizeProfile(JSON.parse(raw))
  }

  buildTemplate(sessionPath: string, partial?: AccountJsonProfile): AccountJsonProfile {
    const baseName = path.basename(sessionPath, path.extname(sessionPath))

    return {
      ...DEFAULT_JSON_TEMPLATE,
      ...partial,
      phone: partial?.phone ?? inferPhoneFromBaseName(baseName),
      username: partial?.username ?? '',
      userId: partial?.userId ?? '',
      country: partial?.country ?? '',
      sessionName: partial?.sessionName ?? baseName,
      sessionFile: partial?.sessionFile ?? path.basename(sessionPath),
      importedAt: partial?.importedAt ?? new Date().toISOString(),
      note: partial?.note ?? DEFAULT_JSON_TEMPLATE.note,
      tags: partial?.tags ?? []
    }
  }

  async ensureJsonForSession(sessionPath: string, existingJsonPath: string | null) {
    if (existingJsonPath) {
      return { jsonPath: existingJsonPath, generated: false }
    }

    const resolvedSessionPath = path.resolve(sessionPath)
    const jsonPath = resolvedSessionPath.replace(/\.session$/i, '.json')
    const template = this.buildTemplate(resolvedSessionPath)

    await fs.writeFile(jsonPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
    return { jsonPath, generated: true }
  }
}
