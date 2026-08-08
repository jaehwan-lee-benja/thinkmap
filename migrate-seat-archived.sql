-- 자리후 R12: 안내 «완료» 아카이브 — `seat_orders.archived_at`.
--   유저 지시 2026-08-08: "자리후에 완료 항목을 넣을거야. 자리안내와 주문서 관리용이고, 안내를 모두 완료해서
--   아카이빙 되는거야. 확인된것을 누르면 다시 대기열로 가도록하는 장치도 있고. 위에서 안내중(대기열),
--   완료 리스트를 전환해서 보는 방식이면 되겠다."
--
--   NULL      = 안내중(대기열)  ← 기존 행 전부 여기
--   timestamp = 안내 완료(아카이빙) 시각. 완료 탭에서 ↩ 한 번이면 다시 NULL(대기열 복귀).
--
-- ★축 분리 — 자리후에는 이제 '끝'을 뜻하는 상태가 셋인데 서로 겹치지 않는다:
--   · `deleted_at`            = 줄 삭제(soft delete). 표에서 사라진다.
--   · `seat_status='canceled'`= 자리대기 취소(손님이 대기 포기). 표에 흐리게 남는다.
--   · `archived_at`(이번)     = 안내 완료. 완료 탭으로 옮겨지고 복귀 가능.
--   그래서 기존 컬럼 재사용이 아니라 새 컬럼이 맞다.
--
-- 성격: 컬럼 추가 1개(가산적·nullable·기본값 없음 ⇒ 테이블 재작성 없음, 락 짧음). CHECK 없음(시각값).
--       RLS·정책·트리거·인덱스 변경 없음 — `seat_orders_rw` 가 행 단위라 새 컬럼을 자동 포섭한다.
-- 앱 배포 순서: **마이그 먼저 → 배포**. 구 앱은 이 컬럼을 안 보내고 안 읽어 무변화지만,
--       앱을 먼저 올리면 «완료» 클릭이 저장실패 토스트만 띄운다.

BEGIN;

ALTER TABLE public.seat_orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.seat_orders.archived_at IS
  'R12 안내 완료(아카이빙) 시각. NULL=안내중(대기열). 완료 탭에서 복귀 시 NULL 로 되돌린다. 삭제(deleted_at)·대기취소(seat_status)와 별개 축';

COMMIT;

-- 검증
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name='seat_orders' AND column_name='archived_at';
-- SELECT count(*) AS total, count(archived_at) AS archived FROM public.seat_orders; -- 적용 직후 archived=0
-- SELECT count(*) FROM pg_policies WHERE tablename='seat_orders';                   -- 정책 수 무변경 확인

-- 되돌리기 — 구조는 안전하나 ★DROP COLUMN 은 그때까지의 완료 표시를 영구 소실시킨다.
--   드롭 전에 스냅샷부터:
--   SELECT id, business_date, order_no, archived_at FROM public.seat_orders WHERE archived_at IS NOT NULL;
-- ALTER TABLE public.seat_orders DROP COLUMN IF EXISTS archived_at;
