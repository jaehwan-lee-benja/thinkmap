// 마케팅 캔버스 위성 셸 — 생성·목록·열기 전면 자립(SITE-SPLIT Phase 3, 옵션 B).
// - 홈(?page 없음): 캔버스 페어 목록 + 새 캔버스 생성.
// - 열기(?page=<frame|engine pageId>): CanvasViewer + frame⇄engine 토글.
// 데이터는 공유 Supabase(canvas_* + pages). 캔버스는 마스터 소유물이라 userId=masterId=본인.
import { useCallback, useEffect, useState } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import CanvasViewer from './components/Canvas/CanvasViewer'
import CreateCanvasModal from './components/Canvas/CreateCanvasModal'

// 모선(Hub) base — 같은 origin 형제 서브경로. "← 모선" 백링크(SSO 자동).
const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

// ?page= 쿼리 읽기/쓰기 (deep-link·새로고침·뒤로가기 정합)
function readPageId() {
  return new URLSearchParams(window.location.search).get('page') || null
}
function writePageId(pageId, { replace = false } = {}) {
  const url = new URL(window.location.href)
  if (pageId) url.searchParams.set('page', pageId)
  else url.searchParams.delete('page')
  const fn = replace ? 'replaceState' : 'pushState'
  window.history[fn]({}, '', url)
}

// 캔버스 홈 — 페어 목록 + 새 캔버스
function CanvasHome({ session, onOpen }) {
  const [pairs, setPairs] = useState(null)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const uid = session?.user?.id

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase
      .from('canvas_pairs')
      .select('id, name, description, frame_page_id, engine_page_id')
      .is('deleted_at', null)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) { setError(error); setPairs([]); return }
    setPairs(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="cv-home">
      <div className="cv-home__head">
        <h1>마케팅 캔버스</h1>
        <button className="cv-new" onClick={() => setModalOpen(true)}>+ 새 캔버스</button>
      </div>

      {error && <p className="cv-empty">목록을 불러오지 못했습니다: {error.message || String(error)}</p>}
      {pairs === null && <p className="cv-empty">불러오는 중…</p>}
      {pairs !== null && pairs.length === 0 && !error && (
        <p className="cv-empty">아직 캔버스가 없습니다. “+ 새 캔버스”로 만들어 보세요.</p>
      )}

      {pairs !== null && pairs.length > 0 && (
        <ul className="cv-list">
          {pairs.map((p) => (
            <li className="cv-item" key={p.id}>
              <div>
                <div className="cv-item__name">{p.name}</div>
                {p.description && <div className="cv-item__desc">{p.description}</div>}
              </div>
              <button
                className="cv-item__open"
                onClick={() => onOpen(p.frame_page_id)}
                disabled={!p.frame_page_id}
              >
                열기 →
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateCanvasModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={uid}
        masterId={uid}
        onCreated={(_pairId, framePageId) => { setModalOpen(false); onOpen(framePageId) }}
      />
    </div>
  )
}

// 캔버스 열기 — 페어 컨텍스트(frame/engine 양 페이지) 조회 후 토글 + 뷰어
function CanvasOpen({ session, pageId, onHome, onSwitch }) {
  const [pair, setPair] = useState(null)   // { name, frame_page_id, engine_page_id } | 'notfound'
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('canvas_pairs')
        .select('name, frame_page_id, engine_page_id')
        .or(`frame_page_id.eq.${pageId},engine_page_id.eq.${pageId}`)
        .is('deleted_at', null)
        .maybeSingle()
      if (!alive) return
      setPair(error || !data ? 'notfound' : data)
    })()
    return () => { alive = false }
  }, [pageId])

  const canvasType = pair && pair !== 'notfound'
    ? (pageId === pair.frame_page_id ? 'frame' : 'engine')
    : null

  return (
    <div className="pv-root">
      <header className="pv-topbar">
        <button className="pv-back" onClick={onHome}>← 목록</button>
        <a className="pv-back" href={HUB_BASE}>모선</a>
        {pair && pair !== 'notfound' && (
          <span className="pv-pairtoggle">
            <button
              className={canvasType === 'frame' ? 'active' : ''}
              onClick={() => pair.frame_page_id && onSwitch(pair.frame_page_id)}
            >Frame</button>
            <button
              className={canvasType === 'engine' ? 'active' : ''}
              onClick={() => pair.engine_page_id && onSwitch(pair.engine_page_id)}
            >Engine</button>
          </span>
        )}
        <span className="pv-title">{pair && pair !== 'notfound' ? pair.name : '마케팅 캔버스'}</span>
      </header>
      <main className="pv-main">
        {canvasType
          ? <CanvasViewer key={pageId} pageId={pageId} canvasType={canvasType} session={session} />
          : <p className="cv-empty">{pair === 'notfound' ? '캔버스를 찾을 수 없습니다.' : '불러오는 중…'}</p>}
      </main>
    </div>
  )
}

export default function CanvasApp() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()
  const [pageId, setPageId] = useState(readPageId)

  // 뒤로/앞으로 가기 → URL 의 ?page 재동기
  useEffect(() => {
    const onPop = () => setPageId(readPageId())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openPage = useCallback((id) => { writePageId(id); setPageId(id) }, [])
  const goHome = useCallback(() => { writePageId(null); setPageId(null) }, [])

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>마케팅 캔버스</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  )

  // 마케팅 캔버스 = 마스터 전용(MAPPING-PLAN §3-2·§6 Phase 1 "마스터 뷰 only").
  // 분할 전엔 모선 사이드바 isMaster 게이트 뒤에 있었으나, 위성 독립 URL(/thinkmap/canvas/)엔
  // 그 게이트가 없으므로 payroll 위성과 동일하게 셸 단에서 막는다. (직원 뷰는 향후 Phase)
  if (!isMaster) return (
    <div className="pv-center">
      <p>접근 권한이 없습니다. (마스터 전용)</p>
      <a className="pv-back" href={HUB_BASE}>← 모선으로</a>
    </div>
  )

  if (!pageId) {
    return (
      <div className="pv-root">
        <header className="pv-topbar">
          <a className="pv-back" href={HUB_BASE}>← 모선</a>
          <span className="pv-title">마케팅 캔버스</span>
          <button className="pv-logout" onClick={handleLogout}>로그아웃</button>
        </header>
        <main className="pv-main">
          <CanvasHome session={session} onOpen={openPage} />
        </main>
      </div>
    )
  }

  return <CanvasOpen session={session} pageId={pageId} onHome={goHome} onSwitch={openPage} />
}
