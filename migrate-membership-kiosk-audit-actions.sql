-- ============================================================================
-- 멤버십 키오스크 — audit action 확장 (팝콘 이력조회 + 회원리스트)
--   기존 membership_kiosk_audit.action CHECK('lookup','event_claim','signup') 에
--   'history'(수령내역 읽기) · 'list'(회원 리스트) 추가. 신규 프록시 Edge 의 감사·레이트리밋 근거.
--
-- ★적용 보류(초안). 하드게이트: supabase-guardian → 유저 승인 → thinkmap 통합세션 적용.
--   전제: migrate-membership-kiosk-thinkmap.sql 이 이미 적용됨(membership_kiosk_audit 존재, 검증됨).
-- 순수 additive(CHECK 확대). 롤백 = 원 CHECK 로 되돌림.
-- 정본: docs/MEMBERSHIP-KIOSK-SPEC.md §3.3.
-- ============================================================================

BEGIN;

ALTER TABLE membership_kiosk_audit DROP CONSTRAINT IF EXISTS membership_kiosk_audit_action_chk;
ALTER TABLE membership_kiosk_audit ADD CONSTRAINT membership_kiosk_audit_action_chk
  CHECK (action IN ('lookup','event_claim','signup','history','list'));

COMMIT;

-- 롤백:
--   ALTER TABLE membership_kiosk_audit DROP CONSTRAINT membership_kiosk_audit_action_chk;
--   ALTER TABLE membership_kiosk_audit ADD CONSTRAINT membership_kiosk_audit_action_chk
--     CHECK (action IN ('lookup','event_claim','signup'));
