import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const BASE_DIR = path.join(app.getPath('home'), 'DIOS Studio')

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_')
}

export function getFilePath(operationName: string, year: string, fileName: string): string {
  return path.join(BASE_DIR, sanitize(operationName), sanitize(year), sanitize(fileName))
}

export function saveFile(
  operationName: string,
  year: string,
  fileName: string,
  data: Buffer,
): string {
  const filePath = getFilePath(operationName, year, fileName)
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, data)
  return filePath
}

export function readFile(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export function listFiles(operationName: string, year?: string): string[] {
  const dir = year
    ? path.join(BASE_DIR, sanitize(operationName), sanitize(year))
    : path.join(BASE_DIR, sanitize(operationName))

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
