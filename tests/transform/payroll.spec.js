import { describe, it, expect } from 'vitest'
import { parseAttendance } from '../../apps/payroll/src/utils/payroll/attendanceParser.js'
import {
  calculatePayroll, recomputePayslip,
  formatMinutes, formatKRW, minutesToHours,
  PAYMENT_ITEMS, DEDUCTION_ITEMS,
} from '../../apps/payroll/src/utils/payroll/payrollCalc.js'

// 실제 4월 근태 원본의 까다로운 케이스를 압축한 픽스처 (마크다운 표)
const RAW = `| 발생일자 | 부서명 | 사용자명 | 발생시각 | 상    태 | 사용장소 |
| :-: | :-: | :-: | :-: | :-: | :-: |
| 2026-04-02 | 사무직 | 김지연 | 9:48:06 | 01 [출근] | 1 |
|  | 사무직 | 김지연 | 11:36:53 | 01 [출근] | 1 |
|  | 사무직 | 김지연 | 11:37:18 | 01 [출근] | 1 |
|  | 사무직 | 김지연 | 17:27:48 | 02 [퇴근] | 1 |
| 2026-04-03 | 사무직 | 안선영 | 9:35:37 | 01 [출근] | 1 |
|  | 사무직 | 안선영 | 17:25:34 | 02 [퇴근] | 1 |
| 2026-04-12 | 사무직 | 김도윤 | 9:33:56 | 02 [퇴근] | 1 |
|  | 사무직 | 김도윤 | 9:34:05 | 01 [출근] | 1 |
|  | 사무직 | 김도윤 | 17:36:03 | 02 [퇴근] | 1 |
| 2026-04-20 | 사무직 | 조우영 | 17:19:08 | 02 [퇴근] | 1 |
`

describe('attendanceParser', () => {
  const { sessions, employees, dateRange, warnings } = parseAttendance(RAW)

  it('직원 목록과 날짜 범위를 추출한다', () => {
    expect(employees).toEqual(['김도윤', '김지연', '안선영', '조우영'])
    expect(dateRange).toEqual({ from: '2026-04-02', to: '2026-04-20' })
  })

  it('병합 날짜 셀 forward-fill + 중복 출근은 첫/마지막 스캔으로 보정', () => {
    const s = sessions.find(x => x.name === '김지연')
    expect(s.scanCount).toBe(4)
    expect(s.workedMinutes).toBe(17 * 60 + 27 - (9 * 60 + 48)) // 459
  })

  it('출근/퇴근 라벨이 뒤바뀌어도 첫→마지막 스캔으로 계산', () => {
    const s = sessions.find(x => x.name === '김도윤')
    expect(s.workedMinutes).toBe(17 * 60 + 36 - (9 * 60 + 33)) // 483
  })

  it('스캔 1회뿐이면 anomaly 표시 + 경고', () => {
    const s = sessions.find(x => x.name === '조우영')
    expect(s.anomaly).toBe('single-scan')
    expect(warnings.some(w => w.includes('조우영'))).toBe(true)
  })

  it('CSV 형식도 동일 처리', () => {
    const csv = '발생일자,부서명,사용자명,발생시각,상태,사용장소\n2026-04-03,사무직,홍길동,9:00:00,01 [출근],1\n,사무직,홍길동,18:00:00,02 [퇴근],1'
    expect(parseAttendance(csv).sessions[0].workedMinutes).toBe(9 * 60)
  })
})

