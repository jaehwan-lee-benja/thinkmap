// 백오피스 페이지(page_type='backoffice') find-or-create — 사이드바 "백오피스" 버튼용.
// membersPage.js 의 findOrCreateMembersPage 와 동일 패턴(독립 섹션: parent_id=null, project_id=null).
// 백오피스 = 사이트 구조도(모선+위성) 관리 마스터 전용 페이지.

import { supabase, generateUUID } from '@thinkmap/core'

/**
 * DB에서 백오피스 페이지를 찾고, 없으면 생성해 페이지 id를 반환한다.
 * @param {string} userId  생성 시 소유자(현재 세션 사용자) id
 * @returns {Promise<string|null>} 페이지 id (실패 시 null)
 */
export async function findOrCreateBackofficePage(userId) {
  const { data, error } = await supabase
    .from('pages')
    .select('id')
    .eq('page_type', 'backoffice')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (error) { alert('백오피스 조회 실패: ' + error.message); return null }
  if (data) return data.id

  const newPageId = generateUUID()
  const { error: insErr } = await supabase
    .from('pages')
    .insert([{
      id: newPageId,
      user_id: userId,
      name: '백오피스',
      page_type: 'backoffice',
      project_id: null,
      parent_id: null,
      position: -3,
    }])
  if (insErr) { alert('백오피스 페이지 생성 실패: ' + insErr.message); return null }
  return newPageId
}
