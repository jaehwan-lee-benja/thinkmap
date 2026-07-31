import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 자리후(Seat) 위성. base=/thinkmap/seat/(gh-pages 하위폴더), envDir=레포루트(공유 .env=같은 DB).
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/thinkmap/seat/',
  envDir: '../../',
  // allowedHosts: 같은 와이파이 기기(아이패드 등)에서 mDNS 이름(*.local)으로 접속 허용.
  // Supabase Auth 리디렉트 허용목록이 숫자 IP 호스트를 매칭하지 못해, LAN 테스트는 IP 대신 이름으로 붙는다.
  server: { host: '0.0.0.0', port: 5177, allowedHosts: ['.local'] },
})
