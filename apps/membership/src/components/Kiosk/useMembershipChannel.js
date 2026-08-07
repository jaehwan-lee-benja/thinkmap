// 매장 고정 룸 Realtime 채널 — 직원 기기 → 고객 태블릿 "현재 회원" 브로드캐스트(유저결정 A/A-2).
// ★인가: private 채널(매장 계정 세션 인증). private 채널은 realtime.messages RLS 정책이 전제 →
//   그 마이그(migrate-membership-realtime-authz.sql)는 하드게이트. 적용 전까진 플래그로 꺼둔다:
//   VITE_MEMBERSHIP_REALTIME==='1' 일 때만 채널 구독/브로드캐스트. off면 no-op(로컬 셀프검색은 그대로 동작).
// 브로드캐스트 payload = 그 순간 회원 1명 최소 PII(마스킹 이름·오늘 팝콘 여부)만. 리스트·타회원 미포함.
import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@thinkmap/core'

const REALTIME_ON = import.meta.env.VITE_MEMBERSHIP_REALTIME === '1'
const EVT_MEMBER = 'member'   // {member_id, display_name, today_event_claimed}
const EVT_CLEAR = 'clear'
// ★인쇄 브리지(2026-08-03): 키오스크 발권 → 카운터 폰(프린터 보유)으로 티켓 푸시.
//   payload = 영수증 인쇄에 필요한 최소치만(마스킹명·토큰·날짜·스탬프 표기). 회원 식별자·전화 없음.
const EVT_TICKET = 'ticket'

export function useMembershipChannel(store, { onMember, onClear, onTicket } = {}) {
  const chanRef = useRef(null)
  const onMemberRef = useRef(onMember)
  const onClearRef = useRef(onClear)
  const onTicketRef = useRef(onTicket)
  onMemberRef.current = onMember
  onClearRef.current = onClear
  onTicketRef.current = onTicket

  useEffect(() => {
    if (!REALTIME_ON || !store) return
    // private 채널(RLS 인가). 자기 브로드캐스트는 수신 안 함(self:false).
    const channel = supabase.channel(`membership:${store}`, {
      config: { broadcast: { self: false }, private: true },
    })
    channel
      .on('broadcast', { event: EVT_MEMBER }, ({ payload }) => onMemberRef.current?.(payload))
      .on('broadcast', { event: EVT_CLEAR }, () => onClearRef.current?.())
      .on('broadcast', { event: EVT_TICKET }, ({ payload }) => onTicketRef.current?.(payload))
      .subscribe()
    chanRef.current = channel
    return () => { supabase.removeChannel(channel); chanRef.current = null }
  }, [store])

  // 직원 기기: 현재 회원을 고객 태블릿으로 푸시. 최소 PII만.
  const pushMember = useCallback((m) => {
    if (!REALTIME_ON || !chanRef.current || !m?.member_id) return
    chanRef.current.send({
      type: 'broadcast', event: EVT_MEMBER,
      payload: {
        member_id: m.member_id,
        display_name: m.display_name ?? null,
        today_event_claimed: !!m.today_event_claimed,
      },
    })
  }, [])

  const pushClear = useCallback(() => {
    if (!REALTIME_ON || !chanRef.current) return
    chanRef.current.send({ type: 'broadcast', event: EVT_CLEAR, payload: {} })
  }, [])

  // 키오스크: 발권 즉시 카운터 폰으로 인쇄 요청. ★브로드캐스트는 **best-effort(휘발성)**다 —
  //   폰이 그 순간 못 받으면 그 건은 사라진다. 그래서 화면의 토큰이 정본이고, 폰의 스캔 화면에서
  //   토큰으로 **수동 인쇄**가 항상 가능하다(누락 복구 경로). 이 설계 전제를 코드에 남긴다.
  const pushTicket = useCallback((t) => {
    if (!REALTIME_ON || !chanRef.current || !t?.token) return
    chanRef.current.send({
      type: 'broadcast', event: EVT_TICKET,
      payload: {
        token: t.token,
        name: t.name ?? null,          // 마스킹명(서버 정본)
        date: t.date ?? null,
        stamp: t.stamp ?? null,        // 'n/10' 표기 문자열
      },
    })
  }, [])

  return { pushMember, pushClear, pushTicket, realtimeOn: REALTIME_ON }
}

// ── 손님 폰 «회수 확정» 알림 채널 ────────────────────────────────────────────
// ★왜 **별도 공개 채널**인가: 위 채널은 `private:true` 라 **매장 계정 세션**이 있어야 구독된다.
//   손님 폰(`?role=ticket`)에는 계정이 없다 — 기존 채널을 그대로 쓰는 건 원리적으로 불가능하다.
//
// ★그럼 공개 채널은 안전한가: **회수가 끝난 뒤에만** 쏘기 때문에 안전하다.
//   payload 의 토큰은 그 시점에 **이미 소진**돼 재사용 가치가 0이고(회수는 1회성·직원 게이트),
//   담기는 건 마스킹명·스탬프 표기뿐이라 새로 새는 PII 가 없다.
//   ⇒ 엿듣는 쪽이 얻는 것이 «방금 어떤 티켓이 소진됐다» 뿐이다.
//   (반대로 «발권 시점»을 공개로 쏘면 미소진 토큰이 새므로 **절대 그러면 안 된다.**)
//
// ★매장 룸으로 나누지 않는다: QR 페이로드에 store 가 없어서 폰이 룸을 모른다.
//   payload 가 무해하므로 단일 룸으로 두고 **폰이 자기 토큰과 일치할 때만** 반응한다.
const PUBLIC_ROOM = 'membership-ticket'
const EVT_REDEEMED = 'redeemed'

// 손님 폰: 자기 토큰의 회수 확정을 기다린다.
export function useTicketRedeemedSignal(token, onRedeemed) {
  const cbRef = useRef(onRedeemed)
  cbRef.current = onRedeemed
  useEffect(() => {
    if (!REALTIME_ON || !token) return undefined
    const ch = supabase.channel(PUBLIC_ROOM, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: EVT_REDEEMED }, ({ payload }) => {
      if (payload && payload.token === token) cbRef.current?.(payload)
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [token])
}

// 직원 기기: 회수 확정 직후 1회 알린다. 실패해도 회수 자체는 이미 끝났다(best-effort).
export function useRedeemedBroadcast() {
  const chRef = useRef(null)
  useEffect(() => {
    if (!REALTIME_ON) return undefined
    const ch = supabase.channel(PUBLIC_ROOM, { config: { broadcast: { self: false } } })
    ch.subscribe()
    chRef.current = ch
    return () => { supabase.removeChannel(ch); chRef.current = null }
  }, [])
  return useCallback((p) => {
    if (!REALTIME_ON || !chRef.current || !p?.token) return
    chRef.current.send({
      type: 'broadcast', event: EVT_REDEEMED,
      payload: { token: p.token, name: p.name ?? null, stamp: p.stamp ?? null },
    })
  }, [])
}
