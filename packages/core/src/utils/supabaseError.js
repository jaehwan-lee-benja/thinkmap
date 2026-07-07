/**
 * Supabase 에러 로깅 헬퍼
 * @param {string} context - 에러 발생 맥락 (예: '페이지 생성')
 * @param {Object} error - Supabase 에러 객체
 * @returns {boolean} 에러가 있으면 true
 */
export function logError(context, error) {
  if (error) {
    console.error(`${context} 오류:`, error.message ?? error)
    return true
  }
  return false
}
