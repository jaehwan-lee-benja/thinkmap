-- ⛔ SUPERSEDED 2026-07-27 — 집행 금지·미적용. 유저 확정 옵션C(사르르 CRM을 thinkmap DB로
--    완전 통합)로 대체됨. FDW/크로스프로젝트 통로 폐기. 정본 = crm-archive/INTEGRATION-MIGRATION-PLAN.md.
--    ★이 파일을 절대 적용하지 마라(postgres_fdw·크로스프로젝트 유저매핑 = 완전복사와 이중 아키텍처 위험).
-- ============================================================================
-- CRM 원데이터 "통로(FDW)" — crm 원본을 tm이 자기것처럼 쿼리 + 재계산 뷰 (초안, ⛔SUPERSEDED)
--
-- 결정 확정(유저/지휘부 2026-07-24): A3(라인아이템 풀 그레인) + B2(식별 원본을 통로가 탭)
--   + C1 통로(postgres_fdw). ★이전 복제 초안(crm_engine_raw/customer substrate) 폐기.
--   crm 이 데이터를 tm에 복제하지 않고, tm DB(sqisntxippjzcekyhqyo)가 FDW로 multi-store
--   (rstazttwlghsorpzsugy)의 crm 스키마를 **외부 테이블로 연결**해 원본을 직접 재계산한다.
--
-- ★보안 최고수위 (PII 노출 0):
--   1. 통로가 닿는 원본은 식별 데이터(B2)지만, PII(phone/name/email/canonical_id 원문)는
--      tm에 **저장도 노출도 안 한다**. 외부 테이블은 격리 스키마(crm_fdw)에 두고 anon/authenticated
--      에 전 권한 REVOKE + pgrst.db_schemas 에서 제외(REST 미노출).
--   2. 앱이 읽는 것은 **public 의 마스터전용 재계산 뷰**뿐 — PII 컬럼을 투사 제거(집계/가명 surrogate만).
--      surrogate 필요 시 뷰 안에서 HMAC(비공유 salt)로 즉시 가명화, 원문 식별자 미노출.
--   3. is_master() 게이트 + security_barrier. 재무·경영·식별 데이터라 마스터 외 0행.
--   4. FDW 접속 계정은 crm측 **읽기전용 최소권한 role**(crm 이 provision). 자격증명=USER MAPPING
--      비밀(코드/mailbox 미기재, 적용 시 주입).
--
-- ★트레이드오프(보고됨): 통로=crm DB 실시간 결합 → "crm 없이 독립" 목표와 상충. A3 라인
--   실시간 쿼리는 무거움 → 필요 시 §5 materialized 캐시(마스터 새로고침 시 REFRESH).
--
-- ★게이트: postgres_fdw 확장·크로스프로젝트 접속·PII 통로 = to-conductor heads-up + guardian +
--   유저 승인 + seat 적용. 이 파일은 초안 — 미적용. crm 계약(role/host/테이블·컬럼) 확정 후 값 채움.
-- ============================================================================

BEGIN;

-- ── 1) 확장 (privileged — conductor heads-up) ────────────────────────────────
--   Supabase: postgres_fdw 또는 wrappers. 크로스프로젝트 접속 가능성 사전 검증 필요(host/포트/SSL/IP).
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- ── 2) 외부 서버 → multi-store(crm 원본) ─────────────────────────────────────
--   host/dbname 은 crm 계약으로 확정(direct 5432 or pooler). SSL require.
CREATE SERVER IF NOT EXISTS crm_src
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '<MULTISTORE_HOST>', dbname 'postgres', port '5432', sslmode 'require',
           fetch_size '10000', use_remote_estimate 'true');

-- ── 3) 유저 매핑 — crm측 읽기전용 최소권한 계정(비밀, 적용 시 주입) ────────────
--   ★암호는 이 파일/mailbox에 절대 안 넣는다. crm 이 provision 한 role(예: crm_readonly)만.
--   적용자(seat)가 안전 경로로 password 주입. service_role(적재/뷰 소유)에 매핑.
CREATE USER MAPPING IF NOT EXISTS FOR postgres
  SERVER crm_src
  OPTIONS (user '<CRM_READONLY_ROLE>', password '<INJECTED_AT_APPLY>');

-- ── 4) 격리 스키마 + 외부 테이블 임포트 (REST 미노출) ─────────────────────────
CREATE SCHEMA IF NOT EXISTS crm_fdw;
-- 앱 role 은 이 스키마에 접근 불가(원본 PII 격리).
REVOKE ALL ON SCHEMA crm_fdw FROM PUBLIC, anon, authenticated;
-- crm 계약으로 확정된 테이블만 LIMIT TO (라인=transactions, 고객=customers, 소스=customer_sources).
IMPORT FOREIGN SCHEMA crm
  LIMIT TO (transactions, customers, customer_sources)
  FROM SERVER crm_src INTO crm_fdw;
REVOKE ALL ON ALL TABLES IN SCHEMA crm_fdw FROM PUBLIC, anon, authenticated;
-- ※ crm_fdw 스키마는 pgrst.db_schemas 에 추가하지 않는다(REST 노출 금지). 별도 확인 항목.

