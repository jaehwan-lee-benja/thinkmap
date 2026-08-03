-- migrate-pin-secdef-search-path.sql
-- ============================================================================
-- ★미적용 (2026-08-02 신설) — `migrate-harden-function-exposure.sql` **STEP4의 실행판**.
--   그 파일에서 STEP4 는 주석 DRAFT 였다(실행 SQL 없음). 지휘부 우선순위 상향 승인(2026-08-02)에
--   따라 **별도 실행 파일로 분리**한다. 원 파일 STEP4 는 이 파일을 가리키도록 정리한다.
-- ============================================================================
-- ■ 대상 = `search_path` **미설정** SECURITY DEFINER 함수 **7종**(2026-08-02 전수 실측, public 스키마).
--   이 7종이 현재 우리 DB에서 **가장 날카로운 잔여 면**이다. 근거:
--   · secdef + search_path 미설정 = **호출자의 search_path 를 그대로 상속**한다.
--     ⇒ 공격자가 자기 세션 search_path 를 조작하거나 `pg_temp` 에 동명 객체를 심으면
--        **정의자(=소유자) 권한으로 실행되는 본문의 이름 해석을 가로챌 수 있다.**
--   · 이건 `public` 스키마 CREATE 권한이 닫혀 있어도(현재 닫힘) **우회 가능한 더 넓은 면**이다
--     — `public` 에 못 심어도 **호출자가 지정한 다른 스키마·임시 스키마**로 가려진다.
--   · ★그리고 이 7종 안에 **`is_master()`** 가 있다 = 우리 권한 모델의 최상위 판정자.
--
-- ■ crm 크로스도메인 통지(2026-08-02)로 시작된 전수 실측의 산물이다. 그쪽이 알려준 축은
--   "`public.nspacl` CREATE" 였는데, 내 쪽을 되뜨니 **버킷 A(미설정) 7종**이 더 넓은 면으로 나왔다.
--   (HANDOFF §E-4-DEP 의존자 전수표 참조 — 의존자 25종 중 19종이 thinkmap 소유.)
--
-- ■ 처방 = `ALTER FUNCTION … SET search_path = public, pg_temp`
--   · **본문 무수정**(= 회귀 위험 최소). 7종 전부 본문이 `public` 객체를 비수식 참조하고
--     `auth.*` 는 이미 스키마 수식이라(2026-08-02 `prosrc` 전수 확인) `public` 고정으로 그대로 동작한다.
--   · ★**`pg_temp` 를 명시적으로 맨 뒤에 둔다.** PostgreSQL 은 `pg_temp` 가 search_path 에
--     명시되지 않으면 **다른 스키마보다 먼저** 임시 스키마에서 릴레이션을 찾는다
--     ⇒ 명시하지 않으면 `search_path=public` 만으로는 **임시테이블 섀도잉이 안 막힌다.**
--     (함수·연산자 이름엔 pg_temp 가 안 쓰이지만, 이 7종은 전부 **테이블**을 참조한다.)
--   · 잔여: 이 조치는 버킷 A → **버킷 B**(`public` 포함)로의 이동이다. 완전한 C 등급
--     (`search_path=''` + 본문 전면 스키마 수식)은 **본문 재작성이 필요해 별건**으로 둔다.
--     ★즉 이 파일은 "다 고쳤다"가 아니라 **"가장 넓은 면을 닫고 남은 면을 좁혔다"** 이다(no silent caps).
--
-- ■ 안전: 권한·정책·본문 무변경. `ALTER FUNCTION … SET` 은 메타데이터만 바꾼다. 롤백 1줄/함수.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0. DRY-RUN (변경 없음 — 적용 전 실행. 기대: 7행, cfg 전부 '(미설정)')
-- ---------------------------------------------------------------------------
--   SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
--          p.prosecdef,
--          COALESCE(array_to_string(p.proconfig, ','), '(미설정)') AS cfg
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL
--    ORDER BY 1;
--   ★7행이 아니면 **멈추고 명단을 대조하라** — 그 사이 새 secdef 함수가 생겼다는 뜻이고,
--     그건 이 파일의 대상 목록이 이미 낡았다는 신호다(스냅숏 안티패턴 회피).

BEGIN;

ALTER FUNCTION public.is_master()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_id_by_email(email_input text)        SET search_path = public, pg_temp;
ALTER FUNCTION public.get_linked_accounts()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.is_linked_account(owner_user_id uuid)         SET search_path = public, pg_temp;
ALTER FUNCTION public.is_linked_account_viewer(owner_user_id uuid)  SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_deleted_pages()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.set_shared_with_user_id()                     SET search_path = public, pg_temp;

