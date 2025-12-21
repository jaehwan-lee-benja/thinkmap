import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 주요 생각정리 관리 커스텀 훅
 * - 블록 기반 메모 (Notion 스타일)
 * - 버전 히스토리 관리
 * - 자동 저장 및 복구
 */
export function useKeyThoughts(session) {
  const [keyThoughtsBlocks, setKeyThoughtsBlocks] = useState([
    { id: Date.now() + Math.random(), type: 'toggle', content: '', children: [], isOpen: true }
  ])
  const [isSavingKeyThoughts, setIsSavingKeyThoughts] = useState(false)
  const lastSavedKeyThoughtsRef = useRef(null)
  const lastHistoryCleanupRef = useRef(null) // localStorage 대신 메모리 state 사용
  const [focusedBlockId, setFocusedBlockId] = useState(null)
  const [keyThoughtsHistory, setKeyThoughtsHistory] = useState([])
  const [showKeyThoughtsHistory, setShowKeyThoughtsHistory] = useState(false)

  // 블록 데이터 정규화 (children이 항상 배열이 되도록 보장)
  const normalizeBlocks = (blocks) => {
    if (!Array.isArray(blocks)) return []
    return blocks.map(block => ({
      ...block,
      children: Array.isArray(block.children) ? normalizeBlocks(block.children) : []
    }))
  }

  // 주요 생각정리 불러오기
  const fetchKeyThoughtsContent = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('setting_value')
        .eq('setting_key', 'key_thoughts_blocks')
        .maybeSingle()

      if (error) {
        console.error('주요 생각정리 불러오기 오류:', error.message)
        return
      }

      if (data && data.setting_value) {
        const blocks = JSON.parse(data.setting_value)
        const normalized = normalizeBlocks(blocks)
        setKeyThoughtsBlocks(normalized)
        lastSavedKeyThoughtsRef.current = JSON.parse(JSON.stringify(normalized))
      }
      // DB에 데이터 없으면 초기값 사용 (localStorage fallback 제거)
    } catch (error) {
      console.error('주요 생각정리 불러오기 오류:', error.message)
    }
  }

  // 주요 생각정리 저장
  const handleSaveKeyThoughts = async () => {
    if (!session?.user?.id) return

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: session.user.id,
          setting_key: 'key_thoughts_blocks',
          setting_value: JSON.stringify(keyThoughtsBlocks),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,setting_key'
        })

      if (error) {
        console.error('주요 생각정리 저장 오류:', error.message)
        return
      }

      // 버전 히스토리 저장
      await saveKeyThoughtsVersion(keyThoughtsBlocks)
    } catch (error) {
      console.error('주요 생각정리 저장 오류:', error.message)
    }
  }

  // 큰 변경 감지 (블록 개수, 타입, 순서, 레벨, 또는 20자 이상 텍스트 변경)
  const hasSignificantChange = (oldBlocks, newBlocks) => {
    if (!oldBlocks || oldBlocks.length === 0) return true
    if (oldBlocks.length !== newBlocks.length) return true

    const compareBlocks = (oldList, newList) => {
      for (let i = 0; i < oldList.length; i++) {
        const oldBlock = oldList[i]
        const newBlock = newList[i]

        if (oldBlock.type !== newBlock.type) return true

        const oldChildCount = oldBlock.children ? oldBlock.children.length : 0
        const newChildCount = newBlock.children ? newBlock.children.length : 0
        if (oldChildCount !== newChildCount) return true

        const oldContent = oldBlock.content || ''
        const newContent = newBlock.content || ''
        if (Math.abs(oldContent.length - newContent.length) >= 20) return true

        if (newChildCount > 0) {
          if (compareBlocks(oldBlock.children, newBlock.children)) return true
        }
      }
      return false
    }

    return compareBlocks(oldBlocks, newBlocks)
  }

  // 30일 이상된 히스토리 자동 삭제
  const cleanupOldHistory = async () => {
    try {
      const today = new Date().toDateString()

      // 메모리 state로 중복 실행 방지 (localStorage 제거)
      if (lastHistoryCleanupRef.current === today) {
        return
      }

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { error } = await supabase
        .from('key_thoughts_history')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString())

      if (error) {
        console.error('오래된 히스토리 삭제 오류:', error.message)
      } else {
        lastHistoryCleanupRef.current = today
        console.log('오래된 히스토리 정리 완료')
      }
    } catch (error) {
      console.error('오래된 히스토리 삭제 오류:', error.message)
    }
  }

  // 버전 히스토리 저장 (큰 변경이 있을 때만)
  const saveKeyThoughtsVersion = async (blocks) => {
    if (!session?.user?.id) return

    try {
      if (!hasSignificantChange(lastSavedKeyThoughtsRef.current, blocks)) {
        return
      }

      const { error } = await supabase
        .from('key_thoughts_history')
        .insert([{
          content: blocks,
          description: '자동 저장',
          user_id: session.user.id
        }])

      if (error) {
        console.error('버전 히스토리 저장 오류:', error.message)
      } else {
        lastSavedKeyThoughtsRef.current = JSON.parse(JSON.stringify(blocks))
      }
    } catch (error) {
      console.error('버전 히스토리 저장 오류:', error.message)
    }
  }

  // 버전 히스토리 불러오기
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

  // 특정 버전으로 복구
  const restoreKeyThoughtsVersion = async (versionId) => {
    try {
      const version = keyThoughtsHistory.find(v => v.id === versionId)
      if (!version) {
        alert('해당 버전을 찾을 수 없습니다.')
        return
      }

      if (!window.confirm('이 버전으로 복구하시겠습니까?\n현재 내용은 백업으로 자동 저장됩니다.')) {
        return
      }

      // 1. 현재 내용을 히스토리에 백업 (복구 전 상태 보존)
      if (hasSignificantChange(lastSavedKeyThoughtsRef.current, keyThoughtsBlocks)) {
        await supabase
          .from('key_thoughts_history')
          .insert([{
            content: keyThoughtsBlocks,
            description: '복구 전 자동 백업',
            user_id: session.user.id
          }])
      }

      // 2. 복구할 버전으로 교체
      const restoredBlocks = normalizeBlocks(version.content)
      setKeyThoughtsBlocks(restoredBlocks)

      // 3. DB에 저장 (user_settings 테이블)
      const { error: saveError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: session.user.id,
          setting_key: 'key_thoughts_blocks',
          setting_value: JSON.stringify(restoredBlocks),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,setting_key'
        })

      if (saveError) {
        console.error('주요 생각정리 저장 오류:', saveError.message)
        alert('복구에 실패했습니다.')
        return
      }

      // 4. 복구된 내용을 히스토리에 저장
      await supabase
        .from('key_thoughts_history')
        .insert([{
          content: restoredBlocks,
          description: `버전 복구 (${new Date(version.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`,
          user_id: session.user.id
        }])

      // 5. 마지막 저장 참조 업데이트
      lastSavedKeyThoughtsRef.current = JSON.parse(JSON.stringify(restoredBlocks))

      alert('✅ 복구가 완료되었습니다!')
      setShowKeyThoughtsHistory(false)

      // 히스토리 목록 새로고침
      await fetchKeyThoughtsHistory()
    } catch (error) {
      console.error('버전 복구 오류:', error.message)
      alert('❌ 복구 중 오류가 발생했습니다: ' + error.message)
    }
  }

  return {
    keyThoughtsBlocks,
    setKeyThoughtsBlocks,
    isSavingKeyThoughts,
    setIsSavingKeyThoughts,
    lastSavedKeyThoughtsRef,
    focusedBlockId,
    setFocusedBlockId,
    keyThoughtsHistory,
    setKeyThoughtsHistory,
    showKeyThoughtsHistory,
    setShowKeyThoughtsHistory,
    normalizeBlocks,
    fetchKeyThoughtsContent,
    handleSaveKeyThoughts,
    cleanupOldHistory,
    fetchKeyThoughtsHistory,
    restoreKeyThoughtsVersion,
  }
}
