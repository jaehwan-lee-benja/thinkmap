// seatLoadState — ★「읽기 실패가 『주문 없음』으로 착지하지 않는다」를 시험으로 못 박는다.
//
// 이 시험의 성질(교본 «가드 도입 커밋엔 변이 시험 필수»): 세 상태가 **서로 다른 문구**를 내는지까지 본다.
//   상태가 갈리는지만 보면, 나중에 문구를 하나로 합쳐도 초록불이 유지된다 — 그러면 결함이 되돌아온다.
//   결함의 정의 자체가 「세 사실이 같은 화면으로 착지한다」였으므로, 시험도 **문구가 갈리는지**를 봐야 한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataLoadState, emptyText, backoffMs, syncWarning, syncTransition, BACKOFF_MS, POLL_MS } from './seatLoadState'

const READY = '주문이 없습니다.'

describe('dataLoadState — 빈 화면의 근거는 length 가 아니라 «읽기 성공»이다', () => {
  it('읽기 실패 = failed (★이 한 줄이 단일점 ② 그 자체다)', () => {
    expect(dataLoadState({ live: true, errors: [new Error('boom')], loadedAt: null })).toBe('failed')
  })

  it('★성공한 적이 있어도, 그 뒤 실패하면 failed 다 — 낡은 화면을 「최신」으로 착지시키지 않는다', () => {
    expect(dataLoadState({ live: true, errors: [new Error('boom')], loadedAt: 1723000000000 })).toBe('failed')
  })

  it('주문·스테이션 중 **하나만** 실패해도 failed — 부분 성공은 정상이 아니다(한 화면이다)', () => {
    expect(dataLoadState({ live: true, errors: [null, new Error('x')], loadedAt: 1 })).toBe('failed')
    expect(dataLoadState({ live: true, errors: [new Error('x'), null], loadedAt: 1 })).toBe('failed')
  })

  it('아직 한 번도 성공 못 했으면 loading — 「없다」고 말할 근거가 없다', () => {
    expect(dataLoadState({ live: true, errors: [], loadedAt: null })).toBe('loading')
  })

  it('성공했고 실패 없음 = ready — 이때만 「없습니다」라고 말할 수 있다', () => {
    expect(dataLoadState({ live: true, errors: [null, null], loadedAt: 1723000000000 })).toBe('ready')
  })

  it('프리뷰·정적 데모(live=false)는 네트워크가 없다 → 항상 ready', () => {
    // 실패할 읽기가 없는데 「불러오지 못했습니다」를 띄우면 그게 오탐이다. 오탐은 가드를 죽인다.
    expect(dataLoadState({ live: false, errors: [new Error('무시돼야 한다')], loadedAt: null })).toBe('ready')
  })

  it('인자를 덜 줘도 터지지 않는다(호출부가 하나를 빠뜨려도 «성공»으로 착지하진 않는다)', () => {
    expect(dataLoadState({ live: true })).toBe('loading')
  })
})

describe('emptyText — ★세 상태는 서로 다른 문구여야 한다(같아지면 결함이 되돌아온다)', () => {
  const three = ['ready', 'loading', 'failed'].map((s) => emptyText(s, READY))

  it('셋이 전부 다르다', () => {
    expect(new Set(three).size).toBe(3)
  })

  it('failed 는 「없다」고 말하지 않고, 그게 「없음」이 아님을 **명시**한다', () => {
    const t = emptyText('failed', READY)
    expect(t).not.toBe(READY)
    expect(t).toMatch(/불러오지 못했/)
    expect(t).toMatch(/없음.*아닙니다|아닙니다/) // 직원이 「없구나」로 읽고 지나가는 것을 막는 문장
  })

  it('loading 도 「없다」고 말하지 않는다 — 첫 로드 전 한 프레임이 「주문 없음」이면 안 된다', () => {
    expect(emptyText('loading', READY)).not.toBe(READY)
  })

  it('ready 는 호출부가 준 문구를 **그대로** 쓴다 — 자리마다 다른 안내를 이 함수가 삼키지 않는다', () => {
    expect(emptyText('ready', READY)).toBe(READY)
    expect(emptyText('ready', '— 올림 없음 —')).toBe('— 올림 없음 —')
  })

  it('모르는 상태값은 ready 로 떨어진다 — 다만 그건 **문구 기본값**일 뿐이고, 실패 판정은 dataLoadState 몫이다', () => {
    // 이 관대함이 안전한 이유: failed 를 만드는 유일한 입력은 errors 이고, 그건 위 describe 가 지킨다.
    expect(emptyText(undefined, READY)).toBe(READY)
  })
})

