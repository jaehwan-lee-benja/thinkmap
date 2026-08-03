-- 자리후 R11: 자리후 전달의 갈래(deliver_mode) — '포장도고려 전달' 추가.
--   유저 지시 2026-08-03: 포장도고려는 제조옵션(전달 후 변경기록)이 아니라 '전달'과 같은 위계의 분기다.
--   "자리가 나면 앉겠지만, 주문은 일단 포장으로 간다" → 자리순서는 살아있고, 달라지는 건 주방 통지 여부뿐.
--     · NULL           = 일반 전달(기존 동작 그대로)
--     · 'maybe_store'  = 포장도고려 · 영수증 매장  → 올림은 평소대로, 스테이션 카드에 '포장' 라벨
--     · 'maybe_receipt'= 포장도고려 · 영수증 포장  → 주방은 이미 포장으로 제조 중 → 올림 무시(스테이션 미노출)
--
-- 성격: 컬럼 추가 1개(가산적·되돌리기 쉬움). 기존 행은 전부 NULL = 일반 전달로 하위호환.
--       RLS·정책·인덱스 변경 없음(seat_orders 기존 정책이 그대로 적용된다).
-- 앱 배포 순서: 어느 쪽을 먼저 해도 안전하다.
--   · 마이그 먼저: 구 앱은 이 컬럼을 안 보내고 안 읽는다 → 무변화.
--   · 앱 먼저: 포장도고려를 누르면 그 UPDATE 만 실패(저장실패 토스트로 보임), 다른 기능 영향 없음.
--   권장 = 마이그 먼저(실패 토스트 구간을 아예 만들지 않음).

BEGIN;

ALTER TABLE public.seat_orders
  ADD COLUMN IF NOT EXISTS deliver_mode text;

-- 값 집합을 DB에서도 못박는다(프론트 오타·구버전 클라이언트로 인한 미지값 유입 차단).
-- NULL 허용 = 일반 전달. CHECK 는 NULL 을 통과시킨다.
ALTER TABLE public.seat_orders
  DROP CONSTRAINT IF EXISTS seat_orders_deliver_mode_check;
ALTER TABLE public.seat_orders
  ADD CONSTRAINT seat_orders_deliver_mode_check
  CHECK (deliver_mode IS NULL OR deliver_mode IN ('maybe_store', 'maybe_receipt'));

COMMENT ON COLUMN public.seat_orders.deliver_mode IS
  'R11 자리후 전달 갈래: NULL=일반 / maybe_store=포장도고려(영수증 매장, 올림에 포장 라벨) / maybe_receipt=포장도고려(영수증 포장, 올림 무시)';

COMMIT;

-- 검증
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name='seat_orders' AND column_name='deliver_mode';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.seat_orders'::regclass AND conname='seat_orders_deliver_mode_check';
-- SELECT count(*) FILTER (WHERE deliver_mode IS NOT NULL) AS non_null FROM public.seat_orders; -- 적용 직후 0 이어야 정상

-- 되돌리기 — 구조는 안전하지만 ★DROP COLUMN 은 그때까지 쌓인 갈래 값을 영구 소실시킨다(guardian 지적).
--   드롭 전에 스냅샷부터:
--   SELECT id, business_date, order_no, deliver_mode FROM public.seat_orders WHERE deliver_mode IS NOT NULL;
-- ALTER TABLE public.seat_orders DROP CONSTRAINT IF EXISTS seat_orders_deliver_mode_check;
-- ALTER TABLE public.seat_orders DROP COLUMN IF EXISTS deliver_mode;
