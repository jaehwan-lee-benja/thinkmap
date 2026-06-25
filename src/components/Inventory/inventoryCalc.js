// 재고 계산식 — 원본 구글 시트와 1:1 대조 가능하도록 한 곳에 모은다.
//
// 시트에 수식(=…)이 남아있지 않아, 셀 값 대조로 역추정한 규칙(Phase 0, 2026-06):
//   시작최종(startFinal)  = 시작값(자동이월 또는 수동) + 조정값(adjustment)
//   종료합계(endTotal)    = 일말A + 일말B
//   소비(consumed)        = 시작최종 − 종료합계
//   수령필요(needReceive) = par 설정 제품:  종료합계 − 요일par   (음수 = par 미달분, 시트 그대로)
//                           par 미설정 제품: 종료합계
//   요일par = par 기준일이 'weekend'면 par_weekend, 'weekday'면 par_weekday
//
//   par 기준일(day basis) 결정 = 3단 우선순위:
//     1) 사용자 수동 지정(inventory_days.par_basis) — 'weekday' | 'weekend' 강제
//     2) 공휴일 → 'weekend'  (외부 소스/내장 목록으로 자동 인식)
//     3) 요일 기본 → 토·일 'weekend', 그 외 'weekday'
//
// ※ 음수·소수 그대로. 올림·반올림·0클램프 없음(시트 동작 보존).
//
// 시트 예시행 대조(모두 2026-01-01 신정 → 주말 par 적용일):
//   제조우유  start38 endA22           → final38 end22 소비16 / par주말20 → 필요 22-20 = 2   (시트 2)
//   베이스    start26 endA6 endB8      → final26 end14 소비12 / par주말18 → 필요 14-18 = -4  (시트 -4)
//   카이막    start6.3 endA1           → final6.3 end1 소비5.3 / par주말4 → 필요 1-4  = -3   (시트 -3)
//   밀크티    start14 endA-6           → final14 end-6 소비20 / par 미설정 → 필요 -6          (시트 -6)

// 한국 공휴일(주말 par 적용일). 외부 사실이라 데이터로 둔다 — 추후 테이블/라이브러리로 이전 가능.
// 우선 2026년분만. 필요 시 호출부에서 holidays Set 을 주입해 덮어쓸 수 있다.
export const KR_HOLIDAYS_2026 = new Set([
  '2026-01-01', // 신정
  '2026-02-16', '2026-02-17', '2026-02-18', // 설 연휴
  '2026-03-01', '2026-03-02', // 삼일절(+대체)
  '2026-05-05', // 어린이날
  '2026-05-24', '2026-05-25', // 부처님오신날(+대체)
  '2026-06-06', // 현충일
  '2026-08-15', '2026-08-17', // 광복절(+대체)
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석 연휴
  '2026-10-03', '2026-10-05', // 개천절(+대체)
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
])

/** 빈값/null/''/undefined → 0, 그 외 숫자로. (시트의 공란=0 합산 규칙) */
export function num(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** par 가 설정돼 있는지(null/''/undefined = 미설정). */
export function hasPar(v) {
  return !(v === null || v === undefined || v === '')
}

/** YYYY-MM-DD 문자열 추출(문자열은 앞 10자, Date 는 로컬 날짜). */
function ymd(date) {
  if (typeof date === 'string') return date.slice(0, 10)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 토·일 여부. 날짜 문자열을 로컬(KST 환경) 기준으로 해석. */
export function isWeekend(date) {
  const d = typeof date === 'string' ? new Date(date.slice(0, 10) + 'T00:00:00') : date
  const day = d.getDay() // 0=일 … 6=토
  return day === 0 || day === 6
}

/** 주말 par 적용일 = 토·일 또는 공휴일. */
export function isWeekendPar(date, holidays = KR_HOLIDAYS_2026) {
  if (isWeekend(date)) return true
  return holidays ? holidays.has(ymd(date)) : false
}

/**
 * par 기준일을 3단 우선순위로 결정한다 → 'weekday' | 'weekend'.
 *   1) override(사용자 수동 지정) > 2) 공휴일 > 3) 요일 기본
 * @param {object} [opts]
 * @param {'weekday'|'weekend'|null} [opts.override] inventory_days.par_basis
 * @param {Set<string>} [opts.holidays] 공휴일 집합(미지정 시 내장 목록)
 */
export function resolveDayBasis(date, opts = {}) {
  if (opts.override === 'weekday' || opts.override === 'weekend') return opts.override
  const holidays = opts.holidays || KR_HOLIDAYS_2026
  return isWeekendPar(date, holidays) ? 'weekend' : 'weekday'
}

/** 해당 날짜에 적용할 par. 미설정이면 null. opts = { override, holidays } */
export function parForDay(product, date, opts = {}) {
  if (!product) return null
  const basis = resolveDayBasis(date, opts)
  const raw = basis === 'weekend' ? product.par_weekend : product.par_weekday
  return hasPar(raw) ? num(raw) : null
}

/**
 * 당일 시작값 자동이월 = 직전 영업일 종료합계 + 당일 실수령(received).
 * prevEndTotal 이 없으면(첫날/직전 기록 없음) null → 자동이월 불가(수동 입력 기대).
 */
export function carryStart(prevEndTotal, received) {
  if (prevEndTotal === null || prevEndTotal === undefined) return null
  return num(prevEndTotal) + num(received)
}

/**
 * 한 (일자 × 제품) 행의 계산 컬럼을 산출한다.
 * @param {object} entry   inventory_entries 행(start_total, start_manual, adjustment, end_a, end_b, received)
 * @param {object} product inventory_products 행(par_weekday, par_weekend)
 * @param {string|Date} date business_date
 * @param {object} [opts]
 * @param {number|null} [opts.carryStart] 직전 영업일 종료합계 기반 자동이월 시작값(없으면 null)
 * @param {'weekday'|'weekend'|null} [opts.dayBasis] 날짜별 par 기준 수동 지정(inventory_days.par_basis)
 * @param {Set<string>} [opts.holidays] 공휴일 집합 override
 * @returns {{ startBase, startFinal, endTotal, consumed, needReceive, par }}
 */
export function computeRow(entry, product, date, opts = {}) {
  const e = entry || {}
  const auto = opts.carryStart
  // 시작값: 수동 override(start_manual)면 입력값, 아니면 자동이월(없으면 입력값 fallback).
  const startBase = e.start_manual
    ? num(e.start_total)
    : (auto !== null && auto !== undefined ? auto : num(e.start_total))
  const startFinal = startBase + num(e.adjustment)
  const endTotal = num(e.end_a) + num(e.end_b)
  const consumed = startFinal - endTotal
  const par = parForDay(product, date, { override: opts.dayBasis, holidays: opts.holidays })
  const needReceive = par === null ? endTotal : endTotal - par
  return { startBase, startFinal, endTotal, consumed, needReceive, par }
}
