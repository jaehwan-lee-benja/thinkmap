import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PERIODS, PERIOD_LABELS, periodLabel, shiftPeriod, isCurrentPeriod } from './crmBoardUtils'

/**
 * 기간 축 — 주/월/년 세그먼트 + 이전/다음 네비. CRM-BOARD-SPEC §6.
 * @param period            'week'|'month'|'year'
 * @param anchor            Date
 * @param onPeriodChange    (period) => void
 * @param onAnchorChange    (Date) => void
 */
export default function PeriodNav({ period, anchor, onPeriodChange, onAnchorChange }) {
  const current = isCurrentPeriod(period, anchor)
  const label = periodLabel(period, anchor)

  return (
    <div className="crmb-period">
      <div className="crmb-seg" role="tablist" aria-label="기간">
        {PERIODS.map(p => (
          <button
            key={p}
            role="tab"
            aria-selected={p === period}
            className={`crmb-seg-btn ${p === period ? 'on' : ''}`}
            onClick={() => onPeriodChange(p)}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="crmb-period-nav">
        <button className="crmb-icon-btn" aria-label="이전"
          onClick={() => onAnchorChange(shiftPeriod(period, anchor, -1))}>
          <ChevronLeft size={16} />
        </button>
        <button className="crmb-btn crmb-period-label"
          onClick={() => onAnchorChange(new Date())} title="현재 기간으로">
          {current ? `이번 ${PERIOD_LABELS[period]}` : label}
        </button>
        <button className="crmb-icon-btn" aria-label="다음"
          onClick={() => onAnchorChange(shiftPeriod(period, anchor, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
