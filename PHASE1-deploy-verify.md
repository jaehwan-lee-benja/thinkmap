# Phase 1 — Edge `ensure-daily-page` 배포·검증 런북

> PLAN-daily-carryover-authority.md Phase 1 · 작성 2026-06-11
> 브랜치 `feature/edge-ensure-daily-page`. 코드/스캐폴드 완료, **배포 + 검증만 남음**.
> 프로젝트 ref: `sqisntxippjzcekyhqyo`

## ⓘ 현재 상태 (2026-06-18 갱신)

- **Edge 함수**: 배포·라이브 확정 (함수 URL POST 시 자체 검증응답 `{"error":"parentId, dateKey 필수"}` 400 — 미배포면 404).
- **라이브 플래그**: ✅ `deploy.yml` 빌드 env 에 `VITE_USE_EDGE_DAILY: 'true'` 주입 + main push(`7896562`). `.env` 미추적(22385cb) 이후 CI 가 플래그를 안 넘기던 갭을 메움 → 라이브 Edge 경로 ON.
- **남은 것(Phase 1)**: 아래 **§3 라이브 검증만**. (향후 사용자가 사용하며 진행 예정.)
- **Phase 2**: 코드 완료, 브랜치 `feat/edge-carryover-unify`. 클라 lazy 이월을 Edge 로 일원화. **라이브 반영 = Edge 함수 재배포(§1) 필요** — 재배포 전 머지하면 lazy 이월이 끊기는 회귀 주의. → §6.

## 0. 무엇이 끝났나 (코드)

- `supabase/functions/ensure-daily-page/index.ts` — 보드 권한(service_role) 서버 이월. 검증된
  `createDailyPageV2`(→ carryOverPipelineV2 등)를 **그대로 재사용**(P5). JWT 검증 → service_role 로
  생성·시드·이월. `deno check` 통과.
- `supabase/functions/_shared/cors.ts`, `supabase/config.toml`([functions.ensure-daily-page] verify_jwt=false).
- 클라: `src/utils/ensureDailyPage.js`(단일 진입점, Edge↔로컬 폴백) + 4개 호출 지점 전환
  (App.jsx, TipTapTestPage.jsx×2, quickTodoOps.js). `npm run build` 통과.
- 플래그 `VITE_USE_EDGE_DAILY`(.env, 기본 `false`). 배포·검증 후 `true` 로 전환.

## 1. 배포 (사용자 자격 필요)

service_role 시크릿은 **수동 설정 불필요** — Edge 런타임이 `SUPABASE_SERVICE_ROLE_KEY` 를 자동 주입한다.
필요한 건 **Personal Access Token** 하나뿐(https://supabase.com/dashboard/account/tokens).
`link`(db 비밀번호) 없이 `--project-ref` + 토큰으로 배포 가능:

```bash
cd /Users/benja/claude-project/thinkmap
export SUPABASE_ACCESS_TOKEN=<personal-access-token>
supabase functions deploy ensure-daily-page --project-ref sqisntxippjzcekyhqyo
```

배포 후 함수 URL: `https://sqisntxippjzcekyhqyo.functions.supabase.co/ensure-daily-page`

## 2. 플래그 ON

`.env` 에서 `VITE_USE_EDGE_DAILY=true` 로 바꾸고 dev 재기동(또는 빌드). 이제 데일리 생성이 Edge 경로로 간다.

## 3. 검증 시나리오 (실기기, partner 계정 = 핵심 회귀)

> 해결 대상 증상(2026-06-11 실측): **partner(비마스터)가 daily 생성 → 섹션은 넘어오나 그 안의 master
> 콘텐츠가 이월 안 됨.** Edge(service_role) 경로로 이게 해소돼야 한다.

1. **★ partner 로그인 → 새 데일리 생성** → 직전 페이지의 **master 섹션 콘텐츠가 이월됨**(미완료 todo/텍스트).
   - 단, partner 화면에는 여전히 **master 블록은 안 보임**(SELECT 정책 불변, visibility='master' 상속).
   - 마스터로 같은 페이지 열면 → 이월된 master 콘텐츠가 보임. ← **이게 Phase 1 성공 기준.**
2. partner 가 만든 페이지에서 partner 의 'all' 블록 편집 → 정상(Phase 0.7 #5).
3. **마스터 로그인 → 새 데일리 생성** → 전 섹션(all+master) 콘텐츠 모두 이월·정상.
4. **멱등성**: 같은 날 데일리를 새로고침/재진입 → 페이지·섹션·이월 row 중복 0(중복 방지 + uniq 인덱스).
5. **폴백**: (선택) 플래그 OFF 로 되돌리면 기존 로컬 경로로 즉시 복귀(앱 무중단).

## 4. 검증 SQL (이월 정상 여부 직접 확인)

```sql
-- 방금 partner 가 만든 페이지(:page_id)에 master 섹션 콘텐츠가 이월됐는지.
-- 0 이 아니어야 정상(이전엔 0 = 누락 버그).
SELECT count(*)
FROM daily_blocks
WHERE page_id = :page_id
  AND visibility = 'master'
  AND block_type = 'toggle'
  AND is_carry_over = true
  AND deleted_at IS NULL;

-- §4 불변식: 모든 살아있는 블록 visibility = 소속 섹션 visibility (상시 0)
SELECT count(*)
FROM daily_blocks b
JOIN daily_blocks s ON s.block_id = b.section_id AND s.page_id = b.page_id
WHERE b.page_id = :page_id
  AND b.block_type <> 'section'
  AND b.deleted_at IS NULL
  AND b.visibility <> s.visibility;
```

## 5. 롤백

- 즉시: `.env` `VITE_USE_EDGE_DAILY=false` → 로컬 경로 복귀(클라만, 무중단).
- 함수 제거: `supabase functions delete ensure-daily-page --project-ref sqisntxippjzcekyhqyo`.
- 코드: 브랜치 미머지 상태이므로 main 영향 없음.

## 6. 남은 정리 (Phase 2)

- 검증 통과 후: 클라 `carryOverEager`/`carryOverLazy` 직접 호출 경로 정리, "리프레시 카로버"를 동일
  Edge 재호출로 단순화 (PLAN §5 Phase 2).
