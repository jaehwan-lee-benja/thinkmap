import React, { useEffect, useState } from 'react'
import { RRule, Weekday } from 'rrule'

// SPEC §7.1 패턴 — 사용자 친화적 빈도 프리셋
const FREQ_OPTIONS = [
  { value: 'none',     label: '반복 안 함' },
  { value: 'daily',    label: '매일' },
  { value: 'weekdays', label: '평일 (월–금)' },
  { value: 'weekly',   label: '매주 요일 선택' },
  { value: 'monthly',  label: '매월 N일' },
  { value: 'yearly',   label: '매년' },
]

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DAY_WEEKDAYS = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA]

/**
 * RRULE 문자열을 화면 상태로 역파싱. 알 수 없는 패턴은 'custom' 으로 표시.
 */
function parseRruleToState(rruleStr) {
  if (!rruleStr) return { freq: 'none', byday: [], endMode: 'forever', count: 10, until: '' }
  try {
    const cleaned = rruleStr.startsWith('RRULE:') ? rruleStr.slice(6) : rruleStr
    const opts = RRule.parseString(cleaned)
    const s = { freq: 'none', byday: [], endMode: 'forever', count: 10, until: '' }

    if (opts.freq === RRule.DAILY) s.freq = 'daily'
    else if (opts.freq === RRule.WEEKLY) {
      const days = (opts.byweekday || []).map(d => typeof d === 'number' ? d : d.weekday)
      const weekdaysOnly = [1, 2, 3, 4, 5]
      const isWeekdays = days.length === 5 && weekdaysOnly.every(d => days.includes(d))
      if (isWeekdays) s.freq = 'weekdays'
      else {
        s.freq = 'weekly'
        // rrule.js: MO.weekday=0, TU=1,... SU=6 → 우리 인덱스(일=0)로 변환
        s.byday = days.map(d => (d + 1) % 7)
      }
    }
    else if (opts.freq === RRule.MONTHLY) s.freq = 'monthly'
    else if (opts.freq === RRule.YEARLY) s.freq = 'yearly'

    if (opts.count) { s.endMode = 'count'; s.count = opts.count }
    else if (opts.until) {
      s.endMode = 'until'
      const d = opts.until
      const pad = n => String(n).padStart(2, '0')
      s.until = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    return s
  } catch {
    return { freq: 'none', byday: [], endMode: 'forever', count: 10, until: '' }
  }
}

/**
 * 화면 상태 → RRULE 문자열. 'none' 이면 null.
 */
function stateToRrule(state, dtstart) {
  if (state.freq === 'none') return null
  const opts = { dtstart }
  switch (state.freq) {
    case 'daily':    opts.freq = RRule.DAILY; break
    case 'weekdays': opts.freq = RRule.WEEKLY; opts.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR]; break
    case 'weekly':
      opts.freq = RRule.WEEKLY
      // 우리 인덱스(일=0) → rrule 인덱스(월=0)
      opts.byweekday = state.byday.map(i => DAY_WEEKDAYS[i])
      break
    case 'monthly':  opts.freq = RRule.MONTHLY; opts.bymonthday = [dtstart.getDate()]; break
    case 'yearly':   opts.freq = RRule.YEARLY; break
    default: return null
  }
  if (state.endMode === 'count') opts.count = state.count
  else if (state.endMode === 'until' && state.until) {
    opts.until = new Date(state.until + 'T23:59:59')
  }
  const rule = new RRule(opts)
  // toString 결과는 "DTSTART:...\nRRULE:..." — RRULE 부분만 추출
  const lines = rule.toString().split('\n')
  const rline = lines.find(l => l.startsWith('RRULE:'))
  return rline ? rline.slice(6) : null
}

/**
 * EventEditor 안에 임베드되는 루틴 설정 섹션.
 *
 * @param rrule        현재 RRULE 문자열 (null = 단발)
 * @param startAt      DTSTART 로 사용할 ISO (event.start_at)
 * @param onChange     (newRrule|null) => void
 */
export default function RoutineEditor({ rrule, startAt, onChange }) {
  const [state, setState] = useState(() => parseRruleToState(rrule))

  // 부모에서 rrule 변경 시 동기화 (편집할 이벤트 바뀌면)
  useEffect(() => { setState(parseRruleToState(rrule)) }, [rrule])

  // state 변경 시 RRULE 직렬화해서 부모로 전달
  useEffect(() => {
    if (!startAt) return
    const dt = new Date(startAt)
    if (isNaN(dt.getTime())) return
    onChange(stateToRrule(state, dt))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state), startAt])

  const toggleDay = (idx) => {
    setState(s => {
      const has = s.byday.includes(idx)
      return { ...s, byday: has ? s.byday.filter(d => d !== idx) : [...s.byday, idx].sort() }
    })
  }

  return (
    <div className="routine-editor">
      <label>반복</label>
      <select
        value={state.freq}
        onChange={e => setState(s => ({ ...s, freq: e.target.value }))}
      >
        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {state.freq === 'weekly' && (
        <div className="byday-row">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              className={`day-chip ${state.byday.includes(i) ? 'on' : ''}`}
              onClick={() => toggleDay(i)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {state.freq !== 'none' && (
        <div className="end-row">
          <label>종료</label>
          <div className="row">
            <select
              value={state.endMode}
              onChange={e => setState(s => ({ ...s, endMode: e.target.value }))}
            >
              <option value="forever">계속 반복</option>
              <option value="count">N회 후</option>
              <option value="until">특정 날짜까지</option>
            </select>
            {state.endMode === 'count' && (
              <input
                type="number"
                min={1}
                max={999}
                value={state.count}
                onChange={e => setState(s => ({ ...s, count: parseInt(e.target.value) || 1 }))}
              />
            )}
            {state.endMode === 'until' && (
              <input
                type="date"
                value={state.until}
                onChange={e => setState(s => ({ ...s, until: e.target.value }))}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
