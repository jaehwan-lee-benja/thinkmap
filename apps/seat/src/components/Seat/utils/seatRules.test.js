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
  raiseMethodOf, optOf, OPT_NONE,
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

// ── 쓰기 헬퍼 (리팩토링 ⑵) ───────────────────────────────────────────────
// 여기 테스트의 목적은 «동작 동일» 증명이다 — 호출부 11곳이 손으로 맞추던 짝을 헬퍼로 옮겼을 뿐,
// 만들어지는 patch 는 같아야 한다.
import { raisePatch, unraisePatch, cancelPatch, uncancelPatch, deliverPatch, optOf, optPatch, isParallel, OPT_NONE } from './seatRules'

const NOW = '2026-08-09T07:00:00.000Z'

describe('raisePatch — raised ↔ seat_status 짝', () => {
  it('안 올라간 줄은 지금 시각을 찍는다', () => {
    expect(raisePatch(o(), NOW)).toEqual({ raised: true, raised_at: NOW, seat_status: 'raised', raise_canceled: null })
  })

  it('이미 올라간 줄은 원래 시각을 지킨다(다시 눌러도 통계가 어긋나지 않게)', () => {
    const old = '2026-08-09T05:00:00.000Z'
    expect(raisePatch(o({ raised: true, raised_at: old }), NOW).raised_at).toBe(old)
  })

  it('취소 이력을 항상 푼다 — 다시 올렸으니 «올림취소됨» 표시가 남으면 안 된다', () => {
    expect(raisePatch(o({ raise_canceled: 'outdoor' }), NOW).raise_canceled).toBe(null)
  })

  it('★구 호출부 3벌과 결과가 같다(도달 가능한 상태 전수)', () => {
    // 리팩토링 전 호출부들이 쓰던 식. raised=false 일 때 raised_at 은 항상 null 이므로(올림 해제 시 지운다)
    // 세 식이 갈리는 조합은 실제로 생기지 않는다 — 그 사실을 여기서 못박는다.
    const A = (x) => (x.raised ? x.raised_at : NOW)   // setOpt · setBoth
    const B = (x) => (x.raised_at || NOW)             // archiveNow
    const C = () => NOW                               // 올리기 체크박스
    for (const st of [o(), o({ raised: true, raised_at: '2026-08-09T05:00:00.000Z' })]) {
      expect(raisePatch(st, NOW).raised_at).toBe(A(st))
      expect(raisePatch(st, NOW).raised_at).toBe(B(st))
      if (!st.raised) expect(raisePatch(st, NOW).raised_at).toBe(C())
    }
  })
})

describe('unraisePatch — 이력 3갈래', () => {
  it('인자 없음 = 이력 손대지 않음(갈래 전환, R11)', () => {
    expect(unraisePatch()).toEqual({ raised: false, raised_at: null, seat_status: 'pending' })
    expect('raise_canceled' in unraisePatch()).toBe(false)
  })

  it('null = 이력 지움(자리순서 리셋)', () => {
    expect(unraisePatch(null).raise_canceled).toBe(null)
  })

  it('방식 문자열 = 그 방식으로 취소했음을 남김(R10)', () => {
    expect(unraisePatch('parallel').raise_canceled).toBe('parallel')
    // 그 값이 그대로 세부 텍스트가 된다
    expect(raiseDetailText(o({ ...unraisePatch('parallel') }))).toBe('올림취소됨(야외병행)')
  })
})

describe('취소 / 복귀 / 전달', () => {
  it('자리대기 취소 = 상태·자리순서·완료탭 셋이 함께 간다', () => {
    expect(cancelPatch(NOW)).toEqual({ seat_status: 'canceled', seat_order_alive: false, archived_at: NOW })
  })

  it('대기열로 = 올림 여부에 맞는 상태로 복원', () => {
    expect(uncancelPatch(o())).toEqual({ seat_status: 'pending', seat_order_alive: true })
    expect(uncancelPatch(o({ raised: true })).seat_status).toBe('raised')
  })

  it('자리후 전달(R8)', () => {
    expect(deliverPatch(NOW)).toEqual({ seat_status: 'pending', seat_delivered: true, delivered_at: NOW })
  })
})

