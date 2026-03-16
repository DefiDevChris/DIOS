import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const BASE_DIR = path.join(app.getPath('home'), 'DIOS Studio', 'DIOS Master Inspections Database')

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_')
}

export function getFilePath(pathSegments: string[], fileName: string): string {
  const sanitized = pathSegments.map(sanitize)
  return path.join(BASE_DIR, ...sanitized, sanitize(fileName))
}

export function saveFile(
  pathSegments: string[],
  fileName: string,
  data: Buffer,
): string {
  const filePath = getFilePath(pathSegments, fileName)
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, data)
  return filePath
}

export function readFile(filePath: string): Buffer | null {
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(BASE_DIR)) return null
  try {
    return fs.readFileSync(resolved)
  } catch {
    return null
  }
}

export function deleteFile(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(BASE_DIR)) return false
  try {
    fs.unlinkSync(resolved)
    return true
  } catch {
    return false
  }
}

export function listFiles(pathSegments: string[]): string[] {
  const dir = path.join(BASE_DIR, ...pathSegments.map(sanitize))

  if (!fs.existsSync(dir)) return []

  const results: string[] = []
  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else {
        results.push(fullPath)
      }
    }
  }
  walk(dir)
  return results
}

export function getBaseDir(): string {
  return BASE_DIR
}
