// 멤버십 키오스크 본체 — ★2대 분리(유저결정 A/A-2): URL role 로 뷰 분기.
//   고객 태블릿  = 기본(?role 없음/customer): CustomerView (셀프검색+원격푸시+가입).
//   직원 노트북  = ?role=staff: StaffView (조회→고객푸시 + 회원리스트 + 팝콘).
//   영수증 편집  = ?role=editor: ReceiptEditor (마스터 — 템플릿·테스트 인쇄).
//   카운터 회수  = ?role=scan: ScanView (바코드 스캔 → 조회·회수·인쇄).
//   카운터 폰    = ?role=printer: PrinterView (발권 수신 → 자동 인쇄 브리지).
//   ★손님 폰     = ?role=ticket: TicketView — **인증 없이 열린다**(main.jsx 에서 분기).
//     사유: 보는 사람이 고객이라 매장 계정이 없다. 서버 호출 0(URL 프래그먼트 자족 페이로드)이라
//     인증을 요구할 대상 자체가 없고, 회수는 여전히 직원 게이트에서만 일어난다.
//   매장 룸      = ?store=<id>(고정). Realtime 채널 인가는 매장 계정 세션(private 채널, 마이그 게이트).
import CustomerView from './CustomerView'
import StaffView from './StaffView'
import ReceiptEditor from './ReceiptEditor'
import ScanView from './ScanView'
import PrinterView from './PrinterView'
import TicketView from './TicketView'
import IdleReset from './IdleReset'
import { readRoleAndStore } from './kioskUtils'
import './Kiosk.css'

// ★전체화면 버튼 제거(2026-08-01): 운영=Fully Kiosk Browser(스티키 몰입모드가 전체화면 담당)
//   → requestFullscreen 코드/버튼 불필요·미노출. (manifest fullscreen 은 무해하므로 유지.)
export default function MembershipKiosk({ session }) {
  const { role, store } = readRoleAndStore()

  return (
    <div className={`mk-app mk-role-${role}`}>
      {/* 무조작 N초 → 첫 화면 복귀(고객 태블릿 개인정보 잔류 방지). 키 없이 role 별 적용. */}
      <IdleReset enabled={role === 'customer'} />
      <main className="mk-main">
        {role === 'staff' && <StaffView store={store} />}
        {role === 'editor' && <ReceiptEditor />}
        {role === 'scan' && <ScanView />}
        {role === 'printer' && <PrinterView store={store} />}
        {role === 'ticket' && <TicketView />}
        {role === 'customer' && <CustomerView store={store} />}
      </main>
    </div>
  )
}
