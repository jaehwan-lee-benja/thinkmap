// 지출 분류 위성 셸 — SITE-SPLIT Phase 8.
//
// ★2026-08-15 «셸 전환» — 로컬 전용에서 «공개 호스팅 + 로그인 게이트» 로 옮긴다.
//   지출은 사업 재무라 로그인만으론 부족하다: DB 쪽은 3층(audience ∧ 워크스페이스 ∧ owner)이
//   `spend.is_viewer()` 한 관문으로 막고, 셸은 그 판정을 «먼저 물어» 권한 없는 화면을 아예 안 그린다.
//   · 셸이 막는 것은 «화면»이고, 진짜 방어는 DB RLS 다(셸을 우회해도 0행). 이중이라 안전하다.
//   · ★계약 의존부(큐 읽기·판정 쓰기)는 아직 붙이지 않는다 — expenseSource.js 어댑터 뒤에 있고
//     Edge 계약이 확정되면 «그 파일만» 바뀐다. 지금 셸은 데이터 0 으로도 온전히 돈다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import { fetchQueue, putVerdict, isRemote } from './expenseSource.js'
import ClassifyView from './components/Expense/ClassifyView.jsx'
import ReconcileView from './components/Expense/ReconcileView.jsx'
import EnvelopeView from './components/Expense/EnvelopeView.jsx'

const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'
const TABS = [
  { id: 'classify', label: '분류' },
  { id: 'reconcile', label: '대사' },
  { id: 'envelope', label: '봉투' },
]

export default function ExpenseApp() {
  const { session, authLoading, handleGoogleLogin } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>
  if (!session) return (
    <div className="pv-center pv-login">
      <h1>지출 분류</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )
  return <Gate session={session} />
}

/**
 * 열람 게이트 — `spend.is_viewer()` 를 «먼저» 묻는다.
 * ★이 판정을 안 하면: 권한 없는 사람에게 «빈 화면»이 뜬다(RLS 가 0행을 주니까).
 *   그건 «데이터가 없다» 와 «볼 수 없다» 가 구분이 안 되는 화면이고, 오늘 우리가 계속 다룬 형태다.
 *   그래서 «볼 수 없음»을 «없음»으로 보여주지 않는다.
 */
function Gate({ session }) {
  const [state, setState] = useState('checking')   // checking | ok | denied | error
  const [detail, setDetail] = useState('')

  const check = useCallback(async () => {
    setState('checking')
    try {
      const { data, error } = await supabase.rpc('spend_can_view')
      if (error) throw error
      setState(data === true ? 'ok' : 'denied')
    } catch (e) {
      // ★함수가 아직 없을 수도 있다(계약/RPC 노출은 asset 소관, 이 셸보다 늦게 붙는다).
      //   그때 «거부»로 단정하면 원인을 숨긴다 — «확인 불가»로 따로 착지시킨다.
      setDetail(e?.message || String(e))
      setState('error')
    }
  }, [])
  useEffect(() => { check() }, [check])

  if (state === 'checking') return <div className="pv-center">권한 확인 중…</div>

  if (state === 'denied') return (
    <div className="pv-center pv-login">
      <h1>열람 권한이 없습니다</h1>
      <p>{session.user?.email}</p>
      <p className="xp-hint">지출 데이터는 소유자 등급만 볼 수 있습니다.<br />권한이 필요하면 관리자에게 요청하세요.</p>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )

  if (state === 'error') return (
    <div className="pv-center pv-login">
      <h1>권한을 확인하지 못했습니다</h1>
      {/* ★«권한 없음» 이 아니라 «확인 실패» 다. 둘을 같은 화면으로 만들면 진단이 불가능해진다. */}
      <p className="xp-hint">{detail}</p>
      <button onClick={check}>다시 시도</button>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )

  return <Board session={session} />
}

function Board({ session }) {
  const [tab, setTab] = useState('classify')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
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
    const amount = decided.reduce((s, i) => s + (i.amount || 0), 0)
    return { count: decided.length, total: items.length, amount, totalAmount, pct: Math.round(amount / totalAmount * 100) }
  }, [data])

  return (
    <div className="xp-app">
      <header className="xp-head">
        <div className="xp-title">지출 분류</div>
        {progress && (
          <div className="xp-prog"><b>{progress.pct}%</b><span>정리됨 · {progress.count}/{progress.total}종</span></div>
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
          {/* ★계약 미확정 구간에서는 여기로 착지한다. «데이터 없음»으로 위장하지 않는다. */}
          <b>큐를 불러오지 못했습니다</b>
          <div>{err.body?.hint || err.message}</div>
          {!isRemote && <div className="xp-hint">지금 이 화면은 «셸»만 배포된 상태입니다 — 데이터 연결(Edge 계약)은 아직 붙지 않았습니다.</div>}
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}

      <main className="xp-main">
        {!data && !err && <div className="xp-empty">불러오는 중…</div>}
        {data && tab === 'classify' && <ClassifyView data={data} progress={progress} busy={busy} onDecide={decide} />}
        {data && tab === 'reconcile' && <ReconcileView />}
        {data && tab === 'envelope' && <EnvelopeView />}
        {!data && err && tab !== 'classify' && (tab === 'reconcile' ? <ReconcileView /> : <EnvelopeView />)}
      </main>
    </div>
  )
}
