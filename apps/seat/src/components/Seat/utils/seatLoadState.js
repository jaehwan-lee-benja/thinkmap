// 읽기 상태 3분기 — ★「읽기 실패」가 「주문 없음」으로 착지하는 것을 구조에서 막는다.
//
// 왜(2026-08-10 자가감사 단일점 ②, 2026-08-17 수정):
//   훅의 refetch 는 실패해도 `console.error` 만 하고 끝났다. 화면이 보는 것은 `orders` 배열뿐이라
//   **읽기 실패와 「그 날 주문이 하나도 없음」이 픽셀 단위로 똑같았다** — 둘 다 「주문이 없습니다」.
//   영업 중 이게 나면 직원은 «주문이 없구나» 하고 **정상적으로 일한다**. 가장 나쁜 고장의 모양이다:
//   고장이 정상 상태의 얼굴을 하고 착지한다.
//   ※같은 형태가 membership 에서 독립적으로 나왔다(«서버 순단 시 직원이 유효 티켓을 거부»).
//     두 도메인에서 같은 모양으로 틀렸다 = 코드 결함이 아니라 **설계 습관**이다 → 교본 후보.
//
// 규율: 빈 화면을 그릴 때 근거는 `length === 0` 이 아니라 **「읽는 데 성공했는가」**여야 한다.
//   ready   = 읽었는데 비었다  → 직원이 할 일: 새 주문을 만든다
//   loading = 아직 못 읽었다    → 기다린다
//   failed  = 읽지 못했다       → 재시도·연결 확인 (여기서 「없음」이라 말하면 주문을 지운 것과 같다)
//   셋은 **직원에게 서로 다른 행동을 요구한다.** 같은 문구로 착지시키면 안 된다.
//
// 순수 함수로 따로 둔 이유: supabase 를 import 하는 훅 파일 안에 있으면 시험할 수 없다
//   (가드·감사기와 같은 구조 — 판정은 순수 함수, 부수효과는 바깥).

/** @typedef {'ready'|'loading'|'failed'} SeatLoadState */

/**
 * @param {object} p
 * @param {boolean} p.live      실제 DB 를 읽는 모드인가(프리뷰·정적 데모는 네트워크가 없다 → 항상 ready)
 * @param {Array}  p.errors     각 읽기 경로의 최근 실패(하나라도 있으면 실패로 본다 — 주문/스테이션은 한 화면이다)
 * @param {*}      p.loadedAt   마지막 **성공** 시각(없으면 = 한 번도 성공한 적 없다)
 * @returns {SeatLoadState}
 */
export function dataLoadState({ live, errors = [], loadedAt = null }) {
  if (!live) return 'ready'
  if (errors.some(Boolean)) return 'failed'
  return loadedAt ? 'ready' : 'loading'
}

/**
 * 비어 있는 목록 자리에 쓸 문구. ★state 를 안 보고 부르는 자리를 만들지 않으려고 **문구까지 여기서 준다**
 * (호출부가 `length === 0` 만 보고 자기 문구를 쓰면 같은 결함이 그대로 재발한다).
 * @param {SeatLoadState} state
 * @param {string} readyText  읽기에 성공했고 진짜로 비었을 때의 문구(자리마다 다르다)
 */
export function emptyText(state, readyText) {
  if (state === 'failed') return '불러오지 못했습니다 — 「없음」이 아닙니다. 재시도하세요.'
  if (state === 'loading') return '불러오는 중…'
  return readyText
}

// ─────────────────────────────────────────────────────────────────────────────
// 동기화 상태 — 「화면이 지금 진실인가」의 두 번째 질문 (2026-08-17 자가감사 단일점 ①)
//
// 왜 여기 같이 두는가: ②(읽기 실패)와 ①(끊김)은 **같은 질문의 두 갈래**다 —
//   ② 「읽지 못했는데 읽은 척 하고 있나」 / ① 「받지 못하고 있는데 최신인 척 하고 있나」.
//   판정을 한 파일에 모아 두면 다음 사람이 한쪽만 보고 고치는 일이 줄어든다.
//
// ★자리후의 Realtime 은 **한 겹이었다**: 구독이 조용히 죽으면(태블릿 절전·와이파이 전환·서버 순단)
//   화면은 «끊긴 시점의 스냅샷»을 **최신인 얼굴로** 계속 보여줬다. ② 와 같은 형태다 —
//   고장이 정상 상태의 얼굴로 착지한다. 다른 건 «비어 보인다»가 아니라 «멈춰 있다»는 것뿐이다.
// ⇒ 세 겹으로 만든다: ⑴Realtime(즉시) ⑵깨어남·복귀 사건(visibilitychange·online) ⑶저빈도 폴링(바닥선).
//   ⑴이 죽어도 ⑶이 최대 POLL_MS 안에 화면을 맞춘다. 겹을 세는 이유는 **어느 한 겹도 믿지 않기 위해서**다.

