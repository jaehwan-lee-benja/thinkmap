// 멤버십 키오스크 본체 — 직원 조회모드 ⇄ 고객 가입모드 전환(고객모드는 태블릿을 가로로 돌려 고객에게, 화면 정방향).
// 계약 무관 UI 골격. 데이터 호출은 src/api/membership.js(현재 STUB) 경유 — 계약 확정 시 화면 내부만 배선.
import { useState } from 'react'
import StaffLookupScreen from './StaffLookupScreen'
import CustomerSignupScreen from './CustomerSignupScreen'
import './Kiosk.css'

const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

export default function MembershipKiosk({ session }) {
  // 'staff' = 직원 조회모드(기본). 'customer' = 고객 가입모드(태블릿 가로로 돌려 고객에게, 화면 정방향).
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
        <a className="mk-hublink" href={HUB_BASE}>← 모선</a>
      </header>

      <main className="mk-main">
        {mode === 'staff'
          ? <StaffLookupScreen onGoSignup={() => setMode('customer')} />
          : <CustomerSignupScreen onDone={() => setMode('staff')} />}
      </main>
    </div>
  )
}
