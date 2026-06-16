// 멤버 관리 페이지(page_type='members') find-or-create — 사이드바 "멤버 관리" 버튼과
// 배치도 모달의 "멤버 관리하기" 버튼이 공용으로 쓰는 네비게이션 헬퍼.
// 멤버 페이지는 캘린더·급여명세서 등과 같은 독립 섹션(parent_id=null, project_id=null).

import { supabase } from '../supabaseClient'
import { generateUUID } from './uuid'

/**
 * DB에서 멤버 관리 페이지를 찾고, 없으면 생성해 페이지 id를 반환한다.
 * @param {string} userId  생성 시 소유자(현재 세션 사용자) id
 * @returns {Promise<string|null>} 페이지 id (실패 시 null — 호출부에서 중단 처리)
 */
export async function findOrCreateMembersPage(userId) {
  // 1) 기존 멤버 페이지 조회
  const { data, error } = await supabase
    .from('pages')
    .select('id')
    .eq('page_type', 'members')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (error) { alert('멤버 관리 조회 실패: ' + error.message); return null }
  if (data) return data.id

  // 2) 없으면 신규 생성 (마스터 전용 섹션)
  const newPageId = generateUUID()
  const { error: insErr } = await supabase
    .from('pages')
    .insert([{
      id: newPageId,
      user_id: userId,
      name: '멤버 관리',
      page_type: 'members',
      project_id: null,
      parent_id: null,
      position: -2,
    }])
  if (insErr) { alert('멤버 관리 페이지 생성 실패: ' + insErr.message); return null }
  return newPageId
}
