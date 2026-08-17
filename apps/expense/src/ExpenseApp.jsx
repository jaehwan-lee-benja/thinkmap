// 지출 분류 위성 셸 — SITE-SPLIT Phase 8.
//
// ★2026-08-15 «셸 전환» — 로컬 전용에서 «공개 호스팅 + 로그인 게이트» 로 옮긴다.
//   지출은 사업 재무라 로그인만으론 부족하다: DB 쪽은 3층(audience ∧ 워크스페이스 ∧ owner)이
//   `spend.is_viewer()` 한 관문으로 막고, 셸은 그 판정을 «먼저 물어» 권한 없는 화면을 아예 안 그린다.
//   · 셸이 막는 것은 «화면»이고, 진짜 방어는 DB RLS 다(셸을 우회해도 0행). 이중이라 안전하다.
//   · ★계약 의존부(큐 읽기·판정 쓰기)는 아직 붙이지 않는다 — expenseSource.js 어댑터 뒤에 있고
//     Edge 계약이 확정되면 «그 파일만» 바뀐다. 지금 셸은 데이터 0 으로도 온전히 돈다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import { fetchQueue, createVerdictQueue, isRemote, fetchTaxonomy, flattenTaxonomy } from './expenseSource.js'
import { migrateDetailIds } from './detailStore.js'
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
  const [added, setAdded] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // ★«더 보기» — 리스트형으로 바뀌며 생긴 자리. 커서는 서버가 준 것을 그대로 되돌려준다(해석하지 않는다).
  const loadMore = useCallback(async () => {
    if (!data?.next_cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const more = await fetchQueue(data.next_cursor)
      setData((d) => d && ({ ...more, items: [...(d.items || []), ...(more.items || [])] }))
    } catch (e) { setErr(e) } finally { setLoadingMore(false) }
  }, [data, loadingMore])

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

  // ★판정은 «모아서» 보낸다(계약 §5 240/min). 품목 1건씩 치면 «쭉 탭» 흐름이 상한에 닿는다.
  //   화면은 낙관적으로 즉시 반영하고, 전송은 400ms 디바운스로 배치된다.
  const [note, setNote] = useState('')
  const queueRef = useRef(null)
  if (!queueRef.current) {
    queueRef.current = createVerdictQueue({
      onFlushed: (res) => {
        // ★unknown_keys 를 조용히 버리지 않는다(계약 §2-2). 빈 배열이 정상이다.
        if (res?.unknown_keys?.length) setErr(new Error(`서버가 못 찾은 품목 ${res.unknown_keys.length}건 — 보고가 필요합니다.`))
        // ★unknown_subcategories 도 조용히 버리지 않는다(계약 §2-2 v1.3). 이게 보이면 §2-3-a 함정을 밟은 것이다.
        else if (res?.unknown_subcategories?.length) setErr(new Error(`서버가 모르는 세부 ${res.unknown_subcategories.length}건 — 그 판정은 저장되지 않았습니다.`))
        else if (res?.rows_updated) setNote(`${res.rows_updated}건 정리됨`)
      },
      onError: (e) => setErr(e),
    })
  }
  // ★떠나기 전 남은 판정을 밀어낸다 — «마지막 한 건이 안 날아가는» 창을 막는다.
  useEffect(() => {
    const q = queueRef.current
    const bye = () => { if (q.size) q.flushNow() }
    window.addEventListener('pagehide', bye)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bye() })
    return () => { window.removeEventListener('pagehide', bye); bye() }
  }, [])

  const decide = useCallback((itemKey, category, extra) => {
    setErr(null)
    setData((d) => d && ({ ...d, items: d.items.map((i) => i.item_key === itemKey ? { ...i, verdict: category === '보류' ? null : category } : i) }))
    queueRef.current.push(itemKey, category, extra)
  }, [])

  // ★세부 목록 — 서버가 정본이다. 받아온 «직후»에 기기 보관분의 임시 id 를 진짜 uuid 로 승계한다
  //   (계약 §2-3-a: 순서를 건너뛰면 회원님이 입력해 둔 것이 전부 조용히 반송된다).
  const [taxonomy, setTaxonomy] = useState([])
  const [carry, setCarry] = useState({ migrated: 0, pending: 0 })
  useEffect(() => {
    if (!session) return
    let alive = true
    fetchTaxonomy()
      .then((tax) => {
        if (!alive) return
        const flat = flattenTaxonomy(tax)
        setTaxonomy(flat)
        setCarry(migrateDetailIds(flat))
      })
      .catch(() => { /* 목록을 못 받아도 판정 4버튼은 그대로 동작한다 — 여기서 화면을 막지 않는다 */ })
    return () => { alive = false }
  }, [session])

  const progress = useMemo(() => {
    if (!data) return null
    const items = data.items || []
    // ★계약 v1.1 개정⑶ — 진행률은 «서버가 준 3필드»로 그린다: pending / done / total = pending+done.
    //   v1 은 total=남은 수·done=0 고정이라 «분자 없는 분모»였다. 클라이언트가 items 로 세면
    //   **페이지(limit 50)만큼만 세게 되어** 전체 진행률이 아니라 «이번 페이지 진행률»이 된다 — 조용히 틀린다.
    //   서버 필드가 없으면(로컬 모드) 그때만 items 로 폴백한다.
    const decided = items.filter((i) => i.verdict)
    const total = Number.isFinite(data.total) ? data.total : items.length
    const count = Number.isFinite(data.done) ? data.done : decided.length
    // 금액 비율은 서버가 안 주므로 «이번 페이지 기준»이다 — 라벨에 그렇게 적는다(착시 방지).
    const totalAmount = data.total_amount || items.reduce((s, i) => s + (i.amount || 0), 0) || 1
    const amount = decided.reduce((s, i) => s + (i.amount || 0), 0)
    return { count, total, amount, totalAmount, pct: Math.round(count / (total || 1) * 100) }
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

      {note && <div className="xp-added">{note}<button type="button" onClick={() => setNote('')}>확인</button></div>}

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
          {/* ★로컬 모드 경고 — 문구가 «낡아서» 거짓이 돼 있었다(「Edge 계약 아직 안 붙음」: 이미 붙었다).
              지금 참인 사실은 다르다: 로컬 모드는 맥미니의 «파일 큐»를 읽고 쓰며 **실DB에 안 닿는다.**
              여기서 누른 판정은 서버에 없다 — 그걸 화면이 말하지 않으면 조용한 어긋남이 된다. */}
          {!isRemote && (
            <div className="xp-warn">
              <b>로컬 모드</b> — 이 화면의 판정은 이 컴퓨터의 파일에만 저장되고 <b>실제 서버에는 저장되지 않습니다</b>.
              실제로 정리하시려면 배포된 주소로 열어 주세요.
            </div>
          )}
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}

      <main className="xp-main">
        {!data && !err && <div className="xp-empty">불러오는 중…</div>}
        {data && tab === 'classify' && <ClassifyView data={data} progress={progress} busy={false} onDecide={decide} onLoadMore={loadMore} loadingMore={loadingMore} taxonomy={taxonomy} carriedOver={carry.migrated} pendingDetails={carry.pending} />}
        {data && tab === 'reconcile' && <ReconcileView />}
        {data && tab === 'envelope' && <EnvelopeView />}
        {!data && err && tab !== 'classify' && (tab === 'reconcile' ? <ReconcileView /> : <EnvelopeView />)}
      </main>
    </div>
  )
}
