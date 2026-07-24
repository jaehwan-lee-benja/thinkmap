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

// 라이브 스위치: 하드게이트(테이블/시크릿/Edge 배포) 완료 후 유저/통합세션이 env 로 '1' 세팅.
export const LIVE = import.meta.env.VITE_MEMBERSHIP_LIVE === '1'
export const CONTRACT_PENDING = !LIVE

const PENDING_MSG = 'CRM 데이터 연결 대기 — Edge 배포 후 활성화(MEMBERSHIP-KIOSK-SPEC §8)'

async function callProxy(fn, body) {
  if (!LIVE) throw new Error(PENDING_MSG)
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(error.message || `${fn} 호출 실패`)
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

// ③ 가입: 최소 필드(phone/name/consent, source:'kiosk'). crm intake 가 dedup·검증.
// 반환: { member_id, created }
export function signupMember(payload) {
  return callProxy('membership-signup', { ...payload, source: 'kiosk' })
}
