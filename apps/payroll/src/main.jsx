import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PayrollApp from './PayrollApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PayrollApp />
  </StrictMode>,
)
