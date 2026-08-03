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
import { useCallback, useEffect, useRef, useState } from 'react'
import { render as renderCode128, widths } from '../../receipt/code128'
import { decodeTicketPayload } from './ticketLink'

export default function TicketView() {
  const canvasRef = useRef(null)
  const [t, setT] = useState(null)
  const [err, setErr] = useState('')
  const [barcodeErr, setBarcodeErr] = useState('')   // 바코드만 실패 — 토큰은 계속 보여준다(M5)

  // ★hashchange 를 듣는다(2026-08-04 교정): 티켓 페이지가 열린 채 **새 QR을 찍으면**
  //   origin·path·search 가 같고 fragment 만 달라 **리로드가 일어나지 않는다**(same-document navigation).
  //   브라우저가 기존 탭을 재사용하면 옛 토큰이 그대로 남아 만료·회수된 티켓을 스캔하게 된다.
  useEffect(() => {
    const load = () => {
      const data = decodeTicketPayload(window.location.hash)
      if (!data || !data.token) { setErr('티켓 정보를 읽을 수 없습니다. 키오스크에서 QR을 다시 스캔해 주세요.'); return }
      setErr(''); setBarcodeErr(''); setT(data)
    }
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [])

  // 바코드 렌더 — 화면 폭에 맞춰 **정수 모듈폭**으로만(소수 배율=바 경계 번짐=판독 실패).
  // ★폭 산출은 **실제 컨테이너를 재서** 한다(2026-08-04 교정).
  //   종전엔 `floor(avail/200)` 상수라 module 이 항상 2로 고정돼 캔버스가 374px 로 굳었고,
  //   360~412px 폰에서 **바코드가 카드를 넘쳐 잘렸다**(측정: 360/375/390/412 전부 초과, 430만 맞음).
  //   = 흔한 폰 대부분에서 스캔 불가. innerWidth 로 추정하면 카드 자체 padding 을 또 빠뜨리므로,
  //   추정하지 말고 **부모의 실제 내부 폭**을 잰다(패딩 변경에도 자가 교정).
  const drawBarcode = useCallback(() => {
    const cv = canvasRef.current
    if (!t?.token || !cv) return
    try {
      const host = cv.parentElement
      const cs = host ? getComputedStyle(host) : null
      const avail = host
        ? host.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
        : (window.innerWidth || 360) - 56
      const QUIET = 10
      const w = widths(t.token)
      let total = 0
      for (let i = 0; i < w.length; i++) total += w[i]
      const mod = Math.max(1, Math.floor(avail / (total + QUIET * 2)))
      renderCode128(cv, t.token, { module: mod, height: 120, quiet: QUIET })
      setErr('')
    } catch (e) {
      // ★실패해도 **토큰은 화면에 남긴다**(아래 렌더 참조) — 토큰이 정본이고 수기 입력으로 회수 가능하다.
      setBarcodeErr('바코드를 그릴 수 없습니다. 아래 번호를 카운터에 보여주세요.')
    }
  }, [t])

  useEffect(() => {
    drawBarcode()
    // 회전·창 크기 변경 시 다시 맞춘다(세로↔가로에서 잘리지 않게).
    window.addEventListener('resize', drawBarcode)
    window.addEventListener('orientationchange', drawBarcode)
    return () => {
      window.removeEventListener('resize', drawBarcode)
      window.removeEventListener('orientationchange', drawBarcode)
    }
  }, [drawBarcode])

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
        {barcodeErr
          ? <div className="mk-tv-bcerr">{barcodeErr}</div>
          : <canvas ref={canvasRef} />}
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
