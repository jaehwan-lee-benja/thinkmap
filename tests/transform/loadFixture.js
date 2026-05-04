// 픽스처 로딩 + placeholder 치환 유틸. WORKLOG-SPEC.md §3.7.4.
//
// "<<expectedDocFromBlocks>>" 같은 self-reference 토큰을 해당 키의 실제 값으로 치환.
// 픽스처 작성 시 prevDoc/nextDoc 이 expectedDocFromBlocks 와 동일할 때 중복을 줄이는 장치.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'daily-blocks')

const PLACEHOLDER_RE = /^<<(\w+)>>$/

function resolvePlaceholders(value, root) {
  if (typeof value === 'string') {
    const m = value.match(PLACEHOLDER_RE)
    if (m) {
      const key = m[1]
      if (!(key in root)) {
        throw new Error(`Fixture placeholder <<${key}>> referenced but key missing`)
      }
      return root[key]
    }
    return value
  }
  if (Array.isArray(value)) return value.map(v => resolvePlaceholders(v, root))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolvePlaceholders(v, root)
    }
    return out
  }
  return value
}

export function loadFixture(filename) {
  const path = join(FIXTURES_DIR, filename)
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return resolvePlaceholders(raw, raw)
}

export function listFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
}
