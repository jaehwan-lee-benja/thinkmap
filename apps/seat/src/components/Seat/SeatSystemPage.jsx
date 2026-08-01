// 자리후 시스템 — 풀스크린 키오스크 컨테이너. (SEAT-SPEC §12)
// 상단 역할 탭(자리안내·주문서관리·카이막·커피) → 선택 역할 화면 렌더.
// 역할은 화면 내 탭으로 전환하고, 마지막 역할을 localStorage에 기억.
import { useState, useEffect, useRef, useCallback } from 'react'
import { ROLES, DEFAULT_ROLE, ROLE_STORAGE_KEY, getRole } from './config/seatRoles'
import { useSeatOrders } from './hooks/useSeatOrders'
import { useStationStatus } from './hooks/useStationStatus'
import { useDemoSeat } from './hooks/useDemoSeat'
import { useSeatSettings } from './hooks/useSeatSettings'
import { useColumnWidths } from './hooks/useColumnWidths'
import { useStationOrder } from './hooks/useStationOrder'
import { hiddenColumnClasses } from './config/seatSettings'
import SettingsPanel from './components/SettingsPanel'
import SeatModal from './components/SeatModal'
import StatusOverview from './components/StatusOverview'
import SeatStats from './components/SeatStats'
import SeatOrderScreen from './screens/SeatOrderScreen'
import StationScreen from './screens/StationScreen'
import './Seat.css'

const pad2 = (n) => String(n).padStart(2, '0')
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

