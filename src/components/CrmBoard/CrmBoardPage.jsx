import React, { useState } from 'react'
import { Columns2, BarChart3, ListChecks } from 'lucide-react'
import { useIsMobile } from '@thinkmap/core'
import PeriodNav from './PeriodNav'
import MetricsLane from './MetricsLane'
import TodoLane from './TodoLane'
import './CrmBoard.css'

/**
 * CRM 운영 보드 — 지표(월보) + 투두 2레인. CRM-BOARD-SPEC.
 * 정본 테이블(daily_blocks·goals·crm_metrics)을 읽어 나란히 놓는다(복사 없음).
 * 마스터 전용(App.jsx 에서 게이트). v1(P1): 셸 + 뷰모드 + 투두 레인(읽기).
 */

// 뷰 모드: 두 레인의 화면 비중 (CRM-BOARD-SPEC §3)
const VIEWS = [
  { key: 'balanced', label: '균형', icon: Columns2 },
  { key: 'metrics', label: '지표', icon: BarChart3 },
  { key: 'todos', label: '투두', icon: ListChecks },
]

export default function CrmBoardPage({ session }) {
  const { isMobile } = useIsMobile()
  const [view, setView] = useState('balanced')
  const [period, setPeriod] = useState('month')
  const [anchor, setAnchor] = useState(() => new Date())

  const showMetrics = view === 'balanced' || view === 'metrics'
  const showTodos = view === 'balanced' || view === 'todos'
  const metricsCompact = view === 'todos'

  return (
    <div className={`crmb-page ${isMobile ? 'is-mobile' : ''} view-${view}`}>
      <div className="crmb-toolbar">
        <h2 className="crmb-title">CRM 보드</h2>
        <PeriodNav
          period={period}
          anchor={anchor}
          onPeriodChange={setPeriod}
          onAnchorChange={setAnchor}
        />
        <div className="crmb-view-seg" role="group" aria-label="뷰 모드">
          {VIEWS.map(v => {
            const Icon = v.icon
            return (
              <button
                key={v.key}
                className={`crmb-view-btn ${v.key === view ? 'on' : ''}`}
                aria-pressed={v.key === view}
                onClick={() => setView(v.key)}
                title={`${v.label} 뷰`}
              >
                <Icon size={14} />
                <span>{v.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {metricsCompact && (
        <MetricsLane session={session} period={period} anchor={anchor} compact />
      )}

      <div className="crmb-lanes">
        {showMetrics && !metricsCompact && (
          <MetricsLane session={session} period={period} anchor={anchor} />
        )}
        {showTodos && (
          <TodoLane session={session} period={period} anchor={anchor} />
        )}
      </div>
    </div>
  )
}