/** 재구독 백오프(ms). 마지막 값에서 멈춘다 — 무한히 벌리면 «영영 안 돌아오는» 태블릿이 생긴다. */
export const BACKOFF_MS = [2000, 4000, 8000, 15000, 30000]
export const backoffMs = (attempt) => BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)]

/** 안전 폴링 주기 — Realtime 이 조용히 죽어도 화면이 이 시간 이상 낡지 않는다는 **바닥선**. */
export const POLL_MS = 60000

/** @typedef {'off'|'connecting'|'live'|'retrying'} SeatSyncStatus */

/**
 * ★구독 상태 기계 — **순수 함수**. (seatDevGuard 와 같은 구조: 판정은 순수, 부수효과는 바깥.)
 *   훅 안에 두면 브라우저·DB 없이는 시험할 수 없고, 그러면 「겹을 세 개 만들었다」가
 *   **서술로만 남는다**(교본이 금한 형태). 여기 있으면 결함을 주입해 적중을 확인할 수 있다.
 *
 * @param {{status: SeatSyncStatus, attempt: number}} state
 * @param {'connect'|'subscribed'|'down'|'wake'} event
 * @returns {{status: SeatSyncStatus, attempt: number, refetch: boolean, reconnect: boolean}}
 */
export function syncTransition(state, event) {
  const status = state?.status || 'off'
  const attempt = state?.attempt || 0
  switch (event) {
    case 'connect':
      // 한 번이라도 붙었다 끊긴 뒤의 재시도는 «연결 중»이 아니라 «재연결 중»이다(경고 대상).
      return { status: status === 'live' || status === 'retrying' ? 'retrying' : 'connecting', attempt, refetch: false, reconnect: false }
    case 'subscribed':
      // ★끊겼다 돌아왔으면 **반드시 한 번 읽는다** — 끊겨 있던 동안의 변경은 이벤트로 오지 않는다(영영 안 온다).
      //   첫 연결(attempt 0)에는 읽지 않는다 — 마운트 시 이미 한 번 읽었다(중복 요청).
      return { status: 'live', attempt: 0, refetch: attempt > 0, reconnect: false }
    case 'down':
      return { status: 'retrying', attempt: attempt + 1, refetch: false, reconnect: true }
    case 'wake':
      // 깨어남·네트워크 복귀: 먼저 맞추고, 죽어 있었으면 백오프를 기다리지 않고 바로 되살린다(사람이 보고 있다).
      return { status, attempt, refetch: true, reconnect: status !== 'live' }
    default:
      return { status, attempt, refetch: false, reconnect: false }
  }
}

/**
 * 여러 구독의 상태 → 화면에 띄울 경고(없으면 null).
 * ★`connecting` 은 경고하지 않는다 — 첫 연결 중은 «정상»이고, 여기서 깜빡이면 직원이 표시를 무시하게 된다
 *   (오탐은 가드를 죽인다 — seatDevGuard 에서 이미 실측으로 배운 것).
 * @param {SeatSyncStatus[]} statuses
 * @param {boolean} live  실제 구독을 쓰는 모드인가(프리뷰·데모는 구독이 없다)
 */
export function syncWarning(statuses = [], live = true) {
  if (!live) return null
  if (!statuses.some((s) => s === 'retrying')) return null
  return {
    label: '실시간 끊김 · 재연결 중',
    // ★«무엇이 아직 도는가»를 함께 말한다 — 「끊김」만 띄우면 직원은 화면을 통째로 못 믿는다.
    detail: `실시간 수신이 끊겨 자동 재연결 중입니다. 그동안에도 ${Math.round(POLL_MS / 1000)}초마다 새로고침하므로 화면은 그만큼 안에서 최신입니다.`,
  }
}
