// 멤버십 키오스크 본체 — 직원 조회모드 ⇄ 고객 가입모드 전환(고객모드는 태블릿을 가로로 돌려 고객에게, 화면 정방향).
// + 회원 리스트(직원용 검색) 별도 화면. 데이터 호출은 src/api/membership.js(프록시 Edge, LIVE 게이트) 경유.
import { useState } from 'react'
import StaffLookupScreen from './StaffLookupScreen'
import CustomerSignupScreen from './CustomerSignupScreen'
import MemberListScreen from './MemberListScreen'
import './Kiosk.css'

export default function MembershipKiosk({ session }) {
  // 'staff' = 직원 조회모드(기본). 'customer' = 고객 가입모드. 'memberlist' = 회원 리스트(직원용).
  const [mode, setMode] = useState('staff')

  return (
    <div className={`mk-app mk-mode-${mode}`}>
      <header className="mk-topbar">
        <div className="mk-modeswitch" role="tablist" aria-label="모드">
          <button
            role="tab"
            aria-selected={mode === 'staff'}
            className={mode === 'staff' ? 'is-active' : ''}
            onClick={() => setMode('staff')}
          >
            직원 조회
          </button>
          <button
            role="tab"
            aria-selected={mode === 'customer'}
            className={mode === 'customer' ? 'is-active' : ''}
            onClick={() => setMode('customer')}
          >
            고객 가입 ⟳
          </button>
        </div>
        {/* 직원용 회원 리스트(가입모드에선 숨김 — 고객이 보는 화면이라). */}
        {mode !== 'customer' && (
          <button className="mk-ml-open" onClick={() => setMode('memberlist')}>회원 리스트 확인하기</button>
        )}
      </header>

      <main className="mk-main">
        {mode === 'staff' && <StaffLookupScreen onGoSignup={() => setMode('customer')} />}
        {mode === 'customer' && <CustomerSignupScreen onDone={() => setMode('staff')} />}
        {mode === 'memberlist' && <MemberListScreen onBack={() => setMode('staff')} />}
      </main>
    </div>
  )
}
