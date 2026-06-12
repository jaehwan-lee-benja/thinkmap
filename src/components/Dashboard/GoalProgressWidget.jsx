import React from 'react'
import { Plus } from 'lucide-react'
import { computeGoalProgress, progressPercent, periodLabel } from './goalUtils'

// 위젯 1: 목표 진행률 카드.
//   각 카드 = 제목 + 진행 막대(현재/목표) + period 라벨. 클릭 시 편집 모달.
//   진행률은 goalUtils.computeGoalProgress 로 조회 시점 계산 (DB 저장 안 함).

const DOMAIN_LABEL = {
  general: '일반', routine: '루틴', business: '사업체', asset: '자산', fitness: '체력',
}

export default function GoalProgressWidget({ goals, dataCtx, onEdit, onCreate }) {
  if (!goals.length) {
    return (
      <div className="dash-widget">
        <div className="dash-widget-head"><h3>목표 진행률</h3></div>
        <div className="dash-empty">
          <p>아직 목표가 없습니다.</p>
          <button className="dash-btn dash-btn-primary" onClick={onCreate}>
            <Plus size={14} /> 첫 목표 만들기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dash-widget">
      <div className="dash-widget-head">
        <h3>목표 진행률</h3>
        <button className="dash-icon-btn" onClick={onCreate} aria-label="목표 추가"><Plus size={16} /></button>
      </div>
      <div className="dash-goal-list">
        {goals.map(goal => {
          const p = computeGoalProgress(goal, dataCtx)
          const pct = progressPercent(p.ratio)
          const done = p.ratio >= 1
          return (
            <button key={goal.id} className="dash-goal-card" onClick={() => onEdit(goal)}>
              <div className="dash-goal-top">
                <span className="dash-goal-title">{goal.title || '(제목 없음)'}</span>
                <span className="dash-goal-period">{periodLabel(goal.period)}</span>
              </div>
              <div className="dash-bar">
                <div
                  className={`dash-bar-fill ${done ? 'is-done' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="dash-goal-meta">
                <span className="dash-goal-domain">{DOMAIN_LABEL[goal.domain] || goal.domain}</span>
                <span className="dash-goal-nums">
                  {p.current}/{p.target}{p.unit ? ` ${p.unit}` : ''}
                  {p.scheduled != null && p.scheduled !== p.target
                    ? ` · 예정 ${p.scheduled}` : ''}
                  {' · '}{pct}%
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
