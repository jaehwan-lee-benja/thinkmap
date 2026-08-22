// 티켓 스캔 상태·동작 — ★**ScanView 와 직원 허브가 공유**한다(로직 복제 금지).
//   여기 담긴 방어들은 전부 현장에서 비싸게 얻은 것이다:
//   · 짧은 입력 무피드백 금지 · 조회 대기 중 다음 스캔 유실 방지 · 회수 응답이 엉뚱한 티켓에 얹히는 것 방지.
//   두 벌로 갈라두면 한쪽만 낡아 그 방어가 조용히 사라진다.
import { useState, useCallback } from 'react'
import { lookupTicket, redeemTicket } from '../../api/membership'
import { useRedeemedBroadcast } from './useMembershipChannel'

export const STATE_LABEL = { issued: '유효 — 제공 가능', redeemed: '이미 회수됨', expired: '만료됨', voided: '폐기됨' }
export const CHANNEL_LABEL = { kiosk: '키오스크', game: '게임 쿠폰' }

// ★실패의 «축»을 가른다(2026-08-10 레이어 자가감사 → 승인 착수).
//   종전엔 모든 실패가 `phase='error'` 하나로 수렴했고 화면도 같은 빨강 카드였다. 그래서
//   「등록되지 않은 티켓」(가짜 쿠폰)과 「Failed to fetch」(서버 순단)가 **직원 눈에 같은 모양**이었다.
//   ⇒ **서버가 순단하면 직원이 유효한 참여권을 거부한다.** 거부의 대가(손님이 못 받고 돌아감)와
//     지연의 대가(잠시 기다림)는 전혀 다른데 화면이 그 차이를 말해주지 않았다.
//   ★가르는 기준은 «문구·색»이 아니라 **«직원이 다음에 할 행동»**이다:
//     ticket  = 이 종이는 못 쓴다 → **거부하고 안내한다**(판정이 끝났다)
//     system  = 지금은 확인이 안 된다 → **다시 스캔하거나 수기 확인한다**(판정이 아직 없다)
//   ⇒ «판정 없음»을 «거부»로 착지시키지 않는다.
export const FAIL_TICKET = 'ticket'
export const FAIL_SYSTEM = 'system'

// 티켓 축으로 확정할 수 있는 서버 사유들 — 이 목록에 **없으면 시스템 축**이다.
//   ★열거를 «거부» 쪽에 둔 이유: 모르는 실패는 거부가 아니라 지연으로 떨어져야 안전하다
//     (모르는 것을 «가짜»로 단정하면 손님이 손해를 본다).
const TICKET_REASONS = new Set(['not_found', 'bad_token', 'expired', 'voided', 'already_redeemed'])

export function classifyFailure(codeOrMessage) {
  const s = String(codeOrMessage || '')
  for (const r of TICKET_REASONS) if (s.indexOf(r) >= 0) return FAIL_TICKET
  return FAIL_SYSTEM
}

const TICKET_MSG = { not_found: '등록되지 않은 티켓', bad_token: '잘못된 토큰 형식', expired: '만료된 티켓', voided: '폐기된 티켓', already_redeemed: '이미 회수된 티켓' }

function ticketMessage(s) {
  for (const k of Object.keys(TICKET_MSG)) if (String(s).indexOf(k) >= 0) return TICKET_MSG[k]
  return String(s)
}

export function useTicketScan() {
  const [result, setResult] = useState(null)
  const [phase, setPhase] = useState('idle')   // idle | looking | found | error | redeemed
  const [errMsg, setErrMsg] = useState('')
  // 실패의 축 — 'ticket'(거부) | 'system'(지연). phase==='error' 일 때만 의미가 있다.
  const [failKind, setFailKind] = useState(FAIL_TICKET)
  // 시스템 축에서 «다시 시도»가 무엇을 다시 하는지 알기 위해 마지막 토큰을 들고 있는다.
  const [lastToken, setLastToken] = useState('')
  const [busy, setBusy] = useState(false)
  // 회수 확정 → 손님 폰 티켓 화면을 «감사» 로 바꾸는 신호(공개 채널·소진된 토큰만).
  const pushRedeemed = useRedeemedBroadcast()

  const doLookup = useCallback(async (tok) => {
    const v = String(tok || '').trim().toUpperCase()
    // ★무피드백 금지(2026-08-04): 짧은 입력을 조용히 삼키면 유실 계열 실패가 전부 침묵한다.
    if (v.length < 12) {
      // 짧은 입력 = 스캔이 덜 읽힌 것이지 «가짜 티켓»이 아니다 ⇒ 시스템 축(다시 스캔).
      if (v.length > 0) {
        setErrMsg(`토큰이 짧습니다(${v.length}/12) — 다시 스캔해 주세요.`)
        setFailKind(FAIL_SYSTEM); setPhase('error'); setResult(null)
      }
      return
    }
    setPhase('looking'); setErrMsg(''); setResult(null); setLastToken(v)
    try {
      const r = await lookupTicket(v)
      if (r && r.state) { setResult({ ...r, token: v }); setPhase('found') }
      else {
        const code = r?.error || '조회 실패'
        const kind = classifyFailure(code)
        setErrMsg(kind === FAIL_TICKET ? ticketMessage(code) : String(code))
        setFailKind(kind); setPhase('error')
      }
    } catch (e) {
      // Edge가 400/404를 던지는 경우 메시지 매핑. ★그 외(네트워크 순단·5xx·타임아웃·미배선)는
      //   **시스템 축**으로 떨어져야 한다 — 종전엔 여기서 raw 영문 메시지가 «거부» 카드에 실렸다.
      const m = String(e?.code || e?.message || '')
      const kind = classifyFailure(m)
      setErrMsg(kind === FAIL_TICKET ? ticketMessage(m) : (m || '조회 실패'))
      setFailKind(kind); setPhase('error')
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
        const reason = r?.reason || '회수 실패'
        setErrMsg(STATE_LABEL[reason === 'already_redeemed' ? 'redeemed' : reason] || reason)
        if (reason === 'already_redeemed') setResult((prev) => ({ ...prev, state: 'redeemed' }))
        if (reason === 'expired') setResult((prev) => ({ ...prev, state: 'expired' }))
        setFailKind(classifyFailure(reason)); setPhase('error')
      }
    } catch (e) {
      // ★회수 실패도 축을 가른다: 서버가 «이미 회수»라 답한 것과 순단으로 못 물어본 것은 다르다.
      //   후자에서 «회수 실패»만 크게 띄우면 직원이 팝콘을 안 주고 돌려보낸다.
      const m = String(e?.code || e?.message || '')
      setErrMsg(m || '회수 실패'); setFailKind(classifyFailure(m)); setPhase('error')
    }
    finally { setBusy(false) }
  }, [result, busy, pushRedeemed])

  const reset = useCallback(() => { setResult(null); setPhase('idle'); setErrMsg(''); setFailKind(FAIL_TICKET) }, [])
  // 시스템 축 전용 — 같은 토큰으로 다시 조회한다(직원이 바코드를 다시 갖다 대지 않아도 되게).
  const retry = useCallback(() => { if (lastToken) doLookup(lastToken) }, [lastToken, doLookup])

  return { result, phase, errMsg, failKind, busy, lastToken, doLookup, doRedeem, retry, reset, setErrMsg }
}
