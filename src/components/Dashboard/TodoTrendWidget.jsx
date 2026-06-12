import React, { useMemo } from 'react'
import { addDays, dateKey } from '../Schedule/scheduleUtils'

// 위젯 3: 투두 완료 추이.
//   최근 14일, 일별 (완료 수 / 전체 수) 막대. 기존 daily_blocks(is_todo) 만으로 구현.

const N_DAYS = 14

export default function TodoTrendWidget({ todoBlocks }) {
  const days = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // 각 날짜 키 초기화
    const map = {}
    const keys = []
    for (let i = N_DAYS - 1; i >= 0; i--) {
      const k = dateKey(addDays(today, -i))
      map[k] = { total: 0, done: 0 }
      keys.push(k)
    }
    for (const b of todoBlocks) {
      const slot = map[b.page_date]
      if (!slot) continue
      slot.total += 1
      if (b.todo_checked) slot.done += 1
    }
    return keys.map(k => ({ key: k, ...map[k] }))
  }, [todoBlocks])

  const maxTotal = Math.max(1, ...days.map(d => d.total))

  return (
    <div className="dash-widget">
      <div className="dash-widget-head"><h3>투두 완료 추이 <span className="dash-sub">(최근 14일)</span></h3></div>
      <div className="dash-trend">
        {days.map(d => {
          const h = (d.total / maxTotal) * 100
          const doneH = d.total ? (d.done / d.total) * 100 : 0
          const dayNum = d.key.slice(8) // DD
          return (
            <div key={d.key} className="dash-trend-col" title={`${d.key}: ${d.done}/${d.total}`}>
              <div className="dash-trend-bar" style={{ height: `${h}%` }}>
                <div className="dash-trend-bar-done" style={{ height: `${doneH}%` }} />
              </div>
              <span className="dash-trend-label">{dayNum}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
