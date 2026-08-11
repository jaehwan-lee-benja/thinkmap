// 스캔 실패의 «축» 판정 — 이 수정의 참양성을 여기서 잰다.
//
// 지키려는 명제: **«판정 없음»이 «거부»로 착지하지 않는다.**
//   ticket 축 = 이 종이는 못 쓴다 → 직원이 거부·안내한다(판정 끝)
//   system 축 = 지금 확인이 안 된다 → 직원이 다시 시도하거나 수기 확인한다(판정 없음)
// 이 둘이 섞이면 **서버 순단 시 직원이 유효한 참여권을 거부한다** — 그게 이 가드가 막는 사고다.
import { describe, it, expect } from 'vitest'
import { classifyFailure, FAIL_TICKET, FAIL_SYSTEM } from '../../apps/membership/src/components/Kiosk/useTicketScan.js'

describe('실패 축 분류 — 티켓 축(거부)', () => {
  // 서버가 «판정»을 내려 준 것들만 거부다.
  for (const code of ['not_found', 'bad_token', 'expired', 'voided', 'already_redeemed']) {
    it(`${code} → 거부`, () => expect(classifyFailure(code)).toBe(FAIL_TICKET))
  }
  it('Edge 가 감싼 문자열 안에 사유가 있어도 잡는다', () => {
    expect(classifyFailure('Error: not_found')).toBe(FAIL_TICKET)
  })
})

describe('★실패 주입 — 시스템 축으로 착지하는가(이 수정의 참양성)', () => {
  // 실제로 현장에서 나오는 실패 문자열들. 종전엔 이것들이 전부 빨강 «거부» 카드로 갔다.
  const injected = [
    ['네트워크 순단', 'Failed to fetch'],
    ['타임아웃', 'The operation was aborted due to timeout'],
    ['DNS/오프라인', 'NetworkError when attempting to fetch resource.'],
    ['5xx', 'Edge Function returned a non-2xx status code'],
    ['502 게이트웨이', 'Bad Gateway'],
    ['429 레이트리밋', 'rate_limited'],
    ['401 인증', 'Invalid JWT'],
    ['계약 미배선', 'CRM 데이터 연결 대기 — 배포 후 활성화'],
    ['빈 응답', ''],
    ['알 수 없는 코드', 'weird_unmapped_reason'],
  ]
  for (const [label, msg] of injected) {
    it(`${label} → 지연(거부 아님)`, () => {
      expect(classifyFailure(msg), `«${msg}» 가 거부로 착지하면 직원이 유효 참여권을 돌려보낸다`).toBe(FAIL_SYSTEM)
    })
  }

  it('★모르는 실패는 «거부»가 아니라 «지연» 쪽으로 떨어진다(안전 기본값)', () => {
    // 열거를 거부 쪽에 둔 설계의 핵심 — 목록에 없으면 전부 시스템 축이다.
    expect(classifyFailure('something nobody enumerated yet')).toBe(FAIL_SYSTEM)
    expect(classifyFailure(undefined)).toBe(FAIL_SYSTEM)
    expect(classifyFailure(null)).toBe(FAIL_SYSTEM)
  })
})

describe('전건이 비었을 때 그걸 말하는가 — 술어의 반대편', () => {
  it('거부 목록이 비어 있지 않다(비면 모든 실패가 지연으로 흘러 거부가 사라진다)', () => {
    // 반증 시험: 이 술어가 «틀린 상태에서 실패하는지»를 따로 잰다.
    expect(classifyFailure('not_found')).toBe(FAIL_TICKET)
    expect(FAIL_TICKET).not.toBe(FAIL_SYSTEM)
  })
})
