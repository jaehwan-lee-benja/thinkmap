// @thinkmap/core 공개 표면 — 모선·위성이 여기서 import.
// 이후 단계에서 useAuth·공용 UI/훅/유틸을 순차 이관(§9).
export { BASE_URL, withBase } from './basePath.js'
export { supabase } from './supabaseClient.js'
export { useAuth } from './useAuth.js'
// 공용 UI
export { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal/Modal.jsx'
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