describe('제조옵션 — 단일 선택 보장', () => {
  it('optOf ↔ optPatch 왕복', () => {
    for (const v of ['outdoor', 'takeout', 'parallel', OPT_NONE]) {
      expect(optOf({ ...o(), ...optPatch(v) })).toBe(v)
    }
  })

  it('★셋 중 둘이 켜진 상태를 만들 수 없다', () => {
    const patched = optPatch('parallel')
    expect(Object.values(patched).filter(Boolean).length).toBe(1)
    expect(optPatch(OPT_NONE)).toEqual({ opt_outdoor: false, opt_takeout: false, opt_outdoor_parallel: false })
  })

  it('isParallel — 완료 버튼 파랑의 근거', () => {
    expect(isParallel(o({ opt_outdoor_parallel: true }))).toBe(true)
    expect(isParallel(o({ opt_outdoor: true }))).toBe(false)
  })
})

describe('raiseMethodOf ↔ optOf — ★순서를 하나로 통일했다(2026-08-17, 실측으로 닫음)', () => {
  // 전에는 두 함수가 서로 다른 우선순위를 썼다(여기만 「포장 먼저」). 두 컬럼이 동시에 true 면
  // **화면 드롭다운은 「야외」인데 올림취소 이력은 「포장」**으로 갈렸다.
  // 미뤄 온 이유는 「구 데이터에 그런 행이 있는지 몰라서」였고, 프로덕션 읽기 1쿼리로 닫았다:
  //   294행 중 동시 true = 1행, 그 1행은 raised=false·raise_canceled=null 이라 이 함수가 호출조차 안 된다 ⇒ 영향 0.
  const O = (over) => ({ opt_outdoor: false, opt_takeout: false, opt_outdoor_parallel: false, ...over })

  it('★도달 가능한 모든 조합(하나만 true)에서 **동작 동일** — 통일이 기존 동작을 안 바꿨다는 증거', () => {
    // 쓰기 경로는 전부 optPatch 를 지나 «하나만 true» 를 보장한다. 그 전 구현의 답을 여기 그대로 적어 대조한다.
    const before = (o) => (o.opt_takeout ? 'takeout' : o.opt_outdoor ? 'outdoor' : o.opt_outdoor_parallel ? 'parallel' : 'direct')
    for (const over of [{}, { opt_outdoor: true }, { opt_takeout: true }, { opt_outdoor_parallel: true }]) {
      const o = O(over)
      expect(raiseMethodOf(o), JSON.stringify(over)).toBe(before(o))
    }
  })

  it('★동시 true 인 구 행에서는 이제 **드롭다운과 같은 라벨**을 낸다(전에는 갈렸다)', () => {
    // 이 한 줄이 이번 변경의 전부다. 이게 없으면 위 「동작 동일」만 남아 아무것도 안 바꾼 것처럼 보인다.
    const legacy = O({ opt_takeout: true, opt_outdoor: true })
    expect(optOf(legacy)).toBe('outdoor')
    expect(raiseMethodOf(legacy)).toBe('outdoor')   // 전에는 'takeout' 이었다
  })

  it('두 함수가 **한 순서만** 쓴다 — 셋 다 켜져도 답이 갈리지 않는다', () => {
    const all = O({ opt_takeout: true, opt_outdoor: true, opt_outdoor_parallel: true })
    expect(raiseMethodOf(all)).toBe(optOf(all))
  })

  it('옵션 없음은 direct — 「제조옵션 없음」과 「직접 올림」은 다른 낱말이라 여기서만 갈린다', () => {
    expect(optOf(O({}))).toBe(OPT_NONE)
    expect(raiseMethodOf(O({}))).toBe('direct')
    expect(raiseMethodOf(null)).toBe('direct')
  })
})
