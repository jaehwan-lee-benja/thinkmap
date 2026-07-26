// 회원 조회·적립·이력 공용 훅 — 직원 검색(로컬)·고객 셀프검색(로컬)·직원 푸시(원격) 모두 이걸 쓴다.
// currentMember 를 로컬 조회 결과 또는 원격 브로드캐스트 payload 로 둘 다 세팅 가능(이중 경로, 유저결정 A).
import { useState, useCallback } from 'react'
import { lookupMember, claimEvent, getEventHistory } from '../../api/membership'
import { todayStr } from './kioskUtils'

const EVENT_TYPE = 'popcorn'

export function useMemberLookup() {
  const [status, setStatus] = useState('idle') // idle | loading | found | notfound | error
  const [member, setMember] = useState(null)
  const [history, setHistory] = useState([])
  const [claiming, setClaiming] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const loadHistory = useCallback(async (memberId) => {
    try {
      const h = await getEventHistory(memberId, EVENT_TYPE)
      setHistory(Array.isArray(h?.events) ? h.events : [])
    } catch { setHistory([]) }
  }, [])

  const clear = useCallback(() => {
    setStatus('idle'); setMember(null); setHistory([]); setErrMsg('')
  }, [])

  // 로컬 조회(정확 전체번호 1건). 본인/직원 검색 공용.
  const lookup = useCallback(async (phone) => {
    setStatus('loading'); setErrMsg(''); setHistory([])
    try {
      const r = await lookupMember(phone)
      if (r?.found) { setMember(r); setStatus('found'); loadHistory(r.member_id); return r }
      setMember(null); setStatus('notfound'); return null
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '조회 실패'); return null
    }
  }, [loadHistory])

  // 원격 푸시(직원→고객 브로드캐스트 payload)로 직접 세팅.
  const setMemberDirect = useCallback((payload) => {
    if (!payload?.member_id) return
    setMember(payload); setStatus('found'); setErrMsg(''); loadHistory(payload.member_id)
  }, [loadHistory])

  const claim = useCallback(async () => {
    if (!member?.member_id) return null
    setClaiming(true); setErrMsg('')
    try {
      const r = await claimEvent(member.member_id, EVENT_TYPE, todayStr())
      setMember((prev) => ({ ...prev, today_event_claimed: true, _justClaimed: !r?.already }))
      loadHistory(member.member_id)
      return r
    } catch (e) {
      setErrMsg(e?.message || '적립 실패'); return null
    } finally {
      setClaiming(false)
    }
  }, [member, loadHistory])

  return { status, member, history, claiming, errMsg, lookup, claim, clear, setMemberDirect }
}
