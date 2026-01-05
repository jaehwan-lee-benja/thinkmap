import React, { useState, useEffect, useRef } from 'react'
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
  const editorRef = useRef(null)

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
          // 예시 콘텐츠로 시작 (사용법 보여주기)
          setContent({
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: '🎯 TipTap 에디터 사용 가이드' }]
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '아래 토글 블록을 클릭해서 내용을 확인해보세요!' }]
              },
              {
                type: 'toggle',
                attrs: { isOpen: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: '토글 블록이란? ', marks: [{ type: 'bold' }] },
                      { type: 'text', text: '내용을 접었다 펼 수 있는 블록입니다.' }
                    ]
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '왼쪽 ▶ 버튼을 클릭하면 이 내용이 보입니다!' }]
                  }
                ]
              },
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: '✏️ 자유롭게 편집해보세요' }]
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '이 내용을 모두 지우고 새로운 내용을 작성할 수 있습니다.' }]
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
        <h2 style={{ margin: 0 }}>TipTap 에디터 테스트 (Phase 2: Toggle)</h2>
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

      {/* 툴바 버튼 */}
      <div style={{
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.5rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        border: '1px solid #e5e7eb'
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
            editorRef={editorRef}
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
            로딩 중...
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>🎯 사용법 (Phase 4: BubbleMenu 추가됨!)</h3>
        <div style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.6 }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>🆕 텍스트 선택 메뉴 (BubbleMenu):</p>
          <ul style={{ marginTop: 0, marginBottom: '1rem', paddingLeft: '1.5rem' }}>
            <li><strong>텍스트를 드래그</strong>하면 검은색 메뉴가 떠오름</li>
            <li><strong>B</strong>: 볼드, <strong>I</strong>: 이탤릭, <strong>S</strong>: 취소선, <strong>&lt;/&gt;</strong>: 코드</li>
            <li><strong>🔗</strong> 클릭 → URL 입력창 → 링크 추가</li>
            <li>링크된 텍스트 선택 → <strong>🔗✕</strong>: 링크 제거</li>
          </ul>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>1️⃣ 토글 블록 만들기:</p>
          <ul style={{ marginTop: 0, marginBottom: '1rem', paddingLeft: '1.5rem' }}>
            <li>에디터에 <strong>커서를 놓고</strong> → 위의 <span style={{ color: '#10b981', fontWeight: 600 }}>▶ 토글 블록</span> 버튼 클릭</li>
            <li>초록색 박스에 <strong>초록색 ▶ 버튼</strong>이 나타남</li>
            <li><strong>▶ 버튼을 클릭</strong>하면 ▼로 바뀌면서 열림/닫힘</li>
          </ul>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>2️⃣ 표 만들기:</p>
          <ul style={{ marginTop: 0, marginBottom: '1rem', paddingLeft: '1.5rem' }}>
            <li><span style={{ color: '#8b5cf6', fontWeight: 600 }}>📊 표 삽입</span> 버튼 클릭 → 3x3 표 자동 생성</li>
          </ul>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>3️⃣ 단축키:</p>
          <ul style={{ marginTop: 0, paddingLeft: '1.5rem' }}>
            <li>Cmd + B: 볼드, Cmd + I: 이탤릭</li>
            <li># + Space: H1, ## + Space: H2</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default TipTapTestPage
