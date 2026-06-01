/**
 * 급여 계산기 — 사르르목장 급여명세서 모델
 *
 * parseAttendance()가 만든 근무 세션 + 시급 설정으로 직원별 급여명세서를 계산한다.
 * 실제 발송된 4월 명세서로 모델을 검증했다:
 *   - 기본급 = 시급 × 표준 7시간 × 근무일수 (주말은 주말시급으로 별도 집계)
 *     · 검증: 김향숙 일요일 3일 × 7h × 12,500 = 262,500 (실제 PDF 일치)
 *     · 조우영 10,500 × 7 × 8 = 588,000 / 배미진 13,000 × 7 × 3 = 273,000 (일치)
 *   - 고용보험 ≈ 급여계 × 0.9% (안선영 1,025,650×0.9%≈9,170 / 김도윤 812,500×0.9%≈7,260)
 *   - 연장수당/주휴수당/보너스/교통비/식대/인센티브는 수기 조정 항목(기본 0)
 *
 * "5인 미만 사업장"이라 소득세/국민연금/건강보험은 대부분 미공제 → 기본 0, 수기 입력.
 *
 * 금액은 원(KRW) 정수, 시간은 분(minute) 단위로 다룬다.
 * 계산은 순수 함수다 — 화면 구성과 무관하게 재사용/검증된다.
 */

export const DEFAULT_RATES = { weekday: 10500, weekend: 12500 }

export const DEFAULT_CONFIG = {
  rates: { ...DEFAULT_RATES },
  standardDailyHours: 7,        // 1일 표준 근무시간(정민들레 등은 override로 6.5)
  employmentInsuranceRate: 0.009, // 고용보험 = 급여계 × 0.9%
}

// 명세서 항목(표시 순서 = 발송 양식 순서)
export const PAYMENT_ITEMS = ['기본급', '연장수당', '주휴수당', '보너스', '인센티브', '교통비', '식대']
export const DEDUCTION_ITEMS = ['소득세', '지방소득세', '고용보험', '국민연금', '건강보험']

const sumValues = (obj) => Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0)

/** 빈 지급/공제 항목 객체 */
function emptyItems(keys) {
  return keys.reduce((o, k) => ((o[k] = 0), o), {})
}

/**
 * 명세서 합계 재계산 — 화면에서 항목을 수정할 때마다 호출.
 * autoEmploymentInsurance=true 면 고용보험을 급여계×요율로 자동 채운다.
 *
 * @param {{payments:object, deductions:object}} slip
 * @param {object} [opts] { employmentInsuranceRate, autoEmploymentInsurance }
 * @returns 새 slip (불변) — { payments, deductions, grossTotal, deductionTotal, netPay }
 */
export function recomputePayslip(slip, opts = {}) {
  const rate = opts.employmentInsuranceRate ?? DEFAULT_CONFIG.employmentInsuranceRate
  const payments = { ...slip.payments }
  const deductions = { ...slip.deductions }

  const grossTotal = sumValues(payments)
  if (opts.autoEmploymentInsurance) {
    deductions['고용보험'] = Math.round(grossTotal * rate)
  }
  const deductionTotal = sumValues(deductions)
  return { payments, deductions, grossTotal, deductionTotal, netPay: grossTotal - deductionTotal }
}

/**
 * 근무 세션 → 직원별 급여명세서(기본값)
 *
 * @param {object[]} sessions  parseAttendance().sessions
 * @param {object}   [options]
 * @param {object}   [options.rates]      { weekday, weekend } 전역 기본 시급
 * @param {object}   [options.overrides]  { [name]: { weekday?, weekend?, standardDailyHours? } }
 * @param {number}   [options.standardDailyHours]      전역 1일 표준시간 (기본 7)
 * @param {number}   [options.employmentInsuranceRate] 고용보험 요율 (기본 0.009)
 * @param {boolean}  [options.autoEmploymentInsurance] 고용보험 자동 채움 (기본 true)
 * @param {string}   [options.payMonth]  "2026-04" 등 (메타용)
 * @returns {{
 *   month: string|null,
 *   rows: {
 *     name,
 *     rates: { weekday, weekend },
 *     standardDailyHours: number,
 *     workDays: number, weekdayDays: number, weekendDays: number,
 *     actualMinutes: number,           // 근태에서 파싱한 실제 근무분(참고용)
 *     anomalies: number,
 *     days: { date, isWeekend, workedMinutes, anomaly }[],
 *     payments: object,                // PAYMENT_ITEMS 키
 *     deductions: object,              // DEDUCTION_ITEMS 키
 *     grossTotal, deductionTotal, netPay,
 *   }[],
 *   totalGross: number, totalNet: number,
 * }}
 */
export function calculatePayroll(sessions, options = {}) {
  const rates = { ...DEFAULT_RATES, ...(options.rates || {}) }
  const overrides = options.overrides || {}
  const globalStdHours = options.standardDailyHours ?? DEFAULT_CONFIG.standardDailyHours
  const eiRate = options.employmentInsuranceRate ?? DEFAULT_CONFIG.employmentInsuranceRate
  const autoEI = options.autoEmploymentInsurance ?? true

  const byName = new Map()
  for (const s of sessions) {
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name).push(s)
  }

  const rows = []
  for (const [name, list] of byName) {
    const ov = overrides[name] || {}
    const rate = {
      weekday: ov.weekday ?? rates.weekday,
      weekend: ov.weekend ?? rates.weekend,
    }
    const stdHours = ov.standardDailyHours ?? globalStdHours

    let weekdayDays = 0, weekendDays = 0, actualMinutes = 0, anomalies = 0
    const days = []
    for (const s of list.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      if (s.isWeekend) weekendDays += 1
      else weekdayDays += 1
      actualMinutes += s.workedMinutes
      if (s.anomaly) anomalies += 1
      days.push({ date: s.date, isWeekend: s.isWeekend, workedMinutes: s.workedMinutes, anomaly: s.anomaly || null })
    }

    // 기본급 = Σ (요일별 일수 × 표준시간 × 해당 시급)
    const basePay = Math.round(
      weekdayDays * stdHours * rate.weekday + weekendDays * stdHours * rate.weekend
    )

    const payments = emptyItems(PAYMENT_ITEMS)
    payments['기본급'] = basePay
    const deductions = emptyItems(DEDUCTION_ITEMS)

    const totals = recomputePayslip(
      { payments, deductions },
      { employmentInsuranceRate: eiRate, autoEmploymentInsurance: autoEI }
    )

    rows.push({
      name,
      rates: rate,
      standardDailyHours: stdHours,
      workDays: weekdayDays + weekendDays,
      weekdayDays,
      weekendDays,
      actualMinutes,
      anomalies,
      days,
      ...totals, // payments, deductions, grossTotal, deductionTotal, netPay
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return {
    month: options.payMonth || null,
    rows,
    totalGross: rows.reduce((s, r) => s + r.grossTotal, 0),
    totalNet: rows.reduce((s, r) => s + r.netPay, 0),
  }
}

/** 분 → "8시간 30분" 같은 사람이 읽는 문자열 */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

/** 분 → "8.5" (소수 시간) */
export function minutesToHours(minutes, decimals = 2) {
  return +(minutes / 60).toFixed(decimals)
}

/** 1234567 → "1,234,567원" */
export function formatKRW(amount) {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`
}
