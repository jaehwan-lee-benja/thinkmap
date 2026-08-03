-- migrate-fix-create-canvas-pair-exposure.sql
-- ============================================================================
-- ★미적용 (2026-08-02 신설) — 하드닝 갭 수정 ②/②.
--   `migrate-harden-function-exposure.sql` STEP1 이 `seed_*` 3종만 회수하고
--   **`create_canvas_pair` 를 빠뜨린 것**을 메운다. 함수축 노출 정리의 잔여분.
-- ============================================================================
-- ■ ★이 파일이 "통짜 회수"가 **아닌** 이유 — 실호출자가 있다
--   호출자 실측(코드+Edge 전수, 2026-08-02):
--     · `create_canvas_pair` → **`apps/canvas/src/hooks/useCanvasMutations.js`** = 로그인 사용자(authenticated).
--       ⇒ 캔버스 위성의 실사용 경로다. `authenticated` 까지 회수하면 **캔버스 페어 생성이 죽는다.**
--     · `seed_*` 3종        → 호출자 **0건** ⇒ 그쪽은 전면 회수가 맞다(하드닝 STEP1 소관, 여기서 손대지 않음).
--   ★규율: "선언된 호출자에만, 그러나 명시적으로." 판단 기준은 acl 이 아니라 **호출자 실측**이다.
--   ★반례 경계(game 실증): 3축 통짜 회수문(`from anon, authenticated, PUBLIC`)이 의도된 경로까지 닫은 사고가 있었다.
--     통과조건은 쌍이다 — ⑴금지 술어 false **∧** ⑵의도된 경로 true. ⑵ 없이 ⑴만 참이면 회수 성공이 아니라 기능 정지다.
--
-- ■ 현재 상태 실측(2026-08-02)
--   `create_canvas_pair(p_user_id uuid, p_master_id uuid, p_name text)` · SECURITY DEFINER · search_path=public(고정 ✅)
--   proacl = {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
--   ⇒ `=X/postgres`(PUBLIC) + `anon` 둘 다 열려 **로그인 없이 실행 가능**. 이게 닫을 대상.
--   ★`anon` 단독 회수는 **no-op** 이다 — PUBLIC 경유로 그대로 통과한다(축6, 실증됨). 반드시 `PUBLIC, anon` 함께.
--
-- ■ 부여 출처 주의: 위 anon/authenticated/service_role 은 전부 **defacl 상속분(ⓒ)** 이고
--   마이그 소스에 authored `GRANT` 가 없다. 상속분은 defacl 이 바뀌면 조용히 사라진다
--   ⇒ 실호출자가 있는 `authenticated` 는 이 파일에서 **authored 로 승격**해 내성을 준다.
--
-- ■ 안전: 권한 변경만. 함수 본문·시그니처 무변경 ⇒ ACL 외 거동 동일. 파괴적 연산 없음.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0. DRY-RUN (변경 없음 — 적용 전 실행해 "적용 전" 상태를 기록해 둘 것)
-- ---------------------------------------------------------------------------
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--          has_function_privilege('anon',          p.oid,'EXECUTE') AS anon_x,
--          has_function_privilege('authenticated', p.oid,'EXECUTE') AS auth_x,
--          has_function_privilege('service_role',  p.oid,'EXECUTE') AS svc_x,
--          p.proacl::text
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_canvas_pair';
--   기대(적용 전): anon_x=true · auth_x=true · svc_x=true

BEGIN;

-- ---------------------------------------------------------------------------
-- §1. 회수 — PUBLIC 과 anon. (★`from anon` 단독은 PUBLIC 경유로 no-op)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_canvas_pair(uuid, uuid, text) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- §2. 부여 — 선언된 호출자에만, 그러나 **명시적으로**(authored 승격).
--     선언된 호출자 = authenticated (`apps/canvas/src/hooks/useCanvasMutations.js`).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_canvas_pair(uuid, uuid, text) TO authenticated;

-- §3. `service_role` — ★의도적으로 손대지 않는다(침묵이 아니라 명시 판단).
--   선언된 service_role 호출자는 **0건**(Edge 전수 실측)이라 authored 승격 대상이 아니다.
--   그렇다고 회수하지도 않는다: 현재 값은 defacl 상속분이고, 이 함수만 예외적으로 끊으면
--   `public` 스키마 전반(함수 88/88 svc EXECUTE)과 어긋나 **국소적 불일치**만 만든다.
--   ⇒ `svc_x` 는 유지 기대 술어가 아니라 **탐지기**로 둔다(false 로 떨어지면 = defacl 이 바뀌었다는 신호).

COMMIT;

-- ============================================================================
-- §검증 — ★쌍으로 확인한다(⑴만 보면 캔버스가 죽은 걸 못 잡는다)
-- ----------------------------------------------------------------------------
-- ⑴ 금지 술어 재측정: anon 실행 불가.  기대 **anon_x = false**
--     (§0 쿼리 재실행. "REVOKE 를 실행했다"가 아니라 **재측정값**이 통과 기준이다.)
--
-- ⑵ 의도된 경로 재측정: **auth_x = true** 유지.  false 면 즉시 롤백 — 캔버스 페어 생성이 죽는다.
--
-- ⑶ 실행 경로 스모크(카탈로그만으론 안 닫힌다): 캔버스 위성에서 **로그인 상태로 페어 생성 1회**.
--     성공해야 한다. 생성된 테스트 페어는 확인 후 삭제.
--
-- ⑷ 익명 차단 실호출: 배포 번들의 anon 키로 이 RPC 를 호출 → **401/403** 이어야 한다.
--     ★카탈로그 통과만으로 닫혔다고 선언하지 말 것(PostgREST 노출 목록은 SQL 로 못 읽는다).
--
-- §범위 밖(섞지 말 것 — 하나가 다른 하나를 가린다)
--   · `p_master_id` 소유권 미검증(본문 결함) = `migrate-harden-function-exposure.sql` STEP2 소관, **미결정 유지**.
--     이 파일은 **권한축만** 닫는다. 본문은 `auth.uid() = p_user_id` 는 검증하나 `p_master_id` 는 검증하지 않는다.
--   · `seed_*` 3종 전면 회수 = 하드닝 STEP1 소관.
--
-- §원본 동기화(지휘부 규율) — 적용과 **같은 커밋**에서 처리할 것
--   `migrate-canvas-mapping-fix-rls.sql` 은 이 함수를 `drop function`+create 로 재생성한다
--   ⇒ 적용 후 그 파일을 재실행하면 새 OID 가 기본 ACL(PUBLIC EXECUTE)로 태어나 **이 회수가 원복된다.**
--   그 파일 상단에 순서경고 배너를 이미 넣어 뒀다(2026-08-02). 배너가 지워지지 않았는지 확인하라.
--
-- §롤백
--   REVOKE EXECUTE ON FUNCTION public.create_canvas_pair(uuid, uuid, text) FROM authenticated;
--   GRANT  EXECUTE ON FUNCTION public.create_canvas_pair(uuid, uuid, text) TO PUBLIC;
--   ★단 이 롤백은 **익명 실행을 다시 여는 것**이다. 실행 전에 "왜 로그인 없이 캔버스 페어를
--     만들 수 있어야 하는가"를 답하라. 답이 없으면 롤백 대상은 이 파일이 아니라 그 판단이다.
-- ============================================================================
