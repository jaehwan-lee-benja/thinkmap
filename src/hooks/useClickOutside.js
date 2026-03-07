import { useEffect } from 'react'

/**
 * 외부 클릭 감지 훅
 * @param {React.RefObject} ref - 감지 대상 요소의 ref
 * @param {Function} onClose - 외부 클릭 시 호출할 콜백
 * @param {boolean} isActive - 활성 상태 (false이면 리스너 등록 안함)
 * @param {Object} options - 추가 옵션
 * @param {string} options.event - 이벤트 타입 (기본: 'mousedown')
 * @param {string} options.ignoreSelector - 무시할 셀렉터
 */
export function useClickOutside(ref, onClose, isActive = true, options = {}) {
  const { event = 'mousedown', ignoreSelector } = options

  useEffect(() => {
    if (!isActive) return

    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        if (ignoreSelector && e.target.closest(ignoreSelector)) return
        onClose()
      }
    }

    document.addEventListener(event, handler)
    return () => document.removeEventListener(event, handler)
  }, [ref, onClose, isActive, event, ignoreSelector])
}
