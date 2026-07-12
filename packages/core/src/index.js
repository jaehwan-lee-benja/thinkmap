// @thinkmap/core 공개 표면 — 모선·위성이 여기서 import.
// 이후 단계에서 useAuth·공용 UI/훅/유틸을 순차 이관(§9).
export { BASE_URL, withBase } from './basePath.js'
export { supabase } from './supabaseClient.js'
export { useAuth } from './useAuth.js'
// 테마(라이트/다크) — docs/THEME-SPEC.md
export { getThemePref, resolveTheme, applyTheme, setThemePref, initTheme } from './theme.js'
// 공용 UI
export { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal/Modal.jsx'
export { ThemeToggle } from './ui/ThemeToggle.jsx'
export { default as DeleteToast } from './ui/DeleteToast.jsx'
export { default as EmojiPicker } from './ui/EmojiPicker.jsx'
// 공용 훅
export { useIsMobile } from './hooks/useIsMobile.js'
export { useClickOutside } from './hooks/useClickOutside.js'
export { useConfirmAction } from './hooks/useConfirmAction.js'
export { useUserPreferences } from './hooks/useUserPreferences.js'
// 공용 유틸
export * from './utils/dateUtils.js'
export { generateUUID } from './utils/uuid.js'
export { logError } from './utils/supabaseError.js'
// 멤버(인사) 도메인 — Phase 5 에서 core 로 추출(모선 roster[데일리 에디터 결합]와 members 위성이 공유).
export {
  useMembers, loadMemberPrivate, loadAllMemberPrivate, saveMemberPrivate,
  loadMemberRecords, saveMemberRecord, deleteMemberRecord,
} from './hooks/useMembers.js'
export { sortMembers, findOrCreateMembersPage } from './utils/membersPage.js'
export * from './utils/rosterPresets.js'
