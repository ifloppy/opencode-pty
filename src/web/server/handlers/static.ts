import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSET_CONTENT_TYPES } from '../../shared/constants.ts'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = join(MODULE_DIR, '../../../../../dist/web')
const STATIC_DIR_SRC = join(MODULE_DIR, '../../../../dist/web')

export interface StaticAsset {
  bytes: Buffer
  contentType: string
}

function resolveStaticDir(): string {
  if (existsSync(STATIC_DIR)) return STATIC_DIR
  if (existsSync(STATIC_DIR_SRC)) return STATIC_DIR_SRC
  return STATIC_DIR
}

export async function buildStaticRoutes(): Promise<Record<string, StaticAsset>> {
  const dir = resolveStaticDir()
  const routes: Record<string, StaticAsset> = {}
  const files = readdirSync(dir, { recursive: true })
  for (const file of files) {
    if (typeof file === 'string' && !statSync(join(dir, file)).isDirectory()) {
      const ext = extname(file)
      const routeKey = `/${file.replace(/\\/g, '/')}`
      routes[routeKey] = {
        bytes: readFileSync(join(dir, file)),
        contentType: ASSET_CONTENT_TYPES[ext] || 'application/octet-stream',
      }
    }
  }
  return routes
}
