#!/usr/bin/env node
// 빌드 산출물에 Supabase 자격이 «실제로 구워졌는지» 검사한다. 없으면 **빌드를 죽인다**.
//
// 왜 필요한가 (2026-08-08 실증 — 프로덕션 2개가 동시에 죽었다):
//   `.env` 는 gitignore 라 순정 체크아웃(worktree·CI)엔 존재하지 않는다.
//   그러면 vite 는 `import.meta.env.VITE_SUPABASE_URL` 을 **undefined 로 인라인하고 정상 종료(exit 0)** 한다.
//   결함은 런타임에서야 터진다 — `createClient(undefined)` → "supabaseUrl is required" → 앱이 통째로 백지.
//   즉 **빌드 성공은 배포 가능의 증거가 아니었다.** 그 간극을 여기서 닫는다.
//
// 왜 «세션 규율»이 아니라 여기인가:
//   사고 후 나는 `grep eyJ` 를 손으로 도는 규율을 세웠다. 그건 **한 겹이고, 그 겹이 «내가 기억함»** 이다.
//   기억은 급할 때 빠진다(그날도 급했다). 규율을 트리로 내려 **빌드 자신이 자기를 잡게** 한다.
//
// 성질:
//   · 값을 절대 출력하지 않는다(길이·존재 여부만).
//   · 실패 = exit 1. 경고 로그로 끝나면 그건 게이트가 아니라 장식이다.
//   · 결함 주입으로 검증한다: env 를 비우고 빌드하면 반드시 red 여야 한다(SEAT/도메인 SPEC 체크리스트).
//
// 사용: node scripts/check-env-baked.mjs <distDir>   (각 앱 package.json 의 postbuild)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] || 'dist'
const app = process.cwd().split('/').slice(-1)[0]

/** dist 하위 .js 를 전부 모은다(assets/ 고정이 아니라 실제로 훑는다 — 경로 가정이 곧 사각이다). */
function jsFiles(dir) {
  let out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out = out.concat(jsFiles(p))
    else if (e.endsWith('.js')) out.push(p)
  }
  return out
}

let files
try {
  files = jsFiles(dist)
} catch {
  console.error(`✗ [env-gate:${app}] ${dist} 를 읽을 수 없습니다`)
  process.exit(1)
}

// ★전건 검사 — 파일이 0개면 「위반 0」이 아니라 «검사가 안 돈 것»이다.
//   이걸 빼면 빈 dist 에서 초록불이 뜬다(교본: 전건 통과와 전건 오탐은 겉보기가 같다).
if (files.length === 0) {
  console.error(`✗ [env-gate:${app}] ${dist} 에 .js 가 0개 — 검사가 성립하지 않습니다`)
  process.exit(1)
}

const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n')

// URL 은 프로젝트 ref 를 고정하지 않는다(프로젝트가 갈릴 수 있다) — 형태로 본다.
const urlHits = blob.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/g) || []
// anon 키는 JWT 라 `eyJ` 로 시작한다. 값은 보지 않고 «있는지»만 센다.
const keyHits = blob.match(/eyJ[A-Za-z0-9_-]{10,}/g) || []

const ok = urlHits.length > 0 && keyHits.length > 0
console.log(
  `[env-gate:${app}] js ${files.length}개 · supabase URL ${urlHits.length} · 키 ${keyHits.length} → ${ok ? 'PASS' : 'FAIL'}`
)

if (!ok) {
  console.error(
    `✗ [env-gate:${app}] 번들에 Supabase 자격이 없습니다 — 이대로 배포하면 런타임에 "supabaseUrl is required" 로 앱이 죽습니다.\n` +
      `  원인 1순위: 이 체크아웃에 .env 가 없습니다(gitignore). 레포 루트의 .env 를 빌드 트리에 복사한 뒤 다시 빌드하세요.\n` +
      `  확인: 레포 루트 .env 에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 가 있는지(값은 출력하지 않습니다).`
  )
  process.exit(1)
}
