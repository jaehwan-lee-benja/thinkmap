// 멤버십 키오스크 ↔ CRM 데이터 계약 (thinkmap 프록시 Edge 경유).
//
// 경로: 브라우저(매장 세션) → thinkmap 프록시 Edge(시크릿 보관·직원게이트·레이트리밋)
//        → crm Edge(x-api-key) → RPC(SECURITY DEFINER) → multi-store crm 스키마.
//   ⚠️ 브라우저에서 crm DB 직접 접근·시크릿 노출 절대 금지. 프록시 Edge 가 MEMBERSHIP_KIOSK_KEY 를 쥔다.
//   계약 정본: crm-archive/MEMBERSHIP-KIOSK-CONTRACT.md · docs/MEMBERSHIP-KIOSK-SPEC.md §3.
//
// 배선 상태: 프록시 Edge invoke 는 아래에 실제로 배선돼 있으나, 하드게이트(SPEC §8: crm 테이블/RPC·
//   시크릿·Edge 배포) 전까지는 호출해도 실패한다. 그래서 `VITE_MEMBERSHIP_LIVE==='1'` 일 때만 실호출하고,
//   아니면 미리보기(계약 대기)로 막는다 — 배포 완료 후 env 플래그만 켜면 라이브(코드 변경 0).
import { supabase } from '@thinkmap/core'

// 라이브 스위치.
// ★2026-08-04 기본값 반전: 종전 `=== '1'` 은 **플래그를 안 주면 앱이 죽는** 구조였다.
//   `.env`·CI 어디에도 이 키가 없어서(실측) **이 체크아웃으로 재빌드해 배포하면 조회·발권·회수·가입이
//   전부 "연결 대기"로 죽는다** — 코드 변경 0으로 나는 조용한 회귀다(실제로 내 로컬 빌드가 그랬다).
//   계약(Edge·RPC)은 이미 전부 프로덕션 ACTIVE 라 "꺼짐"이 기본일 이유가 사라졌다.
//   ⇒ **기본 = 라이브**, 끄고 싶을 때만 명시적으로 `VITE_MEMBERSHIP_LIVE=0`(미리보기/데모용).
//   실패 모드를 "잊으면 죽음" → "잊으면 정상"으로 뒤집는다.
export const LIVE = import.meta.env.VITE_MEMBERSHIP_LIVE !== '0'
export const CONTRACT_PENDING = !LIVE

const PENDING_MSG = 'CRM 데이터 연결 대기 — Edge 배포 후 활성화(MEMBERSHIP-KIOSK-SPEC §8)'

async function callProxy(fn, body) {
  if (!LIVE) throw new Error(PENDING_MSG)
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    // ★2026-08-04: supabase-js 는 비2xx 를 FunctionsHttpError 로 던지는데 그 message 가
    //   **고정 문자열**("Edge Function returned a non-2xx status code")이라 서버가 보낸 `{error:'not_found'}`
    //   같은 사유가 통째로 유실됐다. 그래서 화면의 사유 매핑(not_found·bad_token·rate_limited…)이
    //   전부 죽은 분기였고, 카운터엔 영문 raw 문구만 떴다. → context(Response)에서 본문을 살려낸다.
    let code = null, status = null
    try {
      const res = error.context
      if (res) {
        status = res.status ?? null
        if (typeof res.json === 'function') {
          const j = await res.json()
          code = (j && (j.error || j.reason)) || null
        }
      }
    } catch (e) { /* 본문이 JSON 이 아니면 그냥 원문 메시지로 */ }
    const err = new Error(code || error.message || `${fn} 호출 실패`)
    err.code = code
    err.status = status
    throw err
  }
  return data
}

// ① 회원 조회: 정확한 전체 번호 1건 매칭만(§5). 프록시 → crm membership-query.
// 반환(v1): { found, member_id?, display_name?, today_event_claimed? }
//   ※ 포인트(point_balance/point_asof)는 v1 제외 — v2 라이브 UnionPOS 로 연기(유저결정 2026-07-24).
export function lookupMember(phone) {
  return callProxy('membership-lookup', { phone })
}

