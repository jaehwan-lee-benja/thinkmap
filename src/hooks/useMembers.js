// 멤버(인사 마스터) 목록 + CRUD 훅 — docs/MEMBER-SPEC.md §5.1.
//
// members 기본정보: 로그인 사용자 SELECT 공개 / 쓰기는 마스터(RLS).
// member_private(민감정보) / member_records(인사 이력): 마스터 전용 — 별도 async 헬퍼로 제공.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

/**
 * @param {Object} opts
 * @param {boolean} opts.includeInactive  비활성/퇴사 멤버도 포함할지 (기본 false = active만)
 */
export function useMembers({ includeInactive = false } = {}) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase.from('members').select('*').is('deleted_at', null)
      if (!includeInactive) q = q.eq('status', 'active')
      q = q.order('display_order', { ascending: true }).order('name', { ascending: true })
      const { data, error } = await q
      if (error) throw error
      if (mountedRef.current) setMembers(data || [])
    } catch (err) {
      logError('useMembers.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => { refetch() }, [refetch])

  const createMember = useCallback(async (draft) => {
    const name = (draft.name || '').trim()
    if (!name) return { error: new Error('이름은 필수입니다') }
    const row = {
      name,
      work_days: draft.work_days || [],
      seniority: draft.seniority || null,
      phone: draft.phone || null,
      status: draft.status || 'active',
      note: draft.note || null,
      display_order: draft.display_order ?? 999,
    }
    const { data, error } = await supabase.from('members').insert(row).select().maybeSingle()
    if (error) logError('useMembers.createMember', error)
    else refetch()
    return { data, error }
  }, [refetch])

  const updateMember = useCallback(async (id, patch) => {
    const { error } = await supabase.from('members').update(patch).eq('id', id)
    if (error) logError('useMembers.updateMember', error)
    else refetch()
    return { error }
  }, [refetch])

  // soft delete (deleted_at). 기록(roster) 은 member_id SET NULL + member_name 스냅샷으로 보존.
  const removeMember = useCallback(async (id) => {
    const { error } = await supabase
      .from('members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) logError('useMembers.removeMember', error)
    else refetch()
    return { error }
  }, [refetch])

  return { members, loading, refetch, createMember, updateMember, removeMember }
}

// ── 민감정보 / 인사 이력 — 마스터 전용 (RLS가 비마스터 접근 차단) ──────────────

export async function loadMemberPrivate(memberId) {
  const { data, error } = await supabase
    .from('member_private')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) logError('loadMemberPrivate', error)
  return { data: data || null, error }
}

export async function saveMemberPrivate(memberId, patch) {
  const { error } = await supabase
    .from('member_private')
    .upsert(
      { member_id: memberId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'member_id' }
    )
  if (error) logError('saveMemberPrivate', error)
  return { error }
}

export async function loadMemberRecords(memberId) {
  const { data, error } = await supabase
    .from('member_records')
    .select('*')
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) logError('loadMemberRecords', error)
  return { data: data || [], error }
}

export async function saveMemberRecord(record) {
  // record.id 있으면 update, 없으면 insert
  if (record.id) {
    const { id, ...patch } = record
    const { error } = await supabase.from('member_records').update(patch).eq('id', id)
    if (error) logError('saveMemberRecord.update', error)
    return { error }
  }
  const { error } = await supabase.from('member_records').insert(record)
  if (error) logError('saveMemberRecord.insert', error)
  return { error }
}

export async function deleteMemberRecord(id) {
  const { error } = await supabase
    .from('member_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) logError('deleteMemberRecord', error)
  return { error }
}