describe('backoffMs — 재구독 간격은 벌어지되 **멈춘다**', () => {
  it('단조 증가한다(폭주 재구독 방지)', () => {
    const seq = [0, 1, 2, 3, 4].map(backoffMs)
    expect(seq).toEqual([...seq].sort((a, b) => a - b))
    expect(new Set(seq).size).toBe(seq.length) // 실제로 벌어진다(전부 같으면 백오프가 아니다)
  })

  it('★상한에서 멈춘다 — 무한히 벌리면 «영영 안 돌아오는» 태블릿이 생긴다', () => {
    const last = BACKOFF_MS[BACKOFF_MS.length - 1]
    expect(backoffMs(99)).toBe(last)
    expect(backoffMs(5)).toBe(last)
  })

  it('상한이 폴링 주기를 넘지 않는다 — 넘으면 재구독보다 폴링이 먼저 와서 백오프가 무의미해진다', () => {
    expect(BACKOFF_MS[BACKOFF_MS.length - 1]).toBeLessThanOrEqual(POLL_MS)
  })

  it('음수·이상값에도 첫 값으로 떨어진다(setTimeout(NaN) = 즉시 폭주)', () => {
    expect(backoffMs(-3)).toBe(BACKOFF_MS[0])
    expect(Number.isFinite(backoffMs(0))).toBe(true)
  })
})

describe('syncWarning — 정상일 때 침묵하고, 끊겼을 때만 말한다', () => {
  it('★첫 연결 중(connecting)은 경고하지 않는다 — 오탐은 표시를 죽인다', () => {
    expect(syncWarning(['connecting', 'connecting'], true)).toBeNull()
  })

  it('전부 live 면 침묵', () => {
    expect(syncWarning(['live', 'live'], true)).toBeNull()
  })

  it('★하나만 끊겨도 말한다 — 스테이션만 굳어도 주방은 「할 일 없음」으로 읽는다', () => {
    expect(syncWarning(['live', 'retrying'], true)).not.toBeNull()
    expect(syncWarning(['retrying', 'live'], true)).not.toBeNull()
  })

  it('프리뷰·데모(live=false)에서는 구독이 없으니 경고하지 않는다', () => {
    expect(syncWarning(['retrying'], false)).toBeNull()
  })

  it('★문구가 «그래도 무엇이 도는가»를 말한다 — 「끊김」만 띄우면 화면을 통째로 못 믿는다', () => {
    const w = syncWarning(['retrying'], true)
    expect(w.label).toMatch(/끊김/)
    expect(w.detail).toMatch(new RegExp(String(Math.round(POLL_MS / 1000)))) // 폴링 주기를 실제 값으로 말한다
    expect(w.detail).toMatch(/새로고침/)
  })

  it('빈 입력에 침묵한다(구독이 아직 없는 첫 렌더)', () => {
    expect(syncWarning([], true)).toBeNull()
  })
})

