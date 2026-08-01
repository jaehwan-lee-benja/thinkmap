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

export function useMembershipChannel(store, { onMember, onClear } = {}) {
  const chanRef = useRef(null)
  const onMemberRef = useRef(onMember)
  const onClearRef = useRef(onClear)
  onMemberRef.current = onMember
  onClearRef.current = onClear

  useEffect(() => {
    if (!REALTIME_ON || !store) return
    // private 채널(RLS 인가). 자기 브로드캐스트는 수신 안 함(self:false).
    const channel = supabase.channel(`membership:${store}`, {
      config: { broadcast: { self: false }, private: true },
    })
    channel
      .on('broadcast', { event: EVT_MEMBER }, ({ payload }) => onMemberRef.current?.(payload))
      .on('broadcast', { event: EVT_CLEAR }, () => onClearRef.current?.())
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

  return { pushMember, pushClear, realtimeOn: REALTIME_ON }
}
