import fs from 'node:fs/promises'
import path from 'node:path'
import type { ScanCandidate, ScanResult } from '../types'

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function walkDirectory(directoryPath: string, collector: Set<string>) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    const nextPath = path.resolve(directoryPath, entry.name)
    if (entry.isDirectory()) {
      await walkDirectory(nextPath, collector)
      continue
    }

    collector.add(nextPath)
  }
}

async function collectCandidateFiles(inputPaths: string[]) {
  const collector = new Set<string>()

  for (const inputPath of inputPaths) {
    const resolvedPath = path.resolve(inputPath)
    try {
      const stats = await fs.stat(resolvedPath)
      if (stats.isDirectory()) {
        await walkDirectory(resolvedPath, collector)
      } else {
        collector.add(resolvedPath)
      }
    } catch {
      collector.add(resolvedPath)
    }
  }

  return Array.from(collector)
}

function toGroupKey(directory: string, baseName: string) {
  return `${directory}::${baseName}`
}

export class FileScanner {
  async scanPaths(inputPaths: string[]): Promise<ScanResult> {
    const files = await collectCandidateFiles(inputPaths)
    const groups = new Map<string, ScanCandidate>()
    const ignoredPaths: string[] = []

    for (const filePath of files) {
      const extension = path.extname(filePath).toLowerCase()
      const directory = path.dirname(filePath)
      const baseName = path.basename(filePath, extension)

      if (extension !== '.session' && extension !== '.json') {
        ignoredPaths.push(filePath)
        continue
      }

      const key = toGroupKey(directory, baseName)
      const current =
        groups.get(key) ??
        ({
          baseName,
          directory,
          sessionPath: '',
          jsonPath: null
        } satisfies ScanCandidate)

      if (extension === '.session') current.sessionPath = filePath
      if (extension === '.json') current.jsonPath = filePath
      groups.set(key, current)
    }

    const candidates = Array.from(groups.values())
      .filter((item) => item.sessionPath)
      .sort((left, right) => left.sessionPath.localeCompare(right.sessionPath))

    return { candidates, ignoredPaths }
  }

  async scanFolder(folderPath: string): Promise<ScanResult> {
    const resolvedFolderPath = path.resolve(folderPath)
    const result = await this.scanPaths([resolvedFolderPath])
    return {
      folderPath: resolvedFolderPath,
      candidates: result.candidates,
      ignoredPaths: result.ignoredPaths
    }
  }

  async matchJsonForSession(sessionPath: string) {
    const resolvedSessionPath = path.resolve(sessionPath)
    const jsonPath = resolvedSessionPath.replace(/\.session$/i, '.json')
    return (await pathExists(jsonPath)) ? jsonPath : null
  }
}
