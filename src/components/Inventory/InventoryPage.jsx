import React, { useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { useInventoryProducts, useInventoryDay } from '../../hooks/useInventory'
import { computeRow, resolveDayBasis, carryStart } from './inventoryCalc'
import './Inventory.css'

const SECTIONS = [
  { key: 'main', label: '본제품' },
  { key: 'sub', label: '보조제품' },
  { key: 'derived', label: '환산' },
]
const WD = ['일', '월', '화', '수', '목', '금', '토']

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const todayStr = () => ymd(new Date())
function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return ymd(d)
}
function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

export default function InventoryPage({ pageId, session }) {
  const [date, setDate] = useState(todayStr)
  const { products, previewMode, loading: pLoading } = useInventoryProducts()
  const { entries, dayBasis, prevEnd, dirty, saving, setField, setFields, changeDayBasis, save } =
    useInventoryDay(date, { previewMode })

  const weekday = WD[new Date(date + 'T00:00:00').getDay()]
  const basis = resolveDayBasis(date, { override: dayBasis })

  const rowsBySection = useMemo(() => {
    const g = { main: [], sub: [], derived: [] }
    products.forEach(p => { (g[p.category] || (g[p.category] = [])).push(p) })
    return g
  }, [products])

  if (pLoading) return <div className="inv-page"><div className="inv-loading">불러오는 중…</div></div>

  return (
    <div className="inv-page">
      <div className="inv-toolbar">
        <div className="inv-title"><Package size={18} /><span>재고 관리</span></div>

        <div className="inv-datenav">
          <button onClick={() => setDate(d => shiftDate(d, -1))} aria-label="전날">◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value || todayStr())} />
          <button onClick={() => setDate(d => shiftDate(d, 1))} aria-label="다음날">▶</button>
          <button className="inv-today" onClick={() => setDate(todayStr())}>오늘</button>
          <span className="inv-weekday">{weekday}요일</span>
        </div>

        <div className="inv-basis">
          <span>한계재고 기준</span>
          <button className={dayBasis === null ? 'active' : ''} onClick={() => changeDayBasis(null)}>
            자동({basis === 'weekend' ? '주말' : '평일'})
          </button>
          <button className={dayBasis === 'weekday' ? 'active' : ''} onClick={() => changeDayBasis('weekday')}>평일</button>
          <button className={dayBasis === 'weekend' ? 'active' : ''} onClick={() => changeDayBasis('weekend')}>주말</button>
        </div>

        <div className="inv-actions">
          {dirty && <span className="inv-dirty">변경됨</span>}
          <button className="inv-save" disabled={previewMode || saving || !dirty} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {previewMode && (
        <div className="inv-banner">
          미리보기 모드 — 스키마(<code>create-inventory.sql</code>) 적용 전입니다.
          입력·계산은 화면에서 확인되지만 저장되지 않습니다.
        </div>
      )}

      <div className="inv-tablewrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-name">제품 (평일/주말 par)</th>
              <th>시작합계</th><th>조정</th><th className="inv-note">비고</th>
              <th>일말A</th><th>일말B</th>
              <th className="inv-calc">종료합계</th>
              <th className="inv-calc">소비</th>
              <th className="inv-calc">수령필요</th>
              <th>실수령</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(sec => {
              const list = rowsBySection[sec.key] || []
              if (!list.length) return null
              return (
                <React.Fragment key={sec.key}>
                  <tr className="inv-secrow"><td colSpan={10}>{sec.label}</td></tr>
                  {list.map(p => {
                    const e = entries[p.id] || {}
                    const auto = carryStart(prevEnd[p.id], e.received)
                    const r = computeRow(e, p, date, { carryStart: auto, dayBasis })
                    const hasPar = p.par_weekday != null || p.par_weekend != null
                    const inp = (field) => ({
                      className: 'inv-input',
                      inputMode: 'decimal',
                      value: e[field] ?? '',
                      onChange: ev => setField(p.id, field, ev.target.value),
                    })
                    return (
                      <tr key={p.id}>
                        <td className="inv-name">
                          {p.name}
                          {hasPar && <span className="inv-par"> ({p.par_weekday ?? '–'}/{p.par_weekend ?? '–'})</span>}
                        </td>
                        {p.category === 'derived' ? (
                          <td colSpan={9} className="inv-derived">환산식 미정 — 추후 확정</td>
                        ) : (
                          <>
                            <td>
                              <input
                                className="inv-input"
                                inputMode="decimal"
                                value={e.start_total ?? ''}
                                placeholder={auto != null ? fmt(auto) : ''}
                                onChange={ev => setFields(p.id, { start_total: ev.target.value, start_manual: ev.target.value !== '' })}
                              />
                            </td>
                            <td><input {...inp('adjustment')} /></td>
                            <td><input {...inp('note')} className="inv-input inv-note-input" inputMode="text" /></td>
                            <td><input {...inp('end_a')} /></td>
                            <td><input {...inp('end_b')} /></td>
                            <td className="inv-calc">{fmt(r.endTotal)}</td>
                            <td className="inv-calc">{fmt(r.consumed)}</td>
                            <td className={`inv-calc ${r.needReceive < 0 ? 'inv-need' : ''}`}>{fmt(r.needReceive)}</td>
                            <td><input {...inp('received')} /></td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
