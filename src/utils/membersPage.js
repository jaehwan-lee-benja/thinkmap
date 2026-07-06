// 멤버 관리 페이지(page_type='members') find-or-create — 사이드바 "멤버 관리" 버튼과
// 배치도 모달의 "멤버 관리하기" 버튼이 공용으로 쓰는 네비게이션 헬퍼.
// 멤버 페이지는 캘린더·급여명세서 등과 같은 독립 섹션(parent_id=null, project_id=null).

import { supabase } from '@thinkmap/core'
import { generateUUID } from './uuid'
import { WEEKDAYS } from './rosterPresets'

// ── 멤버 목록 칼럼 정렬 (클라이언트 측) — MembersPage 읽기/표편집 공용 ──────────
// 정렬은 이미 불러온 배열에만 적용한다(DB 쿼리/스키마 변경 없음).
// 요일은 가나다가 아니라 '월화수목금토일' 논리 순서로 — 멤버의 가장 이른 근무요일 기준.

const STATUS_ORDER = { active: 0, inactive: 1, resigned: 2 }

// 각 정렬 키의 값 추출기. (m=members 행, p=member_private 행)
const SORT_GETTERS = {
  display_order: (m) => m.display_order ?? 0,
  work_days: (m) => {
    const ds = m.work_days || []
    if (!ds.length) return Infinity // 미지정은 항상 끝쪽
    return Math.min(...ds.map((d) => { const i = WEEKDAYS.indexOf(d); return i < 0 ? 99 : i }))
  },
  name: (m) => m.name || '',
  seniority: (m) => m.seniority || '',
  phone: (m) => m.phone || '',
  status: (m) => STATUS_ORDER[m.status] ?? 99,
  payslip_email: (m, p) => p.payslip_email || '',
  bank_account: (m, p) => p.bank_account || '',
  birth: (m, p) => p.birth || '',
  email_gmail: (m, p) => p.email_gmail || '',
}

// 가나다(ko) 비교 + 빈값은 방향과 무관하게 항상 맨 아래로.
const TEXT_KEYS = new Set(['name', 'seniority', 'phone', 'payslip_email', 'bank_account', 'birth', 'email_gmail'])

/**
 * 멤버 배열을 칼럼 기준으로 정렬해 새 배열로 반환한다.
 * @param {Array} members  useMembers가 준 멤버 목록 (이미 display_order→name 순)
 * @param {Object} privById  member_private 매핑 { [member_id]: privRow }
 * @param {{key:string|null, dir:'asc'|'desc'}} sort
 * @returns {Array} 정렬된 새 배열 (key 없으면 원본 그대로 = 기본 순서)
 */
export function sortMembers(members, privById, sort) {
  if (!sort || !sort.key || !SORT_GETTERS[sort.key]) return members
  const { key, dir } = sort
  const getVal = SORT_GETTERS[key]
  const isText = TEXT_KEYS.has(key)
  const sign = dir === 'desc' ? -1 : 1
  const arr = [...members]
  arr.sort((a, b) => {
    const pa = privById?.[a.id] || {}
    const pb = privById?.[b.id] || {}
    const va = getVal(a, pa)
    const vb = getVal(b, pb)
    let cmp
    if (isText) {
      const ea = va === '' || va == null
      const eb = vb === '' || vb == null
      if (ea && eb) cmp = 0
      else if (ea) return 1   // 빈값은 항상 아래(방향 무관)
      else if (eb) return -1
      else cmp = String(va).localeCompare(String(vb), 'ko')
    } else {
      cmp = va < vb ? -1 : va > vb ? 1 : 0
    }
    if (cmp !== 0) return cmp * sign
    // 동순위 안정화: 기본 순서(display_order→name)로 tiebreak
    const od = (a.display_order ?? 0) - (b.display_order ?? 0)
    if (od !== 0) return od
    return (a.name || '').localeCompare(b.name || '', 'ko')
  })
  return arr
}

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
