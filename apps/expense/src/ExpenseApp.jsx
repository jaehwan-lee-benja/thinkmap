// 지출 분류 위성 — 셸 + 3뷰(분류 / 대사 / 봉투).
// 내부 도구라 «건조한 스타일»(docs/DESIGN-PHILOSOPHY.md): 장식 없음, 기능적 레이아웃, 모바일 우선.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchQueue, putVerdict } from './expenseSource.js'
import ClassifyView from './components/Expense/ClassifyView.jsx'
import ReconcileView from './components/Expense/ReconcileView.jsx'
import EnvelopeView from './components/Expense/EnvelopeView.jsx'

const TABS = [
  { id: 'classify', label: '분류' },
  { id: 'reconcile', label: '대사' },
  { id: 'envelope', label: '봉투' },
]

export default function ExpenseApp() {
  const [tab, setTab] = useState('classify')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  // ★새 유입 알림(asset ③): 쿠팡·이카운트가 붙으면 큐의 total 이 «늘어난다».
  //   그러면 분모가 커져 **진행률이 뒤로 가는 것처럼** 보인다 — 열심히 했는데 숫자가 내려가면
  //   회원님은 「내가 한 게 날아갔나」로 읽는다. 늘어난 사실을 «말해주면» 그 오해가 안 생긴다.
  const [added, setAdded] = useState(0)

  const load = useCallback(async () => {
    try {
      setErr(null)
      const d = await fetchQueue()
      const prev = Number(localStorage.getItem('xp.lastTotal') || 0)
      if (prev && d.total > prev) setAdded(d.total - prev)
      localStorage.setItem('xp.lastTotal', String(d.total))
      setData(d)
    } catch (e) { setErr(e) }
  }, [])
  useEffect(() => { load() }, [load])

  // 판정: 낙관적 갱신 → 실패하면 되돌린다(폰에서 응답을 기다리면 연속 플로우가 끊긴다).
  const decide = useCallback(async (itemKey, category) => {
    setBusy(true)
    const before = data
    setData((d) => d && ({ ...d, items: d.items.map((i) => i.item_key === itemKey ? { ...i, verdict: category === '보류' ? null : category } : i) }))
    try { await putVerdict(itemKey, category) }
    catch (e) { setErr(e); setData(before) }
    finally { setBusy(false) }
  }, [data])

  const progress = useMemo(() => {
    if (!data) return null
    const items = data.items || []
    const decided = items.filter((i) => i.verdict)
    const totalAmount = data.total_amount || items.reduce((s, i) => s + (i.amount || 0), 0) || 1
    return {
      count: decided.length, total: items.length,
      amount: decided.reduce((s, i) => s + (i.amount || 0), 0), totalAmount,
      pct: Math.round(decided.reduce((s, i) => s + (i.amount || 0), 0) / totalAmount * 100),
    }
  }, [data])

  return (
    <div className="xp-app">
      <header className="xp-head">
        <div className="xp-title">지출 분류</div>
        {progress && (
          // ★금액을 크게, 건수를 작게. 건수만 보면 착시가 난다(1건짜리 100개를 해도 금액은 3%).
          <div className="xp-prog">
            <b>{progress.pct}%</b>
            <span>정리됨 · {progress.count}/{progress.total}종</span>
          </div>
        )}
      </header>

      <nav className="xp-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`xp-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {added > 0 && (
        <div className="xp-added">
          새 항목 <b>{added}종</b>이 추가됐습니다 — 진행률 분모가 늘어난 것이지 판정이 사라진 게 아닙니다.
          <button type="button" onClick={() => setAdded(0)}>확인</button>
        </div>
      )}

      {err && (
        <div className="xp-err">
          <b>불러오지 못했습니다</b>
          <div>{err.body?.hint || err.message}</div>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}

      <main className="xp-main">
        {!data && !err && <div className="xp-empty">불러오는 중…</div>}
        {data && tab === 'classify' && <ClassifyView data={data} progress={progress} busy={busy} onDecide={decide} />}
        {data && tab === 'reconcile' && <ReconcileView />}
        {data && tab === 'envelope' && <EnvelopeView />}
      </main>
    </div>
  )
}