COMMIT;

-- ============================================================================
-- §검증 — ★쌍으로(⑴금지 술어 false ∧ ⑵의도된 경로 true)
-- ----------------------------------------------------------------------------
-- ⑴ 금지 술어 재측정: `public` 의 secdef 중 **search_path 미설정 = 0건**.
--     SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL;   -- 기대 0
--    ★"ALTER 를 실행했다"가 아니라 **이 재측정값**이 통과 기준이다.
--
-- ⑵ 의도된 경로 재측정 — ★이게 없으면 회수 성공이 아니라 기능 정지다:
--    ⓐ `is_master()` 가 여전히 참을 반환하는가 — **마스터 세션으로 실제 로그인**해
--       마스터 전용 화면(관리 모달·급여·CRM보드) 진입 1회. 카탈로그만 보고 넘기지 말 것.
--    ⓑ 연결계정(임퍼소네이션) 동작: `is_linked_account_viewer` 경로 = 타계정 비교뷰 1회 열기.
--    ⓒ 공유 트리거: `set_shared_with_user_id` 는 shares INSERT 시 발화 → 공유 1건 생성 후
--       `shared_with_user_id` 가 채워지는지 확인하고 원복.
--    ⓓ `purge_deleted_pages` 는 pg_cron(소유자) 경로 — 다음 스케줄 실행 로그로 확인(직접 호출 금지, 파괴적 DML).
--
-- ⑶ 회귀 없음 확인: 적용 후 앱 스모크(로그인·데일리·자리후·급여) — 이 7종은 RLS 정책이
--    광범위하게 호출하므로, 이름 해석이 깨지면 **조용한 403 이 아니라 광범위한 오류**로 나타난다.
--
-- §순서 — 독립. 다른 마이그와 순서 의존 없음(권한 축·정책 축 무관, 메타데이터만).
--   단 `migrate-revoke-anon-exposure.sql` 과 같은 세션에 돌린다면 그쪽을 먼저(권한 축 정리 후 경로 고정).
--
-- §원본 동기화(지휘부 규율, 적용과 같은 커밋에서) — ⒝분기(authored grant 행 없음 → 재생성 지점 배너)
--   이 7종을 `create or replace` 하는 원본 파일들은 **`SET search_path` 절이 없다**
--   ⇒ 그 파일을 재실행하면 **이 고정이 통째로 날아간다**(ALTER 로 붙인 설정은 REPLACE 시 유지되지만,
--     원본이 `SET` 절 없이 정의를 덮으면 그 값이 사라진다 — 적용 후 반드시 재측정 ⑴로 확인).
--   대상 원본 = **5파일**(★2026-08-02 정정: 종전 "6파일"은 틀렸다 — 아래 참조). 함수별 정의처 전수:
--     · `create-linked-accounts.sql`  → get_linked_accounts · is_linked_account · is_linked_account_viewer
--     · `fix-linked-account-rls.sql`  → 위 3종 재정의
--     · `create-shares-table.sql`     → get_user_id_by_email · set_shared_with_user_id
--     · `migrate-dynamic-master.sql`  → is_master
--     · `setup-soft-delete-cleanup.sql` → purge_deleted_pages
--     ※`migrate-rls-harden-unconditional-select.sql` 도 is_master 를 재정의하나 **`SET search_path` 절을 이미 갖고 있어** 배너 대상 아님.
--   ★**정정 기록**: 종전 문안은 `master-bypass-rls.sql` 을 is_master 정의처로 올렸으나 **그 파일은 함수를 하나도 정의하지 않는다**
--     (정책 전용, `create … function` 0건 실측). ⇒ 파일 수 6→**5**, 역주행 6건과의 겹침도 2→**1**(`create-shares-table.sql` 뿐).
--     기전 = 나열을 세지 않고 합계를 적었다. crm R11⒅ 규율 적용으로 자체 발견: ***나열과 합계가 어긋나면 합계가 아니라 나열을 믿고 다시 센다.***
--
-- §롤백 — 함수별 1줄. (되돌리면 호출자 경로 상속으로 **되돌아간다** — 왜 그래야 하는지 먼저 답하라.)
--   ALTER FUNCTION public.is_master() RESET search_path;   -- 이하 동일 패턴 6줄
-- ============================================================================
