// 「빈 자리 문구는 전부 emptyText 를 거친다」 — 주장에 붙인 기계. (SEAT-SPEC §8.1)
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { emptyStateViolations, maskComments } from './emptyStateAudit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))   // …/components/Seat
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p, out)
    else if (/\.jsx$/.test(name)) out.push({ path: p.slice(ROOT.length), src: readFileSync(p, 'utf8') })
  }
  return out
}
const files = collect(ROOT)

describe('빈 상태 문구 — 「전부 emptyText 를 거친다」', () => {
  it('★볼 대상이 실제로 있다(도구의 0 을 세계의 0 으로 읽지 않기)', () => {
    // 파일을 못 읽거나 정규식이 죽으면 «위반 0» 이 나온다 — 그건 깨끗함이 아니라 눈이 먼 것이다.
    expect(files.length).toBeGreaterThan(5)
    const hits = files.flatMap((f) => [...f.src.matchAll(/—[^'"`]*없음\s*—/g)])
    expect(hits.length, '빈 자리 문구 자체가 사라졌다면 이 검사도 갱신해야 한다').toBeGreaterThan(0)
  })

  it('위반 0', () => {
    expect(emptyStateViolations(files).join('\n')).toBe('')
  })
})

describe('emptyStateAudit 자체 시험 — 깨뜨리면 잡는다', () => {
  it('★emptyText 를 안 거친 문구를 잡는다(2026-08-17 실제로 이 꼴이 살아 있었다)', () => {
    const bad = [{ path: 'X.jsx', src: `<QueueChips orders={w} empty="— 대기 없음 —" />` }]
    expect(emptyStateViolations(bad).join('\n')).toMatch(/emptyText 를 안 거친다/)
  })

  it('거친 것은 통과한다', () => {
    const ok = [{ path: 'X.jsx', src: `<QueueChips empty={emptyText(loadState, '— 대기 없음 —')} />` }]
    expect(emptyStateViolations(ok)).toEqual([])
  })

  it('한 줄에 둘이 있어도 각각 본다', () => {
    const mix = [{ path: 'X.jsx', src: `<a x={emptyText(s,'— 대기 없음 —')} y="— 올림 없음 —" />` }]
    const w = emptyStateViolations(mix)
    expect(w.length).toBe(1)
    expect(w[0]).toContain('올림')
  })

  it('★주석 안의 문구는 안 잡는다 — 안 그러면 «내가 쓴 주석»이 위반이 된다(실제로 잡혔다)', () => {
    const withComment = [{ path: 'X.jsx', src: `// 전에는 '— 없음 —' 이 기본값이었다\nconst a = 1` }]
    expect(emptyStateViolations(withComment)).toEqual([])
    const block = [{ path: 'X.jsx', src: `/* '— 대기 없음 —' 설명 */\nconst a = 1` }]
    expect(emptyStateViolations(block)).toEqual([])
  })

  it('주석 마스킹이 **길이를 보존**한다 — 안 그러면 앞줄 판정이 어긋난다(cssAudit 에서 겪은 것)', () => {
    const src = `// 주석\nconst x = 1`
    expect(maskComments(src).length).toBe(src.length)
  })

  it('주석을 지워도 **코드 쪽 위반은 그대로 잡는다**(마스킹이 눈을 멀게 하지 않는다)', () => {
    const mixed = [{ path: 'X.jsx', src: `// '— 없음 —' 은 옛 기본값\n<a empty="— 대기 없음 —" />` }]
    const w = emptyStateViolations(mixed)
    expect(w.length).toBe(1)
    expect(w[0]).toContain('대기')
  })

  it('빈 입력에는 조용하다(그건 «검사 안 함»이지 «깨끗함»이 아니다 — 위 첫 시험이 그걸 지킨다)', () => {
    expect(emptyStateViolations([])).toEqual([])
  })
})
