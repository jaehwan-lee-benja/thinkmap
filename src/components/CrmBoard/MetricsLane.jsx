import React from 'react'
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react'
import { useCrmMetrics } from '../../hooks/useCrmMetrics'
import { REGION_LABELS, METRIC_REGION_ORDER } from './crmBoardUtils'

/**
 * 지표 레인 — CRM 월지표(crm_metrics) 렌더 + 새로고침. CRM-BOARD-SPEC §3, §4, §8.
 * 재무 숫자는 crm_metrics(마스터 전용 RLS)에서만 오고, 새로고침은 서버사이드 Edge 가 담당.
 *
 * @param session
 * @param period   'week'|'month'|'year'
 * @param anchor   Date
 * @param compact  true 면 "투두 집중" 뷰의 상단 미니바 형태.
 */

const fmt = (n) =>
  typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString('ko-KR') : '—'

/** 기간 내 인접 값 증감(%) — 마지막 vs 그 직전. 값 없으면 null. */
function trendPct(series) {
  const vals = series.filter((v) => typeof v === 'number')
  if (vals.length < 2) return null
  const prev = vals[vals.length - 2]
  const cur = vals[vals.length - 1]
  if (!prev) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

function Sparkline({ series }) {
  const vals = series.map((v) => (typeof v === 'number' ? v : 0))
  const max = Math.max(1, ...vals)
  if (series.filter((v) => typeof v === 'number').length < 2) return null
  return (
    <div className="crmb-spark" aria-hidden="true">
      {vals.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

export default function MetricsLane({ session, period, anchor, compact = false }) {
  const { byRegion, latestYm, hasData, loading, syncing, error, sync } =
    useCrmMetrics(session, period, anchor)

  const regionCur = (key) => {
    const list = byRegion[key] || []
    return list.find((r) => r.ym === latestYm) || list[list.length - 1] || null
  }

  // ── 투두 집중 뷰: 미니바 ──────────────────────────────────────────────
  if (compact) {
    const biz = regionCur('business')?.extra || {}
    const pick = (key) => regionCur(key)?.value
    return (
      <div className="crmb-metrics-mini" aria-label="지표 요약">
        <BarChart3 size={13} />
        {hasData ? (
          <span className="crmb-mini-nums">
            미등록 {fmt(pick('unregistered'))} · 경험 {fmt(pick('experience'))} ·
            단골 {fmt(pick('retention'))} · 매출 {fmt(biz['매출'])}
          </span>
        ) : (
          <span>지표 미적재 — 균형/지표 뷰에서 새로고침</span>
        )}
      </div>
    )
  }

  // ── 지표/균형 뷰: 전폭 ────────────────────────────────────────────────
  const biz = regionCur('business')?.extra || {}

  return (
    <section className="crmb-lane crmb-lane-metrics" aria-label="지표">
      <header className="crmb-lane-head">
        <h3 className="crmb-lane-title">지표</h3>
        <button
          className="crmb-btn crmb-refresh"
          onClick={sync}
          disabled={syncing}
          title="CRM에서 최신 지표를 서버사이드로 불러옵니다"
        >
          <RefreshCw size={13} className={syncing ? 'crmb-spin' : ''} />
          {syncing ? '동기화 중…' : '지표 새로고침'}
        </button>
      </header>

      {error && (
        <div className="crmb-metrics-note crmb-note-warn">
          <AlertCircle size={14} />
          <span>
            지표를 불러오지 못했습니다. 마이그레이션(crm_metrics) 적용과
            Edge 시크릿(ENGINE_API_KEY) 설정을 확인하세요.
          </span>
        </div>
      )}

      {loading ? (
        <div className="crmb-empty">불러오는 중…</div>
      ) : !hasData ? (
        <div className="crmb-metrics-placeholder">
          <BarChart3 size={22} />
          <p className="crmb-ph-title">아직 적재된 지표가 없습니다</p>
          <p className="crmb-ph-desc">
            [지표 새로고침]을 누르면 CRM에서 월별 지표(미등록·경험·결정·단골·매출)를
            서버사이드로 불러옵니다. 최초 1회는 마이그레이션 적용과 시크릿 설정이 필요합니다.
          </p>
        </div>
      ) : (
        <div className="crmb-metrics-body">
          <div className="crmb-metric-cards">
            {METRIC_REGION_ORDER.map((key) => {
              const cur = regionCur(key)
              const list = byRegion[key] || []
              const series = list.map((r) => r.value)
              const tp = trendPct(series)
              const label = cur?.metric || REGION_LABELS[key]
              return (
                <div key={key} className="crmb-metric-card">
                  <div className="crmb-metric-label">{label}</div>
                  <div className="crmb-metric-value">{fmt(cur?.value)}</div>
                  {tp !== null && (
                    <div className={`crmb-metric-trend ${tp >= 0 ? 'up' : 'down'}`}>
                      {tp >= 0 ? '▲' : '▼'} {Math.abs(tp).toFixed(1)}%
                    </div>
                  )}
                  <Sparkline series={series} />
                </div>
              )
            })}
          </div>

          {(biz['매출'] != null || biz['객단가'] != null) && (
            <div className="crmb-business-strip">
              <span><b>매출</b> {fmt(biz['매출'])}</span>
              <span><b>객단가</b> {fmt(biz['객단가'])}</span>
              <span><b>단골총마진</b> {fmt(biz['단골총마진'])}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
