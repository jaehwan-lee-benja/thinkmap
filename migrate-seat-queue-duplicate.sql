-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — queue_no 중복 허용 : 같은 테이블링 번호를 여러 주문이 쓸 수 있게
-- ══════════════════════════════════════════════════════════════════════════
-- 목적(유저 지시 2026-08-01): '이미 쓰는 번호' 저장 실패 대신 **중복을 허용**하고,
--   같은 번호가 여러 개면 리스트에서 '1-a, 1-b'처럼 순서 구분해 표시(앱 표시 로직).
--   → UNIQUE(workspace_id, business_date, queue_no) 제약을 제거한다.
--
-- ★안전성:
--   - `DROP INDEX IF EXISTS uq_seat_orders_ws_date_queue` — UNIQUE 인덱스 1개 제거(제약 완화).
--     기존 데이터는 전부 유니크였으므로 제거해도 데이터 무손실·회귀 0.
--   - 자동채번은 그대로 유지: 트리거 `seat_orders_before_insert()`가 advisory lock 안에서
--     `MAX(queue_no)+1`을 부여하므로 '+새 주문'은 여전히 순차 유니크 번호를 받는다(경합 없음).
--     UNIQUE 인덱스 제거는 **수동 입력(테이블링 직접 타이핑)** 에서만 중복을 허용할 뿐이다.
--   - PK(id)·RLS·다른 제약/트리거 무변경. NULL(‘+주문번호만’)도 영향 없음.
--   - 재실행 안전(IF EXISTS). 롤백: 중복 행이 없을 때만 인덱스 재생성 가능
--     (`CREATE UNIQUE INDEX ...`) — 중복이 생긴 뒤엔 재생성 실패하므로 되돌리려면 데이터 정리 선행.
--
-- 적용: supabase-guardian 검수 → 유저 최종승인 → thinkmap 통합세션 적용(tmseat 직접적용 금지).
--       ★운영순서 무관: 인덱스만 제거라 앱 배포와 순서 상관없음(앱은 중복이 와도 표시만 다름).
-- ══════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS uq_seat_orders_ws_date_queue;

-- 위 UNIQUE 인덱스가 겸하던 (workspace_id, business_date) 조회 경로가 사라진다(그 외 인덱스는 PK뿐).
-- 히스토리 누적 시 매 조회가 시퀀셜 스캔이 되지 않게 비-UNIQUE 인덱스로 대체(guardian 권고).
CREATE INDEX IF NOT EXISTS idx_seat_orders_ws_date ON seat_orders (workspace_id, business_date);
