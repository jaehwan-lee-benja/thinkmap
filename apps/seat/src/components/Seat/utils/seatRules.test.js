// 자리후 규칙(R1~R12) 판정표 — 순수 함수라 값싸고, **쓰기 경로 리팩토링의 안전망**이다.
// 리팩토링 라운드 ⑸(2026-08-09). 지금은 «현재 동작을 못박는» 용도다 — 여기가 빨개지면 리팩토링이 동작을 바꾼 것이다.
//
// 실행: 레포 루트에서 `npx vitest run apps/seat` (vitest 는 루트에 호이스팅돼 있다).
import { describe, it, expect } from 'vitest'
import {
  hasManufactureOption, isDineIn, removesFromSeatQueue, isSeatWaiting,
  isTakeoutMaybe, deliverModeLabel, showsTakeoutLabel, raiseIgnored,
  isWaitingOrder, isRaisedOrder, isArchived,
  raiseDetailText, orderLabel, groupByQueue, queueSuffixes,
} from './seatRules'

// 최소 주문 — 실제 컬럼 기본값과 같게(DB DEFAULT 기준).
const o = (over = {}) => ({
  id: 'x', queue_no: 1, order_no: null, order_origin: 'dine_in',
  seat_status: 'pending', seat_delivered: false, deliver_mode: null,
  seated: false, raised: false, seat_order_alive: true,
  opt_outdoor: false, opt_takeout: false, opt_outdoor_parallel: false,
  archived_at: null, raise_canceled: null, ...over,
})

describe('R1 제조옵션 / 자리큐', () => {
  it('옵션이 하나라도 있으면 자리후가 아니다', () => {
    expect(hasManufactureOption(o())).toBe(false)
    expect(isSeatWaiting(o())).toBe(true)
    for (const k of ['opt_outdoor', 'opt_takeout', 'opt_outdoor_parallel']) {
      expect(hasManufactureOption(o({ [k]: true }))).toBe(true)
      expect(isSeatWaiting(o({ [k]: true }))).toBe(false)
    }
  })

  it('★자리순서에서 빠지는 건 야외·포장뿐 — 야외병행은 유지된다', () => {
    expect(removesFromSeatQueue(o({ opt_outdoor: true }))).toBe(true)
    expect(removesFromSeatQueue(o({ opt_takeout: true }))).toBe(true)
    // 야외병행이 «올렸는데 아직 자리 안내가 남은» 유일한 상태인 근거(완료 버튼 파랑도 여기서 나온다).
    expect(removesFromSeatQueue(o({ opt_outdoor_parallel: true }))).toBe(false)
  })
})

describe('R9 시작 갈래', () => {
  it('값이 없으면 실내로 본다(구데이터 하위호환)', () => {
    expect(isDineIn({})).toBe(true)
    expect(isDineIn(o({ order_origin: 'takeout' }))).toBe(false)
    expect(isDineIn(o({ order_origin: 'outdoor' }))).toBe(false)
  })
})

describe('R11 포장도고려(deliver_mode)', () => {
  it('매장 영수증 = 올림은 평소대로 + 포장 라벨', () => {
    const x = o({ deliver_mode: 'maybe_store' })
    expect(isTakeoutMaybe(x)).toBe(true)
    expect(showsTakeoutLabel(x)).toBe(true)
    expect(raiseIgnored(x)).toBe(false)
    expect(deliverModeLabel(x)).toBe('포장도고려(매장)')
  })

  it('포장 영수증 = 올림 자체가 무시된다', () => {
    const x = o({ deliver_mode: 'maybe_receipt' })
    expect(isTakeoutMaybe(x)).toBe(true)
    expect(showsTakeoutLabel(x)).toBe(false)
    expect(raiseIgnored(x)).toBe(true)
  })

  it('제조옵션 포장도 라벨을 붙인다', () => {
    expect(showsTakeoutLabel(o({ opt_takeout: true }))).toBe(true)
  })

  it('없음/모르는 값은 일반 전달', () => {
    expect(isTakeoutMaybe(o())).toBe(false)
    expect(isTakeoutMaybe(o({ deliver_mode: 'nonsense' }))).toBe(false)
    expect(deliverModeLabel(o())).toBe('')
  })
})

