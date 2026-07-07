import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 위성(satellite)은 빌드 시 APP_BASE 로 자기 base 를 주입한다(예: /thinkmap-payroll/).
  // 미지정 시 모선(hub) 기본값 /thinkmap/. Vite 가 이 값을 import.meta.env.BASE_URL 로 전파.
  base: process.env.APP_BASE || '/thinkmap/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
