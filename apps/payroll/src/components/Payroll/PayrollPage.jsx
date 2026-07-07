import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Upload, Save, AlertTriangle, RefreshCw, Link2 } from 'lucide-react'
import { parseAttendance } from '../../utils/payroll/attendanceParser'
import {
  calculatePayroll, recomputePayslip,
  DEFAULT_CONFIG, PAYMENT_ITEMS, DEDUCTION_ITEMS,
  formatKRW, formatMinutes, minutesToHours,
} from '../../utils/payroll/payrollCalc'
import { usePayrollSheet } from '../../hooks/usePayrollSheet'
import './Payroll.css'

const DEFAULT_MONTH = '2026-04'

/** 인원별 시급/표준시간 설정으로 기본급을 다시 계산해 행에 반영 */
function recalcRow(row, override, config) {
  const wRate = override?.weekday ?? config.rates.weekday
  const kRate = override?.weekend ?? config.rates.weekend
  const std = override?.standardDailyHours ?? config.standardDailyHours
  const base = Math.round(row.weekdayDays * std * wRate + row.weekendDays * std * kRate)
  const next = {
    ...row,
    rates: { weekday: wRate, weekend: kRate },
    standardDailyHours: std,
    payments: { ...row.payments, 기본급: base },
  }
  const t = recomputePayslip(
    { payments: next.payments, deductions: next.deductions },
    { autoEmploymentInsurance: config.autoEmploymentInsurance, employmentInsuranceRate: config.employmentInsuranceRate }
  )
  return { ...next, ...t }
}

