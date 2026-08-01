-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — 플로우 소요시간 측정용 타임스탬프 2종 추가 (통계 기능)
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: '오늘자 통계'에서 기본 플로우 각 구간의 소요시간을 재기 위함.
--         테이블링(created_at) → 주문(order_no_at) → 자리후전달(delivered_at) → 올림(raised_at)
--       현재 created_at·raised_at·(station)completed_at 만 있어 가운데 두 구간을 못 잰다.
--
-- 추가 컬럼(둘 다 nullable timestamptz, DEFAULT 없음):
--   order_no_at  — 주문번호를 처음 입력한 시각(빈 값 → 값으로 바뀔 때 1회 기록, 이후 수정해도 유지)
--   delivered_at — 자리후 전달(seat_delivered=true) 시각. 전달 해제 시 NULL 로 되돌림.
--
-- 앱 로직:
--   OrderRow: order_no 가 처음 채워질 때 order_no_at 동봉.
--   useSeatOrders.commitOrder('seat'): seat_delivered=true 와 함께 delivered_at=now 동봉.
--                                      전달 해제(seat_delivered=false) 시 delivered_at=null.
--   통계 화면: 구간별 median/평균 산출. 값 없는 주문은 그 구간 집계에서 제외(부분 데이터 허용).
--
-- ★안전성:
--   - 엄격히 additive: 신규 nullable timestamptz 2개. 기존 컬럼/CHECK/트리거/인덱스/시퀀스 무변경
--     → 기존 앱 로직·쿼리 회귀 0.
--   - RLS 무변경: seat_orders_rw 는 행 단위(can_in_workspace(workspace_id,'editor')) →
--     컬럼 추가에 정책 수정 불필요(컬럼 단위 GRANT 없음).
--   - Realtime 무변경: REPLICA IDENTITY FULL + publication 등록 → 새 컬럼 payload 자동 포함.
--   - updated_at 트리거 무변경.
--   - 재실행 안전: ADD COLUMN IF NOT EXISTS.
--   - 과거 데이터: NULL(측정 이전) — 통계에서 해당 구간만 제외되고 다른 지표는 정상. 백필 불가·불필요.
--
-- 적용: supabase-guardian 검수 → 유저 승인 후 → thinkmap 통합세션이 적용(tmseat 직접적용 금지).
--       ★앱 배포는 이 마이그 적용 이후여야 함(컬럼 부재 시 UPDATE 가 PGRST 컬럼오류 → 저장실패 토스트).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders
  ADD COLUMN IF NOT EXISTS order_no_at  timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN seat_orders.order_no_at IS
  '주문번호를 처음 입력한 시각(통계: 테이블링→주문 구간). 이후 번호를 고쳐도 최초 시각 유지.';
COMMENT ON COLUMN seat_orders.delivered_at IS
  '자리후 전달(seat_delivered=true) 시각(통계: 주문→전달, 전달→올림 구간). 전달 해제 시 NULL.';
