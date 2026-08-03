// 통계 화면 — 오늘 또는 지난 날짜의 주문 흐름을 요약한다. (설정 → '통계 보기')
// 오늘은 이미 화면에 있는 orders/stations 를 그대로 쓰고, 과거 날짜는 그 날짜로 조회한다.
import { useState, useEffect } from 'react'
import { supabase } from '@thinkmap/core'
import { computeSeatStats, formatDuration } from '../utils/seatStats'

const pad2 = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const OPT_LABEL = { none: '변경 없음', outdoor: '야외', takeout: '포장으로변경', parallel: '야외병행' }

export default function SeatStats({ businessDate, maxDate, orders = [], stations = [], live = true }) {
  const [date, setDate] = useState(businessDate || toISO(new Date()))
  const [past, setPast] = useState(null)     // { orders, stations } — 과거 날짜 조회 결과
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const isToday = date === businessDate

  // 과거 날짜 = DB 조회. 오늘이면 이미 들고 있는 실시간 데이터를 쓴다(중복 조회 없음).
  useEffect(() => {
    if (isToday || !live) { setPast(null); return }
    let alive = true
    setLoading(true); setErr(null)
    ;(async () => {
      try {
        const { data: os, error: e1 } = await supabase
          .from('seat_orders').select('*').eq('business_date', date).is('deleted_at', null)
        if (e1) throw e1
        const { data: ss, error: e2 } = await supabase
          .from('seat_station_status').select('*').eq('business_date', date)
        if (e2) throw e2
        if (alive) setPast({ orders: os || [], stations: ss || [] })
      } catch (e) {
        console.error('SeatStats.fetch', e)
        if (alive) setErr('불러오지 못했습니다')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [date, isToday, live])

  const src = isToday || !live ? { orders, stations } : (past || { orders: [], stations: [] })
  const s = computeSeatStats(src.orders, src.stations)

  return (
    <div className="seat-stats">
      <div className="seat-stats-datebar">
        <label className="seat-stats-datelabel">
          날짜
          <input type="date" value={date} max={maxDate || businessDate} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!isToday && <button type="button" className="seat-btn" onClick={() => setDate(businessDate)}>보는 날짜로</button>}
      </div>

      {loading ? <div className="seat-stats-msg">불러오는 중…</div> : null}
      {err ? <div className="seat-stats-msg">{err}</div> : null}
      {!loading && !err && s.total === 0 ? <div className="seat-stats-msg">그 날의 주문 기록이 없습니다.</div> : null}

      {s.total > 0 && (<>
        {/* 흐름 — 단계별로 몇 건이 통과했는가. */}
        <section className="seat-stats-sec">
          <h4 className="seat-stats-h">주문 흐름</h4>
          <div className="seat-stats-funnel">
            {[['테이블링', s.funnel.created], ['주문번호', s.funnel.ordered], ['자리후 전달', s.funnel.delivered], ['올림', s.funnel.raised], ['완료', s.funnel.completed]].map(([k, v]) => (
              <div key={k} className="seat-stats-fitem">
                <span className="seat-stats-fnum">{v}</span>
                <span className="seat-stats-flabel">{k}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 구간 소요시간 — 중앙값을 앞세운다(평균은 방치 1건에 크게 흔들림). */}
        <section className="seat-stats-sec">
          <h4 className="seat-stats-h">구간 소요시간</h4>
          <table className="seat-stats-table">
            <thead><tr><th>구간</th><th>중앙값</th><th>평균</th><th>최대</th><th>건수</th></tr></thead>
            <tbody>
              {[...s.segments, ...s.stationSegments].map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td>{formatDuration(g.median)}</td>
                  <td>{formatDuration(g.mean)}</td>
                  <td>{formatDuration(g.max)}</td>
                  <td>{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="seat-stats-note">양쪽 시각이 모두 기록된 주문만 집계합니다. 통계 기능 이전 주문은 일부 구간이 비어 있을 수 있습니다.</p>
        </section>

        {/* 제조옵션 변경 분포. */}
        <section className="seat-stats-sec">
          <h4 className="seat-stats-h">제조옵션 변경</h4>
          <table className="seat-stats-table">
            <thead><tr><th>옵션</th><th>건수</th><th>비율</th></tr></thead>
            <tbody>
              {['outdoor', 'parallel', 'takeout', 'none'].map((k) => (
                <tr key={k}>
                  <td>{OPT_LABEL[k]}</td>
                  <td>{s.opt[k]}</td>
                  <td>{s.total ? `${Math.round((s.opt[k] / s.total) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 운영 신호 — 마찰이 있었던 지점. */}
        <section className="seat-stats-sec">
          <h4 className="seat-stats-h">운영 신호</h4>
          <table className="seat-stats-table">
            <tbody>
              <tr><td>확인필요가 걸린 주문</td><td>{s.flags.confirmFlag}건 (미확인 {s.flags.confirmPending})</td></tr>
              <tr><td>올림취소 이력</td><td>{s.flags.raiseCanceled}건</td></tr>
              <tr><td>테이블링 번호 없이 만든 주문</td><td>{s.flags.noQueue}건</td></tr>
              <tr><td>실내 시작 주문</td><td>{s.flags.dineIn}건 / 전체 {s.total}건</td></tr>
              <tr><td>포장도고려 전달</td><td>매장영수증 {s.flags.maybeStore}건 / 포장영수증 {s.flags.maybeReceipt}건</td></tr>
              <tr><td>가장 바쁜 시간대</td><td>{s.peakHour != null ? `${s.peakHour}시 (${s.hours[s.peakHour]}건)` : '—'}</td></tr>
            </tbody>
          </table>
        </section>
      </>)}
    </div>
  )
}
