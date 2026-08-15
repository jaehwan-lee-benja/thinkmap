// 판정 디바운스 큐 회귀 시험 — 계약 §5(240/min) 대응의 «실제 동작»을 잰다.
//
// ★왜 시험이 필요한가: 이 큐가 조용히 실패하면 «화면엔 판정이 보이는데 서버엔 안 저장된» 상태가 된다.
//   오늘 하루 반복해 다룬 «조용한 실패» 그 형태라, 세 가지를 못박아 둔다:
//     ⑴ 여러 탭이 «한 번»에 나가는가(상한 대응의 본질)
//     ⑵ 같은 품목 연타는 «마지막 것만» 남는가(중간 판정은 보낼 이유가 없다)
//     ⑶ 전송 실패가 «삼켜지지» 않고 되돌아와 다음 flush 에 실리는가
import { describe, it, expect, vi } from 'vitest'

// 어댑터는 supabase(@thinkmap/core)를 import 한다 — 노드 환경엔 없으니 모듈을 대체한다.
vi.mock('@thinkmap/core', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }) } } }))

const { createVerdictQueue } = await import('./expenseSource.js')

const tick = (ms) => new Promise((r) => setTimeout(r, ms))

describe('판정 디바운스 큐', () => {
  it('★여러 탭이 «한 번»의 배치로 나간다', async () => {
    const sent = []
    const send = async (b) => { sent.push(b); return { applied: b.length, unknown_keys: [] } }
    const q = createVerdictQueue({ waitMs: 20, send, onFlushed: () => {} })
    q.push('a', '사업-원재료'); q.push('b', '개인'); q.push('c', '사업-운영')
    await tick(60)
    expect(sent.length).toBe(1)               // 3탭 → 요청 1회
    expect(sent[0].map((v) => v.item_key).sort()).toEqual(['a', 'b', 'c'])
  })

  it('★같은 품목 연타는 «마지막 것만» 남는다', async () => {
    const sent = []
    const send = async (b) => { sent.push(b); return { applied: b.length, unknown_keys: [] } }
    const q = createVerdictQueue({ waitMs: 20, send, onFlushed: () => {} })
    q.push('a', '개인'); q.push('a', '사업-운영'); q.push('a', '사업-원재료')
    await tick(60)
    expect(sent[0]).toEqual([{ item_key: 'a', button: '사업-원재료' }])
  })

  it('★전송 실패는 «삼켜지지» 않고 큐에 되돌아온다', async () => {
    // 전송을 «실패하는 것»으로 주입한다 — 큐가 오류를 보고하고 판정을 되돌려 넣는지가 논점이다.
    const errs = []
    const send = async () => { throw new Error('네트워크 실패') }
    const q = createVerdictQueue({ waitMs: 10, send, onError: (e, batch) => errs.push(batch) })
    q.push('a', '개인')
    await tick(40)
    expect(errs.length).toBe(1)               // 오류가 «보고»됐다
    expect(q.size).toBe(1)                    // ★그리고 판정이 살아 있다 — 다음 flush 에 실린다
  })

  it('flushNow 는 대기 중인 것을 즉시 밀어낸다(떠나기 전 안전망)', async () => {
    const q = createVerdictQueue({ waitMs: 10_000, send: async () => ({ applied: 1 }), onError: () => {} })
    q.push('a', '개인')
    expect(q.size).toBe(1)
    await q.flushNow()
    expect(q.size).toBe(0)                    // 타이머(10초)를 안 기다리고 즉시 비웠다
  })
})
