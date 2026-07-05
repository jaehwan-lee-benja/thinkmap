import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { AppErrorBoundary } from './App.jsx'

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
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // 서비스 워커 등록 실패 무시 (기능에 영향 없음)
    })
  })
}
