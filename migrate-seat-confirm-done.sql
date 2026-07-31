-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — confirm_done 컬럼 추가 : 확인 신호의 '확인완료' 응답 상태
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: 확인 신호를 두 상태로 분리(주문서관리 → 자리안내 왕복).
--   - confirm_flag  (기존): '확인필요' — 주문서관리가 켜는 신호.
--   - confirm_done  (신규): '확인완료' — 자리안내가 처리했다는 응답.
--   자리안내 화면 하이라이트 = confirm_flag AND NOT confirm_done.
--   워크플로우(2026-07-31 유저 확정):
--     · 확인필요 체크 → 하이라이트. 확인필요 해제 → confirm_done 도 리셋(다시 확인 필요 준비).
--     · 확인완료 체크 → 하이라이트만 꺼짐. 확인필요 체크는 남음(처리 기록).
--     · 확인필요를 껐다 다시 켜면 재신호(앱에서 confirm_done=false 로 세팅).
--   ※ confirm_flag(단일 boolean)로는 '필요 vs 처리됨'을 못 나눔 → 별도 컬럼 필요.
--
-- ★안전성:
--   - 엄격 additive: 신규 boolean, NOT NULL DEFAULT false. 기존 컬럼/트리거/인덱스 무변 → 회귀 0.
--     (기존 행은 false = '아직 확인완료 아님'. confirm_flag=false 인 행은 애초에 신호가 없어 무해.)
--   - RLS 무변경: seat_orders_rw 는 행 단위(can_in_workspace editor) → 새 컬럼 자동 포함, 정책 수정 불요.
--   - Realtime 무변경: REPLICA IDENTITY FULL + publication 등록됨 → 새 컬럼 payload 자동 포함.
--   - updated_at 트리거 자동 동작. 재실행 안전: ADD COLUMN IF NOT EXISTS.
--
-- 적용: supabase-guardian 검수 → 유저 최종승인 → thinkmap 통합세션 적용(tmseat 직접적용 금지).
--       ★운영순서: 마이그 적용 먼저 → seat 위성 재배포(컬럼 부재 시 confirm_done=undefined →
--         앱은 falsy 로 처리하나, 확인완료 체크 patch 가 400 → 적용 전 배포 금지).
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE seat_orders
  ADD COLUMN IF NOT EXISTS confirm_done boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN seat_orders.confirm_done IS
  '확인완료: 자리안내가 확인필요(confirm_flag) 신호를 처리했다는 응답. 하이라이트 = confirm_flag AND NOT confirm_done.';
