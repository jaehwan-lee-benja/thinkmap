import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 주요 생각정리 관리 커스텀 훅 (개별 레코드 방식)
 * - 블록 기반 메모 (Notion 스타일)
 * - blocks 테이블에 개별 레코드로 저장
 * - parent_id + position으로 계층 구조 관리
 * - 블록 참조(Reference) 기능 지원
 * - 블록별 수정 이력 추적
 */
export function useKeyThoughts(session) {
  const [keyThoughtsBlocks, setKeyThoughtsBlocks] = useState([
    { id: crypto.randomUUID(), type: 'toggle', content: '', children: [], isOpen: true }
  ])
  const [isSavingKeyThoughts, setIsSavingKeyThoughts] = useState(false)
  const lastSavedKeyThoughtsRef = useRef(null)
  const [focusedBlockId, setFocusedBlockId] = useState(null)

  // 히스토리 관련 (기존 key_thoughts_history 테이블 사용)
  const [keyThoughtsHistory, setKeyThoughtsHistory] = useState([])
  const [showKeyThoughtsHistory, setShowKeyThoughtsHistory] = useState(false)
  const lastHistoryCleanupRef = useRef(null)

  // ====================================================================
  // 헬퍼 함수
  // ====================================================================

  /**
   * 참조 블록의 content를 원본에서 가져와 채우기 (enrichment)
   */
  const enrichBlockReferences = useCallback((blocks) => {
    if (!Array.isArray(blocks)) return []

    return blocks.map(block => {
      if (block.is_reference && block.original_block_id) {
        const original = blocks.find(b => b.id === block.original_block_id)
        return {
          ...block,
          content: original?.content || '[원본 블록을 찾을 수 없음]',
          _isReference: true,
          _originalId: block.original_block_id
        }
      }
      return block
    })
  }, [])

  /**
   * 평탄한 배열을 트리 구조로 변환
   */
  const buildTree = useCallback((flatBlocks) => {
    if (!Array.isArray(flatBlocks) || flatBlocks.length === 0) {
      return [{ id: crypto.randomUUID(), type: 'toggle', content: '', children: [], isOpen: true }]
    }

    const map = {}
    const roots = []

    // 1단계: ID를 key로 하는 맵 생성
    flatBlocks.forEach(block => {
      map[block.id] = { ...block, children: [] }
    })

    // 2단계: 부모-자식 연결
    flatBlocks.forEach(block => {
      if (block.parent_id === null || block.parent_id === undefined) {
        // 최상위 블록
        roots.push(map[block.id])
      } else {
        const parent = map[block.parent_id]
        if (parent) {
          parent.children.push(map[block.id])
        } else {
          // orphan 블록 (부모 없음) → 최상위로
          console.warn(`Orphan block detected: ${block.id}`)
          roots.push(map[block.id])
        }
      }
    })

    // 3단계: position으로 정렬 (재귀적)
    const sortByPosition = (nodes) => {
      nodes.sort((a, b) => (a.position || 0) - (b.position || 0))
      nodes.forEach(node => {
        if (Array.isArray(node.children) && node.children.length > 0) {
          sortByPosition(node.children)
        }
      })
    }
    sortByPosition(roots)

    return roots
  }, [])

  /**
   * 블록 데이터 정규화 (children이 항상 배열이 되도록 보장)
   */
  const normalizeBlocks = useCallback((blocks) => {
    if (!Array.isArray(blocks)) return []
    return blocks.map(block => ({
      ...block,
      children: Array.isArray(block.children) ? normalizeBlocks(block.children) : []
    }))
  }, [])

  // ====================================================================
  // CRUD 함수
  // ====================================================================

  /**
   * 블록 데이터 로드 (DB → 트리 구조)
   */
  const fetchKeyThoughtsContent = async () => {
    if (!session?.user?.id) return

    try {
      console.log('📥 블록 데이터 로드 중...')

      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('position', { ascending: true })

      if (error) {
        console.error('블록 로드 오류:', error.message)
        return
      }

      if (!data || data.length === 0) {
        console.log('   - 블록 데이터 없음 (초기값 사용)')
        // 초기 블록 생성
        const initialBlock = {
          id: crypto.randomUUID(),
          user_id: session.user.id,
          content: '',
          type: 'toggle',
          parent_id: null,
          position: 0,
          is_open: true,
          is_reference: false,
          original_block_id: null,
        }

        await supabase.from('blocks').insert([initialBlock])
        setKeyThoughtsBlocks([{ ...initialBlock, children: [] }])
        return
      }

      console.log(`   ✅ ${data.length}개 블록 로드 완료`)

      // 참조 블록 enrichment
      const enriched = enrichBlockReferences(data)

      // 트리 구조로 변환
      const tree = buildTree(enriched)

      setKeyThoughtsBlocks(tree)
      lastSavedKeyThoughtsRef.current = JSON.parse(JSON.stringify(tree))
    } catch (error) {
      console.error('블록 로드 오류:', error.message)
    }
  }

  /**
   * 블록 생성
   */
  const createBlock = async (content = '', parentId = null, position = 0, type = 'toggle') => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return null
    }

    try {
      const newBlock = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        content,
        type,
        parent_id: parentId,
        position,
        is_open: true,
        is_reference: false,
        original_block_id: null,
      }

      const { error } = await supabase
        .from('blocks')
        .insert([newBlock])

      if (error) {
        console.error('블록 생성 오류:', error.message)
        return null
      }

      // 히스토리 저장
      await saveBlockHistory(newBlock.id, 'create', null, content)

      console.log(`✅ 블록 생성: ${newBlock.id}`)
      return newBlock
    } catch (error) {
      console.error('블록 생성 오류:', error.message)
      return null
    }
  }

  /**
   * 블록 업데이트 (참조 고려)
   */
  const updateBlock = async (blockId, updates, isReference = false, originalId = null) => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return false
    }

    try {
      // 참조 블록이면 원본을 업데이트
      const targetId = isReference ? originalId : blockId

      const { error } = await supabase
        .from('blocks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetId)

      if (error) {
        console.error('블록 업데이트 오류:', error.message)
        return false
      }

      // 내용 변경 시 히스토리 저장
      if (updates.content !== undefined) {
        await saveBlockHistory(
          targetId,
          'update',
          null,
          updates.content,
          isReference ? '참조 블록에서 수정됨' : '직접 수정됨'
        )
      }

      return true
    } catch (error) {
      console.error('블록 업데이트 오류:', error.message)
      return false
    }
  }

  /**
   * 블록 삭제
   */
  const deleteBlock = async (blockId) => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return false
    }

    try {
      // 삭제 전 content 저장 (히스토리용)
      const { data: block } = await supabase
        .from('blocks')
        .select('content')
        .eq('id', blockId)
        .single()

      // 히스토리 저장
      await saveBlockHistory(blockId, 'delete', block?.content, null)

      // 블록 삭제 (CASCADE로 자식 블록도 삭제됨)
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('id', blockId)

      if (error) {
        console.error('블록 삭제 오류:', error.message)
        return false
      }

      console.log(`✅ 블록 삭제: ${blockId}`)
      return true
    } catch (error) {
      console.error('블록 삭제 오류:', error.message)
      return false
    }
  }

  /**
   * 드래그앤드롭: position 일괄 업데이트
   */
  const reorderBlocks = async (updates) => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return false
    }

    try {
      // updates: [{ id, parent_id, position }, ...]
      const promises = updates.map(update =>
        supabase
          .from('blocks')
          .update({
            parent_id: update.parent_id,
            position: update.position,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id)
      )

      const results = await Promise.all(promises)
      const errors = results.filter(r => r.error)

      if (errors.length > 0) {
        console.error('일부 블록 재정렬 실패:', errors)
        return false
      }

      console.log(`✅ ${updates.length}개 블록 재정렬 완료`)
      return true
    } catch (error) {
      console.error('블록 재정렬 오류:', error.message)
      return false
    }
  }

  /**
   * 참조 블록 생성
   */
  const createReferenceBlock = async (originalBlockId, parentId = null, position = 0) => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return null
    }

    try {
      const refBlock = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        content: '',  // 참조는 content 사용 안함
        type: 'toggle',
        parent_id: parentId,
        position,
        is_open: true,
        is_reference: true,
        original_block_id: originalBlockId,
      }

      const { error } = await supabase
        .from('blocks')
        .insert([refBlock])

      if (error) {
        console.error('참조 블록 생성 오류:', error.message)
        return null
      }

      // 히스토리 저장
      await saveBlockHistory(
        refBlock.id,
        'reference_create',
        null,
        null,
        `블록 ${originalBlockId} 참조 생성`
      )

      console.log(`✅ 참조 블록 생성: ${refBlock.id} → ${originalBlockId}`)
      return refBlock
    } catch (error) {
      console.error('참조 블록 생성 오류:', error.message)
      return null
    }
  }

  /**
   * 블록 히스토리 저장 (block_history 테이블)
   */
  const saveBlockHistory = async (blockId, action, contentBefore = null, contentAfter = null, description = '') => {
    if (!session?.user?.id) return

    try {
      await supabase
        .from('block_history')
        .insert([{
          block_id: blockId,
          user_id: session.user.id,
          content_before: contentBefore,
          content_after: contentAfter,
          action,
          description
        }])
    } catch (error) {
      // 히스토리 저장 실패는 무시 (메인 동작에 영향 없도록)
      console.warn('블록 히스토리 저장 실패:', error.message)
    }
  }

  /**
   * 트리 상태를 DB와 동기화 (전체 동기화)
   *
   * 트리를 평탄화하고 position을 계산하여 DB에 저장
   */
  const syncTreeToDB = async (treeBlocks) => {
    if (!session?.user?.id) return

    try {
      console.log('💾 트리 → DB 동기화 시작...')

      // 1. ID 매핑 생성 (숫자 ID → UUID)
      const idMap = new Map()

      const createIdMapping = (blockList) => {
        blockList.forEach(block => {
          // 숫자 ID면 UUID로 변환
          if (typeof block.id === 'number' || !block.id.includes('-')) {
            idMap.set(block.id, crypto.randomUUID())
          } else {
            idMap.set(block.id, block.id) // 이미 UUID면 그대로
          }

          if (Array.isArray(block.children) && block.children.length > 0) {
            createIdMapping(block.children)
          }
        })
      }

      createIdMapping(treeBlocks)

      // 2. 트리를 평탄화 (ID 변환 적용)
      const flattenedBlocks = []
      const positionCounter = {}

      const traverse = (blockList, parentId = null) => {
        blockList.forEach((block) => {
          const parentKey = parentId || 'root'
          if (!positionCounter[parentKey]) {
            positionCounter[parentKey] = 0
          }
          const position = positionCounter[parentKey]++

          // 변환된 ID 사용
          const newId = idMap.get(block.id)
          const newParentId = parentId ? idMap.get(parentId) : null

          flattenedBlocks.push({
            id: newId,
            user_id: session.user.id,
            content: block.content || '',
            type: block.type || 'toggle',
            parent_id: newParentId,
            position: position,
            is_open: block.isOpen !== undefined ? block.isOpen : true,
            is_reference: block._isReference || false,
            original_block_id: block._originalId || null,
          })

          if (Array.isArray(block.children) && block.children.length > 0) {
            traverse(block.children, block.id)
          }
        })
      }

      traverse(treeBlocks)

      // 3. 기존 블록 모두 삭제
      const { error: deleteError } = await supabase
        .from('blocks')
        .delete()
        .eq('user_id', session.user.id)

      if (deleteError) throw deleteError

      // 4. 새로운 블록들 삽입
      if (flattenedBlocks.length > 0) {
        const batchSize = 1000
        for (let i = 0; i < flattenedBlocks.length; i += batchSize) {
          const batch = flattenedBlocks.slice(i, i + batchSize)
          const { error: insertError } = await supabase
            .from('blocks')
            .insert(batch)

          if (insertError) throw insertError
        }
      }

      console.log(`   ✅ ${flattenedBlocks.length}개 블록 동기화 완료`)

      // 5. 로컬 상태의 ID도 업데이트 (다음 저장 시 일관성 유지)
      const updateIdsInTree = (blockList) => {
        return blockList.map(block => ({
          ...block,
          id: idMap.get(block.id),
          children: Array.isArray(block.children)
            ? updateIdsInTree(block.children)
            : []
        }))
      }

      setKeyThoughtsBlocks(updateIdsInTree(treeBlocks))
    } catch (error) {
      console.error('트리 동기화 오류:', error.message)
    }
  }

  /**
   * 주요 생각정리 저장 (자동 저장용)
   *
   * 트리 전체를 DB와 동기화
   */
  const handleSaveKeyThoughts = async () => {
    if (!session?.user?.id) return
    if (keyThoughtsBlocks.length === 0) return

    await syncTreeToDB(keyThoughtsBlocks)
  }

  // ====================================================================
  // 히스토리 관련 함수 (기존 key_thoughts_history 테이블 사용)
  // ====================================================================

  /**
   * 30일 이상된 히스토리 자동 삭제
   */
  const cleanupOldHistory = async () => {
    try {
      const today = new Date().toDateString()

      if (lastHistoryCleanupRef.current === today) {
        return
      }

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // block_history 정리
      await supabase
        .from('block_history')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString())

      // key_thoughts_history 정리 (레거시)
      await supabase
        .from('key_thoughts_history')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString())

      lastHistoryCleanupRef.current = today
      console.log('✅ 오래된 히스토리 정리 완료')
    } catch (error) {
      console.error('히스토리 삭제 오류:', error.message)
    }
  }

  /**
   * 버전 히스토리 불러오기 (레거시)
   */
  const fetchKeyThoughtsHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('key_thoughts_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('버전 히스토리 불러오기 오류:', error.message)
        return
      }

      setKeyThoughtsHistory(data || [])
    } catch (error) {
      console.error('버전 히스토리 불러오기 오류:', error.message)
    }
  }

  /**
   * 특정 버전으로 복구 (레거시)
   *
   * Note: 개별 레코드 방식에서는 이 기능을 사용하지 않음
   * 하지만 마이그레이션 이전 데이터 복구를 위해 유지
   */
  const restoreKeyThoughtsVersion = async (versionId) => {
    alert('⚠️  개별 레코드 방식에서는 버전 복구를 지원하지 않습니다.\n블록별 수정 이력을 확인하세요.')
  }

  return {
    // 상태
    keyThoughtsBlocks,
    setKeyThoughtsBlocks,
    isSavingKeyThoughts,
    setIsSavingKeyThoughts,
    lastSavedKeyThoughtsRef,
    focusedBlockId,
    setFocusedBlockId,

    // 히스토리 (레거시)
    keyThoughtsHistory,
    setKeyThoughtsHistory,
    showKeyThoughtsHistory,
    setShowKeyThoughtsHistory,

    // 헬퍼 함수
    normalizeBlocks,
    enrichBlockReferences,
    buildTree,

    // CRUD 함수
    fetchKeyThoughtsContent,
    createBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    createReferenceBlock,
    saveBlockHistory,

    // 레거시 함수 (호환성)
    handleSaveKeyThoughts,
    cleanupOldHistory,
    fetchKeyThoughtsHistory,
    restoreKeyThoughtsVersion,
  }
}
