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
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const weekday = weekdays[date.getDay()]
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

  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const weekday = weekdays[date.getDay()]

  return `${year}.${month}.${day}(${weekday}) ${hours}:${minutes}`
}

// 오늘 날짜인지 체크
export const isToday = (date) => {
  const today = new Date()
  return formatDateForDB(date) === formatDateForDB(today)
}
