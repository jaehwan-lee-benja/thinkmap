// 티켓 스캔 상태·동작 — ★**ScanView 와 직원 허브가 공유**한다(로직 복제 금지).
//   여기 담긴 방어들은 전부 현장에서 비싸게 얻은 것이다:
//   · 짧은 입력 무피드백 금지 · 조회 대기 중 다음 스캔 유실 방지 · 회수 응답이 엉뚱한 티켓에 얹히는 것 방지.
//   두 벌로 갈라두면 한쪽만 낡아 그 방어가 조용히 사라진다.
import { useState, useCallback } from 'react'
import { lookupTicket, redeemTicket } from '../../api/membership'
import { useRedeemedBroadcast } from './useMembershipChannel'

export const STATE_LABEL = { issued: '유효 — 제공 가능', redeemed: '이미 회수됨', expired: '만료됨', voided: '폐기됨' }
export const CHANNEL_LABEL = { kiosk: '키오스크', game: '게임 쿠폰' }

export function useTicketScan() {
  const [result, setResult] = useState(null)
  const [phase, setPhase] = useState('idle')   // idle | looking | found | error | redeemed
  const [errMsg, setErrMsg] = useState('')
  const [busy, setBusy] = useState(false)
  // 회수 확정 → 손님 폰 티켓 화면을 «감사» 로 바꾸는 신호(공개 채널·소진된 토큰만).
  const pushRedeemed = useRedeemedBroadcast()

  const doLookup = useCallback(async (tok) => {
    const v = String(tok || '').trim().toUpperCase()
    // ★무피드백 금지(2026-08-04): 짧은 입력을 조용히 삼키면 유실 계열 실패가 전부 침묵한다.
    if (v.length < 12) {
      if (v.length > 0) { setErrMsg(`토큰이 짧습니다(${v.length}/12) — 다시 스캔해 주세요.`); setPhase('error'); setResult(null) }
      return
    }
    setPhase('looking'); setErrMsg(''); setResult(null)
    try {
      const r = await lookupTicket(v)
      if (r && r.state) { setResult({ ...r, token: v }); setPhase('found') }
      else { setErrMsg(r?.error === 'not_found' ? '등록되지 않은 티켓' : r?.error === 'bad_token' ? '잘못된 토큰 형식' : (r?.error || '조회 실패')); setPhase('error') }
    } catch (e) {
      // Edge가 400/404를 던지는 경우 메시지 매핑
      const m = String(e?.message || '')
      setErrMsg(m.indexOf('not_found') >= 0 ? '등록되지 않은 티켓' : m.indexOf('bad_token') >= 0 ? '잘못된 토큰 형식' : m || '조회 실패')
      setPhase('error')
    }
    // ★여기서 버퍼를 지우지 않는다(2026-08-04 교정). Enter 핸들러가 이미 비웠고,
    //   await 뒤에 또 지우면 **조회 대기 중 들어온 다음 스캔이 통째로 삭제**된다
    //   (줄 서 있을 때 재현: A 조회 중 B 스캔 → B 유실 → 화면엔 A 결과가 남아 직원이 오인).
  }, [])

  const doRedeem = useCallback(async () => {
    if (!result?.token || busy) return
    // ★대상 고정(2026-08-04): 회수 중에 다음 티켓이 스캔되면 응답이 **엉뚱한 티켓 카드에 얹혔다**.
    //   진입 시점 토큰을 캡처해, 화면이 그 티켓일 때만 반영한다.
    const tok = result.token
    const sameTicket = (prev) => !!prev && prev.token === tok
    setBusy(true); setErrMsg('')
    try {
      const r = await redeemTicket(tok)
      if (r?.ok) {
        setResult((prev) => (sameTicket(prev) ? { ...prev, state: 'redeemed', stamp: r.stamp || prev.stamp, _justRedeemed: true } : prev)); setPhase((ph) => (sameTicket(result) ? 'redeemed' : ph))
        const st = r.stamp || result?.stamp
        pushRedeemed({ token: tok, stamp: st ? `${st.current_stamps}/${st.threshold}` : null })
      }
      else {
        setErrMsg(STATE_LABEL[r?.reason === 'already_redeemed' ? 'redeemed' : r?.reason] || r?.reason || '회수 실패')
        if (r?.reason === 'already_redeemed') setResult((prev) => ({ ...prev, state: 'redeemed' }))
        if (r?.reason === 'expired') setResult((prev) => ({ ...prev, state: 'expired' }))
        setPhase('error')
      }
    } catch (e) { setErrMsg(e?.message || '회수 실패'); setPhase('error') }
    finally { setBusy(false) }
  }, [result, busy, pushRedeemed])

  const reset = useCallback(() => { setResult(null); setPhase('idle'); setErrMsg('') }, [])

  return { result, phase, errMsg, busy, doLookup, doRedeem, reset, setErrMsg }
}
