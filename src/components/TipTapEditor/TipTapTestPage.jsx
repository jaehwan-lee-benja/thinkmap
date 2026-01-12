import React, { useState, useEffect, useRef } from 'react'
import TipTapEditor from './TipTapEditor'
import { supabase } from '../../supabaseClient'
import { convertFlatBlocksToTiptap } from './utils/convertBlocksToTiptap'

/**
 * TipTap 에디터 테스트 페이지
 * Phase 1: 기본 기능 테스트용
 */
function TipTapTestPage({ session, currentPageId, currentPageName, onPageRename }) {
  const [content, setContent] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const editorRef = useRef(null)
  const imageInputRef = useRef(null)

  // 히스토리 관련 상태
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // 히스토리 불러오기
  const fetchHistory = async () => {
    if (!session?.user?.id || !currentPageId) return

    setIsLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('page_id', currentPageId)
        .eq('action', 'tiptap_snapshot')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('히스토리 불러오기 오류:', error)
        return
      }

      setHistoryList(data || [])
    } catch (err) {
      console.error('히스토리 불러오기 오류:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // 히스토리 저장 (수동)
  const saveHistory = async (description = '수동 저장') => {
    if (!session?.user?.id || !currentPageId || !content) return false

    try {
      const { error } = await supabase
        .from('block_history')
        .insert([{
          block_id: null,
          user_id: session.user.id,
          page_id: currentPageId,
          content_before: null,
          content_after: content,
          action: 'tiptap_snapshot',
          description
        }])

      if (error) {
        console.error('히스토리 저장 오류:', error)
        return false
      }

      return true
    } catch (err) {
      console.error('히스토리 저장 오류:', err)
      return false
    }
  }

  // 버전 복구
  const restoreVersion = async (versionId) => {
    if (!editorRef.current) return

    try {
      const { data, error } = await supabase
        .from('block_history')
        .select('*')
        .eq('id', versionId)
        .single()

      if (error || !data) {
        alert('버전 데이터를 불러오는데 실패했습니다.')
        return
      }

      const confirmRestore = window.confirm(
        `이 버전으로 복구하시겠습니까?\n\n` +
        `저장 시각: ${new Date(data.created_at).toLocaleString('ko-KR')}\n` +
        `설명: ${data.description || '(설명 없음)'}\n\n` +
        `⚠️ 현재 내용이 대체됩니다. 복구 전 현재 버전이 자동 저장됩니다.`
      )

      if (!confirmRestore) return

      // 현재 버전 자동 저장
      await saveHistory('복구 전 자동 저장')

      // 복구할 콘텐츠
      let restoredContent = data.content_after
      if (typeof restoredContent === 'string') {
        restoredContent = JSON.parse(restoredContent)
      }

      // 에디터에 적용
      editorRef.current.commands.setContent(restoredContent)
      setContent(restoredContent)
      setShowHistory(false)

      alert('버전이 복구되었습니다.')
    } catch (err) {
      console.error('버전 복구 오류:', err)
      alert('버전 복구 중 오류가 발생했습니다.')
    }
  }

  // 히스토리 모달 열기
  const openHistory = () => {
    fetchHistory()
    setShowHistory(true)
  }

  // 이미지 파일 업로드 핸들러
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !editorRef.current) return

    const reader = new FileReader()
    reader.onload = () => {
      editorRef.current.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // 링크 삽입 핸들러
  const handleInsertLink = () => {
    if (!editorRef.current) return
    const url = prompt('링크 URL을 입력하세요:')
    if (url) {
      editorRef.current.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  // 페이지 로드 시 데이터 가져오기
  useEffect(() => {
    if (!session || !currentPageId) return

    const loadContent = async () => {
      try {
        // 1. pages 테이블에서 content_tiptap 확인
        const { data, error } = await supabase
          .from('pages')
          .select('content_tiptap')
          .eq('id', currentPageId)
          .single()

        if (error) {
          console.error('콘텐츠 로드 실패:', error)
          return
        }

        // 2. content_tiptap이 있으면 사용
        if (data?.content_tiptap) {
          setContent(data.content_tiptap)
          return
        }

        // 3. content_tiptap이 없으면 기존 blocks 테이블에서 마이그레이션 시도
        console.log('content_tiptap 없음, blocks 테이블에서 마이그레이션 시도...')
        const { data: blocks, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .eq('page_id', currentPageId)
          .eq('user_id', session.user.id)
          .order('position', { ascending: true })

        if (blocksError) {
          console.error('블록 로드 실패:', blocksError)
        }

        if (blocks && blocks.length > 0) {
          // 기존 블록을 TipTap JSON으로 변환
          console.log(`${blocks.length}개 블록 발견, TipTap으로 변환 중...`)
          const tiptapContent = convertFlatBlocksToTiptap(blocks)
          setContent(tiptapContent)

          // 변환된 내용을 pages 테이블에 저장 (마이그레이션)
          await supabase
            .from('pages')
            .update({ content_tiptap: tiptapContent })
            .eq('id', currentPageId)

          console.log('마이그레이션 완료!')
          return
        }

        // 4. 블록도 없으면 빈 문서로 시작
        setContent({
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }]
        })
      } catch (err) {
        console.error('예상치 못한 오류:', err)
      }
    }

    loadContent()
  }, [session, currentPageId])

  // 에디터 내용 변경 시
  const handleUpdate = (newContent) => {
    setContent(newContent)
  }

  // 저장 함수
  const handleSave = async () => {
    if (!session || !currentPageId || !content) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('pages')
        .update({
          content_tiptap: content,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentPageId)

      if (error) {
        console.error('저장 실패:', error)
        alert('저장에 실패했습니다: ' + error.message)
      } else {
        setLastSaved(new Date())
      }
    } catch (err) {
      console.error('예상치 못한 오류:', err)
      alert('저장 중 오류가 발생했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  // 자동 저장 (2초 debounce)
  useEffect(() => {
    if (!content) return

    const timer = setTimeout(() => {
      handleSave()
    }, 2000)

    return () => clearTimeout(timer)
  }, [content, session, currentPageId])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      padding: '1.5rem'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, color: '#e5e7eb', fontSize: '1.25rem' }}>{currentPageName || '페이지'}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            title={
              isSaving
                ? '저장 중...'
                : (lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString()}` : '저장')
            }
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={async () => {
              const success = await saveHistory('수동 버전 저장')
              if (success) alert('버전이 저장되었습니다.')
              else alert('버전 저장에 실패했습니다.')
            }}
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
            title="현재 상태를 버전으로 저장"
          >
            📸 버전
          </button>
          <button
            onClick={openHistory}
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
            title="버전 히스토리 보기"
          >
            🕐 히스토리
          </button>
        </div>
      </div>

      {/* 툴바 버튼 */}
      <div style={{
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: '#2d2d2d',
        borderRadius: '0.5rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        border: '1px solid #374151'
      }}>
        <button
          onClick={() => editorRef.current?.commands.setToggle()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
          title="토글 블록 생성 (Cmd+Shift+T)"
        >
          ▶ 토글 블록
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
          title="3x3 표 삽입"
        >
          📊 표 삽입
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          H1
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          H2
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().toggleBold().run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600
          }}
        >
          B
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().toggleItalic().run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontStyle: 'italic'
          }}
        >
          I
        </button>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#4b5563', margin: '0 0.25rem' }} />

        {/* 숨겨진 파일 input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
          title="이미지 업로드"
        >
          🖼️ 이미지
        </button>
        <button
          onClick={handleInsertLink}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
          title="링크 삽입"
        >
          🔗 링크
        </button>
        <button
          onClick={() => editorRef.current?.chain().focus().toggleCodeBlock().run()}
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
          title="코드 블록"
        >
          {'</>'} 코드
        </button>
      </div>

      <div style={{
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        backgroundColor: '#2d2d2d',
        minHeight: '500px'
      }}>
        {content ? (
          <TipTapEditor
            content={content}
            onUpdate={handleUpdate}
            placeholder="TipTap 에디터를 테스트해보세요..."
            editorRef={editorRef}
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            로딩 중...
          </div>
        )}
      </div>

    </div>

      {/* 히스토리 모달 */}
      {showHistory && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              backgroundColor: '#1f2937',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#e5e7eb' }}>🕐 버전 히스토리</h3>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: '1.5rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {isLoadingHistory ? (
                <p style={{ textAlign: 'center', color: '#9ca3af' }}>로딩 중...</p>
              ) : historyList.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af' }}>저장된 버전이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {historyList.map((version) => (
                    <div
                      key={version.id}
                      style={{
                        backgroundColor: '#374151',
                        borderRadius: '0.375rem',
                        padding: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: '#e5e7eb', fontSize: '0.875rem', fontWeight: 500 }}>
                            {new Date(version.created_at).toLocaleString('ko-KR')}
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {version.description || '(설명 없음)'}
                          </div>
                        </div>
                        <button
                          onClick={() => restoreVersion(version.id)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          복구
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TipTapTestPage
