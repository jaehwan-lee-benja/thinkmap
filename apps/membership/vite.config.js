import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import postcssCustomProperties from 'postcss-custom-properties'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// ★배포 버전 스탬프 — **사람 기준 표기**(유저 2026-08-08: 「버전번호 좀더 인지하기 편하게」).
//   git hash 는 비교·기억이 안 된다(9e765e8 ↔ 7c8eccd 중 뭐가 최신인지 눈으로 못 가른다).
//   ⇒ `v8.8-12` = **월.일 + 그날의 판 번호**. «숫자가 커졌나»만 보면 새로고침 판별이 끝난다.
//   판 번호 = **그날 쌓인 커밋 수**(git). 상태 파일이 필요 없고, 커밋할 때마다 단조 증가하며,
//   날이 바뀌면 자연히 1부터 다시 시작한다. 같은 커밋을 두 번 구우면 같은 번호다(같은 코드=같은 판).
//   hash 는 괄호로 병기한다 — 사람은 앞을 읽고, 배포 검증은 뒤를 쓴다.
//   ⚠git 이 없거나 실패하면 시:분으로 떨어진다(그래도 단조 증가는 유지된다). 빌드는 멈추지 않는다.
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

// 멤버십 키오스크(Membership) 위성. base=/thinkmap/membership/(gh-pages 하위폴더),
// envDir=레포루트(공유 .env=thinkmap DB=직원 인증용). 회원 데이터는 crm(로컬 RPC 1-hop).
//
// ★운영환경(2026-08-01): CS-273N(KICC POS, Android 5.1.1) + Fully Kiosk Browser.
//   Android 5.1.1 의 System WebView 는 최악의 경우 Chrome 40 대(모듈·옵셔널체이닝·CSS 변수 전부 미지원).
//   WebView 는 Play 로 갱신되면 최대 ~106 이라 실제 버전 편차가 크다 → **최악 가정으로 빌드**한다:
//   ① legacy 플러그인: nomodule ES5 번들 + core-js 폴리필(구형은 이쪽을 실행, 최신은 모듈 번들).
//   ② 모던 청크도 target=es2015 로 낮춤(모듈은 되지만 오래된 WebView 61~79 대비, ?./?? 제거).
//   ③ postcss-custom-properties: var() 사용처마다 정적 폴백을 함께 출력(CSS 변수 미지원 대응).
const tokenSources = [
  fileURLToPath(new URL('./src/components/Kiosk/Kiosk.css', import.meta.url)),   // --md-* (다크 기본)
  fileURLToPath(new URL('./src/components/Kiosk/brand.css', import.meta.url)),   // --brand-*, --mk-font-*
  fileURLToPath(new URL('../../packages/core/src/styles/variables.css', import.meta.url)), // --color-*
]

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 40', 'android >= 5'],
      // 구형 WebView 결손 보강: async/await(regenerator) + fetch(Chrome<42) — supabase-js 가 fetch 사용.
      additionalLegacyPolyfills: ['regenerator-runtime/runtime', 'whatwg-fetch'],
      renderLegacyChunks: true,
    }),
  ],
  css: {
    postcss: {
      // preserve:true → `color:#E3E2E6; color:var(--md-on-surface);` 순으로 출력.
      // 구형=앞의 정적값 사용(다크 기본), 최신=var() 사용(테마 전환 유지).
      plugins: [postcssCustomProperties({ preserve: true, importFrom: tokenSources })],
    },
  },
  build: {
    target: 'es2015',
    cssTarget: 'chrome61', // CSS 최소화 시 최신 문법(#RGBA 등)으로 다시 낮추지 않게
  },
  define: {
    __MK_BUILD__: JSON.stringify(buildStamp().human),
    __MK_SHA__: JSON.stringify(buildStamp().sha),
  },
  base: process.env.APP_BASE || '/thinkmap/membership/',
  envDir: '../../',
  server: { host: '0.0.0.0', port: 5178 },
})
