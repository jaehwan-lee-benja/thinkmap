import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 멤버십 키오스크(Membership) 위성. base=/thinkmap/membership/(gh-pages 하위폴더),
// envDir=레포루트(공유 .env=thinkmap DB=직원 인증용). 회원 데이터는 crm 프로젝트(Edge 계약).
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/thinkmap/membership/',
  envDir: '../../',
  server: { host: '0.0.0.0', port: 5178 },
})
