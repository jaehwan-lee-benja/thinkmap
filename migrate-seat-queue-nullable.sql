-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — queue_no NULL 허용 : '+주문번호만'(테이블링 비움) 여러 개 지원
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: 주문서관리 '+주문번호만' = 테이블링(queue_no) 비우고 주문번호만 먼저 기록(자리 배정 후 입력).
--   문제: UNIQUE(workspace_id,business_date,queue_no) 때문에 sentinel 값(-1 등)은 두 번째부터 충돌.
--   해결: queue_no 를 NULL 허용으로 → **NULL 은 UNIQUE 제약에서 여러 개 허용**(NULL ≠ NULL) → 몇 개든 OK.
--   트리거 조건 조정: queue_no = 0 이면 자동 순번('+새 주문'), NULL 이면 비움 유지('+주문번호만').
--     (기존 조건은 "NULL OR 0 이면 자동"이라 NULL 도 자동 부여됐다 → NULL 을 자동에서 제외.)
--
-- ★안전성:
--   - `ALTER COLUMN queue_no DROP NOT NULL` — 기존 행(전부 양수)에 무해, 새 행만 NULL 가능.
--   - DEFAULT 0 유지 → '+새 주문'(queue_no 미전송)은 0 으로 들어와 트리거가 자동 부여(동작 불변).
--   - UNIQUE 인덱스 그대로 — NULL 다중 허용은 표준 동작(변경 없음).
--   - 트리거는 CREATE OR REPLACE 로 조건만 변경(자동부여 로직 동일). search_path 고정(위생).
--   - 재실행 안전(idempotent). 롤백: 트리거 원복 + queue_no 를 다시 NOT NULL(단 NULL 행이 있으면 먼저 정리).
--
-- ★운영순서(회귀 방지): **앱 배포 먼저 → 마이그 적용** 권장(순서 무관하나 아래 이유로 앱 먼저가 안전).
--   - 마이그 전(구 트리거): '+주문번호만'(NULL) 은 자동 부여됨(비움 안 됨) — 기능 미완이나 **회귀 아님**('+새 주문'은 정상).
--   - 마이그 후: NULL 이 비움으로 유지 → '+주문번호만' 여러 개 작동.
--   - 반대로 마이그를 앱보다 먼저 적용해도 구 앱은 '+새 주문'에 queue_no 미전송(DEFAULT 0)이라 자동 부여 정상 → 회귀 없음.
--
-- 적용: supabase-guardian 검수 → 유저 최종승인 → thinkmap 통합세션 적용(tmseat 직접적용 금지).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders ALTER COLUMN queue_no DROP NOT NULL;

CREATE OR REPLACE FUNCTION seat_orders_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.workspace_id := current_workspace();
  -- queue_no = 0 → 자동 순번('+새 주문'). NULL → 비움 유지('+주문번호만', 자리 배정 후 입력).
  --   (NULL = 0 은 unknown → 자동 분기 안 탐. UNIQUE 는 NULL 다중 허용 → 주문번호만 여러 개 OK.)
  IF NEW.queue_no = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text || ':' || NEW.business_date::text, 0));
    SELECT COALESCE(MAX(queue_no), 0) + 1 INTO NEW.queue_no
    FROM seat_orders
    WHERE workspace_id = NEW.workspace_id AND business_date = NEW.business_date;
  END IF;
  RETURN NEW;
END;
$$;