describe('calculatePayroll — 사르르목장 명세서 모델 (실제 4월 PDF로 검증)', () => {
  // 김향숙: 일요일 3일 근무 → 주말시급 12,500 × 7h × 3 = 262,500 (실제 PDF 일치)
  const kimRaw = `발생일자,사용자명,발생시각,상태
2026-04-12,김향숙,9:45:00,출근
,김향숙,17:36:00,퇴근
2026-04-19,김향숙,9:44:00,출근
,김향숙,17:19:00,퇴근
2026-04-26,김향숙,9:46:00,출근
,김향숙,17:26:00,퇴근`

  it('기본급 = 시급 × 표준 7시간 × 근무일수 (주말 분리)', () => {
    const { rows } = calculatePayroll(parseAttendance(kimRaw).sessions)
    const r = rows[0]
    expect(r.weekendDays).toBe(3)
    expect(r.weekdayDays).toBe(0)
    expect(r.payments['기본급']).toBe(262500) // ← 실제 발송 PDF와 일치
  })

  it('인원별 시급 override (평일/주말 각각) — 배미진 주말 13,000', () => {
    const raw = `발생일자,사용자명,발생시각,상태
2026-04-04,배미진,9:40:00,출근
,배미진,17:29:00,퇴근
2026-04-18,배미진,9:38:00,출근
,배미진,17:37:00,퇴근
2026-04-25,배미진,9:37:00,출근
,배미진,17:33:00,퇴근`
    const { rows } = calculatePayroll(parseAttendance(raw).sessions, {
      overrides: { 배미진: { weekday: 13000, weekend: 13000 } },
    })
    expect(rows[0].weekendDays).toBe(3)
    expect(rows[0].payments['기본급']).toBe(273000) // 13,000×7×3 = 실제 PDF 일치
  })

  it('고용보험 = 급여계 × 0.9% 자동', () => {
    const { rows } = calculatePayroll(parseAttendance(kimRaw).sessions)
    expect(rows[0].deductions['고용보험']).toBe(Math.round(262500 * 0.009)) // 2,363
    expect(rows[0].netPay).toBe(rows[0].grossTotal - rows[0].deductionTotal)
  })

  it('표준시간 override (정민들레 6.5시간)', () => {
    const raw = `발생일자,사용자명,발생시각,상태
2026-04-03,정민들레,9:00:00,출근
,정민들레,16:30:00,퇴근`
    const { rows } = calculatePayroll(parseAttendance(raw).sessions, {
      overrides: { 정민들레: { standardDailyHours: 6.5, weekday: 12500 } },
    })
    expect(rows[0].payments['기본급']).toBe(Math.round(12500 * 6.5 * 1)) // 81,250
  })

  it('totalGross / totalNet 집계', () => {
    const { rows, totalGross, totalNet } = calculatePayroll(parseAttendance(RAW).sessions)
    expect(totalGross).toBe(rows.reduce((s, r) => s + r.grossTotal, 0))
    expect(totalNet).toBe(rows.reduce((s, r) => s + r.netPay, 0))
  })
})

describe('recomputePayslip — 명세서 편집 시 합계 재계산', () => {
  it('보너스/연장/교통 추가 + 고용보험 수기 → 급여계·차감수령액 (김향숙 PDF 일치)', () => {
    const r = recomputePayslip({
      payments: { 기본급: 262500, 보너스: 52500, 연장수당: 6250, 교통비: 15000 },
      deductions: { 고용보험: 1720 },
    }, { autoEmploymentInsurance: false })
    expect(r.grossTotal).toBe(336250) // ← 실제 PDF 급여계
    expect(r.netPay).toBe(336250 - 1720)
  })

  it('autoEmploymentInsurance=true 면 고용보험 자동 갱신', () => {
    const r = recomputePayslip({ payments: { 기본급: 1000000 }, deductions: {} }, { autoEmploymentInsurance: true })
    expect(r.deductions['고용보험']).toBe(9000)
  })
})

describe('상수 / 포맷터', () => {
  it('항목 순서', () => {
    expect(PAYMENT_ITEMS[0]).toBe('기본급')
    expect(DEDUCTION_ITEMS).toContain('고용보험')
  })
  it('formatMinutes / formatKRW / minutesToHours', () => {
    expect(formatMinutes(510)).toBe('8시간 30분')
    expect(formatKRW(1234567)).toBe('1,234,567원')
    expect(minutesToHours(510)).toBe(8.5)
  })
})
