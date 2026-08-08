// dist-storage/index.html → Edge Function `kiosk` 생성(2026-08-08 긴급).
//
// ★왜 Edge Function 인가: Supabase **Storage 는 HTML 을 렌더하지 않는다.** 객체 메타가
//   `text/html` 이어도 공개 URL 이 `text/plain` + `nosniff` 로 응답한다(피싱 방지책, tm 실측).
//   그래서 태블릿에 **코드 원문**이 떴다. JS·CSS·폰트는 정상 타입으로 나오므로
//   ⇒ **HTML 만** Edge Function 이 `text/html` 로 내보내고, 자산은 Storage 그대로 쓴다.
//
// ★자산 경로를 «재작성»하지 않는다 — 애초에 **절대경로로 빌드**한다:
//   `APP_BASE=<storage 공개 base>` 로 빌드하면 index.html·CSS·`import.meta.env.BASE_URL`(img/*)
//   ·manifest·icon 이 **전부 절대경로**로 나온다. 문자열 치환은 놓치는 곳이 생긴다(BASE_URL 은
//   런타임 JS 안에 있어 HTML 치환으로는 못 잡는다) — 빌드 파라미터가 유일하게 빠짐없는 방법이다.
//
// 사용:
//   cd apps/membership && APP_BASE=<storage base> npx vite build --outDir dist-storage
//   node scripts/gen-kiosk-edge.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'apps/membership/dist-storage/index.html')
const OUT = resolve(ROOT, 'supabase/functions/kiosk/index.ts')

const html = readFileSync(SRC, 'utf8')

// 빌드 파라미터를 빠뜨렸는지 여기서 잡는다 — 상대경로가 남아 있으면 함수 URL 기준으로 풀려 전부 404 다.
const bad = []
if (/src="\.\/|href="\.\//.test(html)) bad.push('상대경로(./) 참조가 남아 있다')
if (/href="manifest\.json"|href="icons\//.test(html)) bad.push('manifest/icon 이 상대경로다')
if (!/https:\/\/[^"]+\/storage\/v1\/object\/public\/[^"]+\/assets\//.test(html)) bad.push('자산이 storage 절대경로가 아니다')
if (bad.length) {
  console.error('✗ dist-storage/index.html 이 Edge 서빙에 맞지 않습니다:\n  - ' + bad.join('\n  - '))
  console.error('  → APP_BASE=<storage 공개 base> 로 다시 빌드하세요.')
  process.exit(1)
}

// ★HTML 은 JSON 문자열로 내장한다 — 템플릿 리터럴에 넣으면 백틱·`${` 가 터진다.
const fn = `// 자동 생성 파일 — 직접 고치지 마라. 원본은 apps/membership/index.html 이고
// \`node scripts/gen-kiosk-edge.mjs\` 가 dist-storage/index.html 을 여기에 박아 넣는다.
//
// 역할: **HTML 한 장만** \`text/html\` 로 내보낸다(Storage 가 HTML 렌더를 막기 때문 — 생성기 주석 참조).
//   자산(JS·CSS·폰트·img·manifest)은 Storage 공개 URL 을 그대로 가리킨다.
//
// ★인증 없음(\`verify_jwt = false\`) — 키오스크·손님 폰이 무인증으로 열어야 한다.
//   여는 것은 **정적 HTML 한 장**이고, 데이터 접근은 여전히 프록시 Edge + 매장 세션 게이트를 지난다.
//
// 생성 시각은 넣지 않는다(같은 입력이면 같은 출력이라야 변경 여부를 해시로 가를 수 있다).
const HTML = ${JSON.stringify(html)}

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // 진입점은 매번 재검증한다 — 안 그러면 재배포해도 옛 화면이 남는다(자산은 해시라 영구 캐시).
  'cache-control': 'no-cache',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...HEADERS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' } })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  // 경로·쿼리를 보지 않는다: \`?role=staff\`·\`#…\` 는 **브라우저가 클라이언트에 그대로 넘긴다**
  // (쿼리는 location.search, 해시는 서버로 오지도 않는다). 함수는 항상 같은 HTML 한 장이다.
  return new Response(req.method === 'HEAD' ? null : HTML, { status: 200, headers: HEADERS })
})
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, fn)
console.log('✔ 생성:', OUT.replace(ROOT + '/', ''))
console.log('  HTML', html.length, 'bytes · 함수', fn.length, 'bytes')
const m = html.match(/https:\/\/[^"]+\/storage\/v1\/object\/public\/([^/]+)\//)
console.log('  자산 버킷:', m ? m[1] : '(불명)')