export default function PayrollPage({ pageId }) {
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const { data: saved, loading, saving, save, months } = usePayrollSheet(pageId, month)

  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, autoEmploymentInsurance: true })
  const [overrides, setOverrides] = useState({})
  const [rows, setRows] = useState([])
  const [rawText, setRawText] = useState('')
  const [meta, setMeta] = useState({ dateRange: null, warnings: [] })
  const [dirty, setDirty] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [fetching, setFetching] = useState(false)

  // 저장본 로드 — 없으면 직전 설정(config/overrides)은 유지하고 명세만 비움
  useEffect(() => {
    if (saved) {
      setConfig({ ...DEFAULT_CONFIG, autoEmploymentInsurance: true, ...(saved.config || {}) })
      setOverrides(saved.overrides || {})
      setRows(saved.rows || [])
      setRawText(saved.attendanceRaw || '')
      setMeta({ dateRange: saved.dateRange || null, warnings: saved.warnings || [] })
    } else {
      setRows([])
      setRawText('')
      setMeta({ dateRange: null, warnings: [] })
    }
    setDirty(false)
  }, [saved, month])

  // 근태 파싱 → 기본 명세 생성 (textArg 주면 그 텍스트로, 아니면 상태의 rawText로)
  const handleParse = useCallback((textArg) => {
    const text = typeof textArg === 'string' ? textArg : rawText
    if (!text.trim()) { alert('근태 기록을 붙여넣어 주세요.'); return }
    try {
      const { sessions, warnings, dateRange } = parseAttendance(text)
      const result = calculatePayroll(sessions, {
        rates: config.rates,
        overrides,
        standardDailyHours: config.standardDailyHours,
        employmentInsuranceRate: config.employmentInsuranceRate,
        autoEmploymentInsurance: config.autoEmploymentInsurance,
        payMonth: month,
      })
      setRows(result.rows)
      setMeta({ dateRange, warnings })
      setDirty(true)
    } catch (e) {
      alert('파싱 실패: ' + e.message)
    }
  }, [rawText, config, overrides, month])

  // 구글시트 링크에서 직접 불러오기 (공개 "링크 보기" 시트 → gviz CSV export)
  const fetchFromSheet = useCallback(async () => {
    const m = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!m) { alert('올바른 구글시트 링크가 아닙니다.'); return }
    const id = m[1]
    const gidMatch = sheetUrl.match(/[#&?]gid=([0-9]+)/)
    const gid = gidMatch ? gidMatch[1] : '0'
    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
    setFetching(true)
    try {
      const res = await fetch(csvUrl)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const text = await res.text()
      // 비공개 시트면 로그인 HTML 페이지가 돌아온다
      if (/^\s*<(!doctype|html)/i.test(text)) {
        throw new Error('비공개 시트입니다. 시트 공유를 "링크가 있는 모든 사용자 - 뷰어"로 설정한 뒤 다시 시도하세요.')
      }
      setRawText(text)
      setDirty(true)
      handleParse(text) // 불러온 즉시 파싱
    } catch (e) {
      alert('시트 불러오기 실패: ' + e.message + '\n\n복사-붙여넣기 방식도 사용할 수 있습니다.')
    } finally {
      setFetching(false)
    }
  }, [sheetUrl, handleParse])

  // 지급/공제 항목 편집
  const editItem = useCallback((idx, kind, key, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const next = { ...r, [kind]: { ...r[kind], [key]: Number(value) || 0 } }
      const t = recomputePayslip(
        { payments: next.payments, deductions: next.deductions },
        { autoEmploymentInsurance: config.autoEmploymentInsurance && kind === 'payments', employmentInsuranceRate: config.employmentInsuranceRate }
      )
      return { ...next, ...t }
    }))
    setDirty(true)
  }, [config.autoEmploymentInsurance, config.employmentInsuranceRate])

  // 인원별 시급/표준시간 편집 → 기본급 재계산
  const editOverride = useCallback((name, field, value) => {
    const v = value === '' ? undefined : Number(value)
    const nextOv = { ...(overrides[name] || {}), [field]: v }
    setOverrides(prev => ({ ...prev, [name]: nextOv }))
    setRows(prev => prev.map(r => (r.name === name ? recalcRow(r, nextOv, config) : r)))
    setDirty(true)
  }, [overrides, config])

  const handleSave = useCallback(async () => {
    const payload = { config, overrides, rows, attendanceRaw: rawText, dateRange: meta.dateRange, warnings: meta.warnings }
    const { error } = await save(payload)
    if (error) alert('저장 실패: ' + error.message + '\n(payroll_sheets 마이그레이션 실행 여부를 확인하세요)')
    else setDirty(false)
  }, [config, overrides, rows, rawText, meta, save])

  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + (r.grossTotal || 0), 0),
    net: rows.reduce((s, r) => s + (r.netPay || 0), 0),
    count: rows.length,
  }), [rows])

  const anomalyCount = rows.reduce((s, r) => s + (r.anomalies || 0), 0)

  return (
    <div className="payroll-page">
      {/* 툴바 */}
      <div className="payroll-toolbar">
        <div className="payroll-toolbar-left">
          <h1 className="payroll-title">급여명세서</h1>
          <input
            type="month"
            className="payroll-month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            title="대상 월"
          />
          {months.length > 0 && (
            <select
              className="payroll-month-saved"
              value=""
              onChange={e => e.target.value && setMonth(e.target.value)}
              title="저장된 월 불러오기"
            >
              <option value="">저장된 월…</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {loading && <span className="payroll-muted">불러오는 중…</span>}
        </div>
        <div className="payroll-toolbar-right">
          <div className="payroll-summary">
            <span>{totals.count}명</span>
            <span>지급 {formatKRW(totals.gross)}</span>
            <span className="payroll-net">실수령 {formatKRW(totals.net)}</span>
          </div>
          <button className="payroll-btn payroll-btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={15} /> {saving ? '저장 중…' : '저장'}{dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      <div className="payroll-body">
        {/* 근태 업로드 */}
        <section className="payroll-card">
          <div className="payroll-card-head">
            <h2><Upload size={15} /> 근태 업로드</h2>
            {meta.dateRange && (
              <span className="payroll-muted">{meta.dateRange.from} ~ {meta.dateRange.to}</span>
            )}
          </div>
          <div className="payroll-sheet-url">
            <Link2 size={15} />
            <input
              type="url"
              className="payroll-url-input"
              placeholder="구글시트 링크 붙여넣기 (공유: 링크가 있는 모든 사용자 - 뷰어)"
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') fetchFromSheet() }}
            />
            <button className="payroll-btn" onClick={fetchFromSheet} disabled={fetching || !sheetUrl.trim()}>
              {fetching ? '불러오는 중…' : '링크에서 불러오기'}
            </button>
          </div>
          <div className="payroll-or">또는 아래에 직접 붙여넣기 (엑셀/시트 셀 복사 → 붙여넣기)</div>
          <textarea
            className="payroll-raw"
            placeholder="이카운트/출입통제 근태 기록을 붙여넣으세요 (CSV·엑셀 복사·표 모두 가능). 발생일자·사용자명·발생시각 컬럼을 자동 인식합니다."
            value={rawText}
            onChange={e => { setRawText(e.target.value); setDirty(true) }}
            rows={5}
          />
          <div className="payroll-row-actions">
            <button className="payroll-btn" onClick={handleParse}>
              <RefreshCw size={15} /> 파싱 → 기본 명세 생성
            </button>
            <span className="payroll-muted">파싱하면 기본급이 다시 계산됩니다(수기 조정 초기화).</span>
          </div>
          {meta.warnings?.length > 0 && (
            <div className="payroll-warnings">
              <AlertTriangle size={14} />
              <div>
                {meta.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            </div>
          )}
        </section>

        {/* 전역 설정 */}
        <section className="payroll-card">
          <div className="payroll-card-head"><h2>기본 설정</h2></div>
          <div className="payroll-config">
            <label>평일 시급
              <input type="number" value={config.rates.weekday}
                onChange={e => { setConfig(c => ({ ...c, rates: { ...c.rates, weekday: Number(e.target.value) || 0 } })); setDirty(true) }} />
            </label>
            <label>주말 시급
              <input type="number" value={config.rates.weekend}
                onChange={e => { setConfig(c => ({ ...c, rates: { ...c.rates, weekend: Number(e.target.value) || 0 } })); setDirty(true) }} />
            </label>
            <label>표준 1일 시간
              <input type="number" step="0.5" value={config.standardDailyHours}
                onChange={e => { setConfig(c => ({ ...c, standardDailyHours: Number(e.target.value) || 0 })); setDirty(true) }} />
            </label>
            <label className="payroll-check">
              <input type="checkbox" checked={config.autoEmploymentInsurance}
                onChange={e => { setConfig(c => ({ ...c, autoEmploymentInsurance: e.target.checked })); setDirty(true) }} />
              고용보험 자동({(config.employmentInsuranceRate * 100).toFixed(1)}%)
            </label>
            <span className="payroll-muted">설정 변경 후 시급 칸을 다시 입력하거나 재파싱하면 반영됩니다.</span>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="payroll-empty">근태를 업로드하고 파싱하면 인원별 명세서가 생성됩니다.</div>
        ) : (
          <>
            {/* 인원별 시급 설정 */}
            <section className="payroll-card">
              <div className="payroll-card-head"><h2>인원별 시급</h2></div>
              <table className="payroll-rates">
                <thead>
                  <tr><th>성함</th><th>평일</th><th>주말</th><th>일수(평/주말)</th><th>표준시간</th><th>실근무(참고)</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}{r.anomalies > 0 && <span className="payroll-anomaly-dot" title="이상치 있음">●</span>}</td>
                      <td><input type="number" value={overrides[r.name]?.weekday ?? config.rates.weekday}
                        onChange={e => editOverride(r.name, 'weekday', e.target.value)} /></td>
                      <td><input type="number" value={overrides[r.name]?.weekend ?? config.rates.weekend}
                        onChange={e => editOverride(r.name, 'weekend', e.target.value)} /></td>
                      <td className="payroll-center">{r.weekdayDays} / {r.weekendDays}</td>
                      <td><input type="number" step="0.5" className="payroll-narrow"
                        value={overrides[r.name]?.standardDailyHours ?? config.standardDailyHours}
                        onChange={e => editOverride(r.name, 'standardDailyHours', e.target.value)} /></td>
                      <td className="payroll-muted payroll-center">{minutesToHours(r.actualMinutes)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* 인원별 명세서 */}
            <section className="payroll-slips">
              {rows.map((r, idx) => (
                <PayslipCard key={r.name} row={r} idx={idx} month={month} onEdit={editItem} />
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function PayslipCard({ row, idx, month, onEdit }) {
  const [y, m] = (month || '').split('-')
  return (
    <div className="payroll-slip">
      <div className="payroll-slip-head">
        <span className="payroll-slip-title">{y && m ? `${y}년 ${Number(m)}월 급여명세서` : '급여명세서'}</span>
        <span className="payroll-slip-name">성명: <b>{row.name}님</b> · 직책: 사원</span>
      </div>
      <div className="payroll-slip-grid">
        <table className="payroll-items">
          <thead><tr><th>지급항목</th><th>지급액</th></tr></thead>
          <tbody>
            {PAYMENT_ITEMS.map(k => (
              <tr key={k}>
                <td>{k}</td>
                <td><input type="number" value={row.payments[k] || 0}
                  onChange={e => onEdit(idx, 'payments', k, e.target.value)} /></td>
              </tr>
            ))}
            <tr className="payroll-total-row"><td>급여계</td><td>{formatKRW(row.grossTotal)}</td></tr>
          </tbody>
        </table>
        <table className="payroll-items">
          <thead><tr><th>공제항목</th><th>공제액</th></tr></thead>
          <tbody>
            {DEDUCTION_ITEMS.map(k => (
              <tr key={k}>
                <td>{k}</td>
                <td><input type="number" value={row.deductions[k] || 0}
                  onChange={e => onEdit(idx, 'deductions', k, e.target.value)} /></td>
              </tr>
            ))}
            <tr className="payroll-total-row"><td>공제합계</td><td>{formatKRW(row.deductionTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="payroll-slip-foot">
        <span className="payroll-net-big">차감수령액 {formatKRW(row.netPay)}</span>
        <span className="payroll-muted">귀하의 노고에 감사드립니다. 사르르목장</span>
      </div>
    </div>
  )
}
