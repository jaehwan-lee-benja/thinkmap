// 손님 폰 티켓 화면(?role=ticket#<payload>) — 유저 채택 2026-08-03(종이 기본 + 화면QR 보조).
//
// ★설계 핵심: **서버를 부르지 않는다.**
//   티켓 데이터는 URL **프래그먼트(#)**로 들어온다. 프래그먼트는 **서버로 전송되지 않으므로**
//   ⑴신규 공개 엔드포인트 0 ⑵DB 조회 0 ⑶인증 0 ⇒ **익명 조회 오라클을 만들지 않는다**(게이트 0).
//   흔한 설계인 "공개 티켓 조회 URL"은 토큰만 알면 남의 티켓을 캐볼 수 있는 오라클이라 채택하지 않았다.
//
// 노출 위험 = 종이 영수증과 동일(그 순간 화면을 본 사람만). 회수는 여전히 직원 게이트 + 1회성이고
//   만료도 서버 판정이라 위조·재사용 이득이 없다. 담기는 PII 는 **마스킹명**뿐이다.
//
// ★바코드는 **실 CODE128**(game 검증본 이식)이다 — 기존 FakeBarcode 는 프리뷰용이라 스캔되지 않는다.
import { useEffect, useRef, useState } from 'react'
import { render as renderCode128 } from '../../receipt/code128'
import { decodeTicketPayload } from './ticketLink'

export default function TicketView() {
  const canvasRef = useRef(null)
  const [t, setT] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const data = decodeTicketPayload(window.location.hash)
    if (!data || !data.token) { setErr('티켓 정보를 읽을 수 없습니다. 키오스크에서 QR을 다시 스캔해 주세요.'); return }
    setT(data)
  }, [])

  // 바코드 렌더 — 화면 폭에 맞춰 **정수 모듈폭**으로만(소수 배율=바 경계 번짐=판독 실패).
  useEffect(() => {
    if (!t?.token || !canvasRef.current) return
    try {
      const avail = Math.min((window.innerWidth || 360) - 32, 520)
      // widths 총합 + 좌우 quiet zone(10모듈씩)을 기준으로 정수 모듈폭 산출
      const mod = Math.max(2, Math.floor(avail / 200))
      renderCode128(canvasRef.current, t.token, { module: mod, height: 120, quiet: 10 })
    } catch (e) { setErr('바코드를 그릴 수 없습니다: ' + (e?.message || '')) }
  }, [t])

  // 화면 밝기·자동잠금 — 스캔되는 동안 화면이 꺼지지 않게(지원 기기만).
  useEffect(() => {
    let lock = null, dead = false
    if (navigator.wakeLock) {
      navigator.wakeLock.request('screen').then((l) => { if (dead) l.release(); else lock = l }).catch(() => {})
    }
    return () => { dead = true; if (lock) lock.release().catch(() => {}) }
  }, [])

  if (err) return <div className="mk-scan"><div className="mk-scan-card mk-scan-bad"><div className="mk-scan-state">✗ {err}</div></div></div>
  if (!t) return <div className="mk-placeholder">불러오는 중…</div>

  return (
    <div className="mk-ticketview">
      <div className="mk-tv-head">
        <div className="mk-tv-title">사르르 <b>팝콘 이벤트</b> 참여권</div>
        {t.name && <div className="mk-tv-name">{t.name} 회원님</div>}
      </div>

      <div className="mk-tv-barcode">
        {/* 흑백 고정 — 판독 우선(브랜드색 금지) */}
        <canvas ref={canvasRef} />
        <div className="mk-tv-token">{t.token}</div>
      </div>

      <div className="mk-tv-guide">
        카운터에서 이 화면을 보여주세요.
        <br /><b>화면 밝기를 최대로</b> 하면 더 잘 읽힙니다.
      </div>
      {t.date && <div className="mk-tv-exp">유효기간: {t.date} 당일</div>}
    </div>
  )
}
