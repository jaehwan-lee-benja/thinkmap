import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@thinkmap/core/styles/variables.css'  // 테마 토큰(단일 소스) — 다른 CSS 앞에 로드
import './index.css'
import { withBase, initTheme } from '@thinkmap/core'
import App, { AppErrorBoundary } from './App.jsx'

initTheme()  // <html data-theme> 적용 + system 변경 리스닝(무-플래시는 index.html 인라인 스크립트가 선처리)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)

// 서비스 워커 등록 (프로덕션 환경에서만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(withBase('sw.js')).catch(() => {
      // 서비스 워커 등록 실패 무시 (기능에 영향 없음)
    })
  })
}
