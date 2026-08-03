-- migrate-urgent-revoke-purge-deleted-pages.sql
-- ============================================================================
-- 🔴 긴급 · ★미적용 (2026-08-03 신설) — 승인 대기
--   `migrate-revoke-anon-exposure.sql`(1순위 묶음, 아직 미승인)의 **한 줄만 떼어낸 것**.
--   묶음 전체 승인을 기다리는 동안 **이 한 건은 라이브 파괴 위험**이라 별건으로 올린다.
-- ============================================================================
-- ■ 왜 긴급인가 — 2026-08-03 REST 프로브로 **노출 기전이 실증**됐다.
--   판별기: 무해한 0인자 secdef 함수 `is_master()` 를 **익명(anon 키)** 으로 정확한 시그니처 호출
--     → **HTTP 200 · false 반환 = 실행됨.**
--   ⇒ ***익명 사용자가 `public` 스키마 SECURITY DEFINER 함수를 PostgREST RPC 로 호출할 수 있다.***
--
-- ■ ★두 기전이 어긋났다(사각의 위치를 지목)
--   · OpenAPI 스펙(`GET /rest/v1/`) = `rpc` 노출 **0개**  ← 안전해 보이는 값
--   · 실호출                        = **200**            ← 지상 진실
--   ⇒ **OpenAPI 목록은 노출 판정 술어로 쓸 수 없다.** 카탈로그·스펙만으로 "안 열렸다"고 선언 금지.
--
-- ■ 대상 함수의 성질(2026-08-03 실측)
--   `purge_deleted_pages()` · SECURITY DEFINER · anon/authenticated/service_role EXECUTE **전부 true**
--   · 본문 = `DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`
--   · ★**호출자 신원 검증이 전혀 없다**(`is_master()` 등 게이트 부재) ⇒ 정의자 권한으로 RLS 우회
--   · 실호출자 = **pg_cron(소유자 경유)** 뿐. 코드·Edge 참조 **0건**(전수 실측).
--
-- ■ ★직접 테스트하지 않았다(정직 표기)
--   `purge_deleted_pages()` 를 정확한 시그니처로 호출하면 **실제로 지운다.** 그래서 안 했다.
--   ⇒ 판정 = **「기전 실증 + 동일 조건 추론」**이지 「그 함수를 직접 확인」이 아니다.
--     (동일 조건 = 같은 스키마 · 같은 anon EXECUTE=true · 같은 PostgREST 표면)
--   ⇒ 회수 후에는 이 구분이 사라진다 — anon EXECUTE=false 는 직접 측정 가능하다.
--
-- ■ 안전: 권한 회수만. 본문·시그니처 무변경. 파괴적 연산 없음.
--   ★`authenticated` 도 함께 회수한다 — 코드 참조 0건이고 **파괴적 DML** 이라 로그인 사용자에게도 열어둘 이유가 없다.
--   ★`service_role` 은 건드리지 않는다(Edge 가 장래 호출할 여지 · 키가 서버 전용).
--   ★pg_cron 은 **소유자(postgres) 경유**라 이 회수의 영향을 받지 않는다 — 정기 청소는 계속 돈다.
-- ============================================================================

-- §0. DRY-RUN (변경 없음 — 적용 전 스냅숏)
--   SELECT has_function_privilege('anon',          'public.purge_deleted_pages()','EXECUTE') AS anon_x,
--          has_function_privilege('authenticated', 'public.purge_deleted_pages()','EXECUTE') AS auth_x,
--          has_function_privilege('service_role',  'public.purge_deleted_pages()','EXECUTE') AS svc_x;
--   기대(적용 전): anon_x=true · auth_x=true · svc_x=true

BEGIN;

-- ★`from anon` 단독은 PUBLIC 경유로 no-op(축6) ⇒ PUBLIC 을 반드시 함께.
REVOKE EXECUTE ON FUNCTION public.purge_deleted_pages() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================================
-- §검증 — 통과조건은 쌍이다
-- ⑴ 금지 술어 재측정: anon_x = **false** ∧ auth_x = **false**
-- ⑵ 의도된 경로 재측정: svc_x = **true 유지** ∧ **pg_cron 정기 실행이 계속 성공**
--    (다음 스케줄 실행 로그 확인. 소유자 경유라 영향 없어야 정상 — 실패하면 즉시 롤백)
-- ⑶ ★익명 실호출 재측정(이제는 «직접» 측정 가능해진다):
--    익명 키로 `POST /rest/v1/rpc/purge_deleted_pages` (인자 없음) → **401/403 이어야 한다.**
--    ★단 이 확인은 **회수가 실제로 걸린 뒤에만** 해라 — 걸리기 전엔 그 호출이 데이터를 지운다.
--      (회수 전 확인 = 확인이 곧 사고. 이 순서가 이 파일에서 제일 중요한 줄이다.)
--
-- §원본 동기화 — `setup-soft-delete-cleanup.sql` 이 이 함수를 정의한다.
--   그 파일엔 authored `GRANT` 행이 **없다**(defacl 상속분 ⓒ) ⇒ 주석화할 줄이 없다
--   ⇒ ⒝분기 적용: **재생성 지점에 배너**. 그 파일을 재실행하면 이 회수가 원복된다.
--
-- §롤백
--   GRANT EXECUTE ON FUNCTION public.purge_deleted_pages() TO authenticated;
--   ★익명(PUBLIC/anon)은 롤백 대상이 아니다 — 되돌리려면
--     "왜 로그인 없는 인터넷 사용자가 남의 페이지를 영구 삭제할 수 있어야 하는가"를 먼저 답하라.
--     답이 없으면 롤백 대상은 이 파일이 아니라 그 판단이다.
-- ============================================================================
