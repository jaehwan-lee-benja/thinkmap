// 사이트 구조도 노드 데이터 계층 — DB(site_nodes) 우선, 미적용 시 시드 폴백.
//
// 회복력(resilience) 설계:
//   - site_nodes 테이블이 있고 행이 있으면  → mode='db'.  CRUD 가 Supabase 에 영속.
//   - 테이블이 없거나(마이그 미적용) 비어 있으면 → mode='local'. 시드로 채우고 로컬 편집만.
// → 통합 세션이 migrate-create-site-nodes.sql 을 적용(+시드 INSERT)하면 새로고침 시
//   자동으로 db 모드로 넘어간다. 코드 변경 불필요.
//
// site_nodes 스키마: migrate-create-site-nodes.sql 참조.
// 저장소 결정(SITE-SPLIT-PLAN §10 "위성 런처 레지스트리 = 정적 config vs DB 테이블"):
//   → 런타임 편집이 목적이므로 DB 테이블 채택. 이 훅이 그 레지스트리의 접근 계층이다.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generateUUID } from '../utils/uuid'
import { SITE_NODES_SEED } from '../utils/siteNodesSeed'

const SELECT_COLS = 'id,name,kind,domain,url,required_role,status,sort_order,note'

// PostgREST: 테이블/컬럼 부재 = 42P01/42703, 스키마 캐시 부재 = PGRST205.
const isMissingTable = (error) =>
  !!error && (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    /relation .*site_nodes.* does not exist/i.test(error.message || '') ||
    /could not find the table/i.test(error.message || '')
  )

const sortNodes = (arr) =>
  [...arr].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || '', 'ko'))

// 시드를 로컬 편집용 노드로 (얕은 복사 — 원본 상수 불변 유지).
const freshSeed = () => sortNodes(SITE_NODES_SEED.map((n) => ({ ...n })))

export function useSiteNodes() {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('db') // 'db' | 'local'
  const [error, setError] = useState(null)

  const fetchNodes = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('site_nodes')
      .select(SELECT_COLS)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    if (error) {
      if (isMissingTable(error)) {
        // 마이그 미적용 — 시드로 미리보기.
        setMode('local')
        setNodes(freshSeed())
      } else {
        setError(error.message)
        setMode('local')
        setNodes(freshSeed())
      }
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      // 테이블은 있으나 시드 전 — 로컬 미리보기(빈 화면 대신 구조 보여주기).
      setMode('local')
      setNodes(freshSeed())
    } else {
      setMode('db')
      setNodes(sortNodes(data))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchNodes() }, [fetchNodes])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  // db 모드: Supabase 반영 후 로컬 state 낙관적 갱신.
  // local 모드: 로컬 state 만(세션 내 미리보기 — 새로고침하면 시드로 복귀).

  const createNode = useCallback(async (draft) => {
    const row = {
      id: generateUUID(),
      name: draft.name?.trim() || '새 노드',
      kind: draft.kind || 'satellite',
      domain: draft.domain?.trim() || '',
      url: draft.url?.trim() || '',
      required_role: draft.required_role || 'master',
      status: draft.status || 'planned',
      sort_order: Number.isFinite(+draft.sort_order) ? +draft.sort_order : 0,
      note: draft.note?.trim() || '',
    }
    if (mode === 'db') {
      const { data, error } = await supabase.from('site_nodes').insert([row]).select(SELECT_COLS).single()
      if (error) { alert('노드 추가 실패: ' + error.message); return null }
      setNodes((prev) => sortNodes([...prev, data]))
      return data
    }
    setNodes((prev) => sortNodes([...prev, row]))
    return row
  }, [mode])

  const updateNode = useCallback(async (id, patch) => {
    const clean = { ...patch }
    if ('sort_order' in clean) clean.sort_order = Number.isFinite(+clean.sort_order) ? +clean.sort_order : 0
    if (mode === 'db') {
      const { data, error } = await supabase.from('site_nodes').update(clean).eq('id', id).select(SELECT_COLS).single()
      if (error) { alert('노드 수정 실패: ' + error.message); return null }
      setNodes((prev) => sortNodes(prev.map((n) => (n.id === id ? data : n))))
      return data
    }
    setNodes((prev) => sortNodes(prev.map((n) => (n.id === id ? { ...n, ...clean } : n))))
    return { id, ...clean }
  }, [mode])

  const removeNode = useCallback(async (id) => {
    if (mode === 'db') {
      // 소프트 삭제(멤버/roster 관행과 동일).
      const { error } = await supabase.from('site_nodes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) { alert('노드 삭제 실패: ' + error.message); return false }
    }
    setNodes((prev) => prev.filter((n) => n.id !== id))
    return true
  }, [mode])

  return { nodes, loading, mode, error, fetchNodes, createNode, updateNode, removeNode }
}
