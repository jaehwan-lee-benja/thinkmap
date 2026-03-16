-- 뷰어 모드: 관리자가 임퍼소네이션 중 토글 열기/닫기 상태를 별도 저장
-- 구조: { "pageId": { "0": true, "3": false, ... } }  (토글 인덱스 → isOpen)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS viewer_toggle_overrides JSONB DEFAULT '{}';