describe('syncTransition — ★구독이 조용히 죽는 것을 막는 규칙 (단일점 ①)', () => {
  const S = (status, attempt = 0) => ({ status, attempt })

  it('★재연결 직후엔 반드시 읽는다 — 끊긴 동안의 변경은 이벤트로 오지 않는다(영영 안 온다)', () => {
    // 이 한 줄이 ① 의 급소다. 이게 없으면 «재연결 성공»이 «화면 최신»을 뜻하지 않는다
    // — 연결 표시는 초록인데 내용은 끊긴 시점 그대로. 또 하나의 «정상 얼굴을 한 고장»이다.
    expect(syncTransition(S('retrying', 2), 'subscribed').refetch).toBe(true)
  })

  it('첫 연결(attempt 0)엔 읽지 않는다 — 마운트 시 이미 한 번 읽었다(중복 요청)', () => {
    expect(syncTransition(S('connecting', 0), 'subscribed').refetch).toBe(false)
  })

  it('구독이 죽으면 retrying + 재연결 예약, attempt 가 오른다(백오프가 실제로 벌어진다)', () => {
    const a = syncTransition(S('live', 0), 'down')
    expect(a).toMatchObject({ status: 'retrying', reconnect: true, attempt: 1 })
    expect(syncTransition(a, 'down').attempt).toBe(2)
  })

  it('★깨어나면 항상 읽는다 — 잠든 사이는 이벤트가 오지 않는다', () => {
    expect(syncTransition(S('live', 0), 'wake').refetch).toBe(true)
    expect(syncTransition(S('retrying', 3), 'wake').refetch).toBe(true)
  })

  it('깨어났을 때 살아 있으면 재구독하지 않고, 죽어 있으면 **기다리지 않고** 되살린다', () => {
    expect(syncTransition(S('live', 0), 'wake').reconnect).toBe(false)
    expect(syncTransition(S('retrying', 3), 'wake').reconnect).toBe(true)
  })

  it('★한 번 붙었다 끊긴 뒤의 재시도는 「연결 중」이 아니라 「재연결 중」이다 — 경고가 사라지면 안 된다', () => {
    // connecting 으로 돌아가면 syncWarning 이 침묵한다 = 끊긴 채로 «정상»처럼 보인다.
    expect(syncTransition(S('retrying', 1), 'connect').status).toBe('retrying')
    expect(syncTransition(S('live', 0), 'connect').status).toBe('retrying')
    expect(syncTransition(S('off', 0), 'connect').status).toBe('connecting') // 진짜 첫 연결만 connecting
  })

  it('연결 시도 자체는 읽지도 재연결하지도 않는다(무한 루프 방지)', () => {
    expect(syncTransition(S('off', 0), 'connect')).toMatchObject({ refetch: false, reconnect: false })
  })

  it('모르는 이벤트·빈 상태에 아무 일도 하지 않는다(상태를 잃지 않는다)', () => {
    expect(syncTransition(S('live', 0), '뭔가')).toMatchObject({ status: 'live', refetch: false, reconnect: false })
    expect(syncTransition(undefined, 'connect').status).toBe('connecting')
  })

  it('★down → subscribed 한 바퀴를 돌면 경고가 꺼지고 화면이 맞춰진다(겹이 실제로 닫힌다)', () => {
    let s = S('live', 0)
    s = syncTransition(s, 'down')
    expect(syncWarning([s.status], true)).not.toBeNull() // 끊긴 동안 직원에게 보인다
    const back = syncTransition(s, 'subscribed')
    expect(back.refetch).toBe(true)                       // 돌아오며 맞춘다
    expect(syncWarning([back.status], true)).toBeNull()    // 경고가 꺼진다
  })
})

describe('★배포 대조군 리터럴 ↔ 실제 문구 — 「내가 쓴 문구가 대조군」의 위험을 기계로 묶는다', () => {
  // 2026-08-17 orch 규율(integration): 「내가 고치는 파일에서는 내가 쓴 문구가 대조군이 될 수 있다 —
  //   앵커는 내가 안 건드리는 자리에 잡아라.」
  // 내 배포 검증(`scripts/deploy-seat.sh`)의 대조군은 **성질상 이번 판에만 있는 새 문구**여야 해서
  //   «안 건드리는 자리»에 앵커를 잡을 수가 없다 — 새 코드가 나갔는지를 묻는 검사이기 때문이다.
  // ⇒ 대신 **문구가 갈라지는 순간 여기가 빨개지게** 묶는다. 누가 UI 문구를 다듬으면
  //   배포 검증이 「새 코드가 안 나갔다」고 **거짓 실패**를 내는데, 그 순간은 하필 배포 직후다.
  const sh = readFileSync(fileURLToPath(new URL('../../../../../../scripts/deploy-seat.sh', import.meta.url)), 'utf8')
  const literals = [...sh.matchAll(/^\s*'([^']+)'\s*#/gm)].map((m) => m[1])

  it('배포 스크립트에서 대조군을 실제로 뽑아낸다(0개면 이 시험이 공허하다)', () => {
    expect(literals.length).toBeGreaterThan(0)
  })

  it('★대조군이 전부 «지금 코드가 실제로 내는 문구»다', () => {
    const produced = [emptyText('failed', '아무거나'), syncWarning(['retrying'], true).label]
    for (const lit of literals) {
      expect(produced.some((t) => t.includes(lit)), `대조군이 코드와 어긋났다: ${lit}`).toBe(true)
    }
  })
})
