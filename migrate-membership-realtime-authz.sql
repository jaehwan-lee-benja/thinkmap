-- ============================================================================
-- 멤버십 키오스크 — Realtime 채널 인가 (2대 분리 연동, 유저결정 A/A-2)
--   매장 고정 룸 `membership:<store>` private 채널을 **매장 계정 세션만** 구독/브로드캐스트하도록
--   realtime.messages 에 RLS 정책. 익명·외부 클라의 브로드캐스트 스누핑 차단(제안서 §4 채널 인가).
--
-- ★적용 보류(초안). 하드게이트: supabase-guardian → 유저 승인 → thinkmap 통합세션 적용.
--   대상 = thinkmap DB(sqisntxippjzcekyhqyo) — 위성 Realtime 은 thinkmap 프로젝트에서 돈다(직원 인증).
--   전제: is_master()/is_store() 존재(migrate-dynamic-master.sql / migrate-membership-kiosk-thinkmap.sql).
--   프론트: private 채널 구독은 VITE_MEMBERSHIP_REALTIME='1' 로 게이트(이 정책 적용 후 켠다).
-- 정본: docs/MEMBERSHIP-2DEVICE-SPLIT-PROPOSAL.md §4·§5.
--
-- ※ Supabase Realtime Authorization: private 채널은 realtime.messages 에 대한 RLS 로 인가한다.
--   topic 헬퍼 = realtime.topic(). (Supabase 버전에 따라 함수명 확인 — guardian 검수 포인트.)
-- ============================================================================

BEGIN;

-- realtime.messages RLS 활성(이미 켜져 있을 수 있음 — 멱등).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 멤버십 매장 채널: 인증된 매장(store)/마스터 세션만 read+write. topic 접두 'membership:' 로 스코프.
DROP POLICY IF EXISTS membership_kiosk_realtime ON realtime.messages;
CREATE POLICY membership_kiosk_realtime ON realtime.messages
  FOR ALL
  TO authenticated
  USING ( realtime.topic() LIKE 'membership:%' AND (is_master() OR is_store()) )
  WITH CHECK ( realtime.topic() LIKE 'membership:%' AND (is_master() OR is_store()) );

COMMIT;

-- 롤백: DROP POLICY IF EXISTS membership_kiosk_realtime ON realtime.messages;
-- ⚠️ 검수 포인트(guardian): (1) realtime.topic() 함수 현행 Supabase 에 존재하는지 · (2) 이 정책이 다른
--    Realtime 사용(pages/daily 등 thinkmap 기존 realtime)에 영향 없는지(topic 접두로 스코프되어 무관해야 함) ·
--    (3) 기존 realtime.messages 정책과의 상호작용(정책은 OR 결합 — 신규 정책이 기존 접근을 넓히지 않는지).
