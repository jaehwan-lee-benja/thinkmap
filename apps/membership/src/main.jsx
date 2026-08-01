import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@thinkmap/core/styles/variables.css'  // 테마 토큰(단일 소스)
import './components/Kiosk/brand.css'         // ★정본 웹폰트(G마켓산스)·팔레트 — 앱 전역 로드(로그인/로딩 포함 통일)
import './index.css'
import MembershipApp from './MembershipApp.jsx'

import { initTheme } from '@thinkmap/core'
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MembershipApp />
  </StrictMode>,
)
