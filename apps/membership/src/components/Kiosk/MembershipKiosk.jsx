// 멤버십 키오스크 본체 — ★2대 분리(유저결정 A/A-2): URL role 로 뷰 분기.
//   고객 태블릿  = 기본(?role 없음/customer): CustomerView (셀프검색+원격푸시+가입).
//   직원 노트북  = ?role=staff: StaffView (조회→고객푸시 + 회원리스트 + 팝콘).
//   매장 룸      = ?store=<id>(고정). Realtime 채널 인가는 매장 계정 세션(private 채널, 마이그 게이트).
import CustomerView from './CustomerView'
import StaffView from './StaffView'
import FullscreenButton from './FullscreenButton'
import { readRoleAndStore } from './kioskUtils'
import './Kiosk.css'

export default function MembershipKiosk({ session }) {
  const { role, store } = readRoleAndStore()

  return (
    <div className={`mk-app mk-role-${role}`}>
      <FullscreenButton />
      <main className="mk-main">
        {role === 'staff'
          ? <StaffView store={store} />
          : <CustomerView store={store} />}
      </main>
    </div>
  )
}
