// 요일 이름 (공통 상수)
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

// 날짜를 YYYY-MM-DD 형식으로 변환 (DB 저장용)
export const formatDateForDB = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 날짜를 YY.MM.DD(요일) 형식으로 포맷팅 (네비게이션용)
export const formatDateOnly = (date) => {
  const year = String(date.getFullYear()).slice(2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = DAY_NAMES[date.getDay()]
  return `${year}.${month}.${day}(${weekday})`
}

// 날짜를 YY.MM.DD(요일) HH:MM 형식으로 포맷팅 (생성시간 표시용)
export const formatDate = (dateString) => {
  const date = new Date(dateString)
  const year = String(date.getFullYear()).slice(2) // 마지막 두 자리만
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  const weekday = DAY_NAMES[date.getDay()]

  return `${year}.${month}.${day}(${weekday}) ${hours}:${minutes}`
}

// daily 페이지 이름 (예: "업무일지_2026-04-21(월)")
export const dailyPageName = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return `업무일지_${dateStr}`
  return `업무일지_${dateStr}(${DAY_NAMES[d.getDay()]})`
}

// 오늘 날짜인지 체크
export const isToday = (date) => {
  const today = new Date()
  return formatDateForDB(date) === formatDateForDB(today)
}

// YYYY-MM-DD 문자열에 days 만큼 더한 YYYY-MM-DD 반환 (타임존 무관)
// toISOString을 쓰면 UTC 변환으로 날짜가 밀려 같은 날짜가 되는 버그가 있어 문자열 파싱 경로로 처리
export const shiftDateKey = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return formatDateForDB(dt)
}

export const nextDateKey = (dateStr) => shiftDateKey(dateStr, 1)
export const prevDateKey = (dateStr) => shiftDateKey(dateStr, -1)