export default function SeatSystemPage({ session, demoOrders, demoStations, initialRole, preview }) {
  const [roleKey, setRoleKey] = useState(() => {
    if (initialRole) return initialRole // 미리보기 진입(?role=) 초기값
    try { return localStorage.getItem(ROLE_STORAGE_KEY) || DEFAULT_ROLE } catch { return DEFAULT_ROLE }
  })
  useEffect(() => {
    try { localStorage.setItem(ROLE_STORAGE_KEY, roleKey) } catch { /* noop */ }
  }, [roleKey])

  const role = getRole(roleKey) || getRole(DEFAULT_ROLE)

  // 기기별 설정(카메라 표시 등). 데이터 훅과 분리 — 화면 표시에만 영향.
  const { settings, setSetting } = useSeatSettings()
  const { widths, setWidth, resetWidths } = useColumnWidths(session) // 표 열 폭(계정 귀속 서버 + localStorage 폴백). 가로/세로 각각.
  const { stationOrders, setStationOrder } = useStationOrder(session) // 스테이션 카드 수동 순서(매장 공유)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false) // 통합 현황 — 모든 역할 공용(앱바)
  const [statsOpen, setStatsOpen] = useState(false)   // 통계(오늘/지난 날짜)

  // 전체화면 토글(브라우저 주소창까지 숨김 — 카이막 등 태블릿 키오스크용).
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()
      else document.documentElement.requestFullscreen?.()
    } catch { /* 미지원/차단 무시 */ }
  }

  // TODO(권한·스키마 확정 후): 실시간 데이터 훅 연결. (SEAT-SPEC §8)
  //   const businessDate = todayISO()
  //   const { orders, patchOrder, createOrder } = useSeatOrders(businessDate)
  //   const { stations, patchStation } = useStationStatus(businessDate)
  // 세 모드(훅은 항상 호출 — React 규칙, 인자만 비활성화):
  //   preview = 로컬 메모리 CRUD(로그인 우회, 인터랙션 O, 저장 X) — dev 프리뷰.
  //   demoOrders 주입 = 정적 미리보기(인터랙션 X).
  //   그 외 = 실제 데이터 훅 + Realtime.
  const isStaticDemo = !!demoOrders
  const isLive = !preview && !isStaticDemo
  // 보는 날짜 — 헤더 날짜(달력)로 지난 날짜를 열 수 있다(과거 데이터 조회, 유저 지시 2026-08-02).
  //   데이터 훅이 이 값을 그대로 쓰므로 지난 날짜도 Realtime·수정이 동일하게 동작한다.
  const today = todayISO()
  const [businessDate, setBusinessDate] = useState(today)
  const isPastDate = businessDate !== today

  // 저장 실패 토스트 — 직원이 "입력이 사라진" 걸 모르지 않게(주방에서 멀리서도 보이게 큰 글씨).
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showError = useCallback((msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // 오늘자 초기화 되돌리기 — 실행 후 10초간 '초기화 취소' 토스트. 시간 지나면 확정(soft delete 라 DB 복구는 여전히 가능).
  const [undoStamp, setUndoStamp] = useState(null)
  const undoTimer = useRef(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const demo = useDemoSeat(!!preview)
  const live = useSeatOrders(isLive ? businessDate : null, showError)
  const liveStations = useStationStatus(isLive ? businessDate : null, showError)

  const orders = preview ? demo.orders : (demoOrders || live.orders)
  const stations = preview ? demo.stations : (demoStations || liveStations.stations)
  const onPatch = preview ? demo.patchOrder : (isStaticDemo ? () => {} : live.patchOrder)
  const onCommit = preview ? demo.commitOrder : (isStaticDemo ? () => {} : live.commitOrder)
  const onCreate = preview ? (draft) => demo.createOrder(draft || {}) : (isStaticDemo ? () => {} : (draft) => live.createOrder(draft || {}))
  const onPatchStation = preview ? demo.patchStation : (isStaticDemo ? () => {} : liveStations.patchStation)
  const onDelete = preview ? demo.deleteOrder : (isStaticDemo ? () => {} : live.deleteOrder)
  const onResetToday = preview ? demo.resetToday : (isStaticDemo ? () => null : live.resetToday)
  const onUndoReset = preview ? demo.undoResetToday : (isStaticDemo ? () => {} : live.undoResetToday)
  // 행 순서 재배열 = 현재 프리뷰만(실 DB는 순서 저장 필드 미구현 → 마이그 후 연결). 없으면 핸들 미표시.
  const onReorder = preview ? demo.reorder : undefined
  const onSortByNumber = preview ? demo.sortByNumber : undefined

  // 열 리사이즈: 세로형(≤1023)이면 portrait 세트, 그 외 landscape. (자리안내·주문서관리 공통 — 동일 화면.)
  const onResizeColumn = (key, px) => {
    const portrait = typeof window !== 'undefined'
      && window.matchMedia('(max-width: 1023px)').matches
    setWidth(portrait ? 'portrait' : 'landscape', key, px)
  }

  // 오늘자 초기화 실행 → 되돌리기 창(10초) 오픈. 되돌리면 그 묶음만 복구.
  const handleResetToday = async () => {
    setSettingsOpen(false)
    const stamp = await onResetToday?.()
    if (!stamp) return
    setUndoStamp(stamp)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndoStamp(null), 10000)
  }
  const handleUndoReset = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    onUndoReset?.(undoStamp)
    setUndoStamp(null)
  }

  // 숨긴 열 = 루트 클래스(is-hide-<key>)로 전달 → CSS 가 헤더·데이터행을 함께 숨긴다.
  // (OrderRow 는 자리안내와 공용이라 DOM 은 건드리지 않는다 — 헤더 3곳 동기화 함정 회피.)
  const hideCls = hiddenColumnClasses(settings.hiddenColumns)

  // 열 폭 = CSS 변수로 주입. --sc-*(가로형) / --scp-*(세로형). Seat.css grid-template-columns 가 소비.
  const L = widths.landscape, P = widths.portrait
  const widthVars = {
    '--sc-no': `${L.no}px`, '--sc-order': `${L.order}px`, '--sc-mid': `${L.mid}px`, '--sc-opts': `${L.opts}px`, '--sc-confirm': `${L.confirm}px`, '--sc-memo': `${L.memo}px`,
    '--scp-no': `${P.no}px`, '--scp-order': `${P.order}px`, '--scp-mid': `${P.mid}px`, '--scp-opts': `${P.opts}px`, '--scp-confirm': `${P.confirm}px`, '--scp-memo': `${P.memo}px`,
  }

  return (
    <div className={`seat-app${hideCls ? ` ${hideCls}` : ''}`} style={widthVars}>
      <header className="seat-header">
        {/* 날짜 = 달력. 지난 날짜를 고르면 그 날 기록을 불러온다(오늘로 = ↩). */}
        <div className={`seat-header-date${isPastDate ? ' is-past' : ''}`}>
          <input
            type="date"
            className="seat-date-input"
            value={businessDate}
            max={today}
            aria-label="보는 날짜"
            onChange={(e) => setBusinessDate(e.target.value || today)}
          />
          {isPastDate && (<>
            <span className="seat-date-past-badge">지난 날짜</span>
            <button type="button" className="seat-btn seat-date-today" onClick={() => setBusinessDate(today)}>오늘로</button>
          </>)}
        </div>
        <nav className="seat-role-tabs" role="tablist" aria-label="역할 선택">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={r.key === role.key}
              className={`seat-role-tab${r.key === role.key ? ' is-active' : ''}`}
              onClick={() => setRoleKey(r.key)}
            >{r.label}</button>
          ))}
        </nav>
        {/* 전체화면 토글 — 우측 그룹 시작(현황·설정 왼쪽). 진입=⛶ 아이콘 / 전체화면 중=‘전체화면 나가기’ 텍스트. */}
        <button
          type="button"
          className={`seat-fullscreen-btn${isFullscreen ? ' is-exit' : ''}`}
          aria-label={isFullscreen ? '전체화면 나가기' : '전체화면'}
          title={isFullscreen ? '전체화면 나가기' : '전체화면'}
          onClick={toggleFullscreen}
        >{isFullscreen ? '전체화면 나가기' : '⛶'}</button>
        {/* 현황은 설정 안으로 이동(설정 → ‘현황 열기’). */}
        <button
          type="button"
          className="seat-settings-btn"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >설정</button>
      </header>

      {/* ★오늘자 초기화는 '오늘'을 볼 때만 — 지난 날짜 기록을 실수로 비우지 않도록 숨긴다. */}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={setSetting}
        onResetColumnWidths={resetWidths}
        onOpenStatus={() => { setSettingsOpen(false); setStatusOpen(true) }}
        onResetToday={isStaticDemo || isPastDate ? undefined : handleResetToday}
        onOpenStats={() => { setSettingsOpen(false); setStatsOpen(true) }}
        onClose={() => setSettingsOpen(false)}
      />

      <SeatModal open={statusOpen} title="현황" onClose={() => setStatusOpen(false)}>
        <StatusOverview orders={orders} stations={stations} />
      </SeatModal>

      {/* 통계 — 오늘은 화면 데이터 그대로, 지난 날짜는 그 날짜로 조회(라이브에서만). */}
      <SeatModal open={statsOpen} title="통계" onClose={() => setStatsOpen(false)}>
        <SeatStats businessDate={businessDate} maxDate={today} orders={orders} stations={stations} live={isLive} />
      </SeatModal>

      <main className="seat-main">
        {role.key === 'guide' || role.key === 'manager' ? (
          <SeatOrderScreen key={role.key} role={role} orders={orders} onPatch={onPatch} onCommit={onCommit} onCreate={onCreate} onReorder={onReorder} onSortByNumber={onSortByNumber} onResizeColumn={onResizeColumn} onDelete={onDelete} settings={settings} />
        ) : role.station ? (
          <StationScreen
            role={role}
            orders={orders}
            stations={stations}
            onPatchStation={onPatchStation}
            cardOrder={stationOrders[role.station]}
            onReorderCards={(ids) => setStationOrder(role.station, ids)}
            settings={settings}
          />
        ) : null}
      </main>

      {toast ? <div className="seat-toast" role="alert">{toast}</div> : null}

      {/* 오늘자 초기화 되돌리기 — 하단 토스트바(10초). 놓쳐도 soft delete 라 DB 복구는 가능. */}
      {undoStamp ? (
        <div className="seat-undo-bar" role="status">
          <span>오늘 기록을 초기화했습니다.</span>
          <button type="button" className="seat-btn" onClick={handleUndoReset}>초기화 취소</button>
        </div>
      ) : null}
    </div>
  )
}
