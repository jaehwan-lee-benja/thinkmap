-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — order_origin 컬럼 추가 : 주문 시작 갈래(게이팅 도메인 모델)
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: "실내 시작 vs 포장/야외 시작"을 구분(현 스키마엔 없음). 게이팅 도메인 모델 확정본:
--   - 실내 시작(dine_in): 자리후 구간 진입 → "자리후 전달"(seat_delivered) 관문 → 이후 제조옵션/자리순서/올림 활성.
--   - 포장/야외 시작(takeout/outdoor): 자리후 구간 우회 → 전달 버튼 미표시, 즉시 진행.
--   ※ opt_outdoor/opt_takeout/opt_outdoor_parallel(제조옵션)은 '실내 주문의 전달 후 변경기록'이라
--     origin(시작 갈래)을 인코딩 못 함 → 별도 컬럼 필요(2026-07-26 유저 확정, 옵션 A).
--
-- 게이팅(앱): undelivered = (order_origin='dine_in') && !seat_delivered.
--   dine_in 아닌 주문은 전달 관문/버튼 없음. (Guide·Manager 공통)
--
-- ★안전성:
--   - 엄격 additive: 신규 text, NOT NULL DEFAULT 'dine_in' + CHECK. 기존 컬럼/트리거/인덱스 무변 → 회귀 0.
--     (기존 행은 'dine_in'으로 채워짐 = 실내 경로. seat_delivered 미백필과 정합 — 재전달 전까지 게이팅.)
--   - RLS 무변경: seat_orders_rw 는 행 단위(can_in_workspace editor) → 새 컬럼 자동 포함, 정책 수정 불요.
--   - Realtime 무변경: REPLICA IDENTITY FULL + publication 등록됨 → 새 컬럼 payload 자동 포함.
--   - updated_at 트리거 자동 동작. 재실행 안전: ADD COLUMN IF NOT EXISTS.
--
-- 적용: supabase-guardian 검수 → 유저 최종승인 → thinkmap 통합세션 적용(tmseat 직접적용 금지).
--       ★운영순서: 마이그 적용 먼저 → seat 위성 재배포(컬럼 부재 시 order_origin=undefined → 앱 기본 dine_in 처리).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders
  ADD COLUMN IF NOT EXISTS order_origin text NOT NULL DEFAULT 'dine_in'
    CHECK (order_origin IN ('dine_in','takeout','outdoor'));

COMMENT ON COLUMN seat_orders.order_origin IS
  '주문 시작 갈래: dine_in(실내→자리후 전달 관문) / takeout(포장) / outdoor(야외). takeout·outdoor는 자리후 우회.';

-- (선택·유저 결정) 기존 주문 백필: 전부 default 'dine_in' 으로 채워짐. 별도 백필 불필요(실내가 기본 경로).
