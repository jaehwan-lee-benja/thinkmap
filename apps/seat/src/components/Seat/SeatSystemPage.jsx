// 자리후 시스템 — 풀스크린 키오스크 컨테이너. (SEAT-SPEC §12)
// 상단 역할 탭(자리안내·제조매니저·카이막·커피) → 선택 역할 화면 렌더.
// 역할은 화면 내 탭으로 전환하고, 마지막 역할을 localStorage에 기억.
import { useState, useEffect } from 'react'
import { ROLES, DEFAULT_ROLE, ROLE_STORAGE_KEY, getRole } from './config/seatRoles'
import { useSeatOrders } from './hooks/useSeatOrders'
import { useStationStatus } from './hooks/useStationStatus'
import GuideScreen from './screens/GuideScreen'
import ManagerScreen from './screens/ManagerScreen'
import StationScreen from './screens/StationScreen'
import './Seat.css'

const pad2 = (n) => String(n).padStart(2, '0')
const todayLabel = () => { const d = new Date(); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}` }
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

export default function SeatSystemPage({ session, demoOrders, demoStations, initialRole }) {
  const [roleKey, setRoleKey] = useState(() => {
    if (initialRole) return initialRole // 미리보기 진입(?role=) 초기값
    try { return localStorage.getItem(ROLE_STORAGE_KEY) || DEFAULT_ROLE } catch { return DEFAULT_ROLE }
  })
  useEffect(() => {
    try { localStorage.setItem(ROLE_STORAGE_KEY, roleKey) } catch { /* noop */ }
  }, [roleKey])

  const role = getRole(roleKey) || getRole(DEFAULT_ROLE)

  // TODO(권한·스키마 확정 후): 실시간 데이터 훅 연결. (SEAT-SPEC §8)
  //   const businessDate = todayISO()
  //   const { orders, patchOrder, createOrder } = useSeatOrders(businessDate)
  //   const { stations, patchStation } = useStationStatus(businessDate)
  // 미리보기(demoOrders 주입) = 정적, 실제 = 데이터 훅 + Realtime. (훅은 항상 호출 — 인자만 null)
  const isDemo = !!demoOrders
  const businessDate = todayISO()
  const live = useSeatOrders(isDemo ? null : businessDate)
  const liveStations = useStationStatus(isDemo ? null : businessDate)
  const orders = demoOrders || live.orders
  const stations = demoStations || liveStations.stations
  const onPatch = isDemo ? () => {} : live.patchOrder
  const onCommit = isDemo ? () => {} : live.commitOrder
  const onCreate = isDemo ? () => {} : (draft) => live.createOrder(draft || {})
  const onPatchStation = isDemo ? () => {} : liveStations.patchStation

  return (
    <div className="seat-app">
      <header className="seat-header">
        <div className="seat-header-date">{todayLabel()}</div>
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
      </header>

      <main className="seat-main">
        {role.key === 'guide' ? (
          <GuideScreen orders={orders} stations={stations} onPatch={onPatch} onCommit={onCommit} onCreate={onCreate} />
        ) : role.key === 'manager' ? (
          <ManagerScreen role={role} orders={orders} stations={stations} onPatch={onPatch} onCommit={onCommit} onCreate={onCreate} />
        ) : role.station ? (
          <StationScreen role={role} orders={orders} stations={stations} onPatchStation={onPatchStation} />
        ) : null}
      </main>
    </div>
  )
}
