// 캔버스 매핑 CRUD 훅 (canvas_pairs / canvas_mappings)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §5
//
// 책임:
//   - createPair  : RPC create_canvas_pair → 페어 + 양 페이지 + 시드 보장
//   - createMapping / updateMapping / deleteMapping : 매핑 CRUD (Phase 1 후반에 사용)
//
// 호출:
//   const { createPair, createMapping, updateMapping, deleteMapping } = useCanvasMutations()

import { useCallback } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

export function useCanvasMutations() {
  // ---------------------------------------------------------------------------
  // createPair — RPC 호출 (트랜잭션: pages × 2 + canvas_pairs + 시드)
  // ---------------------------------------------------------------------------
  const createPair = useCallback(async ({ userId, masterId, name }) => {
    if (!userId || !masterId) {
      throw new Error('createPair: userId, masterId 필수')
    }
    const { data, error } = await supabase.rpc('create_canvas_pair', {
      p_user_id: userId,
      p_master_id: masterId,
      p_name: name || 'Marketing Canvas',
    })
    if (error) {
      logError('useCanvasMutations.createPair', error)
      throw error
    }
    // RPC 반환값은 새 pair_id (UUID)
    return data
  }, [])

  // ---------------------------------------------------------------------------
  // createMapping — canvas_mappings INSERT
  // ---------------------------------------------------------------------------
  const createMapping = useCallback(async (mapping) => {
    const { data, error } = await supabase
      .from('canvas_mappings')
      .insert(mapping)
      .select()
      .single()
    if (error) {
      logError('useCanvasMutations.createMapping', error)
      throw error
    }
    return data
  }, [])

  // ---------------------------------------------------------------------------
  // updateMapping
  // ---------------------------------------------------------------------------
  const updateMapping = useCallback(async (id, patch) => {
    const { data, error } = await supabase
      .from('canvas_mappings')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      logError('useCanvasMutations.updateMapping', error)
      throw error
    }
    return data
  }, [])

  // ---------------------------------------------------------------------------
  // deleteMapping (soft delete)
  // ---------------------------------------------------------------------------
  const deleteMapping = useCallback(async (id) => {
    const { error } = await supabase
      .from('canvas_mappings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      logError('useCanvasMutations.deleteMapping', error)
      throw error
    }
  }, [])

  return { createPair, createMapping, updateMapping, deleteMapping }
}
