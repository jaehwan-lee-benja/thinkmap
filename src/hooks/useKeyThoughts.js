import { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * UUID 생성 함수 (브라우저 호환)
 */
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: 간단한 UUID v4 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 주요 생각정리 관리 커스텀 훅 (최적화 버전)
 *
 * 개선사항:
 * - depth 필드 추가 및 자동 계산
 * - 개별 블록 CRUD (전체 삭제/재삽입 방지)
 * - 블록 참조(Synced Block) 기능 지원
 * - 블록별 수정 이력 추적
 * - 페이지별 블록 관리
 */
export function useKeyThoughts(session, currentPageId) {
  const [keyThoughtsBlocks, setKeyThoughtsBlocks] = useState([
    { id: generateUUID(), type: 'toggle', content: '', children: [], isOpen: true, depth: 0 }
  ])
  const [isSavingKeyThoughts, setIsSavingKeyThoughts] = useState(false)
  const lastSavedKeyThoughtsRef = useRef(null)
  const [focusedBlockId, setFocusedBlockId] = useState(null)

  // 히스토리 관련 (레거시 호환)
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

    const blockMap = new Map(blocks.map(b => [b.id, b]))

    return blocks.map(block => {
      if (block.is_reference && block.original_block_id) {
        const original = blockMap.get(block.original_block_id)
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
      return [{ id: generateUUID(), type: 'toggle', content: '', children: [], isOpen: true, depth: 0 }]
    }

    const map = {}
    const roots = []

    // 1단계: ID를 key로 하는 맵 생성
    flatBlocks.forEach(block => {
      map[block.id] = {
        ...block,
        children: [],
        depth: block.depth || 0  // ✨ depth 필드 보존
      }
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
          map[block.id].depth = 0
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
   * 블록 데이터 정규화
   */
  const normalizeBlocks = useCallback((blocks) => {
    if (!Array.isArray(blocks)) return []
    return blocks.map(block => ({
      ...block,
      children: Array.isArray(block.children) ? normalizeBlocks(block.children) : [],
      depth: block.depth !== undefined ? block.depth : 0
    }))
  }, [])

  /**
   * depth 자동 계산 (재귀적)
   */
  const calculateDepth = useCallback((blocks, parentDepth = -1) => {
    return blocks.map(block => ({
      ...block,
      depth: parentDepth + 1,
      children: Array.isArray(block.children)
        ? calculateDepth(block.children, parentDepth + 1)
        : []
    }))
  }, [])

  // ====================================================================
  // CRUD 함수 (개별 블록 방식)
  // ====================================================================

  /**
   * 블록 데이터 로드 (DB → 트리 구조)
   */
  const fetchKeyThoughtsContent = async () => {
    if (!session?.user?.id || !currentPageId) return

    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('page_id', currentPageId)
        .order('position', { ascending: true })

      if (error) {
        console.error('블록 로드 오류:', error.message)
        return
      }

      if (!data || data.length === 0) {
        // 초기 블록 생성
        const initialBlock = {
          id: generateUUID(),
          user_id: session.user.id,
          page_id: currentPageId,
          content: '',
          type: 'toggle',
          parent_id: null,
          position: 0,
          depth: 0,
          is_open: true,
          is_reference: false,
          original_block_id: null,
        }

        await supabase.from('blocks').insert([initialBlock])
        setKeyThoughtsBlocks([{ ...initialBlock, children: [] }])
        return
      }

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
   * 개별 블록 생성
   */
  const createBlock = async (content = '', parentId = null, position = 0, depth = 0, type = 'toggle') => {
    if (!session?.user?.id || !currentPageId) {
      console.error('로그인 필요')
      return null
    }

    try {
      const newBlock = {
        id: generateUUID(),
        user_id: session.user.id,
        page_id: currentPageId,
        content,
        type,
        parent_id: parentId,
        position,
        depth,
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

      return newBlock
    } catch (error) {
      console.error('블록 생성 오류:', error.message)
      return null
    }
  }

  /**
   * 개별 블록 업데이트
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

      // ✨ 변경: 즉시 히스토리 저장하지 않음 (포커스 벗어날 때 저장)

      return true
    } catch (error) {
      console.error('블록 업데이트 오류:', error.message)
      return false
    }
  }

  /**
   * 개별 블록 삭제
   */
  const deleteBlock = async (blockId) => {
    if (!session?.user?.id) {
      console.error('로그인 필요')
      return false
    }

    try {
      // 블록 삭제 (CASCADE로 자식 블록도 삭제됨)
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('id', blockId)

      if (error) {
        console.error('블록 삭제 오류:', error.message)
        return false
      }

      return true
    } catch (error) {
      console.error('블록 삭제 오류:', error.message)
      return false
    }
  }

  /**
   * 블록 이동 (드래그앤드롭)
   */
  const moveBlock = async (blockId, newParentId, newPosition, newDepth) => {
    if (!session?.user?.id) return false

    try {
      const { error } = await supabase
        .from('blocks')
        .update({
          parent_id: newParentId,
          position: newPosition,
          depth: newDepth,
          updated_at: new Date().toISOString()
        })
        .eq('id', blockId)

      if (error) {
        console.error('블록 이동 오류:', error.message)
        return false
      }

      return true
    } catch (error) {
      console.error('블록 이동 오류:', error.message)
      return false
    }
  }

  /**
   * 참조 블록 생성
   */
  const createReferenceBlock = async (originalBlockId, parentId = null, position = 0, depth = 0) => {
    if (!session?.user?.id || !currentPageId) {
      console.error('로그인 필요')
      return null
    }

    try {
      const refBlock = {
        id: generateUUID(),
        user_id: session.user.id,
        page_id: currentPageId,
        content: '',  // 참조는 content 사용 안함
        type: 'toggle',
        parent_id: parentId,
        position,
        depth,
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

      return refBlock
    } catch (error) {
      console.error('참조 블록 생성 오류:', error.message)
      return null
    }
  }

  /**
   * 블록 히스토리 저장
   */
  const saveBlockHistory = async (blockId, action, contentBefore = null, contentAfter = null, description = '') => {
    if (!session?.user?.id || !currentPageId) return

    try {
      const { error } = await supabase
        .from('block_history')
        .insert([{
          block_id: blockId,
          user_id: session.user.id,
          page_id: currentPageId,
          content_before: contentBefore,
          content_after: contentAfter,
          action,
          description
        }])

      // 에러가 있어도 조용히 무시 (히스토리는 중요하지 않음)
      if (error) {
        // 디버그 필요 시에만 주석 해제
        // console.warn('블록 히스토리 저장 실패:', error.message)
      }
    } catch (error) {
      // 히스토리 저장 실패는 조용히 무시
    }
  }

  /**
   * 블록 포커스 벗어날 때 히스토리 저장
   */
  const saveHistoryOnBlur = async (blockId, contentBefore, contentAfter) => {
    if (!session?.user?.id || !currentPageId) return
    if (contentBefore === contentAfter) return // 변경사항 없으면 저장 안 함

    await saveBlockHistory(
      blockId,
      'update',
      contentBefore,
      contentAfter,
      '내용 수정'
    )
  }

  /**
   * 수동으로 현재 버전 저장 (Ctrl+S 또는 버튼)
   */
  const manualSaveHistory = async (customDescription = null) => {
    if (!session?.user?.id || !currentPageId) return false

    try {
      // 전체 블록 구조를 하나의 스냅샷으로 저장
      const { error } = await supabase
        .from('block_history')
        .insert([{
          block_id: null, // 스냅샷은 개별 블록이 아닌 전체 페이지
          user_id: session.user.id,
          page_id: currentPageId,
          content_before: null,
          content_after: keyThoughtsBlocks, // 전체 블록 트리를 JSON으로 저장
          action: 'manual_snapshot',
          description: customDescription || '수동 버전 저장'
        }])

      if (error) {
        console.error('수동 히스토리 저장 오류:', error.message)
        return false
      }

      return true
    } catch (error) {
      console.error('수동 히스토리 저장 오류:', error.message)
      return false
    }
  }

  /**
   * 트리 상태를 DB와 동기화 (개선된 버전)
   *
   * ✨ 개선사항: 전체 삭제/재삽입 대신 upsert 사용
   */
  const syncTreeToDB = async (treeBlocks) => {
    if (!session?.user?.id) return

    try {
      // depth 자동 계산
      const blocksWithDepth = calculateDepth(treeBlocks)

      // ✨ ID 변환 맵 생성 (타임스탬프 ID → UUID)
      const idMap = new Map()

      const createIdMapping = (blockList) => {
        blockList.forEach(block => {
          // UUID 형식 체크 (8-4-4-4-12 패턴)
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id)

          if (!isUUID) {
            // 타임스탬프 ID면 UUID로 변환
            idMap.set(block.id, generateUUID())
          } else {
            // 이미 UUID면 그대로 사용
            idMap.set(block.id, block.id)
          }

          if (Array.isArray(block.children) && block.children.length > 0) {
            createIdMapping(block.children)
          }
        })
      }

      createIdMapping(blocksWithDepth)

      // 트리를 평탄화 (ID 변환 적용)
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
            page_id: currentPageId,
            content: block.content || '',
            type: block.type || 'toggle',
            parent_id: newParentId,
            position: position,
            depth: block.depth,
            is_open: block.isOpen !== undefined ? block.isOpen : true,
            is_reference: block._isReference || false,
            original_block_id: block._originalId ? idMap.get(block._originalId) : null,
          })

          if (Array.isArray(block.children) && block.children.length > 0) {
            traverse(block.children, block.id)
          }
        })
      }

      traverse(blocksWithDepth)

      // ✨ 개선: upsert 사용 (전체 삭제 대신)
      // 1. 기존 블록 ID 목록 가져오기
      const { data: existingBlocks } = await supabase
        .from('blocks')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('page_id', currentPageId)

      const existingIds = new Set(existingBlocks?.map(b => b.id) || [])
      const newIds = new Set(flattenedBlocks.map(b => b.id))

      // 2. 삭제된 블록 제거
      const idsToDelete = [...existingIds].filter(id => !newIds.has(id))
      if (idsToDelete.length > 0) {
        await supabase
          .from('blocks')
          .delete()
          .in('id', idsToDelete)
      }

      // 3. upsert (insert or update)
      if (flattenedBlocks.length > 0) {
        const batchSize = 1000
        for (let i = 0; i < flattenedBlocks.length; i += batchSize) {
          const batch = flattenedBlocks.slice(i, i + batchSize)
          const { error: upsertError } = await supabase
            .from('blocks')
            .upsert(batch, { onConflict: 'id' })

          if (upsertError) throw upsertError
        }
      }

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

      setKeyThoughtsBlocks(updateIdsInTree(blocksWithDepth))
    } catch (error) {
      console.error('트리 동기화 오류:', error.message)
    }
  }

  /**
   * 주요 생각정리 저장 (자동 저장용)
   */
  const handleSaveKeyThoughts = async () => {
    if (!session?.user?.id) return
    if (keyThoughtsBlocks.length === 0) return

    await syncTreeToDB(keyThoughtsBlocks)
  }

  // ====================================================================
  // 히스토리 관련 함수 (레거시 호환)
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

      await supabase
        .from('block_history')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString())

      lastHistoryCleanupRef.current = today
    } catch (error) {
      console.error('히스토리 삭제 오류:', error.message)
    }
  }

  /**
   * 버전 히스토리 불러오기 (레거시)
   */
  const fetchKeyThoughtsHistory = async () => {
    if (!currentPageId) return

    try {
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('page_id', currentPageId)
        .order('created_at', { ascending: false })
        .limit(100)

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
   */
  const restoreKeyThoughtsVersion = async (versionId) => {
    if (!currentPageId) {
      alert('⚠️ 페이지가 선택되지 않았습니다.')
      return
    }

    try {
      // 1. 해당 버전의 데이터 가져오기
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('id', versionId)
        .single()

      if (error || !data) {
        console.error('버전 복구 오류:', error?.message)
        alert('⚠️ 버전 데이터를 불러오는데 실패했습니다.')
        return
      }

      // 2. manual_snapshot과 개별 블록 수정 구분
      if (data.action === 'manual_snapshot') {
        // 전체 스냅샷 복구
        // 3. content_after 파싱 (문자열이면 JSON 파싱)
        let blockTree = data.content_after
        if (typeof blockTree === 'string') {
          try {
            blockTree = JSON.parse(blockTree)
          } catch (e) {
            console.error('JSON 파싱 오류:', e)
            alert('⚠️ 버전 데이터 파싱에 실패했습니다.')
            return
          }
        }

        // 4. 배열(블록 트리)인지 확인
        if (!Array.isArray(blockTree)) {
          console.error('blockTree는 배열이 아닙니다:', blockTree)
          alert('⚠️ 잘못된 버전 데이터입니다.')
          return
        }

        // 5. 복구 확인
        const confirmRestore = window.confirm(
          `이 버전으로 복구하시겠습니까?\n\n` +
          `저장 시각: ${new Date(data.created_at).toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Seoul'
          })}\n\n` +
          `⚠️ 현재 내용은 사라지며, 복구 전 자동으로 현재 버전이 저장됩니다.`
        )

        if (!confirmRestore) return

        // 6. 현재 버전 자동 저장 (복구 전)
        const restoreTime = new Date().toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Seoul'
        })
        await manualSaveHistory(`복구로 인해 히스토리로 저장된 버전 (${restoreTime})`)

        // 7. 블록 트리 복원
        setKeyThoughtsBlocks(blockTree)

        // 8. DB에 동기화 (기존 블록 모두 삭제 후 새로 생성)
        await syncTreeToDB(blockTree)

        alert('✅ 버전이 성공적으로 복구되었습니다.')
      } else {
        // 개별 블록 수정 복구
        if (!data.block_id) {
          alert('⚠️ 복구할 블록 ID가 없습니다.')
          return
        }

        // content_after가 문자열이 아니면 문자열로 변환
        let contentToRestore = data.content_after
        if (typeof contentToRestore !== 'string') {
          if (contentToRestore === null || contentToRestore === undefined) {
            alert('⚠️ 복구할 내용이 없습니다.')
            return
          }
          contentToRestore = String(contentToRestore)
        }

        const confirmRestore = window.confirm(
          `이 블록 수정 내역으로 복구하시겠습니까?\n\n` +
          `수정 시각: ${new Date(data.created_at).toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Seoul'
          })}\n\n` +
          `내용: ${contentToRestore}`
        )

        if (!confirmRestore) return

        // 해당 블록 업데이트
        const success = await updateBlock(data.block_id, { content: contentToRestore })

        if (success) {
          // 로컬 상태도 업데이트
          await fetchKeyThoughtsContent()
          alert('✅ 블록이 성공적으로 복구되었습니다.')
        } else {
          alert('⚠️ 블록 복구에 실패했습니다.')
        }
      }
      return
    } catch (error) {
      console.error('버전 복구 오류:', error.message)
      alert('⚠️ 버전 복구 중 오류가 발생했습니다.')
    }
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
    calculateDepth,

    // CRUD 함수 (개별 블록 방식)
    fetchKeyThoughtsContent,
    createBlock,
    updateBlock,
    deleteBlock,
    moveBlock,
    createReferenceBlock,
    saveBlockHistory,

    // 트리 동기화
    syncTreeToDB,
    handleSaveKeyThoughts,

    // 히스토리
    cleanupOldHistory,
    fetchKeyThoughtsHistory,
    restoreKeyThoughtsVersion,
    saveHistoryOnBlur,
    manualSaveHistory,
  }
}
