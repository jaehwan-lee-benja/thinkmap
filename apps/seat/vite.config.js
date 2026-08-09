import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// ★배포 버전 스탬프 — **사람 기준 표기**(유저 지시 2026-08-09 「자리후도 버전 기록 페이지마다」).
//   git hash 는 비교·기억이 안 된다(9e765e8 ↔ 7c8eccd 중 뭐가 최신인지 눈으로 못 가른다).
//   ⇒ `v8.9-3` = **월.일 + 그날의 판 번호**. «숫자가 커졌나»만 보면 새로고침 판별이 끝난다.
//   판 번호 = **그날 쌓인 커밋 수**(git). 상태 파일이 필요 없고, 커밋할 때마다 단조 증가하며,
//   날이 바뀌면 자연히 1부터 다시 시작한다. 같은 커밋을 두 번 구우면 같은 번호다(같은 코드=같은 판).
//   hash 는 괄호로 병기한다 — 사람은 앞을 읽고, 배포 검증은 뒤를 쓴다.
//   ⚠git 이 없거나 실패하면 시:분으로 떨어진다(그래도 단조 증가는 유지된다). 빌드는 멈추지 않는다.
//   ※멤버십 키오스크(apps/membership)와 **같은 문법** — 두 위성 표기가 갈리면 원격에서 판 번호를 대조 못 한다.
function gitOut(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch (e) { return '' }
}
function buildStamp() {
  const d = new Date()
  const day = `${d.getMonth() + 1}.${d.getDate()}`
  const n = gitOut('git log --since="today 00:00" --pretty=%h').split('\n').filter(Boolean).length
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { human: n > 0 ? `v${day}-${n}` : `v${day} ${hhmm}`, sha: gitOut('git rev-parse --short HEAD') || 'local' }
}

// 자리후(Seat) 위성. base=/thinkmap/seat/(gh-pages 하위폴더), envDir=레포루트(공유 .env=같은 DB).
export default defineConfig({
  plugins: [react()],
  define: {
    __SEAT_BUILD__: JSON.stringify(buildStamp().human),
    __SEAT_SHA__: JSON.stringify(buildStamp().sha),
  },
  base: process.env.APP_BASE || '/thinkmap/seat/',
  envDir: '../../',
  // allowedHosts: 같은 와이파이 기기(아이패드 등)에서 mDNS 이름(*.local)으로 접속 허용.
  // Supabase Auth 리디렉트 허용목록이 숫자 IP 호스트를 매칭하지 못해, LAN 테스트는 IP 대신 이름으로 붙는다.
  server: { host: '0.0.0.0', port: 5177, allowedHosts: ['.local'] },
})
