import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SeatApp from './SeatApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SeatApp />
  </StrictMode>,
)
