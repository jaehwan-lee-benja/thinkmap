import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 자리후(Seat) 위성. base=/thinkmap/seat/(gh-pages 하위폴더), envDir=레포루트(공유 .env=같은 DB).
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/thinkmap/seat/',
  envDir: '../../',
  server: { host: '0.0.0.0', port: 5177 },
})
