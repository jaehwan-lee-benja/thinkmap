// 멤버십 키오스크 본체 — ★2대 분리(유저결정 A/A-2): URL role 로 뷰 분기.
//   고객 태블릿  = 기본(?role 없음/customer): CustomerView (셀프검색+원격푸시+가입).
//   직원 노트북  = ?role=staff: StaffView (조회→고객푸시 + 회원리스트 + 팝콘).
//   영수증 편집  = ?role=editor: ReceiptEditor (**매장 계정 이상** — 템플릿·테스트 인쇄. G12 판정 2026-08-09).
//   카운터 회수  = ?role=scan: ScanView (바코드 스캔 → 조회·회수·인쇄).
//   카운터 폰    = ?role=printer: PrinterView (발권 수신 → 자동 인쇄 브리지).
//   ★손님 폰     = ?role=ticket: TicketView — **인증 없이 열린다**(main.jsx 에서 분기).
//   ★매장 화면   = ?role=display: DisplayView — 손님용 응원 화면. 역시 인증 앞에서 갈라진다.
//     사유: 보는 사람이 고객이라 매장 계정이 없다. 서버 호출 0(URL 프래그먼트 자족 페이로드)이라
//     인증을 요구할 대상 자체가 없고, 회수는 여전히 직원 게이트에서만 일어난다.
//   매장 룸      = ?store=<id>(고정). Realtime 채널 인가는 매장 계정 세션(private 채널, 마이그 게이트).
import CustomerView from './CustomerView'
import StaffView from './StaffView'
import ReceiptEditor from './ReceiptEditor'
import ScanView from './ScanView'
import PrinterView from './PrinterView'
import TicketView from './TicketView'
import DisplayView from './DisplayView'
import { readRoleAndStore } from './kioskUtils'
import { PREVIEW } from '../../api/membership'
import './Kiosk.css'

// ★전체화면 버튼 제거(2026-08-01): 운영=Fully Kiosk Browser(스티키 몰입모드가 전체화면 담당)
//   → requestFullscreen 코드/버튼 불필요·미노출. (manifest fullscreen 은 무해하므로 유지.)
export default function MembershipKiosk({ session }) {
  const { role, store } = readRoleAndStore()

  return (
    <div className={`mk-app mk-role-${role}${PREVIEW ? ' mk-preview' : ''}`}>
      {/* ★무조작 복귀는 CustomerView 안으로 이관(2026-08-06) — «지금이 홈인가»를 아는 쪽이 무장을 결정한다. */}
      <main className="mk-main">
        {role === 'staff' && <StaffView store={store} />}
        {role === 'editor' && <ReceiptEditor />}
        {role === 'scan' && <ScanView />}
        {role === 'printer' && <PrinterView store={store} />}
        {role === 'ticket' && <TicketView />}
        {role === 'display' && <DisplayView store={store} />}
        {role === 'customer' && <CustomerView store={store} />}
      </main>
      {/* ★카운트다운 자리를 **상시 예약**한다(유저 2026-08-09: 「15초 칸이 생기면 전체 유아이가 위로
          튕기듯 올라가 — 아래에 빈칸 여백을 두고 메꾸는 방식으로」).
          종전엔 막대가 뜨는 순간 `.mk-app` 을 56px 줄여서 **본문 전체가 점프**했다.
          ⇒ 앱 안에 높이 고정 슬롯을 상시 두고, 막대는 그 위에 겹쳐 나타난다 — 본문은 픽셀 하나 안 움직인다.
          빈 상태에서도 앱 배경과 같은 색이라 «빈 여백»으로 보인다(앱 스코프 안이라 토큰이 그대로 붙는다).
          고객 화면에만 둔다 — 막대가 뜨는 화면이 여기뿐이고, 직원·편집기에서 56px 를 낭비할 이유가 없다. */}
      {role === 'customer' && <div className="mk-idle-slot" aria-hidden="true" />}
    </div>
  )
}
