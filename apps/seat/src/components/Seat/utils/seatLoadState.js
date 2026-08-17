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
