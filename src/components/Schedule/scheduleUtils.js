// 캘린더 시간/좌표 유틸 (주간 뷰 공용)
//
// 시간 ↔ Y 픽셀 변환 / 주의 시작 / 15분 스냅 / 이벤트 레이아웃 등.

// startOfWeek/addDays/dateKey 는 core 로 승격됨(SITE-SPLIT-PLAN §12 Phase 6).
// 기존 사용처(이 파일에서 import 하던 다른 모듈들) 무변경 유지 위해 여기서 re-export.
export { startOfWeek, addDays, dateKey } from '@thinkmap/core'
import { startOfWeek, addDays } from '@thinkmap/core'

export const SLOT_MINUTES = 15           // 스냅 단위
export const HOUR_PX = 56                // 1시간 높이 (px)
export const DAY_MINUTES = 24 * 60

export const PX_PER_MIN = HOUR_PX / 60

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// Date → 그날의 0시부터 경과한 분
export function minutesFromMidnight(date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

// 15분 단위로 스냅된 Date 반환
export function snapToSlot(date, slotMin = SLOT_MINUTES) {
  const d = new Date(date)
  const mins = d.getHours() * 60 + d.getMinutes()
  const snapped = Math.round(mins / slotMin) * slotMin
  d.setHours(0, snapped, 0, 0)
  return d
}

// 두 시각이 겹치는가
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

// 그 달 첫 날을 포함하는 주의 시작(일요일 00:00)
export function startOfMonthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  return startOfWeek(first)
}

// startOfMonthGrid 에서 +42 일 (6주) — month grid 끝(exclusive)
export function endOfMonthGrid(date) {
  return addDays(startOfMonthGrid(date), 42)
}

// 같은 달인지
export function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

// uuid → HSL hue (0–360) 결정론적 변환
// FNV-1a 32bit 해시 사용. uuid 의 모든 hex 문자를 입력으로.
function fnv1a(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/**
 * owner uuid 에 대한 시각 색상 반환.
 * - 본인(selfUid) 이면 항상 --color-primary 변수 사용 (혼동 방지)
 * - 그 외는 hue 0–360 의 HSL 색
 *
 * @param ownerUid    표시할 owner 의 uuid
 * @param selfUid     현재 사용자의 uuid (없으면 무시)
 * @returns CSS color 문자열
 */
export function ownerHue(ownerUid, selfUid) {
  if (!ownerUid) return 'var(--color-text-tertiary)'
  if (selfUid && ownerUid === selfUid) return 'var(--color-primary)'
  const h = fnv1a(ownerUid) % 360
  // 다크 배경에서 가독성 위해 채도 70%, 명도 60%
  return `hsl(${h}, 70%, 60%)`
}

// 한 컬럼(=하루) 안에서 겹치는 이벤트들을 column 레이아웃에 할당
// 반환: [{ event, col, colCount }]
export function layoutDayColumn(dayEvents) {
  // start 오름차순, end 내림차순으로 정렬
  const sorted = [...dayEvents].sort((a, b) => {
    const sa = +new Date(a.start_at), sb = +new Date(b.start_at)
    if (sa !== sb) return sa - sb
    return +new Date(b.end_at) - +new Date(a.end_at)
  })
  const result = []
  let group = []     // 현재 겹치는 그룹
  let groupEnd = 0   // 그룹의 max end

  const flush = () => {
    // 그룹 내에서 column 할당
    const cols = []   // cols[i] = 마지막 끝난 시각
    group.forEach(ev => {
      const s = +new Date(ev.start_at)
      let col = cols.findIndex(c => c <= s)
      if (col === -1) { cols.push(+new Date(ev.end_at)); col = cols.length - 1 }
      else cols[col] = +new Date(ev.end_at)
      result.push({ event: ev, col, colCount: 0 /* 채울 예정 */ })
    })
    // colCount = 그룹 내 최대 컬럼 수
    const cc = cols.length
    for (let i = result.length - group.length; i < result.length; i++) {
      result[i].colCount = cc
    }
    group = []
    groupEnd = 0
  }

  sorted.forEach(ev => {
    const s = +new Date(ev.start_at)
    const e = +new Date(ev.end_at)
    if (group.length > 0 && s >= groupEnd) flush()
    group.push(ev)
    groupEnd = Math.max(groupEnd, e)
  })
  if (group.length > 0) flush()

  return result
}