-- ── 5) 재계산 뷰 — public, 마스터전용, PII 투사 제거(자유 수식 계층) ──────────
--   앱은 이 뷰만 본다. 원문 식별자(phone/name/canonical_id) 미선택. surrogate 필요 시 HMAC.
--   security_barrier=on + is_master() 게이트로 마스터 외 0행. security_definer 로 crm_fdw 접근.

-- 5a. 고객 차수 substrate (가명 surrogate만 노출) — A3 원본에서 라이브 재계산
CREATE OR REPLACE VIEW public.v_crm_customer_facts
  WITH (security_barrier = true) AS
SELECT
  encode(hmac(t.canonical_id::text, current_setting('app.crm_salt', true), 'sha256'), 'hex') AS cust_key,
  (c.membership_registered_at IS NOT NULL)                    AS is_member,
  date_trunc('month', c.membership_registered_at)::date       AS member_since,
  min(t.sold_at::date) FILTER (WHERE t.ch = 1)                AS first_dt,
  min(t.sold_at::date) FILTER (WHERE t.ch = 2)                AS second_dt,
  min(t.sold_at::date) FILTER (WHERE t.ch = 3)                AS third_dt
FROM (
  SELECT canonical_id, sold_at,
         row_number() OVER (PARTITION BY canonical_id ORDER BY sold_at::date) AS ch
  FROM crm_fdw.transactions
  WHERE source = 'union_pos' AND canonical_id IS NOT NULL
) t
JOIN crm_fdw.customers c ON c.id = t.canonical_id
WHERE is_master()                                    -- ★마스터 외 0행
GROUP BY t.canonical_id, c.membership_registered_at;

COMMENT ON VIEW public.v_crm_customer_facts IS
  'crm 원본(FDW) 라이브 고객 차수 재계산. PII 투사 제거(cust_key=HMAC). 마스터 전용.';

-- 5b. 고객×거래일 substrate — 월매출/활성/객단가 재계산
CREATE OR REPLACE VIEW public.v_crm_customer_day
  WITH (security_barrier = true) AS
SELECT
  encode(hmac(canonical_id::text, current_setting('app.crm_salt', true), 'sha256'), 'hex') AS cust_key,
  sold_at::date                                                   AS d,
  source,
  round(sum(amount) FILTER (WHERE sale_type LIKE '판매%'))::bigint AS day_amount,
  count(DISTINCT (pos_no || '|' || receipt_no))                   AS receipts
FROM crm_fdw.transactions
WHERE source = 'union_pos' AND canonical_id IS NOT NULL AND is_master()
GROUP BY canonical_id, sold_at::date, source;

COMMENT ON VIEW public.v_crm_customer_day IS
  'crm 원본(FDW) 라이브 고객×거래일 재계산. PII 없음. 마스터 전용.';

-- 5c. 월별 퍼널 재계산 (임계값·기간 자유 재정의 지점) — 위 두 뷰 위에서
CREATE OR REPLACE VIEW public.v_crm_funnel_recompute
  WITH (security_barrier = true) AS
WITH months AS (
  SELECT to_char(mm, 'YYYY-MM') AS ym,
         date_trunc('month', mm)::date AS m_start,
         (date_trunc('month', mm) + interval '1 month')::date AS m_end
  FROM generate_series(
         (SELECT date_trunc('month', min(first_dt)) FROM public.v_crm_customer_facts),
         date_trunc('month', now()), interval '1 month') mm
)
SELECT mo.ym,
  count(*) FILTER (WHERE cf.first_dt  >= mo.m_start AND cf.first_dt  < mo.m_end) AS exp,
  count(*) FILTER (WHERE cf.second_dt >= mo.m_start AND cf.second_dt < mo.m_end) AS conv,
  count(*) FILTER (WHERE cf.second_dt <  mo.m_start)                             AS cum,
  count(*) FILTER (WHERE cf.second_dt <  mo.m_start
                    AND EXISTS (SELECT 1 FROM public.v_crm_customer_day cd
                                 WHERE cd.cust_key = cf.cust_key
                                   AND cd.d >= mo.m_start AND cd.d < mo.m_end))   AS act
FROM months mo CROSS JOIN public.v_crm_customer_facts cf
GROUP BY mo.ym ORDER BY mo.ym;

COMMENT ON VIEW public.v_crm_funnel_recompute IS
  'FDW 원본 라이브 월별 퍼널 재계산. 임계값/기간 재정의는 이 뷰 수정. 마스터 전용.';

-- ── 6) (성능 옵션) A3 라이브가 무거우면 materialized 캐시 — 마스터 새로고침 시 REFRESH ──
--   CREATE MATERIALIZED VIEW public.mv_crm_customer_day AS SELECT * FROM public.v_crm_customer_day;
--   (RLS/마스터 게이트는 조회 래퍼 뷰에서. REFRESH 는 sync Edge/함수가 service_role 로.)

COMMIT;
