// 자리후 통계 — 주문 배열(+스테이션 상태)에서 순수 계산. 데이터/네트워크 무관(단위 테스트 가능).
// 기본 플로우: 테이블링(created_at) → 주문(order_no_at) → 자리후전달(delivered_at) → 올림(raised_at) → 완료(completed_at)
//   각 구간은 양끝 시각이 모두 있는 주문만 집계(부분 데이터 허용 — 과거분은 컬럼 NULL 이라 자연히 빠진다).
import { isDineIn } from './seatRules'

const ms = (a, b) => {
  if (!a || !b) return null
  const t = new Date(b).getTime() - new Date(a).getTime()
  return Number.isFinite(t) && t >= 0 ? t : null // 음수(시계 역전·수동수정)는 버린다
}

// 중앙값 — 평균은 이상치(한 건 방치)에 크게 흔들려 주방 체감과 어긋난다. 둘 다 제공하되 중앙값을 앞세운다.
const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)

// 밀리초 → '3분 20초' / '45초' / '1시간 5분'
export function formatDuration(msVal) {
  if (msVal == null) return '—'
  const sec = Math.round(msVal / 1000)
  if (sec < 60) return `${sec}초`
  const min = Math.floor(sec / 60)
  const restSec = sec % 60
  if (min < 60) return restSec ? `${min}분 ${restSec}초` : `${min}분`
  const hr = Math.floor(min / 60)
  const restMin = min % 60
  return restMin ? `${hr}시간 ${restMin}분` : `${hr}시간`
}

const segStat = (label, values) => ({
  label,
  count: values.length,
  median: median(values),
  mean: mean(values),
  max: values.length ? Math.max(...values) : null,
})

// orders = seat_orders 배열, stations = seat_station_status 배열(완료 시각용)
export function computeSeatStats(orders = [], stations = []) {
  const total = orders.length

  // ── 구간 소요시간 ─────────────────────────────────────────────
  const segs = { order: [], deliver: [], raise: [], flow: [] }
  for (const o of orders) {
    const a = ms(o.created_at, o.order_no_at); if (a != null) segs.order.push(a)
    const b = ms(o.order_no_at, o.delivered_at); if (b != null) segs.deliver.push(b)
    const c = ms(o.delivered_at, o.raised_at); if (c != null) segs.raise.push(c)
    const f = ms(o.created_at, o.raised_at); if (f != null) segs.flow.push(f)
  }
  // 스테이션 완료(올림 → 완료) — 스테이션별로 나눠 본다(카이막·커피 독립, R6).
  const byStation = {}
  for (const s of stations) {
    if (!s?.completed || !s?.completed_at) continue
    const o = orders.find((x) => x.id === s.order_id)
    const t = ms(o?.raised_at, s.completed_at)
    if (t == null) continue
    ;(byStation[s.station] ||= []).push(t)
  }

  // ── 제조옵션 변경(야외/야외병행/포장) ──────────────────────────
  const opt = {
    outdoor: orders.filter((o) => o.opt_outdoor).length,
    takeout: orders.filter((o) => o.opt_takeout).length,
    parallel: orders.filter((o) => o.opt_outdoor_parallel).length,
  }
  opt.none = total - (opt.outdoor + opt.takeout + opt.parallel)

  // ── 진행 상태 / 운영 지표 ────────────────────────────────────
  const delivered = orders.filter((o) => o.seat_delivered).length
  const raised = orders.filter((o) => o.raised).length
  const completedIds = new Set(stations.filter((s) => s.completed).map((s) => s.order_id))
  const flags = {
    confirmFlag: orders.filter((o) => o.confirm_flag).length,      // 확인필요가 걸렸던 주문
    confirmPending: orders.filter((o) => o.confirm_flag && !o.confirm_done).length, // 아직 미확인
    raiseCanceled: orders.filter((o) => o.raise_canceled).length,  // 올림취소 이력
    noQueue: orders.filter((o) => !(o.queue_no > 0)).length,       // 테이블링 번호 없이 만든 주문
    dineIn: orders.filter(isDineIn).length,
    // 포장도고려 전달(R11) — 매장영수증(올림에 포장 라벨) / 포장영수증(올림 무시)
    maybeStore: orders.filter((o) => o.deliver_mode === 'maybe_store').length,
    maybeReceipt: orders.filter((o) => o.deliver_mode === 'maybe_receipt').length,
  }

  // ── 시간대 분포(생성 기준) — 피크 파악용 ───────────────────────
  const hours = {}
  for (const o of orders) {
    if (!o.created_at) continue
    const h = new Date(o.created_at).getHours()
    hours[h] = (hours[h] || 0) + 1
  }
  const peakHour = Object.keys(hours).length
    ? Number(Object.entries(hours).sort((a, b) => b[1] - a[1])[0][0])
    : null

  return {
    total,
    funnel: { created: total, ordered: orders.filter((o) => o.order_no).length, delivered, raised, completed: completedIds.size },
    segments: [
      segStat('테이블링 → 주문', segs.order),
      segStat('주문 → 자리후 전달', segs.deliver),
      segStat('자리후 전달 → 올림', segs.raise),
      segStat('전체(테이블링 → 올림)', segs.flow),
    ],
    stationSegments: Object.entries(byStation).map(([station, vals]) => segStat(`올림 → 완료 (${station})`, vals)),
    opt,
    flags,
    hours,
    peakHour,
  }
}
