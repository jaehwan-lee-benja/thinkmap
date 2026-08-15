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
// ★응원 화면(2026-08-16): 팝콘 claim 성공 직후 매장 디스플레이(?role=display)로 «축하»를 쏜다.
//   crm 실측 답: 테이블 구독(postgres_changes)은 불가·부적격 → Broadcast 로 간다(DB 변경 0·게이트 0).
//   같은 private 룸을 재사용한다 — 새 룸을 파면 realtime.messages 정책을 또 늘려야 하는데,
//   이 룸은 이미 «매장 계정만»으로 인가돼 있고 display 패드도 같은 store 계정이다.
//   ★best-effort 다: 디스플레이가 그 순간 안 붙어 있으면 그 건은 사라진다. 적립 자체는 이미 끝났고
//   화면은 «응원»일 뿐이라 누락이 데이터 손실이 아니다 — 재전송 장치를 두지 않는 근거가 이것이다.
const EVT_CHEER = 'cheer'

export function useMembershipChannel(store, { onMember, onClear, onTicket, onCheer } = {}) {
  const chanRef = useRef(null)
  const onMemberRef = useRef(onMember)
  const onClearRef = useRef(onClear)
  const onTicketRef = useRef(onTicket)
  const onCheerRef = useRef(onCheer)
  onCheerRef.current = onCheer
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
      .on('broadcast', { event: EVT_CHEER }, ({ payload }) => onCheerRef.current?.(payload))
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

  /**
   * 응원 화면으로 쏘는 축하. ★페이로드는 **membership_query 가 이미 내준 것만** 담는다 —
   * 마스킹·비노출이 서버에서 이미 통과한 값이라 위성이 새로 판단할 것이 없다.
   * 금지(계약): phone · canonical_id · 매출 · 테이블명. member_id 도 안 싣는다(화면이 안 쓴다).
   */
  const pushCheer = useCallback((c) => {
    if (!REALTIME_ON || !chanRef.current || !c) return
    chanRef.current.send({
      type: 'broadcast', event: EVT_CHEER,
      payload: {
        masked_name: c.masked_name ?? null,
        already: !!c.already,
        current_stamps: c.current_stamps ?? null,
        stamp_goal: c.stamp_goal ?? null,
        claims_total: c.claims_total ?? null,
        rewards_available: c.rewards_available ?? null,
        months_with_us: c.months_with_us ?? null,   // ★null 이면 화면이 연차 줄을 «생략»한다(실측 4명)
        member_seq: c.member_seq ?? null,
      },
    })
  }, [])

  return { pushMember, pushClear, pushTicket, pushCheer, realtimeOn: REALTIME_ON }
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
//
// ★`private: true` 다 — «공개 채널」이라는 말은 «누구나 들을 수 있다»는 뜻이지 «인가가 없다»는 뜻이 아니다.
//   Supabase 는 **public 채널에 인가를 걸 수 없어** 아무나 브로드캐스트할 수 있다(가짜 «감사합니다» 주입).
//   private 채널로 두면 realtime.messages RLS 로 **수신=anon 허용 / 발신=직원 세션만** 을 만들 수 있다.
//   (손님 폰은 세션이 없어 role=anon 으로 붙는다 — 그래서 수신 정책에 anon 이 필요하다.)
//   정책: migrate-membership-ticket-thanks-realtime.sql
//
// ★payload 에 **이름을 싣지 않는다**: 이 룸은 anon 이 들을 수 있으므로, 이름을 실으면
//   «누가 언제 참여했는지»가 실시간 피드로 샌다. 폰은 자기 QR 페이로드에 이름을 이미 갖고 있다.
const PUBLIC_ROOM = 'membership-ticket'
const EVT_REDEEMED = 'redeemed'

// 손님 폰: 자기 토큰의 회수 확정을 기다린다.
export function useTicketRedeemedSignal(token, onRedeemed) {
  const cbRef = useRef(onRedeemed)
  cbRef.current = onRedeemed
  useEffect(() => {
    if (!REALTIME_ON || !token) return undefined
    const ch = supabase.channel(PUBLIC_ROOM, { config: { broadcast: { self: false }, private: true } })
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
    const ch = supabase.channel(PUBLIC_ROOM, { config: { broadcast: { self: false }, private: true } })
    ch.subscribe()
    chRef.current = ch
    return () => { supabase.removeChannel(ch); chRef.current = null }
  }, [])
  return useCallback((p) => {
    if (!REALTIME_ON || !chRef.current || !p?.token) return
    chRef.current.send({
      type: 'broadcast', event: EVT_REDEEMED,
      payload: { token: p.token, stamp: p.stamp ?? null },   // ★이름 없음(위 주석)
    })
  }, [])
}