// ② 이벤트 적립: 1일1회(서버 partial-unique 가드). 멱등.
// 반환: { ok, already, claimed_at }
export function claimEvent(memberId, eventType, date) {
  return callProxy('membership-event', { member_id: memberId, event_type: eventType, event_date: date })
}

// ③ 가입: phone/name/email/consent(source:'kiosk'). crm intake 가 email→p_email 캡처(0013)·dedup·검증.
// 반환: { member_id, created }
export function signupMember(payload) {
  return callProxy('membership-signup', { ...payload, source: 'kiosk' })
}

// ④ 이벤트 수령 내역: 회원의 팝콘 이력(과거 수령 시간까지). 프록시 → crm membership-events(신규, 게이트 대기).
//    crm.membership_events 테이블은 이미 존재(0014) — 읽기 RPC/Edge만 추가 필요(SPEC §8·to-conductor 제안).
// 반환: { events: [{ event_date, claimed_at }] }  (최신순)
export function getEventHistory(memberId, eventType = 'popcorn') {
  return callProxy('membership-history', { member_id: memberId, event_type: eventType })
}

// ── 팝콘 루프 티켓(발권→카운터 회수, 0018 라이브) ────────────────────────────
// ⑧ 발권(키오스크 채널 — 서버가 channel:'kiosk' 고정). 멱등: 같은날=동일 토큰 reissued.
// 반환: { ok, token, reissued, event_date } | { ok:false, error }
export function issueTicket() {
  return callProxy('membership-ticket-issue', {})
}
// ※호출부: issueTicketFor(memberId) 형태 필요 — Edge가 member_id 요구(키오스크 조회 후 발권).
export function issueTicketFor(memberId) {
  return callProxy('membership-ticket-issue', { member_id: memberId })
}

// ⑨ 조회(카운터 스캔): token → 상태·마스킹명·채널·스탬프. bad_token 400 / not_found 404.
export function lookupTicket(token) {
  return callProxy('membership-ticket-lookup', { token })
}

// ⑩ 회수(카운터 확정): ★redeemed_by는 서버가 게이트 operator 사용(본문 미수용).
// 반환: { ok:true, display_name, channel, stamp } | { ok:false, reason }(200)
export function redeemTicket(token) {
  return callProxy('membership-ticket-redeem', { token })
}

// ⑪ 오늘 티켓 재표시(기기변경·캐시소실): ★배열. 0019 가교 동안 {tickets:[], stamp:null, pending_migration}.
export function todayTickets(memberId, channel) {
  const body = { member_id: memberId }
  if (channel) body.channel = channel
  return callProxy('membership-ticket-today', body)
}

// ⑥ 스탬프 상태 새로고침(수령/적립 후). 프록시 → crm membership_stamp_status.
// 반환: { stamp:{claims_total,current_stamps,threshold,rewards_earned,rewards_redeemed,rewards_available,next_reward} }
export function getStampStatus(memberId) {
  return callProxy('membership-stamp', { member_id: memberId })
}

// ⑦ ★리워드 수령(아이스크림) — 직원 확정 write. 프록시 → crm membership_reward_redeem.
// 반환: { ok, milestone?, rewards_available? } | { ok:false, reason:'no_reward'|'retry' }
export function redeemReward(memberId, rewardType = 'icecream') {
  return callProxy('membership-reward', { member_id: memberId, reward_type: rewardType })
}

// ⑤ ★회원 검색(직원용) — 유저결정: 스토어 계정 열람 허용 + ★서버측 마스킹·검색필수(전체 다운로드 없음).
//    검색어(이름/전화 부분일치)를 crm 이 원본으로 검색 → **마스킹된 매치만** 반환(성만·전화 끝4자리·상태).
//    프론트는 원본 미취급(169). 빈/짧은 검색어는 호출 안 함(검색해야 결과). 반환: { members: [{ member_id, name, phone, status }] }
export function searchMembers(query) {
  return callProxy('membership-list', { q: query })
}
