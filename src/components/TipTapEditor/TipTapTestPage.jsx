import React, { useState, useEffect } from 'react'
import TipTapEditor from './TipTapEditor'
import { supabase } from '../../supabaseClient'

/**
 * TipTap 에디터 테스트 페이지
 * Phase 1: 기본 기능 테스트용
 */
function TipTapTestPage({ session, currentPageId, onBack }) {
  const [content, setContent] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  // 페이지 로드 시 데이터 가져오기
  useEffect(() => {
    if (!session || !currentPageId) return

    const loadContent = async () => {
      try {
        // pages 테이블에 content_tiptap 컬럼이 있다고 가정
        // 없으면 나중에 추가 예정
        const { data, error } = await supabase
          .from('pages')
          .select('content_tiptap')
          .eq('id', currentPageId)
          .single()

        if (error) {
          console.error('콘텐츠 로드 실패:', error)
          return
        }

        if (data?.content_tiptap) {
          setContent(data.content_tiptap)
        } else {
          // 빈 문서로 시작
          setContent({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: []
              }
            ]
          })
        }
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

  // 자동 저장 (5초 debounce)
  useEffect(() => {
    if (!content) return

    const timer = setTimeout(() => {
      handleSave()
    }, 5000)

    return () => clearTimeout(timer)
  }, [content, session, currentPageId])

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>TipTap 에디터 테스트 (Phase 1)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lastSaved && (
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              마지막 저장: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: isSaving ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isSaving ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            기존 에디터로 돌아가기
          </button>
        </div>
      </div>

      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        backgroundColor: 'white',
        minHeight: '500px'
      }}>
        {content ? (
          <TipTapEditor
            content={content}
            onUpdate={handleUpdate}
            placeholder="TipTap 에디터를 테스트해보세요..."
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
            로딩 중...
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>테스트 가이드</h3>
        <ul style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.6 }}>
          <li>텍스트 입력 및 편집 테스트</li>
          <li>Enter: 새 문단 생성</li>
          <li>Ctrl/Cmd + B: 볼드</li>
          <li>Ctrl/Cmd + I: 이탤릭</li>
          <li># + Space: H1 헤딩</li>
          <li>## + Space: H2 헤딩</li>
          <li>### + Space: H3 헤딩</li>
          <li>자동 저장 (5초 후) 또는 수동 저장 버튼 클릭</li>
        </ul>
      </div>
    </div>
  )
}

export default TipTapTestPage
