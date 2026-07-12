import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@thinkmap/core/styles/variables.css'  // 테마 토큰(단일 소스)
import './index.css'
import SeatApp from './SeatApp.jsx'

import { initTheme } from '@thinkmap/core'
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SeatApp />
  </StrictMode>,
)
