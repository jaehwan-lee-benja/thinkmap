// 회원 조회·적립·이력 공용 훅 — 직원 검색(로컬)·고객 셀프검색(로컬)·직원 푸시(원격) 모두 이걸 쓴다.
// currentMember 를 로컬 조회 결과 또는 원격 브로드캐스트 payload 로 둘 다 세팅 가능(이중 경로, 유저결정 A).
import { useState, useCallback } from 'react'
import { lookupMember, getEventHistory, getStampStatus, redeemReward, issueTicketFor, todayTickets } from '../../api/membership'

const EVENT_TYPE = 'popcorn'

export function useMemberLookup() {
  const [status, setStatus] = useState('idle') // idle | loading | found | notfound | error
  const [member, setMember] = useState(null)
  const [history, setHistory] = useState([])
  const [claiming, setClaiming] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const loadHistory = useCallback(async (memberId) => {
    try {
      const h = await getEventHistory(memberId, EVENT_TYPE)
      setHistory(Array.isArray(h?.events) ? h.events : [])
    } catch { setHistory([]) }
  }, [])

  // 스탬프 실값 새로고침(적립/수령 후). 실패해도 조회는 유지.
  const refreshStamp = useCallback(async (memberId) => {
    try {
      const s = await getStampStatus(memberId)
      const stamp = s?.stamp ?? s
      if (stamp) setMember((prev) => (prev ? { ...prev, stamp } : prev))
    } catch { /* noop */ }
  }, [])

  // 오늘 티켓 로드(재표시 — 기기변경·캐시소실). 0019 가교 동안 tickets:[](폴백 정상).
  const loadToday = useCallback(async (memberId) => {
    try {
      const t = await todayTickets(memberId)
      setMember((prev) => (prev ? { ...prev, _todayTickets: Array.isArray(t?.tickets) ? t.tickets : [] } : prev))
    } catch { /* noop — 가교/미배선 시 표시 생략 */ }
  }, [])

  const clear = useCallback(() => {
    setStatus('idle'); setMember(null); setHistory([]); setErrMsg('')
  }, [])

  // 로컬 조회(정확 전체번호 1건). 본인/직원 검색 공용.
  const lookup = useCallback(async (phone) => {
    setStatus('loading'); setErrMsg(''); setHistory([])
    try {
      const r = await lookupMember(phone)
      if (r?.found) { setMember(r); setStatus('found'); loadHistory(r.member_id); loadToday(r.member_id); return r }
      setMember(null); setStatus('notfound'); return null
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '조회 실패'); return null
    }
  }, [loadHistory, loadToday])

  // 원격 푸시(직원→고객 브로드캐스트 payload)로 직접 세팅.
  const setMemberDirect = useCallback((payload) => {
    if (!payload?.member_id) return
    setMember(payload); setStatus('found'); setErrMsg(''); loadHistory(payload.member_id); loadToday(payload.member_id)
  }, [loadHistory, loadToday])

  // ★티켓 모델(0018 라이브): 참여 버튼 = 즉시적립이 아니라 "발권" — 스탬프는 카운터 회수 시 적립.
  const claim = useCallback(async () => {
    if (!member?.member_id) return null
    setClaiming(true); setErrMsg('')
    try {
      const r = await issueTicketFor(member.member_id)
      if (r && r.token) {
        setMember((prev) => ({ ...prev, _ticket: { token: r.token, reissued: !!r.reissued, event_date: r.event_date } }))
      } else {
        setErrMsg((r && r.error) === 'channel_not_enabled' ? '채널 설정 오류' : (r && r.error) || '발권 실패')
      }
      loadHistory(member.member_id)
      return r
    } catch (e) {
      setErrMsg(e?.message || '발권 실패'); return null
    } finally {
      setClaiming(false)
    }
  }, [member, loadHistory])

  // ★리워드 수령(아이스크림) — 직원 확정 write. 성공 시 스탬프 새로고침.
  const redeem = useCallback(async () => {
    if (!member?.member_id) return null
    setRedeeming(true); setErrMsg('')
    try {
      const r = await redeemReward(member.member_id, 'icecream')
      if (r?.ok) {
        setMember((prev) => ({ ...prev, _justRedeemed: true }))
        refreshStamp(member.member_id)
      } else {
        setErrMsg(r?.reason === 'no_reward' ? '수령 가능한 리워드가 없습니다.'
          : r?.reason === 'retry' ? '잠시 후 다시 시도해 주세요.' : '수령 실패')
      }
      return r
    } catch (e) {
      setErrMsg(e?.message || '수령 실패'); return null
    } finally {
      setRedeeming(false)
    }
  }, [member, refreshStamp])

  return { status, member, history, claiming, redeeming, errMsg, lookup, claim, redeem, clear, setMemberDirect }
}