describe('스테이션 목록 분류 (대기 / 올라감)', () => {
  const delivered = (over = {}) => o({ seat_delivered: true, ...over })

  it('대기 = 실내 + 전달됨 + 아직 안 올라감', () => {
    expect(isWaitingOrder(delivered())).toBe(true)
    expect(isWaitingOrder(o())).toBe(false)                       // 전달 전
    expect(isWaitingOrder(delivered({ raised: true }))).toBe(false) // 이미 올라감
  })

  it('자리앉음(seat_order_alive=false)이어도 대기에 남는다', () => {
    expect(isWaitingOrder(delivered({ seated: true, seat_order_alive: false }))).toBe(true)
  })

  it('야외·포장은 대기에서 빠지고, 야외병행은 남는다', () => {
    expect(isWaitingOrder(delivered({ opt_outdoor: true }))).toBe(false)
    expect(isWaitingOrder(delivered({ opt_takeout: true }))).toBe(false)
    expect(isWaitingOrder(delivered({ opt_outdoor_parallel: true }))).toBe(true)
  })

  it('R11 포장영수증·R12 아카이브·취소는 대기에서 빠진다', () => {
    expect(isWaitingOrder(delivered({ deliver_mode: 'maybe_receipt' }))).toBe(false)
    expect(isWaitingOrder(delivered({ archived_at: '2026-08-09T00:00:00Z' }))).toBe(false)
    expect(isWaitingOrder(delivered({ seat_status: 'canceled' }))).toBe(false)
  })

  it('★올라감은 아카이빙과 무관하게 유지된다(제조 판단은 스테이션 몫, R6)', () => {
    expect(isRaisedOrder(o({ raised: true }))).toBe(true)
    expect(isRaisedOrder(o({ raised: true, archived_at: '2026-08-09T00:00:00Z' }))).toBe(true)
    expect(isRaisedOrder(o({ raised: true, deliver_mode: 'maybe_receipt' }))).toBe(false)
  })
})

describe('R12 아카이브', () => {
  it('archived_at 이 있으면 완료', () => {
    expect(isArchived(o())).toBe(false)
    expect(isArchived(o({ archived_at: '2026-08-09T00:00:00Z' }))).toBe(true)
  })
})

describe('R10 올림 세부 텍스트', () => {
  it('취소 이력이 최우선', () => {
    expect(raiseDetailText(o({ raise_canceled: 'outdoor' }))).toBe('올림취소됨(야외)')
    expect(raiseDetailText(o({ raised: true, raise_canceled: 'direct' }))).toBe('올림취소됨(직접체크)')
  })

  it('올림 경로별 라벨', () => {
    expect(raiseDetailText(o())).toBe('')
    expect(raiseDetailText(o({ raised: true }))).toBe('직접체크')
    expect(raiseDetailText(o({ raised: true, opt_takeout: true }))).toBe('포장으로변경')
    expect(raiseDetailText(o({ raised: true, opt_outdoor: true }))).toBe('야외')
    expect(raiseDetailText(o({ raised: true, opt_outdoor_parallel: true }))).toBe('야외병행')
  })
})

describe('표시 헬퍼', () => {
  it('주문번호 우선, 없으면 대기번호', () => {
    expect(orderLabel(o({ order_no: '103' }))).toBe('103')
    expect(orderLabel(o({ queue_no: 7 }))).toBe('7')
    expect(orderLabel({ })).toBe('-')
  })

  it('groupByQueue — 같은 번호를 붙이되 첫 등장 위치를 지킨다', () => {
    const list = [
      { id: 'a', queue_no: 1 }, { id: 'b', queue_no: 2 },
      { id: 'c', queue_no: 1 }, { id: 'd', queue_no: null },
    ]
    expect(groupByQueue(list).map((x) => x.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('groupByQueue — 원본 배열을 건드리지 않는다(표시 전용)', () => {
    const list = [{ id: 'a', queue_no: 2 }, { id: 'b', queue_no: 1 }, { id: 'c', queue_no: 2 }]
    const snapshot = list.map((x) => x.id)
    groupByQueue(list)
    expect(list.map((x) => x.id)).toEqual(snapshot)
  })

  it('queueSuffixes — 중복 번호에만 a,b 를 준다', () => {
    const map = queueSuffixes([
      { id: 'a', queue_no: 1 }, { id: 'b', queue_no: 1 },
      { id: 'c', queue_no: 2 }, { id: 'd', queue_no: null },
    ])
    expect(map).toEqual({ a: 'a', b: 'b' })
  })
})
