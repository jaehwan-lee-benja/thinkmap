import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 지출 분류(Expense) 위성. base=/thinkmap/expense/(gh-pages 하위폴더), envDir=레포루트(공유 .env=같은 DB).
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/thinkmap/expense/',
  envDir: '../../',
  server: { host: '0.0.0.0', port: 5180 },
})
