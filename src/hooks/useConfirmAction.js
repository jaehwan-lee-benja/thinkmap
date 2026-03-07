import { useCallback } from 'react'

/**
 * 확인 대화상자 + 조건 검사 훅
 * @param {Function} onConfirm - 확인 후 실행할 콜백 (id) => void
 * @param {Object} options
 * @param {Array} options.items - 현재 항목 배열 (최소 개수 검사용)
 * @param {number} options.minRequired - 최소 필요 개수 (기본: 0)
 * @param {string} options.blockMessage - 삭제 불가 시 알림 메시지
 * @param {string|Function} options.confirmMessage - 확인 메시지 (문자열 또는 (id) => string 함수)
 */
export function useConfirmAction(onConfirm, options = {}) {
  const { items = [], minRequired = 0, blockMessage, confirmMessage } = options

  const execute = useCallback((id, e) => {
    if (e) e.stopPropagation()

    if (minRequired > 0 && items.length <= minRequired) {
      if (blockMessage) alert(blockMessage)
      return
    }

    const msg = typeof confirmMessage === 'function' ? confirmMessage(id) : confirmMessage
    if (msg && !window.confirm(msg)) return

    onConfirm(id)
  }, [onConfirm, items.length, minRequired, blockMessage, confirmMessage])

  const canExecute = items.length > minRequired

  return { execute, canExecute }
}
