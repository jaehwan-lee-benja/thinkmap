import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 급여(Payroll) 위성.
// - base: 위성 서브경로. APP_BASE 로 주입 가능(기본 /thinkmap-payroll/). Vite 가 import.meta.env.BASE_URL 로 전파.
// - envDir: 레포 루트로 지정 → 모선과 같은 .env(VITE_SUPABASE_URL/ANON_KEY)를 공유(위성 = 같은 DB).
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/thinkmap/payroll/',
  envDir: '../../',
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
})
