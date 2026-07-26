-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — seat_delivered 컬럼 추가 : "자리후 전달" 게이팅
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: 제조매니저(ManagerScreen) 화면에서 "자리후 전달" 전/후를 구분해
--       전달 전 행을 dim + 하위단계(자리순서·올림·메뉴나감) 숨김으로 게이팅.
--       (기존 seat_status DEFAULT='pending' 이 전달 전/후 동일 → 구분 필드 부재 → 신설)
--
-- 결정 근거: 지휘부 확정안 B (2026-07-25). seat_status 의미 불변, 파급 최소.
--   - "자리후 전달"(앱 commitOrder(id,'seat')) 시 seat_delivered=true.
--   - 게이팅 판정 = 제조매니저 화면에서 (!seat_delivered) 행.
--
-- ★안전성:
--   - 엄격히 additive: 신규 boolean, NOT NULL DEFAULT false. 기존 컬럼/CHECK/트리거/
--     인덱스/시퀀스 무변경 → 기존 앱 로직·쿼리 회귀 0.
--   - RLS 무변경: seat_orders_rw 는 행 단위(can_in_workspace(workspace_id,'editor')) →
--     컬럼 추가에 정책 수정 불필요(컬럼 단위 GRANT 없음, 테이블 RLS가 새 컬럼 자동 포함).
--   - Realtime 무변경: seat_orders 는 이미 REPLICA IDENTITY FULL + publication 등록 →
--     새 컬럼이 payload 에 자동 포함(추가 등록 불필요).
--   - updated_at 트리거가 UPDATE 시 자동 갱신(무변경).
--   - 재실행 안전: ADD COLUMN IF NOT EXISTS.
--
-- 적용: supabase-guardian 검수 → 유저 승인 후 → thinkmap 통합세션이 적용(tmseat 직접적용 금지).
--       ★앱 배포는 이 마이그 적용 이후여야 함(컬럼 부재 시 seat_delivered=undefined →
--        제조매니저 전 행이 dim 으로 보임). 마이그 먼저, 그 다음 seat 위성 재배포.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders
  ADD COLUMN IF NOT EXISTS seat_delivered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN seat_orders.seat_delivered IS
  '자리후 전달 여부. commitOrder(id,''seat'') 시 true. 제조매니저 화면 게이팅(전달 전 행 dim+하위버튼 숨김).';

-- ── (선택·유저 결정) 기존 주문 백필 ─────────────────────────────────────────
--   게이팅 도입 전 생성된 주문은 이미 운영 흐름에 있었으므로 "전달됨"으로 간주할 수 있음.
--   미적용 시: 기존 행은 제조매니저 화면에서 "자리후 전달"을 다시 누르기 전까지 dim 표시
--             (데이터 무손실 — 표시만 dim). 라이브 데모 6건도 여기에 해당.
--   적용 원하면 아래 주석 해제:
-- UPDATE seat_orders SET seat_delivered = true WHERE seat_delivered = false;
